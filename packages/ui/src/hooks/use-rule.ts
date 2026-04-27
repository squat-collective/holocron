"use client";

import { useQuery } from "@tanstack/react-query";
import type { Rule } from "@/components/features/rules/types";

/** Fetch a single rule by UID. */
export function useRule(uid: string) {
	return useQuery<Rule>({
		queryKey: ["rules", "detail", uid],
		queryFn: async () => {
			const res = await fetch(`/api/holocron/rules/${uid}`, {
				cache: "no-store",
			});
			if (!res.ok) throw new Error(`Failed to load rule (${res.status})`);
			return res.json();
		},
		enabled: uid.length > 0,
	});
}
