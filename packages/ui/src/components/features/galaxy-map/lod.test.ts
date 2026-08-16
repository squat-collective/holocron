import { describe, expect, it } from "vitest";
import {
	computeLabelOpacity,
	FOCUS_ALPHA,
	focusTierFor,
} from "./lod";

describe("computeLabelOpacity", () => {
	it("returns the full tier alpha when below dNear", () => {
		expect(
			computeLabelOpacity({
				distance: 100,
				degree: 0,
				focusTier: "seed",
			}),
		).toBe(1);
		expect(
			computeLabelOpacity({
				distance: 100,
				degree: 0,
				focusTier: "neighbour",
			}),
		).toBeCloseTo(FOCUS_ALPHA.neighbour);
		expect(
			computeLabelOpacity({
				distance: 100,
				degree: 0,
				focusTier: "unfocused",
			}),
		).toBeCloseTo(FOCUS_ALPHA.unfocused);
	});

	it("returns 0 well past the far threshold for a leaf", () => {
		expect(
			computeLabelOpacity({
				distance: 5000,
				degree: 0,
				focusTier: "unfocused",
			}),
		).toBe(0);
	});

	it("hubs hold their label alive past the leaf far threshold", () => {
		const leaf = computeLabelOpacity({
			distance: 1700,
			degree: 0,
			focusTier: "unfocused",
		});
		const hub = computeLabelOpacity({
			distance: 1700,
			degree: 50,
			focusTier: "unfocused",
		});
		expect(leaf).toBe(0);
		expect(hub).toBeGreaterThan(0.3);
	});

	it("lerps linearly between near and far", () => {
		const near = computeLabelOpacity({
			distance: 600,
			degree: 0,
			focusTier: "unfocused",
		});
		const half = computeLabelOpacity({
			distance: 1050,
			degree: 0,
			focusTier: "unfocused",
		});
		const far = computeLabelOpacity({
			distance: 1500,
			degree: 0,
			focusTier: "unfocused",
		});
		expect(near).toBeCloseTo(FOCUS_ALPHA.unfocused);
		expect(half).toBeCloseTo(FOCUS_ALPHA.unfocused * 0.5, 1);
		expect(far).toBe(0);
	});

	it("'other' tier dims via the distance ramp scaled by its tier alpha", () => {
		// 0.12 cap × full distance alpha when up close — still faint.
		const close = computeLabelOpacity({
			distance: 0,
			degree: 0,
			focusTier: "other",
		});
		expect(close).toBeCloseTo(FOCUS_ALPHA.other);
		expect(close).toBeLessThan(0.2);
		// Far away the multiplier zeroes it out — no label at all.
		const far = computeLabelOpacity({
			distance: 5000,
			degree: 0,
			focusTier: "other",
		});
		expect(far).toBe(0);
	});

	it("focused (seed) labels ignore distance LOD", () => {
		// When the user has locked or hovered a node, its label should
		// stay readable at any zoom — they pointed at it directly.
		const close = computeLabelOpacity({
			distance: 0,
			degree: 0,
			focusTier: "seed",
		});
		const far = computeLabelOpacity({
			distance: 5000,
			degree: 0,
			focusTier: "seed",
		});
		expect(close).toBe(FOCUS_ALPHA.seed);
		expect(far).toBe(FOCUS_ALPHA.seed);
	});

	it("neighbour (1-hop) labels respect distance LOD", () => {
		// Hover at zoom-out shouldn't force every 1-hop neighbour label
		// to pop to full alpha — that's the bug "all nodes appear on
		// hover" referred to. Neighbours fade with distance like
		// unfocused does, just at a reduced tier alpha.
		const close = computeLabelOpacity({
			distance: 0,
			degree: 0,
			focusTier: "neighbour",
		});
		const far = computeLabelOpacity({
			distance: 5000,
			degree: 0,
			focusTier: "neighbour",
		});
		expect(close).toBeCloseTo(FOCUS_ALPHA.neighbour);
		expect(far).toBe(0);
	});
});

describe("focusTierFor", () => {
	const adjacency = new Map<string, ReadonlySet<string>>([
		["a", new Set(["b", "c"])],
		["b", new Set(["a"])],
		["c", new Set(["a"])],
		["d", new Set()],
	]);

	it("returns 'unfocused' when no seeds", () => {
		expect(focusTierFor("a", null, adjacency)).toBe("unfocused");
		expect(focusTierFor("a", new Set(), adjacency)).toBe("unfocused");
	});

	it("returns 'seed' for a seed node", () => {
		expect(focusTierFor("a", new Set(["a"]), adjacency)).toBe("seed");
	});

	it("returns 'neighbour' for a 1-hop neighbour", () => {
		expect(focusTierFor("b", new Set(["a"]), adjacency)).toBe("neighbour");
		expect(focusTierFor("c", new Set(["a"]), adjacency)).toBe("neighbour");
	});

	it("returns 'other' for nodes outside the focus set", () => {
		expect(focusTierFor("d", new Set(["a"]), adjacency)).toBe("other");
	});

	it("seed wins over neighbour when both apply", () => {
		// `a` and `b` are both seeds. Even though `b` is a 1-hop neighbour
		// of `a`, it should still report as a seed.
		expect(focusTierFor("b", new Set(["a", "b"]), adjacency)).toBe("seed");
	});
});
