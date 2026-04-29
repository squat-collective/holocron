import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { openConfirmWizard } from "@/lib/wizard-store";
import { getRelationStyle } from "@/lib/entity-styles";
import type { Extension, ExtensionContext } from "../types";

/**
 * Relation extension — palette commands for the relation in focus.
 *
 * Unlike Asset/Actor/Rule there is no relation detail page; the
 * focus is published transiently from the relations sidebar
 * (`relations-section.tsx`) on row hover so a user can press ⌘K and
 * act on the relation they're looking at.
 *
 * Commands track the actor/asset extension shape: a "Danger" delete
 * matching the inline trash icon's flow, plus two "Navigation"
 * shortcuts to jump to the connected entities. "Edit relation type /
 * metadata" is intentionally deferred — relations are immutable on
 * the API side today (no PUT /relations/{uid}) so an Edit command
 * would just delete-and-recreate behind the scenes, and that's a
 * different UX call worth making explicitly.
 */
export const relationExtension: Extension = {
	id: "relation",
	name: "Relation",
	description: "Delete and navigate the focused relation.",
	when: (ctx) => ctx.focused?.kind === "relation",
	commands: (ctx: ExtensionContext) => {
		if (ctx.focused?.kind !== "relation") return [];
		const rel = ctx.focused.entity;
		const queryClient = ctx.queryClient;
		const style = getRelationStyle(rel.type);
		const verb = style.label.toLowerCase();

		const otherDetailHref = (() => {
			switch (rel.other_kind) {
				case "asset":
					return `/assets/${rel.other_uid}`;
				case "actor":
					return `/actors/${rel.other_uid}`;
				case "rule":
					return `/rules/${rel.other_uid}`;
			}
		})();

		// `from_uid` and `to_uid` aren't always one of asset/actor/rule
		// individually — but the relations sidebar already filters to
		// rendered counterparties, so the focused row's `other_*` is
		// always resolvable. The "source" / "target" commands link to
		// the *current* page entity vs the counterparty using the
		// from/to direction relative to the focused row.
		const isOtherTarget = rel.to_uid === rel.other_uid;
		const sourceHref = isOtherTarget ? null : otherDetailHref;
		const targetHref = isOtherTarget ? otherDetailHref : null;

		const cmds = [];

		// Open source / target — at most one is "the other side" depending
		// on direction, so we surface the one that actually navigates.
		if (sourceHref) {
			cmds.push({
				id: "open-source",
				label: `Open source: ${rel.other_name}`,
				hint: `Jump to the ${rel.other_kind}`,
				keywords: ["open", "source", "from", "navigate"],
				group: "Navigation",
				icon: ArrowLeft,
				order: 10,
				run: () => {
					window.location.href = sourceHref;
				},
			});
		}
		if (targetHref) {
			cmds.push({
				id: "open-target",
				label: `Open target: ${rel.other_name}`,
				hint: `Jump to the ${rel.other_kind}`,
				keywords: ["open", "target", "to", "navigate"],
				group: "Navigation",
				icon: ArrowRight,
				order: 20,
				run: () => {
					window.location.href = targetHref;
				},
			});
		}

		cmds.push({
			id: "delete",
			label: "Delete relation",
			hint: `Remove the “${verb}” link to ${rel.other_name}`,
			keywords: ["delete", "remove", "unlink", verb],
			group: "Danger",
			icon: Trash2,
			order: 99,
			run: async () => {
				const ok = await openConfirmWizard({
					title: "Delete relation",
					entityLabel: `${verb} → ${rel.other_name}`,
					description:
						"This removes only this link between the two entities. Neither side is deleted. This cannot be undone.",
				});
				if (!ok) return;
				try {
					const res = await fetch(`/api/holocron/relations/${rel.uid}`, {
						method: "DELETE",
					});
					if (!res.ok && res.status !== 204) {
						throw new Error(`Failed (${res.status})`);
					}
					queryClient?.invalidateQueries({ queryKey: queryKeys.relations.all });
					toast.success(`Removed link to “${rel.other_name}”`);
				} catch (err) {
					toast.error(err instanceof Error ? err.message : "Something went wrong");
				}
			},
		});

		return cmds;
	},
};
