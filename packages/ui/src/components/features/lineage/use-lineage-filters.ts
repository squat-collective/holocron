"use client";

import { useState } from "react";
import type { LineageFilters } from "./lineage-graph";

/**
 * Lineage-graph filter state. Kept trivial for v1 — persists nothing across
 * reloads. Swap the `useState` for a URL-sync hook later if users start
 * bookmarking filtered views.
 *
 * We track what to HIDE (not what to show) so a fresh graph always starts
 * with every type visible regardless of what relations/types come back.
 */
export function useFilters(): [
	LineageFilters,
	(next: LineageFilters) => void,
] {
	const [state, setState] = useState<LineageFilters>({
		hiddenEntityTypes: new Set<string>(),
		hiddenRelationTypes: new Set<string>(),
		rules: true,
		direction: "both",
	});
	return [state, setState];
}
