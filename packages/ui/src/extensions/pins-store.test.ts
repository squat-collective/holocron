import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FocusedEntity } from "./types";

const STORAGE_KEY = "holocron.pins.v1";

const mkAsset = (uid: string, name: string = uid): FocusedEntity => ({
	kind: "asset",
	entity: {
		uid,
		name,
		type: "dataset",
		description: null,
		location: null,
		status: "active",
		metadata: {},
		created_at: "2026-04-25T00:00:00Z",
		updated_at: "2026-04-25T00:00:00Z",
	},
});

/**
 * Module-level state in pins-store needs a fresh import per test to
 * isolate the hydrate-once flag — same trick wizard-store.test.ts uses.
 */
let store: typeof import("./pins-store");

beforeEach(async () => {
	window.localStorage.clear();
	vi.resetModules();
	store = await import("./pins-store");
});

afterEach(() => {
	window.localStorage.clear();
});

describe("addPin / removePin", () => {
	it("adds a pin", () => {
		store.addPin(mkAsset("a"));
		expect(store.getPins().map((p) => p.entity.uid)).toEqual(["a"]);
	});

	it("dedupes — adding the same uid is a no-op", () => {
		store.addPin(mkAsset("a"));
		store.addPin(mkAsset("a", "renamed"));
		expect(store.getPins()).toHaveLength(1);
		// First-write-wins so the user's original pin isn't silently mutated.
		expect(store.getPins()[0]!.entity.name).toBe("a");
	});

	it("removes a pin by uid", () => {
		store.addPin(mkAsset("a"));
		store.addPin(mkAsset("b"));
		store.removePin("a");
		expect(store.getPins().map((p) => p.entity.uid)).toEqual(["b"]);
	});

	it("isPinned reflects current state", () => {
		expect(store.isPinned("a")).toBe(false);
		store.addPin(mkAsset("a"));
		expect(store.isPinned("a")).toBe(true);
		store.removePin("a");
		expect(store.isPinned("a")).toBe(false);
	});
});

describe("persistence", () => {
	it("writes to localStorage on add", () => {
		store.addPin(mkAsset("a"));
		const raw = window.localStorage.getItem(STORAGE_KEY);
		expect(raw).toBeTruthy();
		const parsed = JSON.parse(raw!);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].entity.uid).toBe("a");
	});

	it("hydrates from localStorage on first read", async () => {
		// Seed storage *before* the module is imported.
		window.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify([mkAsset("seeded")]),
		);
		vi.resetModules();
		const fresh = await import("./pins-store");
		expect(fresh.getPins().map((p) => p.entity.uid)).toEqual(["seeded"]);
	});

	it("treats corrupt JSON as empty (doesn't throw)", async () => {
		window.localStorage.setItem(STORAGE_KEY, "{not valid json");
		vi.resetModules();
		const fresh = await import("./pins-store");
		expect(fresh.getPins()).toEqual([]);
	});

	it("drops items that fail the shape check", async () => {
		window.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify([
				mkAsset("good"),
				{ kind: "garbage" }, // bad
				{ kind: "asset", entity: { uid: 42 } }, // bad uid type
			]),
		);
		vi.resetModules();
		const fresh = await import("./pins-store");
		expect(fresh.getPins().map((p) => p.entity.uid)).toEqual(["good"]);
	});
});

describe("clearPins", () => {
	it("empties the store and storage", () => {
		store.addPin(mkAsset("a"));
		store.clearPins();
		expect(store.getPins()).toEqual([]);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe("[]");
	});

	it("is a no-op when already empty", () => {
		const before = store.getPins();
		store.clearPins();
		expect(store.getPins()).toBe(before);
	});
});
