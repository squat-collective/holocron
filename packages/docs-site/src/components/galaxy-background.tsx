"use client";

/**
 * Holocron Milky Way background — ported from packages/ui's GalaxyBackground
 * with the warp-store cinematics stripped out (the docs surface has no
 * search-driven warps, just an ambient galaxy that breathes).
 *
 * Same scene structure as the portal:
 *   - 3 colored nebula divs (CSS, blurred + drifting)
 *   - canvas with a randomly-generated spiral galaxy:
 *       arm count, tightness, palette, tilt and density re-rolled per session
 *       bulge glow, constellation links, depth-aware twinkle + parallax
 *   - radial vignette div fading to var(--background) at the edges
 *
 * Theme-aware: in light mode the star colors and link alpha are dimmed so
 * prose remains the dominant signal. Re-seeds when the theme flips.
 */

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

interface Star {
	r: number;
	theta: number;
	z: number;
	yOffset: number;
	radius: number;
	baseAlpha: number;
	twinkleSpeed: number;
	twinklePhase: number;
	jitter: number;
	hue: number;
	halo: boolean;
}

interface GalaxyConfig {
	armStars: number;
	haloStars: number;
	armCount: number;
	spiralTightness: number;
	diskTilt: number;
	linkDistance: number;
	rotationSpeed: number;
	armHues: number[];
	bulgeWarm: number;
	sizeScale: number;
}

function pick<T>(arr: readonly T[]): T {
	return arr[Math.floor(Math.random() * arr.length)] as T;
}

function randRange(a: number, b: number): number {
	return a + Math.random() * (b - a);
}

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

export function GalaxyBackground() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const { resolvedTheme } = useTheme();

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const reduced =
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		// Theme tunings — read at effect setup so we re-init cleanly on toggle.
		const isDark = resolvedTheme !== "light";
		const starLightness = isDark ? 82 : 55;
		const starSat = isDark ? 90 : 75;
		const linkAlphaMul = isDark ? 1 : 0.4;
		const bulgeStops: Array<[number, string]> = isDark
			? [
					[0, "rgba(220, 180, 255, 0.22)"],
					[0.35, "rgba(160, 125, 230, 0.10)"],
					[1, "rgba(80, 60, 150, 0)"],
				]
			: [
					[0, "rgba(180, 150, 255, 0.10)"],
					[0.35, "rgba(150, 120, 220, 0.05)"],
					[1, "rgba(80, 60, 150, 0)"],
				];

		let stars: Star[] = [];
		let config: GalaxyConfig = randomGalaxyConfig();
		let width = 0;
		let height = 0;
		let radiusMax = 0;
		let lastTime = 0;
		let rotation = 0;
		let raf = 0;
		const mouse = { x: 0, y: 0, target: { x: 0, y: 0 } };

		function seed() {
			stars = [];
			const {
				armStars,
				haloStars,
				armCount,
				spiralTightness,
				armHues,
				bulgeWarm,
				sizeScale,
			} = config;

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

				let hue: number;
				if (r < 0.18 && Math.random() < 0.7) {
					hue = bulgeWarm + Math.random() * 25;
				} else if (Math.random() < 0.08) {
					hue = 320 + Math.random() * 30;
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

		function tick(now: number) {
			if (!canvas || !ctx) return;
			const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
			lastTime = now;

			if (!reduced) rotation += config.rotationSpeed * dt;

			mouse.x += (mouse.target.x - mouse.x) * 0.04;
			mouse.y += (mouse.target.y - mouse.y) * 0.04;

			ctx.clearRect(0, 0, width, height);

			const cx = width / 2;
			const cy = height / 2;
			const t = now * 0.001;

			ctx.save();

			// Bulge glow (elliptical, scaled with disk tilt)
			ctx.save();
			ctx.translate(cx + mouse.x * 6, cy + mouse.y * 6);
			ctx.scale(1, config.diskTilt + 0.15);
			const bulge = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusMax * 0.45);
			for (const [stop, color] of bulgeStops) bulge.addColorStop(stop, color);
			ctx.fillStyle = bulge;
			ctx.beginPath();
			ctx.arc(0, 0, radiusMax * 0.6, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();

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
				x += mouse.x * PARALLAX * s.z;
				y += mouse.y * PARALLAX * s.z;

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

			// Constellation lines between non-halo stars within link distance
			const linkD2 = config.linkDistance * config.linkDistance;
			for (let i = 0; i < projected.length; i++) {
				const a = projected[i];
				if (!a || a.halo) continue;
				for (let j = i + 1; j < projected.length; j++) {
					const b = projected[j];
					if (!b || b.halo) continue;
					const dx = a.x - b.x;
					const dy = a.y - b.y;
					const dist2 = dx * dx + dy * dy;
					if (dist2 < linkD2) {
						const dist = Math.sqrt(dist2);
						const closeness = 1 - dist / config.linkDistance;
						const alpha =
							closeness * 0.14 * Math.min(a.z, b.z) * linkAlphaMul;
						ctx.strokeStyle = isDark
							? `rgba(190, 170, 255, ${alpha})`
							: `rgba(120, 90, 200, ${alpha})`;
						ctx.lineWidth = 0.6;
						ctx.beginPath();
						ctx.moveTo(a.x, a.y);
						ctx.lineTo(b.x, b.y);
						ctx.stroke();
					}
				}
			}

			for (const p of projected) {
				ctx.beginPath();
				ctx.fillStyle = `hsla(${p.hue}, ${starSat}%, ${starLightness}%, ${p.alpha})`;
				ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
				ctx.fill();
				if (p.z > 0.75 && !p.halo && isDark) {
					ctx.beginPath();
					ctx.fillStyle = `hsla(${p.hue}, 90%, 88%, ${p.alpha * 0.22})`;
					ctx.arc(p.x, p.y, p.radius * 3.2, 0, Math.PI * 2);
					ctx.fill();
				}
			}

			ctx.restore();
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
	}, [resolvedTheme]);

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
