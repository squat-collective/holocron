"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, PenLine } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
	type AssetEditFieldParams,
	type AssetEditFieldResult,
	type AssetFieldSpec,
	closeWizard,
} from "@/lib/wizard-store";

/**
 * One tiny wizard for editing a scalar asset field (name / description /
 * location / status). The shape of the input is picked from `spec.input` so
 * every field goes through the same flow from the palette.
 */

interface Frame {
	id: string;
	kind: "asset-edit-field";
	params: AssetEditFieldParams;
	resolve: (result: AssetEditFieldResult | null) => void;
}

const FIELD_LABELS: Record<AssetFieldSpec["field"], string> = {
	name: "Rename asset",
	description: "Edit description",
	location: "Edit location",
	status: "Change status",
};

const FIELD_HINTS: Record<AssetFieldSpec["field"], string> = {
	name: "Pick a clear, human name.",
	description: "A short paragraph helps future-you and everyone else.",
	location: "Where this asset lives — a URL, a DB path, anything searchable.",
	status: "Drives how prominently this asset is surfaced.",
};

export function EditAssetFieldWizard({
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

function EditFlow({ frame, isTop }: { frame: Frame; isTop: boolean }) {
	const queryClient = useQueryClient();
	const { spec, assetUid, assetName } = frame.params;
	const [open, setOpen] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [value, setValue] = useState<string>(
		spec.currentValue === null ? "" : String(spec.currentValue),
	);

	const inputRef = useRef<HTMLInputElement | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const firstOptionRef = useRef<HTMLButtonElement | null>(null);

	// Conditional autofocus — different element type per spec.input. The
	// shared hook handles the "only focus if the user has interacted" rule
	// so this stays in lockstep with every other wizard.
	useConditionalAutoFocus(
		() => {
			if (spec.input === "textarea") return textareaRef.current;
			if (spec.input === "select") return firstOptionRef.current;
			return inputRef.current;
		},
		[spec.input],
	);

	const normalized = value.trim();
	const canSubmit = (() => {
		if (submitting) return false;
		if (spec.input === "select") return true;
		if (spec.field === "name") return normalized.length > 0;
		// description / location — empty means "clear it"
		return true;
	})();

	const cancel = () => {
		setOpen(false);
		closeWizard(frame.id, null);
	};

	const submit = useCallback(async () => {
		setSubmitting(true);
		try {
			const payload: Record<string, unknown> = {};
			if (spec.field === "status") {
				payload.status = value;
			} else if (spec.field === "name") {
				payload.name = normalized;
			} else {
				payload[spec.field] = normalized.length === 0 ? null : normalized;
			}

			const res = await fetch(`/api/holocron/assets/${assetUid}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				const body = await res.text();
				throw new Error(body || `Update failed (${res.status})`);
			}
			queryClient.invalidateQueries({ queryKey: queryKeys.assets.detail(assetUid) });
			queryClient.invalidateQueries({ queryKey: queryKeys.assets.all });
			toast.success(`Saved ${spec.field}`);
			setOpen(false);
			closeWizard(frame.id, { saved: true });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
			setSubmitting(false);
		}
	}, [spec, value, normalized, assetUid, queryClient, frame.id]);

	const handleDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
		if (!isTop) return;
		if (!(e.metaKey || e.ctrlKey)) return;
		if (e.key === "Enter" || e.key === "ArrowRight") {
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
						<PenLine className="size-4 text-primary" />
						<span>
							{FIELD_LABELS[spec.field]} · {assetName}
						</span>
					</DialogTitle>
					<DialogDescription className="sr-only">
						Edit the {spec.field} of this asset.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 pt-1">
					<p className="text-sm text-muted-foreground">{FIELD_HINTS[spec.field]}</p>

					{spec.input === "text" && (
						<Input
							ref={inputRef}
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
									e.preventDefault();
									e.stopPropagation();
									if (canSubmit) submit();
								}
							}}
							placeholder={spec.field === "name" ? "Asset name" : "e.g. postgres://db/schema.table"}
							className="h-11"
						/>
					)}

					{spec.input === "textarea" && (
						<Textarea
							ref={textareaRef}
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									e.stopPropagation();
									if (canSubmit) submit();
								}
							}}
							rows={5}
							placeholder="Describe this asset…"
						/>
					)}

					{spec.input === "select" && (
						<StatusPicker
							value={value}
							options={spec.options}
							onCommit={(v) => {
								setValue(v);
								// A click-through commit: pick + save in one go.
								setTimeout(() => {
									if (!submitting) {
										setValue(v);
										void submit();
									}
								}, 60);
							}}
							onFocus={(v) => setValue(v)}
							firstOptionRef={firstOptionRef}
						/>
					)}
				</div>

				<div className="text-[11px] text-muted-foreground/70 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
					{spec.input === "textarea" ? (
						<>
							<Kbd>⌘↵</Kbd> save
						</>
					) : spec.input === "select" ? (
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

function StatusPicker({
	value,
	options,
	onCommit,
	onFocus,
	firstOptionRef,
}: {
	value: string;
	options: readonly { value: string; label: string }[];
	onCommit: (v: string) => void;
	onFocus: (v: string) => void;
	firstOptionRef: React.RefObject<HTMLButtonElement | null>;
}) {
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const initialIndex = Math.max(
		0,
		options.findIndex((o) => o.value === value),
	);
	const [cursor, setCursor] = useState(initialIndex);

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
				if (idx + 1 < options.length) nextIdx = idx + 1;
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
						role="radio"
						aria-checked={active}
						tabIndex={idx === initialIndex ? 0 : -1}
						onClick={() => onCommit(opt.value)}
						onFocus={() => {
							setCursor(idx);
							onFocus(opt.value);
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
							<div className="font-medium capitalize">{opt.label}</div>
						</div>
					</button>
				);
			})}
		</div>
	);
}
