"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import type { LucideIcon } from "@/lib/icons";

/**
 * Global command registry — pages register the actions they want to expose
 * through the ⌘K palette. Each command is an id + a run() handler, so the
 * palette has zero knowledge of the underlying wizards or mutations.
 *
 * Use `useRegisterCommands` in a page/route component to expose commands
 * while that page is mounted; when the component unmounts the commands
 * disappear from the palette.
 */

export interface Command {
	/** Stable id — lets the same command re-register without duplicates. */
	id: string;
	label: string;
	/** Free-form sub-label shown under the name. */
	hint?: string;
	/** Extra keywords for fuzzy search. */
	keywords?: string[];
	/** cmdk group heading. Defaults to "Actions". */
	group?: string;
	icon?: LucideIcon;
	/** Ordering hint — lower sorts first. Default 100. */
	order?: number;
	run: () => void;
}

let commands: Command[] = [];
const listeners = new Set<() => void>();

function emit() {
	for (const l of listeners) l();
}

export function registerCommand(cmd: Command): () => void {
	commands = [...commands.filter((c) => c.id !== cmd.id), cmd];
	emit();
	return () => {
		commands = commands.filter((c) => c.id !== cmd.id);
		emit();
	};
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}
function getSnapshot() {
	return commands;
}

export function useCommands(): Command[] {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Register a set of commands for the lifetime of the calling component.
 * Pass a factory so the list can reference fresh closures each render — the
 * `deps` array decides when the registrations get re-run.
 */
export function useRegisterCommands(
	factory: () => Command[],
	deps: ReadonlyArray<unknown>,
): void {
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		const list = factory();
		const unregister = list.map((c) => registerCommand(c));
		return () => {
			for (const u of unregister) u();
		};
	}, deps);
}
