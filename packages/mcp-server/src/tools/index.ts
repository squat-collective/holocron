/**
 * Tool registration — hook every tool module into a single McpServer.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpHolocronClient } from "../client.js";
import { registerActorTools } from "./actors.js";
import { registerAssetTools } from "./assets.js";
import { registerPluginTools } from "./plugins.js";
import { registerRelationTools } from "./relations.js";
import { registerRuleTools } from "./rules.js";
import { registerSearchTool } from "./search.js";

/** Register all Holocron MCP tools on the given server. */
export async function registerTools(
	server: McpServer,
	client: McpHolocronClient,
): Promise<void> {
	registerAssetTools(server, client);
	registerActorTools(server, client);
	registerRelationTools(server, client);
	registerRuleTools(server, client);
	registerSearchTool(server, client);
	await registerPluginTools(server, client);
}

/** The full list of tool names this server exposes (for docs & tests). */
export const TOOL_NAMES = [
	// assets
	"list_assets",
	"get_asset",
	"create_asset",
	"update_asset",
	"delete_asset",
	"verify_asset",
	// actors
	"list_actors",
	"get_actor",
	"create_actor",
	"update_actor",
	"delete_actor",
	"verify_actor",
	// relations
	"list_relations",
	"get_relation",
	"create_relation",
	"delete_relation",
	"verify_relation",
	// rules (data-quality contracts)
	"list_rules",
	"get_rule",
	"create_rule",
	"update_rule",
	"delete_rule",
	"list_rules_for_asset",
	"attach_rule",
	"detach_rule",
	// catalog-wide
	"search",
	// plugins
	"list_plugins",
	"run_plugin",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
