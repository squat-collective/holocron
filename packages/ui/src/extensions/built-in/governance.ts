import { CircleHelp, Crown, ShieldAlert } from "lucide-react";
import { openGovernanceListWizard } from "@/lib/wizard-store";
import type { Extension } from "../types";

/**
 * Governance saved-searches.
 *
 * Three commands, always available, that surface the catalog's hygiene
 * gaps. Each opens a list wizard backed by a fixed filter against the
 * `/api/holocron/assets` endpoint:
 *
 *  - **Find unverified** — assets that landed via discovery and need a
 *    human signoff (`verified=false`).
 *  - **Find unowned** — assets with no `(actor)-[:owns]->(asset)` edge.
 *  - **Find undocumented** — assets with no description.
 *
 * Global by design: governance is something you do regardless of which
 * page you're on, so there's no `when` predicate.
 */
export const governanceExtension: Extension = {
	id: "governance",
	name: "Governance",
	description: "Saved searches for catalog hygiene.",
	commands: () => [
		{
			id: "find-unverified",
			label: "Find unverified assets",
			hint: "Assets pushed by plugins that nobody confirmed yet",
			keywords: [
				"unverified",
				"verify",
				"audit",
				"discovery",
				"hygiene",
				"governance",
			],
			group: "Governance",
			icon: ShieldAlert,
			order: 10,
			run: () => void openGovernanceListWizard({ audit: "unverified" }),
		},
		{
			id: "find-unowned",
			label: "Find unowned assets",
			hint: "Assets with no owner attached",
			keywords: ["unowned", "orphan", "owner", "audit", "hygiene", "governance"],
			group: "Governance",
			icon: Crown,
			order: 20,
			run: () => void openGovernanceListWizard({ audit: "unowned" }),
		},
		{
			id: "find-undocumented",
			label: "Find undocumented assets",
			hint: "Assets with an empty description",
			keywords: [
				"undocumented",
				"documentation",
				"description",
				"audit",
				"hygiene",
				"governance",
			],
			group: "Governance",
			icon: CircleHelp,
			order: 30,
			run: () => void openGovernanceListWizard({ audit: "undocumented" }),
		},
	],
};
