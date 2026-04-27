"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

export interface EntityLite {
	uid: string;
	name: string;
	/** "dataset" | "report" | "process" | "system" for assets; "person" | "group" for actors. */
	type: string;
	entityKind: "asset" | "actor";
}

interface AssetsApi {
	items: {
		uid: string;
		name: string;
		type: "dataset" | "report" | "process" | "system";
	}[];
}
interface ActorsApi {
	items: { uid: string; name: string; type: "person" | "group" }[];
}

/**
 * Fetches every asset + actor once (capped) and returns a UID → lite entry
 * map. Used by the search-result graph to resolve relation endpoints that
 * aren't themselves search hits — so the graph can show neighbors and
 * actual lineage instead of a set of disconnected nodes.
 */
export function useAllEntities(limit = 500) {
	return useQuery<Map<string, EntityLite>>({
		queryKey: [...queryKeys.assets.all, "all-entities", limit],
		queryFn: async () => {
			const [assetsRes, actorsRes] = await Promise.all([
				fetch(`/api/holocron/assets?limit=${limit}`),
				fetch(`/api/holocron/actors?limit=${limit}`),
			]);
			if (!assetsRes.ok) throw new Error("Failed to fetch assets");
			if (!actorsRes.ok) throw new Error("Failed to fetch actors");
			const assets: AssetsApi = await assetsRes.json();
			const actors: ActorsApi = await actorsRes.json();

			const m = new Map<string, EntityLite>();
			for (const a of assets.items) {
				m.set(a.uid, {
					uid: a.uid,
					name: a.name,
					type: a.type,
					entityKind: "asset",
				});
			}
			for (const a of actors.items) {
				m.set(a.uid, {
					uid: a.uid,
					name: a.name,
					type: a.type,
					entityKind: "actor",
				});
			}
			return m;
		},
		staleTime: 30_000,
	});
}
