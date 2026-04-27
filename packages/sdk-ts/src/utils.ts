import type { EntityRef } from "./client";

/**
 * Resolves an EntityRef to a UID string.
 * Accepts either a string UID or an object with a `uid` property.
 *
 * @param ref - The entity reference (string or object with uid)
 * @returns The UID string
 * @internal
 */
export function resolveUid(ref: EntityRef): string {
	return typeof ref === "string" ? ref : ref.uid;
}
