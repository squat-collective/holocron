"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, History, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useListboxNav } from "@/components/features/wizard-shared";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
	closeWizard,
	type EntityEventsParams,
	type EntityEventsResult,
} from "@/lib/wizard-store";

/**
 * Entity events wizard — read-only audit trail for the focused entity.
 *
 * Shape mirrors the backend `EventResponse`: an action (`created` /
 * `updated` / `deleted`), a timestamp, an `actor_uid` for the author, and
 * a `changes` dict that captures what fields moved. We render the
 * timestamp + action + a one-line changes summary; full details live in
 * the events API for now.
 */

interface Frame {
	id: string;
	kind: "entity-events";
	params: EntityEventsParams;
	resolve: (result: EntityEventsResult | null) => void;
}

interface ApiEvent {
	uid: string;
	action: "created" | "updated" | "deleted";
	entity_type: "asset" | "actor" | "relation" | "rule";
	entity_uid: string;
	actor_uid: string | null;
	timestamp: string;
	changes: Record<string, unknown>;
	metadata: Record<string, unknown>;
}

interface ApiEventsList {
	items: ApiEvent[];
	total: number;
}

export function EntityEventsWizard({
	frame,
}: {
	frame: Frame;
	isTop: boolean;
	isNested: boolean;
}) {
	const { entityKind, entityUid, entityName } = frame.params;
	const [open, setOpen] = useState(true);

	const { data, isLoading, error } = useQuery<ApiEventsList>({
		queryKey: ["events", entityUid],
		queryFn: async () => {
			const res = await fetch(
				`/api/holocron/events?entity_uid=${encodeURIComponent(entityUid)}&limit=100`,
			);
			if (!res.ok) throw new Error(`Events fetch failed (${res.status})`);
			return (await res.json()) as ApiEventsList;
		},
		staleTime: 60 * 1000,
	});

	const close = () => {
		setOpen(false);
		closeWizard(frame.id, { closed: true });
	};

	const events = data?.items ?? [];

	// Keyboard nav over the audit trail. Enter copies the event UID to
	// clipboard — the most useful action a power user can take from this
	// dialog (grep the API logs, drop into a debugger, file an issue).
	const { containerProps, itemProps } = useListboxNav({
		items: events,
		onCommit: async (event) => {
			try {
				await navigator.clipboard.writeText(event.uid);
				toast.success("Event UID copied");
			} catch {
				toast.error("Clipboard unavailable");
			}
		},
	});

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) close();
			}}
		>
			<DialogContent className="sm:max-w-2xl bg-card/90 backdrop-blur-xl border-primary/20">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base">
						<History className="size-4 text-primary" />
						<span>History · {entityName}</span>
					</DialogTitle>
					<DialogDescription className="text-xs">
						Audit trail for this {entityKind}.
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-12 w-full" />
						<Skeleton className="h-12 w-full" />
						<Skeleton className="h-12 w-full" />
					</div>
				) : error ? (
					<p className="text-sm text-destructive">{error.message}</p>
				) : events.length === 0 ? (
					<p className="text-sm text-muted-foreground py-6 text-center">
						No events recorded yet.
					</p>
				) : (
					<ScrollArea className="max-h-[60vh] pr-2">
						<ol className="space-y-2" {...containerProps}>
							{events.map((event, idx) => (
								<EventRow
									key={event.uid}
									event={event}
									itemProps={itemProps(idx)}
								/>
							))}
						</ol>
					</ScrollArea>
				)}

				<DialogFooter>
					<Button onClick={close}>Close</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function EventRow({
	event,
	itemProps,
}: {
	event: ApiEvent;
	itemProps: ReturnType<typeof useListboxNav<ApiEvent>>["itemProps"] extends (
		idx: number,
	) => infer R
		? R
		: never;
}) {
	const Icon = actionIcon(event.action);
	const { ref, ...rest } = itemProps;
	return (
		<li
			ref={(el) => ref(el)}
			{...rest}
			className="rounded-md border bg-card/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 aria-selected:bg-card/80 aria-selected:border-primary/40"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 min-w-0">
					<Icon className={`size-4 shrink-0 ${actionColor(event.action)}`} />
					<span className="font-medium capitalize">{event.action}</span>
					{event.actor_uid && (
						<span className="text-xs text-muted-foreground truncate">
							by{" "}
							<code className="bg-muted px-1 rounded">
								{event.actor_uid.slice(0, 8)}
							</code>
						</span>
					)}
				</div>
				<span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
					<Clock className="size-3" />
					{formatTimestamp(event.timestamp)}
				</span>
			</div>
			{summariseChanges(event.changes) && (
				<p className="text-xs text-muted-foreground mt-1 ml-6 break-words">
					{summariseChanges(event.changes)}
				</p>
			)}
		</li>
	);
}

function actionIcon(action: ApiEvent["action"]) {
	if (action === "created") return PlusCircle;
	if (action === "deleted") return Trash2;
	return Pencil;
}

function actionColor(action: ApiEvent["action"]): string {
	if (action === "created") return "text-emerald-500";
	if (action === "deleted") return "text-destructive";
	return "text-primary";
}

function formatTimestamp(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

/**
 * Compact change summary — keeps the dialog scannable. Lists fields and
 * truncates noisy values. Full diff drilldown is a future improvement.
 */
function summariseChanges(changes: Record<string, unknown>): string | null {
	const keys = Object.keys(changes);
	if (keys.length === 0) return null;
	if (keys.length <= 3) return keys.join(", ");
	return `${keys.slice(0, 3).join(", ")} +${keys.length - 3} more`;
}
