/**
 * Tag tools — surface what's already in the catalog.
 *
 * Tags are free-form strings stored on `Asset.metadata.tags` (no
 * separate tag entity). The single tool exposed here lets an AI
 * assistant ask "what tags are already in use?" before suggesting a
 * new tag, so the catalog doesn't grow `pii` and `PII` and `Pii` as
 * three different concepts.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpHolocronClient } from "../client.js";
import { errorResult, jsonResult } from "./helpers.js";

export function registerTagTools(server: McpServer, client: McpHolocronClient): void {
	server.registerTool(
		"list_tags",
		{
			title: "List Tags in Use",
			description:
				"Return every distinct tag currently in use across all assets, with usage counts. Sorted by count desc then name asc — the dominant spelling sits at the top, so prefer it when suggesting tags.",
			inputSchema: {},
		},
		async (): Promise<CallToolResult> => {
			try {
				const result = await client.sdk.tags.list();
				return jsonResult(result);
			} catch (err) {
				return errorResult("list_tags", err);
			}
		},
	);
}
