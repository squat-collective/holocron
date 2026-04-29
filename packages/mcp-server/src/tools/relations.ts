/**
 * Relation tools — browse, create, delete, verify relationships between
 * assets and actors. Lineage is asset-only via FEEDS; there is no
 * separate PRODUCES/CONSUMES/DERIVED_FROM vocabulary.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpHolocronClient } from "../client.js";
import { errorResult, jsonResult } from "./helpers.js";

const RELATION_TYPES = ["owns", "uses", "feeds", "contains", "member_of", "applies_to"] as const;
const RelationTypeSchema = z.enum(RELATION_TYPES);

export function registerRelationTools(server: McpServer, client: McpHolocronClient): void {
	server.registerTool(
		"list_relations",
		{
			title: "List Relations",
			description:
				"List relationships in the catalog. Filter by type, source (`from_uid`), or target (`to_uid`). Types: owns, uses, feeds, contains, member_of, applies_to.",
			inputSchema: {
				type: RelationTypeSchema.optional(),
				from_uid: z.string().optional(),
				to_uid: z.string().optional(),
				limit: z.number().int().min(1).max(100).optional(),
				offset: z.number().int().min(0).optional(),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const data = await client.sdk.relations.list({
					type: args.type,
					from_uid: args.from_uid,
					to_uid: args.to_uid,
					limit: args.limit,
					offset: args.offset,
				});
				return jsonResult(data);
			} catch (err) {
				return errorResult("list_relations", err);
			}
		},
	);

	server.registerTool(
		"get_relation",
		{
			title: "Get Relation",
			description:
				"Fetch a single relation by UID. Returns from/to UIDs, type, properties, and verification state.",
			inputSchema: {
				uid: z.string().min(1),
			},
		},
		async ({ uid }): Promise<CallToolResult> => {
			try {
				const relation = await client.getRelation(uid);
				return jsonResult(relation);
			} catch (err) {
				return errorResult("get_relation", err);
			}
		},
	);

	server.registerTool(
		"create_relation",
		{
			title: "Create Relation",
			description:
				"Create a relationship between two entities. Manual creations are verified by default. Example use-cases: `{from: actor_uid, to: asset_uid, type: 'owns'}`, `{from: asset_a_uid, to: asset_b_uid, type: 'feeds'}`.",
			inputSchema: {
				from_uid: z.string().min(1).describe("UID of the source entity (asset or actor)"),
				to_uid: z.string().min(1).describe("UID of the target entity (asset or actor)"),
				type: RelationTypeSchema,
				properties: z.record(z.unknown()).optional(),
			},
		},
		async (args): Promise<CallToolResult> => {
			try {
				const created = await client.sdk.relations.create({
					from: args.from_uid,
					to: args.to_uid,
					type: args.type,
					properties: args.properties,
				});
				return jsonResult(created);
			} catch (err) {
				return errorResult("create_relation", err);
			}
		},
	);

	server.registerTool(
		"delete_relation",
		{
			title: "Delete Relation",
			description: "Delete a relation by UID. Permanent.",
			inputSchema: {
				uid: z.string().min(1),
			},
		},
		async ({ uid }): Promise<CallToolResult> => {
			try {
				await client.sdk.relations.delete(uid);
				return jsonResult({ uid, deleted: true });
			} catch (err) {
				return errorResult("delete_relation", err);
			}
		},
	);

	server.registerTool(
		"verify_relation",
		{
			title: "Verify Relation",
			description:
				"Confirm a discovered relation is accurate. NOTE: the backend currently does not support toggling the `verified` flag on a relation in place — this tool returns the relation's current state and a note. To record a verified relation, delete the unverified one and re-create it via create_relation.",
			inputSchema: {
				uid: z.string().min(1),
			},
		},
		async ({ uid }): Promise<CallToolResult> => {
			try {
				const result = await client.setRelationVerified(uid);
				return jsonResult(result);
			} catch (err) {
				return errorResult("verify_relation", err);
			}
		},
	);
}
