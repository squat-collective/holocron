"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

interface Relation {
	uid: string;
	type: string;
	from_uid: string;
	to_uid: string;
	created_at: string;
}

interface RelationsResult {
	items: Relation[];
	total: number;
}

interface Actor {
	uid: string;
	type: "person" | "group";
	name: string;
	email: string | null;
}

interface Asset {
	uid: string;
	type: "dataset" | "report" | "process" | "system";
	name: string;
}

interface ActorsResult {
	items: Actor[];
}

interface AssetsResult {
	items: Asset[];
}

export interface AssetRelations {
	// Who owns/stewards this asset
	owners: { relation: Relation; actor: Actor }[];
	// Who/what uses this asset (downstream)
	users: { relation: Relation; entity: Actor | Asset }[];
}

/**
 * Hook to fetch all relations for a specific asset.
 * Returns categorized relations with resolved entity names.
 */
export function useAssetRelations(assetUid: string) {
	return useQuery<AssetRelations>({
		queryKey: [...queryKeys.relations.all, "asset", assetUid],
		queryFn: async () => {
			// Fetch all data in parallel
			const [relationsRes, actorsRes, assetsRes] = await Promise.all([
				fetch("/api/holocron/relations?limit=100"),
				fetch("/api/holocron/actors?limit=100"),
				fetch("/api/holocron/assets?limit=100"),
			]);

			if (!relationsRes.ok) throw new Error("Failed to fetch relations");
			if (!actorsRes.ok) throw new Error("Failed to fetch actors");
			if (!assetsRes.ok) throw new Error("Failed to fetch assets");

			const relations: RelationsResult = await relationsRes.json();
			const actors: ActorsResult = await actorsRes.json();
			const assets: AssetsResult = await assetsRes.json();

			// Create lookup maps
			const actorMap = new Map(actors.items.map((a) => [a.uid, a]));
			const assetMap = new Map(assets.items.map((a) => [a.uid, a]));

			// Filter relations involving this asset
			const relevantRelations = relations.items.filter(
				(r) => r.from_uid === assetUid || r.to_uid === assetUid,
			);

			const result: AssetRelations = {
				owners: [],
				users: [],
			};

			for (const relation of relevantRelations) {
				const isTarget = relation.to_uid === assetUid;

				switch (relation.type) {
					case "owns":
						// Actor owns this asset (actor -> asset)
						if (isTarget) {
							const actor = actorMap.get(relation.from_uid);
							if (actor) {
								result.owners.push({ relation, actor });
							}
						}
						break;

					case "uses":
						// Something uses this asset (user -> this)
						if (isTarget) {
							const entity = actorMap.get(relation.from_uid) ?? assetMap.get(relation.from_uid);
							if (entity) {
								result.users.push({ relation, entity: entity as Actor | Asset });
							}
						}
						break;
				}
			}

			return result;
		},
		enabled: !!assetUid,
	});
}
