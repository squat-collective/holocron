import { Bug, FileJson, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { clearWizardStack } from "@/lib/wizard-store";
import { clearPins } from "../pins-store";
import { clearRecents } from "../recents-store";
import { getExtensions } from "../registry";
import type { Extension } from "../types";

/**
 * Developer-only extension. Gated by `NODE_ENV` so production builds
 * don't ship these commands — exposing the raw registry or the wizard
 * reset to end users would be more confusing than helpful.
 *
 * Each command is a small, self-contained escape hatch:
 *
 *  - **Dump registry**: copies the loaded extension list to clipboard as
 *    JSON (extension id + command count). Quick way to confirm a new
 *    extension is wired up before opening a debugger.
 *  - **Reload plugin manifests**: invalidates the TanStack Query for the
 *    plugins endpoint, forcing a fresh fetch. Useful while iterating on
 *    a Python plugin's manifest.
 *  - **Reset wizard stack**: pops every active wizard frame. Last-resort
 *    unstick when a wizard refuses to close.
 *  - **Clear recents / Clear pins**: zeroes the corresponding stores —
 *    one for the session, one for localStorage.
 */
export const devToolsExtension: Extension = {
	id: "dev-tools",
	name: "Developer",
	description: "Diagnostics and recovery commands (development only).",
	when: () => process.env.NODE_ENV !== "production",
	commands: (ctx) => [
		{
			id: "dump-registry",
			label: "Dev: dump extension registry",
			hint: "Copy loaded extensions + command counts to clipboard",
			keywords: ["dev", "debug", "registry", "extensions", "dump"],
			group: "Developer",
			icon: FileJson,
			order: 10,
			run: async () => {
				const summary = getExtensions().map((ext) => {
					let cmdCount = 0;
					try {
						cmdCount = ext.commands(ctx).length;
					} catch {
						cmdCount = -1; // signal: factory threw
					}
					return {
						id: ext.id,
						name: ext.name,
						description: ext.description ?? null,
						commandCount: cmdCount,
						active: !ext.when || ext.when(ctx),
					};
				});
				try {
					await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
					toast.success(`Registry copied (${summary.length} extensions)`);
				} catch {
					toast.error("Clipboard unavailable");
				}
			},
		},
		{
			id: "reload-plugins",
			label: "Dev: reload plugin manifests",
			hint: "Refetch /api/holocron/plugins",
			keywords: ["dev", "debug", "plugins", "refetch", "reload"],
			group: "Developer",
			icon: RefreshCw,
			order: 20,
			run: () => {
				ctx.queryClient?.invalidateQueries({ queryKey: ["plugins", "list"] });
				toast.success("Plugin manifests invalidated");
			},
		},
		{
			id: "reset-wizards",
			label: "Dev: reset wizard stack",
			hint: "Force-close every open wizard",
			keywords: ["dev", "debug", "wizard", "reset", "unstick"],
			group: "Developer",
			icon: X,
			order: 30,
			run: () => {
				clearWizardStack();
				toast.success("Wizard stack cleared");
			},
		},
		{
			id: "clear-recents",
			label: "Dev: clear recents",
			hint: "Empty the recently-viewed list",
			keywords: ["dev", "debug", "recents", "clear"],
			group: "Developer",
			icon: Trash2,
			order: 40,
			run: () => {
				clearRecents();
				toast.success("Recents cleared");
			},
		},
		{
			id: "clear-pins",
			label: "Dev: clear pins",
			hint: "Empty pinned bookmarks (persisted)",
			keywords: ["dev", "debug", "pins", "clear", "reset"],
			group: "Developer",
			icon: Bug,
			order: 50,
			run: () => {
				clearPins();
				toast.success("Pins cleared");
			},
		},
	],
};
