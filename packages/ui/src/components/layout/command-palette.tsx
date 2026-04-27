"use client";

import { useEffect, useMemo, useState } from "react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { type Command, useCommands } from "@/lib/commands-store";

/**
 * Global command palette (⌘K).
 *
 * The palette is a dumb consumer — it reads the flat `commands-store`
 * registry and renders it. All commands are contributed by *extensions*
 * (see `src/extensions/`); the host re-publishes the active set whenever
 * the route or focused entity changes.
 *
 * Ranking: a custom `filter` prop scores label hits highest, then keyword
 * hits at half weight. cmdk's default filter weights value + keywords
 * equally and produces too-noisy rankings (typing "schema" matches every
 * command that lists "schema" as a keyword as strongly as the dedicated
 * "Open schema editor" entry).
 */
export function CommandPalette() {
	const [open, setOpen] = useState(false);
	const registered = useCommands();

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((o) => !o);
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	const runCommand = (cmd: Command) => {
		setOpen(false);
		// Defer to the next tick so the palette unmounts cleanly before any
		// nested dialog opens.
		setTimeout(() => cmd.run(), 10);
	};

	// Group + sort: lower `order` first, alphabetical fallback.
	const groups = useMemo(() => {
		const byGroup = new Map<string, Command[]>();
		for (const cmd of registered) {
			const g = cmd.group ?? "Actions";
			const list = byGroup.get(g) ?? [];
			list.push(cmd);
			byGroup.set(g, list);
		}
		for (const list of byGroup.values()) {
			list.sort((a, b) => {
				const ao = a.order ?? 100;
				const bo = b.order ?? 100;
				if (ao !== bo) return ao - bo;
				return a.label.localeCompare(b.label);
			});
		}
		return [...byGroup.entries()];
	}, [registered]);

	return (
		<CommandDialog
			open={open}
			onOpenChange={setOpen}
			title="Command palette"
			description="Run an action"
			filter={paletteFilter}
		>
			<CommandInput placeholder="Type a command…" />
			<CommandList>
				<CommandEmpty>No commands found.</CommandEmpty>

				{groups.map(([group, cmds], i) => (
					<div key={group}>
						{i > 0 && <CommandSeparator />}
						<CommandGroup heading={group}>
							{cmds.map((cmd) => {
								const Icon = cmd.icon;
								return (
									<CommandItem
										key={cmd.id}
										value={cmd.label}
										keywords={[
											...(cmd.hint ? [cmd.hint] : []),
											...(cmd.keywords ?? []),
										]}
										onSelect={() => runCommand(cmd)}
									>
										{Icon ? <Icon /> : null}
										<div className="flex flex-col">
											<span>{cmd.label}</span>
											{cmd.hint && (
												<span className="text-xs text-muted-foreground">
													{cmd.hint}
												</span>
											)}
										</div>
									</CommandItem>
								);
							})}
						</CommandGroup>
					</div>
				))}
			</CommandList>
		</CommandDialog>
	);
}

/* ================================================================== */
/* Custom filter                                                       */
/* ================================================================== */

/**
 * Score a single text against a search string. Returns 0 (no match) up to
 * 1 (exact). Tuned for short labels — exact > prefix > word-prefix >
 * substring > initialism.
 */
function score(text: string, search: string): number {
	if (!search) return 1;
	const t = text.toLowerCase();
	const s = search.toLowerCase();
	if (t === s) return 1;
	if (t.startsWith(s)) return 0.95;
	// Word-prefix: any word inside `text` starts with `s` ("schema editor"
	// matched by "edit").
	const words = t.split(/\s+/);
	if (words.some((w) => w.startsWith(s))) return 0.8;
	if (t.includes(s)) return 0.55;
	// Initialism: typing "ose" finds "Open schema editor".
	const initials = words.map((w) => w[0] ?? "").join("");
	if (initials.startsWith(s)) return 0.4;
	return 0;
}

/**
 * cmdk filter: rank label hits well above keyword hits, and keyword hits
 * above hint hits (hint is just the first entry of `keywords` here — the
 * palette puts the hint first so we can give it a tiny extra weight).
 *
 * Returns 0..1 — cmdk hides items at 0.
 */
function paletteFilter(
	value: string,
	search: string,
	keywords?: string[],
): number {
	if (!search.trim()) return 1;
	const terms = search.split(/\s+/).filter(Boolean);
	let total = 0;
	for (const term of terms) {
		const labelScore = score(value, term);
		const kwScore = keywords?.length
			? Math.max(...keywords.map((k) => score(k, term)))
			: 0;
		// Label dominates. Keywords contribute up to ~40% of a label hit. If
		// neither matches a term, the whole command drops out.
		const termScore = Math.max(labelScore, kwScore * 0.4);
		if (termScore === 0) return 0;
		total += termScore;
	}
	return total / terms.length;
}
