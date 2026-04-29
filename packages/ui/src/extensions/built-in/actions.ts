import { CheckCircle2, MapIcon } from "lucide-react";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import type { Extension, FocusedEntity } from "../types";

/**
 * Actions — cross-cutting verbs that apply to any focused entity.
 *
 * Lives separately from `share` because these mutate state or navigate,
 * while `share` is read-only / clipboard. Lives separately from each
 * per-kind extension (`asset`, `actor`, `rule`) so the same logic isn't
 * duplicated three ways: one switch arm here picks the right endpoint
 * per kind.
 */
export const actionsExtension: Extension = {
	id: "actions",
	name: "Actions",
	description: "Cross-cutting verbs for the focused entity.",
	// Relations are transient (hover-published from the relations
	// sidebar) and don't have a verify flow — keep the actions
	// extension scoped to persistent kinds.
	when: (ctx) =>
		ctx.focused !== null && ctx.focused.kind !== "relation",
	commands: (ctx) => {
		const focused = ctx.focused;
		if (!focused || focused.kind === "relation") return [];
		const { entity } = focused;
		const queryClient = ctx.queryClient;

		const cmds = [
			{
				id: "open-in-graph",
				label: "Open in galaxy map",
				hint: `Show ${entity.name} on the map`,
				keywords: ["map", "graph", "galaxy", "view", "see", "g m"],
				group: "Navigate",
				icon: MapIcon,
				order: 5,
				run: () => {
					const params = new URLSearchParams({
						mode: "map",
						q: entity.name,
					});
					window.location.assign(`/?${params.toString()}`);
				},
			},
		];

		// Mark verified — only when the entity is currently unverified. The
		// per-kind endpoints differ slightly (PUT vs PATCH historically), but
		// every Update model accepts a partial body, so a uniform PUT works.
		if (entity.verified === false) {
			cmds.push({
				id: "mark-verified",
				label: "Mark verified",
				hint: `Confirm this ${focused.kind} is human-reviewed`,
				keywords: ["verify", "confirm", "approve", "review"],
				group: "Edit",
				icon: CheckCircle2,
				order: 5,
				run: async () => {
					try {
						const res = await fetch(
							`/api/holocron/${focused.kind}s/${entity.uid}`,
							{
								method: "PUT",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ verified: true }),
							},
						);
						if (!res.ok) throw new Error(`Failed (${res.status})`);
						invalidateDetail(queryClient, focused);
						toast.success("Marked verified");
					} catch (err) {
						toast.error(
							err instanceof Error ? err.message : "Something went wrong",
						);
					}
				},
			});
		}

		return cmds;
	},
};

function invalidateDetail(
	queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => unknown } | null,
	focused: FocusedEntity,
): void {
	if (!queryClient) return;
	if (focused.kind === "asset") {
		queryClient.invalidateQueries({
			queryKey: queryKeys.assets.detail(focused.entity.uid),
		});
	} else if (focused.kind === "actor") {
		queryClient.invalidateQueries({
			queryKey: queryKeys.actors.detail(focused.entity.uid),
		});
	} else {
		queryClient.invalidateQueries({
			queryKey: ["rules", "detail", focused.entity.uid],
		});
		queryClient.invalidateQueries({ queryKey: ["rules", "all"] });
	}
}
