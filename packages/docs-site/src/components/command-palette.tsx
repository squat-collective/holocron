"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import Fuse from "fuse.js";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { SearchEntry } from "@/lib/search-index";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
	const [entries, setEntries] = useState<SearchEntry[] | null>(null);
	const [query, setQuery] = useState("");
	const router = useRouter();

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				onOpenChange(!open);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onOpenChange]);

	useEffect(() => {
		if (!open || entries) return;
		// Fetched lazily so the first paint stays cheap.
		fetch("/search-index.json")
			.then((r) => r.json())
			.then((data: SearchEntry[]) => setEntries(data))
			.catch(() => setEntries([]));
	}, [open, entries]);

	const fuse = useMemo(() => {
		if (!entries) return null;
		return new Fuse(entries, {
			keys: [
				{ name: "title", weight: 0.6 },
				{ name: "excerpt", weight: 0.25 },
				{ name: "body", weight: 0.15 },
			],
			threshold: 0.4,
			ignoreLocation: true,
			minMatchCharLength: 2,
		});
	}, [entries]);

	const results = useMemo(() => {
		if (!entries) return [];
		const q = query.trim();
		if (!q) return entries.slice(0, 12);
		return fuse?.search(q, { limit: 20 }).map((r) => r.item) ?? [];
	}, [entries, fuse, query]);

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
				<Dialog.Content className="fixed left-1/2 top-[20vh] z-50 w-full max-w-xl -translate-x-1/2 px-4 focus:outline-none">
					<Dialog.Title className="sr-only">Search documentation</Dialog.Title>
					<Command
						label="Search documentation"
						className="overflow-hidden rounded-lg border border-border bg-background/95 shadow-2xl backdrop-blur"
					>
						<div className="flex items-center gap-2 border-b border-border/60 px-3">
							<Search className="h-4 w-4 text-muted-foreground" />
							<Command.Input
								autoFocus
								value={query}
								onValueChange={setQuery}
								placeholder="Search docs…"
								className="h-12 w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
							/>
							<kbd className="rounded border border-border bg-card/40 px-1.5 py-0.5 text-[0.65rem] font-mono text-muted-foreground">
								Esc
							</kbd>
						</div>
						<Command.List className="max-h-[60vh] overflow-y-auto p-2">
							<Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
								{entries === null ? "Loading…" : "No matches."}
							</Command.Empty>
							{results.map((entry) => (
								<Command.Item
									key={entry.href}
									value={`${entry.title} ${entry.excerpt}`}
									onSelect={() => {
										onOpenChange(false);
										router.push(entry.href);
									}}
									className="flex cursor-pointer flex-col gap-1 rounded-md px-3 py-2 aria-selected:bg-accent aria-selected:text-foreground"
								>
									<span className="text-sm font-medium">{entry.title}</span>
									{entry.excerpt && (
										<span className="line-clamp-2 text-xs text-muted-foreground">
											{entry.excerpt}
										</span>
									)}
								</Command.Item>
							))}
						</Command.List>
					</Command>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
