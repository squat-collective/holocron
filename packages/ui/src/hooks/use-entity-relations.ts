"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "@/lib/query-keys";

export type RelationTypeName =
	| "owns"
	| "uses"
	| "feeds"
	| "contains"
	| "member_of"
	| "applies_to";

export interface Relation {
	uid: string;
	type: RelationTypeName | string;
	from_uid: string;
	to_uid: string;
	created_at: string;
}

export interface RelationActor {
	uid: string;
	type: "person" | "group";
	name: string;
	email: string | null;
}

export interface RelationAsset {
	uid: string;
	type: "dataset" | "report" | "process" | "system";
	name: string;
}

export type RelationEntity =
	| (RelationActor & { entityType: "actor" })
	| (RelationAsset & { entityType: "asset" });

/**
 * Outgoing = this entity is the `from_uid` (source).
 * Incoming = this entity is the `to_uid` (target).
 */
export interface DirectedRelation {
	relation: Relation;
	/** The entity on the OTHER side of the relation. */
	other: RelationEntity;
	/** "outgoing" if the current entity is the source, "incoming" otherwise. */
	direction: "outgoing" | "incoming";
}

export interface EntityRelations {
	/** All relations involving this entity. */
	all: DirectedRelation[];
	/** Grouped by relation type name. */
	byType: Record<string, DirectedRelation[]>;
}

interface RelationsApi {
	items: Relation[];
	total?: number;
}

interface ActorShape {
	uid: string;
	type: string;
	name: string;
	email?: string | null;
}

interface AssetShape {
	uid: string;
	type: string;
	name: string;
}

const FIVE_MINUTES = 5 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Filtered relation fetches                                           */
/* ------------------------------------------------------------------ */
/*
 * The previous version asked the API for up to 100 relations with *no*
 * filter and then sifted client-side. Correct for small graphs, silently
 * wrong past 100 relations: anything outside the first page disappeared
 * from every UI that used this hook — a real bug visible on the current
 * Rebel fixture.
 *
 * Now we hit the filtered endpoints the backend already exposes:
 *   /relations?from_uid=X&limit=100
 *   /relations?to_uid=X  &limit=100
 * Both come back scoped to the entity, independent of catalog size.
 *
 * Counterparties are resolved via individual `/entities/{uid}` fetches —
 * one call per counterparty, label-agnostic, React Query caches each by
 * uid so previewing many entities in a row reuses shared counterparties.
 */

function useRelationsFor(entityUid: string, direction: "from" | "to") {
	return useQuery<RelationsApi>({
		queryKey: [
			...queryKeys.relations.all,
			"for-entity",
			direction,
			entityUid,
		],
		queryFn: async () => {
			const qs =
				direction === "from"
					? `from_uid=${encodeURIComponent(entityUid)}`
					: `to_uid=${encodeURIComponent(entityUid)}`;
			const res = await fetch(
				`/api/holocron/relations?${qs}&limit=100`,
			);
			if (!res.ok) throw new Error("Failed to fetch relations");
			return res.json();
		},
		enabled: !!entityUid,
		staleTime: FIVE_MINUTES,
	});
}

/** Resolve a counterparty by uid via the polymorphic /entities endpoint.
 *
 *  Returns `null` (not `undefined`) on miss: TanStack Query v5 rejects
 *  `undefined` query results, and we use null to signal "skip this
 *  counterparty" downstream — `counterpartyMap`'s `if (uid && resolved)`
 *  guard filters them out of the rendered relations list.
 *
 *  Rule counterparties resolve fine but the existing relation rendering
 *  (RelationActor + RelationAsset) doesn't have a Rule branch yet, so
 *  we drop them here and surface the same "no Rule in the panel" effect
 *  the old fallback produced via 404 — minus every rule (and asset)
 *  generating a 404 along the way. */
async function fetchEntity(
	uid: string,
): Promise<RelationEntity | null> {
	const res = await fetch(`/api/holocron/entities/${uid}`);
	if (!res.ok) return null;
	const body = (await res.json()) as
		| { kind: "asset"; asset: AssetShape }
		| { kind: "actor"; actor: ActorShape }
		| { kind: "rule" };

	if (body.kind === "actor") {
		const a = body.actor;
		return {
			uid: a.uid,
			name: a.name,
			type: a.type === "person" || a.type === "group" ? a.type : "person",
			email: a.email ?? null,
			entityType: "actor" as const,
		};
	}

	if (body.kind === "asset") {
		const a = body.asset;
		// Map unknown asset types to a safe default so the UI never blows up.
		const validTypes = ["dataset", "report", "process", "system"] as const;
		const type = validTypes.includes(a.type as (typeof validTypes)[number])
			? (a.type as (typeof validTypes)[number])
			: "dataset";
		return {
			uid: a.uid,
			name: a.name,
			type,
			entityType: "asset" as const,
		};
	}

	// kind === "rule" → drop. No 404, no console noise.
	return null;
}

/**
 * Fetches every relation involving `entityUid`. Two filtered API calls
 * (outgoing + incoming) get merged; counterparties are resolved via
 * per-uid fetches that React Query dedupes + caches across the session.
 */
export function useEntityRelations(entityUid: string): {
	data: EntityRelations | undefined;
	isLoading: boolean;
	error: Error | null;
} {
	const outgoingQ = useRelationsFor(entityUid, "from");
	const incomingQ = useRelationsFor(entityUid, "to");

	// Collect counterparty uids and kick off individual resolvers. useQueries
	// lets React Query track each counterparty as its own cache entry so the
	// same person/team/asset shows up instantly the next time we need them.
	const counterpartyUids = useMemo(() => {
		const uids = new Set<string>();
		for (const r of outgoingQ.data?.items ?? []) uids.add(r.to_uid);
		for (const r of incomingQ.data?.items ?? []) uids.add(r.from_uid);
		return [...uids];
	}, [outgoingQ.data, incomingQ.data]);

	// `useQueries` returns a *new* array every render — if we depended on it
	// directly, every render would invalidate the memo below and the
	// consumer's `useEffect(…, [graph.nodes, graph.edges])` would loop.
	// Instead we derive a stable Map keyed by uid, memoized on a string
	// signature that only changes when the resolution state actually moves.
	const counterpartyQueries = useQueries({
		queries: counterpartyUids.map((uid) => ({
			queryKey: ["entity-by-uid", uid],
			queryFn: () => fetchEntity(uid),
			staleTime: FIVE_MINUTES,
			enabled: !!uid,
		})),
	});

	const counterpartiesLoading = counterpartyQueries.some((q) => q.isLoading);

	const resolvedSignature = counterpartyQueries
		.map((q, i) => (q.data ? counterpartyUids[i] : ""))
		.join("|");

	const counterpartyMap = useMemo(() => {
		const m = new Map<string, RelationEntity>();
		for (let i = 0; i < counterpartyUids.length; i++) {
			const uid = counterpartyUids[i];
			const resolved = counterpartyQueries[i]?.data;
			if (uid && resolved) m.set(uid, resolved);
		}
		return m;
		// Deps: we intentionally depend on the signature (stable across
		// renders when resolution doesn't change) rather than on the
		// fresh-every-render queries array.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [resolvedSignature]);

	const data = useMemo<EntityRelations | undefined>(() => {
		if (!entityUid) return undefined;
		if (!outgoingQ.data || !incomingQ.data) return undefined;

		const all: DirectedRelation[] = [];
		for (const relation of outgoingQ.data.items) {
			const other = counterpartyMap.get(relation.to_uid);
			if (!other) continue;
			all.push({ relation, other, direction: "outgoing" });
		}
		for (const relation of incomingQ.data.items) {
			const other = counterpartyMap.get(relation.from_uid);
			if (!other) continue;
			all.push({ relation, other, direction: "incoming" });
		}

		const byType: Record<string, DirectedRelation[]> = {};
		for (const directed of all) {
			const key = `${directed.relation.type}:${directed.direction}`;
			if (!byType[key]) byType[key] = [];
			byType[key].push(directed);
		}

		return { all, byType };
	}, [entityUid, outgoingQ.data, incomingQ.data, counterpartyMap]);

	return {
		data,
		isLoading:
			outgoingQ.isLoading || incomingQ.isLoading || counterpartiesLoading,
		error:
			(outgoingQ.error as Error | null) ??
			(incomingQ.error as Error | null) ??
			null,
	};
}
