/**
 * Server factory — builds an MCP server with every Holocron tool and
 * resource registered. Kept separate from the entrypoint so tests can boot
 * the server without stdio.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	type McpClientOptions,
	type McpHolocronClient,
	createHolocronMcpClient,
} from "./client.js";
import { registerCatalogResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";

/** Metadata used when advertising the server. */
export const SERVER_INFO = {
	name: "@squat-collective/holocron-mcp-server",
	version: "0.1.0",
} as const;

export interface CreateServerOptions extends McpClientOptions {
	/** Optionally inject a pre-built client (useful in tests). */
	client?: McpHolocronClient;
}

/**
 * Build and return an McpServer instance with all tools + resources wired up.
 * Does not start the transport — caller is responsible for `server.connect()`.
 */
export async function createServer(
	options: CreateServerOptions,
): Promise<{ server: McpServer; client: McpHolocronClient }> {
	const client =
		options.client ?? createHolocronMcpClient({ baseUrl: options.baseUrl, token: options.token });

	const server = new McpServer(SERVER_INFO, {
		capabilities: {
			tools: {},
			resources: {},
		},
	});

	await registerTools(server, client);
	registerCatalogResources(server, client);

	return { server, client };
}
