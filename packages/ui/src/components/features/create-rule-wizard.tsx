"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	Check,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import {
	closeWizard,
	type RuleCreateParams,
	type RuleCreateResult,
	type RuleSeverity,
} from "@/lib/wizard-store";
import { cn } from "@/lib/utils";

interface Frame {
	id: string;
	kind: "rule-create";
	params: RuleCreateParams;
	resolve: (result: RuleCreateResult | null) => void;
}

/* ================================================================== */
/* Severity options                                                    */
/* ================================================================== */

interface SeverityDef {
	value: RuleSeverity;
	label: string;
	hint: string;
	dotClass: string;
}

const SEVERITIES: SeverityDef[] = [
	{
		value: "info",
		label: "Info",
		hint: "Nice to know — no alarm if violated.",
		dotClass: "bg-blue-500",
	},
	{
		value: "warning",
		label: "Warning",
		hint: "Worth noticing — investigation expected.",
		dotClass: "bg-amber-500",
	},
	{
		value: "critical",
		label: "Critical",
		hint: "Must not happen — block or page.",
		dotClass: "bg-red-500",
	},
];

/* ================================================================== */
/* State types                                                         */
/* ================================================================== */

interface RuleData {
	name: string;
	description: string;
	severity: RuleSeverity | null;
	category: string;
}

type RuleStepId = "name" | "description" | "severity" | "category" | "review";
const ALL_STEPS: RuleStepId[] = [
	"name",
	"description",
	"severity",
	"category",
	"review",
];

/* ================================================================== */
/* Shell                                                               */
/* ================================================================== */

export function CreateRuleWizard({
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
			<RuleFlow frame={frame} isTop={isTop} />
		</WizardFocusProvider>
	);
}

function RuleFlow({ frame, isTop }: { frame: Frame; isTop: boolean }) {
	const { hasInteracted, markInteracted } = useWizardFocus();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	const [data, setData] = useState<RuleData>({
		name: frame.params.prefillName ?? "",
		description: "",
		severity: null,
		category: "",
	});

	const steps = useMemo<RuleStepId[]>(() => {
		return ALL_STEPS.filter((s) => {
			if (s === "name" && frame.params.prefillName) return false;
			return true;
		});
	}, [frame.params.prefillName]);

	const [stepIndex, setStepIndex] = useState(0);
	const step: RuleStepId = steps[stepIndex] ?? "review";
	const isLastStep = stepIndex === steps.length - 1;

	const submitRef = useRef<HTMLButtonElement | null>(null);

	const canAdvance = (() => {
		switch (step) {
			case "name":
				return data.name.trim().length > 0;
			case "description":
				return data.description.trim().length > 0;
			case "severity":
				return data.severity !== null;
			case "category":
				return true; // optional
			case "review":
				return (
					!submitting &&
					data.name.trim().length > 0 &&
					data.description.trim().length > 0 &&
					data.severity !== null
				);
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
		if (!data.severity || !data.name.trim() || !data.description.trim()) return;
		setSubmitting(true);
		try {
			const res = await fetch("/api/holocron/rules", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: data.name.trim(),
					description: data.description.trim(),
					severity: data.severity,
					category: data.category.trim() || null,
				}),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as
					| { error?: string }
					| null;
				throw new Error(body?.error ?? `Failed (${res.status})`);
			}
			const created = (await res.json()) as RuleCreateResult;
			queryClient.invalidateQueries({ queryKey: ["rules", "all"] });
			toast.success(`Created rule “${created.name}”`);
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

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) cancel();
			}}
		>
			<DialogContent
				className="sm:max-w-lg bg-card/90 backdrop-blur-xl border-primary/20"
				onKeyDown={handleDialogKey}
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
						<ShieldCheck className="size-4 text-primary" />
						New rule
					</DialogTitle>
					<DialogDescription className="sr-only">
						Step {stepIndex + 1} of {steps.length}
					</DialogDescription>
				</DialogHeader>

				<Stepper current={stepIndex} total={steps.length} />

				<div
					key={step}
					className="min-h-[180px] animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
				>
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
							onEnter={() => canAdvance && next()}
						/>
					)}
					{step === "severity" && (
						<StepSeverity
							value={data.severity}
							onCommit={(v) => {
								setData((d) => ({ ...d, severity: v }));
								setTimeout(next, 90);
							}}
						/>
					)}
					{step === "category" && (
						<StepCategory
							value={data.category}
							onChange={(v) => setData((d) => ({ ...d, category: v }))}
							onEnter={() => next()}
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
								{submitting ? "Creating…" : "Create rule"}
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
/* Steps                                                               */
/* ================================================================== */

function StepName({
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
				<h3 className="text-xl font-semibold">What should data respect?</h3>
				<p className="text-sm text-muted-foreground">
					A short, imperative name. E.g. “Email must be unique”.
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
				placeholder="Prices must be positive"
				className="h-11"
			/>
		</div>
	);
}

function StepDescription({
	value,
	onChange,
	onEnter,
}: {
	value: string;
	onChange: (v: string) => void;
	onEnter: () => void;
}) {
	const ref = useRef<HTMLTextAreaElement | null>(null);
	useWizardAutoFocus(ref);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Explain the intent</h3>
				<p className="text-sm text-muted-foreground">
					A human can read this and decide if data respects it.
				</p>
			</div>
			<Textarea
				ref={ref}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						// Stop the dialog's ⌘+Enter handler from also advancing,
						// otherwise we'd skip a step.
						e.preventDefault();
						e.stopPropagation();
						onEnter();
					}
				}}
				rows={4}
				placeholder="Every price column must be strictly greater than zero."
			/>
			<p className="text-[11px] text-muted-foreground/80">
				<Kbd>⌘↵</Kbd> to continue.
			</p>
		</div>
	);
}

function StepSeverity({
	value,
	onCommit,
}: {
	value: RuleSeverity | null;
	onCommit: (v: RuleSeverity) => void;
}) {
	const initialCursor = Math.max(
		0,
		SEVERITIES.findIndex((o) => o.value === value),
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

	const TOTAL = SEVERITIES.length;
	const handleKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
		if (e.metaKey || e.ctrlKey) return;
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
				const opt = SEVERITIES[idx];
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
				<h3 className="text-xl font-semibold">How severe is a violation?</h3>
				<p className="text-sm text-muted-foreground">
					This is about the rule itself, not about a specific asset.
				</p>
			</div>
			<div className="flex flex-col gap-2" role="radiogroup">
				{SEVERITIES.map((opt, idx) => {
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
								"flex items-start gap-3 rounded-lg border p-3 text-left transition-all outline-none",
								active
									? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
									: highlighted
										? "border-primary/60 bg-muted/40"
										: "border-primary/15 hover:border-primary/40 hover:bg-muted/40",
								"focus-visible:ring-2 focus-visible:ring-primary/50",
							)}
						>
							<span
								className={cn(
									"mt-1 inline-block size-2.5 rounded-full",
									opt.dotClass,
								)}
							/>
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

function StepCategory({
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
				<h3 className="text-xl font-semibold">A category? (optional)</h3>
				<p className="text-sm text-muted-foreground">
					Free-form tag to group rules together. Skip with Enter.
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
				placeholder="privacy, freshness, integrity…"
				className="h-11"
			/>
		</div>
	);
}

function StepReview({ data }: { data: RuleData }) {
	const severityMeta = SEVERITIES.find((s) => s.value === data.severity);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Ready?</h3>
				<p className="text-sm text-muted-foreground">
					A catalog rule — attach it to assets afterwards.
				</p>
			</div>
			<div className="rounded-lg border border-primary/15 bg-muted/20 p-4 space-y-2 text-sm">
				<div className="flex items-center gap-2">
					<Sparkles className="size-4 text-primary" />
					<span className="font-medium truncate">{data.name}</span>
				</div>
				<p className="text-muted-foreground whitespace-pre-wrap">
					{data.description}
				</p>
				<div className="flex items-center gap-3 pt-1 text-xs">
					{severityMeta && (
						<span className="inline-flex items-center gap-1.5">
							<span
								className={cn(
									"inline-block size-2 rounded-full",
									severityMeta.dotClass,
								)}
							/>
							{severityMeta.label}
						</span>
					)}
					{data.category.trim() && (
						<span className="rounded border border-primary/15 px-1.5 py-0.5">
							{data.category.trim()}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

/* ================================================================== */
/* Keyboard hints                                                      */
/* ================================================================== */

function HintStrip({
	step,
	canBack,
}: {
	step: RuleStepId;
	canBack: boolean;
}) {
	const stepBits: Record<RuleStepId, React.ReactNode> = {
		name: (
			<>
				<Kbd>↵</Kbd> continue
			</>
		),
		description: (
			<>
				<Kbd>⌘↵</Kbd> continue
			</>
		),
		severity: (
			<>
				<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> select
			</>
		),
		category: (
			<>
				<Kbd>↵</Kbd> continue (or skip)
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
