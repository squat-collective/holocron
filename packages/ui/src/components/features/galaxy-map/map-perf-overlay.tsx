"use client";

/**
 * Dev-only perf overlay for the galaxy map. Polls scene stats four
 * times a second and renders a small monospace card in the top-right
 * corner — same role a DevTools "stats panel" plays in game engines.
 *
 * The overlay also runs its own rAF tick to count actual frames-
 * delivered-to-the-window. The library's animation cycle drives
 * three.js draws, and the browser's compositor decides when to swap
 * — this rAF count is the closest cheap proxy for end-to-end FPS.
 *
 * Hidden in production builds; the consumer guards rendering on
 * `process.env.NODE_ENV === 'development'`.
 */

import { useEffect, useRef, useState } from "react";
import type { GalaxyScene, GalaxySceneStats } from "./galaxy-scene";

interface OverlayProps {
	/** Live ref to the scene — null until mount completes. */
	sceneRef: React.RefObject<GalaxyScene | null>;
}

interface OverlayDisplay extends GalaxySceneStats {
	fps: number;
	/** Inter-rAF interval, ms — captures everything between frames
	 * (browser layout, library render, GPU work) that the per-phase
	 * JS timings don't see. 16.7 ≈ 60Hz; 100 ≈ 10fps. */
	frameMs: number;
	/** Worst-case frame interval over the polling window — surfaces
	 * jitter and GC pauses that an averaged FPS would smooth away. */
	frameMsMax: number;
}

export function MapPerfOverlay({ sceneRef }: OverlayProps) {
	const [display, setDisplay] = useState<OverlayDisplay | null>(null);

	// Per-frame samples — `lastFrameTs` for delta math, `maxIntervalMs`
	// captures the worst tick within the polling window.
	const lastFrameTsRef = useRef(performance.now());
	const frameCountRef = useRef(0);
	const intervalSumRef = useRef(0);
	const intervalMaxRef = useRef(0);
	const lastPollRef = useRef(performance.now());

	useEffect(() => {
		let raf = 0;
		const POLL_MS = 250;
		const tick = () => {
			const now = performance.now();
			const dt = now - lastFrameTsRef.current;
			lastFrameTsRef.current = now;
			frameCountRef.current += 1;
			intervalSumRef.current += dt;
			if (dt > intervalMaxRef.current) intervalMaxRef.current = dt;

			const elapsed = now - lastPollRef.current;
			if (elapsed >= POLL_MS) {
				const fps = (frameCountRef.current * 1000) / elapsed;
				const frameMs =
					frameCountRef.current > 0
						? intervalSumRef.current / frameCountRef.current
						: 0;
				const frameMsMax = intervalMaxRef.current;
				frameCountRef.current = 0;
				intervalSumRef.current = 0;
				intervalMaxRef.current = 0;
				lastPollRef.current = now;
				const scene = sceneRef.current;
				if (scene) {
					const stats = scene.getStats();
					setDisplay({ ...stats, fps, frameMs, frameMsMax });
				}
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [sceneRef]);

	if (!display) return null;
	return (
		<div className="pointer-events-none absolute top-4 right-32 z-10 rounded-md border border-primary/25 bg-background/85 backdrop-blur-sm shadow-lg shadow-primary/10 px-3 py-2 font-mono text-[10px] leading-tight text-foreground">
			<Row
				label="fps"
				value={
					display.paused
						? `${display.fps.toFixed(0)} ⏸`
						: display.fps.toFixed(0)
				}
			/>
			<Row
				label="frame"
				value={`${display.frameMs.toFixed(1)}/${display.frameMsMax.toFixed(0)}ms`}
				warn={!display.paused && display.frameMs > 18}
			/>
			<Row label="lod" value={`${display.lodMs.toFixed(2)}ms`} />
			<Row label="links" value={`${display.restyleLinksMs.toFixed(2)}ms`} />
			<Row label="budget" value={`${display.budgetMs.toFixed(2)}ms`} />
			<Row label="rebuild" value={`${display.rebuildMs.toFixed(2)}ms`} />
			<Row
				label="visible"
				value={`${display.realNodes}+${display.bubbles}b`}
			/>
			<Row label="links #" value={`${display.links}`} />
			<Row label="draws" value={`${display.drawCalls}`} />
			<Row label="tris" value={`${display.triangles.toLocaleString()}`} />
		</div>
	);
}

function Row({
	label,
	value,
	warn = false,
}: {
	label: string;
	value: string;
	warn?: boolean;
}) {
	return (
		<div className="flex items-baseline gap-2 min-w-[110px]">
			<span className="text-muted-foreground/80 w-12">{label}</span>
			<span
				className={
					warn ? "tabular-nums text-amber-500" : "tabular-nums"
				}
			>
				{value}
			</span>
		</div>
	);
}
