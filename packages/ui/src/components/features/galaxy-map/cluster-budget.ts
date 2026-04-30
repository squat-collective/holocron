/**
 * Budget-driven cluster expansion for the galaxy map.
 *
 * The renderer can show a few hundred nodes legibly. Past that the map
 * turns into noise and the GPU starts sweating. So the strategy isn't
 * "render the whole graph" — it's "spend a fixed budget on the most
 * useful N things to show right now."
 *
 * Each cluster (precomputed server-side) can either be collapsed into
 * a single bubble or expanded into its individual members. The picker
 * here ranks clusters by how much the user "cares about them right now"
 * (proxy: cluster degree / camera distance) and greedily expands them
 * top-down until expanding the next one would bust the budget.
 *
 * Hysteresis is critical to prevent flicker: the expansion threshold
 * sits below the collapse threshold by ~40 nodes, and per-cluster
 * recent changes get a sticky window so a cluster that just toggled
 * doesn't immediately toggle back the next frame.
 */

import type { GraphCluster, GraphNode } from "@squat-collective/holocron-ts";

export interface BudgetConfig {
	/** Below this visible-count, expand more clusters. */
	lowWater: number;
	/** Above this visible-count, collapse the lowest-priority expanded ones. */
	highWater: number;
	/** Per-cluster cooldown after an expand/collapse decision (ms). */
	stickyMs: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
	lowWater: 180,
	highWater: 220,
	stickyMs: 500,
};

export interface CameraSample {
	x: number;
	y: number;
	z: number;
}

/**
 * Priority score for a cluster — higher = expand sooner.
 *
 * Combines two signals:
 *   - **degree**: bigger / more-connected clusters carry more catalog
 *     weight, so they earn a larger slice of the budget by default
 *   - **proximity**: clusters near the camera matter more than far ones
 *     (you wouldn't keep a cluster on the other side of the galaxy
 *     expanded just because it's a hub)
 *
 * Floor on the distance prevents a divide-by-zero when the camera
 * sits exactly on a centroid (which it can during a fly-to animation).
 */
export function scoreCluster(
	cluster: GraphCluster,
	camera: CameraSample,
): number {
	const dx = cluster.centroid_x - camera.x;
	const dy = cluster.centroid_y - camera.y;
	const dz = cluster.centroid_z - camera.z;
	const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
	return (1 + cluster.degree) / Math.max(distance, 50);
}

/**
 * Count visible "things" (nodes + bubbles) given a current expansion
 * set. A collapsed cluster contributes 1 (the bubble); an expanded one
 * contributes its member count. Loose nodes (no cluster) always count.
 */
export function countVisible(
	clusters: readonly GraphCluster[],
	looseNodeCount: number,
	expanded: ReadonlySet<string>,
): number {
	let count = looseNodeCount;
	for (const c of clusters) {
		count += expanded.has(c.id) ? c.member_ids.length : 1;
	}
	return count;
}

export interface ExpansionInputs {
	clusters: readonly GraphCluster[];
	looseNodeCount: number;
	camera: CameraSample;
	/** The currently-expanded set; the next state is computed from this. */
	previous: ReadonlySet<string>;
	/** Per-cluster timestamps of last expand/collapse decision (ms). */
	lastChange: ReadonlyMap<string, number>;
	/** Current time (ms), e.g. `performance.now()`. */
	now: number;
	/**
	 * Manually-pinned expansions — clusters the user explicitly clicked
	 * to expand. The budget never auto-collapses these; only the user
	 * can close them.
	 */
	pinnedOpen?: ReadonlySet<string>;
	/** Cluster ids in the camera frustum, used as the candidate pool. */
	inFrustum?: ReadonlySet<string>;
	config?: Partial<BudgetConfig>;
}

export interface ExpansionDecision {
	/** The new expanded set after applying budget pressure. */
	expanded: Set<string>;
	/** Cluster ids that changed state on this call (for sticky timing). */
	changed: Set<string>;
}

/**
 * Decide which clusters should be expanded right now given the budget.
 *
 * Algorithm in three passes:
 *   1. **Carry over.** Start from the previous expanded set, minus any
 *      cluster that's no longer in the cluster list (data churn).
 *   2. **Collapse pass** (only if `visible > highWater`). Walk currently-
 *      expanded clusters in *ascending* priority order and collapse them
 *      until visible drops to `lowWater`. Sticky and pinned-open
 *      clusters are skipped.
 *   3. **Expand pass** (only if `visible < lowWater`). Walk all clusters
 *      in *descending* priority order and expand the highest-priority
 *      collapsed ones, as long as expanding doesn't push past `highWater`.
 *      Sticky clusters are skipped.
 *
 * The hysteresis (collapse only above `highWater`, expand only below
 * `lowWater`) keeps the system stable when the visible count hovers in
 * the middle band — no thrash on minor camera nudges.
 */
export function computeExpansion(input: ExpansionInputs): ExpansionDecision {
	const config: BudgetConfig = { ...DEFAULT_BUDGET, ...input.config };
	const { clusters, looseNodeCount, camera, previous, lastChange, now } = input;
	const pinnedOpen = input.pinnedOpen ?? new Set<string>();
	const inFrustum = input.inFrustum ?? null;

	const validIds = new Set(clusters.map((c) => c.id));
	const expanded = new Set<string>();
	for (const id of previous) {
		if (validIds.has(id)) expanded.add(id);
	}
	for (const id of pinnedOpen) {
		if (validIds.has(id)) expanded.add(id);
	}

	const isSticky = (id: string): boolean => {
		const t = lastChange.get(id);
		if (t === undefined) return false;
		return now - t < config.stickyMs;
	};

	const changed = new Set<string>();
	const visible = () => countVisible(clusters, looseNodeCount, expanded);

	// Collapse pass — drop the least useful expansions if we're over budget.
	// We aim for `lowWater` (not `highWater`) so we don't immediately
	// re-expand on the next pass. That's the hysteresis in action.
	//
	// Crucial: collapse and expand are mutually exclusive (`else if`).
	// Without this guard, the collapse pass overshoots `lowWater` (it
	// stops the *step after* the threshold) and the expand pass would
	// immediately re-open the same clusters in the same call, doubling
	// the change count and producing visible flicker.
	if (visible() > config.highWater) {
		const candidates = clusters
			.filter(
				(c) =>
					expanded.has(c.id) && !pinnedOpen.has(c.id) && !isSticky(c.id),
			)
			.map((c) => ({ c, s: scoreCluster(c, camera) }))
			.sort((a, b) => a.s - b.s);
		for (const { c } of candidates) {
			if (visible() <= config.lowWater) break;
			expanded.delete(c.id);
			changed.add(c.id);
		}
	} else if (visible() < config.lowWater) {
		const candidates = clusters
			.filter((c) => !expanded.has(c.id) && !isSticky(c.id))
			.map((c) => ({
				c,
				s: scoreCluster(c, camera),
				inView: inFrustum ? inFrustum.has(c.id) : true,
			}))
			.sort((a, b) => {
				if (a.inView !== b.inView) return a.inView ? -1 : 1;
				return b.s - a.s;
			});
		for (const { c } of candidates) {
			// Each expansion swaps 1 bubble for member_ids.length leaves —
			// net delta is `member_ids.length - 1`. Test against highWater
			// (not lowWater) so we open as many as fit.
			const delta = c.member_ids.length - 1;
			if (visible() + delta > config.highWater) continue;
			expanded.add(c.id);
			changed.add(c.id);
		}
	}

	return { expanded, changed };
}

/**
 * Index by cluster_id so the renderer can quickly answer "is this node
 * currently visible given the expansion set?" without a linear scan.
 */
export function indexByCluster(nodes: readonly GraphNode[]): {
	loose: GraphNode[];
	byCluster: Map<string, GraphNode[]>;
} {
	const loose: GraphNode[] = [];
	const byCluster = new Map<string, GraphNode[]>();
	for (const n of nodes) {
		if (!n.cluster_id) {
			loose.push(n);
			continue;
		}
		const list = byCluster.get(n.cluster_id);
		if (list) list.push(n);
		else byCluster.set(n.cluster_id, [n]);
	}
	return { loose, byCluster };
}
