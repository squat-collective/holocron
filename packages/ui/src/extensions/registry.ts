"use client";

import { useSyncExternalStore } from "react";
import type { Command } from "@/lib/commands-store";
import type { Extension, ExtensionContext } from "./types";

/**
 * Module-level extension registry. Built-in extensions are pushed at app
 * start (see `extensions/host.tsx`). Anything that wants to contribute
 * commands later — say, a runtime-loaded backend plugin — just calls
 * `registerExtension(...)` and the host picks it up on the next render.
 *
 * The registry is observable: every mutation bumps a version counter and
 * notifies listeners. The host subscribes via `useExtensionsVersion()` so
 * a late-arriving extension (e.g. the plugins adapter, which registers
 * after a fetch resolves) re-triggers command computation. Without this,
 * the host's memoised command list would silently miss the new entries.
 */

const extensions: Extension[] = [];
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
	version += 1;
	for (const l of listeners) l();
}

export function registerExtension(ext: Extension): () => void {
	const idx = extensions.findIndex((e) => e.id === ext.id);
	if (idx >= 0) extensions[idx] = ext;
	else extensions.push(ext);
	emit();
	return () => {
		const i = extensions.findIndex((e) => e.id === ext.id);
		if (i >= 0) {
			extensions.splice(i, 1);
			emit();
		}
	};
}

export function getExtensions(): readonly Extension[] {
	return extensions;
}

export function clearExtensions(): void {
	if (extensions.length === 0) return;
	extensions.length = 0;
	emit();
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}

function getVersion(): number {
	return version;
}

/**
 * Subscribe to registry mutations. Returns a monotonically-increasing
 * counter — components that depend on the active extension list should
 * include this in their memo deps so re-registers/unregisters trigger a
 * recompute.
 */
export function useExtensionsVersion(): number {
	return useSyncExternalStore(subscribe, getVersion, () => 0);
}

/**
 * Compute the active commands for a given context. Pure: input → output.
 *
 * - Skips extensions whose `when()` returns false (or that throw).
 * - Prefixes each command id with `${ext.id}.` so two extensions can use the
 *   same local id without clashing.
 * - Drops extensions whose factories throw, with a console warning — a
 *   single buggy extension shouldn't black out the palette.
 */
export function computeCommands(ctx: ExtensionContext): Command[] {
	const out: Command[] = [];
	for (const ext of extensions) {
		try {
			if (ext.when && !ext.when(ctx)) continue;
			const cmds = ext.commands(ctx);
			for (const c of cmds) {
				out.push({ ...c, id: `${ext.id}.${c.id}` });
			}
		} catch (err) {
			console.warn(`[extensions] ${ext.id} threw — skipping`, err);
		}
	}
	return out;
}
