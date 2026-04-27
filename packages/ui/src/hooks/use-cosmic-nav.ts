"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { warp } from "@/lib/galaxy-store";

/** Forward warp delays the route swap until the flash peaks at the end of
 *  the zoom-in so the page change happens under cover of the flash.
 *  Anchored to WARP_DURATION = 1500ms and WARP_APEX = 0.88 in
 *  galaxy-background.tsx: 0.88 * 1500 ≈ 1320ms. */
const FORWARD_NAV_DELAY = 1280;

function isHome(pathname: string): boolean {
	return pathname === "/";
}

/**
 * Navigation wrapper that animates transitions through the galaxy.
 * - Leaving the home page triggers a forward warp (zoom INTO a star) and
 *   delays navigation so the old page shows the whole zoom-in. The flash
 *   at the apex covers the page swap.
 * - Returning to home triggers a reverse warp and navigates immediately —
 *   the galaxy regenerates under the opening flash and the entire
 *   zoom-out plays on the destination (home), so the user actually sees
 *   the dramatic pull-back.
 * - Any other path-to-path jump falls through to a plain router.push.
 */
export function useCosmicNav() {
	const router = useRouter();
	const pathname = usePathname();

	return useCallback(
		(href: string) => {
			const from = pathname;
			const to = href;
			if (!to || to === from) return;

			const leavingHome = isHome(from) && !isHome(to);
			const goingHome = !isHome(from) && isHome(to);

			if (leavingHome) {
				warp("forward");
				setTimeout(() => router.push(to), FORWARD_NAV_DELAY);
				return;
			}
			if (goingHome) {
				warp("reverse");
				router.push(to);
				return;
			}
			router.push(to);
		},
		[pathname, router],
	);
}
