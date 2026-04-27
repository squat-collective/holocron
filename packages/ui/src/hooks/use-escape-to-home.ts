"use client";

import { useEffect } from "react";
import { useCosmicNav } from "@/hooks/use-cosmic-nav";

/**
 * Detail-page shortcut: plain Escape navigates to `href`. Default is "/" so
 * existing detail pages keep their old behavior. Sub-pages (e.g. the schema
 * editor under an asset) pass `/assets/{uid}` to bounce back to the parent.
 *
 * Skips when a dialog / popover is open or the user is typing in a field.
 */
export function useEscapeTo(href: string) {
	const cosmicNav = useCosmicNav();

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || e.defaultPrevented) return;

			// Any Radix dialog or popover open? They manage Escape themselves.
			if (document.querySelector('[role="dialog"][data-state="open"]')) return;
			if (document.querySelector("[data-radix-popper-content-wrapper]")) {
				return;
			}

			const target = e.target as HTMLElement | null;
			if (
				target?.isContentEditable ||
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.tagName === "SELECT"
			) {
				return;
			}

			if (window.location.pathname === href) return;
			e.preventDefault();
			cosmicNav(href);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [cosmicNav, href]);
}

/** Backwards-compat shortcut for the common case (back to /). */
export function useEscapeToHome() {
	useEscapeTo("/");
}
