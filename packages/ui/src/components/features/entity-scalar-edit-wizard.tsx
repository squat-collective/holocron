"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, PenLine } from "lucide-react";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
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
import {
	closeWizard,
	type EntityScalarEditParams,
	type EntityScalarEditResult,
} from "@/lib/wizard-store";

/**
 * One small wizard for editing a single text/textarea field on an actor or
 * rule. Replaces the `window.prompt` flow on those detail pages.
 *
 * The asset edit wizard stays separate because it has richer specs (status
 * select etc.); this one trades flexibility for simplicity.
 */

interface Frame {
	id: string;
	kind: "entity-scalar-edit";
	params: EntityScalarEditParams;
	resolve: (result: EntityScalarEditResult | null) => void;
}

export function EntityScalarEditWizard({
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
	const queryClient = useQueryClient();
	const {
		entityKind,
		entityUid,
		entityName,
		field,
		fieldLabel,
		currentValue,
		input,
		required = false,
		placeholder,
	} = frame.params;
	const [open, setOpen] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [value, setValue] = useState<string>(currentValue ?? "");

	const inputRef = useRef<HTMLInputElement | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	// Pick the right input type to focus on mount — same shared
	// behaviour as every other wizard. Shadow-typed `useRef`s let the
	// thunk return either kind without a cast.
	useConditionalAutoFocus(
		() => (input === "textarea" ? textareaRef.current : inputRef.current),
		[input],
	);

	const trimmed = value.trim();
	const canSubmit = !submitting && (required ? trimmed.length > 0 : true);

	const cancel = () => {
		setOpen(false);
		closeWizard(frame.id, null);
	};

	const submit = useCallback(async () => {
		if (!canSubmit) return;
		setSubmitting(true);
		try {
			const body = {
				[field]: trimmed.length === 0 ? null : trimmed,
			};
			const url = `/api/holocron/${entityKind}s/${entityUid}`;
			const res = await fetch(url, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `Update failed (${res.status})`);
			}
			// Invalidate the matching detail cache. Rules use a manual key today.
			if (entityKind === "actor") {
				queryClient.invalidateQueries({
					queryKey: queryKeys.actors.detail(entityUid),
				});
			} else {
				queryClient.invalidateQueries({
					queryKey: ["rules", "detail", entityUid],
				});
				queryClient.invalidateQueries({ queryKey: ["rules", "all"] });
			}
			toast.success(`Saved ${fieldLabel.toLowerCase()}`);
			setOpen(false);
			closeWizard(frame.id, { saved: true });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
			setSubmitting(false);
		}
	}, [canSubmit, field, trimmed, entityKind, entityUid, fieldLabel, queryClient, frame.id]);

	const handleDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
		if (!isTop) return;
		if (!(e.metaKey || e.ctrlKey)) return;
		if (e.key === "Enter" || e.key === "ArrowRight") {
			e.preventDefault();
			void submit();
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
							{fieldLabel} · {entityName}
						</span>
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground">
						Editing {fieldLabel.toLowerCase()} on this {entityKind}.
						{!required && " Empty saves as cleared."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 pt-1">
					{input === "textarea" ? (
						<Textarea
							ref={textareaRef}
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									e.stopPropagation();
									void submit();
								}
							}}
							rows={4}
							placeholder={placeholder ?? "…"}
						/>
					) : (
						<Input
							ref={inputRef}
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
									e.preventDefault();
									e.stopPropagation();
									void submit();
								}
							}}
							placeholder={placeholder ?? "…"}
							className="h-11"
						/>
					)}
				</div>

				<div className="text-[11px] text-muted-foreground/70 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
					{/* `⌘↵` works on every wizard, every input type — keep this
					    consistent across the dialog. Single-line inputs *also*
					    accept plain `↵` as a convenience, mentioned only when
					    relevant so the strip doesn't shout at textarea users. */}
					<Kbd>⌘↵</Kbd> save
					{input === "text" && (
						<span className="text-muted-foreground/50">· or just ↵</span>
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
