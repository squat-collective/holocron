"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRightLeft, Check, Link2, Sparkles, UserPlus, X } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EntityPicker, type TailOption } from "@/components/features/search/entity-picker";
import {
	Kbd,
	Stepper,
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
import { AssetIcon, getActorTypeIcon, getAssetTypeIcon, type LucideIcon } from "@/lib/icons";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
	closeWizard,
	type EntityRef,
	openCreateActorWizard,
	openCreateAssetWizard,
	type RelationCreateParams,
	type RelationCreateResult,
	type RelationTypeValue,
} from "@/lib/wizard-store";

const RELATION_ASSET_TYPES = ["dataset", "report", "process", "system"] as const;
const RELATION_ACTOR_TYPES = ["person", "group"] as const;
const RELATION_PICK_TYPES = [...RELATION_ASSET_TYPES, ...RELATION_ACTOR_TYPES] as const;

function projectEntityHit(hit: {
	uid: string;
	name: string;
	kind: string;
	type: string;
}): EntityRef | null {
	if (hit.kind === "asset" && (RELATION_ASSET_TYPES as readonly string[]).includes(hit.type)) {
		return {
			uid: hit.uid,
			name: hit.name,
			kind: "asset",
			type: hit.type as (typeof RELATION_ASSET_TYPES)[number],
		};
	}
	if (hit.kind === "actor" && (RELATION_ACTOR_TYPES as readonly string[]).includes(hit.type)) {
		return {
			uid: hit.uid,
			name: hit.name,
			kind: "actor",
			type: hit.type as (typeof RELATION_ACTOR_TYPES)[number],
		};
	}
	return null;
}

interface Frame {
	id: string;
	kind: "relation-create";
	params: RelationCreateParams;
	resolve: (result: RelationCreateResult | null) => void;
}

/* ================================================================== */
/* Relation type catalog                                               */
/* ================================================================== */

interface RelationTypeDef {
	value: RelationTypeValue;
	label: string;
	hint: string;
}

const RELATION_TYPES: RelationTypeDef[] = [
	{ value: "owns", label: "Owns", hint: "An actor owns the asset" },
	{ value: "uses", label: "Uses", hint: "Consumes / depends on it for work" },
	{ value: "feeds", label: "Feeds", hint: "Sends data into (upstream → downstream)" },
	{
		value: "contains",
		label: "Contains",
		hint: "Parent/child containment",
	},
	{
		value: "member_of",
		label: "Member of",
		hint: "Actor is part of a team",
	},
];

/* ================================================================== */
/* State types                                                         */
/* ================================================================== */

interface RelationData {
	type: RelationTypeValue | null;
	source: EntityRef | null;
	target: EntityRef | null;
}

type RelStepId = "type" | "source" | "target" | "review";
const ALL_STEPS: RelStepId[] = ["type", "source", "target", "review"];

/* ================================================================== */
/* Main shell                                                          */
/* ================================================================== */

export function CreateRelationWizard({
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
			<RelationFlow frame={frame} isTop={isTop} />
		</WizardFocusProvider>
	);
}

function RelationFlow({ frame, isTop }: { frame: Frame; isTop: boolean }) {
	const { hasInteracted, markInteracted } = useWizardFocus();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	const [data, setData] = useState<RelationData>({
		type: frame.params.prefillType ?? null,
		source: frame.params.prefillSource ?? null,
		target: frame.params.prefillTarget ?? null,
	});

	const steps = useMemo<RelStepId[]>(() => {
		return ALL_STEPS.filter((s) => {
			if (s === "type" && frame.params.prefillType) return false;
			if (s === "source" && frame.params.prefillSource) return false;
			if (s === "target" && frame.params.prefillTarget) return false;
			return true;
		});
	}, [frame.params.prefillType, frame.params.prefillSource, frame.params.prefillTarget]);

	const [stepIndex, setStepIndex] = useState(0);
	const step: RelStepId = steps[stepIndex] ?? "review";
	const isLastStep = stepIndex === steps.length - 1;

	const submitRef = useRef<HTMLButtonElement | null>(null);

	const canAdvance = (() => {
		switch (step) {
			case "type":
				return data.type !== null;
			case "source":
				return data.source !== null;
			case "target":
				return data.target !== null;
			case "review":
				return !submitting && data.type !== null && data.source !== null && data.target !== null;
		}
	})();

	const next = useCallback(() => {
		markInteracted();
		setStepIndex((i) => Math.min(i + 1, steps.length - 1));
	}, [steps.length, markInteracted]);
	const back = useCallback(() => {
		markInteracted();
		setStepIndex((i) => Math.max(i - 1, 0));
	}, [markInteracted]);

	const cancel = () => {
		setOpen(false);
		closeWizard(frame.id, null);
	};

	const submit = useCallback(async () => {
		if (!data.type || !data.source || !data.target) return;
		setSubmitting(true);
		try {
			const res = await fetch("/api/holocron/relations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: data.type,
					from_uid: data.source.uid,
					to_uid: data.target.uid,
					verified: true,
				}),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to create relation");
			}
			const created: RelationCreateResult = await res.json();
			queryClient.invalidateQueries({ queryKey: queryKeys.relations.all });
			queryClient.invalidateQueries({ queryKey: ["catalog-search"] });
			toast.success(`Linked ${data.source.name} → ${data.type} → ${data.target.name}`);
			setOpen(false);
			closeWizard(frame.id, created);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
			setSubmitting(false);
		}
	}, [data, queryClient, frame.id]);

	useEffect(() => {
		if (!hasInteracted || !isLastStep || submitting) return;
		const t = setTimeout(() => submitRef.current?.focus(), 40);
		return () => clearTimeout(t);
	}, [hasInteracted, isLastStep, submitting]);

	const handleDialogKey = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!isTop) return;
		if (!(event.metaKey || event.ctrlKey)) return;
		if (event.key === "ArrowRight" || event.key === "Enter") {
			event.preventDefault();
			if (!canAdvance || submitting) return;
			if (isLastStep) submit();
			else next();
			return;
		}
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			if (stepIndex === 0 || submitting) return;
			back();
		}
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) cancel();
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-lg bg-card/90 backdrop-blur-xl border-primary/20"
				onKeyDown={handleDialogKey}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
						<Sparkles className="size-4 text-primary" />
						{frame.params.title ?? "New relation"}
					</DialogTitle>
					<DialogDescription className="sr-only">
						Step {stepIndex + 1} of {steps.length}
					</DialogDescription>
				</DialogHeader>

				<Stepper current={stepIndex} total={steps.length} />

				<div
					key={step}
					className="min-h-[200px] animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
				>
					{step === "type" && (
						<StepRelationType
							value={data.type}
							onCommit={(v) => {
								setData((d) => ({ ...d, type: v }));
								setTimeout(next, 90);
							}}
						/>
					)}
					{step === "source" && (
						<StepEntityPicker
							label="Who or what is the source?"
							hint="The starting side of the relation."
							value={data.source}
							onChange={(v) => setData((d) => ({ ...d, source: v }))}
							onEnter={() => canAdvance && next()}
						/>
					)}
					{step === "target" && (
						<StepEntityPicker
							label="And the target?"
							hint="The other side of the relation."
							value={data.target}
							onChange={(v) => setData((d) => ({ ...d, target: v }))}
							excludeUid={data.source?.uid}
							onEnter={() => canAdvance && next()}
						/>
					)}
					{step === "review" && <StepReview data={data} />}
				</div>

				<HintStrip step={step} canBack={stepIndex > 0} />

				<DialogFooter className="sm:justify-between gap-2 pt-2">
					<Button
						type="button"
						variant="ghost"
						onClick={stepIndex === 0 ? cancel : back}
						disabled={submitting}
					>
						{stepIndex === 0 ? (
							"Cancel"
						) : (
							<>
								<ArrowLeft className="size-4" />
								Back
							</>
						)}
					</Button>
					<div className="flex gap-2 ml-auto">
						{isLastStep ? (
							<Button
								ref={submitRef}
								type="button"
								onClick={submit}
								disabled={!canAdvance || submitting}
							>
								<Check className="size-4" />
								{submitting ? "Creating…" : "Link"}
							</Button>
						) : (
							<Button type="button" onClick={next} disabled={!canAdvance}>
								Next
							</Button>
						)}
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/* ================================================================== */
/* Step 1: Relation type                                               */
/* ================================================================== */

function StepRelationType({
	value,
	onCommit,
}: {
	value: RelationTypeValue | null;
	onCommit: (v: RelationTypeValue) => void;
}) {
	const initialCursor = Math.max(
		0,
		RELATION_TYPES.findIndex((o) => o.value === value),
	);
	const [cursor, setCursor] = useState(initialCursor);
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const initialCardRef = useRef<HTMLButtonElement | null>(null);
	useWizardAutoFocus(initialCardRef);

	// User-driven arrow moves focus.
	const mountedRef = useRef(false);
	useEffect(() => {
		if (!mountedRef.current) {
			mountedRef.current = true;
			return;
		}
		buttonsRef.current[cursor]?.focus();
	}, [cursor]);

	const COLS = 3;
	const TOTAL = RELATION_TYPES.length;
	const handleKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
		if (e.metaKey || e.ctrlKey) return;
		const col = idx % COLS;
		const row = Math.floor(idx / COLS);
		let nextIdx: number | null = null;
		switch (e.key) {
			case "ArrowRight":
				if (col < COLS - 1 && idx + 1 < TOTAL) nextIdx = idx + 1;
				break;
			case "ArrowLeft":
				if (col > 0) nextIdx = idx - 1;
				break;
			case "ArrowDown":
				if (idx + COLS < TOTAL) nextIdx = idx + COLS;
				break;
			case "ArrowUp":
				if (row > 0) nextIdx = idx - COLS;
				break;
			case "Enter":
			case " ": {
				e.preventDefault();
				const opt = RELATION_TYPES[idx];
				if (opt) onCommit(opt.value);
				return;
			}
		}
		if (nextIdx !== null) {
			e.preventDefault();
			setCursor(nextIdx);
		}
	};

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">What kind of relation?</h3>
				<p className="text-sm text-muted-foreground">Arrow keys to move, Enter to pick.</p>
			</div>
			<div className="grid grid-cols-3 gap-2" role="radiogroup">
				{RELATION_TYPES.map((opt, idx) => {
					const active = value === opt.value;
					const highlighted = idx === cursor;
					return (
						<button
							key={opt.value}
							ref={(el) => {
								buttonsRef.current[idx] = el;
								if (idx === initialCursor) initialCardRef.current = el;
							}}
							type="button"
							role="radio"
							aria-checked={active}
							tabIndex={idx === initialCursor ? 0 : -1}
							onClick={() => onCommit(opt.value)}
							onFocus={() => setCursor(idx)}
							onKeyDown={(e) => handleKey(e, idx)}
							className={cn(
								"flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left transition-all outline-none min-h-[4.5rem]",
								active
									? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
									: highlighted
										? "border-primary/60 bg-muted/40"
										: "border-primary/15 hover:border-primary/40 hover:bg-muted/40",
								"focus-visible:ring-2 focus-visible:ring-primary/50",
							)}
						>
							<div className="font-medium text-sm">{opt.label}</div>
							<div className="text-[11px] text-muted-foreground leading-snug">{opt.hint}</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/* ================================================================== */
/* Steps 2 & 3: Entity picker (source / target)                        */
/* ================================================================== */

function StepEntityPicker({
	label,
	hint,
	value,
	onChange,
	excludeUid,
	onEnter,
}: {
	label: string;
	hint: string;
	value: EntityRef | null;
	onChange: (v: EntityRef | null) => void;
	excludeUid?: string;
	onEnter: () => void;
}) {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(inputRef);

	const onPick = useCallback(
		(hit: { uid: string; name: string; kind: string; type: string }) => {
			const ref = projectEntityHit(hit);
			if (ref) onChange(ref);
		},
		[onChange],
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
					key: "new-asset",
					icon: AssetIcon,
					label: (
						<>
							Create asset <strong>{q}</strong>
						</>
					),
					meta: "new asset",
					onSelect: async () => {
						const created = await openCreateAssetWizard({ prefillName: q });
						if (created) {
							onChange({
								uid: created.uid,
								name: created.name,
								kind: "asset",
								type: created.type,
							});
						}
					},
				},
				{
					key: "new-person",
					icon: UserPlus,
					label: (
						<>
							Add <strong>{q}</strong> as a new person
						</>
					),
					meta: "new",
					onSelect: async () => {
						const created = await openCreateActorWizard({
							prefillName: q,
							prefillType: "person",
						});
						if (created) {
							onChange({
								uid: created.uid,
								name: created.name,
								kind: "actor",
								type: created.type,
							});
						}
					},
				},
				{
					key: "new-team",
					icon: UserPlus,
					label: (
						<>
							Add <strong>{q}</strong> as a new team
						</>
					),
					meta: "new",
					onSelect: async () => {
						const created = await openCreateActorWizard({
							prefillName: q,
							prefillType: "group",
						});
						if (created) {
							onChange({
								uid: created.uid,
								name: created.name,
								kind: "actor",
								type: created.type,
							});
						}
					},
				},
			];
		},
		[onChange],
	);

	const excludeUids = useMemo(() => (excludeUid ? [excludeUid] : []), [excludeUid]);

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">{label}</h3>
				<p className="text-sm text-muted-foreground">{hint}</p>
			</div>

			{value ? (
				<EntityChip entity={value} onRemove={() => onChange(null)} />
			) : (
				<EntityPicker
					query={query}
					onQueryChange={setQuery}
					onPick={onPick}
					kinds={["asset", "actor"]}
					types={RELATION_PICK_TYPES}
					excludeUids={excludeUids}
					placeholder="Search existing or type a new name…"
					inputRef={inputRef}
					renderTail={renderTail}
					onEnterFallback={onEnter}
				/>
			)}
		</div>
	);
}

function EntityChip({ entity, onRemove }: { entity: EntityRef; onRemove: () => void }) {
	const Icon =
		entity.kind === "asset"
			? getAssetTypeIcon(entity.type)
			: getActorTypeIcon(entity.type as "person" | "group");
	return (
		<div className="rounded-md border border-primary/25 bg-primary/10 p-2.5 text-sm flex items-start gap-2">
			<Icon className="size-4 text-primary mt-0.5 shrink-0" />
			<div className="flex-1 min-w-0">
				<div className="font-medium truncate">{entity.name}</div>
				<div className="text-xs text-muted-foreground capitalize">{entity.type}</div>
			</div>
			<button
				type="button"
				tabIndex={-1}
				onClick={onRemove}
				className="text-muted-foreground hover:text-foreground"
				aria-label="Pick a different entity"
			>
				<X className="size-4" />
			</button>
		</div>
	);
}

/* ================================================================== */
/* Step 4: Review                                                      */
/* ================================================================== */

function StepReview({ data }: { data: RelationData }) {
	if (!data.type || !data.source || !data.target) return null;
	const typeMeta = RELATION_TYPES.find((t) => t.value === data.type);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Ready?</h3>
				<p className="text-sm text-muted-foreground">This is the relation we'll create.</p>
			</div>
			<div className="rounded-lg border border-primary/15 bg-muted/20 p-4 space-y-3">
				<div className="flex items-center gap-2 text-sm flex-wrap">
					<EntityPill entity={data.source} emphasis />
					<ArrowRightLeft className="size-3 text-muted-foreground" />
					<span className="font-medium">{typeMeta?.label ?? data.type}</span>
					<ArrowRightLeft className="size-3 text-muted-foreground" />
					<EntityPill entity={data.target} emphasis />
				</div>
				{typeMeta && <p className="text-xs text-muted-foreground">{typeMeta.hint}</p>}
			</div>
		</div>
	);
}

function EntityPill({ entity, emphasis = false }: { entity: EntityRef; emphasis?: boolean }) {
	const Icon =
		entity.kind === "asset"
			? getAssetTypeIcon(entity.type)
			: getActorTypeIcon(entity.type as "person" | "group");
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded border px-2 py-0.5",
				emphasis
					? "border-primary/40 bg-primary/5 text-primary"
					: "bg-background/60 border-primary/15",
			)}
		>
			<Icon className="size-3" />
			<span className="truncate max-w-[140px]">{entity.name}</span>
		</span>
	);
}

/* ================================================================== */
/* Keyboard hints                                                      */
/* ================================================================== */

function HintStrip({ step, canBack }: { step: RelStepId; canBack: boolean }) {
	const stepBits: Record<RelStepId, React.ReactNode> = {
		type: (
			<>
				<Kbd>←→↑↓</Kbd> choose · <Kbd>↵</Kbd> select
			</>
		),
		source: (
			<>
				<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> choose · <Kbd>⌫</Kbd> change
			</>
		),
		target: (
			<>
				<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> choose · <Kbd>⌫</Kbd> change
			</>
		),
		review: (
			<>
				<Kbd>↵</Kbd> link
			</>
		),
	};
	return (
		<div className="text-[11px] text-muted-foreground/70 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
			{stepBits[step]}
			{canBack && (
				<>
					{" · "}
					<Kbd>⌃←</Kbd> back
				</>
			)}
		</div>
	);
}
