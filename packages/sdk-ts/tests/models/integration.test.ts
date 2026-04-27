import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { HolocronClient } from "../../src";

const HOLOCRON_URL = process.env.HOLOCRON_URL || "http://holocron:8000";

describe("Models Integration", () => {
	const client = new HolocronClient({ baseUrl: HOLOCRON_URL });

	describe("AssetEntity", () => {
		let assetUid: string;

		test("should create a new asset via model", async () => {
			const asset = client.models.assets.new({
				type: "dataset",
				name: "Model Test Asset",
				description: "Created via Active Record pattern",
			});

			expect(asset.isNew).toBe(true);
			expect(asset.uid).toBe("");

			await asset.save();

			expect(asset.isNew).toBe(false);
			expect(asset.uid).toBeTruthy();
			expect(asset.name).toBe("Model Test Asset");
			assetUid = asset.uid;
		});

		test("should get an asset via model", async () => {
			const asset = await client.models.assets.get(assetUid);

			expect(asset.isNew).toBe(false);
			expect(asset.uid).toBe(assetUid);
			expect(asset.name).toBe("Model Test Asset");
			expect(asset.type).toBe("dataset");
		});

		test("should update asset and track dirty fields", async () => {
			const asset = await client.models.assets.get(assetUid);

			expect(asset.isDirty).toBe(false);

			asset.name = "Updated Model Asset";
			asset.description = "Updated via save()";

			expect(asset.isDirty).toBe(true);
			expect(asset.dirtyFields.has("name")).toBe(true);
			expect(asset.dirtyFields.has("description")).toBe(true);

			await asset.save();

			expect(asset.isDirty).toBe(false);
			expect(asset.name).toBe("Updated Model Asset");
		});

		test("should refresh asset from server", async () => {
			const asset = await client.models.assets.get(assetUid);

			// Update via plain API
			await client.assets.update(assetUid, { name: "Server Updated Name" });

			// Asset still has old value
			expect(asset.name).toBe("Updated Model Asset");

			// Refresh from server
			await asset.refresh();

			expect(asset.name).toBe("Server Updated Name");
			expect(asset.isDirty).toBe(false);
		});

		test("should revert local changes", async () => {
			const asset = await client.models.assets.get(assetUid);
			const originalName = asset.name;

			asset.name = "Local Change";
			expect(asset.isDirty).toBe(true);

			asset.revert();

			expect(asset.name).toBe(originalName);
			expect(asset.isDirty).toBe(false);
		});

		test("should list assets via model", async () => {
			const { items, total } = await client.models.assets.list({
				type: "dataset",
			});

			expect(items.length).toBeGreaterThanOrEqual(1);
			expect(total).toBeGreaterThanOrEqual(1);

			const found = items.find((a) => a.uid === assetUid);
			expect(found).toBeDefined();
			expect(found?.isNew).toBe(false);
		});

		test("should delete asset via model", async () => {
			const asset = await client.models.assets.get(assetUid);

			await asset.delete();

			expect(asset.isNew).toBe(true); // No longer persisted

			// Verify deleted
			await expect(client.assets.get(assetUid)).rejects.toThrow();
		});
	});

	describe("ActorEntity", () => {
		let actorUid: string;

		test("should create a new actor via model", async () => {
			const actor = client.models.actors.new({
				type: "person",
				name: "Model Test Person",
				email: "model@example.com",
			});

			expect(actor.isNew).toBe(true);

			await actor.save();

			expect(actor.isNew).toBe(false);
			expect(actor.uid).toBeTruthy();
			actorUid = actor.uid;
		});

		test("should update and save actor", async () => {
			const actor = await client.models.actors.get(actorUid);

			actor.name = "Updated Person Name";
			await actor.save();

			expect(actor.isDirty).toBe(false);

			// Verify via plain API
			const fetched = await client.actors.get(actorUid);
			expect(fetched.name).toBe("Updated Person Name");
		});

		test("should list actors via model", async () => {
			const { items, total } = await client.models.actors.list({
				type: "person",
			});

			expect(items.length).toBeGreaterThanOrEqual(1);
			expect(total).toBeGreaterThanOrEqual(1);
		});

		afterAll(async () => {
			await client.actors.delete(actorUid).catch(() => {});
		});
	});

	describe("RelationEntity", () => {
		let asset: Awaited<ReturnType<typeof client.assets.create>>;
		let actor: Awaited<ReturnType<typeof client.actors.create>>;
		let relationUid: string;

		beforeAll(async () => {
			asset = await client.assets.create({
				type: "dataset",
				name: "Relation Model Test Asset",
			});
			actor = await client.actors.create({
				type: "person",
				name: "Relation Model Test Actor",
			});
		});

		afterAll(async () => {
			await client.relations.delete(relationUid).catch(() => {});
			await client.assets.delete(asset.uid).catch(() => {});
			await client.actors.delete(actor.uid).catch(() => {});
		});

		test("should create a relation via model", async () => {
			const relation = client.models.relations.new({
				from: actor,
				to: asset,
				type: "owns",
			});

			expect(relation.isNew).toBe(true);

			await relation.save();

			expect(relation.isNew).toBe(false);
			expect(relation.uid).toBeTruthy();
			expect(relation.fromUid).toBe(actor.uid);
			expect(relation.toUid).toBe(asset.uid);
			expect(relation.type).toBe("owns");
			relationUid = relation.uid;
		});

		test("should list relations via model", async () => {
			const { items, total } = await client.models.relations.list({
				from_uid: actor.uid,
			});

			expect(items.length).toBeGreaterThanOrEqual(1);
			expect(total).toBeGreaterThanOrEqual(1);

			const found = items.find((r) => r.uid === relationUid);
			expect(found).toBeDefined();
			expect(found?.isNew).toBe(false);
		});

		test("should lazy load 'from' entity", async () => {
			const { items } = await client.models.relations.list({
				from_uid: actor.uid,
			});
			const relation = items.find((r) => r.uid === relationUid);
			if (!relation) throw new Error("Relation not found");

			expect(relation.from).toBeUndefined();

			const from = await relation.fetchFrom();

			expect(from.uid).toBe(actor.uid);
			expect(from.name).toBe("Relation Model Test Actor");
			expect(relation.from).toBe(from); // Now cached
		});

		test("should lazy load 'to' entity", async () => {
			const { items } = await client.models.relations.list({
				to_uid: asset.uid,
			});
			const relation = items.find((r) => r.uid === relationUid);
			if (!relation) throw new Error("Relation not found");

			expect(relation.to).toBeUndefined();

			const to = await relation.fetchTo();

			expect(to.uid).toBe(asset.uid);
			expect(to.name).toBe("Relation Model Test Asset");
			expect(relation.to).toBe(to); // Now cached
		});

		test("should not allow updating a relation", async () => {
			const { items } = await client.models.relations.list({
				from_uid: actor.uid,
			});
			const relation = items.find((r) => r.uid === relationUid);
			if (!relation) throw new Error("Relation not found");

			await expect(relation.save()).rejects.toThrow("Relations cannot be updated");
		});

		test("should delete relation via model", async () => {
			const { items } = await client.models.relations.list({
				from_uid: actor.uid,
			});
			const relation = items.find((r) => r.uid === relationUid);
			if (!relation) throw new Error("Relation not found");

			await relation.delete();

			expect(relation.isNew).toBe(true);

			// Verify deleted
			const { items: remaining } = await client.relations.list({
				from_uid: actor.uid,
			});
			expect(remaining.find((r) => r.uid === relationUid)).toBeUndefined();
		});
	});
});
