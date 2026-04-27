"use client";

import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

/**
 * Global keyboard help — registers `?` (Shift+/) to open, Escape to close.
 * Lists every shortcut the app honors so users can discover them without
 * poking around. Add a new row here when you add a new shortcut.
 */
interface Shortcut {
	keys: string[];
	label: string;
	scope?: string;
}

const GLOBAL: Shortcut[] = [
	{ keys: ["⌘", "K"], label: "Open the command palette" },
	{ keys: ["?"], label: "Show this keyboard help" },
	{ keys: ["Esc"], label: "Close the current dialog / return to search" },
];

const DETAIL: Shortcut[] = [
	{ keys: ["g"], label: "Show the lineage graph tab" },
	{ keys: ["d"], label: "Show the details tab" },
];

const SEARCH: Shortcut[] = [
	{ keys: ["↑", "↓"], label: "Move through results" },
	{ keys: ["Enter"], label: "Open the highlighted result" },
	{ keys: ["Enter"], label: "(empty query) Jump to a random asset" },
	{ keys: ["Esc"], label: "Clear the search" },
];

const WIZARDS: Shortcut[] = [
	{ keys: ["⌘", "→"], label: "Next step", scope: "In a wizard" },
	{ keys: ["⌘", "←"], label: "Previous step", scope: "In a wizard" },
	{ keys: ["⌘", "Enter"], label: "Submit / continue", scope: "In a wizard" },
	{ keys: ["↑", "↓"], label: "Pick an option", scope: "In a list step" },
	{ keys: ["Enter"], label: "Commit a pick", scope: "In a list step" },
	{ keys: ["⌫"], label: "Remove last pick", scope: "Multi-pick steps" },
];

export function KeyboardHelp() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			// Only trigger if the user really types `?` (Shift+/) outside an
			// editable element. Avoids firing when typing in the search bar.
			if (e.key !== "?") return;
			const target = e.target as HTMLElement | null;
			if (
				target?.isContentEditable ||
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.tagName === "SELECT"
			) {
				return;
			}
			e.preventDefault();
			setOpen(true);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="sm:max-w-lg bg-card/90 border-primary/20">
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
					<DialogDescription>
						Everything in the app is reachable from the keyboard. ⌘K is the
						main control surface.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-5 pt-1">
					<Group title="Global" items={GLOBAL} />
					<Group title="Search" items={SEARCH} />
					<Group title="Detail pages" items={DETAIL} />
					<Group title="Wizards" items={WIZARDS} />
				</div>
			</DialogContent>
		</Dialog>
	);
}

function Group({ title, items }: { title: string; items: Shortcut[] }) {
	return (
		<div>
			<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
				{title}
			</h3>
			<ul className="space-y-1.5">
				{items.map((s, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: stable list
						key={i}
						className="flex items-center justify-between gap-4 text-sm"
					>
						<div className="flex items-center gap-1.5">
							{s.keys.map((k, j) => (
								<kbd
									// biome-ignore lint/suspicious/noArrayIndexKey: stable list
									key={j}
									className="inline-flex items-center justify-center min-w-[1.5rem] rounded border border-primary/20 bg-muted/40 px-1.5 py-0.5 text-[11px] font-mono text-foreground/90"
								>
									{k}
								</kbd>
							))}
						</div>
						<div className="text-muted-foreground text-right">
							{s.scope && (
								<span className="text-[10px] uppercase tracking-wide mr-2 opacity-70">
									{s.scope}
								</span>
							)}
							{s.label}
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
