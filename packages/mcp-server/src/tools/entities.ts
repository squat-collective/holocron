/**
 * Entity resolver tool.
 *
 * The Holocron graph stores Assets, Actors, and Rules under separate
 * labels with their own typed endpoints. AI agents often have a uid
 * in hand (from a relation, a graph response, an event) and don't
 * know the type yet — `get_entity` resolves any uid to its typed
 * payload in one call via the polymorphic `/entities/{uid}` endpoint.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpHolocronClient } from "../client.js";
import { errorResult, jsonResult } from "./helpers.js";

export function registerEntityTools(server: McpServer, client: McpHolocronClient): void {
	server.registerTool(
		"get_entity",
		{
			title: "Resolve any UID to its typed payload",
			description:
				"Look up a node by UID without needing to know whether it is an Asset, Actor, or Rule. Returns a discriminated union with `kind` ∈ {asset, actor, rule} and the corresponding typed payload. Use this when you got a UID from a relation, an event, or a graph response and want details.",
			inputSchema: {
				uid: z.string().min(1).describe("UID of any Asset, Actor, or Rule"),
			},
		},
		async ({ uid }): Promise<CallToolResult> => {
			try {
				const entity = await client.sdk.entities.get(uid);
				return jsonResult(entity);
			} catch (err) {
				return errorResult("get_entity", err);
			}
		},
	);
}
