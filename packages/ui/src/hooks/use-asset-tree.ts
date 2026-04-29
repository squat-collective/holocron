"use client";

import { useQuery } from "@tanstack/react-query";
import type { AssetTreeNode } from "@squat-collective/holocron-ts";
import { queryKeys } from "@/lib/query-keys";

/**
 * Walk the `contains` tree rooted at an asset. Used by the asset
 * detail page to render hierarchical assets (table → columns,
 * sheet → visuals) underneath their parent.
 */
export function useAssetTree(uid: string, depth = 2) {
	return useQuery<AssetTreeNode>({
		queryKey: queryKeys.assets.tree(uid, depth),
		queryFn: async () => {
			const response = await fetch(
				`/api/holocron/assets/${uid}/tree?depth=${depth}`,
			);
			if (!response.ok) {
				if (response.status === 404) throw new Error("Asset not found");
				throw new Error("Failed to fetch asset tree");
			}
			return response.json();
		},
		enabled: !!uid,
	});
}
