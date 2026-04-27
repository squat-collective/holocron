"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FolderPlus, Plus } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
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
import { queryKeys } from "@/lib/query-keys";
import {
	CONTAINER_TYPE_OPTIONS,
	childPath,
	DATA_TYPE_OPTIONS,
	insertSchemaChild,
	makeSchemaNodeId,
	type SchemaNode,
} from "@/lib/schema-ops";
import { cn } from "@/lib/utils";
import {
	closeWizard,
	type SchemaAddChildParams,
	type SchemaAddChildResult,
} from "@/lib/wizard-store";

/**
 * Step-by-step wizard for adding a child (container or field) under a
 * parent node. Mirrors the attach-rule-to-asset-wizard shape so the
 * visual language and keyboard affordances stay identical across the app.
 *
 * Steps (when prefillKind is unset): kind → name → type → description → review
 * With prefillKind:                    name → type → description → review
 *
 * Every step:
 *  - autofocuses its primary element
 *  - commits via ⌘↵ / ⌘→ and navigates back via ⌘←
 *  - shows a hint strip with the keys relevant for that step
 */

interface Frame {
	id: string;
	kind: "schema-add-child";
	params: SchemaAddChildParams;
	resolve: (result: SchemaAddChildResult | null) => void;
}

type Kind = "container" | "field";
type StepId = "kind" | "name" | "type" | "description" | "review";

export function AddSchemaChildWizard({
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

interface AssetLike {
	metadata: Record<string, unknown>;
}

function Flow({ frame, isTop }: { frame: Frame; isTop: boolean }) {
	const { assetUid, assetName, parentPath, parentLabel, prefillKind } = frame.params;
	const { hasInteracted, markInteracted } = useWizardFocus();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	const steps: StepId[] = prefillKind
		? ["name", "type", "description", "review"]
		: ["kind", "name", "type", "description", "review"];

	const [stepIndex, setStepIndex] = useState(0);
	const step: StepId = steps[stepIndex] ?? "review";
	const isLastStep = stepIndex === steps.length - 1;
	const submitRef = useRef<HTMLButtonElement | null>(null);

	const [kind, setKind] = useState<Kind>(prefillKind ?? "container");
	const [name, setName] = useState("");
	const [typeValue, setTypeValue] = useState("");
	const [description, setDescription] = useState("");

	const trimmedName = name.trim();

	const canAdvance = (() => {
		switch (step) {
			case "kind":
				return true;
			case "name":
				return trimmedName.length > 0;
			case "type":
				return true; // type is optional
			case "description":
				return true; // description is optional
			case "review":
				return !submitting && trimmedName.length > 0;
		}
	})();

	const next = useCallback(() => {
		markInteracted();
		setStepIndex((i) => Math.min(i + 1, steps.length - 1));
	}, [markInteracted, steps.length]);

	const back = useCallback(() => {
		markInteracted();
		setStepIndex((i) => Math.max(i - 1, 0));
	}, [markInteracted]);

	const cancel = () => {
		setOpen(false);
		closeWizard(frame.id, null);
	};

	const submit = useCallback(async () => {
		if (!trimmedName) return;
		setSubmitting(true);
		try {
			const getRes = await fetch(`/api/holocron/assets/${assetUid}`);
			if (!getRes.ok) throw new Error(`Fetch failed (${getRes.status})`);
			const current = (await getRes.json()) as AssetLike;
			const currentSchema = (current.metadata.schema as SchemaNode[] | undefined) ?? [];

			const newNode: SchemaNode =
				kind === "container"
					? {
							id: makeSchemaNodeId(),
							name: trimmedName,
							nodeType: "container",
							containerType: typeValue.trim() || undefined,
							description: description.trim() || undefined,
							children: [],
						}
					: {
							id: makeSchemaNodeId(),
							name: trimmedName,
							nodeType: "field",
							dataType: typeValue.trim() || undefined,
							description: description.trim() || undefined,
						};

			const nextSchema = insertSchemaChild(currentSchema, parentPath, newNode);
			const nextMetadata = { ...current.metadata, schema: nextSchema };
			const putRes = await fetch(`/api/holocron/assets/${assetUid}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ metadata: nextMetadata }),
			});
			if (!putRes.ok) {
				const body = await putRes.text();
				throw new Error(body || `Update failed (${putRes.status})`);
			}
			queryClient.invalidateQueries({
				queryKey: queryKeys.assets.detail(assetUid),
			});
			toast.success(`Added ${kind === "container" ? "container" : "field"} “${trimmedName}”`);
			setOpen(false);
			closeWizard(frame.id, {
				path: childPath(parentPath, trimmedName),
				kind,
			});
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
			setSubmitting(false);
		}
	}, [trimmedName, kind, typeValue, description, assetUid, parentPath, queryClient, frame.id]);

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
			if (isLastStep) void submit();
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
						{kind === "container" ? (
							<FolderPlus className="size-4 text-primary" />
						) : (
							<Plus className="size-4 text-primary" />
						)}
						<span>
							Add {kind} under {parentLabel}
						</span>
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground">
						In <strong>{assetName}</strong>
						{parentPath.length > 0 && (
							<>
								{" "}
								— <code className="bg-muted px-1 rounded">{parentPath.join(" / ")}</code>
							</>
						)}
					</DialogDescription>
				</DialogHeader>

				<Stepper current={stepIndex} total={steps.length} />

				<div
					key={step}
					className="min-h-[200px] animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
				>
					{step === "kind" && (
						<StepKind
							value={kind}
							onCommit={(v) => {
								setKind(v);
								setTimeout(next, 90);
							}}
							onFocusChange={setKind}
						/>
					)}
					{step === "name" && (
						<StepName
							kind={kind}
							value={name}
							onChange={setName}
							onEnter={() => {
								if (canAdvance) next();
							}}
						/>
					)}
					{step === "type" && (
						<StepType
							kind={kind}
							value={typeValue}
							onCommit={(v) => {
								setTypeValue(v);
								setTimeout(next, 90);
							}}
							onFocusChange={setTypeValue}
						/>
					)}
					{step === "description" && (
						<StepDescription value={description} onChange={setDescription} onEnter={() => next()} />
					)}
					{step === "review" && (
						<StepReview
							kind={kind}
							name={trimmedName}
							typeValue={typeValue.trim()}
							description={description.trim()}
							parentLabel={parentLabel}
						/>
					)}
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
								{submitting ? "Adding…" : "Add"}
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
/* Step 1 — kind                                                       */
/* ================================================================== */

function StepKind({
	value,
	onCommit,
	onFocusChange,
}: {
	value: Kind;
	onCommit: (v: Kind) => void;
	onFocusChange: (v: Kind) => void;
}) {
	const opts: { value: Kind; label: string; hint: string; Icon: typeof Plus }[] = [
		{
			value: "container",
			label: "Container",
			hint: "A sheet, table, section, view, or nested group.",
			Icon: FolderPlus,
		},
		{
			value: "field",
			label: "Field",
			hint: "A column, attribute, or leaf value.",
			Icon: Plus,
		},
	];
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const firstRef = useRef<HTMLButtonElement | null>(null);
	useWizardAutoFocus(firstRef);
	const initial = value === "container" ? 0 : 1;
	const [cursor, setCursor] = useState(initial);

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
				if (idx + 1 < opts.length) nextIdx = idx + 1;
				break;
			case "ArrowUp":
			case "ArrowLeft":
				if (idx > 0) nextIdx = idx - 1;
				break;
			case "Enter":
			case " ": {
				e.preventDefault();
				const opt = opts[idx];
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
				<p className="text-sm text-muted-foreground">Containers group stuff; fields are leaves.</p>
			</div>
			<div className="flex flex-col gap-2" role="radiogroup">
				{opts.map((opt, idx) => {
					const active = value === opt.value;
					const highlighted = idx === cursor;
					const Icon = opt.Icon;
					return (
						<button
							key={opt.value}
							ref={(el) => {
								buttonsRef.current[idx] = el;
								if (idx === initial) firstRef.current = el;
							}}
							type="button"
							// biome-ignore lint/a11y/useSemanticElements: radio semantics fit better here
							role="radio"
							aria-checked={active}
							tabIndex={idx === initial ? 0 : -1}
							onClick={() => onCommit(opt.value)}
							onFocus={() => {
								setCursor(idx);
								onFocusChange(opt.value);
							}}
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
/* Step 2 — name                                                       */
/* ================================================================== */

function StepName({
	kind,
	value,
	onChange,
	onEnter,
}: {
	kind: Kind;
	value: string;
	onChange: (v: string) => void;
	onEnter: () => void;
}) {
	const ref = useRef<HTMLInputElement | null>(null);
	useWizardAutoFocus(ref);
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">What's this {kind} called?</h3>
				<p className="text-sm text-muted-foreground">
					{kind === "container"
						? "Short, distinct — e.g. Customers, Transactions, Dashboard."
						: "Usually a column or attribute — e.g. email, order_total."}
				</p>
			</div>
			<Input
				ref={ref}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
						e.preventDefault();
						onEnter();
					}
				}}
				placeholder={kind === "container" ? "e.g. Customers" : "e.g. email"}
				className="h-11"
			/>
		</div>
	);
}

/* ================================================================== */
/* Step 3 — type                                                       */
/* ================================================================== */

function StepType({
	kind,
	value,
	onCommit,
	onFocusChange,
}: {
	kind: Kind;
	value: string;
	onCommit: (v: string) => void;
	onFocusChange: (v: string) => void;
}) {
	const options = kind === "container" ? CONTAINER_TYPE_OPTIONS : DATA_TYPE_OPTIONS;
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const textRef = useRef<HTMLInputElement | null>(null);
	const suggestedIndex = options.findIndex((o) => o.value === value);
	const isCustom = value !== "" && suggestedIndex === -1;
	// cursor === options.length means the custom input row is active
	const initialIndex = isCustom ? options.length : suggestedIndex >= 0 ? suggestedIndex : 0;
	const [cursor, setCursor] = useState(initialIndex);
	const firstRef = useRef<HTMLButtonElement | null>(null);
	useWizardAutoFocus(firstRef);

	const mountedRef = useRef(false);
	useEffect(() => {
		if (!mountedRef.current) {
			mountedRef.current = true;
			return;
		}
		if (cursor < options.length) {
			buttonsRef.current[cursor]?.focus();
		} else {
			textRef.current?.focus();
		}
	}, [cursor, options.length]);

	const handleKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
		if (e.metaKey || e.ctrlKey) return;
		let nextIdx: number | null = null;
		switch (e.key) {
			case "ArrowDown":
			case "ArrowRight":
				if (idx + 1 <= options.length) nextIdx = idx + 1;
				break;
			case "ArrowUp":
			case "ArrowLeft":
				if (idx > 0) nextIdx = idx - 1;
				break;
			case "Enter":
			case " ": {
				e.preventDefault();
				const opt = options[idx];
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
				<h3 className="text-xl font-semibold">
					{kind === "container" ? "What kind of container?" : "What's the data type?"}
				</h3>
				<p className="text-sm text-muted-foreground">Optional — you can skip and set it later.</p>
			</div>
			<div className="flex flex-col gap-2" role="radiogroup">
				{options.map((opt, idx) => {
					const active = value === opt.value;
					const highlighted = idx === cursor;
					return (
						<button
							key={opt.value}
							ref={(el) => {
								buttonsRef.current[idx] = el;
								if (idx === initialIndex) firstRef.current = el;
							}}
							type="button"
							// biome-ignore lint/a11y/useSemanticElements: radio semantics fit better here
							role="radio"
							aria-checked={active}
							tabIndex={idx === initialIndex ? 0 : -1}
							onClick={() => onCommit(opt.value)}
							onFocus={() => {
								setCursor(idx);
								onFocusChange(opt.value);
							}}
							onKeyDown={(e) => handleKey(e, idx)}
							className={cn(
								"flex items-start gap-3 rounded-lg border p-2.5 text-left transition-all outline-none",
								active
									? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
									: highlighted
										? "border-primary/60 bg-muted/40"
										: "border-primary/15 hover:border-primary/40 hover:bg-muted/40",
								"focus-visible:ring-2 focus-visible:ring-primary/50",
							)}
						>
							<div className="flex-1">
								<div className="font-medium text-sm">{opt.label}</div>
							</div>
						</button>
					);
				})}
				<div
					className={cn(
						"flex items-center gap-2 rounded-lg border p-2 transition-colors",
						cursor === options.length ? "border-primary/60 bg-muted/40" : "border-primary/15",
					)}
				>
					<span className="text-xs text-muted-foreground pl-1">Custom</span>
					<Input
						ref={textRef}
						value={isCustom ? value : ""}
						placeholder="type your own…"
						onChange={(e) => onFocusChange(e.target.value)}
						onFocus={() => setCursor(options.length)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
								e.preventDefault();
								e.stopPropagation();
								const v = (e.currentTarget as HTMLInputElement).value.trim();
								if (v) onCommit(v);
							}
						}}
						className="h-9 flex-1"
					/>
				</div>
			</div>
		</div>
	);
}

/* ================================================================== */
/* Step 4 — description                                                */
/* ================================================================== */

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
				<h3 className="text-xl font-semibold">Add a note? (optional)</h3>
				<p className="text-sm text-muted-foreground">Short note for humans. Skip with ⌘↵.</p>
			</div>
			<Textarea
				ref={ref}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						e.stopPropagation();
						onEnter();
					}
				}}
				rows={4}
				placeholder="e.g. Raw customer records from the Stripe export"
			/>
		</div>
	);
}

/* ================================================================== */
/* Step 5 — review                                                     */
/* ================================================================== */

function StepReview({
	kind,
	name,
	typeValue,
	description,
	parentLabel,
}: {
	kind: Kind;
	name: string;
	typeValue: string;
	description: string;
	parentLabel: string;
}) {
	const KindIcon = kind === "container" ? FolderPlus : Plus;
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-xl font-semibold">Ready?</h3>
				<p className="text-sm text-muted-foreground">
					Add <strong>{name || "—"}</strong> under {parentLabel}.
				</p>
			</div>
			<div className="rounded-lg border border-primary/15 bg-muted/20 p-4 space-y-2 text-sm">
				<div className="flex items-center gap-2">
					<KindIcon className="size-4 text-primary" />
					<span className="font-medium truncate">{name || "(unnamed)"}</span>
					<span className="text-xs text-muted-foreground capitalize">{kind}</span>
				</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>Type:</span>
					<span className="font-medium text-foreground">{typeValue || "(none)"}</span>
				</div>
				{description && <div className="text-xs text-muted-foreground italic">“{description}”</div>}
			</div>
		</div>
	);
}

/* ================================================================== */
/* Hints                                                               */
/* ================================================================== */

function HintStrip({ step, canBack }: { step: StepId; canBack: boolean }) {
	const bits: Record<StepId, React.ReactNode> = {
		kind: (
			<>
				<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> choose
			</>
		),
		name: (
			<>
				<Kbd>↵</Kbd> continue
			</>
		),
		type: (
			<>
				<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> choose · <Kbd>⌘↵</Kbd> skip
			</>
		),
		description: (
			<>
				<Kbd>⌘↵</Kbd> continue (or skip)
			</>
		),
		review: (
			<>
				<Kbd>↵</Kbd> add
			</>
		),
	};
	return (
		<div className="text-[11px] text-muted-foreground/70 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
			{bits[step]}
			{canBack && (
				<>
					{" · "}
					<Kbd>⌃←</Kbd> back
				</>
			)}
		</div>
	);
}
