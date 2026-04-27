"use client";

import { useSyncExternalStore } from "react";
import type { PluginManifest } from "@/lib/plugins";

/**
 * Wizard stack — composable multi-step flows.
 *
 * One wizard per entity kind (asset, actor, rule, relation, …). Any wizard
 * can invoke another with `openWizard(kind, params)` and await the result.
 * This is how pickers fall back to creation: a maintainer picker that can't
 * find a name opens the actor-create wizard, awaits the new actor, then adds
 * it to the list.
 *
 * Frames are rendered as a stack by `<WizardHost />` in the root layout.
 * The top-most frame is interactive; lower frames are dimmed beneath their
 * own dialog overlays. Closing a frame resolves its promise.
 */

export type WizardKind =
	| "asset-create"
	| "actor-create"
	| "relation-create"
	| "rule-create"
	| "rule-apply"
	| "rule-attach-to-asset"
	| "consumers-add"
	| "asset-edit-field"
	| "metadata-edit-field"
	| "schema-edit-field"
	| "schema-add-child"
	| "confirm"
	| "entity-scalar-edit"
	| "plugin-run"
	| "entity-events"
	| "governance-list";

/* ---------- Params + result types per kind ---------- */

export type AssetType = "dataset" | "report" | "process" | "system";
export type ActorType = "person" | "group";

export interface AssetCreateParams {
	/** Optional pre-filled name from the invoker */
	prefillName?: string;
	/** Optional pre-filled asset type */
	prefillType?: AssetType;
}

export interface AssetCreateResult {
	uid: string;
	name: string;
	type: AssetType;
}

export interface ActorCreateParams {
	prefillName?: string;
	prefillType?: ActorType;
}

export interface ActorCreateResult {
	uid: string;
	name: string;
	type: ActorType;
}

/** Shared reference for one end of a relation — an actor or an asset. */
export interface EntityRef {
	uid: string;
	name: string;
	kind: "actor" | "asset";
	type: ActorType | AssetType;
}

export type RelationTypeValue =
	| "owns"
	| "uses"
	| "feeds"
	| "contains"
	| "member_of";

export interface RelationCreateParams {
	/** Pre-fill the relation type. When set, the type-picker step is skipped. */
	prefillType?: RelationTypeValue;
	/** Pre-fill the source side. The user doesn't see the source picker step. */
	prefillSource?: EntityRef;
	/** Pre-fill the target side. */
	prefillTarget?: EntityRef;
	/** Optional title override (e.g. "Add owner"). Falls back to the wizard's
	 *  default "New relation" when absent. */
	title?: string;
}

export interface RelationCreateResult {
	uid: string;
	type: string;
	from_uid: string;
	to_uid: string;
}

/* ---------- Rules ---------- */

export type RuleSeverity = "info" | "warning" | "critical";
export type RuleEnforcement = "enforced" | "alerting" | "documented";

export interface RuleCreateParams {
	prefillName?: string;
}
export interface RuleCreateResult {
	uid: string;
	name: string;
	description: string;
	severity: RuleSeverity;
	category: string | null;
}

/** Target option passed into the apply-rule wizard — a specific schema node
 *  inside the asset, or the asset itself when `path` is `__whole__`. */
export interface RuleApplyTargetOption {
	path: string;
	depth: number;
	kind: "container" | "field";
	containerType?: string;
	dataType?: string;
}

export interface RuleApplyParams {
	assetUid: string;
	assetName: string;
	/** Pre-walked schema paths the user can target. When absent or empty, only
	 *  the whole asset can be targeted. */
	schemaTargets?: RuleApplyTargetOption[];
}
export interface RuleApplyResult {
	/** How many rule → asset relations were created. */
	count: number;
}

/* ---------- Attach rule → asset (rule-page side) ---------- */

export interface RuleAttachToAssetParams {
	ruleUid: string;
	ruleName: string;
	severity: "info" | "warning" | "critical";
}
export interface RuleAttachToAssetResult {
	count: number;
}

/* ---------- Generic metadata key-value edit ---------- */

export interface MetadataEditFieldParams {
	/** Target entity. Supports assets and actors. */
	entityKind: "asset" | "actor";
	entityUid: string;
	entityName: string;
	/** Current metadata object — used to pre-fill key autocomplete. */
	current: Record<string, unknown>;
	/** When set, the wizard edits that existing key instead of asking. */
	prefillKey?: string;
}
export interface MetadataEditFieldResult {
	saved: boolean;
}

/* ---------- Consumers (multi-actor → asset 'uses' batch) ---------- */

export interface ConsumersAddParams {
	assetUid: string;
	assetName: string;
}
export interface ConsumersAddResult {
	/** How many consumer relations were created. */
	count: number;
}

/* ---------- Edit a single asset field ---------- */

export type AssetStatus = "active" | "deprecated" | "draft";

export type AssetFieldSpec =
	| { field: "name"; currentValue: string; input: "text" }
	| {
			field: "description";
			currentValue: string | null;
			input: "textarea";
	  }
	| {
			field: "location";
			currentValue: string | null;
			input: "text";
	  }
	| {
			field: "status";
			currentValue: AssetStatus;
			input: "select";
			options: readonly { value: AssetStatus; label: string }[];
	  };

export interface AssetEditFieldParams {
	assetUid: string;
	assetName: string;
	spec: AssetFieldSpec;
}
export interface AssetEditFieldResult {
	saved: boolean;
}

/* ---------- Schema (container / field) editing ---------- */

/** Discriminated spec per-field. Driven by the palette command. */
export type SchemaFieldSpec =
	| { field: "name"; currentValue: string; input: "text" }
	| {
			field: "description";
			currentValue: string | null;
			input: "textarea";
	  }
	| {
			field: "containerType";
			currentValue: string | null;
			input: "select";
			options: readonly { value: string; label: string }[];
	  }
	| {
			field: "dataType";
			currentValue: string | null;
			input: "select";
			options: readonly { value: string; label: string }[];
	  }
	| { field: "pii"; currentValue: boolean; input: "toggle" };

export interface SchemaEditFieldParams {
	assetUid: string;
	assetName: string;
	/** Full name-path from the asset root to the target node. */
	nodePath: string[];
	nodeName: string;
	nodeKind: "container" | "field";
	spec: SchemaFieldSpec;
}

export interface SchemaEditFieldResult {
	saved: boolean;
	/** Set when the name was changed — caller navigates to the new URL. */
	newPath?: string[];
}

export interface SchemaAddChildParams {
	assetUid: string;
	assetName: string;
	/** Parent path; [] means insert at the asset's schema root. */
	parentPath: string[];
	/** Human label for the parent — used in wizard copy. */
	parentLabel: string;
	/** Optional pre-selected kind; when set, the kind step is skipped. */
	prefillKind?: "container" | "field";
}

export interface SchemaAddChildResult {
	/** Full path of the new node from the asset root. */
	path: string[];
	kind: "container" | "field";
}

/* ---------- Generic single-scalar entity edit ---------- */

/** Used for one-shot text/textarea edits on actors and rules — anything
 *  that doesn't justify a bespoke wizard. The asset edit wizard stays
 *  separate because it covers richer specs (status select etc.). */
export interface EntityScalarEditParams {
	entityKind: "actor" | "rule";
	entityUid: string;
	entityName: string;
	/** Property to send in the PUT body — e.g. "name", "email". */
	field: string;
	/** Human label shown in the dialog title — e.g. "Email". */
	fieldLabel: string;
	currentValue: string | null;
	input: "text" | "textarea";
	/** Block save on empty value. Default false (empty == clear). */
	required?: boolean;
	placeholder?: string;
}

export interface EntityScalarEditResult {
	saved: boolean;
}

/* ---------- Governance saved-search list ---------- */

/** The set of governance audits the UI can run. Each maps to a fixed
 *  filter spec on `/api/holocron/assets`. The wizard renders the result
 *  list — the user clicks through to the offending asset. */
export type GovernanceAudit = "unverified" | "unowned" | "undocumented";

export interface GovernanceListParams {
	audit: GovernanceAudit;
}

export interface GovernanceListResult {
	closed: true;
}

/* ---------- Entity events (read-only history view) ---------- */

export interface EntityEventsParams {
	/** What kind of node we're viewing the audit trail for. The kind drives
	 *  the dialog title only; events are looked up by uid. */
	entityKind: "asset" | "actor" | "rule";
	entityUid: string;
	entityName: string;
}

export interface EntityEventsResult {
	/** This wizard is read-only — the field is here for symmetry with the
	 *  rest of the wizard contracts but isn't consulted by callers. */
	closed: true;
}

/* ---------- Plugin run ---------- */

export interface PluginRunParams {
	/** The plugin manifest — drives form rendering, validation, and the
	 *  endpoint slug used for submission. */
	manifest: PluginManifest;
}

export interface PluginRunResult {
	/** Whether the plugin succeeded. EXPORT downloads count as success once
	 *  the file has been streamed to the browser. */
	ok: boolean;
}

/* ---------- Confirmation dialogs ---------- */

export interface ConfirmParams {
	/** Title shown at the top — e.g. "Delete asset". */
	title: string;
	/** What will happen / why this is destructive. Plain string or JSX. */
	description: string;
	/** Optional entity name shown prominently between the title and the body. */
	entityLabel?: string;
	/** Confirm button label. Defaults to "Delete". */
	confirmLabel?: string;
	/** "destructive" (default) or "default" — drives button color. */
	tone?: "destructive" | "default";
}

export interface ConfirmResult {
	confirmed: boolean;
}

export type WizardParamsMap = {
	"asset-create": AssetCreateParams;
	"actor-create": ActorCreateParams;
	"relation-create": RelationCreateParams;
	"rule-create": RuleCreateParams;
	"rule-apply": RuleApplyParams;
	"rule-attach-to-asset": RuleAttachToAssetParams;
	"consumers-add": ConsumersAddParams;
	"asset-edit-field": AssetEditFieldParams;
	"metadata-edit-field": MetadataEditFieldParams;
	"schema-edit-field": SchemaEditFieldParams;
	"schema-add-child": SchemaAddChildParams;
	confirm: ConfirmParams;
	"entity-scalar-edit": EntityScalarEditParams;
	"plugin-run": PluginRunParams;
	"entity-events": EntityEventsParams;
	"governance-list": GovernanceListParams;
};

export type WizardResultMap = {
	"asset-create": AssetCreateResult;
	"actor-create": ActorCreateResult;
	"relation-create": RelationCreateResult;
	"rule-create": RuleCreateResult;
	"rule-apply": RuleApplyResult;
	"rule-attach-to-asset": RuleAttachToAssetResult;
	"consumers-add": ConsumersAddResult;
	"asset-edit-field": AssetEditFieldResult;
	"metadata-edit-field": MetadataEditFieldResult;
	"schema-edit-field": SchemaEditFieldResult;
	"schema-add-child": SchemaAddChildResult;
	confirm: ConfirmResult;
	"entity-scalar-edit": EntityScalarEditResult;
	"plugin-run": PluginRunResult;
	"entity-events": EntityEventsResult;
	"governance-list": GovernanceListResult;
};

/* ---------- Frame types (discriminated by kind) ---------- */

interface FrameBase {
	id: string;
	/** When true, the wizard autofocuses its first input on mount even when
	 *  it's the bottom of the stack. Default false (matches the ⌘K-opened
	 *  flow where jumping focus would feel jarring). Set to true when the
	 *  caller is itself a keyboard-driven action — e.g. opening from an
	 *  editor keystroke. */
	focusOnOpen?: boolean;
}
interface FrameAssetCreate extends FrameBase {
	kind: "asset-create";
	params: AssetCreateParams;
	resolve: (result: AssetCreateResult | null) => void;
}
interface FrameActorCreate extends FrameBase {
	kind: "actor-create";
	params: ActorCreateParams;
	resolve: (result: ActorCreateResult | null) => void;
}
interface FrameRelationCreate extends FrameBase {
	kind: "relation-create";
	params: RelationCreateParams;
	resolve: (result: RelationCreateResult | null) => void;
}
interface FrameRuleCreate extends FrameBase {
	kind: "rule-create";
	params: RuleCreateParams;
	resolve: (result: RuleCreateResult | null) => void;
}
interface FrameRuleApply extends FrameBase {
	kind: "rule-apply";
	params: RuleApplyParams;
	resolve: (result: RuleApplyResult | null) => void;
}
interface FrameConsumersAdd extends FrameBase {
	kind: "consumers-add";
	params: ConsumersAddParams;
	resolve: (result: ConsumersAddResult | null) => void;
}
interface FrameAssetEditField extends FrameBase {
	kind: "asset-edit-field";
	params: AssetEditFieldParams;
	resolve: (result: AssetEditFieldResult | null) => void;
}
interface FrameRuleAttachToAsset extends FrameBase {
	kind: "rule-attach-to-asset";
	params: RuleAttachToAssetParams;
	resolve: (result: RuleAttachToAssetResult | null) => void;
}
interface FrameMetadataEditField extends FrameBase {
	kind: "metadata-edit-field";
	params: MetadataEditFieldParams;
	resolve: (result: MetadataEditFieldResult | null) => void;
}
interface FrameSchemaEditField extends FrameBase {
	kind: "schema-edit-field";
	params: SchemaEditFieldParams;
	resolve: (result: SchemaEditFieldResult | null) => void;
}
interface FrameSchemaAddChild extends FrameBase {
	kind: "schema-add-child";
	params: SchemaAddChildParams;
	resolve: (result: SchemaAddChildResult | null) => void;
}
interface FrameConfirm extends FrameBase {
	kind: "confirm";
	params: ConfirmParams;
	resolve: (result: ConfirmResult | null) => void;
}
interface FrameEntityScalarEdit extends FrameBase {
	kind: "entity-scalar-edit";
	params: EntityScalarEditParams;
	resolve: (result: EntityScalarEditResult | null) => void;
}
interface FramePluginRun extends FrameBase {
	kind: "plugin-run";
	params: PluginRunParams;
	resolve: (result: PluginRunResult | null) => void;
}
interface FrameEntityEvents extends FrameBase {
	kind: "entity-events";
	params: EntityEventsParams;
	resolve: (result: EntityEventsResult | null) => void;
}
interface FrameGovernanceList extends FrameBase {
	kind: "governance-list";
	params: GovernanceListParams;
	resolve: (result: GovernanceListResult | null) => void;
}
export type WizardFrame =
	| FrameAssetCreate
	| FrameActorCreate
	| FrameRelationCreate
	| FrameRuleCreate
	| FrameRuleApply
	| FrameConsumersAdd
	| FrameAssetEditField
	| FrameRuleAttachToAsset
	| FrameMetadataEditField
	| FrameSchemaEditField
	| FrameSchemaAddChild
	| FrameConfirm
	| FrameEntityScalarEdit
	| FramePluginRun
	| FrameEntityEvents
	| FrameGovernanceList;

/* ---------- Store ---------- */

let stack: WizardFrame[] = [];
let idCounter = 0;
const listeners = new Set<() => void>();
function emit() {
	for (const l of listeners) l();
}

/**
 * Push a wizard onto the stack. Returns a promise that resolves when the
 * wizard is dismissed — with the wizard's result on success, or null if the
 * user cancelled.
 */
export interface OpenWizardOptions {
	/** Pull focus to the first input on mount. See FrameBase.focusOnOpen. */
	focusOnOpen?: boolean;
}

export function openWizard<K extends WizardKind>(
	kind: K,
	params: WizardParamsMap[K],
	options: OpenWizardOptions = {},
): Promise<WizardResultMap[K] | null> {
	return new Promise((resolve) => {
		idCounter += 1;
		const id = `wiz-${idCounter}`;
		const frame = {
			id,
			kind,
			params,
			resolve,
			focusOnOpen: options.focusOnOpen,
		} as WizardFrame;
		stack = [...stack, frame];
		emit();
	});
}

/**
 * Close a wizard and resolve its promise. If called without a result, the
 * wizard is treated as cancelled and resolves with null.
 */
export function closeWizard(id: string, result?: unknown) {
	const frame = stack.find((f) => f.id === id);
	if (!frame) return;
	(frame.resolve as (r: unknown) => void)(result ?? null);
	stack = stack.filter((f) => f.id !== id);
	emit();
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}
function getSnapshot() {
	return stack;
}
export function useWizardStack(): WizardFrame[] {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/* ---------- Convenience wrappers ---------- */

export function openCreateAssetWizard(params: AssetCreateParams = {}) {
	return openWizard("asset-create", params);
}

export function openCreateActorWizard(params: ActorCreateParams = {}) {
	return openWizard("actor-create", params);
}

export function openCreateRelationWizard(params: RelationCreateParams = {}) {
	return openWizard("relation-create", params);
}

export function openCreateRuleWizard(params: RuleCreateParams = {}) {
	return openWizard("rule-create", params);
}

export function openApplyRuleWizard(params: RuleApplyParams) {
	return openWizard("rule-apply", params);
}

export function openAddConsumersWizard(params: ConsumersAddParams) {
	return openWizard("consumers-add", params);
}

export function openEditAssetFieldWizard(params: AssetEditFieldParams) {
	return openWizard("asset-edit-field", params);
}

export function openAttachRuleToAssetWizard(params: RuleAttachToAssetParams) {
	return openWizard("rule-attach-to-asset", params);
}

export function openEditMetadataFieldWizard(params: MetadataEditFieldParams) {
	return openWizard("metadata-edit-field", params);
}

export function openEditSchemaFieldWizard(
	params: SchemaEditFieldParams,
	options?: OpenWizardOptions,
) {
	return openWizard("schema-edit-field", params, options);
}

export function openAddSchemaChildWizard(
	params: SchemaAddChildParams,
	options?: OpenWizardOptions,
) {
	return openWizard("schema-add-child", params, options);
}

/**
 * Show a destructive confirmation dialog. Resolves with `{ confirmed: true }`
 * when the user picks Confirm, or `null` (treated as cancel) otherwise.
 * Default tone is "destructive" — pass `tone: "default"` for non-destructive
 * confirmations.
 */
export async function openConfirmWizard(params: ConfirmParams): Promise<boolean> {
	const result = await openWizard("confirm", params, { focusOnOpen: true });
	return result?.confirmed === true;
}

/** One-shot scalar edit for actors / rules. PUTs the field via the entity's
 *  REST endpoint. */
export function openEntityScalarEditWizard(
	params: EntityScalarEditParams,
	options?: OpenWizardOptions,
) {
	return openWizard("entity-scalar-edit", params, options);
}

/** Run a plugin via its manifest. The wizard auto-renders the input form,
 *  posts multipart to `/api/holocron/plugins/{slug}/run`, then either
 *  shows a SummaryResult card (IMPORT) or triggers a download (EXPORT). */
export function openPluginRunWizard(params: PluginRunParams) {
	return openWizard("plugin-run", params);
}

/** Show the audit trail for an entity. Read-only: just renders the events
 *  list with a Close button. */
export function openEntityEventsWizard(params: EntityEventsParams) {
	return openWizard("entity-events", params);
}

/** Open a governance-saved-search audit (unverified / unowned /
 *  undocumented). Renders matching assets with click-through to detail. */
export function openGovernanceListWizard(params: GovernanceListParams) {
	return openWizard("governance-list", params);
}

/** Pop every wizard off the stack. Used by the dev-tools "Reset wizard
 *  stack" command when a frame gets jammed; does nothing in normal flows. */
export function clearWizardStack(): void {
	if (stack.length === 0) return;
	for (const f of stack) {
		(f.resolve as (r: unknown) => void)(null);
	}
	stack = [];
	emit();
}
