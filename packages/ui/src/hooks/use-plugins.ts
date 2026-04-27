"use client";

import { useQuery } from "@tanstack/react-query";
import type { PluginManifest } from "@/lib/plugins";

interface PluginListResponse {
	plugins: PluginManifest[];
}

/**
 * Fetch the registered plugin manifests once per session. Manifests are
 * declared at app boot in the API and don't change at runtime, so the data
 * is treated as effectively immutable — no refetch on focus, long stale
 * window. Failures are silent; the palette just doesn't show plugin
 * commands until the next manual refresh.
 */
export function usePluginManifests() {
	return useQuery<PluginListResponse, Error, PluginManifest[]>({
		queryKey: ["plugins", "list"],
		queryFn: async () => {
			const res = await fetch("/api/holocron/plugins");
			if (!res.ok) throw new Error(`Plugins fetch failed (${res.status})`);
			return (await res.json()) as PluginListResponse;
		},
		select: (data) => data.plugins,
		// Plugins only change at API restart — no need to refetch aggressively.
		staleTime: 5 * 60 * 1000,
		retry: 1,
		refetchOnWindowFocus: false,
	});
}
