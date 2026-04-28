"use client";

import type {
	Webhook,
	WebhookCreate,
	WebhookCreated,
	WebhookUpdate,
} from "@squat-collective/holocron-ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

interface WebhookList {
	items: Webhook[];
	total: number;
}

/**
 * List registered webhooks. Polled every 30 s so the list reflects
 * auto-disable / failure-count updates without manual refresh.
 */
export function useWebhooks() {
	return useQuery<WebhookList>({
		queryKey: queryKeys.webhooks.list(),
		queryFn: async () => {
			const res = await fetch("/api/holocron/webhooks");
			if (!res.ok) throw new Error(`Failed to load webhooks (${res.status})`);
			return res.json();
		},
		refetchInterval: 30_000,
	});
}

/**
 * Create a webhook. The resolved value contains the one-shot HMAC
 * `secret` — callers MUST surface it to the user immediately, the API
 * will not return it again.
 */
export function useCreateWebhook() {
	const queryClient = useQueryClient();
	return useMutation<WebhookCreated, Error, WebhookCreate>({
		mutationFn: async (input) => {
			const res = await fetch("/api/holocron/webhooks", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = await res.text();
				throw new Error(body || `Create failed (${res.status})`);
			}
			return res.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});
}

/**
 * Partial update. Setting `disabled: false` re-enables a webhook that
 * was auto-disabled and clears the failure counter.
 */
export function useUpdateWebhook(uid: string) {
	const queryClient = useQueryClient();
	return useMutation<Webhook, Error, WebhookUpdate>({
		mutationFn: async (input) => {
			const res = await fetch(`/api/holocron/webhooks/${uid}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body = await res.text();
				throw new Error(body || `Update failed (${res.status})`);
			}
			return res.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});
}

export function useDeleteWebhook() {
	const queryClient = useQueryClient();
	return useMutation<void, Error, string>({
		mutationFn: async (uid) => {
			const res = await fetch(`/api/holocron/webhooks/${uid}`, {
				method: "DELETE",
			});
			if (!res.ok && res.status !== 204) {
				const body = await res.text();
				throw new Error(body || `Delete failed (${res.status})`);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});
}

/**
 * Fire a synthetic event at the receiver. Useful for verifying wiring
 * after first registering a webhook. Failed deliveries count toward
 * the auto-disable threshold the same way real events do.
 */
export function useTestWebhook() {
	const queryClient = useQueryClient();
	return useMutation<{ delivered: boolean }, Error, string>({
		mutationFn: async (uid) => {
			const res = await fetch(`/api/holocron/webhooks/${uid}/test`, {
				method: "POST",
			});
			if (!res.ok) {
				const body = await res.text();
				throw new Error(body || `Test failed (${res.status})`);
			}
			return res.json();
		},
		onSuccess: (data, uid) => {
			// Refetch — a failed test increments the failure counter on
			// the receiver and might have flipped `disabled`.
			queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all });
			if (data.delivered) {
				toast.success("Test event delivered");
			} else {
				toast.error(
					"Test event failed — receiver did not return 2xx. Check the URL and the receiver logs.",
				);
			}
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});
}
