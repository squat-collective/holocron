import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	clearExtensions,
	computeCommands,
	getExtensions,
	registerExtension,
} from "./registry";
import type { Extension, ExtensionContext } from "./types";

const ctx = (over: Partial<ExtensionContext> = {}): ExtensionContext => ({
	pathname: "/",
	focused: null,
	queryClient: null,
	recents: [],
	pins: [],
	...over,
});

const ext = (over: Partial<Extension>): Extension => ({
	id: "test",
	name: "Test",
	commands: () => [],
	...over,
});

beforeEach(() => {
	clearExtensions();
});

describe("registerExtension", () => {
	it("appends a new extension", () => {
		registerExtension(ext({ id: "a" }));
		registerExtension(ext({ id: "b" }));
		expect(getExtensions().map((e) => e.id)).toEqual(["a", "b"]);
	});

	it("replaces an extension with the same id (idempotent register)", () => {
		registerExtension(ext({ id: "a", name: "First" }));
		registerExtension(ext({ id: "a", name: "Second" }));
		expect(getExtensions()).toHaveLength(1);
		expect(getExtensions()[0]!.name).toBe("Second");
	});

	it("returns a disposer that removes the extension", () => {
		const dispose = registerExtension(ext({ id: "a" }));
		registerExtension(ext({ id: "b" }));
		dispose();
		expect(getExtensions().map((e) => e.id)).toEqual(["b"]);
	});
});

describe("computeCommands", () => {
	it("namespaces command ids with the extension id", () => {
		registerExtension(
			ext({
				id: "share",
				commands: () => [
					{ id: "copy-uid", label: "Copy UID", run: () => {} },
				],
			}),
		);
		const out = computeCommands(ctx());
		expect(out).toHaveLength(1);
		expect(out[0]!.id).toBe("share.copy-uid");
		expect(out[0]!.label).toBe("Copy UID");
	});

	it("skips extensions whose `when` returns false", () => {
		registerExtension(
			ext({
				id: "asset-only",
				when: (c) => c.focused?.kind === "asset",
				commands: () => [{ id: "x", label: "X", run: () => {} }],
			}),
		);
		expect(computeCommands(ctx())).toHaveLength(0);
		expect(
			computeCommands(
				ctx({
					focused: {
						kind: "asset",
						entity: { uid: "u", name: "n" } as never,
					},
				}),
			),
		).toHaveLength(1);
	});

	it("isolates a throwing extension — others still contribute", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		registerExtension(
			ext({
				id: "boom",
				commands: () => {
					throw new Error("nope");
				},
			}),
		);
		registerExtension(
			ext({
				id: "ok",
				commands: () => [{ id: "fine", label: "Fine", run: () => {} }],
			}),
		);
		const out = computeCommands(ctx());
		expect(out.map((c) => c.id)).toEqual(["ok.fine"]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("preserves command order across extensions", () => {
		registerExtension(
			ext({
				id: "a",
				commands: () => [
					{ id: "1", label: "A1", run: () => {} },
					{ id: "2", label: "A2", run: () => {} },
				],
			}),
		);
		registerExtension(
			ext({
				id: "b",
				commands: () => [{ id: "1", label: "B1", run: () => {} }],
			}),
		);
		expect(computeCommands(ctx()).map((c) => c.id)).toEqual([
			"a.1",
			"a.2",
			"b.1",
		]);
	});

	it("re-evaluates factories on each call (no caching)", () => {
		let n = 0;
		registerExtension(
			ext({
				id: "counter",
				commands: () => [
					{ id: `n-${n++}`, label: String(n), run: () => {} },
				],
			}),
		);
		expect(computeCommands(ctx())[0]!.id).toBe("counter.n-0");
		expect(computeCommands(ctx())[0]!.id).toBe("counter.n-1");
	});
});
