"use client";

import { useQuery } from "@tanstack/react-query";
import type { AppliedRulesResponse } from "@/components/features/rules/types";

/**
 * Fetch all rules applied to one asset, with enforcement context.
 */
export function useAssetRules(assetUid: string) {
	return useQuery<AppliedRulesResponse>({
		queryKey: ["rules", "for-asset", assetUid],
		queryFn: async () => {
			const res = await fetch(`/api/holocron/rules/for-asset/${assetUid}`, {
				cache: "no-store",
			});
			if (!res.ok) throw new Error(`Failed to load rules (${res.status})`);
			return res.json();
		},
		enabled: assetUid.length > 0,
	});
}
