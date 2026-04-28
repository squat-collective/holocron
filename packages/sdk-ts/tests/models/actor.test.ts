import { describe, expect, mock, test } from "bun:test";
import type { HolocronClient } from "../../src";
import { ActorEntity } from "../../src/models/actor";

// Create a mock client for unit tests
const createMockClient = () => {
	return {
		actors: {
			create: mock(() =>
				Promise.resolve({
					uid: "new-uid",
					type: "person" as const,
					name: "Test Person",
					email: null,
					description: null,
					metadata: {},
					created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
					updated_at: "2024-01-01T00:00:00Z",
				}),
			),
			update: mock(() =>
				Promise.resolve({
					uid: "existing-uid",
					type: "person" as const,
					name: "Updated Name",
					email: "updated@example.com",
					description: null,
					metadata: {},
					created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
					updated_at: "2024-01-02T00:00:00Z",
				}),
			),
			get: mock(() =>
				Promise.resolve({
					uid: "existing-uid",
					type: "person" as const,
					name: "Refreshed Name",
					email: null,
					description: null,
					metadata: {},
					created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
					updated_at: "2024-01-03T00:00:00Z",
				}),
			),
			delete: mock(() => Promise.resolve()),
		},
	} as unknown as HolocronClient;
};

describe("ActorEntity", () => {
	describe("new entity", () => {
		test("should be marked as new", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromCreate(client, {
				type: "person",
				name: "Test Person",
			});

			expect(actor.isNew).toBe(true);
			expect(actor.uid).toBe("");
		});

		test("should have default values", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromCreate(client, {
				type: "person",
				name: "Test Person",
			});

			expect(actor.type).toBe("person");
			expect(actor.name).toBe("Test Person");
			expect(actor.email).toBeNull();
			expect(actor.description).toBeNull();
			expect(actor.metadata).toEqual({});
		});

		test("should accept optional values", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromCreate(client, {
				type: "group",
				name: "Test Group",
				email: "group@example.com",
				description: "A test group",
				metadata: { department: "Engineering" },
			});

			expect(actor.type).toBe("group");
			expect(actor.email).toBe("group@example.com");
			expect(actor.description).toBe("A test group");
			expect(actor.metadata).toEqual({ department: "Engineering" });
		});
	});

	describe("existing entity", () => {
		test("should not be marked as new", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "existing-uid",
				type: "person",
				name: "Existing Person",
				email: null,
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			expect(actor.isNew).toBe(false);
			expect(actor.uid).toBe("existing-uid");
		});
	});

	describe("dirty tracking", () => {
		test("should track name changes", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "uid",
				type: "person",
				name: "Original",
				email: null,
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			expect(actor.isDirty).toBe(false);

			actor.name = "Changed";

			expect(actor.isDirty).toBe(true);
			expect(actor.dirtyFields.has("name")).toBe(true);
		});

		test("should track email changes", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "uid",
				type: "person",
				name: "Test",
				email: null,
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			actor.email = "new@example.com";

			expect(actor.isDirty).toBe(true);
			expect(actor.dirtyFields.has("email")).toBe(true);
		});

		test("should track multiple field changes", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "uid",
				type: "person",
				name: "Test",
				email: null,
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			actor.name = "New Name";
			actor.email = "new@example.com";
			actor.description = "New description";

			expect(actor.dirtyFields.size).toBe(3);
			expect(actor.dirtyFields.has("name")).toBe(true);
			expect(actor.dirtyFields.has("email")).toBe(true);
			expect(actor.dirtyFields.has("description")).toBe(true);
		});

		test("should not mark dirty when setting same value", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "uid",
				type: "person",
				name: "Original",
				email: null,
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			actor.name = "Original";

			expect(actor.isDirty).toBe(false);
		});

		test("should un-dirty when reverting to original value", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "uid",
				type: "person",
				name: "Original",
				email: null,
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			actor.name = "Changed";
			expect(actor.isDirty).toBe(true);

			actor.name = "Original";
			expect(actor.isDirty).toBe(false);
		});
	});

	describe("revert", () => {
		test("should revert changes", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "uid",
				type: "person",
				name: "Original",
				email: "original@example.com",
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			actor.name = "Changed";
			actor.email = "changed@example.com";

			expect(actor.name).toBe("Changed");
			expect(actor.email).toBe("changed@example.com");
			expect(actor.isDirty).toBe(true);

			actor.revert();

			expect(actor.name).toBe("Original");
			expect(actor.email).toBe("original@example.com");
			expect(actor.isDirty).toBe(false);
		});
	});

	describe("toJSON", () => {
		test("should return plain object", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "uid",
				type: "person",
				name: "Test",
				email: "test@example.com",
				description: null,
				metadata: { key: "value" },
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			const json = actor.toJSON();

			expect(json).toEqual({
				uid: "uid",
				type: "person",
				name: "Test",
				email: "test@example.com",
				description: null,
				metadata: { key: "value" },
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});
		});
	});

	describe("save", () => {
		test("should create new entity", async () => {
			const client = createMockClient();
			const actor = ActorEntity._fromCreate(client, {
				type: "person",
				name: "Test Person",
			});

			expect(actor.isNew).toBe(true);

			await actor.save();

			expect(actor.isNew).toBe(false);
			expect(actor.uid).toBe("new-uid");
			expect(actor.isDirty).toBe(false);
			expect(client.actors.create).toHaveBeenCalled();
		});

		test("should update existing entity with only dirty fields", async () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "existing-uid",
				type: "person",
				name: "Original",
				email: null,
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			actor.name = "New Name";
			actor.email = "new@example.com";

			await actor.save();

			expect(client.actors.update).toHaveBeenCalledWith("existing-uid", {
				name: "New Name",
				email: "new@example.com",
			});
			expect(actor.isDirty).toBe(false);
		});

		test("should not call API if not dirty", async () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "existing-uid",
				type: "person",
				name: "Original",
				email: null,
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			await actor.save();

			expect(client.actors.update).not.toHaveBeenCalled();
		});
	});

	describe("refresh", () => {
		test("should reload from server", async () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "existing-uid",
				type: "person",
				name: "Original",
				email: null,
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			actor.name = "Local Change";

			await actor.refresh();

			expect(actor.name).toBe("Refreshed Name");
			expect(actor.isDirty).toBe(false);
			expect(client.actors.get).toHaveBeenCalledWith("existing-uid");
		});

		test("should throw for new entity", async () => {
			const client = createMockClient();
			const actor = ActorEntity._fromCreate(client, {
				type: "person",
				name: "Test",
			});

			await expect(actor.refresh()).rejects.toThrow(
				"Cannot refresh an entity that has not been saved",
			);
		});
	});

	describe("delete", () => {
		test("should delete from server", async () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "existing-uid",
				type: "person",
				name: "Test",
				email: null,
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-01T00:00:00Z",
			});

			await actor.delete();

			expect(client.actors.delete).toHaveBeenCalledWith("existing-uid");
			expect(actor.isNew).toBe(true); // Now unpersisted
		});

		test("should throw for new entity", async () => {
			const client = createMockClient();
			const actor = ActorEntity._fromCreate(client, {
				type: "person",
				name: "Test",
			});

			await expect(actor.delete()).rejects.toThrow(
				"Cannot delete an entity that has not been saved",
			);
		});
	});

	describe("date properties", () => {
		test("should return Date objects", () => {
			const client = createMockClient();
			const actor = ActorEntity._fromData(client, {
				uid: "uid",
				type: "person",
				name: "Test",
				email: null,
				description: null,
				metadata: {},
				created_at: "2024-01-01T00:00:00Z",
				verified: true,
				discovered_by: null,
				updated_at: "2024-01-02T00:00:00Z",
			});

			expect(actor.createdAt).toBeInstanceOf(Date);
			expect(actor.updatedAt).toBeInstanceOf(Date);
			expect(actor.createdAt.toISOString()).toBe("2024-01-01T00:00:00.000Z");
			expect(actor.updatedAt.toISOString()).toBe("2024-01-02T00:00:00.000Z");
		});
	});
});
