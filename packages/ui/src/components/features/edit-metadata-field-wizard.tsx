"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Tag, Trash2 } from "lucide-react";
import { type KeyboardEvent, useCallback, useMemo, useRef, useState } from "react";
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
	closeWizard,
	type MetadataEditFieldParams,
	type MetadataEditFieldResult,
	openConfirmWizard,
} from "@/lib/wizard-store";

/**
 * One-screen wizard for adding / editing / removing a custom metadata
 * key-value on an asset or actor. When `prefillKey` is set the key is
 * locked and we jump straight to editing the value (with a "remove" shortcut).
 */

interface Frame {
	id: string;
	kind: "metadata-edit-field";
	params: MetadataEditFieldParams;
	resolve: (result: MetadataEditFieldResult | null) => void;
}

export function EditMetadataFieldWizard({
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

function stringifyValue(v: unknown): string {
	if (v === null || v === undefined) return "";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	try {
		return JSON.stringify(v, null, 2);
	} catch {
		return String(v);
	}
}

function EditFlow({ frame, isTop }: { frame: Frame; isTop: boolean }) {
	const queryClient = useQueryClient();
	const { entityKind, entityUid, entityName, current, prefillKey } = frame.params;
	const lockedKey = typeof prefillKey === "string" && prefillKey.length > 0;

	const [open, setOpen] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [key, setKey] = useState<string>(prefillKey ?? "");
	const [value, setValue] = useState<string>(
		lockedKey && prefillKey ? stringifyValue(current[prefillKey]) : "",
	);

	const keyRef = useRef<HTMLInputElement | null>(null);
	const valueRef = useRef<HTMLTextAreaElement | null>(null);

	// Conditional autofocus — if the key is pre-filled, jump to the value
	// textarea; otherwise start on the key input. Same shared hook every
	// other multi-input wizard uses.
	useConditionalAutoFocus(
		() => (lockedKey ? valueRef.current : keyRef.current),
		[lockedKey],
	);

	const existingKeys = useMemo(() => Object.keys(current), [current]);
	const trimmedKey = key.trim();
	const keyExists = existingKeys.includes(trimmedKey);
	const isExistingEdit = lockedKey || keyExists;

	const canSubmit = !submitting && trimmedKey.length > 0 && value.trim().length > 0;
	const canDelete = !submitting && isExistingEdit && trimmedKey.length > 0;

	const cancel = () => {
		setOpen(false);
		closeWizard(frame.id, null);
	};

	const persist = useCallback(
		async (nextMetadata: Record<string, unknown>, successLabel: string) => {
			const url =
				entityKind === "asset"
					? `/api/holocron/assets/${entityUid}`
					: `/api/holocron/actors/${entityUid}`;
			const method = entityKind === "asset" ? "PATCH" : "PUT";
			const res = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ metadata: nextMetadata }),
			});
			if (!res.ok) {
				const body = await res.text();
				throw new Error(body || `Update failed (${res.status})`);
			}
			const invalidate =
				entityKind === "asset"
					? queryKeys.assets.detail(entityUid)
					: queryKeys.actors.detail(entityUid);
			queryClient.invalidateQueries({ queryKey: invalidate });
			toast.success(successLabel);
		},
		[entityKind, entityUid, queryClient],
	);

	const save = useCallback(async () => {
		if (!canSubmit) return;
		setSubmitting(true);
		try {
			const raw = value.trim();
			// Best-effort JSON parse: lets users store numbers / booleans / objects
			// verbatim. Fall back to plain string on any parse failure.
			let parsed: unknown = raw;
			if (
				(raw.startsWith("{") && raw.endsWith("}")) ||
				(raw.startsWith("[") && raw.endsWith("]")) ||
				raw === "true" ||
				raw === "false" ||
				raw === "null" ||
				/^-?\d+(\.\d+)?$/.test(raw)
			) {
				try {
					parsed = JSON.parse(raw);
				} catch {
					parsed = raw;
				}
			}
			const next = { ...current, [trimmedKey]: parsed };
			await persist(next, isExistingEdit ? `Saved “${trimmedKey}”` : `Added “${trimmedKey}”`);
			setOpen(false);
			closeWizard(frame.id, { saved: true });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
			setSubmitting(false);
		}
	}, [canSubmit, value, current, trimmedKey, persist, isExistingEdit, frame.id]);

	const remove = useCallback(async () => {
		if (!canDelete) return;
		const ok = await openConfirmWizard({
			title: "Remove metadata key",
			entityLabel: trimmedKey,
			description: `This removes the “${trimmedKey}” key from ${entityName}. This cannot be undone.`,
			confirmLabel: "Remove",
		});
		if (!ok) return;
		setSubmitting(true);
		try {
			const next = { ...current };
			delete next[trimmedKey];
			await persist(next, `Removed “${trimmedKey}”`);
			setOpen(false);
			closeWizard(frame.id, { saved: true });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Something went wrong");
			setSubmitting(false);
		}
	}, [canDelete, current, trimmedKey, persist, entityName, frame.id]);

	const handleDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
		if (!isTop) return;
		if (!(e.metaKey || e.ctrlKey)) return;
		if (e.key === "Enter" || e.key === "ArrowRight") {
			e.preventDefault();
			void save();
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
						<Tag className="size-4 text-primary" />
						<span>
							{isExistingEdit ? "Edit metadata" : "Add metadata"} · {entityName}
						</span>
					</DialogTitle>
					<DialogDescription className="sr-only">
						Manage a custom metadata key-value on this {entityKind}.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 pt-1">
					<div>
						<label
							htmlFor="md-key"
							className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Key
						</label>
						<Input
							id="md-key"
							ref={keyRef}
							value={key}
							onChange={(e) => setKey(e.target.value)}
							disabled={lockedKey}
							list="md-key-options"
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
									e.preventDefault();
									valueRef.current?.focus();
								}
							}}
							placeholder="e.g. owner_team"
							className={cn("h-11 mt-1", lockedKey && "opacity-70")}
						/>
						{!lockedKey && existingKeys.length > 0 && (
							<datalist id="md-key-options">
								{existingKeys.map((k) => (
									<option key={k} value={k} />
								))}
							</datalist>
						)}
						{keyExists && !lockedKey && (
							<p className="text-[11px] text-muted-foreground mt-1">
								Existing key — current value:{" "}
								<code className="bg-muted px-1 rounded">{stringifyValue(current[trimmedKey])}</code>
							</p>
						)}
					</div>

					<div>
						<label
							htmlFor="md-value"
							className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Value
						</label>
						<Textarea
							id="md-value"
							ref={valueRef}
							value={value}
							onChange={(e) => setValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									e.stopPropagation();
									void save();
								}
							}}
							rows={4}
							placeholder="plain text · number · true / false · or JSON"
							className="mt-1"
						/>
						<p className="text-[11px] text-muted-foreground mt-1">
							Numbers, booleans, and valid JSON are parsed; anything else is stored as a string.
						</p>
					</div>
				</div>

				<div className="text-[11px] text-muted-foreground/70 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
					<Kbd>⌘↵</Kbd> save
				</div>

				<DialogFooter className="sm:justify-between gap-2 pt-2">
					<div className="flex gap-2">
						<Button type="button" variant="ghost" onClick={cancel}>
							Cancel
						</Button>
						{isExistingEdit && (
							<Button
								type="button"
								variant="ghost"
								className="text-destructive hover:text-destructive"
								onClick={remove}
								disabled={!canDelete}
							>
								<Trash2 className="size-4" />
								Remove
							</Button>
						)}
					</div>
					<Button type="button" onClick={save} disabled={!canSubmit}>
						<Check className="size-4" />
						{submitting ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
