"use client";

import { useEffect } from "react";

/**
 * Wire `g` / `d` keyboard shortcuts on a detail page to switch between the
 * graph and details tabs. Skips when a dialog is open or when the user is
 * typing in an input-like element — plain letter shortcuts must never
 * hijack text entry.
 */
export function useDetailTabShortcuts(
	setTab: (t: "graph" | "details") => void,
): void {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "g" && e.key !== "d") return;
			if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
			if (e.defaultPrevented) return;

			const target = e.target as HTMLElement | null;
			if (
				target?.isContentEditable ||
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.tagName === "SELECT"
			) {
				return;
			}
			if (document.querySelector('[role="dialog"][data-state="open"]')) return;

			e.preventDefault();
			setTab(e.key === "g" ? "graph" : "details");
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [setTab]);
}
