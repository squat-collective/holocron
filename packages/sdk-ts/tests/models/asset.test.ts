import { describe, expect, mock, test } from "bun:test";
import type { HolocronClient } from "../../src";
import { AssetEntity } from "../../src/models/asset";

// Create a mock client for unit tests
const createMockClient = () => {
	return {
		assets: {
			create: mock(() =>
				Promise.resolve({
					uid: "new-uid",
					type: "dataset" as const,
					name: "Test Asset",
					description: null,
					location: null,
					status: "active" as const,
					metadata: {},
					created_at: "2024-01-01T00:00:00Z",
					updated_at: "2024-01-01T00:00:00Z",
				}),
			),
			update: mock(() =>
				Promise.resolve({
					uid: "existing-uid",
					type: "dataset" as const,
					name: "Updated Name",
					description: "New description",
					location: null,
					status: "active" as const,
					metadata: {},
					created_at: "2024-01-01T00:00:00Z",
					updated_at: "2024-01-02T00:00:00Z",
				}),
			),
			get: mock(() =>
				Promise.resolve({
					uid: "existing-uid",
					type: "dataset" as const,
					name: "Refreshed Name",
					description: null,
					location: null,
					status: "active" as const,
					metadata: {},
					created_at: "2024-01-01T00:00:00Z",
					updated_at: "2024-01-03T00:00:00Z",
				}),
			),
			delete: mock(() => Promise.resolve()),
		},
	} as unknown as HolocronClient;
};

describe("AssetEntity", () => {
	describe("new entity", () => {
		test("should be marked as new", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromCreate(client, {
				type: "dataset",
				name: "Test Asset",
			});

			expect(asset.isNew).toBe(true);
			expect(asset.uid).toBe("");
		});

		test("should have default values", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromCreate(client, {
				type: "dataset",
				name: "Test Asset",
			});

			expect(asset.type).toBe("dataset");
			expect(asset.name).toBe("Test Asset");
			expect(asset.description).toBeNull();
			expect(asset.location).toBeNull();
			expect(asset.status).toBe("active");
			expect(asset.metadata).toEqual({});
		});

		test("should accept optional values", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromCreate(client, {
				type: "report",
				name: "Test Report",
				description: "A test report",
				location: "s3://bucket/path",
				status: "draft",
				metadata: { key: "value" },
			});

			expect(asset.type).toBe("report");
			expect(asset.description).toBe("A test report");
			expect(asset.location).toBe("s3://bucket/path");
			expect(asset.status).toBe("draft");
			expect(asset.metadata).toEqual({ key: "value" });
		});

		test("should not be dirty initially", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromCreate(client, {
				type: "dataset",
				name: "Test Asset",
			});

			expect(asset.isDirty).toBe(false);
			expect(asset.dirtyFields.size).toBe(0);
		});
	});

	describe("existing entity", () => {
		test("should not be marked as new", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "existing-uid",
				type: "dataset",
				name: "Existing Asset",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			expect(asset.isNew).toBe(false);
			expect(asset.uid).toBe("existing-uid");
		});
	});

	describe("dirty tracking", () => {
		test("should track name changes", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "uid",
				type: "dataset",
				name: "Original",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			expect(asset.isDirty).toBe(false);

			asset.name = "Changed";

			expect(asset.isDirty).toBe(true);
			expect(asset.dirtyFields.has("name")).toBe(true);
			expect(asset.name).toBe("Changed");
		});

		test("should track description changes", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "uid",
				type: "dataset",
				name: "Test",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			asset.description = "New description";

			expect(asset.isDirty).toBe(true);
			expect(asset.dirtyFields.has("description")).toBe(true);
		});

		test("should track multiple field changes", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "uid",
				type: "dataset",
				name: "Test",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			asset.name = "New Name";
			asset.description = "New description";
			asset.status = "deprecated";

			expect(asset.dirtyFields.size).toBe(3);
			expect(asset.dirtyFields.has("name")).toBe(true);
			expect(asset.dirtyFields.has("description")).toBe(true);
			expect(asset.dirtyFields.has("status")).toBe(true);
		});

		test("should not mark dirty when setting same value", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "uid",
				type: "dataset",
				name: "Original",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			asset.name = "Original";

			expect(asset.isDirty).toBe(false);
			expect(asset.dirtyFields.size).toBe(0);
		});

		test("should un-dirty when reverting to original value", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "uid",
				type: "dataset",
				name: "Original",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			asset.name = "Changed";
			expect(asset.isDirty).toBe(true);

			asset.name = "Original";
			expect(asset.isDirty).toBe(false);
		});

		test("should track metadata changes", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "uid",
				type: "dataset",
				name: "Test",
				description: null,
				location: null,
				status: "active",
				metadata: { key: "value" },
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			asset.metadata = { key: "new-value" };

			expect(asset.isDirty).toBe(true);
			expect(asset.dirtyFields.has("metadata")).toBe(true);
		});
	});

	describe("revert", () => {
		test("should revert changes", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "uid",
				type: "dataset",
				name: "Original",
				description: "Original desc",
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			asset.name = "Changed";
			asset.description = "Changed desc";

			expect(asset.name).toBe("Changed");
			expect(asset.description).toBe("Changed desc");
			expect(asset.isDirty).toBe(true);

			asset.revert();

			expect(asset.name).toBe("Original");
			expect(asset.description).toBe("Original desc");
			expect(asset.isDirty).toBe(false);
		});
	});

	describe("toJSON", () => {
		test("should return plain object", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "uid",
				type: "dataset",
				name: "Test",
				description: null,
				location: null,
				status: "active",
				metadata: { key: "value" },
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			const json = asset.toJSON();

			expect(json).toEqual({
				uid: "uid",
				type: "dataset",
				name: "Test",
				description: null,
				location: null,
				status: "active",
				metadata: { key: "value" },
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});
		});

		test("should include dirty changes", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "uid",
				type: "dataset",
				name: "Original",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			asset.name = "Changed";

			const json = asset.toJSON();
			expect(json.name).toBe("Changed");
		});
	});

	describe("save", () => {
		test("should create new entity", async () => {
			const client = createMockClient();
			const asset = AssetEntity._fromCreate(client, {
				type: "dataset",
				name: "Test Asset",
			});

			expect(asset.isNew).toBe(true);

			await asset.save();

			expect(asset.isNew).toBe(false);
			expect(asset.uid).toBe("new-uid");
			expect(asset.isDirty).toBe(false);
			expect(client.assets.create).toHaveBeenCalled();
		});

		test("should update existing entity with only dirty fields", async () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "existing-uid",
				type: "dataset",
				name: "Original",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			asset.name = "New Name";
			asset.description = "New description";

			await asset.save();

			expect(client.assets.update).toHaveBeenCalledWith("existing-uid", {
				name: "New Name",
				description: "New description",
			});
			expect(asset.isDirty).toBe(false);
		});

		test("should not call API if not dirty", async () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "existing-uid",
				type: "dataset",
				name: "Original",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			await asset.save();

			expect(client.assets.update).not.toHaveBeenCalled();
		});
	});

	describe("refresh", () => {
		test("should reload from server", async () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "existing-uid",
				type: "dataset",
				name: "Original",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			asset.name = "Local Change";

			await asset.refresh();

			expect(asset.name).toBe("Refreshed Name");
			expect(asset.isDirty).toBe(false);
			expect(client.assets.get).toHaveBeenCalledWith("existing-uid");
		});

		test("should throw for new entity", async () => {
			const client = createMockClient();
			const asset = AssetEntity._fromCreate(client, {
				type: "dataset",
				name: "Test",
			});

			await expect(asset.refresh()).rejects.toThrow(
				"Cannot refresh an entity that has not been saved",
			);
		});
	});

	describe("delete", () => {
		test("should delete from server", async () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "existing-uid",
				type: "dataset",
				name: "Test",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			});

			await asset.delete();

			expect(client.assets.delete).toHaveBeenCalledWith("existing-uid");
			expect(asset.isNew).toBe(true); // Now unpersisted
		});

		test("should throw for new entity", async () => {
			const client = createMockClient();
			const asset = AssetEntity._fromCreate(client, {
				type: "dataset",
				name: "Test",
			});

			await expect(asset.delete()).rejects.toThrow(
				"Cannot delete an entity that has not been saved",
			);
		});
	});

	describe("date properties", () => {
		test("should return Date objects", () => {
			const client = createMockClient();
			const asset = AssetEntity._fromData(client, {
				uid: "uid",
				type: "dataset",
				name: "Test",
				description: null,
				location: null,
				status: "active",
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-02T00:00:00Z",
			});

			expect(asset.createdAt).toBeInstanceOf(Date);
			expect(asset.updatedAt).toBeInstanceOf(Date);
			expect(asset.createdAt.toISOString()).toBe("2024-01-01T00:00:00.000Z");
			expect(asset.updatedAt.toISOString()).toBe("2024-01-02T00:00:00.000Z");
		});
	});
});
