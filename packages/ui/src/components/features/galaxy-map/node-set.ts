/**
 * NodeSet — incremental visible-node + bubble tracker for the galaxy
 * map. Companion to `EdgeIndex` (incremental edges) and `frustum.ts`
 * (camera-driven culling). The trio replaces the original O(N + E)
 * graphData rebuild on every state change with O(changed) work.
 *
 * The library wants two arrays per render: real nodes and cluster
 * bubbles. NodeSet keeps those arrays implicit as id-keyed maps and
 * mutates only the entries affected by a state transition:
 *
 *   - **Cluster expand:** the cluster's members enter `visibleNodes`;
 *     its bubble leaves `visibleBubbles`.
 *   - **Cluster collapse:** the cluster's non-surfaced members leave
 *     `visibleNodes`; its bubble re-enters `visibleBubbles`.
 *   - **Node surface:** if the node sits behind a collapsed cluster
 *     bubble, it enters `visibleNodes` while the bubble stays.
 *   - **Node un-surface:** the reverse, when the cluster is still
 *     collapsed.
 *
 * The full FgNode + FgClusterBubble shapes are cached once on
 * `setData` so subsequent transitions are pure pointer juggling — no
 * per-state-change allocations beyond the small added/removed lists.
 *
 * `getRealNodes()` and `getBubbles()` return cached arrays that the
 * scene hands directly to `3d-force-graph.graphData(...)`. The cache
 * invalidates only when state actually changes.
 */

import type {
	GraphCluster,
	GraphMap,
	GraphNode,
} from "@squat-collective/holocron-ts";

// ---------------------------------------------------------------------------
// Public shapes — kept structurally compatible with the FgNode /
// FgClusterBubble exported by `galaxy-scene.tsx` without importing them
// (avoids a circular dep).
// ---------------------------------------------------------------------------

export interface NodeSetPalette {
	dataset: string;
	report: string;
	process: string;
	system: string;
	person: string;
	group: string;
	rule_info: string;
	rule_warning: string;
	rule_critical: string;
}

export interface FgNodeShape extends GraphNode {
	fx: number;
	fy: number;
	fz: number;
	val: number;
	color: string;
}

export interface FgBubbleShape {
	id: string;
	fx: number;
	fy: number;
	fz: number;
	val: number;
	color: string;
	_bubble: true;
	_clusterId: string;
	_clusterLabel: string;
	_clusterKind: GraphCluster["kind"];
	_memberCount: number;
	_degree: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface SetDiff<T> {
	added: T[];
	removed: T[];
}

function diffSets<T>(
	previous: ReadonlySet<T>,
	next: ReadonlySet<T>,
): SetDiff<T> {
	const added: T[] = [];
	const removed: T[] = [];
	for (const v of next) if (!previous.has(v)) added.push(v);
	for (const v of previous) if (!next.has(v)) removed.push(v);
	return { added, removed };
}

function colorFor(n: GraphNode, palette: NodeSetPalette): string {
	if (n.kind === "asset") {
		switch (n.subtype) {
			case "dataset":
				return palette.dataset;
			case "report":
				return palette.report;
			case "process":
				return palette.process;
			case "system":
				return palette.system;
		}
	}
	if (n.kind === "actor") {
		return n.subtype === "group" ? palette.group : palette.person;
	}
	if (n.kind === "rule") {
		switch (n.subtype) {
			case "critical":
				return palette.rule_critical;
			case "warning":
				return palette.rule_warning;
			default:
				return palette.rule_info;
		}
	}
	return "#888";
}

// ---------------------------------------------------------------------------
// NodeSet
// ---------------------------------------------------------------------------

export class NodeSet {
	// --- Static input snapshot (refreshed on setData) -------------------
	private clusterByNode = new Map<string, string | null | undefined>();
	private clusterMembers = new Map<string, string[]>();
	private clusters: GraphCluster[] = [];
	private nodeMap = new Map<string, FgNodeShape>();
	private bubbleMap = new Map<string, FgBubbleShape>();
	private looseIds: string[] = [];

	// --- Live state -----------------------------------------------------
	private visibleNodes = new Map<string, FgNodeShape>();
	private visibleBubbles = new Map<string, FgBubbleShape>();
	private expanded = new Set<string>();
	private surfaced = new Set<string>();
	private initialized = false;

	// --- Output cache ---------------------------------------------------
	private cachedRealArray: FgNodeShape[] | null = null;
	private cachedBubbleArray: FgBubbleShape[] | null = null;

	/**
	 * Replace the underlying data. All node + bubble shapes are
	 * pre-baked here so `setState` only juggles map entries; nothing
	 * allocates per state change.
	 */
	setData(graph: GraphMap, palette: NodeSetPalette): void {
		this.clusters = [...(graph.clusters ?? [])];
		this.clusterMembers = new Map();
		for (const c of this.clusters) {
			this.clusterMembers.set(c.id, [...c.member_ids]);
		}
		this.clusterByNode = new Map();
		this.looseIds = [];
		for (const n of graph.nodes) {
			this.clusterByNode.set(n.id, n.cluster_id);
			if (!n.cluster_id) this.looseIds.push(n.id);
		}
		// Pre-bake every FgNode + FgBubble exactly once.
		this.nodeMap = new Map();
		for (const n of graph.nodes) {
			this.nodeMap.set(n.id, {
				...n,
				fx: n.x,
				fy: n.y,
				fz: n.z,
				val: n.size,
				color: colorFor(n, palette),
			});
		}
		this.bubbleMap = new Map();
		for (const c of this.clusters) {
			const bubbleId = `__cluster__${c.id}`;
			this.bubbleMap.set(bubbleId, {
				id: bubbleId,
				fx: c.centroid_x,
				fy: c.centroid_y,
				fz: c.centroid_z,
				val: 4 + Math.log1p(c.member_ids.length) * 4,
				color: c.kind === "system" ? palette.system : palette.group,
				_bubble: true,
				_clusterId: c.id,
				_clusterLabel: c.label,
				_clusterKind: c.kind,
				_memberCount: c.member_ids.length,
				_degree: c.degree,
			});
		}
		// Reset live state — `setState` repopulates from current
		// expansion + surfaced sets.
		this.visibleNodes = new Map();
		this.visibleBubbles = new Map();
		this.expanded = new Set();
		this.surfaced = new Set();
		this.initialized = false;
		this.cachedRealArray = null;
		this.cachedBubbleArray = null;
	}

	/**
	 * Apply a new expansion + surfaced set. Touches only nodes whose
	 * visibility changed; loose nodes never move.
	 */
	setState(
		expanded: ReadonlySet<string>,
		surfaced: ReadonlySet<string>,
	): void {
		if (!this.initialized) {
			this.expanded = new Set(expanded);
			this.surfaced = new Set(surfaced);
			this.initFromScratch();
			return;
		}

		const expDiff = diffSets(this.expanded, expanded);
		const surDiff = diffSets(this.surfaced, surfaced);

		this.expanded = new Set(expanded);
		this.surfaced = new Set(surfaced);

		// Cluster expand: members in, bubble out.
		for (const cid of expDiff.added) {
			const members = this.clusterMembers.get(cid) ?? [];
			for (const mid of members) {
				const fg = this.nodeMap.get(mid);
				if (fg) this.visibleNodes.set(mid, fg);
			}
			this.visibleBubbles.delete(`__cluster__${cid}`);
		}
		// Cluster collapse: non-surfaced members out, bubble in.
		for (const cid of expDiff.removed) {
			const members = this.clusterMembers.get(cid) ?? [];
			for (const mid of members) {
				if (this.surfaced.has(mid)) continue;
				this.visibleNodes.delete(mid);
			}
			const bubble = this.bubbleMap.get(`__cluster__${cid}`);
			if (bubble) this.visibleBubbles.set(bubble.id, bubble);
		}
		// Surface a node behind a collapsed bubble: in.
		for (const id of surDiff.added) {
			const cid = this.clusterByNode.get(id);
			if (!cid) continue; // loose: already visible
			if (this.expanded.has(cid)) continue; // already visible via expansion
			const fg = this.nodeMap.get(id);
			if (fg) this.visibleNodes.set(id, fg);
		}
		// Un-surface: out, unless cluster is now expanded.
		for (const id of surDiff.removed) {
			const cid = this.clusterByNode.get(id);
			if (!cid) continue;
			if (this.expanded.has(cid)) continue;
			this.visibleNodes.delete(id);
		}

		this.cachedRealArray = null;
		this.cachedBubbleArray = null;
	}

	/**
	 * Real nodes currently in the visible set. Cached until the next
	 * `setState` / `setData`. Stable references for unchanged ids
	 * across calls.
	 */
	getRealNodes(): FgNodeShape[] {
		if (this.cachedRealArray) return this.cachedRealArray;
		if (!this.initialized) this.initFromScratch();
		this.cachedRealArray = [...this.visibleNodes.values()];
		return this.cachedRealArray;
	}

	/** Cluster bubbles currently in the visible set. Cached. */
	getBubbles(): FgBubbleShape[] {
		if (this.cachedBubbleArray) return this.cachedBubbleArray;
		if (!this.initialized) this.initFromScratch();
		this.cachedBubbleArray = [...this.visibleBubbles.values()];
		return this.cachedBubbleArray;
	}

	/** Lookup by id across both real nodes and bubbles. */
	findById(id: string): FgNodeShape | FgBubbleShape | null {
		return this.nodeMap.get(id) ?? this.bubbleMap.get(id) ?? null;
	}

	/** Synthesize an FgNode for ids that may not be currently visible. */
	getFgNode(id: string): FgNodeShape | null {
		return this.nodeMap.get(id) ?? null;
	}

	// =========================================================================
	// Internals
	// =========================================================================

	private initFromScratch(): void {
		this.visibleNodes = new Map();
		this.visibleBubbles = new Map();
		// Loose nodes are always visible.
		for (const id of this.looseIds) {
			const fg = this.nodeMap.get(id);
			if (fg) this.visibleNodes.set(id, fg);
		}
		// Per-cluster: expanded → members in (no bubble), collapsed →
		// bubble in (members out unless surfaced).
		for (const c of this.clusters) {
			const bubbleId = `__cluster__${c.id}`;
			if (this.expanded.has(c.id)) {
				for (const mid of c.member_ids) {
					const fg = this.nodeMap.get(mid);
					if (fg) this.visibleNodes.set(mid, fg);
				}
			} else {
				const bubble = this.bubbleMap.get(bubbleId);
				if (bubble) this.visibleBubbles.set(bubbleId, bubble);
				for (const mid of c.member_ids) {
					if (!this.surfaced.has(mid)) continue;
					const fg = this.nodeMap.get(mid);
					if (fg) this.visibleNodes.set(mid, fg);
				}
			}
		}
		this.initialized = true;
		this.cachedRealArray = null;
		this.cachedBubbleArray = null;
	}
}
