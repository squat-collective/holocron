/**
 * Tool registration — hook every tool module into a single McpServer.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpHolocronClient } from "../client.js";
import { registerActorTools } from "./actors.js";
import { registerAssetTools } from "./assets.js";
import { registerEntityTools } from "./entities.js";
import { registerEventTools } from "./events.js";
import { registerGraphTools } from "./graph.js";
import { registerPluginTools } from "./plugins.js";
import { registerRelationTools } from "./relations.js";
import { registerRuleTools } from "./rules.js";
import { registerSchemaTools } from "./schema.js";
import { registerSearchTool } from "./search.js";
import { registerTagTools } from "./tags.js";

/** Register all Holocron MCP tools on the given server. */
export async function registerTools(server: McpServer, client: McpHolocronClient): Promise<void> {
	registerAssetTools(server, client);
	registerActorTools(server, client);
	registerRelationTools(server, client);
	registerRuleTools(server, client);
	registerSchemaTools(server, client);
	registerEntityTools(server, client);
	registerSearchTool(server, client);
	registerTagTools(server, client);
	registerGraphTools(server, client);
	registerEventTools(server, client);
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
	// schema (asset.metadata.schema authoring)
	"get_asset_schema",
	"add_schema_container",
	"add_schema_field",
	"update_schema_node",
	"delete_schema_node",
	// polymorphic resolver
	"get_entity",
	// catalog-wide
	"search",
	"list_tags",
	"get_graph_map",
	"list_events",
	// plugins
	"list_plugins",
	"run_plugin",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
