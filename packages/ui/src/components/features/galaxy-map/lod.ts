/**
 * Pure helpers for the galaxy map's level-of-detail logic.
 *
 * Two concerns live together because they share inputs (camera distance,
 * node degree, focus tier):
 *   - label opacity — distance + degree-weighted falloff so leaf labels
 *     fade out first as the camera zooms back, hub labels last
 *   - focus-tier dimming — three tiers (seed / neighbour / other) so a
 *     locked or hovered node clearly stands out from its 1-hop ring,
 *     and the rest of the galaxy fades into context
 *
 * Pulled out of `galaxy-map.tsx` so it's unit-testable in isolation —
 * the renderer is too entangled with three.js to drop into vitest.
 */

export type FocusTier = "seed" | "neighbour" | "other" | "unfocused";

/**
 * Visual multipliers for each focus tier. Used by both label opacity
 * and node mesh / halo opacity. The "unfocused" tier is what every node
 * looks like when *no* node is focused at all (no locks, no hover) —
 * it's the calm baseline.
 */
export const FOCUS_ALPHA: Record<FocusTier, number> = {
	seed: 1.0,
	neighbour: 0.5,
	other: 0.12,
	unfocused: 0.92,
};

/**
 * Mesh-core opacity per tier — slightly less aggressive than labels
 * because nodes are the primary spatial cue. We need to keep some shape
 * visible even for "other" so the user has spatial context.
 */
export const FOCUS_MESH_ALPHA: Record<FocusTier, number> = {
	seed: 0.95,
	neighbour: 0.7,
	other: 0.25,
	unfocused: 0.95,
};

export const FOCUS_HALO_ALPHA: Record<FocusTier, number> = {
	seed: 0.5,
	neighbour: 0.3,
	other: 0.08,
	unfocused: 0.45,
};

export interface LabelOpacityParams {
	/** Distance from camera to node, in world units. */
	distance: number;
	/** Node degree — drives the hub bonus that keeps hub labels alive longer. */
	degree: number;
	/** Which focus tier this node falls into. */
	focusTier: FocusTier;
	/** Below this distance the label is at full tier-alpha. */
	dNear?: number;
	/** Above this distance (before hub bonus) the label is invisible. */
	dFar?: number;
	/** Hub bonus: extra distance budget per log1p(degree). */
	hubBonus?: number;
}

/**
 * Defaults for the distance-LOD ramp. Exported so the engine's per-
 * frame fast path can branch on squared thresholds before deciding to
 * pay for a `sqrt` — most nodes resolve trivially (full alpha or zero)
 * and never need the actual distance.
 */
export const LOD_DEFAULTS = {
	dNear: 600,
	dFar: 1500,
	hubBonus: 220,
} as const;

/**
 * Compute the final opacity for a node label given camera distance,
 * node degree, and focus tier. Returns a number in [0, 1].
 *
 * The contract:
 *   - **Seed** is the only tier that bypasses distance LOD. The user
 *     directly hovered / locked / keyboard-selected this node — they
 *     pointed at it, fading it on a pan would feel broken.
 *   - **Neighbour, other, unfocused** all run through the distance LOD,
 *     scaled by their tier alpha. This is the "zoom-adapted focus"
 *     contract: hovering a hub at zoom-out shouldn't suddenly pop
 *     dozens of neighbour labels into view — the user is reading the
 *     architecture view at that zoom, the cursor was incidental.
 *     When the camera moves close, neighbour labels resurface
 *     naturally because the distance LOD lets them through.
 *   - **Hub bonus** still applies on the distance ramp so high-degree
 *     nodes hold their labels longer than leaves.
 */
export function computeLabelOpacity(p: LabelOpacityParams): number {
	const {
		distance,
		degree,
		focusTier,
		dNear = LOD_DEFAULTS.dNear,
		dFar = LOD_DEFAULTS.dFar,
		hubBonus = LOD_DEFAULTS.hubBonus,
	} = p;
	const tierAlpha = FOCUS_ALPHA[focusTier];
	if (tierAlpha === 0) return 0;

	// Seed bypasses distance LOD: the user pointed at this exact node.
	if (focusTier === "seed") {
		return tierAlpha;
	}

	const farForNode = dFar + hubBonus * Math.log1p(Math.max(0, degree));

	let distanceAlpha: number;
	if (distance <= dNear) {
		distanceAlpha = 1;
	} else if (distance >= farForNode) {
		distanceAlpha = 0;
	} else {
		distanceAlpha = 1 - (distance - dNear) / (farForNode - dNear);
	}

	return Math.max(0, Math.min(1, tierAlpha * distanceAlpha));
}

/**
 * Decide which focus tier a given node id falls into, given the seed
 * set (locked + hovered + keyboard-selected) and adjacency. Pure
 * lookup — extracted so the per-frame update path doesn't have to
 * juggle three sets inline.
 */
export function focusTierFor(
	nodeId: string,
	seeds: ReadonlySet<string> | null,
	adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): FocusTier {
	if (!seeds || seeds.size === 0) return "unfocused";
	if (seeds.has(nodeId)) return "seed";
	for (const seed of seeds) {
		const ns = adjacency.get(seed);
		if (ns?.has(nodeId)) return "neighbour";
	}
	return "other";
}
