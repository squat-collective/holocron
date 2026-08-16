/**
 * EdgeIndex — incremental edge-aggregation engine for the galaxy map.
 *
 * The renderer needs a list of `FgLink`s every time the visible set
 * changes (cluster expand/collapse, individual node surface). The
 * naïve approach (and what the scene used to do) was to re-walk every
 * underlying graph edge on every state change — O(E) per hover at the
 * worst, which is the cost the plan called out for Phase 3.
 *
 * This module keeps a live "rep-pair" index that mutates incrementally:
 *
 *   - For each node id we know its current "representative" — either
 *     its own id (when the node is visible: loose, cluster-expanded,
 *     or individually surfaced) or `__cluster__<cid>` when it sits
 *     behind a collapsed cluster bubble.
 *   - For each ordered pair of reps we keep a "bin" of underlying
 *     edges. When emitting links, real↔real bins explode back to one
 *     `FgLink` per underlying edge (so different relation types
 *     between the same two nodes stay distinct); bubble-touching
 *     bins collapse into a single aggregated link with `weight` =
 *     number of underlying edges.
 *
 * State changes (`setState`) compute the delta of affected nodes (the
 * cluster members on either side of an expand/collapse, plus any
 * surfaced ids that flipped) and migrate just those nodes' edges
 * from one bin to another. Total work is O(degree(affected)), not
 * O(E).
 *
 * The output of `getLinks()` is cached and only regenerated when the
 * state actually changed — so repeated reads with no state change are
 * free.
 */

import type {
	GraphCluster,
	GraphEdge,
} from "@squat-collective/holocron-ts";

// ---------------------------------------------------------------------------
// Output shape — kept structurally compatible with FgLink in galaxy-scene
// without importing it (avoids a circular dep). Anything `FgLink` adds
// beyond {source, target, type, weight?} is layered on by the consumer.
// ---------------------------------------------------------------------------

export interface AggregatedLink {
	source: string;
	target: string;
	type: string;
	weight?: number;
}

// ---------------------------------------------------------------------------
// Internal pair key — order-invariant so (A,B) and (B,A) merge.
// ---------------------------------------------------------------------------

function pairKey(a: string, b: string): string {
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface EdgeBin {
	/** Canonical (lexicographic min) rep — first half of the pair key. */
	first: string;
	/** Canonical (lexicographic max) rep — second half of the pair key. */
	second: string;
	/** Underlying edges currently grouped into this pair. */
	edges: Set<GraphEdge>;
}

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

// ---------------------------------------------------------------------------
// EdgeIndex
// ---------------------------------------------------------------------------

export class EdgeIndex {
	// --- Static input state (snapshotted on setData) -----------------------
	private edges: GraphEdge[] = [];
	private clusterByNode = new Map<string, string | null | undefined>();
	private clusterMembers = new Map<string, string[]>();
	private edgesByNode = new Map<string, GraphEdge[]>();

	// --- Live state -------------------------------------------------------
	private expanded = new Set<string>();
	private surfaced = new Set<string>();
	private repByNode = new Map<string, string>();
	private bins = new Map<string, EdgeBin>();

	// --- Output cache -----------------------------------------------------
	private cachedLinks: AggregatedLink[] | null = null;
	private initialized = false;

	/**
	 * Replace the underlying graph. Wipes derived state; the next
	 * `setState` / `getLinks` call rebuilds the index. Cluster expansion
	 * and surfaced sets reset to empty — the consumer is expected to
	 * call `setState` afterwards with whatever expansion it wants.
	 */
	setData(
		edges: readonly GraphEdge[],
		clusterByNode: ReadonlyMap<string, string | null | undefined>,
		clusters: readonly GraphCluster[],
	): void {
		this.edges = [...edges];
		this.clusterByNode = new Map(clusterByNode);
		this.clusterMembers = new Map();
		for (const c of clusters) {
			this.clusterMembers.set(c.id, [...c.member_ids]);
		}
		this.edgesByNode = new Map();
		for (const e of edges) {
			pushList(this.edgesByNode, e.source, e);
			pushList(this.edgesByNode, e.target, e);
		}
		// Wipe derived live state. setState() will repopulate.
		this.expanded = new Set();
		this.surfaced = new Set();
		this.repByNode = new Map();
		this.bins = new Map();
		this.cachedLinks = null;
		this.initialized = false;
	}

	/**
	 * Apply a new expansion + surfaced set. The work scales with the
	 * number of *affected* nodes (members of any cluster that flipped,
	 * plus any surfaced ids that flipped) — not O(E).
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

		// Identify the nodes whose rep needs recomputation:
		//   - members of every cluster that flipped expanded ↔ collapsed
		//   - any individual node that flipped in/out of `surfaced`
		const affected = new Set<string>();
		const expDiff = diffSets(this.expanded, expanded);
		for (const cid of expDiff.added) addMembers(this.clusterMembers, cid, affected);
		for (const cid of expDiff.removed) addMembers(this.clusterMembers, cid, affected);
		const surDiff = diffSets(this.surfaced, surfaced);
		for (const id of surDiff.added) affected.add(id);
		for (const id of surDiff.removed) affected.add(id);

		// Commit the new state up front so `computeRep` reads the post-
		// state. Migration walks then move each affected node from its
		// old rep (already in `repByNode`) to its newly-computed rep.
		this.expanded = new Set(expanded);
		this.surfaced = new Set(surfaced);

		for (const nodeId of affected) {
			const newRep = this.computeRep(nodeId);
			this.migrateNode(nodeId, newRep);
		}

		this.cachedLinks = null;
	}

	/**
	 * Snapshot the current edge set as a list of `AggregatedLink`s.
	 * Caches the result until the next `setState` / `setData`.
	 */
	getLinks(): AggregatedLink[] {
		if (this.cachedLinks) return this.cachedLinks;
		if (!this.initialized) this.initFromScratch();

		const links: AggregatedLink[] = [];
		for (const bin of this.bins.values()) {
			const aIsBubble = bin.first.startsWith("__cluster__");
			const bIsBubble = bin.second.startsWith("__cluster__");
			if (aIsBubble || bIsBubble) {
				links.push({
					source: bin.first,
					target: bin.second,
					type: "aggregated",
					weight: bin.edges.size,
				});
				continue;
			}
			// Real↔real: emit one link per underlying edge so distinct
			// relation types between the same pair stay distinct in the
			// rendered scene (e.g. "uses" + "feeds" between two assets).
			for (const e of bin.edges) {
				links.push({
					source: e.source,
					target: e.target,
					type: e.type,
				});
			}
		}
		this.cachedLinks = links;
		return links;
	}

	// =========================================================================
	// Internals
	// =========================================================================

	/**
	 * Compute the representative for a node under the *current* expanded
	 * + surfaced state. Loose nodes always rep as themselves; members
	 * of expanded clusters do too; surfaced members of collapsed
	 * clusters also stay at their own id; anything else rolls up into
	 * its cluster bubble.
	 */
	private computeRep(nodeId: string): string {
		const cid = this.clusterByNode.get(nodeId);
		if (!cid) return nodeId;
		if (this.expanded.has(cid)) return nodeId;
		if (this.surfaced.has(nodeId)) return nodeId;
		return `__cluster__${cid}`;
	}

	/**
	 * One-shot full build. Used when the index has no prior state
	 * (after `setData`) — subsequent calls migrate incrementally.
	 */
	private initFromScratch(): void {
		this.repByNode = new Map();
		this.bins = new Map();
		for (const nodeId of this.clusterByNode.keys()) {
			this.repByNode.set(nodeId, this.computeRep(nodeId));
		}
		for (const e of this.edges) {
			const repA = this.repByNode.get(e.source);
			const repB = this.repByNode.get(e.target);
			if (!repA || !repB || repA === repB) continue;
			this.addEdgeToBin(e, repA, repB);
		}
		this.initialized = true;
		this.cachedLinks = null;
	}

	/**
	 * Move a single node from its current rep to a new rep. Rewires
	 * every edge touching this node from the old (rep, otherRep) bin
	 * to the new (newRep, otherRep) bin. Self-loops (same rep on both
	 * sides) are skipped — they wouldn't render as a meaningful link.
	 */
	private migrateNode(nodeId: string, newRep: string): void {
		const oldRep = this.repByNode.get(nodeId);
		if (oldRep === undefined || oldRep === newRep) {
			this.repByNode.set(nodeId, newRep);
			return;
		}
		const edges = this.edgesByNode.get(nodeId) ?? [];
		for (const e of edges) {
			const otherId = e.source === nodeId ? e.target : e.source;
			const otherRep = this.repByNode.get(otherId);
			if (otherRep === undefined) continue;
			if (otherRep !== oldRep) {
				this.removeEdgeFromBin(e, oldRep, otherRep);
			}
			if (otherRep !== newRep) {
				this.addEdgeToBin(e, newRep, otherRep);
			}
		}
		this.repByNode.set(nodeId, newRep);
	}

	private addEdgeToBin(e: GraphEdge, repA: string, repB: string): void {
		const key = pairKey(repA, repB);
		let bin = this.bins.get(key);
		if (!bin) {
			const [first, second] = repA < repB ? [repA, repB] : [repB, repA];
			bin = { first, second, edges: new Set() };
			this.bins.set(key, bin);
		}
		bin.edges.add(e);
	}

	private removeEdgeFromBin(
		e: GraphEdge,
		repA: string,
		repB: string,
	): void {
		const key = pairKey(repA, repB);
		const bin = this.bins.get(key);
		if (!bin) return;
		bin.edges.delete(e);
		if (bin.edges.size === 0) this.bins.delete(key);
	}
}

// ---------------------------------------------------------------------------
// Tiny helpers — kept private to this module.
// ---------------------------------------------------------------------------

function pushList<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

function addMembers(
	clusterMembers: Map<string, string[]>,
	cid: string,
	out: Set<string>,
): void {
	const members = clusterMembers.get(cid);
	if (!members) return;
	for (const m of members) out.add(m);
}
