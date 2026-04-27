/**
 * Boot-smoke tests for the Holocron MCP server.
 *
 * These run with `bun test` and use an injected fake client so they don't
 * require a live Holocron API.
 */
import { describe, expect, test } from "bun:test";
import { createServer } from "../src/server.js";
import type { McpHolocronClient } from "../src/client.js";
import { TOOL_NAMES } from "../src/tools/index.js";

function makeFakeClient(): McpHolocronClient {
	const empty = async () => ({ items: [], total: 0 });
	// biome-ignore lint/suspicious/noExplicitAny: test fake
	const sdk = {
		assets: {
			list: empty,
			get: async (uid: string) => ({ uid, name: "fake", type: "dataset" }),
			create: async (a: unknown) => ({ uid: "asset-1", ...(a as object) }),
			update: async (uid: string, a: unknown) => ({ uid, ...(a as object) }),
			delete: async () => undefined,
		},
		actors: {
			list: empty,
			get: async (uid: string) => ({ uid, name: "fake", type: "person" }),
			create: async (a: unknown) => ({ uid: "actor-1", ...(a as object) }),
			update: async (uid: string, a: unknown) => ({ uid, ...(a as object) }),
			delete: async () => undefined,
		},
		relations: {
			list: empty,
			create: async (r: unknown) => ({ uid: "rel-1", ...(r as object) }),
			delete: async () => undefined,
		},
	} as any;

	return {
		sdk,
		baseUrl: "http://fake.test",
		listPlugins: async () => [],
		runPlugin: async () => ({ kind: "summary", summary: {} }),
		setAssetVerified: async (uid: string) => ({ uid, verified: true }),
		setActorVerified: async (uid: string) => ({ uid, verified: true }),
		setRelationVerified: async (uid: string) => ({ uid }),
		getRelation: async (uid: string) => ({ uid }),
	};
}

describe("createServer", () => {
	test("boots without error", async () => {
		const { server, client } = await createServer({
			baseUrl: "http://fake.test",
			client: makeFakeClient(),
		});
		expect(server).toBeDefined();
		expect(client.baseUrl).toBe("http://fake.test");
	});

	test("TOOL_NAMES lists all expected tools", () => {
		const expected = [
			"list_assets",
			"get_asset",
			"create_asset",
			"update_asset",
			"delete_asset",
			"verify_asset",
			"list_actors",
			"get_actor",
			"create_actor",
			"update_actor",
			"delete_actor",
			"verify_actor",
			"list_relations",
			"get_relation",
			"create_relation",
			"delete_relation",
			"verify_relation",
			"search",
			"list_plugins",
			"run_plugin",
		];
		for (const name of expected) {
			expect(TOOL_NAMES).toContain(name);
		}
		expect(TOOL_NAMES.length).toBe(expected.length);
	});
});
