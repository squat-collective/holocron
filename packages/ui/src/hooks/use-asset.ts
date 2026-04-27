"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

interface Asset {
	uid: string;
	type: "dataset" | "report" | "process" | "system";
	name: string;
	description: string | null;
	location: string | null;
	status: "active" | "deprecated" | "draft";
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface AssetUpdatePatch {
	name?: string | null;
	description?: string | null;
	location?: string | null;
	status?: "active" | "deprecated" | "draft";
	verified?: boolean;
	metadata?: Record<string, unknown>;
}

/**
 * Hook for fetching a single asset by UID.
 */
export function useAsset(uid: string) {
	return useQuery<Asset>({
		queryKey: queryKeys.assets.detail(uid),
		queryFn: async () => {
			const response = await fetch(`/api/holocron/assets/${uid}`);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error("Asset not found");
				}
				throw new Error("Failed to fetch asset");
			}
			return response.json();
		},
		enabled: !!uid,
	});
}

/**
 * Hook for updating a single asset field (or multiple). Invalidates the
 * detail + list caches on success so the UI reflects the change.
 */
export function useUpdateAsset(uid: string) {
	const queryClient = useQueryClient();
	return useMutation<Asset, Error, AssetUpdatePatch>({
		mutationFn: async (patch) => {
			const response = await fetch(`/api/holocron/assets/${uid}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(patch),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to update asset");
			}
			return response.json();
		},
		onSuccess: (updated, patch) => {
			queryClient.setQueryData(queryKeys.assets.detail(uid), updated);
			queryClient.invalidateQueries({ queryKey: queryKeys.assets.lists() });
			toast.success(successMessage(patch, updated.name));
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});
}

function successMessage(patch: AssetUpdatePatch, name: string): string {
	if (patch.verified === true) return `Marked “${name}” as verified`;
	if (patch.status) return `Status set to ${patch.status}`;
	const keys = Object.keys(patch);
	if (keys.length === 1) return `Updated ${keys[0]}`;
	return `Saved changes to “${name}”`;
}
