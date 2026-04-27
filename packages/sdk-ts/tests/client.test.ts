import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DEFAULT_API_VERSION, HolocronClient, SUPPORTED_API_VERSIONS } from "../src";

const HOLOCRON_URL = process.env.HOLOCRON_URL || "http://holocron:8000";

describe("HolocronClient", () => {
	const client = new HolocronClient({ baseUrl: HOLOCRON_URL });

	describe("versioning", () => {
		test("should use default API version when not specified", () => {
			const c = new HolocronClient({ baseUrl: HOLOCRON_URL });
			expect(c.apiVersion).toBe(DEFAULT_API_VERSION);
		});

		test("should accept valid API version", () => {
			const c = new HolocronClient({ baseUrl: HOLOCRON_URL, apiVersion: "v1" });
			expect(c.apiVersion).toBe("v1");
		});

		test("should throw on unsupported API version", () => {
			expect(() => {
				// @ts-expect-error Testing invalid version
				new HolocronClient({ baseUrl: HOLOCRON_URL, apiVersion: "v99" });
			}).toThrow("Unsupported API version: v99");
		});

		test("should have v1 in supported versions", () => {
			expect(SUPPORTED_API_VERSIONS).toContain("v1");
		});

		test("supportsApiVersion should return true for v1", () => {
			expect(HolocronClient.supportsApiVersion("v1")).toBe(true);
		});

		test("supportsApiVersion should return false for unsupported version", () => {
			expect(HolocronClient.supportsApiVersion("v99")).toBe(false);
		});
	});

	describe("health", () => {
		test("should return health status", async () => {
			const health = await client.health();
			expect(health).toBeDefined();
			expect(health.status).toBe("healthy");
		});
	});

	describe("assets", () => {
		let createdAssetUid: string;

		test("should create an asset", async () => {
			const asset = await client.assets.create({
				type: "dataset",
				name: "Test Dataset",
				description: "A test dataset",
			});

			expect(asset.uid).toBeDefined();
			expect(asset.name).toBe("Test Dataset");
			expect(asset.type).toBe("dataset");
			createdAssetUid = asset.uid;
		});

		test("should get an asset by uid", async () => {
			const asset = await client.assets.get(createdAssetUid);
			expect(asset.uid).toBe(createdAssetUid);
			expect(asset.name).toBe("Test Dataset");
		});

		test("should list assets", async () => {
			const result = await client.assets.list();
			expect(result.items).toBeDefined();
			expect(result.total).toBeGreaterThanOrEqual(1);
		});

		test("should update an asset", async () => {
			const asset = await client.assets.update(createdAssetUid, {
				name: "Updated Dataset",
			});
			expect(asset.name).toBe("Updated Dataset");
		});

		test("should delete an asset", async () => {
			await client.assets.delete(createdAssetUid);
			// Verify deletion by expecting get to fail
			await expect(client.assets.get(createdAssetUid)).rejects.toThrow();
		});
	});

	describe("actors", () => {
		let createdActorUid: string;

		test("should create an actor", async () => {
			const actor = await client.actors.create({
				type: "person",
				name: "Test Person",
				email: "test@example.com",
			});

			expect(actor.uid).toBeDefined();
			expect(actor.name).toBe("Test Person");
			expect(actor.type).toBe("person");
			createdActorUid = actor.uid;
		});

		test("should get an actor by uid", async () => {
			const actor = await client.actors.get(createdActorUid);
			expect(actor.uid).toBe(createdActorUid);
			expect(actor.name).toBe("Test Person");
		});

		test("should list actors", async () => {
			const result = await client.actors.list();
			expect(result.items).toBeDefined();
			expect(result.total).toBeGreaterThanOrEqual(1);
		});

		test("should update an actor", async () => {
			const actor = await client.actors.update(createdActorUid, {
				name: "Updated Person",
			});
			expect(actor.name).toBe("Updated Person");
		});

		test("should delete an actor", async () => {
			await client.actors.delete(createdActorUid);
			await expect(client.actors.get(createdActorUid)).rejects.toThrow();
		});
	});

	describe("relations", () => {
		let asset: Awaited<ReturnType<typeof client.assets.create>>;
		let actor: Awaited<ReturnType<typeof client.actors.create>>;
		let relationUid: string;

		beforeAll(async () => {
			asset = await client.assets.create({
				type: "dataset",
				name: "Relation Test Asset",
			});

			actor = await client.actors.create({
				type: "person",
				name: "Relation Test Actor",
			});
		});

		afterAll(async () => {
			await client.assets.delete(asset.uid).catch(() => {});
			await client.actors.delete(actor.uid).catch(() => {});
		});

		test("should create a relation using objects", async () => {
			const relation = await client.relations.create({
				from: actor,
				to: asset,
				type: "owns",
			});

			expect(relation.uid).toBeDefined();
			expect(relation.type).toBe("owns");
			expect(relation.from_uid).toBe(actor.uid);
			expect(relation.to_uid).toBe(asset.uid);
			relationUid = relation.uid;
		});

		test("should create a relation using UIDs", async () => {
			const relation = await client.relations.create({
				from: actor.uid,
				to: asset.uid,
				type: "uses",
			});

			expect(relation.uid).toBeDefined();
			expect(relation.type).toBe("uses");
			await client.relations.delete(relation.uid);
		});

		test("should create a relation using mixed (object + UID)", async () => {
			const relation = await client.relations.create({
				from: actor,
				to: asset.uid,
				type: "uses",
			});

			expect(relation.uid).toBeDefined();
			expect(relation.from_uid).toBe(actor.uid);
			await client.relations.delete(relation.uid);
		});

		test("should list relations", async () => {
			const result = await client.relations.list();
			expect(result.items).toBeDefined();
			expect(result.total).toBeGreaterThanOrEqual(1);
		});

		test("should filter relations by from_uid", async () => {
			const result = await client.relations.list({ from_uid: actor.uid });
			expect(result.items.length).toBeGreaterThanOrEqual(1);
			expect(result.items[0]?.from_uid).toBe(actor.uid);
		});

		test("should delete a relation", async () => {
			await client.relations.delete(relationUid);
			const result = await client.relations.list({ from_uid: actor.uid });
			const found = result.items.find((r) => r.uid === relationUid);
			expect(found).toBeUndefined();
		});
	});

	describe("events", () => {
		test("should list events", async () => {
			const result = await client.events.list();
			expect(result.items).toBeDefined();
			expect(result.total).toBeGreaterThanOrEqual(0);
		});
	});
});
