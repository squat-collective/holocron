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
 * Compute the final opacity for a node label given camera distance,
 * node degree, and focus tier. Returns a number in [0, 1].
 *
 * The contract:
 *   - **Seed and neighbour tiers** ignore distance entirely — when the
 *     user has focused something, the focused node and its 1-hop ring
 *     stay readable at any zoom. Distance LOD on a focused label felt
 *     wrong: you tell the system "show me this," and then it fades on
 *     pan? No.
 *   - **Other** tier (focused mode, off-tier nodes) caps at the tier
 *     alpha (~0.12). They're already barely visible; the distance
 *     falloff would just be noise on top of "very dim."
 *   - **Unfocused** (no focus active anywhere) is the only tier where
 *     distance LOD applies. Below `dNear` the label is full alpha;
 *     above `dFar + hubBonus * log1p(degree)` it's invisible; linear
 *     lerp in between. Hub bonus keeps high-degree nodes' labels
 *     alive longer as the camera pulls back.
 */
export function computeLabelOpacity(p: LabelOpacityParams): number {
	const {
		distance,
		degree,
		focusTier,
		dNear = 600,
		dFar = 1500,
		hubBonus = 220,
	} = p;
	const tierAlpha = FOCUS_ALPHA[focusTier];
	if (tierAlpha === 0) return 0;

	// Focused / 1-hop labels skip the distance LOD: the user has
	// asked the system to show them this; honour it at any zoom.
	if (focusTier === "seed" || focusTier === "neighbour") {
		return tierAlpha;
	}
	// Off-tier in focus mode is already aggressively dim; layering
	// distance falloff on top doesn't add information.
	if (focusTier === "other") {
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
