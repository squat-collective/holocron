import { Bookmark, BookmarkMinus, BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import {
	actorTypeIcons,
	assetTypeIcons,
	type LucideIcon,
	RuleIcon,
} from "@/lib/icons";
import { addPin, isPinned, removePin } from "../pins-store";
import type { Extension, ExtensionCommand, FocusedEntity } from "../types";

/**
 * Pins — the sticky counterpart to recents.
 *
 * Two surfaces, one extension:
 *  - When an entity is focused: a single toggle command ("Pin entity"
 *    or "Unpin entity" depending on current state).
 *  - Always: one "Open pinned: X" command per saved bookmark.
 *
 * Persistence lives in `pins-store.ts` (localStorage). Recents come and
 * go; pins stay until the user removes them.
 */
export const pinsExtension: Extension = {
	id: "pins",
	name: "Pins",
	description: "Bookmark entities you want to keep close.",
	commands: (ctx): ExtensionCommand[] => {
		const cmds: ExtensionCommand[] = [];

		// Toggle command for the focused entity.
		const focused = ctx.focused;
		if (focused) {
			const pinned = isPinned(focused.entity.uid);
			if (pinned) {
				cmds.push({
					id: "unpin",
					label: `Unpin ${focused.entity.name}`,
					hint: "Remove from your bookmarks",
					keywords: ["unpin", "bookmark", "remove", "save"],
					group: "Pin",
					icon: BookmarkMinus,
					order: 5,
					run: () => {
						removePin(focused.entity.uid);
						toast.success("Unpinned");
					},
				});
			} else {
				cmds.push({
					id: "pin",
					label: `Pin ${focused.entity.name}`,
					hint: "Save to your bookmarks",
					keywords: ["pin", "bookmark", "save", "favorite"],
					group: "Pin",
					icon: BookmarkPlus,
					order: 5,
					run: () => {
						addPin(focused);
						toast.success("Pinned");
					},
				});
			}
		}

		// One "open" command per pinned entity. Skip the currently-focused
		// one — opening the page you're already on is noise.
		for (const [i, pin] of ctx.pins.entries()) {
			if (pin.entity.uid === focused?.entity.uid) continue;
			cmds.push({
				id: `open-${pin.kind}-${pin.entity.uid}`,
				label: pin.entity.name,
				hint: kindHint(pin),
				keywords: [pin.kind, "pinned", "bookmark"],
				group: "Pinned",
				icon: iconFor(pin),
				order: i,
				run: () => {
					window.location.assign(`/${pin.kind}s/${pin.entity.uid}`);
				},
			});
		}

		return cmds;
	},
};

function kindHint(focused: FocusedEntity): string {
	if (focused.kind === "asset") return `${focused.entity.type} · asset`;
	if (focused.kind === "actor") return `${focused.entity.type} · actor`;
	return `${focused.entity.severity} · rule`;
}

function iconFor(focused: FocusedEntity): LucideIcon {
	if (focused.kind === "asset") return assetTypeIcons[focused.entity.type] ?? Bookmark;
	if (focused.kind === "actor") return actorTypeIcons[focused.entity.type] ?? Bookmark;
	return RuleIcon;
}
