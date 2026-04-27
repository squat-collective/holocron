/**
 * MCP resources — expose catalog entities as URIs and a markdown overview.
 *
 * URIs:
 *   holocron://assets/{uid}
 *   holocron://actors/{uid}
 *   holocron://schema-overview
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpHolocronClient } from "../client.js";

export function registerCatalogResources(server: McpServer, client: McpHolocronClient): void {
	// Per-asset resource.
	server.registerResource(
		"asset",
		new ResourceTemplate("holocron://assets/{uid}", { list: undefined }),
		{
			title: "Holocron Asset",
			description: "A single data asset by UID. Returns JSON.",
			mimeType: "application/json",
		},
		async (uri, params) => {
			const uid = Array.isArray(params.uid) ? params.uid[0] : params.uid;
			if (!uid) throw new Error("asset uid missing from URI");
			const asset = await client.sdk.assets.get(uid);
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: "application/json",
						text: JSON.stringify(asset, null, 2),
					},
				],
			};
		},
	);

	// Per-actor resource.
	server.registerResource(
		"actor",
		new ResourceTemplate("holocron://actors/{uid}", { list: undefined }),
		{
			title: "Holocron Actor",
			description: "A single actor (person or group) by UID. Returns JSON.",
			mimeType: "application/json",
		},
		async (uri, params) => {
			const uid = Array.isArray(params.uid) ? params.uid[0] : params.uid;
			if (!uid) throw new Error("actor uid missing from URI");
			const actor = await client.sdk.actors.get(uid);
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: "application/json",
						text: JSON.stringify(actor, null, 2),
					},
				],
			};
		},
	);

	// Overview resource — markdown summary of the catalog.
	server.registerResource(
		"schema-overview",
		"holocron://schema-overview",
		{
			title: "Holocron Catalog Overview",
			description: "Markdown summary of the catalog: asset/actor/relation counts and top-level structure.",
			mimeType: "text/markdown",
		},
		async (uri) => {
			const [assets, actors, relations] = await Promise.all([
				client.sdk.assets.list({ limit: 100 }),
				client.sdk.actors.list({ limit: 100 }),
				client.sdk.relations.list({ limit: 100 }),
			]);

			const assetsByType = countBy(assets.items, (a) => a.type);
			const actorsByType = countBy(actors.items, (a) => a.type);
			const relationsByType = countBy(relations.items, (r) => r.type);

			const lines: string[] = [
				"# Holocron Catalog Overview",
				"",
				`Base URL: ${client.baseUrl}`,
				"",
				`- **Assets:** ${assets.total}`,
				...Object.entries(assetsByType).map(([k, v]) => `  - ${k}: ${v}`),
				`- **Actors:** ${actors.total}`,
				...Object.entries(actorsByType).map(([k, v]) => `  - ${k}: ${v}`),
				`- **Relations:** ${relations.total}`,
				...Object.entries(relationsByType).map(([k, v]) => `  - ${k}: ${v}`),
			];

			return {
				contents: [
					{
						uri: uri.href,
						mimeType: "text/markdown",
						text: lines.join("\n"),
					},
				],
			};
		},
	);
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const item of items) {
		const k = key(item);
		out[k] = (out[k] ?? 0) + 1;
	}
	return out;
}
