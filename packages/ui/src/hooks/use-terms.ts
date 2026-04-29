"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Term, TermCreate } from "@squat-collective/holocron-ts";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

interface TermListResponse {
	items: Term[];
	total: number;
}

interface TermsListFilters {
	domain?: string;
	status?: "draft" | "approved" | "deprecated";
	pii?: boolean;
}

/**
 * List terms with optional filters. Filters AND together server-side.
 */
export function useTerms(filters?: TermsListFilters) {
	return useQuery<TermListResponse>({
		queryKey: queryKeys.terms.list(filters),
		queryFn: async () => {
			const params = new URLSearchParams();
			if (filters?.domain) params.set("domain", filters.domain);
			if (filters?.status) params.set("status", filters.status);
			if (filters?.pii !== undefined) params.set("pii", String(filters.pii));
			const qs = params.toString();
			const url = qs ? `/api/holocron/terms?${qs}` : "/api/holocron/terms";
			const response = await fetch(url);
			if (!response.ok) throw new Error("Failed to load terms");
			return response.json();
		},
	});
}

/**
 * Create a new term. Refetches the list on success and surfaces a toast.
 */
export function useCreateTerm() {
	const queryClient = useQueryClient();
	return useMutation<Term, Error, TermCreate>({
		mutationFn: async (term) => {
			const response = await fetch("/api/holocron/terms", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(term),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as
					| { detail?: string }
					| null;
				throw new Error(body?.detail ?? "Failed to create term");
			}
			return response.json();
		},
		onSuccess: (term) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.terms.lists() });
			toast.success(`Created term “${term.name}”`);
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});
}
