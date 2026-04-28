"use client";

import type { Webhook } from "@squat-collective/holocron-ts";
import {
	AlertCircle,
	CheckCircle2,
	Copy,
	Plus,
	Send,
	Trash2,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CreateWebhookDialog } from "@/components/features/settings/create-webhook-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GalaxySpinner } from "@/components/ui/galaxy-spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	useDeleteWebhook,
	useTestWebhook,
	useUpdateWebhook,
	useWebhooks,
} from "@/hooks/use-webhooks";

/**
 * Workspace-level webhook subscription manager. Surfaces the auto-
 * disable signal that's invisible from the API today: a webhook that
 * silently stops firing after consecutive failures shows up here as
 * "auto-disabled" with the last error and a one-click re-enable.
 */
export default function WebhooksSettingsPage() {
	const { data, isLoading, error } = useWebhooks();
	const [createOpen, setCreateOpen] = useState(false);

	return (
		<TooltipProvider>
			<main className="w-full min-h-[calc(100dvh-3.625rem)] flex flex-col px-6 py-6 gap-4 max-w-5xl mx-auto">
				<header className="flex items-start justify-between gap-4 flex-wrap">
					<div>
						<h1 className="text-2xl font-semibold">Webhooks</h1>
						<p className="text-sm text-muted-foreground mt-1 max-w-xl">
							Receivers get an HMAC-signed POST whenever a subscribed event
							fires. After enough consecutive failures a webhook is
							auto-disabled — re-enable it from the row to clear the failure
							counter.
						</p>
					</div>
					<Button onClick={() => setCreateOpen(true)}>
						<Plus className="size-4" />
						New webhook
					</Button>
				</header>

				{isLoading ? (
					<div className="flex justify-center py-16">
						<GalaxySpinner size={120} label="Loading webhooks…" />
					</div>
				) : error ? (
					<div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
						Failed to load webhooks: {error.message}
					</div>
				) : !data || data.items.length === 0 ? (
					<EmptyState onCreate={() => setCreateOpen(true)} />
				) : (
					<div className="flex flex-col gap-2">
						{data.items.map((webhook) => (
							<WebhookRow key={webhook.uid} webhook={webhook} />
						))}
					</div>
				)}

				<CreateWebhookDialog open={createOpen} onOpenChange={setCreateOpen} />
			</main>
		</TooltipProvider>
	);
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
	return (
		<Card className="border-dashed">
			<CardContent className="flex flex-col items-center gap-4 py-12 text-center">
				<div className="size-12 rounded-full bg-muted/40 flex items-center justify-center">
					<Send className="size-5 text-muted-foreground" />
				</div>
				<div>
					<p className="font-medium">No webhooks yet</p>
					<p className="text-sm text-muted-foreground mt-1 max-w-md">
						Register a receiver URL to be notified when assets, actors, rules,
						or relations change.
					</p>
				</div>
				<Button onClick={onCreate}>
					<Plus className="size-4" />
					New webhook
				</Button>
			</CardContent>
		</Card>
	);
}

function WebhookRow({ webhook }: { webhook: Webhook }) {
	const update = useUpdateWebhook(webhook.uid);
	const del = useDeleteWebhook();
	const test = useTestWebhook();

	const isAutoDisabled = webhook.disabled && webhook.failure_count > 0;

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between gap-3 flex-wrap">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 flex-wrap">
							<CardTitle className="text-base font-mono break-all">
								{webhook.url}
							</CardTitle>
							<StatusBadge webhook={webhook} />
						</div>
						{webhook.description && (
							<p className="text-sm text-muted-foreground mt-1.5">
								{webhook.description}
							</p>
						)}
					</div>
					<div className="flex items-center gap-1.5">
						{isAutoDisabled && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										variant="outline"
										onClick={() => update.mutate({ disabled: false })}
										disabled={update.isPending}
									>
										Re-enable
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									Clear the failure counter and resume delivery.
								</TooltipContent>
							</Tooltip>
						)}
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									onClick={() => test.mutate(webhook.uid)}
									disabled={test.isPending || webhook.disabled}
								>
									<Send className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{webhook.disabled
									? "Disabled — re-enable to test"
									: "Send a synthetic test event"}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									onClick={() => {
										navigator.clipboard.writeText(webhook.uid);
										toast.success("Webhook UID copied");
									}}
								>
									<Copy className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Copy webhook UID</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									onClick={() => {
										if (
											!confirm(
												`Delete this webhook?\n\n${webhook.url}\n\nThe receiver will stop getting events. This cannot be undone.`,
											)
										)
											return;
										del.mutate(webhook.uid);
									}}
									disabled={del.isPending}
								>
									<Trash2 className="size-4 text-destructive" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Delete webhook</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</CardHeader>
			<CardContent className="text-sm space-y-1.5">
				<MetaLine label="Events">
					<div className="flex flex-wrap gap-1">
						{webhook.events.map((evt) => (
							<Badge key={evt} variant="secondary" className="font-mono text-[11px]">
								{evt}
							</Badge>
						))}
					</div>
				</MetaLine>
				<MetaLine label="Last fired">
					{webhook.last_fired_at
						? new Date(webhook.last_fired_at).toLocaleString()
						: "never"}
				</MetaLine>
				{webhook.failure_count > 0 && (
					<MetaLine label="Failures">
						<span className="text-destructive">
							{webhook.failure_count} consecutive
							{webhook.last_error && (
								<span className="text-muted-foreground ml-2 font-mono text-xs">
									— {webhook.last_error}
								</span>
							)}
						</span>
					</MetaLine>
				)}
			</CardContent>
		</Card>
	);
}

function StatusBadge({ webhook }: { webhook: Webhook }) {
	if (webhook.disabled && webhook.failure_count > 0) {
		return (
			<Badge variant="destructive" className="gap-1">
				<XCircle className="size-3" />
				Auto-disabled
			</Badge>
		);
	}
	if (webhook.disabled) {
		return (
			<Badge variant="outline" className="gap-1 text-muted-foreground">
				<XCircle className="size-3" />
				Disabled
			</Badge>
		);
	}
	if (webhook.failure_count > 0) {
		return (
			<Badge variant="outline" className="gap-1 text-amber-600 border-amber-600/40">
				<AlertCircle className="size-3" />
				Failing
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-600/40">
			<CheckCircle2 className="size-3" />
			Active
		</Badge>
	);
}

function MetaLine({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-start gap-2">
			<span className="text-[10px] uppercase tracking-wide text-muted-foreground w-20 shrink-0 mt-1">
				{label}
			</span>
			<div className="flex-1 min-w-0">{children}</div>
		</div>
	);
}
