"use client";

import { useSyncExternalStore } from "react";
import type { FocusedEntity, PersistedFocusedEntity } from "./types";

/**
 * Recently-viewed entity store — module-level pub/sub, no persistence.
 *
 * Why not localStorage: the recents are a *session* notion. Most users
 * sign in once a day; persisting across reloads would feel stale (you'd
 * see what someone else was looking at on a shared machine, or yesterday's
 * exploration before today's task starts). If we ever want stickiness,
 * pins (a separate feature) is the right home for it.
 *
 * Why not in `focused-entity.ts`: focused publishes a single value (the
 * thing on screen *now*); recents is a list. Different shapes, different
 * subscribers. Keeping them split avoids weird coupling.
 *
 * `pushRecent` is idempotent on uid — if the entity is already in the
 * list, it's moved to the front rather than duplicated. Capped at
 * `MAX_RECENTS` so the palette stays scannable.
 */

const MAX_RECENTS = 10;

let recents: PersistedFocusedEntity[] = [];
const listeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

export function pushRecent(entity: FocusedEntity): void {
	// Relations are transient (hover-publish) and never enter recents.
	// Filtering at the boundary keeps the in-memory list narrow and
	// matches PersistedFocusedEntity's contract.
	if (entity.kind === "relation") return;
	const uid = entity.entity.uid;
	const filtered = recents.filter((r) => r.entity.uid !== uid);
	const next = [entity, ...filtered].slice(0, MAX_RECENTS);
	// Identity check — avoid emitting when nothing changed (e.g. duplicate
	// publishes of the same entity from React Strict Mode double-mounts).
	if (next.length === recents.length && next.every((r, i) => r === recents[i])) {
		return;
	}
	recents = next;
	emit();
}

export function getRecents(): readonly PersistedFocusedEntity[] {
	return recents;
}

export function clearRecents(): void {
	if (recents.length === 0) return;
	recents = [];
	emit();
}

function subscribe(cb: () => void): () => void {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}

const EMPTY: readonly PersistedFocusedEntity[] = [];

export function useRecents(): readonly PersistedFocusedEntity[] {
	return useSyncExternalStore(subscribe, getRecents, () => EMPTY);
}
