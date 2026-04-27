"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus, UserPlus, Users, X } from "lucide-react";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { EntityPicker, type TailOption } from "@/components/features/search/entity-picker";
import {
	Kbd,
	useWizardAutoFocus,
	useWizardFocus,
	WizardFocusProvider,
} from "@/components/features/wizard-shared";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { getActorTypeIcon } from "@/lib/icons";
import { queryKeys } from "@/lib/query-keys";
import {
	type ActorType,
	type ConsumersAddParams,
	type ConsumersAddResult,
	closeWizard,
	openCreateActorWizard,
} from "@/lib/wizard-store";

/**
 * Multi-actor batch — pick one or several actors and wire them up as
 * consumers (`actor -uses-> asset`) in one go. A one-step wizard because the
 * whole activity IS the multi-pick: typeahead, chips above, Enter to add,
 * Backspace to pop the last pick.
 */

interface Frame {
	id: string;
	kind: "consumers-add";
	params: ConsumersAddParams;
	resolve: (result: ConsumersAddResult | null) => void;
}

interface ActorHit {
	uid: string;
	name: string;
	type: ActorType;
}

export function AddConsumersWizard({
	frame,
	isTop,
	isNested,
}: {
	frame: Frame;
	isTop: boolean;
	isNested: boolean;
}) {
	return (
		<WizardFocusProvider initialInteracted={isNested}>
			<ConsumersFlow frame={frame} isTop={isTop} />
		</WizardFocusProvider>
	);
}

function ConsumersFlow({ frame, isTop }: { frame: Frame; isTop: boolean }) {
	const { markInteracted } = useWizardFocus();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	const [picks, setPicks] = useState<ActorHit[]>([]);
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(inputRef);

	const addPick = useCallback((hit: ActorHit) => {
		setPicks((prev) => [...prev, hit]);
		setQuery("");
		inputRef.current?.focus();
	}, []);

	const commitNewActor = useCallback(
		async (actorType: ActorType, name: string) => {
			markInteracted();
			const created = await openCreateActorWizard({
				prefillName: name,
				prefillType: actorType,
			});
			if (!created) return;
			addPick({ uid: created.uid, name: created.name, type: created.type });
		},
		[markInteracted, addPick],
	);

	const renderTail = useCallback(
		({
			query: q,
			hasExactMatch,
		}: {
			query: string;
			hasExactMatch: boolean;
		}): readonly TailOption[] => {
			if (q.length === 0 || hasExactMatch) return [];
			return [
				{
					key: "new-person",
					icon: UserPlus,
					label: (
						<>
							Add <strong>{q}</strong> as a new person
						</>
					),
					meta: "new",
					onSelect: () => commitNewActor("person", q),
				},
				{
					key: "new-group",
					icon: Plus,
					label: (
						<>
							Add <strong>{q}</strong> as a new team
						</>
					),
					meta: "new",
					onSelect: () => commitNewActor("group", q),
				},
			];
		},
		[commitNewActor],
	);

	const onPick = useCallback(
		(hit: { uid: string; name: string; type: string }) => {
			markInteracted();
			if (hit.type !== "person" && hit.type !== "group") return;
			addPick({ uid: hit.uid, name: hit.name, type: hit.type });
		},
		[markInteracted, addPick],
	);

	const onBackspaceEmpty = useCallback(() => {
		if (picks.length > 0) setPicks((prev) => prev.slice(0, -1));
	}, [picks.length]);

	const excludeUids = picks.map((p) => p.uid);

	const canSubmit = !submitting && picks.length > 0;

	const cancel = () => {
		setOpen(false);
		closeWizard(frame.id, null);
	};

	const submit = useCallback(async () => {
		if (picks.length === 0) return;
		setSubmitting(true);
		try {
			let created = 0;
			for (const actor of picks) {
				const relRes = await fetch("/api/holocron/relations", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						from_uid: actor.uid,
						to_uid: frame.params.assetUid,
						type: "uses",
						verified: true,
					}),
				});
				if (relRes.ok) created += 1;
				else console.warn(`uses relation failed for ${actor.uid}`);
			}
			queryClient.invalidateQueries({ queryKey: queryKeys.relations.all });
			queryClient.invalidateQueries({ queryKey: ["catalog-search"] });
			toast.success(
				created === 1 ? `Linked ${picks[0]!.name} as consumer` : `Linked ${created} consumers`,
			);
			setOpen(false);
			closeWizard(frame.id, { count: created });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
			setSubmitting(false);
		}
	}, [picks, queryClient, frame]);

	const handleDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
		if (!isTop) return;
		if (!(e.metaKey || e.ctrlKey)) return;
		if (e.key === "ArrowRight" || e.key === "Enter") {
			e.preventDefault();
			if (canSubmit) submit();
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) cancel();
			}}
		>
			<DialogContent
				className="sm:max-w-lg bg-card/90 backdrop-blur-xl border-primary/20"
				onKeyDown={handleDialogKey}
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
						<Users className="size-4 text-primary" />
						<span>Add consumers to {frame.params.assetName}</span>
					</DialogTitle>
					<DialogDescription className="sr-only">
						Pick one or more people or teams that use this asset.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 pt-1">
					<p className="text-sm text-muted-foreground">
						People or teams who use this asset. Add as many as you like — each becomes a{" "}
						<code className="text-xs">uses</code> relation.
					</p>

					{picks.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{picks.map((m, i) => {
								const Icon = getActorTypeIcon(m.type);
								return (
									<span
										key={m.uid}
										className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs"
									>
										<Icon className="size-3 text-primary" />
										<span>{m.name}</span>
										<button
											type="button"
											onClick={() => setPicks(picks.filter((_, j) => j !== i))}
											className="rounded-full hover:bg-primary/20 p-0.5"
											aria-label={`Remove ${m.name}`}
											tabIndex={-1}
										>
											<X className="size-3" />
										</button>
									</span>
								);
							})}
						</div>
					)}

					<EntityPicker
						query={query}
						onQueryChange={setQuery}
						onPick={onPick}
						kinds={["actor"]}
						types={["person", "group"]}
						excludeUids={excludeUids}
						placeholder={picks.length === 0 ? "Search a person or team…" : "Add another…"}
						inputRef={inputRef}
						renderTail={renderTail}
						onBackspaceEmpty={onBackspaceEmpty}
					/>
				</div>

				<div className="text-[11px] text-muted-foreground/70 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
					<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> add · <Kbd>⌫</Kbd> remove last · <Kbd>⌃↵</Kbd> link all
				</div>

				<DialogFooter className="sm:justify-between gap-2 pt-2">
					<Button type="button" variant="ghost" onClick={cancel}>
						Cancel
					</Button>
					<Button type="button" onClick={submit} disabled={!canSubmit}>
						<Check className="size-4" />
						{submitting
							? "Linking…"
							: picks.length <= 1
								? "Link consumer"
								: `Link ${picks.length} consumers`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
