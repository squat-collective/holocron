"use client";

import { useQuery } from "@tanstack/react-query";
import type { GraphMap, LodTier } from "@squat-collective/holocron-ts";

/**
 * Fetch the data-landscape map at a given LOD. Cache-friendly: the
 * layout doesn't change between clicks, so we hold it for 5 minutes.
 */
export function useGraphMap(lod: LodTier) {
	return useQuery<GraphMap>({
		queryKey: ["graph-map", lod],
		queryFn: async () => {
			const response = await fetch(
				`/api/holocron/graph/map?lod=${lod}`,
			);
			if (!response.ok) throw new Error("Failed to fetch graph map");
			return response.json();
		},
		staleTime: 5 * 60 * 1000,
	});
}
