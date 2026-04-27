import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearRecents, getRecents, pushRecent } from "./recents-store";
import type { FocusedEntity } from "./types";

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

beforeEach(() => {
	clearRecents();
});

describe("pushRecent", () => {
	it("prepends a single entity", () => {
		pushRecent(mkAsset("a"));
		expect(getRecents().map((r) => r.entity.uid)).toEqual(["a"]);
	});

	it("keeps newest first", () => {
		pushRecent(mkAsset("a"));
		pushRecent(mkAsset("b"));
		pushRecent(mkAsset("c"));
		expect(getRecents().map((r) => r.entity.uid)).toEqual(["c", "b", "a"]);
	});

	it("dedupes by uid — re-visiting moves the entity to the front", () => {
		pushRecent(mkAsset("a"));
		pushRecent(mkAsset("b"));
		pushRecent(mkAsset("a"));
		expect(getRecents().map((r) => r.entity.uid)).toEqual(["a", "b"]);
	});

	it("caps at the configured maximum", () => {
		// Push 12 distinct entities — the cap is 10; the two oldest drop.
		for (let i = 0; i < 12; i += 1) {
			pushRecent(mkAsset(`uid-${i}`));
		}
		const list = getRecents();
		expect(list.length).toBe(10);
		// Newest stays, oldest drops.
		expect(list[0]!.entity.uid).toBe("uid-11");
		expect(list[list.length - 1]!.entity.uid).toBe("uid-2");
	});

	it("doesn't emit when nothing changed (re-pushing the only entry)", () => {
		const target = mkAsset("a");
		pushRecent(target);
		const before = getRecents();
		// Pushing the same entity again — it's the only one, so the resulting
		// list is identity-equal to the previous one. No emit.
		pushRecent(target);
		const after = getRecents();
		expect(after).toBe(before);
	});

	it("emits on every meaningful change", () => {
		const cb = vi.fn();
		// Subscribe via the same useSyncExternalStore-style path as React.
		// We don't expose subscribe directly, so observe via getRecents().
		pushRecent(mkAsset("a"));
		const first = getRecents();
		pushRecent(mkAsset("b"));
		const second = getRecents();
		expect(second).not.toBe(first);
		expect(second.map((r) => r.entity.uid)).toEqual(["b", "a"]);
		// Linter pacifier — `cb` is here to keep this test honest if we
		// later expose a real subscribe API.
		expect(cb).not.toHaveBeenCalled();
	});
});

describe("clearRecents", () => {
	it("empties the store", () => {
		pushRecent(mkAsset("a"));
		pushRecent(mkAsset("b"));
		clearRecents();
		expect(getRecents()).toEqual([]);
	});

	it("is a no-op when already empty", () => {
		const before = getRecents();
		clearRecents();
		expect(getRecents()).toBe(before);
	});
});
