"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	ArrowRightLeft,
	Check,
	CheckCircle2,
	ChevronRight,
	Link2,
	MapPin,
	Plus,
	ShieldCheck,
	Sparkles,
	Tag,
	UserPlus,
	X,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCosmicNav } from "@/hooks/use-cosmic-nav";
import { useDebounce } from "@/hooks/use-debounce";
import {
	ActorIcon,
	AssetIcon,
	assetTypeIcons,
	enforcementIcons,
	getActorTypeIcon,
	getAssetTypeIcon,
	type LucideIcon,
} from "@/lib/icons";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
	type AssetCreateResult,
	type AssetType as AssetKind,
	closeWizard,
	openAddConsumersWizard,
	openApplyRuleWizard,
	openCreateActorWizard,
	openCreateRelationWizard,
} from "@/lib/wizard-store";

interface Frame {
	id: string;
	kind: "asset-create";
	params: {
		prefillName?: string;
		prefillType?: AssetKind;
	};
	resolve: (result: AssetCreateResult | null) => void;
}

/* ================================================================== */
/* Shared types                                                        */
/* ================================================================== */

type AssetType = "dataset" | "report" | "process" | "system";
type ActorType = "person" | "group";

interface MaintainerExisting {
	kind: "existing";
	uid: string;
	name: string;
	actorType: ActorType;
}
interface MaintainerNew {
	kind: "new";
	name: string;
	actorType: ActorType;
}
type Maintainer = MaintainerExisting | MaintainerNew;

interface BaseData {
	type: AssetType | null;
	name: string;
	description: string;
	location: string;
	tags: string[];
	maintainers: Maintainer[];
}

const INITIAL_DATA: BaseData = {
	type: null,
	name: "",
	description: "",
	location: "",
	tags: [],
	maintainers: [],
};

type StepId = "type" | "name" | "description" | "location" | "tags" | "maintainers" | "review";
const STEPS: StepId[] = [
	"type",
	"name",
	"description",
	"location",
	"tags",
	"maintainers",
	"review",
];

type Phase = "base" | "hub";
type EnrichmentId = "rule" | "relation" | "consumers";

/* ================================================================== */
/* Main shell                                                          */
/* ================================================================== */

export function CreateAssetWizard({
	frame,
	isTop,
	isNested,
}: {
	frame: Frame;
	isTop: boolean;
	isNested: boolean;
}) {
	const cosmicNav = useCosmicNav();

	const [open, setOpen] = useState(true);
	const [phase, setPhase] = useState<Phase>("base");
	const [assetUid, setAssetUid] = useState<string | null>(null);
	const [assetName, setAssetName] = useState<string | null>(null);
	const [assetType, setAssetType] = useState<AssetKind | null>(null);
	const [completed, setCompleted] = useState<Set<EnrichmentId>>(new Set());

	// If the user bails out with Esc / close, still take them to the created
	// asset if they got that far, and resolve the frame with whatever result.
	const finish = useCallback(() => {
		setOpen(false);
		const result: AssetCreateResult | null =
			assetUid && assetName && assetType
				? { uid: assetUid, name: assetName, type: assetType }
				: null;
		closeWizard(frame.id, result);
		if (assetUid) cosmicNav(`/assets/${assetUid}`);
	}, [assetUid, assetName, assetType, cosmicNav, frame.id]);

	const handleOpenChange = (next: boolean) => {
		if (!next) finish();
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-lg bg-card/90 backdrop-blur-xl border-primary/20"
				onOpenAutoFocus={(event) => {
					// Focus is managed by useWizardAutoFocus hooks inside the tree —
					// never let Radix race with us.
					event.preventDefault();
				}}
			>
				<WizardFocusProvider initialInteracted={isNested}>
					{phase === "base" && (
						<BaseFlow
							prefillName={frame.params.prefillName}
							prefillType={frame.params.prefillType}
							isTop={isTop}
							onCreated={(uid, name, type) => {
								setAssetUid(uid);
								setAssetName(name);
								setAssetType(type);
								setPhase("hub");
							}}
						/>
					)}
					{phase === "hub" && assetUid && assetName && assetType && (
						<EnrichmentHub
							assetUid={assetUid}
							assetName={assetName}
							assetType={assetType}
							completed={completed}
							isTop={isTop}
							onCompleted={(id) => setCompleted((c) => new Set([...c, id]))}
							onFinish={finish}
						/>
					)}
				</WizardFocusProvider>
			</DialogContent>
		</Dialog>
	);
}

/* ================================================================== */
/* Base flow — the existing 7-step create                              */
/* ================================================================== */

function BaseFlow({
	prefillName,
	prefillType,
	isTop,
	onCreated,
}: {
	prefillName?: string;
	prefillType?: AssetKind;
	isTop: boolean;
	onCreated: (uid: string, name: string, type: AssetKind) => void;
}) {
	const { hasInteracted, markInteracted } = useWizardFocus();
	const queryClient = useQueryClient();
	const [data, setData] = useState<BaseData>(() => ({
		...INITIAL_DATA,
		name: prefillName ?? "",
		type: prefillType ?? null,
	}));
	// If both prefills are provided, skip straight to the first unanswered step
	const [stepIndex, setStepIndex] = useState(() => {
		if (prefillType && prefillName) return 2; // skip type+name
		if (prefillType) return 1; // skip type
		return 0;
	});
	const [submitting, setSubmitting] = useState(false);

	const submitRef = useRef<HTMLButtonElement | null>(null);

	const step: StepId = STEPS[stepIndex] ?? "type";
	const totalSteps = STEPS.length;

	const canAdvance = useMemo(() => {
		switch (step) {
			case "type":
				return data.type !== null;
			case "name":
				return data.name.trim().length > 0;
			case "description":
			case "location":
			case "tags":
			case "maintainers":
				return true;
			case "review":
				return !submitting;
		}
	}, [step, data, submitting]);

	const next = useCallback(() => {
		markInteracted();
		setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
	}, [markInteracted]);
	const back = useCallback(() => {
		markInteracted();
		setStepIndex((i) => Math.max(i - 1, 0));
	}, [markInteracted]);

	const submit = useCallback(async () => {
		if (!data.type) return;
		setSubmitting(true);
		try {
			const trimmedTags = data.tags.map((t) => t.trim()).filter((t) => t.length > 0);
			const metadata = trimmedTags.length > 0 ? { tags: trimmedTags } : undefined;

			const assetRes = await fetch("/api/holocron/assets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: data.type,
					name: data.name.trim(),
					description: data.description.trim() || null,
					location: data.location.trim() || null,
					...(metadata ? { metadata } : {}),
				}),
			});
			if (!assetRes.ok) {
				const body = (await assetRes.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to create asset");
			}
			const asset: { uid: string; name: string } = await assetRes.json();

			const actorUids: string[] = [];
			for (const m of data.maintainers) {
				if (m.kind === "existing") {
					actorUids.push(m.uid);
					continue;
				}
				const actorRes = await fetch("/api/holocron/actors", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ type: m.actorType, name: m.name }),
				});
				if (!actorRes.ok) {
					const body = (await actorRes.json().catch(() => null)) as { error?: string } | null;
					throw new Error(body?.error ?? `Could not create "${m.name}"`);
				}
				const created: { uid: string } = await actorRes.json();
				actorUids.push(created.uid);
			}

			for (const actorUid of actorUids) {
				const relRes = await fetch("/api/holocron/relations", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						from_uid: actorUid,
						to_uid: asset.uid,
						type: "owns",
						verified: true,
					}),
				});
				if (!relRes.ok) {
					console.warn(`owns relation failed for ${actorUid}`);
				}
			}

			toast.success(`Created “${asset.name}”`);
			queryClient.invalidateQueries({ queryKey: queryKeys.assets.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.actors.all });
			queryClient.invalidateQueries({ queryKey: ["catalog-search"] });
			onCreated(asset.uid, asset.name, data.type);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
			setSubmitting(false);
		}
	}, [data, queryClient, onCreated]);

	const isLastStep = stepIndex === STEPS.length - 1;
	const canSkip =
		step === "description" || step === "location" || step === "tags" || step === "maintainers";

	// Review step: focus the Create button so plain Enter submits. Only once
	// the user has interacted — a prefilled nested wizard lands with the
	// button already focused, but a fresh one stays quiet.
	useEffect(() => {
		if (!hasInteracted || !isLastStep) return;
		const t = setTimeout(() => submitRef.current?.focus(), 40);
		return () => clearTimeout(t);
	}, [hasInteracted, isLastStep]);

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

	return (
		<div onKeyDown={handleKeyDown} className="contents">
			<DialogHeader>
				<DialogTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
					<Sparkles className="size-4 text-primary" />
					New asset
				</DialogTitle>
				<DialogDescription className="sr-only">
					Step {stepIndex + 1} of {totalSteps}
				</DialogDescription>
			</DialogHeader>

			<Stepper current={stepIndex} total={totalSteps} />

			<div
				key={step}
				className="min-h-[240px] animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
			>
				{step === "type" && (
					<StepType
						value={data.type}
						onChange={(v) => setData((d) => ({ ...d, type: v }))}
						onCommit={(v) => {
							setData((d) => ({ ...d, type: v }));
							setTimeout(next, 90);
						}}
					/>
				)}
				{step === "name" && (
					<StepName
						value={data.name}
						onChange={(v) => setData((d) => ({ ...d, name: v }))}
						onEnter={() => canAdvance && next()}
					/>
				)}
				{step === "description" && (
					<StepDescription
						value={data.description}
						onChange={(v) => setData((d) => ({ ...d, description: v }))}
					/>
				)}
				{step === "location" && (
					<StepLocation
						type={data.type}
						value={data.location}
						onChange={(v) => setData((d) => ({ ...d, location: v }))}
					/>
				)}
				{step === "tags" && (
					<StepTags value={data.tags} onChange={(v) => setData((d) => ({ ...d, tags: v }))} />
				)}
				{step === "maintainers" && (
					<StepMaintainers
						value={data.maintainers}
						onChange={(v) => setData((d) => ({ ...d, maintainers: v }))}
					/>
				)}
				{step === "review" && <StepReview data={data} />}
			</div>

			<KeyboardHint step={step} canBack={stepIndex > 0} />

			<DialogFooter className="sm:justify-between gap-2 pt-2">
				<Button
					type="button"
					variant="ghost"
					onClick={back}
					disabled={stepIndex === 0 || submitting}
				>
					<ArrowLeft className="size-4" />
					Back
				</Button>
				<div className="flex gap-2 ml-auto">
					{canSkip && !isLastStep && (
						<Button type="button" variant="outline" onClick={next} disabled={submitting}>
							Skip
						</Button>
					)}
					{isLastStep ? (
						<Button
							ref={submitRef}
							type="button"
							onClick={submit}
							disabled={!canAdvance || submitting}
						>
							<Check className="size-4" />
							{submitting ? "Creating…" : "Create asset"}
						</Button>
					) : (
						<Button type="button" onClick={next} disabled={!canAdvance}>
							Next
						</Button>
					)}
				</div>
			</DialogFooter>
		</div>
	);
}

/* ================================================================== */
/* Enrichment hub                                                      */
/* ================================================================== */

interface EnrichmentOption {
	id: EnrichmentId;
	label: string;
	hint: string;
	icon: LucideIcon;
}

const ENRICHMENT_OPTIONS: EnrichmentOption[] = [
	{
		id: "consumers",
		label: "Add consumers",
		hint: "People or teams who use this asset",
		icon: ActorIcon,
	},
	{
		id: "rule",
		label: "Add a data-quality rule",
		hint: "Describe what the data must respect",
		icon: ShieldCheck,
	},
	{
		id: "relation",
		label: "Link a related asset",
		hint: "Upstream source or downstream consumer",
		icon: Link2,
	},
];

function EnrichmentHub({
	assetUid,
	assetName,
	assetType,
	completed,
	isTop,
	onCompleted,
	onFinish,
}: {
	assetUid: string;
	assetName: string;
	assetType: AssetKind;
	completed: Set<EnrichmentId>;
	isTop: boolean;
	onCompleted: (id: EnrichmentId) => void;
	onFinish: () => void;
}) {
	// Enrichments are intentionally stackable — users can add as many rules,
	// consumers, or related assets as they want. We only hide an option from the
	// list if the user has added at least one of that kind already (to keep the
	// menu focused), but the button stays reachable via Cmd+K or from the
	// asset detail page afterwards.
	const remaining = ENRICHMENT_OPTIONS.filter((o) => !completed.has(o.id));

	const pick = async (id: EnrichmentId) => {
		const srcRef = {
			uid: assetUid,
			name: assetName,
			kind: "asset" as const,
			type: assetType,
		};
		if (id === "rule") {
			const res = await openApplyRuleWizard({ assetUid, assetName });
			if (res && res.count > 0) onCompleted("rule");
			return;
		}
		if (id === "relation") {
			const res = await openCreateRelationWizard({ prefillSource: srcRef });
			if (res) onCompleted("relation");
			return;
		}
		// consumers — dedicated multi-actor batch: pick N actors, emits N uses
		// relations to the asset at once.
		const res = await openAddConsumersWizard({ assetUid, assetName });
		if (res && res.count > 0) onCompleted("consumers");
	};
	const [cursor, setCursor] = useState(0);
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const finishRef = useRef<HTMLButtonElement | null>(null);
	const firstCardRef = useRef<HTMLButtonElement | null>(null);

	// Autofocus the first card when the hub opens after the user has
	// interacted — DRY hook handles "only if the user navigated to here".
	useWizardAutoFocus(remaining.length === 0 ? finishRef : firstCardRef);

	// Subsequent arrow-key navigation moves focus to the next card.
	const hubDidMountRef = useRef(false);
	useEffect(() => {
		if (!hubDidMountRef.current) {
			hubDidMountRef.current = true;
			return;
		}
		if (remaining.length === 0) {
			finishRef.current?.focus();
		} else {
			buttonsRef.current[Math.min(cursor, remaining.length - 1)]?.focus();
		}
	}, [cursor, remaining.length]);

	const handleKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
		// Ctrl/⌘+Enter is the shell shortcut for "finish the flow" — don't
		// interpret it as "activate this option", otherwise we'd open a nested
		// wizard AND finish at the same time.
		if (e.metaKey || e.ctrlKey) return;
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setCursor(Math.min(idx + 1, remaining.length - 1));
				break;
			case "ArrowUp":
				e.preventDefault();
				setCursor(Math.max(idx - 1, 0));
				break;
			case "Enter":
			case " ": {
				e.preventDefault();
				const opt = remaining[idx];
				if (opt) void pick(opt.id);
				break;
			}
		}
	};

	const handleShellKey = (e: KeyboardEvent<HTMLDivElement>) => {
		if (!isTop) return;
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			onFinish();
		}
	};

	return (
		<div onKeyDown={handleShellKey} className="contents">
			<DialogHeader>
				<DialogTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
					<CheckCircle2 className="size-4 text-primary" />
					<span>Created “{assetName}”</span>
				</DialogTitle>
				<DialogDescription className="sr-only">Add more information to the asset</DialogDescription>
			</DialogHeader>

			<div className="space-y-4 pt-1">
				<div>
					<h3 className="text-xl font-semibold">Want to add more?</h3>
					<p className="text-sm text-muted-foreground">
						Each extra piece makes the asset easier to trust. Skip whenever you like.
					</p>
				</div>

				{remaining.length > 0 ? (
					<div role="menu" className="flex flex-col gap-2 animate-in fade-in-0 duration-200">
						{remaining.map((opt, idx) => {
							const Icon = opt.icon;
							return (
								<button
									key={opt.id}
									ref={(el) => {
										buttonsRef.current[idx] = el;
										if (idx === 0) firstCardRef.current = el;
									}}
									type="button"
									role="menuitem"
									onClick={() => void pick(opt.id)}
									onFocus={() => setCursor(idx)}
									onKeyDown={(e) => handleKey(e, idx)}
									className={cn(
										"group flex items-center gap-3 p-3 rounded-lg border text-left transition-all outline-none",
										"border-primary/15 hover:border-primary/40 hover:bg-muted/30",
										"focus-visible:border-primary focus-visible:bg-primary/10",
										"focus-visible:ring-2 focus-visible:ring-primary/40",
									)}
								>
									<Icon className="size-5 text-primary shrink-0" />
									<div className="min-w-0 flex-1">
										<div className="font-medium text-sm">{opt.label}</div>
										<div className="text-xs text-muted-foreground">{opt.hint}</div>
									</div>
									<ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
								</button>
							);
						})}
					</div>
				) : (
					<div className="rounded-lg border border-primary/15 bg-muted/20 p-4 text-sm text-muted-foreground text-center">
						<CheckCircle2 className="size-6 text-primary mx-auto mb-2" />
						Nice — you've added everything. Time to go see it.
					</div>
				)}

				{completed.size > 0 && remaining.length > 0 && (
					<div className="flex flex-wrap gap-1.5 pt-1">
						{[...completed].map((id) => {
							const opt = ENRICHMENT_OPTIONS.find((o) => o.id === id);
							if (!opt) return null;
							const Icon = opt.icon;
							return (
								<span
									key={id}
									className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] text-muted-foreground"
								>
									<Icon className="size-3 text-primary" />
									{opt.label} · done
								</span>
							);
						})}
					</div>
				)}
			</div>

			<div className="text-[11px] text-muted-foreground/70 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
				<Kbd>↑↓</Kbd> choose · <Kbd>↵</Kbd> open · <Kbd>⌃↵</Kbd> finish
			</div>

			<DialogFooter className="sm:justify-end gap-2 pt-2">
				<Button
					ref={finishRef}
					type="button"
					variant={remaining.length === 0 ? "default" : "outline"}
					onClick={onFinish}
				>
					{remaining.length === 0 ? "Go to the asset" : "All done · take me there"}
				</Button>
			</DialogFooter>
		</div>
	);
}

/* ================================================================== */
/* Shared base-flow bits                                               */
/* ================================================================== */

function KeyboardHint({ step, canBack }: { step: StepId; canBack: boolean }) {
	const stepBits: Record<StepId, React.ReactNode> = {
		type: (
			<>
				<Kbd>←→↑↓</Kbd> choose · <Kbd>↵</Kbd> select
			</>
		),
		name: (
			<>
				<Kbd>↵</Kbd> next
			</>
		),
		description: (
			<>
				<Kbd>⌃→</Kbd> next
			</>
		),
		location: (
			<>
				<Kbd>↵</Kbd> next
			</>
		),
		tags: (
			<>
				<Kbd>↵</Kbd> add · <Kbd>⌫</Kbd> remove last · <Kbd>⌃→</Kbd> next
			</>
		),
		maintainers: (
			<>
				<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> add · <Kbd>⌫</Kbd> remove last · <Kbd>⌃→</Kbd> next
			</>
		),
		review: (
			<>
				<Kbd>↵</Kbd> create
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

/* ================================================================== */
/* Base-flow step components                                           */
/* ================================================================== */

/* ---------- Step 1: Type (arrow + enter nav) ---------- */

interface TypeOption {
	value: AssetType;
	label: string;
	hint: string;
	icon: LucideIcon;
}

const TYPE_OPTIONS: TypeOption[] = [
	{
		value: "dataset",
		label: "Dataset",
		hint: "Tables, CSVs, warehouses — data at rest",
		icon: assetTypeIcons.dataset,
	},
	{
		value: "report",
		label: "Report",
		hint: "Dashboards, analyses, read-only views",
		icon: assetTypeIcons.report,
	},
	{
		value: "process",
		label: "Process",
		hint: "Pipelines, ETLs, jobs that transform data",
		icon: assetTypeIcons.process,
	},
	{
		value: "system",
		label: "System",
		hint: "Applications, tools, sources behind the data",
		icon: assetTypeIcons.system,
	},
];

function StepType({
	value,
	onChange,
	onCommit,
}: {
	value: AssetType | null;
	onChange: (v: AssetType) => void;
	onCommit: (v: AssetType) => void;
}) {
	const initialCursor = Math.max(
		0,
		TYPE_OPTIONS.findIndex((o) => o.value === value),
	);
	const [cursor, setCursor] = useState(initialCursor);
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const initialCardRef = useRef<HTMLButtonElement | null>(null);
	useWizardAutoFocus(initialCardRef);

	// Only follow cursor with focus after the first real change — so mounting
	// the step doesn't yank focus into the dialog.
	const cursorMountedRef = useRef(false);
	useEffect(() => {
		if (!cursorMountedRef.current) {
			cursorMountedRef.current = true;
			return;
		}
		buttonsRef.current[cursor]?.focus();
	}, [cursor]);

	const COLS = 2;
	const TOTAL = TYPE_OPTIONS.length;
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
				const opt = TYPE_OPTIONS[idx];
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
				<h3 className="text-xl font-semibold">What are you adding?</h3>
				<p className="text-sm text-muted-foreground">
					Pick the shape that fits best — you can change it later.
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2" role="radiogroup">
				{TYPE_OPTIONS.map((opt, idx) => {
					const Icon = opt.icon;
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
							onClick={() => {
								onChange(opt.value);
								onCommit(opt.value);
							}}
							onFocus={() => setCursor(idx)}
							onKeyDown={(e) => handleKey(e, idx)}
							className={cn(
								"flex items-start gap-3 p-3 rounded-lg border text-left transition-all outline-none",
								active
									? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
									: highlighted
										? "border-primary/60 bg-muted/40"
										: "border-primary/15 hover:border-primary/40 hover:bg-muted/40",
								"focus-visible:ring-2 focus-visible:ring-primary/50",
							)}
						>
							<Icon
								className={cn(
									"size-5 shrink-0 mt-0.5",
									active || highlighted ? "text-primary" : "text-muted-foreground",
								)}
							/>
							<div className="min-w-0">
								<div className="font-medium text-sm">{opt.label}</div>
								<div className="text-xs text-muted-foreground">{opt.hint}</div>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/* ---------- Step 2: Name ---------- */

function StepName({
	value,
	onChange,
	onEnter,
}: {
	value: string;
	onChange: (v: string) => void;
	onEnter: () => void;
}) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(inputRef);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Give it a name</h3>
				<p className="text-sm text-muted-foreground">
					Something a teammate could recognize at a glance.
				</p>
			</div>
			<Input
				ref={inputRef}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="e.g. Customer Orders"
				className="h-12 text-base"
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
						e.preventDefault();
						onEnter();
					}
				}}
			/>
		</div>
	);
}

/* ---------- Step 3: Description ---------- */

function StepDescription({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	const taRef = useRef<HTMLTextAreaElement | null>(null);
	useWizardAutoFocus(taRef);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">What is it, in one sentence?</h3>
				<p className="text-sm text-muted-foreground">Optional — but future-you will thank you.</p>
			</div>
			<Textarea
				ref={taRef}
				rows={4}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="e.g. Live stream of customer orders from the storefront, keyed by order_id."
			/>
		</div>
	);
}

/* ---------- Step 4: Location ---------- */

const LOCATION_HINT_BY_TYPE: Record<AssetType, string> = {
	dataset: "e.g. postgres://prod/analytics.orders, s3://raw/events/",
	report: "e.g. https://bi.acme.io/dashboards/q4-revenue",
	process: "e.g. https://airflow.acme.io/dags/daily_etl",
	system: "e.g. https://app.acme.io or internal://crm",
};

function StepLocation({
	type,
	value,
	onChange,
}: {
	type: AssetType | null;
	value: string;
	onChange: (v: string) => void;
}) {
	const hint = type ? LOCATION_HINT_BY_TYPE[type] : "URL or path";
	const inputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(inputRef);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Where does it live?</h3>
				<p className="text-sm text-muted-foreground">
					A URL or path so a teammate can jump straight to it. Optional.
				</p>
			</div>
			<div className="relative">
				<MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
				<Input
					ref={inputRef}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={hint}
					className="h-12 pl-9 text-base font-mono"
				/>
			</div>
		</div>
	);
}

/* ---------- Step 5: Tags ---------- */

function StepTags({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
	const [draft, setDraft] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(inputRef);

	const add = (raw: string) => {
		const normalized = raw.trim().replace(/^#/, "").toLowerCase();
		if (!normalized) return;
		if (value.includes(normalized)) return;
		onChange([...value, normalized]);
		setDraft("");
		inputRef.current?.focus();
	};

	const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.metaKey || e.ctrlKey) return;
		if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
			if (draft.trim().length === 0) return;
			e.preventDefault();
			add(draft);
			return;
		}
		if (e.key === "Backspace" && draft === "" && value.length > 0) {
			e.preventDefault();
			onChange(value.slice(0, -1));
		}
	};

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Any tags?</h3>
				<p className="text-sm text-muted-foreground">
					Free-form labels to help people filter. Optional — press <Kbd>↵</Kbd> or <Kbd>,</Kbd> to
					add.
				</p>
			</div>
			{value.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{value.map((t, i) => (
						<span
							key={`${t}-${i}`}
							className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs"
						>
							<Tag className="size-3 text-primary" />
							<span>{t}</span>
							<button
								type="button"
								tabIndex={-1}
								onClick={() => onChange(value.filter((_, j) => j !== i))}
								className="rounded-full hover:bg-primary/20 p-0.5"
								aria-label={`Remove ${t}`}
							>
								<X className="size-3" />
							</button>
						</span>
					))}
				</div>
			)}
			<Input
				ref={inputRef}
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={handleKey}
				placeholder="e.g. pii, gold-layer, mission-critical…"
				className="h-11"
			/>
		</div>
	);
}

/* ---------- Step 6: Maintainers ---------- */

function StepMaintainers({
	value,
	onChange,
}: {
	value: Maintainer[];
	onChange: (v: Maintainer[]) => void;
}) {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(inputRef);

	const add = useCallback(
		(m: Maintainer) => {
			onChange([...value, m]);
			setQuery("");
			inputRef.current?.focus();
		},
		[value, onChange],
	);

	const onPick = useCallback(
		(hit: { uid: string; name: string; type: string }) => {
			if (hit.type !== "person" && hit.type !== "group") return;
			add({
				kind: "existing",
				uid: hit.uid,
				name: hit.name,
				actorType: hit.type,
			});
		},
		[add],
	);

	const commitNewActor = useCallback(
		async (actorType: ActorType, name: string) => {
			const created = await openCreateActorWizard({
				prefillName: name,
				prefillType: actorType,
			});
			if (created) {
				add({
					kind: "existing",
					uid: created.uid,
					name: created.name,
					actorType: created.type,
				});
			}
		},
		[add],
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

	const onBackspaceEmpty = useCallback(() => {
		if (value.length > 0) onChange(value.slice(0, -1));
	}, [value, onChange]);

	const excludeUids = value
		.filter((m): m is MaintainerExisting => m.kind === "existing")
		.map((m) => m.uid);

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Who maintains it?</h3>
				<p className="text-sm text-muted-foreground">
					People or teams responsible. Optional — add as many as you like.
				</p>
			</div>

			{value.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{value.map((m, i) => {
						const Icon = getActorTypeIcon(m.actorType);
						return (
							<span
								key={`${m.kind}-${i}`}
								className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs"
							>
								<Icon className="size-3 text-primary" />
								<span>{m.name}</span>
								{m.kind === "new" && <span className="text-[10px] text-muted-foreground">new</span>}
								<button
									type="button"
									onClick={() => onChange(value.filter((_, j) => j !== i))}
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
				placeholder={value.length === 0 ? "Type a name to add a maintainer…" : "Add another…"}
				inputRef={inputRef}
				renderTail={renderTail}
				onBackspaceEmpty={onBackspaceEmpty}
			/>
		</div>
	);
}

/* ---------- Step 7: Review ---------- */

function StepReview({ data }: { data: BaseData }) {
	const TypeIcon = data.type ? assetTypeIcons[data.type] : null;
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Ready?</h3>
				<p className="text-sm text-muted-foreground">
					Here's what we'll create. You can edit any of it later.
				</p>
			</div>
			<div className="rounded-lg border border-primary/15 bg-muted/20 p-4 space-y-3">
				<div className="flex items-center gap-3">
					{TypeIcon && <TypeIcon className="size-5 text-primary" />}
					<div className="min-w-0 flex-1">
						<div className="font-medium">{data.name || "Untitled"}</div>
						<div className="text-xs text-muted-foreground uppercase tracking-wide">{data.type}</div>
					</div>
				</div>
				{data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}
				{data.location.trim() && (
					<div className="flex items-start gap-1.5 text-xs text-muted-foreground">
						<MapPin className="size-3 mt-0.5 shrink-0 text-primary" />
						<code className="bg-background/60 rounded px-1.5 py-0.5 font-mono break-all">
							{data.location.trim()}
						</code>
					</div>
				)}
				{data.tags.length > 0 && (
					<div className="pt-2 border-t border-primary/10">
						<div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
							<Tag className="size-3" /> Tags
						</div>
						<div className="flex flex-wrap gap-1.5">
							{data.tags.map((t, i) => (
								<span
									key={i}
									className="inline-flex items-center rounded-full border border-primary/20 bg-background/60 px-2 py-0.5 text-xs"
								>
									{t}
								</span>
							))}
						</div>
					</div>
				)}
				{data.maintainers.length > 0 && (
					<div className="pt-2 border-t border-primary/10">
						<div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
							<ActorIcon className="size-3" /> Maintainers
						</div>
						<div className="flex flex-wrap gap-1.5">
							{data.maintainers.map((m, i) => {
								const Icon = getActorTypeIcon(m.actorType);
								return (
									<span
										key={i}
										className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-background/60 px-2 py-0.5 text-xs"
									>
										<Icon className="size-3 text-primary" />
										{m.name}
									</span>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
