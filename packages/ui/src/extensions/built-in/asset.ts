import {
	Activity,
	FolderPlus,
	Info,
	Link2,
	ListTree,
	MapPin,
	PenLine,
	Plus,
	ShieldCheck,
	Tag,
	Trash2,
	UserPlus,
	Users,
} from "lucide-react";
import { toast } from "sonner";
import { getSpecKeys } from "@/lib/asset-specs";
import { queryKeys } from "@/lib/query-keys";
import {
	openAddConsumersWizard,
	openAddSchemaChildWizard,
	openApplyRuleWizard,
	openConfirmWizard,
	openCreateRelationWizard,
	openEditAssetFieldWizard,
	openEditMetadataFieldWizard,
} from "@/lib/wizard-store";
import type { Extension, ExtensionContext } from "../types";

/**
 * Asset extension — every command that operates on a focused asset. Cache
 * invalidation flows through the QueryClient that the host injects into the
 * context, so the page reflects the change without a reload.
 */
const STATUS_OPTIONS = [
	{ value: "active" as const, label: "active" },
	{ value: "draft" as const, label: "draft" },
	{ value: "deprecated" as const, label: "deprecated" },
] as const;

export const assetExtension: Extension = {
	id: "asset",
	name: "Asset",
	description: "Edit, link, and delete the focused asset.",
	when: (ctx) => ctx.focused?.kind === "asset",
	commands: (ctx: ExtensionContext) => {
		if (ctx.focused?.kind !== "asset") return [];
		const asset = ctx.focused.entity;
		const queryClient = ctx.queryClient;
		const assetRef = {
			uid: asset.uid,
			name: asset.name,
			kind: "asset" as const,
			type: asset.type,
		};

		// Custom metadata excludes schema + spec keys — those have dedicated
		// commands and shouldn't surface as free-form keys.
		const specKeysForAsset = getSpecKeys(asset.type);
		const customMetadataKeys = Object.keys(asset.metadata).filter(
			(k) => k !== "schema" && !specKeysForAsset.includes(k),
		);
		const customMetadataMap: Record<string, unknown> = {};
		for (const k of customMetadataKeys) {
			customMetadataMap[k] = asset.metadata[k];
		}

		const cmds = [
			{
				id: "rename",
				label: "Rename asset",
				hint: `Current: ${asset.name}`,
				keywords: ["name", "title"],
				group: "Edit",
				icon: PenLine,
				order: 10,
				run: () =>
					openEditAssetFieldWizard({
						assetUid: asset.uid,
						assetName: asset.name,
						spec: {
							field: "name",
							currentValue: asset.name,
							input: "text",
						},
					}),
			},
			{
				id: "edit-description",
				label: "Edit description",
				keywords: ["notes"],
				group: "Edit",
				icon: Info,
				order: 20,
				run: () =>
					openEditAssetFieldWizard({
						assetUid: asset.uid,
						assetName: asset.name,
						spec: {
							field: "description",
							currentValue: asset.description,
							input: "textarea",
						},
					}),
			},
			{
				id: "edit-location",
				label: "Edit location",
				keywords: ["url", "path", "where"],
				group: "Edit",
				icon: MapPin,
				order: 30,
				run: () =>
					openEditAssetFieldWizard({
						assetUid: asset.uid,
						assetName: asset.name,
						spec: {
							field: "location",
							currentValue: asset.location,
							input: "text",
						},
					}),
			},
			{
				id: "change-status",
				label: "Change status",
				hint: `Current: ${asset.status}`,
				keywords: ["active", "draft", "deprecated", "lifecycle"],
				group: "Edit",
				icon: Activity,
				order: 40,
				run: () =>
					openEditAssetFieldWizard({
						assetUid: asset.uid,
						assetName: asset.name,
						spec: {
							field: "status",
							currentValue: asset.status,
							input: "select",
							options: STATUS_OPTIONS,
						},
					}),
			},

			/* --- People --- */
			{
				id: "add-owner",
				label: "Add owner",
				hint: "Actor or team that owns this asset",
				keywords: ["owner", "owns", "maintainer", "steward"],
				group: "People",
				icon: UserPlus,
				order: 10,
				run: () =>
					openCreateRelationWizard({
						title: `Add owner of ${asset.name}`,
						prefillType: "owns",
						prefillTarget: assetRef,
					}),
			},
			{
				id: "add-consumer",
				label: "Add consumer",
				hint: "People or teams that use this asset (batch)",
				keywords: ["consumer", "uses", "user"],
				group: "People",
				icon: Users,
				order: 20,
				run: () =>
					openAddConsumersWizard({
						assetUid: asset.uid,
						assetName: asset.name,
					}),
			},

			/* --- Lineage --- */
			{
				id: "add-source",
				label: "Add upstream source",
				hint: "An asset that this one uses",
				keywords: ["source", "upstream", "uses", "input"],
				group: "Lineage",
				icon: Link2,
				order: 10,
				run: () =>
					openCreateRelationWizard({
						title: `Pick a source for ${asset.name}`,
						prefillType: "uses",
						prefillSource: assetRef,
					}),
			},
			{
				id: "add-feeder",
				label: "Add upstream source",
				hint: "An asset that feeds this one",
				keywords: ["feeder", "feeds", "input", "upstream", "source"],
				group: "Lineage",
				icon: Link2,
				order: 20,
				run: () =>
					openCreateRelationWizard({
						title: `Pick an upstream source for ${asset.name}`,
						prefillType: "feeds",
						prefillTarget: assetRef,
					}),
			},
			{
				id: "add-downstream-feed",
				label: "Add downstream consumer",
				hint: "Something this asset feeds into",
				keywords: ["feed", "downstream", "sink", "output"],
				group: "Lineage",
				icon: Link2,
				order: 30,
				run: () =>
					openCreateRelationWizard({
						title: `Pick what ${asset.name} feeds`,
						prefillType: "feeds",
						prefillSource: assetRef,
					}),
			},
			{
				id: "add-parent",
				label: "Add parent container",
				hint: "Something that contains this asset",
				keywords: ["parent", "container", "contains"],
				group: "Lineage",
				icon: Link2,
				order: 40,
				run: () =>
					openCreateRelationWizard({
						title: `Pick a parent for ${asset.name}`,
						prefillType: "contains",
						prefillTarget: assetRef,
					}),
			},
			{
				id: "add-child",
				label: "Add child",
				hint: "Something this asset contains",
				keywords: ["child", "contains"],
				group: "Lineage",
				icon: Link2,
				order: 50,
				run: () =>
					openCreateRelationWizard({
						title: `Pick a child of ${asset.name}`,
						prefillType: "contains",
						prefillSource: assetRef,
					}),
			},

			/* --- Quality --- */
			{
				id: "add-rule",
				label: "Attach a data-quality rule",
				keywords: ["rule", "quality", "check"],
				group: "Quality",
				icon: ShieldCheck,
				order: 10,
				run: () =>
					openApplyRuleWizard({
						assetUid: asset.uid,
						assetName: asset.name,
					}),
			},

			/* --- Schema --- */
			{
				id: "open-schema-editor",
				label: "Open schema editor",
				hint: "Vim-ish tree — n / a / r / d to mutate fast",
				keywords: ["schema", "editor", "tree", "fields", "columns"],
				group: "Schema",
				icon: ListTree,
				order: 1,
				run: () => {
					window.location.assign(`/assets/${asset.uid}/schema`);
				},
			},
			{
				id: "add-schema-container",
				label: "Add container",
				hint: "Top-level sheet, table, section…",
				keywords: ["container", "sheet", "table", "section", "schema", "add"],
				group: "Schema",
				icon: FolderPlus,
				order: 10,
				run: () =>
					void openAddSchemaChildWizard({
						assetUid: asset.uid,
						assetName: asset.name,
						parentPath: [],
						parentLabel: asset.name,
						prefillKind: "container",
					}),
			},
			{
				id: "add-schema-field",
				label: "Add field",
				hint: "Top-level field (rare — most fields live inside a container)",
				keywords: ["field", "column", "attribute", "schema", "add"],
				group: "Schema",
				icon: Plus,
				order: 20,
				run: () =>
					void openAddSchemaChildWizard({
						assetUid: asset.uid,
						assetName: asset.name,
						parentPath: [],
						parentLabel: asset.name,
						prefillKind: "field",
					}),
			},

			/* --- Metadata --- */
			{
				id: "add-metadata",
				label: "Add metadata",
				hint: "Custom key-value on this asset",
				keywords: ["metadata", "tag", "custom", "field", "key"],
				group: "Metadata",
				icon: Plus,
				order: 10,
				run: () =>
					openEditMetadataFieldWizard({
						entityKind: "asset",
						entityUid: asset.uid,
						entityName: asset.name,
						current: customMetadataMap,
					}),
			},
		];

		// Per-key edit commands — one entry per existing custom metadata key
		// so users can jump straight into editing a specific field from ⌘K.
		for (const mk of customMetadataKeys) {
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
						entityKind: "asset",
						entityUid: asset.uid,
						entityName: asset.name,
						current: customMetadataMap,
						prefillKey: mk,
					}),
			});
		}

		// `mark-verified` lives in the cross-cutting `actions` extension —
		// it's the same flow for every entity kind.

		// Destructive — confirmation prompt before delete.
		cmds.push({
			id: "delete",
			label: "Delete asset",
			hint: "Remove this asset and every relation attached to it",
			keywords: ["delete", "remove", "destroy"],
			group: "Danger",
			icon: Trash2,
			order: 99,
			run: async () => {
				const ok = await openConfirmWizard({
					title: "Delete asset",
					entityLabel: asset.name,
					description:
						"This removes the asset and every relation attached to it. This cannot be undone.",
				});
				if (!ok) return;
				try {
					const res = await fetch(`/api/holocron/assets/${asset.uid}`, {
						method: "DELETE",
					});
					if (!res.ok && res.status !== 204) throw new Error(`Failed (${res.status})`);
					queryClient?.invalidateQueries({ queryKey: queryKeys.assets.all });
					toast.success(`Deleted ${asset.name}`);
					window.location.href = "/";
				} catch (err) {
					toast.error(err instanceof Error ? err.message : "Something went wrong");
				}
			},
		});

		return cmds;
	},
};
