"use client";

import { useEffect, useRef } from "react";
import { useGalaxyState, type WarpMode } from "@/lib/galaxy-store";

interface Star {
	/** Distance from galactic center, normalized 0..1 */
	r: number;
	/** Current angle from galactic center (radians) */
	theta: number;
	/** Depth 0..1 (0 = far, 1 = near) — drives parallax + size */
	z: number;
	/** Vertical offset from the disk plane — thin in arms, spherical in the bulge */
	yOffset: number;
	radius: number;
	baseAlpha: number;
	twinkleSpeed: number;
	twinklePhase: number;
	/** Local jitter so the spiral arms don't look like hard lines */
	jitter: number;
	hue: number;
	/** True if this star is a faint "halo" star outside the disk */
	halo: boolean;
}

interface GalaxyConfig {
	armStars: number;
	haloStars: number;
	armCount: number;
	/** Higher = tighter logarithmic-spiral arms */
	spiralTightness: number;
	/** y-squish: 1 = top-down, 0 = edge-on */
	diskTilt: number;
	linkDistance: number;
	/** Base rotation, radians per second */
	rotationSpeed: number;
	/** Palette anchor hues (degrees). Stars pick from one of these + a bulge warm. */
	armHues: number[];
	bulgeWarm: number;
	/** Nominal star size + overall density multiplier */
	sizeScale: number;
}

function pick<T>(arr: readonly T[]): T {
	return arr[Math.floor(Math.random() * arr.length)]!;
}

function randRange(a: number, b: number): number {
	return a + Math.random() * (b - a);
}

/**
 * Each galaxy's look is re-rolled on every warp: arm count, density, tilt,
 * tightness and palette change. A palette is a small set of hues sampled
 * per-star, with occasional warm stragglers in the bulge.
 */
function randomGalaxyConfig(): GalaxyConfig {
	const armCount = pick([2, 3, 3, 4, 5]);
	const paletteOptions = [
		[220, 260, 290], // classic violet
		[190, 210, 230], // icy blue
		[280, 320, 345], // magenta / pink
		[140, 170, 200], // teal / aqua
		[20, 45, 60], // warm dawn
		[260, 300, 180], // mixed cosmic
	];
	const armHues = pick(paletteOptions);
	return {
		armStars: Math.round(randRange(340, 700)),
		haloStars: Math.round(randRange(110, 200)),
		armCount,
		spiralTightness: randRange(1.4, 3.2),
		diskTilt: randRange(0.28, 0.48),
		linkDistance: randRange(70, 100),
		rotationSpeed: randRange(0.008, 0.02) * (Math.random() < 0.2 ? -1 : 1),
		armHues,
		bulgeWarm: randRange(25, 55),
		sizeScale: randRange(0.85, 1.2),
	};
}

const PARALLAX = 12;

/* ------------------------------------------------------------------ */
/* Warp-zoom timing                                                    */
/* ------------------------------------------------------------------ */
const WARP_DURATION = 1500; // ms — long enough for the three-beat "out, glide, in" feel
const WARP_MAX_SCALE = 70; // big enough that the target star fills the viewport
const WARP_PULL_OUT = 0.55; // scale dips to this during the glide phase
/** Fraction of the animation spent on the pull-out-and-glide phase. Rest is zoom-in. */
const WARP_GLIDE_FRACTION = 0.55;
/** At this warpT the galaxy regenerates and the flash starts to clear. */
const WARP_APEX = 0.88;

function easeInQuart(t: number) {
	return t * t * t * t;
}

function easeInOutCubic(t: number) {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Ambient Milky-Way backdrop.
 *
 * Each seed produces a new spiral galaxy — arm count, tightness, palette and
 * density are all re-rolled. Typing in the search bar raises `rotationBoost`,
 * which eases the disk up to a faster spin. `warp()` from the store fires the
 * zoom-into-a-random-star cinematic; at the apex the galaxy regenerates with
 * a fresh config.
 */
export function GalaxyBackground() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const galaxyState = useGalaxyState();

	// Keep latest values in refs so the effect's animation loop can read them
	// without re-running on every state change.
	const boostRef = useRef(galaxyState.rotationBoost);
	const pulseRef = useRef(galaxyState.warpPulse);
	const modeRef = useRef(galaxyState.warpMode);

	useEffect(() => {
		boostRef.current = galaxyState.rotationBoost;
	}, [galaxyState.rotationBoost]);

	useEffect(() => {
		pulseRef.current = galaxyState.warpPulse;
		modeRef.current = galaxyState.warpMode;
	}, [galaxyState.warpPulse, galaxyState.warpMode]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const reduced =
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		let stars: Star[] = [];
		let config: GalaxyConfig = randomGalaxyConfig();
		let width = 0;
		let height = 0;
		let radiusMax = 0;
		let lastTime = 0;
		let rotation = 0;
		let liveBoost = 1; // eased toward boostRef.current
		let seenPulse = pulseRef.current;
		/** Warp animation: 0 = idle, 0..1 during flight */
		let warpT = 0;
		/** Index into the stars array — recomputed every frame so the camera tracks a rotating star. */
		let warpStarIndex = -1;
		/** Direction of the currently-playing warp. */
		let warpMode: WarpMode = "forward";
		let raf = 0;
		const mouse = { x: 0, y: 0, target: { x: 0, y: 0 } };

		function seed() {
			stars = [];
			const { armStars, haloStars, armCount, spiralTightness, armHues, bulgeWarm, sizeScale } =
				config;

			for (let i = 0; i < armStars; i++) {
				const u = Math.random();
				const r = u ** 1.6;
				const arm = Math.floor(Math.random() * armCount);
				const armAngle = (arm / armCount) * Math.PI * 2;
				const spiral = armAngle + spiralTightness * Math.log(1 + r * 6);
				const jitterAmp = 0.12 + r * 0.45;
				const theta = spiral + (Math.random() - 0.5) * jitterAmp;

				const z = Math.random();
				const bulgeFactor = Math.max(0, 1 - r / 0.25);
				const yOffset =
					(Math.random() - 0.5) * (bulgeFactor * 140 + (1 - bulgeFactor) * 14);

				// Pick a hue from the palette; bulge stars get the warm tone more often.
				let hue: number;
				if (r < 0.18 && Math.random() < 0.7) {
					hue = bulgeWarm + Math.random() * 25;
				} else if (Math.random() < 0.08) {
					hue = 320 + Math.random() * 30; // occasional pink straggler
				} else {
					hue = pick(armHues) + (Math.random() - 0.5) * 20;
				}

				stars.push({
					r,
					theta,
					z,
					yOffset,
					radius: sizeScale * (0.35 + (1 - r) * 1.2 + z * 0.6),
					baseAlpha: 0.25 + (1 - r) * 0.45 + z * 0.25,
					twinkleSpeed: 0.4 + Math.random() * 1.2,
					twinklePhase: Math.random() * Math.PI * 2,
					jitter: (Math.random() - 0.5) * 3,
					hue,
					halo: false,
				});
			}

			for (let i = 0; i < haloStars; i++) {
				const z = Math.random() * 0.5;
				stars.push({
					r: 1.05 + Math.random() * 0.45,
					theta: Math.random() * Math.PI * 2,
					z,
					yOffset: (Math.random() - 0.5) * 180,
					radius: sizeScale * (0.3 + z * 0.7),
					baseAlpha: 0.2 + z * 0.3,
					twinkleSpeed: 0.3 + Math.random() * 0.8,
					twinklePhase: Math.random() * Math.PI * 2,
					jitter: 0,
					hue: pick(armHues) + (Math.random() - 0.5) * 30,
					halo: true,
				});
			}
		}

		function resize() {
			if (!canvas || !ctx) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			width = window.innerWidth;
			height = window.innerHeight;
			radiusMax = Math.hypot(width, height) * 0.55;
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.scale(dpr, dpr);
			seed();
		}

		/** Pick a random arm star index as the warp target (not the bulge, not the halo). */
		function pickWarpStarIndex(): number {
			const candidates: number[] = [];
			for (let i = 0; i < stars.length; i++) {
				const s = stars[i]!;
				if (!s.halo && s.r > 0.3 && s.r < 0.85) candidates.push(i);
			}
			const pool = candidates.length > 0 ? candidates : stars.map((_, i) => i);
			return pool[Math.floor(Math.random() * pool.length)]!;
		}

		/** Compute a star's current screen position (no parallax — we lock on for the warp). */
		function starScreenPos(s: Star): { x: number; y: number } {
			const cx = width / 2;
			const cy = height / 2;
			const theta = s.theta + rotation;
			const dist = s.r * radiusMax;
			const dx = Math.cos(theta) * dist + s.jitter;
			const dy = Math.sin(theta) * dist + s.jitter;
			return {
				x: cx + dx,
				y: cy + dy * config.diskTilt + s.yOffset,
			};
		}

		function tick(now: number) {
			if (!canvas || !ctx) return;
			const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
			lastTime = now;

			// Pick up warp pulse
			if (pulseRef.current !== seenPulse && warpT === 0) {
				seenPulse = pulseRef.current;
				warpMode = modeRef.current;
				if (warpMode === "reverse") {
					// Reverse warp: we're "emerging" from a star. Seed a fresh galaxy
					// under the flash at the start so the scene is zoomed in on a random
					// star at t=0 and pulls out to a full view by t=1.
					config = randomGalaxyConfig();
					rotation = 0;
					seed();
				}
				warpStarIndex = pickWarpStarIndex();
				warpT = 0.0001; // kick off animation
			}

			// Ease boost toward its target
			const boostTarget = boostRef.current;
			liveBoost += (boostTarget - liveBoost) * Math.min(1, dt * 4);

			// Rotation — warp gives the disk a whoosh as we pull into the star
			let rotationDelta = config.rotationSpeed * liveBoost * dt;
			if (warpT > 0) rotationDelta *= 1 + warpT * 3;
			if (!reduced) rotation += rotationDelta;

			mouse.x += (mouse.target.x - mouse.x) * 0.04;
			mouse.y += (mouse.target.y - mouse.y) * 0.04;

			ctx.clearRect(0, 0, width, height);

			const cx = width / 2;
			const cy = height / 2;
			const t = now * 0.001;

			// Warp transform — applied to the whole scene (stars + bulge glow).
			// Forward warp is a two-phase cinematography:
			//   Phase A (glide):  pull the camera OUT (scale 1 → WARP_PULL_OUT)
			//                     while sliding it TOWARD the target star.
			//   Phase B (punch):  hold on the target and zoom IN hard
			//                     (scale WARP_PULL_OUT → WARP_MAX_SCALE).
			// Reverse warp plays this same animation on a reversed time axis so we
			// start locked on the target at max zoom and "unfold" back into a wide
			// galaxy view — the natural inverse journey.
			let camScale = 1;
			if (warpT > 0 && warpStarIndex >= 0 && stars[warpStarIndex]) {
				const star = stars[warpStarIndex]!;
				const targetScreen = starScreenPos(star);
				const rawT = Math.min(1, warpT / WARP_APEX);
				const tNorm = warpMode === "forward" ? rawT : 1 - rawT;

				let moveT: number;
				if (tNorm < WARP_GLIDE_FRACTION) {
					const localT = tNorm / WARP_GLIDE_FRACTION;
					const eased = easeInOutCubic(localT);
					camScale = 1 - eased * (1 - WARP_PULL_OUT);
					moveT = eased;
				} else {
					const localT = (tNorm - WARP_GLIDE_FRACTION) / (1 - WARP_GLIDE_FRACTION);
					camScale = WARP_PULL_OUT + easeInQuart(localT) * (WARP_MAX_SCALE - WARP_PULL_OUT);
					moveT = 1;
				}

				const camX = cx + (targetScreen.x - cx) * moveT;
				const camY = cy + (targetScreen.y - cy) * moveT;
				ctx.save();
				ctx.translate(cx - camX * camScale, cy - camY * camScale);
				ctx.scale(camScale, camScale);
			} else {
				ctx.save();
			}

			// Ease parallax out at warp start (and back in at warp end) so the mouse
			// doesn't cause any visible jerk when the lock-on begins.
			const parallaxDamp =
				warpT === 0
					? 1
					: warpT < 0.15
						? 1 - warpT / 0.15
						: warpT > 0.92
							? (warpT - 0.92) / 0.08
							: 0;
			const parallaxK = PARALLAX * parallaxDamp;

			// Bulge glow (elliptical, scaled with disk tilt)
			ctx.save();
			ctx.translate(cx + mouse.x * 6, cy + mouse.y * 6);
			ctx.scale(1, config.diskTilt + 0.15);
			const bulge = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusMax * 0.45);
			bulge.addColorStop(0, "rgba(220, 180, 255, 0.22)");
			bulge.addColorStop(0.35, "rgba(160, 125, 230, 0.1)");
			bulge.addColorStop(1, "rgba(80, 60, 150, 0)");
			ctx.fillStyle = bulge;
			ctx.beginPath();
			ctx.arc(0, 0, radiusMax * 0.6, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();

			// Project stars to screen positions (pre-camera)
			const projected: {
				x: number;
				y: number;
				z: number;
				halo: boolean;
				alpha: number;
				radius: number;
				hue: number;
			}[] = [];

			for (const s of stars) {
				const theta = s.theta + rotation;
				const dist = s.r * radiusMax;
				const dx = Math.cos(theta) * dist + s.jitter;
				const dy = Math.sin(theta) * dist + s.jitter;
				let x = cx + dx;
				let y = cy + dy * config.diskTilt + s.yOffset;
				x += mouse.x * parallaxK * s.z;
				y += mouse.y * parallaxK * s.z;

				const twinkle = reduced
					? 1
					: 0.6 + Math.sin(t * s.twinkleSpeed + s.twinklePhase) * 0.4;
				const alpha = s.baseAlpha * twinkle;

				projected.push({
					x,
					y,
					z: s.z,
					halo: s.halo,
					alpha,
					radius: s.radius,
					hue: s.hue,
				});
			}

			// Constellation lines — skip during warp (fade out quickly for speed feel)
			const linkAlphaMul = warpT > 0 ? Math.max(0, 1 - warpT * 2) : 1;
			if (linkAlphaMul > 0.01) {
				const linkD2 = config.linkDistance * config.linkDistance;
				for (let i = 0; i < projected.length; i++) {
					const a = projected[i]!;
					if (a.halo) continue;
					for (let j = i + 1; j < projected.length; j++) {
						const b = projected[j]!;
						if (b.halo) continue;
						const dx = a.x - b.x;
						const dy = a.y - b.y;
						const dist2 = dx * dx + dy * dy;
						if (dist2 < linkD2) {
							const dist = Math.sqrt(dist2);
							const closeness = 1 - dist / config.linkDistance;
							const alpha =
								closeness * 0.14 * Math.min(a.z, b.z) * linkAlphaMul;
							ctx.strokeStyle = `rgba(190, 170, 255, ${alpha})`;
							ctx.lineWidth = 0.6 / camScale;
							ctx.beginPath();
							ctx.moveTo(a.x, a.y);
							ctx.lineTo(b.x, b.y);
							ctx.stroke();
						}
					}
				}
			}

			for (const p of projected) {
				ctx.beginPath();
				ctx.fillStyle = `hsla(${p.hue}, 90%, 82%, ${p.alpha})`;
				ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
				ctx.fill();
				if (p.z > 0.75 && !p.halo) {
					ctx.beginPath();
					ctx.fillStyle = `hsla(${p.hue}, 90%, 88%, ${p.alpha * 0.22})`;
					ctx.arc(p.x, p.y, p.radius * 3.2, 0, Math.PI * 2);
					ctx.fill();
				}
			}

			ctx.restore();

			// Warp flash + progression
			if (warpT > 0) {
				warpT += dt * (1000 / WARP_DURATION);

				// Flash is a sharp bell curve. Forward: peaks near the APEX (end of
				// zoom-in). Reverse: peaks at the START (we're already zoomed in,
				// camera then pulls back to reveal the galaxy).
				const flashCenter = warpMode === "forward" ? WARP_APEX : 0;
				const flashWidth = 0.1;
				const d = (warpT - flashCenter) / flashWidth;
				const flashAlpha = Math.exp(-d * d) * 0.95;
				if (flashAlpha > 0.01) {
					ctx.fillStyle = `rgba(230, 210, 255, ${flashAlpha})`;
					ctx.fillRect(0, 0, width, height);
				}

				// Forward regenerates under the flash at the apex. Reverse already
				// regenerated at warp start, so it only needs to release the camera
				// lock once we've reached the wide view.
				if (warpStarIndex !== -1 && warpT >= WARP_APEX) {
					warpStarIndex = -1;
					if (warpMode === "forward") {
						rotation = 0;
						config = randomGalaxyConfig();
						seed();
					}
				}

				if (warpT >= 1) {
					warpT = 0;
				}
			}

			raf = requestAnimationFrame(tick);
		}

		function onMouseMove(e: MouseEvent) {
			mouse.target.x = (e.clientX / window.innerWidth) * 2 - 1;
			mouse.target.y = (e.clientY / window.innerHeight) * 2 - 1;
		}

		function onVisibilityChange() {
			if (document.hidden) {
				cancelAnimationFrame(raf);
			} else {
				lastTime = 0;
				raf = requestAnimationFrame(tick);
			}
		}

		resize();
		window.addEventListener("resize", resize);
		window.addEventListener("mousemove", onMouseMove);
		document.addEventListener("visibilitychange", onVisibilityChange);
		raf = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", resize);
			window.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, []);

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
		>
			<div className="nebula nebula-1" />
			<div className="nebula nebula-2" />
			<div className="nebula nebula-3" />
			<canvas ref={canvasRef} className="absolute inset-0" />
			<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,var(--background)_100%)] opacity-75" />
		</div>
	);
}
