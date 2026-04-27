import { History } from "lucide-react";
import { openEntityEventsWizard } from "@/lib/wizard-store";
import type { Extension } from "../types";

/**
 * Events — surface the audit trail for the focused entity through ⌘K.
 *
 * Backend already exposes `/api/v1/events?entity_uid=...`; this extension
 * is the UI counterpart. Single command, opens a read-only wizard that
 * lists every action recorded against the entity.
 */
export const eventsExtension: Extension = {
	id: "events",
	name: "History",
	description: "Audit trail for the focused entity.",
	when: (ctx) => ctx.focused !== null,
	commands: (ctx) => {
		const focused = ctx.focused;
		if (!focused) return [];
		return [
			{
				id: "show-history",
				label: "Show history",
				hint: "Audit trail for this entity",
				keywords: ["history", "events", "audit", "log", "changes"],
				group: "View",
				icon: History,
				order: 10,
				run: () =>
					void openEntityEventsWizard({
						entityKind: focused.kind,
						entityUid: focused.entity.uid,
						entityName: focused.entity.name,
					}),
			},
		];
	},
};
