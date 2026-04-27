import { History } from "lucide-react";
import {
	actorTypeIcons,
	assetTypeIcons,
	RuleIcon,
	type LucideIcon,
} from "@/lib/icons";
import type { Extension, ExtensionCommand, FocusedEntity } from "../types";

/**
 * Recently viewed — projects the recents store into ⌘K commands so the
 * palette doubles as a back-button history.
 *
 * The list is fed by `useSetFocusedEntity` (in `focused-entity.ts`), so
 * any detail page that publishes its focus contributes to this without
 * extra wiring. Skips the entity that's *currently* focused — clicking
 * "go to the page I'm already on" would be useless and noisy.
 *
 * Empty until the user has visited at least one detail page this session
 * — recents intentionally don't persist across reloads (see the comment
 * in `recents-store.ts`).
 */
export const recentsExtension: Extension = {
	id: "recents",
	name: "Recently viewed",
	description: "Jump back to entities you've recently opened.",
	when: (ctx) => ctx.recents.length > 0,
	commands: (ctx): ExtensionCommand[] => {
		const focusedUid = ctx.focused?.entity.uid;
		const list = ctx.recents.filter((r) => r.entity.uid !== focusedUid);
		return list.map((recent, i) => ({
			id: `open-${recent.kind}-${recent.entity.uid}`,
			label: recent.entity.name,
			hint: kindHint(recent),
			keywords: [recent.kind, "recent", "history", "back"],
			group: "Recent",
			icon: iconFor(recent),
			// Lower order = earlier in list. Use the recents index so newest
			// stays on top.
			order: i,
			run: () => {
				const url = hrefFor(recent);
				if (url) window.location.assign(url);
			},
		}));
	},
};

/** Detail-page URL for a focused entity. Mirrors the routing in
 *  `app/{kind}s/[uid]/page.tsx`. */
function hrefFor(focused: FocusedEntity): string | null {
	return `/${focused.kind}s/${focused.entity.uid}`;
}

/** A short subtitle that disambiguates entries with the same name and
 *  reminds the user what kind they were looking at. */
function kindHint(focused: FocusedEntity): string {
	if (focused.kind === "asset") return `${focused.entity.type} · asset`;
	if (focused.kind === "actor") return `${focused.entity.type} · actor`;
	return `${focused.entity.severity} · rule`;
}

function iconFor(focused: FocusedEntity): LucideIcon {
	if (focused.kind === "asset") {
		return assetTypeIcons[focused.entity.type] ?? History;
	}
	if (focused.kind === "actor") {
		return actorTypeIcons[focused.entity.type] ?? History;
	}
	return RuleIcon;
}
