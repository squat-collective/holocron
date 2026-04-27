import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as WizardStoreModule from "./wizard-store";

/**
 * The store keeps `stack` and `idCounter` as module-level state — so we
 * use `vi.resetModules()` + a fresh dynamic import per test for isolation.
 * A side-benefit: `idCounter` resets to 0, which means the first opened
 * frame's id is deterministically "wiz-1" and we can target it without
 * needing access to the private snapshot.
 */
let store: typeof WizardStoreModule;

beforeEach(async () => {
	vi.resetModules();
	store = await import("./wizard-store");
});

describe("openWizard / closeWizard", () => {
	it("resolves the promise with the result passed to closeWizard", async () => {
		const promise = store.openWizard("confirm", {
			title: "Delete asset",
			description: "Are you sure?",
		});
		store.closeWizard("wiz-1", { confirmed: true });
		await expect(promise).resolves.toEqual({ confirmed: true });
	});

	it("resolves with null when closeWizard is called with no result (cancel)", async () => {
		const promise = store.openWizard("confirm", {
			title: "Hi",
			description: "Are you sure?",
		});
		store.closeWizard("wiz-1");
		await expect(promise).resolves.toBeNull();
	});

	it("ignores closeWizard for an unknown id without resolving", async () => {
		const promise = store.openWizard("confirm", {
			title: "Hi",
			description: "?",
		});
		store.closeWizard("wiz-999"); // no-op
		// Real close still works — the original promise is still pending.
		store.closeWizard("wiz-1", { confirmed: false });
		await expect(promise).resolves.toEqual({ confirmed: false });
	});

	it("opens multiple wizards concurrently and resolves each independently", async () => {
		const first = store.openWizard("confirm", {
			title: "First",
			description: "?",
		});
		const second = store.openWizard("confirm", {
			title: "Second",
			description: "?",
		});

		// Resolve them out of stack order — the second one first.
		store.closeWizard("wiz-2", { confirmed: true });
		await expect(second).resolves.toEqual({ confirmed: true });

		store.closeWizard("wiz-1");
		await expect(first).resolves.toBeNull();
	});

	it("ids increment monotonically across opens", async () => {
		const a = store.openWizard("confirm", { title: "A", description: "?" });
		const b = store.openWizard("confirm", { title: "B", description: "?" });
		const c = store.openWizard("confirm", { title: "C", description: "?" });

		// Confirm we know which id maps to which by closing in id order.
		store.closeWizard("wiz-1", { confirmed: true });
		store.closeWizard("wiz-2", { confirmed: false });
		store.closeWizard("wiz-3", { confirmed: true });

		const [r1, r2, r3] = await Promise.all([a, b, c]);
		expect(r1).toEqual({ confirmed: true });
		expect(r2).toEqual({ confirmed: false });
		expect(r3).toEqual({ confirmed: true });
	});
});

describe("openConfirmWizard helper", () => {
	it("returns true when the user confirms", async () => {
		const promise = store.openConfirmWizard({
			title: "Delete",
			description: "?",
		});
		store.closeWizard("wiz-1", { confirmed: true });
		await expect(promise).resolves.toBe(true);
	});

	it("returns false when the user cancels (closeWizard with no result)", async () => {
		const promise = store.openConfirmWizard({
			title: "Delete",
			description: "?",
		});
		store.closeWizard("wiz-1");
		await expect(promise).resolves.toBe(false);
	});

	it("returns false when the result has confirmed=false", async () => {
		const promise = store.openConfirmWizard({
			title: "Delete",
			description: "?",
		});
		store.closeWizard("wiz-1", { confirmed: false });
		await expect(promise).resolves.toBe(false);
	});
});

describe("convenience open* wrappers", () => {
	it("openCreateAssetWizard forwards params and round-trips a result", async () => {
		const promise = store.openCreateAssetWizard({ prefillName: "orders" });
		const result = { uid: "u1", name: "orders", type: "dataset" as const };
		store.closeWizard("wiz-1", result);
		await expect(promise).resolves.toEqual(result);
	});

	it("openCreateActorWizard works with empty defaults", async () => {
		const promise = store.openCreateActorWizard();
		store.closeWizard("wiz-1", {
			uid: "a1",
			name: "Leia",
			type: "person" as const,
		});
		await expect(promise).resolves.toEqual({
			uid: "a1",
			name: "Leia",
			type: "person",
		});
	});
});
