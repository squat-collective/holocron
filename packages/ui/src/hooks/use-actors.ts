"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

interface Actor {
	uid: string;
	type: "person" | "group";
	name: string;
	email: string | null;
	description: string | null;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface ActorUpdatePatch {
	name?: string | null;
	email?: string | null;
	description?: string | null;
	verified?: boolean;
	metadata?: Record<string, unknown>;
}

interface ActorsResult {
	items: Actor[];
	total: number;
}

/**
 * Hook for fetching all actors.
 */
export function useActors() {
	return useQuery<ActorsResult>({
		queryKey: queryKeys.actors.lists(),
		queryFn: async () => {
			const response = await fetch("/api/holocron/actors");
			if (!response.ok) {
				throw new Error("Failed to fetch actors");
			}
			return response.json();
		},
	});
}

/**
 * Hook for fetching a single actor by UID.
 */
export function useActor(uid: string) {
	return useQuery<Actor>({
		queryKey: queryKeys.actors.detail(uid),
		queryFn: async () => {
			const response = await fetch(`/api/holocron/actors/${uid}`);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error("Actor not found");
				}
				throw new Error("Failed to fetch actor");
			}
			return response.json();
		},
		enabled: !!uid,
	});
}

/**
 * Hook for updating a single actor field (or multiple). Invalidates the
 * detail + list caches on success so the UI reflects the change.
 */
export function useUpdateActor(uid: string) {
	const queryClient = useQueryClient();
	return useMutation<Actor, Error, ActorUpdatePatch>({
		mutationFn: async (patch) => {
			const response = await fetch(`/api/holocron/actors/${uid}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(patch),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to update actor");
			}
			return response.json();
		},
		onSuccess: (updated, patch) => {
			queryClient.setQueryData(queryKeys.actors.detail(uid), updated);
			queryClient.invalidateQueries({ queryKey: queryKeys.actors.lists() });
			if (patch.verified === true) {
				toast.success(`Marked “${updated.name}” as verified`);
			} else {
				const keys = Object.keys(patch);
				toast.success(
					keys.length === 1 ? `Updated ${keys[0]}` : `Saved changes to “${updated.name}”`,
				);
			}
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});
}
