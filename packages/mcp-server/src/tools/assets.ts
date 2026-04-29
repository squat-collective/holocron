/**
 * Asset tools — browse, document, verify data assets in the Holocron catalog.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpHolocronClient } from "../client.js";
import { errorResult, jsonResult } from "./helpers.js";

const ASSET_TYPES = ["dataset", "report", "process", "system"] as const;
const ASSET_STATUSES = ["active", "deprecated", "draft"] as const;

const AssetTypeSchema = z.enum(ASSET_TYPES);
const AssetStatusSchema = z.enum(ASSET_STATUSES);

export function registerAssetTools(server: McpServer, client: McpHolocronClient): void {
	server.registerTool(
		"list_assets",
		{
			title: "List Assets",
			description:
				"List data assets in the Holocron catalog. Optionally filter by type (dataset, report, process, system). Use this to browse what's already documented before creating duplicates.",
			inputSchema: {
				type: AssetTypeSchema.optional(),
				limit: z.number().int().min(1).max(100).optional(),
				offset: z.number().int().min(0).optional(),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const data = await client.sdk.assets.list({
					type: args.type,
					limit: args.limit,
					offset: args.offset,
				});
				return jsonResult({
					total: data.total,
					items: data.items.map(summarizeAsset),
				});
			} catch (err) {
				return errorResult("list_assets", err);
			}
		},
	);

	server.registerTool(
		"get_asset",
		{
			title: "Get Asset",
			description:
				"Fetch a single data asset by UID. Returns the full payload including metadata (schema, tags, etc.) when present.",
			inputSchema: {
				uid: z.string().min(1).describe("Asset UID"),
			},
		},
		async ({ uid }): Promise<CallToolResult> => {
			try {
				const asset = await client.sdk.assets.get(uid);
				return jsonResult(asset);
			} catch (err) {
				return errorResult("get_asset", err);
			}
		},
	);

	server.registerTool(
		"create_asset",
		{
			title: "Create Asset",
			description:
				"Create a new data asset in the catalog. Use this to document a dataset, report, process, or system. Manual creations are marked as verified automatically.",
			inputSchema: {
				type: AssetTypeSchema.describe("dataset | report | process | system"),
				name: z.string().min(1).max(255),
				description: z.string().optional(),
				location: z
					.string()
					.optional()
					.describe("URL, path, or connection string where the asset lives"),
				status: AssetStatusSchema.optional().describe("active (default) | deprecated | draft"),
				metadata: z.record(z.unknown()).optional(),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const created = await client.sdk.assets.create({
					type: args.type,
					name: args.name,
					description: args.description,
					location: args.location,
					status: args.status,
					metadata: args.metadata,
				});
				return jsonResult(created);
			} catch (err) {
				return errorResult("create_asset", err);
			}
		},
	);

	server.registerTool(
		"update_asset",
		{
			title: "Update Asset",
			description:
				"Update an existing asset's documentation fields. Any field you omit stays untouched. Pass `verified: true` to confirm a discovered asset.",
			inputSchema: {
				uid: z.string().min(1),
				name: z.string().min(1).max(255).optional(),
				description: z.string().nullable().optional(),
				location: z.string().nullable().optional(),
				status: AssetStatusSchema.optional(),
				metadata: z.record(z.unknown()).optional(),
				verified: z.boolean().optional(),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const { uid, ...patch } = args;
				// Cast because the SDK's AssetUpdate type doesn't expose `verified` yet.
				const updated = await client.sdk.assets.update(
					uid,
					patch as Parameters<typeof client.sdk.assets.update>[1],
				);
				return jsonResult(updated);
			} catch (err) {
				return errorResult("update_asset", err);
			}
		},
	);

	server.registerTool(
		"delete_asset",
		{
			title: "Delete Asset",
			description:
				"Delete an asset from the catalog by UID. This is permanent — prefer marking as `deprecated` via update_asset when possible.",
			inputSchema: {
				uid: z.string().min(1),
			},
		},
		async ({ uid }): Promise<CallToolResult> => {
			try {
				await client.sdk.assets.delete(uid);
				return jsonResult({ uid, deleted: true });
			} catch (err) {
				return errorResult("delete_asset", err);
			}
		},
	);

	server.registerTool(
		"verify_asset",
		{
			title: "Verify Asset",
			description:
				"Mark a discovered asset as verified. Use this once a human (or Claude acting on their behalf) has confirmed the asset is correctly documented. Optionally append a description note.",
			inputSchema: {
				uid: z.string().min(1),
				description: z
					.string()
					.optional()
					.describe("Optional description to append with verification"),
			},
		},
		async ({ uid, description }): Promise<CallToolResult> => {
			try {
				const updated = await client.setAssetVerified(uid, true, description);
				return jsonResult(updated);
			} catch (err) {
				return errorResult("verify_asset", err);
			}
		},
	);
}

interface AssetLike {
	uid: string;
	name: string;
	type: string;
	verified?: boolean;
	discovered_by?: string | null;
}

function summarizeAsset(asset: unknown): AssetLike {
	const a = asset as AssetLike;
	return {
		uid: a.uid,
		name: a.name,
		type: a.type,
		verified: a.verified,
		discovered_by: a.discovered_by,
	};
}
