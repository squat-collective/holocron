"use client";

import { useSyncExternalStore } from "react";

/** Direction of a warp animation. */
export type WarpMode = "forward" | "reverse";

/**
 * Imperative channel between the navigation system and the GalaxyBackground
 * canvas.
 * - `rotationBoost` multiplies the base rotation speed (1 = idle, >1 = spin up)
 * - `warpPulse` is a counter — each bump triggers a warp cinematic
 * - `warpMode` is the direction of the latest pulse
 *     forward  = home → page (zoom INTO a star, regen at apex, flash near end)
 *     reverse  = page → home (regen at start, flash at start, zoom OUT)
 */
interface GalaxyState {
	rotationBoost: number;
	warpPulse: number;
	warpMode: WarpMode;
}

let state: GalaxyState = {
	rotationBoost: 1,
	warpPulse: 0,
	warpMode: "forward",
};
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function setRotationBoost(next: number) {
	if (state.rotationBoost === next) return;
	state = { ...state, rotationBoost: next };
	emit();
}

export function warp(mode: WarpMode = "forward") {
	state = { ...state, warpPulse: state.warpPulse + 1, warpMode: mode };
	emit();
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}

function getSnapshot() {
	return state;
}

export function useGalaxyState(): GalaxyState {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
