/**
 * Audit-event tools.
 *
 * Every create/update/delete on the Holocron API logs a typed event.
 * `list_events` lets an AI agent answer "what changed?" questions
 * with concrete history, scoped by entity type, entity uid, or action.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpHolocronClient } from "../client.js";
import { errorResult, jsonResult } from "./helpers.js";

const EntityTypeEnum = z.enum(["asset", "actor", "relation", "rule"]);
const ActionEnum = z.enum(["created", "updated", "deleted"]);

export function registerEventTools(server: McpServer, client: McpHolocronClient): void {
	server.registerTool(
		"list_events",
		{
			title: "List Audit Events",
			description:
				"Return audit events with optional filters. Useful for change tracking and recent-activity questions. All filters AND together. Newest events first.",
			inputSchema: {
				entity_type: EntityTypeEnum.optional().describe(
					"Filter by entity type (asset / actor / relation / rule).",
				),
				entity_uid: z
					.string()
					.optional()
					.describe("Filter to events that touched a specific entity."),
				action: ActionEnum.optional().describe(
					"Filter by action (created / updated / deleted).",
				),
				limit: z.number().int().min(1).max(500).optional(),
				offset: z.number().int().min(0).optional(),
			},
		},
		async ({ entity_type, entity_uid, action, limit, offset }): Promise<CallToolResult> => {
			try {
				const params: {
					entity_type?: typeof entity_type;
					entity_uid?: string;
					action?: typeof action;
					limit?: number;
					offset?: number;
				} = {};
				if (entity_type !== undefined) params.entity_type = entity_type;
				if (entity_uid !== undefined) params.entity_uid = entity_uid;
				if (action !== undefined) params.action = action;
				if (limit !== undefined) params.limit = limit;
				if (offset !== undefined) params.offset = offset;
				const result = await client.sdk.events.list(params);
				return jsonResult(result);
			} catch (err) {
				return errorResult("list_events", err);
			}
		},
	);
}
