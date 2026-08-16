import type { GraphCluster, GraphEdge } from "@squat-collective/holocron-ts";
import { describe, expect, it } from "vitest";
import { type AggregatedLink, EdgeIndex } from "./edge-index";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const edge = (source: string, target: string, type = "uses"): GraphEdge => ({
	id: `${source}-${type}-${target}`,
	source,
	target,
	type,
	lod: 0,
});

const cluster = (id: string, member_ids: string[]): GraphCluster => ({
	id,
	label: id.toUpperCase(),
	kind: "system",
	member_ids,
	centroid_x: 0,
	centroid_y: 0,
	centroid_z: 0,
	radius: 100,
	degree: member_ids.length,
	level: 0,
	parent_id: null,
});

/** Order-invariant link key for diff-friendly assertions. */
function linkKey(l: AggregatedLink): string {
	const [a, b] = l.source < l.target ? [l.source, l.target] : [l.target, l.source];
	return `${a}|${b}|${l.type}|${l.weight ?? ""}`;
}

function sortedKeys(links: AggregatedLink[]): string[] {
	return links.map(linkKey).sort();
}

// ---------------------------------------------------------------------------
// Three-cluster fixture used in many tests.
//   c1 = {a, b}   c2 = {c, d}   c3 = {e, f}
//   loose: g
//   edges: a→c, a→d, b→c, c→e, d→e, g→a, g→f, b→e (cross-cluster soup)
// ---------------------------------------------------------------------------

function buildIndex(): EdgeIndex {
	const clusterByNode = new Map<string, string | null>([
		["a", "c1"],
		["b", "c1"],
		["c", "c2"],
		["d", "c2"],
		["e", "c3"],
		["f", "c3"],
		["g", null],
	]);
	const clusters = [
		cluster("c1", ["a", "b"]),
		cluster("c2", ["c", "d"]),
		cluster("c3", ["e", "f"]),
	];
	const edges = [
		edge("a", "c"),
		edge("a", "d"),
		edge("b", "c"),
		edge("c", "e"),
		edge("d", "e"),
		edge("g", "a"),
		edge("g", "f"),
		edge("b", "e"),
	];
	const idx = new EdgeIndex();
	idx.setData(edges, clusterByNode, clusters);
	return idx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EdgeIndex.getLinks", () => {
	it("with no expansion / no surfacing — every cluster is a bubble", () => {
		const idx = buildIndex();
		idx.setState(new Set(), new Set());
		const links = idx.getLinks();

		// Every link should now be aggregated bubble↔X. Loose node `g` is
		// the only real node, so any links involving it touch a bubble.
		for (const l of links) {
			expect(l.type).toBe("aggregated");
		}

		// Specifically: c1↔c2 weight 3 (a-c, a-d, b-c), c1↔c3 weight 1 (b-e),
		// c2↔c3 weight 2 (c-e, d-e), g↔c1 weight 1 (g-a), g↔c3 weight 1 (g-f).
		expect(sortedKeys(links)).toEqual(
			[
				"__cluster__c1|__cluster__c2|aggregated|3",
				"__cluster__c1|__cluster__c3|aggregated|1",
				"__cluster__c1|g|aggregated|1",
				"__cluster__c2|__cluster__c3|aggregated|2",
				"__cluster__c3|g|aggregated|1",
			].sort(),
		);
	});

	it("expanding a cluster turns its inter-cluster edges into the new rep", () => {
		const idx = buildIndex();
		// Expand c1 → a + b are now real reps. c1↔c2 (weight 3) splits
		// into a↔__cluster__c2 (weight 2: a-c, a-d) and b↔__cluster__c2
		// (weight 1: b-c). c1↔c3 (weight 1) becomes b↔__cluster__c3.
		// g↔c1 (weight 1) becomes g↔a (real-real).
		idx.setState(new Set(["c1"]), new Set());
		expect(sortedKeys(idx.getLinks())).toEqual(
			[
				"__cluster__c2|a|aggregated|2",
				"__cluster__c2|b|aggregated|1",
				"__cluster__c2|__cluster__c3|aggregated|2",
				"__cluster__c3|b|aggregated|1",
				"__cluster__c3|g|aggregated|1",
				// Real↔real link surfaces: g↔a kept its underlying type.
				"a|g|uses|",
			].sort(),
		);
	});

	it("collapsing reverses the expansion exactly", () => {
		const idx = buildIndex();
		const baseline = sortedKeys(
			(() => {
				idx.setState(new Set(), new Set());
				return idx.getLinks();
			})(),
		);
		idx.setState(new Set(["c1"]), new Set());
		// Sanity: state changed.
		expect(sortedKeys(idx.getLinks())).not.toEqual(baseline);
		// Now collapse — should match the baseline byte-for-byte.
		idx.setState(new Set(), new Set());
		expect(sortedKeys(idx.getLinks())).toEqual(baseline);
	});

	it("surfacing a single node promotes its edges to direct, neighbours stay collapsed", () => {
		const idx = buildIndex();
		// Surface `a` with everything else collapsed. `a`'s edges
		// (a-c, a-d, g-a) split out: a↔c2 weight 2, a↔g real-real.
		// The remaining c1 member (`b`) keeps its edges aggregated:
		// b↔c2 weight 1 (b-c), b↔c3 weight 1 (b-e).
		idx.setState(new Set(), new Set(["a"]));
		expect(sortedKeys(idx.getLinks())).toEqual(
			[
				"__cluster__c1|__cluster__c2|aggregated|1", // b-c
				"__cluster__c1|__cluster__c3|aggregated|1", // b-e
				"__cluster__c2|__cluster__c3|aggregated|2", // c-e, d-e
				"__cluster__c2|a|aggregated|2", // a-c, a-d
				"__cluster__c3|g|aggregated|1", // g-f
				"a|g|uses|", // g-a real↔real
			].sort(),
		);
	});

	it("unsurfacing reverses the surface exactly", () => {
		const idx = buildIndex();
		const baseline = (() => {
			idx.setState(new Set(), new Set());
			return sortedKeys(idx.getLinks());
		})();
		idx.setState(new Set(), new Set(["a"]));
		idx.setState(new Set(), new Set());
		expect(sortedKeys(idx.getLinks())).toEqual(baseline);
	});

	it("real↔real edges between visible nodes preserve every underlying type", () => {
		const idx = new EdgeIndex();
		const clusterByNode = new Map<string, string | null>([
			["a", null],
			["b", null],
		]);
		// Two distinct relation types between the same two loose nodes.
		idx.setData(
			[edge("a", "b", "uses"), edge("a", "b", "owns")],
			clusterByNode,
			[],
		);
		idx.setState(new Set(), new Set());
		const links = idx.getLinks();
		expect(links).toHaveLength(2);
		expect(new Set(links.map((l) => l.type))).toEqual(
			new Set(["uses", "owns"]),
		);
	});

	it("expanding all clusters degenerates to one real link per underlying edge", () => {
		const idx = buildIndex();
		idx.setState(new Set(["c1", "c2", "c3"]), new Set());
		const links = idx.getLinks();
		// 8 underlying edges, all with both endpoints visible → 8 real links.
		expect(links).toHaveLength(8);
		for (const l of links) {
			expect(l.type).not.toBe("aggregated");
		}
	});

	it("self-loops between members of the same collapsed cluster are dropped", () => {
		// Two members in c1, with an edge between them. When c1 is
		// collapsed, both reps = __cluster__c1 → self-loop, skipped.
		const clusterByNode = new Map<string, string | null>([
			["a", "c1"],
			["b", "c1"],
		]);
		const idx = new EdgeIndex();
		idx.setData([edge("a", "b")], clusterByNode, [cluster("c1", ["a", "b"])]);
		idx.setState(new Set(), new Set());
		expect(idx.getLinks()).toEqual([]);
	});

	it("getLinks is cached until state changes", () => {
		const idx = buildIndex();
		idx.setState(new Set(), new Set());
		const first = idx.getLinks();
		const second = idx.getLinks();
		// Same array reference returned for repeat calls.
		expect(second).toBe(first);
		idx.setState(new Set(["c1"]), new Set());
		expect(idx.getLinks()).not.toBe(first);
	});
});

describe("EdgeIndex incremental ≡ from-scratch", () => {
	// Oracle: for a sequence of state transitions, the incremental
	// EdgeIndex must yield the same getLinks() result a fresh-from-data
	// EdgeIndex would yield for the final state. This is the headline
	// invariant — incremental is a perf optimisation, not a behaviour
	// change.

	it("after a long sequence of state flips, output equals a from-scratch build", () => {
		const idx = buildIndex();
		const transitions: { exp: string[]; sur: string[] }[] = [
			{ exp: [], sur: [] },
			{ exp: ["c1"], sur: [] },
			{ exp: ["c1", "c3"], sur: [] },
			{ exp: ["c3"], sur: ["a"] },
			{ exp: [], sur: ["a", "d"] },
			{ exp: ["c2"], sur: ["a"] },
			{ exp: [], sur: [] },
		];

		for (const t of transitions) {
			idx.setState(new Set(t.exp), new Set(t.sur));
			const incremental = sortedKeys(idx.getLinks());
			const fresh = buildIndex();
			fresh.setState(new Set(t.exp), new Set(t.sur));
			expect(incremental).toEqual(sortedKeys(fresh.getLinks()));
		}
	});
});
