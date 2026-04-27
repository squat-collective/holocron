/**
 * Actor tools — browse, document, verify people and groups in the catalog.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpHolocronClient } from "../client.js";
import { errorResult, jsonResult } from "./helpers.js";

const ACTOR_TYPES = ["person", "group"] as const;
const ActorTypeSchema = z.enum(ACTOR_TYPES);

export function registerActorTools(server: McpServer, client: McpHolocronClient): void {
	server.registerTool(
		"list_actors",
		{
			title: "List Actors",
			description:
				"List people or groups (actors) in the Holocron catalog. Optionally filter by type (person, group). Use before creating new actors to avoid duplicates.",
			inputSchema: {
				type: ActorTypeSchema.optional(),
				limit: z.number().int().min(1).max(100).optional(),
				offset: z.number().int().min(0).optional(),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const data = await client.sdk.actors.list({
					type: args.type,
					limit: args.limit,
					offset: args.offset,
				});
				return jsonResult({
					total: data.total,
					items: data.items.map(summarizeActor),
				});
			} catch (err) {
				return errorResult("list_actors", err);
			}
		},
	);

	server.registerTool(
		"get_actor",
		{
			title: "Get Actor",
			description:
				"Fetch a single actor by UID. Returns the full payload, including email and metadata.",
			inputSchema: {
				uid: z.string().min(1),
			},
		},
		async ({ uid }): Promise<CallToolResult> => {
			try {
				const actor = await client.sdk.actors.get(uid);
				return jsonResult(actor);
			} catch (err) {
				return errorResult("get_actor", err);
			}
		},
	);

	server.registerTool(
		"create_actor",
		{
			title: "Create Actor",
			description:
				"Create a new actor (person or group) in the catalog. Manual creations are marked as verified automatically.",
			inputSchema: {
				type: ActorTypeSchema.describe("person | group"),
				name: z.string().min(1).max(255),
				email: z.string().email().optional(),
				description: z.string().optional(),
				metadata: z.record(z.unknown()).optional(),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const created = await client.sdk.actors.create({
					type: args.type,
					name: args.name,
					email: args.email,
					description: args.description,
					metadata: args.metadata,
				});
				return jsonResult(created);
			} catch (err) {
				return errorResult("create_actor", err);
			}
		},
	);

	server.registerTool(
		"update_actor",
		{
			title: "Update Actor",
			description:
				"Update an existing actor's documentation fields. Any field you omit stays untouched. Pass `verified: true` to confirm a discovered actor.",
			inputSchema: {
				uid: z.string().min(1),
				name: z.string().min(1).max(255).optional(),
				email: z.string().email().nullable().optional(),
				description: z.string().nullable().optional(),
				metadata: z.record(z.unknown()).optional(),
				verified: z.boolean().optional(),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const { uid, ...patch } = args;
				const updated = await client.sdk.actors.update(
					uid,
					patch as Parameters<typeof client.sdk.actors.update>[1],
				);
				return jsonResult(updated);
			} catch (err) {
				return errorResult("update_actor", err);
			}
		},
	);

	server.registerTool(
		"delete_actor",
		{
			title: "Delete Actor",
			description:
				"Delete an actor from the catalog by UID. Permanent. Remove related `owns` relations first if you need to preserve history.",
			inputSchema: {
				uid: z.string().min(1),
			},
		},
		async ({ uid }): Promise<CallToolResult> => {
			try {
				await client.sdk.actors.delete(uid);
				return jsonResult({ uid, deleted: true });
			} catch (err) {
				return errorResult("delete_actor", err);
			}
		},
	);

	server.registerTool(
		"verify_actor",
		{
			title: "Verify Actor",
			description:
				"Mark a discovered actor as verified after human confirmation. Optionally append a description note.",
			inputSchema: {
				uid: z.string().min(1),
				description: z.string().optional(),
			},
		},
		async ({ uid, description }): Promise<CallToolResult> => {
			try {
				const updated = await client.setActorVerified(uid, true, description);
				return jsonResult(updated);
			} catch (err) {
				return errorResult("verify_actor", err);
			}
		},
	);
}

interface ActorLike {
	uid: string;
	name: string;
	type: string;
	email?: string | null;
	verified?: boolean;
	discovered_by?: string | null;
}

function summarizeActor(actor: unknown): ActorLike {
	const a = actor as ActorLike;
	return {
		uid: a.uid,
		name: a.name,
		type: a.type,
		email: a.email,
		verified: a.verified,
		discovered_by: a.discovered_by,
	};
}
