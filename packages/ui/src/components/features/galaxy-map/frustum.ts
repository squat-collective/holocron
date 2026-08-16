/**
 * Frustum culling helper — answers "which clusters can the camera
 * currently see?" so the budget pass can prefer expanding clusters
 * that are actually on screen.
 *
 * `cluster-budget.ts` already accepts an `inFrustum: Set<string>` —
 * an in-frustum candidate beats an off-frustum one at equal score in
 * the expand pass. Until this module landed, we never populated it,
 * so the bias was a no-op and the budget would happily expand a hub
 * directly behind the camera while the user stared at a dim leaf in
 * front of them.
 *
 * The math is straightforward three.js: build a `Frustum` from
 * `projectionMatrix · matrixWorldInverse`, then check each cluster's
 * bounding sphere (centroid + radius) for intersection. We reuse
 * scratch objects across calls so the per-tick allocation stays at
 * one Set + a small tuple per cluster.
 */

import type { GraphCluster } from "@squat-collective/holocron-ts";
import * as THREE from "three";

/** Minimal camera shape — `Frustum.setFromProjectionMatrix` needs only these. */
export interface CameraLike {
	projectionMatrix: THREE.Matrix4;
	matrixWorldInverse: THREE.Matrix4;
}

/**
 * Reusable scratch space so callers don't allocate a fresh Frustum +
 * Matrix4 + Sphere on every tick. The scene holds one of these and
 * passes it back into `clustersInFrustum` each frame.
 */
export interface FrustumScratch {
	frustum: THREE.Frustum;
	matrix: THREE.Matrix4;
	sphere: THREE.Sphere;
}

export function createFrustumScratch(): FrustumScratch {
	return {
		frustum: new THREE.Frustum(),
		matrix: new THREE.Matrix4(),
		sphere: new THREE.Sphere(),
	};
}

/**
 * Return the set of cluster ids whose bounding sphere intersects the
 * camera's view frustum.
 *
 * Cluster bounding sphere = (centroid, radius) — the same numbers the
 * server emits and the budget already uses for its zoom gate. No
 * extra spatial precomputation needed.
 *
 * The minimum radius floor (50 world units) matches `cluster-budget`'s
 * own gate: a tiny single-member cluster shouldn't pop in/out of the
 * frustum on a sub-pixel pan. It's a "perceptual radius," not a
 * geometric one.
 */
export function clustersInFrustum(
	clusters: readonly GraphCluster[],
	camera: CameraLike,
	scratch: FrustumScratch = createFrustumScratch(),
): Set<string> {
	scratch.matrix.multiplyMatrices(
		camera.projectionMatrix,
		camera.matrixWorldInverse,
	);
	scratch.frustum.setFromProjectionMatrix(scratch.matrix);

	const result = new Set<string>();
	for (const c of clusters) {
		scratch.sphere.center.set(c.centroid_x, c.centroid_y, c.centroid_z);
		scratch.sphere.radius = Math.max(c.radius, 50);
		if (scratch.frustum.intersectsSphere(scratch.sphere)) {
			result.add(c.id);
		}
	}
	return result;
}
