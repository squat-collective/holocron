import { Info, PenLine, ShieldCheck, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { severityStyles } from "@/lib/entity-styles";
import { RuleIcon } from "@/lib/icons";
import {
	openAttachRuleToAssetWizard,
	openConfirmWizard,
	openEntityScalarEditWizard,
} from "@/lib/wizard-store";
import type { Extension, ExtensionCommand, ExtensionContext } from "../types";

/**
 * Rule extension — edit, attach, and delete the focused rule.
 */
export const ruleExtension: Extension = {
	id: "rule",
	name: "Rule",
	description: "Edit, attach, and delete the focused rule.",
	when: (ctx) => ctx.focused?.kind === "rule",
	commands: (ctx: ExtensionContext) => {
		if (ctx.focused?.kind !== "rule") return [];
		const rule = ctx.focused.entity;
		const queryClient = ctx.queryClient;

		const put = async (
			body: Record<string, unknown>,
			successLabel: string,
		) => {
			try {
				const res = await fetch(`/api/holocron/rules/${rule.uid}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				});
				if (!res.ok) throw new Error(`Failed (${res.status})`);
				queryClient?.invalidateQueries({
					queryKey: ["rules", "detail", rule.uid],
				});
				queryClient?.invalidateQueries({ queryKey: ["rules", "all"] });
				toast.success(successLabel);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Something went wrong");
			}
		};

		const cmds: ExtensionCommand[] = [
			{
				id: "rename",
				label: "Rename rule",
				hint: `Current: ${rule.name}`,
				keywords: ["name"],
				group: "Edit",
				icon: PenLine,
				order: 10,
				run: () =>
					void openEntityScalarEditWizard({
						entityKind: "rule",
						entityUid: rule.uid,
						entityName: rule.name,
						field: "name",
						fieldLabel: "Name",
						currentValue: rule.name,
						input: "text",
						required: true,
						placeholder: "Rule name",
					}),
			},
			{
				id: "edit-description",
				label: "Edit description",
				keywords: ["desc", "intent"],
				group: "Edit",
				icon: Info,
				order: 20,
				run: () =>
					void openEntityScalarEditWizard({
						entityKind: "rule",
						entityUid: rule.uid,
						entityName: rule.name,
						field: "description",
						fieldLabel: "Description",
						currentValue: rule.description,
						input: "textarea",
						placeholder: "What does this rule check / require?",
					}),
			},
			{
				id: "edit-category",
				label: "Edit category",
				hint: rule.category ? `Current: ${rule.category}` : undefined,
				keywords: ["category", "tag"],
				group: "Edit",
				icon: Tag,
				order: 30,
				run: () =>
					void openEntityScalarEditWizard({
						entityKind: "rule",
						entityUid: rule.uid,
						entityName: rule.name,
						field: "category",
						fieldLabel: "Category",
						currentValue: rule.category,
						input: "text",
						placeholder: "Free-text tag",
					}),
			},
			...(Object.keys(severityStyles) as Array<keyof typeof severityStyles>)
				.filter((s) => s !== rule.severity)
				.map((s) => ({
					id: `set-severity-${s}`,
					label: `Set severity: ${s}`,
					hint: `Current: ${rule.severity}`,
					keywords: ["severity", s],
					group: "Edit",
					icon: RuleIcon,
					order: 40,
					run: () => void put({ severity: s }, `Severity → ${s}`),
				})),
		];

		// `mark-verified` lives in the cross-cutting `actions` extension.

		cmds.push({
			id: "apply-to-asset",
			label: "Apply to an asset",
			hint: "Attach this rule to an asset",
			keywords: ["apply", "attach", "asset"],
			group: "Applications",
			icon: ShieldCheck,
			order: 10,
			run: () =>
				void openAttachRuleToAssetWizard({
					ruleUid: rule.uid,
					ruleName: rule.name,
					severity: rule.severity,
				}),
		});

		cmds.push({
			id: "delete",
			label: "Delete rule",
			hint: "Remove this rule and detach it from every asset",
			keywords: ["delete", "remove"],
			group: "Danger",
			icon: Trash2,
			order: 99,
			run: async () => {
				const ok = await openConfirmWizard({
					title: "Delete rule",
					entityLabel: rule.name,
					description:
						"This removes the rule and detaches it from every asset. This cannot be undone.",
				});
				if (!ok) return;
				try {
					const res = await fetch(`/api/holocron/rules/${rule.uid}`, {
						method: "DELETE",
					});
					if (!res.ok && res.status !== 204) throw new Error(`Failed (${res.status})`);
					queryClient?.invalidateQueries({ queryKey: ["rules", "all"] });
					toast.success(`Deleted ${rule.name}`);
					window.location.href = "/";
				} catch (err) {
					toast.error(err instanceof Error ? err.message : "Something went wrong");
				}
			},
		});

		return cmds;
	},
};
