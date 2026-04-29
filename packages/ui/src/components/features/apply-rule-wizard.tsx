"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ShieldCheck, Sparkles, X } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EntityPicker, type TailOption } from "@/components/features/search/entity-picker";
import {
	Kbd,
	Stepper,
	useWizardAutoFocus,
	useWizardFocus,
	WizardBody,
	WizardDialogContent,
	WizardFocusProvider,
} from "@/components/features/wizard-shared";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	AssetIcon,
	enforcementIcons,
	getContainerTypeIcon,
	type LucideIcon,
	SchemaFieldIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
	closeWizard,
	openCreateRuleWizard,
	type RuleApplyParams,
	type RuleApplyResult,
	type RuleApplyTargetOption,
	type RuleEnforcement,
	type RuleSeverity,
} from "@/lib/wizard-store";

function isRuleSeverity(value: string | undefined): value is RuleSeverity {
	return value === "info" || value === "warning" || value === "critical";
}

interface Frame {
	id: string;
	kind: "rule-apply";
	params: RuleApplyParams;
	resolve: (result: RuleApplyResult | null) => void;
}

/* ================================================================== */
/* Enforcement catalog                                                 */
/* ================================================================== */

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
/* State types                                                         */
/* ================================================================== */

interface PickedRule {
	uid: string;
	name: string;
	severity: RuleSeverity;
	category: string | null;
}

interface ApplyData {
	rule: PickedRule | null;
	enforcement: RuleEnforcement | null;
	target: RuleApplyTargetOption | "__whole__";
	note: string;
}

type StepId = "rule" | "enforcement" | "target" | "note" | "review";

/* ================================================================== */
/* Shell                                                               */
/* ================================================================== */

export function ApplyRuleWizard({
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
			<ApplyFlow frame={frame} isTop={isTop} />
		</WizardFocusProvider>
	);
}

function ApplyFlow({ frame, isTop }: { frame: Frame; isTop: boolean }) {
	const { hasInteracted, markInteracted } = useWizardFocus();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	const hasSchema = (frame.params.schemaTargets ?? []).length > 0;

	const [data, setData] = useState<ApplyData>({
		rule: null,
		enforcement: null,
		target: "__whole__",
		note: "",
	});

	const steps = useMemo<StepId[]>(() => {
		const all: StepId[] = ["rule", "enforcement", "target", "note", "review"];
		return all.filter((s) => {
			if (s === "target" && !hasSchema) return false;
			return true;
		});
	}, [hasSchema]);

	const [stepIndex, setStepIndex] = useState(0);
	const step: StepId = steps[stepIndex] ?? "review";
	const isLastStep = stepIndex === steps.length - 1;

	const submitRef = useRef<HTMLButtonElement | null>(null);

	const canAdvance = (() => {
		switch (step) {
			case "rule":
				return data.rule !== null;
			case "enforcement":
				return data.enforcement !== null;
			case "target":
				return true; // always a value
			case "note":
				return true;
			case "review":
				return !submitting && data.rule !== null && data.enforcement !== null;
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
		if (!data.rule || !data.enforcement) return;
		setSubmitting(true);
		try {
			const properties: Record<string, unknown> = {
				enforcement: data.enforcement,
			};
			if (data.target !== "__whole__") {
				properties.field_path = data.target.path;
			}
			if (data.note.trim()) properties.note = data.note.trim();

			const res = await fetch("/api/holocron/relations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					from_uid: data.rule.uid,
					to_uid: frame.params.assetUid,
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
				queryKey: ["rules", "for-asset", frame.params.assetUid],
			});
			queryClient.invalidateQueries({ queryKey: ["rules", "all"] });
			toast.success(`Attached “${data.rule.name}” to ${frame.params.assetName}`);
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
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) cancel();
			}}
		>
			<WizardDialogContent
				className="sm:max-w-lg bg-card/90 backdrop-blur-xl border-primary/20"
				onKeyDown={handleDialogKey}
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
						<ShieldCheck className="size-4 text-primary" />
						Attach a rule to {frame.params.assetName}
					</DialogTitle>
					<DialogDescription className="sr-only">
						Step {stepIndex + 1} of {steps.length}
					</DialogDescription>
				</DialogHeader>

				<div className="pt-3">
					<Stepper current={stepIndex} total={steps.length} />
				</div>

				<WizardBody>
				<div
					key={step}
					className="min-h-[200px] animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
				>
					{step === "rule" && (
						<StepRulePicker
							value={data.rule}
							onChange={(rule) => setData((d) => ({ ...d, rule }))}
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
					{step === "target" && (
						<StepTarget
							value={data.target}
							options={frame.params.schemaTargets ?? []}
							onChange={(t) => setData((d) => ({ ...d, target: t }))}
							onCommit={(t) => {
								setData((d) => ({ ...d, target: t }));
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
					{step === "review" && <StepReview data={data} assetName={frame.params.assetName} />}
				</div>
				</WizardBody>

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
								{submitting ? "Attaching…" : "Attach rule"}
							</Button>
						) : (
							<Button type="button" onClick={next} disabled={!canAdvance}>
								Next
							</Button>
						)}
					</div>
				</DialogFooter>
			</WizardDialogContent>
		</Dialog>
	);
}

/* ================================================================== */
/* Step 1: Rule picker (existing or recursive create)                  */
/* ================================================================== */

function StepRulePicker({
	value,
	onChange,
	onEnter,
}: {
	value: PickedRule | null;
	onChange: (v: PickedRule | null) => void;
	onEnter: () => void;
}) {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(inputRef);

	const onPick = useCallback(
		(hit: { uid: string; name: string; severity?: string; category?: string | null }) => {
			if (!isRuleSeverity(hit.severity)) return;
			onChange({
				uid: hit.uid,
				name: hit.name,
				severity: hit.severity,
				category: hit.category ?? null,
			});
		},
		[onChange],
	);

	const createNew = useCallback(
		async (name: string) => {
			const created = await openCreateRuleWizard({
				prefillName: name || undefined,
			});
			if (created) {
				onChange({
					uid: created.uid,
					name: created.name,
					severity: created.severity,
					category: created.category,
				});
			}
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
			if (q.length === 0) {
				return [
					{
						key: "new-rule-blank",
						icon: Sparkles,
						label: <>Create a brand new rule</>,
						meta: "new",
						onSelect: () => createNew(""),
					},
				];
			}
			if (hasExactMatch) return [];
			return [
				{
					key: "new-rule",
					icon: Sparkles,
					label: (
						<>
							Create new rule <strong>{q}</strong>
						</>
					),
					meta: "new",
					onSelect: () => createNew(q),
				},
			];
		},
		[createNew],
	);

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Which rule?</h3>
				<p className="text-sm text-muted-foreground">
					Pick a catalog rule, or type a new name to create one. You can attach more rules
					afterwards — each keeps its own enforcement.
				</p>
			</div>

			{value ? (
				<RuleChip rule={value} onRemove={() => onChange(null)} />
			) : (
				<EntityPicker
					query={query}
					onQueryChange={setQuery}
					onPick={onPick}
					kinds={["rule"]}
					placeholder="Search rules or type a new name…"
					inputRef={inputRef}
					renderTail={renderTail}
					onEnterFallback={onEnter}
					renderEntityMeta={(hit) => ({
						icon: ShieldCheck,
						meta: hit.category
							? `${hit.severity ?? "rule"} · ${hit.category}`
							: (hit.severity ?? "rule"),
					})}
				/>
			)}
		</div>
	);
}

function RuleChip({ rule, onRemove }: { rule: PickedRule; onRemove: () => void }) {
	return (
		<div className="rounded-md border border-primary/25 bg-primary/10 p-2.5 text-sm flex items-start gap-2">
			<ShieldCheck className="size-4 text-primary mt-0.5 shrink-0" />
			<div className="flex-1 min-w-0">
				<div className="font-medium truncate">{rule.name}</div>
				<div className="text-xs text-muted-foreground capitalize">
					{rule.severity}
					{rule.category ? ` · ${rule.category}` : ""}
				</div>
			</div>
			<button
				type="button"
				tabIndex={-1}
				onClick={onRemove}
				className="text-muted-foreground hover:text-foreground"
				aria-label="Pick a different rule"
			>
				<X className="size-4" />
			</button>
		</div>
	);
}

/* ================================================================== */
/* Step 2: Enforcement                                                 */
/* ================================================================== */

function StepEnforcement({
	value,
	onCommit,
}: {
	value: RuleEnforcement | null;
	onCommit: (v: RuleEnforcement) => void;
}) {
	const initialCursor = Math.max(
		0,
		ENFORCEMENTS.findIndex((o) => o.value === value),
	);
	const [cursor, setCursor] = useState(initialCursor);
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const initialCardRef = useRef<HTMLButtonElement | null>(null);
	useWizardAutoFocus(initialCardRef);

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
		const TOTAL = ENFORCEMENTS.length;
		let nextIdx: number | null = null;
		switch (e.key) {
			case "ArrowDown":
			case "ArrowRight":
				if (idx + 1 < TOTAL) nextIdx = idx + 1;
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
					On this asset specifically — can evolve over time.
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
/* Step 3: Target (whole asset or schema node)                         */
/* ================================================================== */

function StepTarget({
	value,
	options,
	onChange,
	onCommit,
}: {
	value: RuleApplyTargetOption | "__whole__";
	options: RuleApplyTargetOption[];
	onChange: (v: RuleApplyTargetOption | "__whole__") => void;
	onCommit: (v: RuleApplyTargetOption | "__whole__") => void;
}) {
	const allOptions: (RuleApplyTargetOption | "__whole__")[] = ["__whole__", ...options];
	const initialCursor = Math.max(
		0,
		allOptions.findIndex((o) =>
			o === "__whole__" ? value === "__whole__" : value !== "__whole__" && value.path === o.path,
		),
	);
	const [cursor, setCursor] = useState(initialCursor);
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const initialCardRef = useRef<HTMLButtonElement | null>(null);
	useWizardAutoFocus(initialCardRef);

	const mountedRef = useRef(false);
	useEffect(() => {
		if (!mountedRef.current) {
			mountedRef.current = true;
			return;
		}
		buttonsRef.current[cursor]?.focus();
		const opt = allOptions[cursor];
		if (opt !== undefined) onChange(opt);
	}, [cursor]);

	const TOTAL = allOptions.length;
	const handleKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
		if (e.metaKey || e.ctrlKey) return;
		let nextIdx: number | null = null;
		switch (e.key) {
			case "ArrowDown":
				if (idx + 1 < TOTAL) nextIdx = idx + 1;
				break;
			case "ArrowUp":
				if (idx > 0) nextIdx = idx - 1;
				break;
			case "Enter":
			case " ": {
				e.preventDefault();
				const opt = allOptions[idx];
				if (opt !== undefined) onCommit(opt);
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
				<h3 className="text-xl font-semibold">What does it apply to?</h3>
				<p className="text-sm text-muted-foreground">
					Whole asset or a specific part of its schema.
				</p>
			</div>
			<div
				className="flex flex-col gap-1 max-h-[260px] overflow-y-auto rounded-md border border-primary/15 p-1"
				role="radiogroup"
			>
				{allOptions.map((opt, idx) => {
					const isWhole = opt === "__whole__";
					const active = isWhole
						? value === "__whole__"
						: value !== "__whole__" && value.path === opt.path;
					const highlighted = idx === cursor;
					const Icon: LucideIcon = isWhole
						? AssetIcon
						: opt.kind === "field"
							? SchemaFieldIcon
							: getContainerTypeIcon(opt.containerType);
					return (
						<button
							key={isWhole ? "__whole__" : opt.path}
							ref={(el) => {
								buttonsRef.current[idx] = el;
								if (idx === initialCursor) initialCardRef.current = el;
							}}
							type="button"
							role="radio"
							aria-checked={active}
							tabIndex={idx === initialCursor ? 0 : -1}
							onClick={() => onCommit(opt)}
							onFocus={() => setCursor(idx)}
							onKeyDown={(e) => handleKey(e, idx)}
							className={cn(
								"flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors outline-none",
								active
									? "bg-primary/10 text-primary"
									: highlighted
										? "bg-muted/40"
										: "hover:bg-muted/40",
								"focus-visible:ring-2 focus-visible:ring-primary/40",
							)}
						>
							{isWhole ? (
								<>
									<Icon className="size-4 text-primary" />
									<span className="font-medium">Whole asset</span>
								</>
							) : (
								<>
									<span
										style={{ paddingLeft: `${opt.depth * 12}px` }}
										className="shrink-0 flex items-center"
									>
										<Icon className="size-4 text-muted-foreground" />
									</span>
									<span className="font-mono text-xs">{opt.path}</span>
									{opt.kind === "field" && opt.dataType && (
										<span className="text-[10px] text-muted-foreground">({opt.dataType})</span>
									)}
									{opt.kind === "container" && opt.containerType && (
										<span className="text-[10px] text-muted-foreground">({opt.containerType})</span>
									)}
								</>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

/* ================================================================== */
/* Step 4: Note (optional)                                             */
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
				<p className="text-sm text-muted-foreground">
					A link, a runner name, a caveat. Skip with Enter.
				</p>
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
/* Step 5: Review                                                      */
/* ================================================================== */

function StepReview({ data, assetName }: { data: ApplyData; assetName: string }) {
	if (!data.rule || !data.enforcement) return null;
	const enforcementMeta = ENFORCEMENTS.find((e) => e.value === data.enforcement);
	const EnforcementIcon = enforcementMeta?.icon ?? ShieldCheck;
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Ready?</h3>
				<p className="text-sm text-muted-foreground">Attach this rule to {assetName}.</p>
			</div>
			<div className="rounded-lg border border-primary/15 bg-muted/20 p-4 space-y-3 text-sm">
				<div className="flex items-center gap-2">
					<ShieldCheck className="size-4 text-primary" />
					<span className="font-medium truncate">{data.rule.name}</span>
					<span className="text-xs text-muted-foreground capitalize">{data.rule.severity}</span>
				</div>
				<div className="flex items-center gap-2 text-xs">
					<EnforcementIcon className="size-3.5 text-primary" />
					<span className="font-medium">{enforcementMeta?.label}</span>
					<span className="text-muted-foreground">· {enforcementMeta?.hint}</span>
				</div>
				<div className="text-xs flex items-center gap-2">
					<AssetIcon className="size-3.5 text-muted-foreground" />
					<span className="text-muted-foreground">Target:</span>
					<span className="font-mono">
						{data.target === "__whole__" ? "whole asset" : data.target.path}
					</span>
				</div>
				{data.note.trim() && (
					<div className="text-xs text-muted-foreground italic">“{data.note.trim()}”</div>
				)}
			</div>
		</div>
	);
}

/* ================================================================== */
/* Keyboard hints                                                      */
/* ================================================================== */

function HintStrip({ step, canBack }: { step: StepId; canBack: boolean }) {
	const stepBits: Record<StepId, React.ReactNode> = {
		rule: (
			<>
				<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> choose · <Kbd>⌫</Kbd> change
			</>
		),
		enforcement: (
			<>
				<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> select
			</>
		),
		target: (
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
