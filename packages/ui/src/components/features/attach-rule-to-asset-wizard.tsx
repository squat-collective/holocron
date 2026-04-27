"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ShieldCheck, Sparkles, X } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
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
import { getEntityStyle, getSeverityStyle } from "@/lib/entity-styles";
import { AssetIcon, enforcementIcons, getAssetTypeIcon, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
	closeWizard,
	openCreateAssetWizard,
	type RuleAttachToAssetParams,
	type RuleAttachToAssetResult,
	type RuleEnforcement,
} from "@/lib/wizard-store";

const ASSET_TYPES = ["dataset", "report", "process", "system"] as const;
type AssetType = (typeof ASSET_TYPES)[number];

function isAssetType(value: string): value is AssetType {
	return (ASSET_TYPES as readonly string[]).includes(value);
}

/**
 * Rule-side counterpart of ApplyRuleWizard. The user is on a rule page,
 * knows the rule, and picks which asset to attach it to + enforcement tier.
 * Steps: asset → enforcement → note → review.
 */

interface Frame {
	id: string;
	kind: "rule-attach-to-asset";
	params: RuleAttachToAssetParams;
	resolve: (result: RuleAttachToAssetResult | null) => void;
}

interface PickedAsset {
	uid: string;
	name: string;
	type: "dataset" | "report" | "process" | "system";
}

interface ApplyData {
	asset: PickedAsset | null;
	enforcement: RuleEnforcement | null;
	note: string;
}

type StepId = "asset" | "enforcement" | "note" | "review";
const STEPS: StepId[] = ["asset", "enforcement", "note", "review"];

interface EnforcementDef {
	value: RuleEnforcement;
	label: string;
	hint: string;
	icon: LucideIcon;
}

const ENFORCEMENTS: EnforcementDef[] = [
	{
		value: "enforced",
		label: "Enforced",
		hint: "Checked — violations block usage",
		icon: enforcementIcons.enforced,
	},
	{
		value: "alerting",
		label: "Alerting",
		hint: "Checked — violations raise an alert",
		icon: enforcementIcons.alerting,
	},
	{
		value: "documented",
		label: "Documented",
		hint: "No automated check in place (yet)",
		icon: enforcementIcons.documented,
	},
];

/* ================================================================== */
/* Shell                                                               */
/* ================================================================== */

export function AttachRuleToAssetWizard({
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
			<Flow frame={frame} isTop={isTop} />
		</WizardFocusProvider>
	);
}

function Flow({ frame, isTop }: { frame: Frame; isTop: boolean }) {
	const { hasInteracted, markInteracted } = useWizardFocus();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [data, setData] = useState<ApplyData>({
		asset: null,
		enforcement: null,
		note: "",
	});
	const [stepIndex, setStepIndex] = useState(0);
	const step = STEPS[stepIndex] ?? "review";
	const isLastStep = stepIndex === STEPS.length - 1;
	const submitRef = useRef<HTMLButtonElement | null>(null);

	const canAdvance = (() => {
		switch (step) {
			case "asset":
				return data.asset !== null;
			case "enforcement":
				return data.enforcement !== null;
			case "note":
				return true;
			case "review":
				return !submitting && data.asset !== null && data.enforcement !== null;
		}
	})();

	const next = useCallback(() => {
		markInteracted();
		setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
	}, [markInteracted]);
	const back = useCallback(() => {
		markInteracted();
		setStepIndex((i) => Math.max(i - 1, 0));
	}, [markInteracted]);

	const cancel = () => {
		setOpen(false);
		closeWizard(frame.id, null);
	};

	const submit = useCallback(async () => {
		if (!data.asset || !data.enforcement) return;
		setSubmitting(true);
		try {
			const properties: Record<string, unknown> = {
				enforcement: data.enforcement,
			};
			if (data.note.trim()) properties.note = data.note.trim();
			const res = await fetch("/api/holocron/relations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from_uid: frame.params.ruleUid,
					to_uid: data.asset.uid,
					type: "applies_to",
					verified: true,
					properties,
				}),
			});
			if (!res.ok) {
				const body = await res.text();
				throw new Error(body || `Attach failed (${res.status})`);
			}
			queryClient.invalidateQueries({
				queryKey: ["rules", "for-asset", data.asset.uid],
			});
			queryClient.invalidateQueries({ queryKey: ["relations"] });
			toast.success(`Attached “${frame.params.ruleName}” to ${data.asset.name}`);
			setOpen(false);
			closeWizard(frame.id, { count: 1 });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
			setSubmitting(false);
		}
	}, [data, queryClient, frame]);

	useEffect(() => {
		if (!hasInteracted || !isLastStep || submitting) return;
		const t = setTimeout(() => submitRef.current?.focus(), 40);
		return () => clearTimeout(t);
	}, [hasInteracted, isLastStep, submitting]);

	const handleDialogKey = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!isTop) return;
		if (!(event.metaKey || event.ctrlKey)) return;
		if (event.key === "Enter" || event.key === "ArrowRight") {
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

	const sevStyle = getSeverityStyle(frame.params.severity);

	return (
		<Dialog
			open={open}
			onOpenChange={(n) => {
				if (!n) cancel();
			}}
		>
			<DialogContent
				className="sm:max-w-lg bg-card/90 backdrop-blur-xl border-primary/20"
				onKeyDown={handleDialogKey}
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
						<ShieldCheck className={cn("size-4", sevStyle.text)} />
						<span>Attach “{frame.params.ruleName}” to an asset</span>
					</DialogTitle>
					<DialogDescription className="sr-only">
						Step {stepIndex + 1} of {STEPS.length}
					</DialogDescription>
				</DialogHeader>

				<Stepper current={stepIndex} total={STEPS.length} />

				<div
					key={step}
					className="min-h-[200px] animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
				>
					{step === "asset" && (
						<StepAssetPicker
							value={data.asset}
							onChange={(asset) => setData((d) => ({ ...d, asset }))}
							onEnter={() => canAdvance && next()}
						/>
					)}
					{step === "enforcement" && (
						<StepEnforcement
							value={data.enforcement}
							onCommit={(v) => {
								setData((d) => ({ ...d, enforcement: v }));
								setTimeout(next, 90);
							}}
						/>
					)}
					{step === "note" && (
						<StepNote
							value={data.note}
							onChange={(v) => setData((d) => ({ ...d, note: v }))}
							onEnter={() => next()}
						/>
					)}
					{step === "review" && <StepReview data={data} ruleName={frame.params.ruleName} />}
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
								{submitting ? "Attaching…" : "Attach"}
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
/* Step 1: asset picker                                                */
/* ================================================================== */

function StepAssetPicker({
	value,
	onChange,
	onEnter,
}: {
	value: PickedAsset | null;
	onChange: (v: PickedAsset | null) => void;
	onEnter: () => void;
}) {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(inputRef);

	const onPick = useCallback(
		(hit: { uid: string; name: string; type: string }) => {
			if (!isAssetType(hit.type)) return;
			onChange({ uid: hit.uid, name: hit.name, type: hit.type });
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
					icon: Sparkles,
					label: (
						<>
							Create asset <strong>{q}</strong>
						</>
					),
					meta: "new",
					onSelect: async () => {
						const created = await openCreateAssetWizard({ prefillName: q });
						if (created) {
							onChange({ uid: created.uid, name: created.name, type: created.type });
						}
					},
				},
			];
		},
		[onChange],
	);

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Which asset?</h3>
				<p className="text-sm text-muted-foreground">
					Search existing, or type a new name to create one.
				</p>
			</div>
			{value ? (
				<AssetChip asset={value} onRemove={() => onChange(null)} />
			) : (
				<EntityPicker
					query={query}
					onQueryChange={setQuery}
					onPick={onPick}
					kinds={["asset"]}
					types={ASSET_TYPES}
					placeholder="Search assets or type a new name…"
					inputRef={inputRef}
					renderTail={renderTail}
					onEnterFallback={onEnter}
				/>
			)}
		</div>
	);
}

function AssetChip({ asset, onRemove }: { asset: PickedAsset; onRemove: () => void }) {
	const style = getEntityStyle(asset.type);
	const Icon = getAssetTypeIcon(asset.type);
	return (
		<div
			className={cn(
				"rounded-md border p-2.5 text-sm flex items-start gap-2",
				style.border,
				style.bg,
			)}
		>
			<Icon className={cn("size-4 mt-0.5 shrink-0", style.text)} />
			<div className="flex-1 min-w-0">
				<div className="font-medium truncate">{asset.name}</div>
				<div className="text-xs text-muted-foreground capitalize">{asset.type}</div>
			</div>
			<button
				type="button"
				tabIndex={-1}
				onClick={onRemove}
				className="text-muted-foreground hover:text-foreground"
				aria-label="Pick a different asset"
			>
				<X className="size-4" />
			</button>
		</div>
	);
}

/* ================================================================== */
/* Step 2: enforcement                                                 */
/* ================================================================== */

function StepEnforcement({
	value,
	onCommit,
}: {
	value: RuleEnforcement | null;
	onCommit: (v: RuleEnforcement) => void;
}) {
	const initialIndex = Math.max(
		0,
		ENFORCEMENTS.findIndex((o) => o.value === value),
	);
	const [cursor, setCursor] = useState(initialIndex);
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const firstRef = useRef<HTMLButtonElement | null>(null);
	useWizardAutoFocus(firstRef);

	const mountedRef = useRef(false);
	useEffect(() => {
		if (!mountedRef.current) {
			mountedRef.current = true;
			return;
		}
		buttonsRef.current[cursor]?.focus();
	}, [cursor]);

	const handleKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
		if (e.metaKey || e.ctrlKey) return;
		let nextIdx: number | null = null;
		switch (e.key) {
			case "ArrowDown":
			case "ArrowRight":
				if (idx + 1 < ENFORCEMENTS.length) nextIdx = idx + 1;
				break;
			case "ArrowUp":
			case "ArrowLeft":
				if (idx > 0) nextIdx = idx - 1;
				break;
			case "Enter":
			case " ": {
				e.preventDefault();
				const opt = ENFORCEMENTS[idx];
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
				<h3 className="text-xl font-semibold">How is it implemented?</h3>
				<p className="text-sm text-muted-foreground">
					On the chosen asset. Can evolve later per attachment.
				</p>
			</div>
			<div className="flex flex-col gap-2" role="radiogroup">
				{ENFORCEMENTS.map((opt, idx) => {
					const active = value === opt.value;
					const highlighted = idx === cursor;
					const Icon = opt.icon;
					return (
						<button
							key={opt.value}
							ref={(el) => {
								buttonsRef.current[idx] = el;
								if (idx === initialIndex) firstRef.current = el;
							}}
							type="button"
							role="radio"
							aria-checked={active}
							tabIndex={idx === initialIndex ? 0 : -1}
							onClick={() => onCommit(opt.value)}
							onFocus={() => setCursor(idx)}
							onKeyDown={(e) => handleKey(e, idx)}
							className={cn(
								"flex items-start gap-3 rounded-lg border p-3 text-left transition-all outline-none",
								active
									? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
									: highlighted
										? "border-primary/60 bg-muted/40"
										: "border-primary/15 hover:border-primary/40 hover:bg-muted/40",
								"focus-visible:ring-2 focus-visible:ring-primary/50",
							)}
						>
							<Icon className="size-4 text-primary mt-0.5 shrink-0" />
							<div className="flex-1">
								<div className="font-medium">{opt.label}</div>
								<div className="text-xs text-muted-foreground">{opt.hint}</div>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/* ================================================================== */
/* Step 3: note                                                        */
/* ================================================================== */

function StepNote({
	value,
	onChange,
	onEnter,
}: {
	value: string;
	onChange: (v: string) => void;
	onEnter: () => void;
}) {
	const ref = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(ref);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Any note? (optional)</h3>
				<p className="text-sm text-muted-foreground">Skip with Enter.</p>
			</div>
			<Input
				ref={ref}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						onEnter();
					}
				}}
				placeholder="e.g. Runner: Great Expectations #42"
				className="h-11"
			/>
		</div>
	);
}

/* ================================================================== */
/* Step 4: review                                                      */
/* ================================================================== */

function StepReview({ data, ruleName }: { data: ApplyData; ruleName: string }) {
	if (!data.asset || !data.enforcement) return null;
	const enforcementMeta = ENFORCEMENTS.find((e) => e.value === data.enforcement);
	const EnforcementIcon = enforcementMeta?.icon ?? ShieldCheck;
	const style = getEntityStyle(data.asset.type);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Ready?</h3>
				<p className="text-sm text-muted-foreground">
					Attach {ruleName} to {data.asset.name}.
				</p>
			</div>
			<div className="rounded-lg border border-primary/15 bg-muted/20 p-4 space-y-3 text-sm">
				<div className="flex items-center gap-2">
					<AssetIcon className={cn("size-4", style.text)} />
					<span className="font-medium truncate">{data.asset.name}</span>
					<span className="text-xs text-muted-foreground capitalize">{data.asset.type}</span>
				</div>
				<div className="flex items-center gap-2 text-xs">
					<EnforcementIcon className="size-3.5 text-primary" />
					<span className="font-medium">{enforcementMeta?.label}</span>
					<span className="text-muted-foreground">· {enforcementMeta?.hint}</span>
				</div>
				{data.note.trim() && (
					<div className="text-xs text-muted-foreground italic">“{data.note.trim()}”</div>
				)}
			</div>
		</div>
	);
}

/* ================================================================== */
/* Hints                                                               */
/* ================================================================== */

function HintStrip({ step, canBack }: { step: StepId; canBack: boolean }) {
	const stepBits: Record<StepId, React.ReactNode> = {
		asset: (
			<>
				<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> choose · <Kbd>⌫</Kbd> change
			</>
		),
		enforcement: (
			<>
				<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> select
			</>
		),
		note: (
			<>
				<Kbd>↵</Kbd> continue (or skip)
			</>
		),
		review: (
			<>
				<Kbd>↵</Kbd> attach
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
