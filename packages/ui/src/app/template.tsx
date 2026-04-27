/**
 * Next.js template.tsx re-mounts on every navigation (unlike layout.tsx
 * which persists). That makes it the cleanest place to run an enter-
 * animation for page content, syncing foreground motion with the
 * persistent galaxy canvas behind it.
 *
 * - Forward warp (home → page): content lands at its apex and fades in
 *   under the flash, feeling like "arriving at a star".
 * - Reverse warp (page → home): home mounts fresh and blooms in while
 *   the galaxy pulls back, feeling like "emerging into open space".
 */
export default function Template({ children }: { children: React.ReactNode }) {
	return (
		<div
			className="flex-1 relative animate-in fade-in-0 zoom-in-[0.98] duration-500 ease-out"
			style={{ transformOrigin: "center 30%" }}
		>
			{children}
		</div>
	);
}
