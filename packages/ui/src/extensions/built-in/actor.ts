import {
	Info,
	Mail,
	Network,
	PenLine,
	Plus,
	Tag,
	Trash2,
	UserCog,
	UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import {
	openConfirmWizard,
	openCreateRelationWizard,
	openEditMetadataFieldWizard,
	openEntityScalarEditWizard,
} from "@/lib/wizard-store";
import type { Extension, ExtensionContext } from "../types";

/**
 * Actor extension — every command that operates on a focused actor (person
 * or group). Group-only commands are gated by the actor's type so the
 * palette stays scoped to relevant actions.
 */
export const actorExtension: Extension = {
	id: "actor",
	name: "Actor",
	description: "Edit, link, and delete the focused actor.",
	when: (ctx) => ctx.focused?.kind === "actor",
	commands: (ctx: ExtensionContext) => {
		if (ctx.focused?.kind !== "actor") return [];
		const actor = ctx.focused.entity;
		const queryClient = ctx.queryClient;
		const actorRef = {
			uid: actor.uid,
			name: actor.name,
			kind: "actor" as const,
			type: actor.type,
		};

		const patch = async (
			body: Record<string, unknown>,
			successLabel: string,
		) => {
			try {
				const res = await fetch(`/api/holocron/actors/${actor.uid}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				});
				if (!res.ok) throw new Error(`Failed (${res.status})`);
				queryClient?.invalidateQueries({
					queryKey: queryKeys.actors.detail(actor.uid),
				});
				toast.success(successLabel);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Something went wrong");
			}
		};

		const cmds = [
			{
				id: "rename",
				label: "Rename",
				hint: `Current: ${actor.name}`,
				keywords: ["name"],
				group: "Edit",
				icon: PenLine,
				order: 10,
				run: () =>
					void openEntityScalarEditWizard({
						entityKind: "actor",
						entityUid: actor.uid,
						entityName: actor.name,
						field: "name",
						fieldLabel: "Name",
						currentValue: actor.name,
						input: "text",
						required: true,
						placeholder: "Actor name",
					}),
			},
			{
				id: "edit-email",
				label: "Edit email",
				keywords: ["contact", "mail"],
				group: "Edit",
				icon: Mail,
				order: 20,
				run: () =>
					void openEntityScalarEditWizard({
						entityKind: "actor",
						entityUid: actor.uid,
						entityName: actor.name,
						field: "email",
						fieldLabel: "Email",
						currentValue: actor.email,
						input: "text",
						placeholder: "person@example.com",
					}),
			},
			{
				id: "edit-description",
				label: "Edit description",
				keywords: ["notes", "bio"],
				group: "Edit",
				icon: Info,
				order: 30,
				run: () =>
					void openEntityScalarEditWizard({
						entityKind: "actor",
						entityUid: actor.uid,
						entityName: actor.name,
						field: "description",
						fieldLabel: "Description",
						currentValue: actor.description,
						input: "textarea",
						placeholder: "Short bio for humans",
					}),
			},
			{
				id: "change-type",
				label: "Change type",
				hint: `Current: ${actor.type}`,
				keywords: ["person", "group", "team"],
				group: "Edit",
				icon: UserCog,
				order: 40,
				run: () => {
					const next = actor.type === "person" ? "group" : "person";
					void patch({ type: next }, `Changed to ${next}`);
				},
			},

			/* --- Connections --- */
			{
				id: "add-owned-asset",
				label: "Add asset this owns",
				hint: "Link to an asset as owner",
				keywords: ["owns", "own"],
				group: "Connections",
				icon: Network,
				order: 10,
				run: () =>
					openCreateRelationWizard({
						title: `${actor.name} owns…`,
						prefillType: "owns",
						prefillSource: actorRef,
					}),
			},
			{
				id: "add-used-asset",
				label: "Add asset this uses",
				keywords: ["uses", "consumer"],
				group: "Connections",
				icon: Network,
				order: 20,
				run: () =>
					openCreateRelationWizard({
						title: `${actor.name} uses…`,
						prefillType: "uses",
						prefillSource: actorRef,
					}),
			},
			{
				id: "add-team-membership",
				label: "Add team membership",
				hint: "This actor is a member of…",
				keywords: ["member", "team", "group"],
				group: "Connections",
				icon: Network,
				order: 30,
				run: () =>
					openCreateRelationWizard({
						title: `${actor.name} is a member of…`,
						prefillType: "member_of",
						prefillSource: actorRef,
					}),
			},

			/* --- Metadata --- */
			{
				id: "add-metadata",
				label: "Add metadata",
				hint: "Custom key-value on this actor",
				keywords: ["metadata", "tag", "custom", "field", "key"],
				group: "Metadata",
				icon: Plus,
				order: 10,
				run: () =>
					openEditMetadataFieldWizard({
						entityKind: "actor",
						entityUid: actor.uid,
						entityName: actor.name,
						current: actor.metadata,
					}),
			},
		];

		for (const mk of Object.keys(actor.metadata)) {
			cmds.push({
				id: `edit-metadata-${mk}`,
				label: `Edit metadata: ${mk}`,
				hint: "Update or remove this key",
				keywords: ["metadata", "edit", mk],
				group: "Metadata",
				icon: Tag,
				order: 20,
				run: () =>
					openEditMetadataFieldWizard({
						entityKind: "actor",
						entityUid: actor.uid,
						entityName: actor.name,
						current: actor.metadata,
						prefillKey: mk,
					}),
			});
		}

		// Groups can have members; persons can't. Guard on type.
		if (actor.type === "group") {
			cmds.push({
				id: "add-member",
				label: "Add member",
				hint: "Someone who belongs to this group",
				keywords: ["member", "person", "team"],
				group: "Connections",
				icon: UserPlus,
				order: 15,
				run: () =>
					openCreateRelationWizard({
						title: `Add a member to ${actor.name}`,
						prefillType: "member_of",
						prefillTarget: actorRef,
					}),
			});
		}

		// `mark-verified` lives in the cross-cutting `actions` extension.

		cmds.push({
			id: "delete",
			label: `Delete ${actor.type}`,
			hint: "Remove this actor and every relation attached to it",
			keywords: ["delete", "remove"],
			group: "Danger",
			icon: Trash2,
			order: 99,
			run: async () => {
				const ok = await openConfirmWizard({
					title: `Delete ${actor.type}`,
					entityLabel: actor.name,
					description:
						"This removes the actor and every relation attached to it. This cannot be undone.",
				});
				if (!ok) return;
				try {
					const res = await fetch(`/api/holocron/actors/${actor.uid}`, {
						method: "DELETE",
					});
					if (!res.ok && res.status !== 204) throw new Error(`Failed (${res.status})`);
					queryClient?.invalidateQueries({ queryKey: queryKeys.actors.all });
					toast.success(`Deleted ${actor.name}`);
					window.location.href = "/";
				} catch (err) {
					toast.error(err instanceof Error ? err.message : "Something went wrong");
				}
			},
		});

		return cmds;
	},
};
