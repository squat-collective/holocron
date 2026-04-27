#!/usr/bin/env node
/**
 * Entrypoint — boots the Holocron MCP server over stdio.
 *
 * Environment:
 *   HOLOCRON_API_URL — base URL of the Holocron API (default: http://localhost:8100)
 *   HOLOCRON_TOKEN   — optional bearer token
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

export { createServer, SERVER_INFO } from "./server.js";
export {
	createHolocronMcpClient,
	type McpClientOptions,
	type McpHolocronClient,
	type PluginManifest,
	type PluginRunResult,
} from "./client.js";
export { TOOL_NAMES, type ToolName } from "./tools/index.js";

const DEFAULT_BASE_URL = "http://localhost:8100";

async function main(): Promise<void> {
	const baseUrl = process.env.HOLOCRON_API_URL ?? DEFAULT_BASE_URL;
	const token = process.env.HOLOCRON_TOKEN;

	const { server } = await createServer({ baseUrl, token });

	const transport = new StdioServerTransport();
	await server.connect(transport);

	// Friendly banner on stderr so stdout stays clean for the MCP protocol.
	console.error(`[holocron-mcp-server] connected to ${baseUrl}`);
}

// Only auto-start when executed directly (not when imported as a library).
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
	main().catch((error) => {
		console.error("[holocron-mcp-server] fatal:", error);
		process.exit(1);
	});
}
