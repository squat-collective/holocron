import type { GraphCluster } from "@squat-collective/holocron-ts";
import { describe, expect, it } from "vitest";
import {
	type ExpansionInputs,
	computeExpansion,
	countVisible,
	scoreCluster,
} from "./cluster-budget";

const cluster = (overrides: Partial<GraphCluster> = {}): GraphCluster => ({
	id: "c1",
	label: "C1",
	kind: "system",
	member_ids: ["c1", "n1"],
	centroid_x: 0,
	centroid_y: 0,
	centroid_z: 0,
	radius: 100,
	degree: 1,
	level: 0,
	parent_id: null,
	...overrides,
});

const baseInput = (overrides: Partial<ExpansionInputs> = {}): ExpansionInputs => ({
	clusters: [],
	looseNodeCount: 0,
	// Default camera sits inside the auto-expand zone for the default
	// cluster (radius=100, expandFactor=6 → keep-zone=600). Tests that
	// want to exercise the zoom gate override this to push the camera
	// past the threshold.
	camera: { x: 0, y: 0, z: 100 },
	previous: new Set(),
	lastChange: new Map(),
	now: 1000,
	...overrides,
});

describe("scoreCluster", () => {
	it("rewards closer clusters", () => {
		const near = cluster({ centroid_z: 0, degree: 5 });
		const far = cluster({ centroid_z: 5000, degree: 5 });
		const cam = { x: 0, y: 0, z: 0 };
		expect(scoreCluster(near, cam)).toBeGreaterThan(scoreCluster(far, cam));
	});

	it("rewards higher-degree clusters at the same distance", () => {
		const small = cluster({ degree: 1 });
		const big = cluster({ degree: 50 });
		const cam = { x: 0, y: 0, z: 1000 };
		expect(scoreCluster(big, cam)).toBeGreaterThan(scoreCluster(small, cam));
	});

	it("does not blow up when the camera sits on the centroid", () => {
		const c = cluster({ degree: 10 });
		const cam = { x: 0, y: 0, z: 0 };
		const score = scoreCluster(c, cam);
		expect(Number.isFinite(score)).toBe(true);
		expect(score).toBeGreaterThan(0);
	});
});

describe("countVisible", () => {
	it("counts loose nodes + one per collapsed cluster + members per expanded", () => {
		const clusters = [
			cluster({ id: "c1", member_ids: ["a", "b", "c"] }),
			cluster({ id: "c2", member_ids: ["d", "e"] }),
		];
		expect(countVisible(clusters, 5, new Set())).toBe(5 + 2); // 5 loose + 2 bubbles
		expect(countVisible(clusters, 5, new Set(["c1"]))).toBe(5 + 3 + 1); // c1 expanded, c2 bubble
		expect(countVisible(clusters, 5, new Set(["c1", "c2"]))).toBe(5 + 3 + 2);
	});
});

describe("computeExpansion", () => {
	it("starts with everything collapsed when no previous state", () => {
		const clusters = Array.from({ length: 5 }, (_, i) =>
			cluster({ id: `c${i}`, member_ids: [`c${i}`, `n${i}`] }),
		);
		// looseNodeCount well under low water → expand pass kicks in,
		// but each cluster only adds 1 to visible (member_ids.length - 1).
		// With 5 clusters and 5 + 5 = 10 visible after expansion, all expand.
		const { expanded } = computeExpansion(
			baseInput({ clusters, looseNodeCount: 0 }),
		);
		expect(expanded.size).toBe(5);
	});

	it("does not expand past highWater in one pass", () => {
		// 30 small clusters, 6 members each = 30 bubbles collapsed (visible=30)
		// or 30*6 = 180 leaves expanded. lowWater=180, highWater=220.
		// Starting collapsed with visible=30 < lowWater → expand. Each
		// expansion adds 5 net (6 members - 1 bubble). Adding all 30 →
		// visible = 30 + 30*5 = 180 = lowWater. So all 30 should expand
		// since 180 ≤ 220.
		const clusters = Array.from({ length: 30 }, (_, i) =>
			cluster({
				id: `c${i}`,
				member_ids: Array.from({ length: 6 }, (_, j) => `n${i}-${j}`),
			}),
		);
		const { expanded } = computeExpansion(
			baseInput({ clusters, looseNodeCount: 0 }),
		);
		expect(expanded.size).toBe(30);
	});

	it("hysteresis: collapses only above highWater, expands only below lowWater", () => {
		// 50 clusters of 5 members each. Start with all expanded → visible 250.
		// 250 > highWater (220) → collapse pass should drop us toward lowWater.
		const clusters = Array.from({ length: 50 }, (_, i) =>
			cluster({
				id: `c${i}`,
				member_ids: Array.from({ length: 5 }, (_, j) => `n${i}-${j}`),
				degree: 50 - i, // descending so first ids have higher score
			}),
		);
		const previous = new Set(clusters.map((c) => c.id));
		const { expanded } = computeExpansion(
			baseInput({ clusters, looseNodeCount: 0, previous }),
		);
		// After collapse, visible should be ≤ lowWater (180), with the
		// lowest-priority clusters dropped first.
		const visible = countVisible(clusters, 0, expanded);
		expect(visible).toBeLessThanOrEqual(180);
		// And clusters by descending score (low-id first) should remain.
		expect(expanded.has("c0")).toBe(true);
		expect(expanded.has("c1")).toBe(true);
	});

	it("respects the sticky window for recently-changed clusters", () => {
		const clusters = [
			cluster({ id: "c0", member_ids: ["c0", "n0"] }),
			cluster({ id: "c1", member_ids: ["c1", "n1"] }),
		];
		// c0 just collapsed (within sticky), looseNodeCount=0 → visible=2
		// (two bubbles). lowWater=180 → expand pass tries to expand both.
		// c0 is sticky, only c1 should expand.
		const lastChange = new Map([["c0", 950]]);
		const { expanded } = computeExpansion(
			baseInput({
				clusters,
				looseNodeCount: 0,
				lastChange,
				now: 1000, // 50ms after c0 changed; well within stickyMs=500
			}),
		);
		expect(expanded.has("c0")).toBe(false);
		expect(expanded.has("c1")).toBe(true);
	});

	it("never auto-collapses pinned-open clusters", () => {
		const clusters = Array.from({ length: 50 }, (_, i) =>
			cluster({
				id: `c${i}`,
				member_ids: Array.from({ length: 5 }, (_, j) => `n${i}-${j}`),
			}),
		);
		const previous = new Set(clusters.map((c) => c.id));
		const pinnedOpen = new Set(["c0"]); // user explicitly opened c0
		const { expanded } = computeExpansion(
			baseInput({
				clusters,
				looseNodeCount: 0,
				previous,
				pinnedOpen,
			}),
		);
		expect(expanded.has("c0")).toBe(true); // survived the collapse pass
	});

	it("drops cluster ids no longer in the input list", () => {
		const clusters = [cluster({ id: "c1" })];
		const previous = new Set(["c1", "c-deleted"]);
		const { expanded } = computeExpansion(
			baseInput({ clusters, previous }),
		);
		expect(expanded.has("c-deleted")).toBe(false);
	});

	it("zoom gate keeps clusters collapsed when camera is too far", () => {
		const clusters = [
			cluster({ id: "c-far", radius: 50, centroid_z: 0 }),
		];
		// expandFactor=6 → keep-zone for radius=50 is 300. Camera at
		// distance 5000 is well outside → no auto-expansion regardless
		// of how much budget is free.
		const { expanded } = computeExpansion(
			baseInput({
				clusters,
				camera: { x: 0, y: 0, z: 5000 },
			}),
		);
		expect(expanded.has("c-far")).toBe(false);
	});

	it("zoom gate auto-collapses a cluster when camera moves far away", () => {
		const clusters = [
			cluster({
				id: "c1",
				member_ids: ["c1", "n1", "n2"],
				radius: 50,
			}),
		];
		// previous: c1 was expanded close-up; now camera is far enough
		// that even hysteresis (collapseFactor=9 → 450) doesn't save it.
		const { expanded, changed } = computeExpansion(
			baseInput({
				clusters,
				previous: new Set(["c1"]),
				camera: { x: 0, y: 0, z: 5000 },
			}),
		);
		expect(expanded.has("c1")).toBe(false);
		expect(changed.has("c1")).toBe(true);
	});

	it("zoom gate has hysteresis between expand and collapse", () => {
		// Camera at distance 350 from a radius-50 cluster:
		//   - expand zone   = 50 * 6 = 300 → 350 > 300 → would NOT auto-expand
		//   - collapse zone = 50 * 9 = 450 → 350 < 450 → keeps existing expansion
		// This is the hysteresis band: previously-expanded stays open,
		// previously-collapsed stays closed.
		const clusters = [cluster({ id: "c1", radius: 50, centroid_z: 0 })];
		const camera = { x: 0, y: 0, z: 350 };

		const fromExpanded = computeExpansion(
			baseInput({ clusters, previous: new Set(["c1"]), camera }),
		);
		expect(fromExpanded.expanded.has("c1")).toBe(true);

		const fromCollapsed = computeExpansion(
			baseInput({ clusters, previous: new Set(), camera }),
		);
		expect(fromCollapsed.expanded.has("c1")).toBe(false);
	});

	it("pinned-open clusters bypass the zoom gate", () => {
		const clusters = [cluster({ id: "c-far", radius: 50 })];
		// Camera way outside the keep-zone. Without pinning, this would
		// stay collapsed (or auto-collapse). Pinned-open survives.
		const { expanded } = computeExpansion(
			baseInput({
				clusters,
				camera: { x: 0, y: 0, z: 5000 },
				pinnedOpen: new Set(["c-far"]),
			}),
		);
		expect(expanded.has("c-far")).toBe(true);
	});

	it("prefers in-frustum candidates in the expand pass", () => {
		// Both clusters have equal score (same camera distance + degree).
		// With a tight budget allowing only one expansion, c-near should
		// win because it's the only one in the frustum.
		const clusters = [
			cluster({
				id: "c-near",
				member_ids: Array.from({ length: 6 }, (_, j) => `near-${j}`),
				centroid_z: 100,
				degree: 5,
			}),
			cluster({
				id: "c-far",
				member_ids: Array.from({ length: 6 }, (_, j) => `far-${j}`),
				centroid_z: 100,
				degree: 5,
			}),
		];
		const inFrustum = new Set(["c-near"]);
		// 2 bubbles visible at start (looseNodeCount=0). Expanding one
		// cluster adds 5 (6 members - 1 bubble) → 7. Expanding both → 12.
		// highWater=10 admits one expansion but not the second.
		const { expanded } = computeExpansion(
			baseInput({
				clusters,
				looseNodeCount: 0,
				inFrustum,
				config: { lowWater: 10, highWater: 10, stickyMs: 500 },
			}),
		);
		expect(expanded.has("c-near")).toBe(true);
		expect(expanded.has("c-far")).toBe(false);
	});
});
