import { actorTypeIcons, AssetIcon, RuleIcon } from "@/lib/icons";
import {
	openCreateActorWizard,
	openCreateAssetWizard,
	openCreateRuleWizard,
} from "@/lib/wizard-store";
import type { Extension } from "../types";

/**
 * Create — global "new entity" entries. Always available, regardless of
 * what page or focus the user is on.
 */
export const createExtension: Extension = {
	id: "create",
	name: "Create",
	description: "Create new top-level entities.",
	commands: () => [
		{
			id: "asset",
			label: "Create an asset",
			hint: "Dataset, report, process, or system",
			keywords: ["dataset", "report", "process", "system", "new"],
			group: "Create",
			icon: AssetIcon,
			order: 10,
			run: () => openCreateAssetWizard(),
		},
		{
			id: "person",
			label: "Create a person",
			hint: "An individual actor",
			keywords: ["actor", "human", "individual", "new"],
			group: "Create",
			icon: actorTypeIcons.person,
			order: 20,
			run: () => openCreateActorWizard({ prefillType: "person" }),
		},
		{
			id: "team",
			label: "Create a team",
			hint: "A group of people",
			keywords: ["group", "actor", "people", "new"],
			group: "Create",
			icon: actorTypeIcons.group,
			order: 30,
			run: () => openCreateActorWizard({ prefillType: "group" }),
		},
		{
			id: "rule",
			label: "Create a rule",
			hint: "A data-quality rule definition",
			keywords: ["data", "quality", "check", "new"],
			group: "Create",
			icon: RuleIcon,
			order: 40,
			run: () => openCreateRuleWizard(),
		},
	],
};
