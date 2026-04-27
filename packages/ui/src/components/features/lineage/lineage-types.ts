import type { LucideIcon } from "@/lib/icons";

export type AssetKind = "dataset" | "report" | "process" | "system";
export type ActorKind = "person" | "group";
export type RuleSeverity = "info" | "warning" | "critical";

export type Direction = "upstream" | "downstream" | "both";

export interface LineageFilters {
	/** Hidden entity sub-types (e.g. "dataset", "person"). Empty = all visible. */
	hiddenEntityTypes: Set<string>;
	/** Hidden relation types (e.g. "owns", "uses"). Empty = all visible. */
	hiddenRelationTypes: Set<string>;
	/** Whether rule stickers on the centre asset are shown. */
	rules: boolean;
	direction: Direction;
}

/** Which React Flow handles a node actually needs. We don't support
 *  drag-to-connect, so any handle with no wire attached is just a cosmetic
 *  dot and we hide it.
 *
 *  Band-specific modes:
 *  - `target-bottom` — peer nodes floating in the band ABOVE the centre.
 *    Edges rise from the centre and land on the peer's bottom edge.
 *  - `source-top`    — rule nodes in the band BELOW the centre. Edges
 *    rise from the rule's top edge up into the centre's bottom.
 */
export type HandleMode =
	| "source-only"
	| "target-only"
	| "both"
	| "target-bottom"
	| "source-top";

export interface AssetNodeData {
	label: string;
	icon: LucideIcon;
	entityType: "asset" | "actor";
	uid: string;
	sub?: string;
	isCenter?: boolean;
	handleMode: HandleMode;
	/** Center-only: render a top source handle (id="peer-top") so
	 *  peer-band edges can attach there. Ignored on non-centre nodes. */
	hasPeers?: boolean;
	/** Center-only: render a bottom target handle (id="rule-bottom") so
	 *  rule-band edges can attach there. Ignored on non-centre nodes. */
	hasRules?: boolean;
	[key: string]: unknown;
}

export interface ActorNodeData {
	label: string;
	icon: LucideIcon;
	uid: string;
	sub: string;
	isCenter?: boolean;
	handleMode: HandleMode;
	hasPeers?: boolean;
	hasRules?: boolean;
	[key: string]: unknown;
}

/** Rule node that sits in the band below the centre. Standalone card
 *  (not a sticker) so the name, severity, and enforcement all read
 *  clearly. One top source handle so the APPLIES_TO arrow rises into the
 *  centre's bottom. */
export interface RuleNodeData {
	label: string;
	severity: RuleSeverity;
	enforcement: "enforced" | "alerting" | "documented" | null;
	uid: string;
	handleMode: HandleMode;
	[key: string]: unknown;
}

export interface CollapsedNodeData {
	/** How many peers are hidden behind this chip. */
	count: number;
	/** `${direction}:${relationType}` — what to expand on click. */
	groupKey: string;
	/** The relation type (for colouring + icon). */
	relationType: string;
	direction: "incoming" | "outgoing";
	handleMode: HandleMode;
	[key: string]: unknown;
}

export interface RuleCenterNodeData {
	label: string;
	severity: RuleSeverity;
	uid: string;
	isCenter: true;
	handleMode: HandleMode;
	[key: string]: unknown;
}

export interface RelationEdgeData {
	relationType: string;
	/** When set, the edge is a rule-attachment — dotted, no colored pill. */
	kind?: "rule";
	[key: string]: unknown;
}
