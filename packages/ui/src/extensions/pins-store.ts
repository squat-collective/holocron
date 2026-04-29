"use client";

import { useSyncExternalStore } from "react";
import type { FocusedEntity, PersistedFocusedEntity } from "./types";

/** Alias kept for callers that imported the old name. */
export type PinnedEntity = PersistedFocusedEntity;

/**
 * Pinned-entity store — localStorage-backed bookmarks.
 *
 * Pins are the *sticky* counterpart to recents:
 *  - **Recents** are session-only and capped (intentionally short, intentionally fresh).
 *  - **Pins** persist across reloads and are user-curated (no cap, no auto-eviction).
 *
 * The on-disk format is a JSON array of `FocusedEntity`. We hydrate lazily
 * on first read so SSR doesn't crash on `localStorage` access. Corrupt
 * data is treated as empty rather than crashing the palette — the worst
 * case is the user re-pins.
 */

const STORAGE_KEY = "holocron.pins.v1";

let pins: PinnedEntity[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate(): void {
	if (hydrated) return;
	hydrated = true;
	if (typeof window === "undefined") return;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			// Light shape check — anything unrecognised is dropped silently.
			pins = parsed.filter(isPinnedEntity);
		}
	} catch {
		// Corrupt JSON or storage error — fall back to empty.
	}
}

function persist(): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
	} catch {
		// Quota exceeded or storage disabled — fail silently. The in-memory
		// list still works for this session.
	}
}

function emit(): void {
	for (const l of listeners) l();
}

function isPinnedEntity(value: unknown): value is PinnedEntity {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	if (v.kind !== "asset" && v.kind !== "actor" && v.kind !== "rule") return false;
	if (typeof v.entity !== "object" || v.entity === null) return false;
	const e = v.entity as Record<string, unknown>;
	return typeof e.uid === "string" && typeof e.name === "string";
}

export function getPins(): readonly PinnedEntity[] {
	hydrate();
	return pins;
}

export function isPinned(uid: string): boolean {
	hydrate();
	return pins.some((p) => p.entity.uid === uid);
}

export function addPin(entity: FocusedEntity): void {
	hydrate();
	// Relations are transient and never pinned — see the PinnedEntity
	// type comment.
	if (entity.kind === "relation") return;
	if (pins.some((p) => p.entity.uid === entity.entity.uid)) return;
	pins = [entity, ...pins];
	persist();
	emit();
}

export function removePin(uid: string): void {
	hydrate();
	const next = pins.filter((p) => p.entity.uid !== uid);
	if (next.length === pins.length) return;
	pins = next;
	persist();
	emit();
}

export function clearPins(): void {
	hydrate();
	if (pins.length === 0) return;
	pins = [];
	persist();
	emit();
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}

const EMPTY: readonly PinnedEntity[] = [];

export function usePins(): readonly PinnedEntity[] {
	return useSyncExternalStore(subscribe, getPins, () => EMPTY);
}
