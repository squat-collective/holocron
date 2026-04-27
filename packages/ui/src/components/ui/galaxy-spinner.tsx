"use client";

import { cn } from "@/lib/utils";

/**
 * Milky-way loading indicator — small rotating spiral with a glowing gold
 * core. Matches the app's galaxy theme and stays out of the way on small
 * sizes (24-32 px). At medium+ it reads as a "searching the galaxy" moment.
 *
 * Two stacked SVGs rotate at different speeds (inner fast, outer slow) so
 * the spiral has a bit of parallax depth. A middle layer of scattered stars
 * counter-rotates for sparkle. The centre is `--star-gold` with a soft
 * `drop-shadow` glow.
 */
export function GalaxySpinner({
	size = 48,
	label,
	className,
}: {
	/** Outer diameter in px. */
	size?: number;
	/** Optional text below the spinner. */
	label?: string;
	className?: string;
}) {
	const coreSize = Math.max(6, size * 0.18);
	// Scale the label with the spinner so a 160 px galaxy doesn't get a
	// whispery text-xs caption.
	const labelSize =
		size >= 140 ? "text-xl" : size >= 96 ? "text-base" : "text-xs";

	return (
		<div
			className={cn(
				"flex flex-col items-center",
				size >= 140 ? "gap-5" : "gap-2",
				className,
			)}
		>
			<div className="relative" style={{ width: size, height: size }}>
				{/* Outer spiral arms — slow rotation. */}
				<svg
					viewBox="-50 -50 100 100"
					className="absolute inset-0 animate-[spin_6s_linear_infinite]"
					aria-hidden="true"
				>
					{[0, 120, 240].map((angleOffset) => (
						<g key={angleOffset} transform={`rotate(${angleOffset})`}>
							{Array.from({ length: 12 }).map((_, i) => {
								const t = i / 11;
								const theta = (t * Math.PI * 1.1); // half-turn-ish
								const radius = 8 + t * 38;
								const x = Math.cos(theta) * radius;
								const y = Math.sin(theta) * radius;
								const r = 2.5 - t * 2;
								const opacity = 0.9 - t * 0.6;
								return (
									<circle
										// biome-ignore lint/suspicious/noArrayIndexKey: pure-presentation, static array order
										key={i}
										cx={x}
										cy={y}
										r={Math.max(0.5, r)}
										fill="var(--primary)"
										opacity={opacity}
									/>
								);
							})}
						</g>
					))}
				</svg>

				{/* Scattered bright stars — counter-rotation for depth. */}
				<svg
					viewBox="-50 -50 100 100"
					className="absolute inset-0 animate-[spin_14s_linear_infinite_reverse]"
					aria-hidden="true"
				>
					{[
						[16, 10, 1.4],
						[-22, 25, 1.1],
						[30, -15, 1.2],
						[-32, -6, 1.3],
						[6, -30, 1],
						[-10, -22, 0.9],
					].map(([x, y, r], i) => (
						<circle
							// biome-ignore lint/suspicious/noArrayIndexKey: static presentation
							key={i}
							cx={x}
							cy={y}
							r={r}
							fill="var(--star-gold)"
							opacity={0.85}
						/>
					))}
				</svg>

				{/* Golden core with pulsing glow. */}
				<div
					className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-pulse"
					style={{
						width: coreSize,
						height: coreSize,
						background: "var(--star-gold)",
						boxShadow: "0 0 14px var(--star-gold), 0 0 28px var(--star-gold)",
					}}
				/>
			</div>
			{label && (
				<div
					className={cn(
						"text-muted-foreground font-medium tracking-wide",
						labelSize,
					)}
				>
					{label}
				</div>
			)}
		</div>
	);
}
