import type { GraphCluster } from "@squat-collective/holocron-ts";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { clustersInFrustum, createFrustumScratch } from "./frustum";

// ---------------------------------------------------------------------------
// Camera fixture — perspective camera looking down -Z from origin. Anything
// in front of it within the FOV cone is visible; anything behind it is not.
// ---------------------------------------------------------------------------

function makeCamera(opts: {
	position: [number, number, number];
	lookAt: [number, number, number];
	fov?: number;
	aspect?: number;
	near?: number;
	far?: number;
}): THREE.PerspectiveCamera {
	const cam = new THREE.PerspectiveCamera(
		opts.fov ?? 60,
		opts.aspect ?? 1.6,
		opts.near ?? 1,
		opts.far ?? 10000,
	);
	cam.position.set(...opts.position);
	cam.lookAt(new THREE.Vector3(...opts.lookAt));
	cam.updateMatrixWorld(true);
	cam.updateProjectionMatrix();
	return cam;
}

const cluster = (
	id: string,
	xyz: [number, number, number],
	radius = 50,
): GraphCluster => ({
	id,
	label: id.toUpperCase(),
	kind: "system",
	member_ids: [id],
	centroid_x: xyz[0],
	centroid_y: xyz[1],
	centroid_z: xyz[2],
	radius,
	degree: 1,
	level: 0,
	parent_id: null,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("clustersInFrustum", () => {
	it("includes a cluster centred on the camera's forward ray", () => {
		const cam = makeCamera({ position: [0, 0, 1000], lookAt: [0, 0, 0] });
		const inView = clustersInFrustum(
			[cluster("front", [0, 0, 0])],
			cam,
		);
		expect(inView.has("front")).toBe(true);
	});

	it("excludes a cluster directly behind the camera", () => {
		// Camera at +Z=1000 looking at origin → forward = -Z. A cluster at
		// +Z=2000 sits behind the camera, outside the view frustum.
		const cam = makeCamera({ position: [0, 0, 1000], lookAt: [0, 0, 0] });
		const inView = clustersInFrustum(
			[cluster("behind", [0, 0, 2000])],
			cam,
		);
		expect(inView.has("behind")).toBe(false);
	});

	it("excludes a cluster well outside the FOV cone", () => {
		// Camera at +Z=500 looking at origin, narrow FOV. A cluster huge
		// distance off-axis (X=10000) at the same Z as origin is way
		// outside the cone.
		const cam = makeCamera({
			position: [0, 0, 500],
			lookAt: [0, 0, 0],
			fov: 30,
		});
		const inView = clustersInFrustum(
			[cluster("offaxis", [10000, 0, 0], 50)],
			cam,
		);
		expect(inView.has("offaxis")).toBe(false);
	});

	it("includes a cluster whose sphere only partially crosses the frustum", () => {
		// Place the cluster *just* outside the FOV but with a fat radius
		// so the sphere bulges into view. This is the case where the
		// budget should still consider it — the user can see part of it.
		const cam = makeCamera({
			position: [0, 0, 500],
			lookAt: [0, 0, 0],
			fov: 30,
		});
		const c = cluster("edge", [200, 0, 0], 300);
		const inView = clustersInFrustum([c], cam);
		expect(inView.has("edge")).toBe(true);
	});

	it("returns an empty set when given no clusters", () => {
		const cam = makeCamera({ position: [0, 0, 100], lookAt: [0, 0, 0] });
		expect(clustersInFrustum([], cam).size).toBe(0);
	});

	it("scratch object is reused without state bleed across calls", () => {
		const scratch = createFrustumScratch();
		const cam = makeCamera({ position: [0, 0, 1000], lookAt: [0, 0, 0] });

		// First call — cluster in view.
		const a = clustersInFrustum(
			[cluster("a", [0, 0, 0])],
			cam,
			scratch,
		);
		expect(a.has("a")).toBe(true);

		// Second call — different camera (looking the other way), same
		// scratch. The result must reflect the new camera, not the old.
		const cam2 = makeCamera({ position: [0, 0, 1000], lookAt: [0, 0, 2000] });
		const b = clustersInFrustum(
			[cluster("a", [0, 0, 0])],
			cam2,
			scratch,
		);
		expect(b.has("a")).toBe(false);
	});

	it("respects the perceptual radius floor — tiny clusters use radius=50", () => {
		// A cluster with radius=1 just inside the FOV edge. Without the
		// 50-unit floor, the sphere would miss the frustum on a sub-
		// degree pan. With the floor, it stays "in view" stably.
		const cam = makeCamera({
			position: [0, 0, 500],
			lookAt: [0, 0, 0],
			fov: 60,
		});
		// X=120 at Z=0 is just outside a 60° FOV from Z=500, but a
		// 50-unit sphere reaches into the frustum.
		const c = cluster("tiny", [120, 0, 0], 1);
		expect(clustersInFrustum([c], cam).has("tiny")).toBe(true);
	});
});
