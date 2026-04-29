/**
 * Graph topology tool.
 *
 * `get_graph_map` exposes the same data the UI's galaxy map uses — a
 * pre-computed nodes + edges + layout payload. Useful for AI agents
 * that need a structural overview ("what systems contain what
 * datasets?") rather than a per-uid drill-down.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpHolocronClient } from "../client.js";
import { errorResult, jsonResult } from "./helpers.js";

export function registerGraphTools(server: McpServer, client: McpHolocronClient): void {
	server.registerTool(
		"get_graph_map",
		{
			title: "Catalog topology overview",
			description:
				"Return the full data-landscape graph: every Asset / Actor / Rule node plus their relations, with pre-computed layout coordinates. `lod=0` is the systems+teams overview; `lod=1` is the full map. Use this for structural questions about the catalog rather than per-entity reads.",
			inputSchema: {
				lod: z
					.union([z.literal(0), z.literal(1)])
					.optional()
					.describe(
						"Level of detail: 0 = overview (systems + teams), 1 = full map (default).",
					),
			},
		},
		async ({ lod }): Promise<CallToolResult> => {
			try {
				const map = await client.sdk.graph.map(
					lod !== undefined ? { lod } : undefined,
				);
				return jsonResult(map);
			} catch (err) {
				return errorResult("get_graph_map", err);
			}
		},
	);
}
