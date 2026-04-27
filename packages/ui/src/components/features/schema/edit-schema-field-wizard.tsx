"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, PenLine, ShieldAlert } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	Kbd,
	useConditionalAutoFocus,
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
import { type SchemaNode, updateSchemaNode } from "@/lib/schema-ops";
import { cn } from "@/lib/utils";
import {
	closeWizard,
	type SchemaEditFieldParams,
	type SchemaEditFieldResult,
	type SchemaFieldSpec,
} from "@/lib/wizard-store";

/**
 * One small wizard for editing a single scalar prop of a schema node —
 * name / description / containerType / dataType / pii. Mirrors the
 * edit-asset-field-wizard shape so the visual language stays identical.
 *
 * The wizard fetches the asset itself (to avoid stale reads), swaps the
 * target prop on the node at `nodePath`, and PUTs the full metadata back.
 */

interface Frame {
	id: string;
	kind: "schema-edit-field";
	params: SchemaEditFieldParams;
	resolve: (result: SchemaEditFieldResult | null) => void;
}

const FIELD_LABELS: Record<SchemaFieldSpec["field"], string> = {
	name: "Rename",
	description: "Edit description",
	containerType: "Change container type",
	dataType: "Change data type",
	pii: "Personally-identifiable data",
};

const FIELD_HINTS: Record<SchemaFieldSpec["field"], string> = {
	name: "Shown in the tree, breadcrumbs, and every search result.",
	description: "A short note about what this column or section means.",
	containerType: "What kind of group is this — sheet, table, view…",
	dataType: "The datum stored in each row — string, int, date…",
	pii: "Flag when this column contains PII so governance tooling can pick it up.",
};

export function EditSchemaFieldWizard({
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
			<EditFlow frame={frame} isTop={isTop} />
		</WizardFocusProvider>
	);
}

interface AssetLike {
	metadata: Record<string, unknown>;
}

function EditFlow({ frame, isTop }: { frame: Frame; isTop: boolean }) {
	const queryClient = useQueryClient();
	const { spec, assetUid, assetName, nodeName, nodePath, nodeKind } = frame.params;
	const [open, setOpen] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	// For `pii` we track a boolean; everything else is a string (the select
	// input also lives in this string state — "custom" gets flipped when the
	// free-text input is used).
	const [textValue, setTextValue] = useState<string>(
		spec.input === "toggle" ? "" : spec.currentValue === null ? "" : String(spec.currentValue),
	);
	const [piiValue, setPiiValue] = useState<boolean>(
		spec.input === "toggle" ? spec.currentValue : false,
	);

	const inputRef = useRef<HTMLInputElement | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const firstOptionRef = useRef<HTMLButtonElement | null>(null);

	// Same conditional-autofocus pattern as edit-asset-field — different
	// element type per `spec.input` discriminator.
	useConditionalAutoFocus(
		() => {
			if (spec.input === "textarea") return textareaRef.current;
			if (spec.input === "select" || spec.input === "toggle") {
				return firstOptionRef.current;
			}
			return inputRef.current;
		},
		[spec.input],
	);

	const normalized = textValue.trim();
	const canSubmit = (() => {
		if (submitting) return false;
		if (spec.input === "toggle") return piiValue !== spec.currentValue;
		if (spec.field === "name") return normalized.length > 0;
		return true; // description / types — empty means "clear"
	})();

	const cancel = () => {
		setOpen(false);
		closeWizard(frame.id, null);
	};

	const submit = useCallback(async () => {
		setSubmitting(true);
		try {
			// Always refetch to avoid racing with other writers on the same asset.
			const getRes = await fetch(`/api/holocron/assets/${assetUid}`);
			if (!getRes.ok) throw new Error(`Fetch failed (${getRes.status})`);
			const current = (await getRes.json()) as AssetLike;
			const currentSchema = (current.metadata.schema as SchemaNode[] | undefined) ?? [];

			const nextSchema = updateSchemaNode(currentSchema, nodePath, (n) => {
				if (spec.input === "toggle") {
					return { ...n, pii: piiValue };
				}
				const trimmed = normalized;
				const nextVal = trimmed === "" ? undefined : trimmed;
				switch (spec.field) {
					case "name":
						return { ...n, name: trimmed };
					case "description":
						return { ...n, description: nextVal };
					case "containerType":
						return { ...n, containerType: nextVal };
					case "dataType":
						return { ...n, dataType: nextVal };
				}
			});

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
			toast.success(
				spec.input === "toggle"
					? piiValue
						? "Marked as PII"
						: "Unmarked PII"
					: `Saved ${spec.field === "name" ? "name" : spec.field}`,
			);
			const newPath = spec.field === "name" ? [...nodePath.slice(0, -1), normalized] : undefined;
			setOpen(false);
			closeWizard(frame.id, { saved: true, newPath });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
			setSubmitting(false);
		}
	}, [spec, normalized, piiValue, assetUid, nodePath, queryClient, frame.id]);

	const handleDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
		if (!isTop) return;
		if (!(e.metaKey || e.ctrlKey)) return;
		if (e.key === "Enter" || e.key === "ArrowRight") {
			e.preventDefault();
			if (canSubmit) void submit();
		}
	};

	const title = `${FIELD_LABELS[spec.field]} · ${nodeName}`;

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
						{spec.input === "toggle" ? (
							<ShieldAlert className="size-4 text-primary" />
						) : (
							<PenLine className="size-4 text-primary" />
						)}
						<span>{title}</span>
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground">
						In <strong>{assetName}</strong> — {nodeKind}{" "}
						<code className="bg-muted px-1 rounded">{nodePath.join(" / ")}</code>
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 pt-1">
					<p className="text-sm text-muted-foreground">{FIELD_HINTS[spec.field]}</p>

					{spec.input === "text" && (
						<Input
							ref={inputRef}
							value={textValue}
							onChange={(e) => setTextValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
									e.preventDefault();
									e.stopPropagation();
									if (canSubmit) void submit();
								}
							}}
							placeholder="New name"
							className="h-11"
						/>
					)}

					{spec.input === "textarea" && (
						<Textarea
							ref={textareaRef}
							value={textValue}
							onChange={(e) => setTextValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									e.stopPropagation();
									if (canSubmit) void submit();
								}
							}}
							rows={4}
							placeholder="Describe this node…"
						/>
					)}

					{spec.input === "select" && (
						<SelectPicker
							value={textValue}
							options={spec.options}
							onCommit={(v) => {
								setTextValue(v);
								setTimeout(() => void submit(), 60);
							}}
							onFocusChange={(v) => setTextValue(v)}
							firstOptionRef={firstOptionRef}
						/>
					)}

					{spec.input === "toggle" && (
						<TogglePicker
							value={piiValue}
							onCommit={(v) => {
								setPiiValue(v);
								setTimeout(() => void submit(), 60);
							}}
							onFocusChange={setPiiValue}
							firstOptionRef={firstOptionRef}
						/>
					)}
				</div>

				<div className="text-[11px] text-muted-foreground/70 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
					{spec.input === "textarea" ? (
						<>
							<Kbd>⌘↵</Kbd> save
						</>
					) : spec.input === "select" || spec.input === "toggle" ? (
						<>
							<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> save
						</>
					) : (
						<>
							<Kbd>↵</Kbd> save
						</>
					)}
				</div>

				<DialogFooter className="sm:justify-between gap-2 pt-2">
					<Button type="button" variant="ghost" onClick={cancel}>
						Cancel
					</Button>
					<Button type="button" onClick={submit} disabled={!canSubmit}>
						<Check className="size-4" />
						{submitting ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/* ------------------------------------------------------------------ */

function SelectPicker({
	value,
	options,
	onCommit,
	onFocusChange,
	firstOptionRef,
}: {
	value: string;
	options: readonly { value: string; label: string }[];
	onCommit: (v: string) => void;
	onFocusChange: (v: string) => void;
	firstOptionRef: React.RefObject<HTMLButtonElement | null>;
}) {
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const textRef = useRef<HTMLInputElement | null>(null);
	const suggestedIndex = options.findIndex((o) => o.value === value);
	const isCustom = value !== "" && suggestedIndex === -1;
	// `cursor = options.length` means the custom-text row is active.
	const initialIndex = isCustom ? options.length : Math.max(0, suggestedIndex);
	const [cursor, setCursor] = useState(initialIndex);

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
		<div className="flex flex-col gap-2" role="radiogroup">
			{options.map((opt, idx) => {
				const active = value === opt.value;
				const highlighted = idx === cursor;
				return (
					<button
						key={opt.value}
						ref={(el) => {
							buttonsRef.current[idx] = el;
							if (idx === initialIndex) firstOptionRef.current = el;
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
							"flex items-start gap-3 rounded-lg border p-3 text-left transition-all outline-none",
							active
								? "border-primary bg-primary/10 shadow-sm shadow-primary/20"
								: highlighted
									? "border-primary/60 bg-muted/40"
									: "border-primary/15 hover:border-primary/40 hover:bg-muted/40",
							"focus-visible:ring-2 focus-visible:ring-primary/50",
						)}
					>
						<div className="flex-1">
							<div className="font-medium">{opt.label}</div>
						</div>
					</button>
				);
			})}
			<div
				className={cn(
					"flex items-center gap-2 rounded-lg border p-2 transition-all",
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
	);
}

function TogglePicker({
	value,
	onCommit,
	onFocusChange,
	firstOptionRef,
}: {
	value: boolean;
	onCommit: (v: boolean) => void;
	onFocusChange: (v: boolean) => void;
	firstOptionRef: React.RefObject<HTMLButtonElement | null>;
}) {
	const opts = [
		{ value: true, label: "Yes — contains PII", hint: "Personally-identifiable" },
		{ value: false, label: "No — not PII", hint: "Safe to display" },
	];
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const initial = value ? 0 : 1;
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
		<div className="flex flex-col gap-2" role="radiogroup">
			{opts.map((opt, idx) => {
				const active = value === opt.value;
				const highlighted = idx === cursor;
				return (
					<button
						key={String(opt.value)}
						ref={(el) => {
							buttonsRef.current[idx] = el;
							if (idx === initial) firstOptionRef.current = el;
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
						<div className="flex-1">
							<div className="font-medium">{opt.label}</div>
							<div className="text-xs text-muted-foreground">{opt.hint}</div>
						</div>
					</button>
				);
			})}
		</div>
	);
}
