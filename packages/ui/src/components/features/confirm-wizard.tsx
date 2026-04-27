"use client";

import { AlertTriangle, Check, X } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import {
	Kbd,
	useWizardAutoFocus,
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
import { cn } from "@/lib/utils";
import { type ConfirmParams, type ConfirmResult, closeWizard } from "@/lib/wizard-store";

/**
 * Generic confirmation dialog used in place of `window.confirm`. Looks like
 * every other wizard, supports the same keyboard pattern (⌘↵ confirm, Esc
 * cancel) and stays consistent with our styling.
 */

interface Frame {
	id: string;
	kind: "confirm";
	params: ConfirmParams;
	resolve: (result: ConfirmResult | null) => void;
}

export function ConfirmWizard({
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
	const {
		title,
		description,
		entityLabel,
		confirmLabel = "Delete",
		tone = "destructive",
	} = frame.params;
	const [open, setOpen] = useState(true);
	const confirmRef = useRef<HTMLButtonElement | null>(null);

	// Autofocus the confirm button when the dialog opens via a keyboard-
	// driven flow (focusOnOpen=true → isNested=true upstream). Enter then
	// commits. Uses the shared hook so this stays in lockstep with every
	// other wizard's focus model.
	useWizardAutoFocus(confirmRef);

	const cancel = () => {
		setOpen(false);
		closeWizard(frame.id, { confirmed: false });
	};

	const confirm = () => {
		setOpen(false);
		closeWizard(frame.id, { confirmed: true });
	};

	const handleDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
		if (!isTop) return;
		if (e.metaKey || e.ctrlKey) {
			if (e.key === "Enter") {
				e.preventDefault();
				confirm();
			}
		}
	};

	const isDestructive = tone === "destructive";

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) cancel();
			}}
		>
			<DialogContent
				className="sm:max-w-md bg-card/90 backdrop-blur-xl border-primary/20"
				onKeyDown={handleDialogKey}
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base font-medium">
						<AlertTriangle
							className={cn("size-4", isDestructive ? "text-destructive" : "text-primary")}
						/>
						<span>{title}</span>
					</DialogTitle>
					<DialogDescription className="sr-only">Confirm or cancel this action.</DialogDescription>
				</DialogHeader>

				<div className="space-y-2 pt-1">
					{entityLabel && <p className="text-sm font-medium truncate">“{entityLabel}”</p>}
					<p className="text-sm text-muted-foreground whitespace-pre-wrap">{description}</p>
				</div>

				<div className="text-[11px] text-muted-foreground/70 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
					<Kbd>↵</Kbd> {confirmLabel.toLowerCase()} · <Kbd>Esc</Kbd> cancel
				</div>

				<DialogFooter className="sm:justify-between gap-2 pt-2">
					<Button type="button" variant="ghost" onClick={cancel}>
						<X className="size-4" />
						Cancel
					</Button>
					<Button
						ref={confirmRef}
						type="button"
						variant={isDestructive ? "destructive" : "default"}
						onClick={confirm}
					>
						<Check className="size-4" />
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
