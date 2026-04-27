"use client";

import { FileDown, FileUp } from "lucide-react";
import { useEffect } from "react";
import { usePluginManifests } from "@/hooks/use-plugins";
import type { PluginManifest } from "@/lib/plugins";
import { openPluginRunWizard } from "@/lib/wizard-store";
import { registerExtension } from "./registry";
import type { Extension, ExtensionCommand } from "./types";

/**
 * Plugins adapter — bridges the API plugin registry into the UI extension
 * registry.
 *
 * The built-in extensions in `extensions/built-in/` are static modules.
 * Plugins are dynamic: they're declared at the API and discovered over the
 * wire. This component:
 *
 *   1. fetches the manifest list once (TanStack Query, generous staleTime),
 *   2. builds a single `plugins` extension whose `commands(ctx)` projects
 *      the manifests into ⌘K commands,
 *   3. (re-)registers that extension whenever the manifest list changes.
 *
 * `registerExtension` is idempotent on id, so re-runs replace cleanly.
 *
 * Mounted next to `<ExtensionHost />` in the root layout. Bundles into the
 * client because of the "use client" directive — consistent with the rest
 * of the framework.
 */
export function PluginsExtensionAdapter(): null {
	const { data: manifests } = usePluginManifests();

	useEffect(() => {
		// While loading, expose no plugin commands. The first effect run after
		// data arrives replaces this with the real list.
		const ext: Extension = {
			id: "plugins",
			name: "Plugins",
			description: "API-registered importers and exporters.",
			commands: () => (manifests ?? []).map(manifestToCommand),
		};
		const dispose = registerExtension(ext);
		return dispose;
	}, [manifests]);

	return null;
}

/**
 * Convert one manifest to a palette command. Imports go in an "Import"
 * group, exports in "Export" — keeps the palette readable when many
 * plugins are installed. The icon is the manifest's emoji rendered inline
 * by the palette via a tiny wrapper component, with a Lucide fallback
 * matching the capability.
 */
function manifestToCommand(manifest: PluginManifest): ExtensionCommand {
	const isExport = manifest.capability === "export";
	const fallbackIcon = isExport ? FileDown : FileUp;

	return {
		id: `run-${manifest.slug}`,
		label: manifest.name,
		hint: manifest.description.length > 80
			? `${manifest.description.slice(0, 80)}…`
			: manifest.description,
		keywords: [
			manifest.slug,
			manifest.capability,
			isExport ? "download" : "upload",
			isExport ? "export" : "import",
			"plugin",
		],
		group: isExport ? "Export" : "Import",
		icon: makeEmojiIcon(manifest.icon, fallbackIcon),
		order: 50,
		run: () => void openPluginRunWizard({ manifest }),
	};
}

/**
 * Wrap the manifest's emoji as a tiny inline component that satisfies the
 * `LucideIcon`-shaped contract used by the palette. If the emoji is empty
 * or whitespace, fall back to the supplied Lucide icon so the row never
 * looks blank.
 */
function makeEmojiIcon(emoji: string | undefined, Fallback: typeof FileUp) {
	const trimmed = emoji?.trim();
	if (!trimmed) return Fallback;
	const Component = (props: { className?: string }) => (
		<span
			className={props.className ?? "text-base leading-none"}
			aria-hidden="true"
		>
			{trimmed}
		</span>
	);
	Component.displayName = `EmojiIcon(${trimmed})`;
	return Component as unknown as typeof FileUp;
}
