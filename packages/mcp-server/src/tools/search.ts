/**
 * Search tool — case-insensitive substring match across assets and actors.
 *
 * The Holocron API does not currently expose a `/search` endpoint, so this
 * implementation lists assets and actors and filters client-side by name,
 * description, and location.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpHolocronClient } from "../client.js";
import { errorResult, jsonResult } from "./helpers.js";

interface SearchableEntity {
	uid: string;
	name: string;
	type: string;
	description?: string | null;
	location?: string | null;
	email?: string | null;
	verified?: boolean;
	kind: "asset" | "actor";
}

export function registerSearchTool(server: McpServer, client: McpHolocronClient): void {
	server.registerTool(
		"search",
		{
			title: "Search Catalog",
			description:
				"Search the catalog by name, description, or location across assets and actors. Case-insensitive substring match. Use this when you don't know the UID and need to find an entity.",
			inputSchema: {
				query: z.string().min(1).describe("Free-text query"),
				limit: z.number().int().min(1).max(100).optional().describe("Max hits (default 20)"),
			},
		},
		async ({ query, limit }): Promise<CallToolResult> => {
			try {
				const needle = query.toLowerCase();
				const cap = limit ?? 20;

				// Pull reasonable batches from each collection.
				const [assets, actors] = await Promise.all([
					client.sdk.assets.list({ limit: 100 }),
					client.sdk.actors.list({ limit: 100 }),
				]);

				const candidates: SearchableEntity[] = [
					...assets.items.map((a) => ({
						uid: a.uid,
						name: a.name,
						type: a.type,
						description: a.description,
						location: a.location,
						verified: (a as { verified?: boolean }).verified,
						kind: "asset" as const,
					})),
					...actors.items.map((a) => ({
						uid: a.uid,
						name: a.name,
						type: a.type,
						description: a.description,
						email: a.email,
						verified: (a as { verified?: boolean }).verified,
						kind: "actor" as const,
					})),
				];

				const hits = candidates.filter((c) => entityMatches(c, needle)).slice(0, cap);

				return jsonResult({
					query,
					total_matches: hits.length,
					hits,
				});
			} catch (err) {
				return errorResult("search", err);
			}
		},
	);
}

function entityMatches(entity: SearchableEntity, needle: string): boolean {
	const haystacks = [entity.name, entity.description, entity.location, entity.email];
	return haystacks.some((h) => typeof h === "string" && h.toLowerCase().includes(needle));
}
