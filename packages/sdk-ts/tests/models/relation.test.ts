import { describe, expect, mock, test } from "bun:test";
import type { HolocronClient } from "../../src";
import { NotFoundError } from "../../src/errors";
import { RelationEntity } from "../../src/models/relation";

// Create a mock client for unit tests
const createMockClient = () => {
	return {
		relations: {
			create: mock(() =>
				Promise.resolve({
					uid: "new-relation-uid",
					from_uid: "actor-uid",
					to_uid: "asset-uid",
					type: "owns" as const,
					properties: {},
					created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				}),
			),
			delete: mock(() => Promise.resolve()),
			list: mock(() =>
				Promise.resolve({
					items: [],
					total: 0,
				}),
			),
		},
		assets: {
			get: mock(() =>
				Promise.resolve({
					uid: "asset-uid",
					type: "dataset" as const,
					name: "Test Asset",
					description: null,
					location: null,
					status: "active" as const,
					metadata: {},
					created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
					updated_at: "2024-01-01T00:00:00Z",
				}),
			),
		},
		actors: {
			get: mock(() =>
				Promise.resolve({
					uid: "actor-uid",
					type: "person" as const,
					name: "Test Actor",
					email: null,
					description: null,
					metadata: {},
					created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
					updated_at: "2024-01-01T00:00:00Z",
				}),
			),
		},
	} as unknown as HolocronClient;
};

describe("RelationEntity", () => {
	describe("new entity", () => {
		test("should be marked as new", () => {
			const client = createMockClient();
			const relation = RelationEntity._fromCreate(client, {
				from: "actor-uid",
				to: "asset-uid",
				type: "owns",
			});

			expect(relation.isNew).toBe(true);
			expect(relation.uid).toBe("");
		});

		test("should resolve UIDs from strings", () => {
			const client = createMockClient();
			const relation = RelationEntity._fromCreate(client, {
				from: "actor-uid",
				to: "asset-uid",
				type: "owns",
			});

			expect(relation.fromUid).toBe("actor-uid");
			expect(relation.toUid).toBe("asset-uid");
		});

		test("should resolve UIDs from objects", () => {
			const client = createMockClient();
			const relation = RelationEntity._fromCreate(client, {
				from: { uid: "actor-uid" },
				to: { uid: "asset-uid" },
				type: "uses",
			});

			expect(relation.fromUid).toBe("actor-uid");
			expect(relation.toUid).toBe("asset-uid");
			expect(relation.type).toBe("uses");
		});

		test("should have default properties", () => {
			const client = createMockClient();
			const relation = RelationEntity._fromCreate(client, {
				from: "actor-uid",
				to: "asset-uid",
				type: "owns",
			});

			expect(relation.properties).toEqual({});
		});

		test("should accept custom properties", () => {
			const client = createMockClient();
			const relation = RelationEntity._fromCreate(client, {
				from: "actor-uid",
				to: "asset-uid",
				type: "owns",
				properties: { role: "primary" },
			});

			expect(relation.properties).toEqual({ role: "primary" });
		});
	});

	describe("existing entity", () => {
		test("should not be marked as new", () => {
			const client = createMockClient();
			const relation = RelationEntity._fromData(client, {
				uid: "relation-uid",
				from_uid: "actor-uid",
				to_uid: "asset-uid",
				type: "owns",
				properties: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
			});

			expect(relation.isNew).toBe(false);
			expect(relation.uid).toBe("relation-uid");
		});
	});

	describe("save", () => {
		test("should create new relation", async () => {
			const client = createMockClient();
			const relation = RelationEntity._fromCreate(client, {
				from: "actor-uid",
				to: "asset-uid",
				type: "owns",
			});

			expect(relation.isNew).toBe(true);

			await relation.save();

			expect(relation.isNew).toBe(false);
			expect(relation.uid).toBe("new-relation-uid");
			expect(client.relations.create).toHaveBeenCalledWith({
				uid: undefined,
				from: "actor-uid",
				to: "asset-uid",
				type: "owns",
				verified: true,
				discovered_by: null,
				properties: {},
			});
		});

		test("should throw when saving existing relation", async () => {
			const client = createMockClient();
			const relation = RelationEntity._fromData(client, {
				uid: "relation-uid",
				from_uid: "actor-uid",
				to_uid: "asset-uid",
				type: "owns",
				properties: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
			});

			await expect(relation.save()).rejects.toThrow(
				"Relations cannot be updated. Delete and create a new one instead.",
			);
		});
	});

	describe("delete", () => {
		test("should delete from server", async () => {
			const client = createMockClient();
			const relation = RelationEntity._fromData(client, {
				uid: "relation-uid",
				from_uid: "actor-uid",
				to_uid: "asset-uid",
				type: "owns",
				properties: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
			});

			await relation.delete();

			expect(client.relations.delete).toHaveBeenCalledWith("relation-uid");
			expect(relation.isNew).toBe(true); // Now unpersisted
		});

		test("should throw for new entity", async () => {
			const client = createMockClient();
			const relation = RelationEntity._fromCreate(client, {
				from: "actor-uid",
				to: "asset-uid",
				type: "owns",
			});

			await expect(relation.delete()).rejects.toThrow(
				"Cannot delete a relation that has not been saved",
			);
		});
	});

	describe("toJSON", () => {
		test("should return plain object", () => {
			const client = createMockClient();
			const relation = RelationEntity._fromData(client, {
				uid: "relation-uid",
				from_uid: "actor-uid",
				to_uid: "asset-uid",
				type: "owns",
				properties: { role: "primary" },
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
			});

			const json = relation.toJSON();

			expect(json).toEqual({
				uid: "relation-uid",
				from_uid: "actor-uid",
				to_uid: "asset-uid",
				type: "owns",
				properties: { role: "primary" },
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
			});
		});
	});

	describe("lazy loading", () => {
		test("from/to should be undefined initially", () => {
			const client = createMockClient();
			const relation = RelationEntity._fromData(client, {
				uid: "relation-uid",
				from_uid: "actor-uid",
				to_uid: "asset-uid",
				type: "owns",
				properties: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
			});

			expect(relation.from).toBeUndefined();
			expect(relation.to).toBeUndefined();
		});

		test("fetchFrom should load and cache actor", async () => {
			const client = createMockClient();
			// Make asset fetch fail with NotFoundError to force actor path
			(client.assets.get as ReturnType<typeof mock>).mockRejectedValue(
				new NotFoundError("Asset not found", { resourceType: "asset", resourceUid: "actor-uid" }),
			);

			const relation = RelationEntity._fromData(client, {
				uid: "relation-uid",
				from_uid: "actor-uid",
				to_uid: "asset-uid",
				type: "owns",
				properties: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
			});

			const from = await relation.fetchFrom();

			expect(from.uid).toBe("actor-uid");
			expect(from.name).toBe("Test Actor");
			expect(relation.from).toBe(from); // Cached
		});

		test("fetchTo should load and cache asset", async () => {
			const client = createMockClient();
			const relation = RelationEntity._fromData(client, {
				uid: "relation-uid",
				from_uid: "actor-uid",
				to_uid: "asset-uid",
				type: "owns",
				properties: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
			});

			const to = await relation.fetchTo();

			expect(to.uid).toBe("asset-uid");
			expect(to.name).toBe("Test Asset");
			expect(relation.to).toBe(to); // Cached
		});

		test("fetchFrom should return cached value on subsequent calls", async () => {
			const client = createMockClient();
			// Make asset fetch fail with NotFoundError to force actor path
			(client.assets.get as ReturnType<typeof mock>).mockRejectedValue(
				new NotFoundError("Asset not found", { resourceType: "asset", resourceUid: "actor-uid" }),
			);

			const relation = RelationEntity._fromData(client, {
				uid: "relation-uid",
				from_uid: "actor-uid",
				to_uid: "asset-uid",
				type: "owns",
				properties: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
			});

			const from1 = await relation.fetchFrom();
			const from2 = await relation.fetchFrom();

			expect(from1).toBe(from2); // Same reference
			// Actor.get should only be called once
			expect(client.actors.get).toHaveBeenCalledTimes(1);
		});

		test("fetchTo should return cached value on subsequent calls", async () => {
			const client = createMockClient();
			const relation = RelationEntity._fromData(client, {
				uid: "relation-uid",
				from_uid: "actor-uid",
				to_uid: "asset-uid",
				type: "owns",
				properties: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
			});

			const to1 = await relation.fetchTo();
			const to2 = await relation.fetchTo();

			expect(to1).toBe(to2); // Same reference
			// Asset.get should only be called once
			expect(client.assets.get).toHaveBeenCalledTimes(1);
		});
	});

	describe("date properties", () => {
		test("should return Date object for createdAt", () => {
			const client = createMockClient();
			const relation = RelationEntity._fromData(client, {
				uid: "relation-uid",
				from_uid: "actor-uid",
				to_uid: "asset-uid",
				type: "owns",
				properties: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
			});

			expect(relation.createdAt).toBeInstanceOf(Date);
			expect(relation.createdAt.toISOString()).toBe("2024-01-01T00:00:00.000Z");
		});
	});
});
