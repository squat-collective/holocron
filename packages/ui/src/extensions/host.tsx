"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import { registerCommand } from "@/lib/commands-store";
import { actionsExtension } from "./built-in/actions";
import { actorExtension } from "./built-in/actor";
import { assetExtension } from "./built-in/asset";
import { assetNavExtension } from "./built-in/asset-nav";
import { createExtension } from "./built-in/create";
import { devToolsExtension } from "./built-in/dev-tools";
import { eventsExtension } from "./built-in/events";
import { governanceExtension } from "./built-in/governance";
import { navigationExtension } from "./built-in/navigation";
import { pinsExtension } from "./built-in/pins";
import { recentsExtension } from "./built-in/recents";
import { ruleExtension } from "./built-in/rule";
import { shareExtension } from "./built-in/share";
import { useFocusedEntity } from "./focused-entity";
import { usePins } from "./pins-store";
import { useRecents } from "./recents-store";
import {
	computeCommands,
	registerExtension,
	useExtensionsVersion,
} from "./registry";
import type { Extension, ExtensionContext } from "./types";

/**
 * Install built-in extensions at client module-load time. The host is the
 * canonical client boundary for the extension system — anchoring the
 * install here guarantees the registry is populated before any consumer
 * renders, regardless of how Next.js bundles the rest of the framework.
 *
 * Doing this in `extensions/index.ts` looked cleaner but didn't work: the
 * layout (server) was the only importer of that file, so the auto-install
 * ran server-side only and the client-side registry stayed empty.
 *
 * Idempotent: `registerExtension` replaces by id, so HMR and Strict-Mode
 * double-mounts don't accumulate duplicates.
 */
const BUILT_IN_EXTENSIONS: readonly Extension[] = [
	navigationExtension,
	createExtension,
	actionsExtension,
	shareExtension,
	eventsExtension,
	governanceExtension,
	pinsExtension,
	recentsExtension,
	assetExtension,
	assetNavExtension,
	actorExtension,
	ruleExtension,
	devToolsExtension,
];
for (const ext of BUILT_IN_EXTENSIONS) registerExtension(ext);

/**
 * Mounted once at the root layout. Watches the route and the focused entity
 * and re-publishes the active command set to `commands-store` whenever
 * either changes. The CommandPalette doesn't know extensions exist — it
 * keeps reading the flat command registry it always has.
 *
 * Render-time work is intentionally minimal: a `useMemo` rebuilds the list
 * when context changes; an `useEffect` registers the new list and tears
 * down the previous one. The pathname is the only stable global signal —
 * focused entities are managed via `useSetFocusedEntity` from detail pages.
 */
export function ExtensionHost(): null {
	const pathname = usePathname();
	const focused = useFocusedEntity();
	const queryClient = useQueryClient();
	const recents = useRecents();
	const pins = usePins();
	const extensionsVersion = useExtensionsVersion();

	const ctx = useMemo<ExtensionContext>(
		() => ({
			pathname: pathname ?? "/",
			focused,
			queryClient,
			recents,
			pins,
		}),
		[pathname, focused, queryClient, recents, pins],
	);

	// `extensionsVersion` is in deps so a late-registered extension (e.g.
	// the plugins adapter, which calls `registerExtension` after a fetch
	// resolves) forces a recompute. Without it the host would keep showing
	// the snapshot it captured at first render.
	const commands = useMemo(
		() => computeCommands(ctx),
		[ctx, extensionsVersion],
	);

	useEffect(() => {
		const disposers = commands.map((c) => registerCommand(c));
		return () => {
			for (const d of disposers) d();
		};
	}, [commands]);

	return null;
}
