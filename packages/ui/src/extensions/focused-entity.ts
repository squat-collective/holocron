"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { pushRecent } from "./recents-store";
import type { FocusedEntity } from "./types";

/**
 * Tiny pub/sub for "what entity is the user currently looking at".
 *
 * Detail pages publish themselves with `useSetFocusedEntity({ kind, entity })`
 * for the lifetime of the component. The extension host reads the focus to
 * decide which contextual commands to surface in the palette.
 *
 * Module-level state — there is exactly one focus at a time. If multiple
 * detail components mount (shouldn't happen in normal navigation), the most
 * recent setter wins, and the cleanup of the older one is ignored thanks to
 * the identity check.
 */

let current: FocusedEntity | null = null;
const listeners = new Set<() => void>();

function emit() {
	for (const l of listeners) l();
}

export function setFocusedEntity(next: FocusedEntity | null): void {
	if (current === next) return;
	current = next;
	emit();
}

export function getFocusedEntity(): FocusedEntity | null {
	return current;
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}

export function useFocusedEntity(): FocusedEntity | null {
	return useSyncExternalStore(subscribe, getFocusedEntity, () => null);
}

/**
 * Publish `entity` as the focused entity while the calling component is
 * mounted. Pass `null` to clear (e.g. while loading). The cleanup only
 * clears the focus if it's still ours — protects against the next page's
 * setter racing with our unmount.
 *
 * Side effect: a non-null entity is also pushed onto the recents store, so
 * "Recently viewed" updates without each detail page having to opt in.
 * Relations are skipped here — they're transient focus surfaces (hover
 * over a row in the relations sidebar) and don't belong in "Recently
 * viewed", which is reserved for things you actually navigated to.
 */
export function useSetFocusedEntity(entity: FocusedEntity | null): void {
	useEffect(() => {
		setFocusedEntity(entity);
		if (entity && entity.kind !== "relation") pushRecent(entity);
		const ours = entity;
		return () => {
			if (current === ours) setFocusedEntity(null);
		};
	}, [entity]);
}
