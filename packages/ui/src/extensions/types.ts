/**
 * Extension framework — types.
 *
 * An *extension* is a self-contained module that contributes commands to the
 * ⌘K palette. Each extension declares its commands as a pure function of an
 * `ExtensionContext` (the active route + the entity currently in focus, if
 * any). The framework re-runs the factory whenever the context changes and
 * keeps the live registry in sync.
 *
 * Why this shape:
 *  - Cross-cutting commands ("Copy UID", "Open in graph") that apply to every
 *    entity kind are written once instead of being copied per detail page.
 *  - Page-specific commands stay narrowly scoped via `when:` predicates.
 *  - Adding a new node type or feature is a single new file under
 *    `extensions/built-in/` plus an entry in `extensions/index.ts`.
 *  - Future remote contributors (backend plugins fetched at runtime) just
 *    need to satisfy this interface.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { Command } from "@/lib/commands-store";
import type { Rule } from "@/components/features/rules/types";

/**
 * Local entity shapes — intentionally looser than the SDK types so the UI
 * can publish entities loaded from any of the existing hooks (which each
 * carry their own local interfaces). The fields listed here are exactly
 * what the built-in extensions consume; tightening them is fine, loosening
 * them risks runtime undefined access in extension command handlers.
 */
export interface FocusedAsset {
	uid: string;
	type: "dataset" | "report" | "process" | "system";
	name: string;
	description: string | null;
	location: string | null;
	status: "active" | "deprecated" | "draft";
	verified?: boolean;
	discovered_by?: string | null;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface FocusedActor {
	uid: string;
	type: "person" | "group";
	name: string;
	email: string | null;
	description: string | null;
	verified?: boolean;
	discovered_by?: string | null;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

/** The entity in focus on the current page, if any. Detail pages publish
 *  themselves through `useSetFocusedEntity`. */
export type FocusedEntity =
	| { kind: "asset"; entity: FocusedAsset }
	| { kind: "actor"; entity: FocusedActor }
	| { kind: "rule"; entity: Rule };

export type FocusedEntityKind = FocusedEntity["kind"];

/** Snapshot of the world an extension reasons about when producing its
 *  commands. The `queryClient` is injected by the host so extensions can
 *  invalidate caches after a mutation without having to be React components
 *  themselves. */
export interface ExtensionContext {
	/** Current route pathname (e.g. "/assets/abc"). */
	pathname: string;
	/** The entity currently focused, or null if nothing is focused. */
	focused: FocusedEntity | null;
	/** TanStack QueryClient — extensions use it to invalidate caches after
	 *  mutations. May be `null` in non-app contexts (e.g. unit tests). */
	queryClient: QueryClient | null;
	/** Most-recently-visited entities, newest first. Capped (see
	 *  `recents-store.ts`). Empty when the user hasn't visited any detail
	 *  pages this session. */
	recents: readonly FocusedEntity[];
	/** User-pinned bookmarks, persisted in localStorage. Distinct from
	 *  recents: pins are sticky and curated, recents are session-only and
	 *  auto-pruned. */
	pins: readonly FocusedEntity[];
}

/**
 * A single extension. Identified by a stable `id` used as a namespace for
 * the command ids it returns (the framework prepends `${ext.id}.` to each
 * command id, so within an extension you only need to pick local names).
 */
export interface Extension {
	/** Stable slug, e.g. "asset-edit". Used as command-id namespace. */
	id: string;
	/** Human-readable name, surfaced in debug tooling. */
	name: string;
	/** Short description shown in any future settings UI. */
	description?: string;
	/** Optional gate evaluated before `commands(ctx)`. Default: always run. */
	when?: (ctx: ExtensionContext) => boolean;
	/** Build the command list for the current context. Pure function — must
	 *  not subscribe to other state; the host re-invokes whenever the
	 *  context changes. */
	commands(ctx: ExtensionContext): ExtensionCommand[];
}

/** Same shape as `Command` from the commands-store, but the `id` is local
 *  to the extension (the framework namespaces it). */
export type ExtensionCommand = Omit<Command, "id"> & { id: string };
