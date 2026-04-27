"use client";

import { useQuery } from "@tanstack/react-query";

/** Shape from the Python /search endpoint. Field names use snake_case because
 *  the backend speaks snake_case; we expose them as-is to keep the wire
 *  contract honest. */
export type CatalogHit =
	| {
			kind: "asset";
			uid: string;
			name: string;
			description: string | null;
			type: "dataset" | "report" | "process" | "system";
			status: string;
	  }
	| {
			kind: "container";
			asset_uid: string;
			asset_name: string;
			name: string;
			path: string;
			container_type?: string | null;
			description?: string | null;
	  }
	| {
			kind: "field";
			asset_uid: string;
			asset_name: string;
			name: string;
			path: string;
			data_type?: string | null;
			pii: boolean;
			description?: string | null;
	  }
	| {
			kind: "actor";
			uid: string;
			name: string;
			type: "person" | "group";
			email?: string | null;
			description?: string | null;
	  }
	| {
			kind: "rule";
			uid: string;
			name: string;
			description: string;
			severity: "info" | "warning" | "critical";
			category?: string | null;
	  };

export interface CatalogSearchResults {
	/** Hits in the order the backend returned them — already interleaved by
	 *  cosine-similarity score, so the best match (of any kind) is at index 0.
	 *  The UI must **not** re-sort by kind. */
	items: CatalogHit[];
	/** Per-kind bucket views. Handy when a caller wants to count or pull
	 *  only one kind without re-scanning `items`. */
	assets: Extract<CatalogHit, { kind: "asset" }>[];
	containers: Extract<CatalogHit, { kind: "container" }>[];
	fields: Extract<CatalogHit, { kind: "field" }>[];
	actors: Extract<CatalogHit, { kind: "actor" }>[];
	rules: Extract<CatalogHit, { kind: "rule" }>[];
	total: number;
}

interface SearchResponse {
	items: CatalogHit[];
	total: number;
}

/** Stable identifier for a hit. Used for React list keys and for memo
 *  comparators so previews / rows don't re-render on re-fetches that yield
 *  the same conceptual hit. */
export function hitKey(hit: CatalogHit): string {
	switch (hit.kind) {
		case "asset":
		case "actor":
		case "rule":
			return `${hit.kind}-${hit.uid}`;
		case "container":
		case "field":
			return `${hit.kind}-${hit.asset_uid}-${hit.path}`;
	}
}

/** Return the URL a hit navigates to. */
export function hitHref(hit: CatalogHit): string {
	switch (hit.kind) {
		case "asset":
			return `/assets/${hit.uid}`;
		case "actor":
			return `/actors/${hit.uid}`;
		case "rule":
			return `/rules/${hit.uid}`;
		case "container":
		case "field": {
			// Schema nodes don't have their own page — they live inside the
			// parent asset. Pass the path as a query param so the asset page
			// can scroll the Data Schema brick to the right row and highlight
			// it.
			const segments = hit.path
				.split(" / ")
				.map((s) => encodeURIComponent(s))
				.filter(Boolean);
			if (segments.length === 0) return `/assets/${hit.asset_uid}`;
			return `/assets/${hit.asset_uid}?schema=${segments.join("/")}`;
		}
	}
}

/** Hits in relevance order — the server already sorts. */
export function flattenResults(results: CatalogSearchResults): CatalogHit[] {
	return results.items;
}

const EMPTY: CatalogSearchResults = {
	items: [],
	assets: [],
	containers: [],
	fields: [],
	actors: [],
	rules: [],
	total: 0,
};

/**
 * Cross-catalog search — single request to the Python /search endpoint.
 * Server filters across assets, actors, rules, schema containers + fields.
 * Query is lazy: only fires when the user has typed something.
 */
export function useCatalogSearch(query: string): {
	results: CatalogSearchResults;
	isLoading: boolean;
	isFetching: boolean;
} {
	const needle = query.trim();
	const hasQuery = needle.length > 0;

	const { data, isLoading, isFetching } = useQuery<SearchResponse>({
		queryKey: ["catalog-search", needle],
		queryFn: async () => {
			const params = new URLSearchParams({ q: needle, limit: "60" });
			const res = await fetch(`/api/holocron/search?${params}`);
			if (!res.ok) throw new Error(`Search failed (${res.status})`);
			return res.json();
		},
		enabled: hasQuery,
		staleTime: 30_000,
		placeholderData: (prev) => prev,
	});

	if (!hasQuery || !data) {
		return { results: EMPTY, isLoading, isFetching };
	}

	const results: CatalogSearchResults = {
		items: data.items,
		assets: [],
		containers: [],
		fields: [],
		actors: [],
		rules: [],
		total: data.total,
	};
	for (const item of data.items) {
		switch (item.kind) {
			case "asset":
				results.assets.push(item);
				break;
			case "container":
				results.containers.push(item);
				break;
			case "field":
				results.fields.push(item);
				break;
			case "actor":
				results.actors.push(item);
				break;
			case "rule":
				results.rules.push(item);
				break;
		}
	}
	return { results, isLoading, isFetching };
}
