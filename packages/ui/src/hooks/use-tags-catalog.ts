"use client";

import type { TagList } from "@squat-collective/holocron-ts";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetch the catalog-wide tag list with usage counts. Used to power
 * the asset-create wizard's tag autosuggest, so a 5-minute stale
 * window is plenty — typing-induced refetches would just waste
 * round-trips.
 */
export function useTagsCatalog() {
	return useQuery<TagList>({
		queryKey: ["tags-catalog"],
		queryFn: async () => {
			const res = await fetch("/api/holocron/tags");
			if (!res.ok) throw new Error(`Failed to load tags (${res.status})`);
			return res.json();
		},
		staleTime: 5 * 60 * 1000,
	});
}
