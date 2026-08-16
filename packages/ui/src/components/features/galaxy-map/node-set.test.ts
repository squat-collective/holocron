import type { GraphCluster, GraphMap, GraphNode } from "@squat-collective/holocron-ts";
import { describe, expect, it } from "vitest";
import { NodeSet, type NodeSetPalette } from "./node-set";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const palette: NodeSetPalette = {
	dataset: "#ds",
	report: "#rp",
	process: "#pr",
	system: "#sy",
	person: "#pe",
	group: "#gr",
	rule_info: "#ri",
	rule_warning: "#rw",
	rule_critical: "#rc",
};

const node = (id: string, cluster_id: string | null = null): GraphNode => ({
	id,
	label: id.toUpperCase(),
	kind: "asset",
	subtype: "dataset",
	lod: 1,
	x: 0,
	y: 0,
	z: 0,
	degree: 0,
	size: 5,
	cluster_id,
});

const cluster = (id: string, member_ids: string[]): GraphCluster => ({
	id,
	label: id,
	kind: "system",
	member_ids,
	centroid_x: 0,
	centroid_y: 0,
	centroid_z: 0,
	radius: 50,
	degree: member_ids.length,
	level: 0,
	parent_id: null,
});

function buildSet(): NodeSet {
	const nodes: GraphNode[] = [
		node("a", "c1"),
		node("b", "c1"),
		node("c", "c2"),
		node("d", "c2"),
		node("loose"),
	];
	const clusters = [
		cluster("c1", ["a", "b"]),
		cluster("c2", ["c", "d"]),
	];
	const graph: GraphMap = {
		lod: 1,
		nodes,
		clusters,
		edges: [],
		bounds: [0, 0, 0, 0, 0, 0],
	};
	const set = new NodeSet();
	set.setData(graph, palette);
	return set;
}

const idsOf = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NodeSet — initial state", () => {
	it("with all clusters collapsed: bubbles + loose only", () => {
		const set = buildSet();
		set.setState(new Set(), new Set());
		expect(idsOf(set.getRealNodes())).toEqual(["loose"]);
		expect(idsOf(set.getBubbles())).toEqual(["__cluster__c1", "__cluster__c2"]);
	});

	it("with all clusters expanded: every member visible, no bubbles", () => {
		const set = buildSet();
		set.setState(new Set(["c1", "c2"]), new Set());
		expect(idsOf(set.getRealNodes())).toEqual(["a", "b", "c", "d", "loose"]);
		expect(set.getBubbles()).toEqual([]);
	});

	it("surfacing a member of a collapsed cluster brings it out without removing the bubble", () => {
		const set = buildSet();
		set.setState(new Set(), new Set(["a"]));
		expect(idsOf(set.getRealNodes())).toEqual(["a", "loose"]);
		expect(idsOf(set.getBubbles())).toEqual(["__cluster__c1", "__cluster__c2"]);
	});
});

describe("NodeSet — incremental transitions", () => {
	it("expand → collapse round-trips exactly", () => {
		const set = buildSet();
		set.setState(new Set(), new Set());
		const baseline = {
			nodes: idsOf(set.getRealNodes()),
			bubbles: idsOf(set.getBubbles()),
		};
		set.setState(new Set(["c1"]), new Set());
		expect(idsOf(set.getRealNodes())).toEqual(["a", "b", "loose"]);
		expect(idsOf(set.getBubbles())).toEqual(["__cluster__c2"]);
		set.setState(new Set(), new Set());
		expect({
			nodes: idsOf(set.getRealNodes()),
			bubbles: idsOf(set.getBubbles()),
		}).toEqual(baseline);
	});

	it("surfacing then collapsing the cluster keeps the surfaced node visible", () => {
		const set = buildSet();
		set.setState(new Set(["c1"]), new Set(["a"]));
		// c1 expanded → a, b real (surfaced is a no-op for them).
		expect(idsOf(set.getRealNodes())).toEqual(["a", "b", "loose"]);

		set.setState(new Set(), new Set(["a"]));
		// c1 collapsed → b drops back behind the bubble; a stays
		// visible because it's surfaced.
		expect(idsOf(set.getRealNodes())).toEqual(["a", "loose"]);
		expect(idsOf(set.getBubbles())).toEqual(["__cluster__c1", "__cluster__c2"]);
	});

	it("un-surfacing a node behind a collapsed cluster removes it", () => {
		const set = buildSet();
		set.setState(new Set(), new Set(["a"]));
		expect(idsOf(set.getRealNodes())).toContain("a");
		set.setState(new Set(), new Set());
		expect(idsOf(set.getRealNodes())).toEqual(["loose"]);
	});
});

describe("NodeSet — output cache + lookups", () => {
	it("getRealNodes returns the same array reference until state changes", () => {
		const set = buildSet();
		set.setState(new Set(), new Set());
		const a = set.getRealNodes();
		const b = set.getRealNodes();
		expect(a).toBe(b);
		set.setState(new Set(["c1"]), new Set());
		expect(set.getRealNodes()).not.toBe(a);
	});

	it("findById resolves both real nodes and bubbles regardless of visibility", () => {
		const set = buildSet();
		set.setState(new Set(), new Set());
		expect(set.findById("a")?.id).toBe("a"); // a is behind a bubble — still resolvable
		expect(set.findById("__cluster__c1")?.id).toBe("__cluster__c1");
		expect(set.findById("nope")).toBeNull();
	});

	it("getFgNode returns a stable reference for the same id", () => {
		const set = buildSet();
		const a1 = set.getFgNode("a");
		const a2 = set.getFgNode("a");
		expect(a1).toBe(a2);
	});
});

describe("NodeSet — incremental ≡ from-scratch", () => {
	it("after a sequence of state flips, output matches a fresh-from-data instance", () => {
		const set = buildSet();
		const transitions: { exp: string[]; sur: string[] }[] = [
			{ exp: [], sur: [] },
			{ exp: ["c1"], sur: [] },
			{ exp: ["c1"], sur: ["d"] },
			{ exp: [], sur: ["a", "d"] },
			{ exp: ["c2"], sur: ["a"] },
			{ exp: [], sur: [] },
		];
		for (const t of transitions) {
			set.setState(new Set(t.exp), new Set(t.sur));
			const incrementalNodes = idsOf(set.getRealNodes());
			const incrementalBubbles = idsOf(set.getBubbles());
			const fresh = buildSet();
			fresh.setState(new Set(t.exp), new Set(t.sur));
			expect(incrementalNodes).toEqual(idsOf(fresh.getRealNodes()));
			expect(incrementalBubbles).toEqual(idsOf(fresh.getBubbles()));
		}
	});
});
