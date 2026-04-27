import { Crown, Link2 } from "lucide-react";
import { toast } from "sonner";
import type { Extension } from "../types";

/**
 * Asset navigation — quick jumps along common lineage edges.
 *
 * Each command fetches the relevant relations on demand (rather than
 * front-loading them when the asset detail page mounts) so the extension
 * stays cheap when the user never opens the palette. The handlers are
 * deliberately simple: 0 matches toasts, 1 navigates, N navigates to the
 * first and tells you how many matches there were.
 *
 * Owner = `(actor) -[:owns]-> (asset)` — the *from* side is the actor.
 * Upstream feeders = `(other_asset) -[:feeds]-> (this asset)` — *from* side.
 * Downstream consumers = `(this asset) -[:feeds]-> (other_asset)` — *to* side.
 */
export const assetNavExtension: Extension = {
	id: "asset-nav",
	name: "Asset navigation",
	description: "Jump to owners and lineage neighbours of the focused asset.",
	when: (ctx) => ctx.focused?.kind === "asset",
	commands: (ctx) => {
		if (ctx.focused?.kind !== "asset") return [];
		const asset = ctx.focused.entity;

		return [
			{
				id: "jump-to-owner",
				label: "Jump to owner",
				hint: "Open the actor or team that owns this asset",
				keywords: ["owner", "owns", "go", "jump", "open"],
				group: "Navigate",
				icon: Crown,
				order: 30,
				run: () =>
					void jumpToRelated({
						filter: { to_uid: asset.uid, type: "owns" },
						pickSide: "from",
						targetKind: "actor",
						emptyLabel: `${asset.name} has no owner`,
					}),
			},
			{
				id: "jump-upstream",
				label: "Jump upstream",
				hint: "Asset that feeds this one",
				keywords: ["upstream", "feeds", "source", "input", "go", "jump"],
				group: "Navigate",
				icon: Link2,
				order: 40,
				run: () =>
					void jumpToRelated({
						filter: { to_uid: asset.uid, type: "feeds" },
						pickSide: "from",
						targetKind: "asset",
						emptyLabel: `${asset.name} has no upstream feeders`,
					}),
			},
			{
				id: "jump-downstream",
				label: "Jump downstream",
				hint: "Asset this one feeds into",
				keywords: ["downstream", "feeds", "consumer", "output", "go", "jump"],
				group: "Navigate",
				icon: Link2,
				order: 50,
				run: () =>
					void jumpToRelated({
						filter: { from_uid: asset.uid, type: "feeds" },
						pickSide: "to",
						targetKind: "asset",
						emptyLabel: `${asset.name} feeds nothing downstream`,
					}),
			},
		];
	},
};

/**
 * Fetch a filtered relation list, then navigate to the entity on the
 * specified side of the first match. Toasts on the empty case so the user
 * isn't left wondering why nothing happened. With multiple matches we
 * still pick the first — picker UX is a future improvement.
 */
async function jumpToRelated(opts: {
	filter: { from_uid?: string; to_uid?: string; type?: string };
	pickSide: "from" | "to";
	targetKind: "asset" | "actor";
	emptyLabel: string;
}): Promise<void> {
	const params = new URLSearchParams();
	if (opts.filter.from_uid) params.set("from_uid", opts.filter.from_uid);
	if (opts.filter.to_uid) params.set("to_uid", opts.filter.to_uid);
	if (opts.filter.type) params.set("type", opts.filter.type);

	try {
		const res = await fetch(`/api/holocron/relations?${params.toString()}`);
		if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
		const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
		const items = data.items ?? [];
		if (items.length === 0) {
			toast.info(opts.emptyLabel);
			return;
		}
		const first = items[0]!;
		const targetUid = first[opts.pickSide === "from" ? "from_uid" : "to_uid"];
		if (typeof targetUid !== "string") {
			toast.error("Bad relation payload");
			return;
		}
		if (items.length > 1) {
			toast.info(`${items.length} matches — opened the first`);
		}
		window.location.assign(`/${opts.targetKind}s/${targetUid}`);
	} catch (err) {
		toast.error(err instanceof Error ? err.message : "Lookup failed");
	}
}
