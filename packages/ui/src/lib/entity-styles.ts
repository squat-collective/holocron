/**
 * Centralized styling configuration for entities, relations, and rule
 * attributes. Each entry points at a single CSS custom property declared
 * in globals.css so chips, badges, lineage edges, and SVG strokes all
 * share one hue per concept.
 */

import { CircleHelp } from "lucide-react";
import { actorTypeIcons, assetTypeIcons, type LucideIcon } from "@/lib/icons";

type NodeEntry = {
	icon: LucideIcon;
	label: string;
	bg: string;
	border: string;
	text: string;
	badge: string;
	/** CSS `var()` expression — consumable as an SVG stroke/fill. */
	cssVar: string;
};

// =============================================================================
// ACTOR TYPES
// =============================================================================

export const actorStyles = {
	person: {
		icon: actorTypeIcons.person,
		label: "Person",
		bg: "bg-actor-person/10 dark:bg-actor-person/15",
		border: "border-actor-person/30 dark:border-actor-person/40",
		text: "text-actor-person",
		badge: "bg-actor-person/15 text-actor-person border-actor-person/30",
		cssVar: "var(--actor-person)",
	},
	group: {
		icon: actorTypeIcons.group,
		label: "Group",
		bg: "bg-actor-group/10 dark:bg-actor-group/15",
		border: "border-actor-group/30 dark:border-actor-group/40",
		text: "text-actor-group",
		badge: "bg-actor-group/15 text-actor-group border-actor-group/30",
		cssVar: "var(--actor-group)",
	},
} as const satisfies Record<string, NodeEntry>;

// =============================================================================
// ASSET TYPES
// =============================================================================

export const assetStyles = {
	dataset: {
		icon: assetTypeIcons.dataset,
		label: "Dataset",
		bg: "bg-asset-dataset/10 dark:bg-asset-dataset/15",
		border: "border-asset-dataset/30 dark:border-asset-dataset/40",
		text: "text-asset-dataset",
		badge:
			"bg-asset-dataset/15 text-asset-dataset border-asset-dataset/30",
		cssVar: "var(--asset-dataset)",
	},
	report: {
		icon: assetTypeIcons.report,
		label: "Report",
		bg: "bg-asset-report/10 dark:bg-asset-report/15",
		border: "border-asset-report/30 dark:border-asset-report/40",
		text: "text-asset-report",
		badge: "bg-asset-report/15 text-asset-report border-asset-report/30",
		cssVar: "var(--asset-report)",
	},
	process: {
		icon: assetTypeIcons.process,
		label: "Process",
		bg: "bg-asset-process/10 dark:bg-asset-process/15",
		border: "border-asset-process/30 dark:border-asset-process/40",
		text: "text-asset-process",
		badge:
			"bg-asset-process/15 text-asset-process border-asset-process/30",
		cssVar: "var(--asset-process)",
	},
	system: {
		icon: assetTypeIcons.system,
		label: "System",
		bg: "bg-asset-system/10 dark:bg-asset-system/15",
		border: "border-asset-system/30 dark:border-asset-system/40",
		text: "text-asset-system",
		badge: "bg-asset-system/15 text-asset-system border-asset-system/30",
		cssVar: "var(--asset-system)",
	},
} as const satisfies Record<string, NodeEntry>;

// =============================================================================
// RULE SEVERITY
// =============================================================================

type SeverityEntry = Omit<NodeEntry, "icon">;

export const severityStyles = {
	info: {
		label: "Info",
		bg: "bg-severity-info/10 dark:bg-severity-info/15",
		border: "border-severity-info/30 dark:border-severity-info/40",
		text: "text-severity-info",
		badge:
			"bg-severity-info/15 text-severity-info border-severity-info/30",
		cssVar: "var(--severity-info)",
	},
	warning: {
		label: "Warning",
		bg: "bg-severity-warning/10 dark:bg-severity-warning/15",
		border: "border-severity-warning/30 dark:border-severity-warning/40",
		text: "text-severity-warning",
		badge:
			"bg-severity-warning/15 text-severity-warning border-severity-warning/30",
		cssVar: "var(--severity-warning)",
	},
	critical: {
		label: "Critical",
		bg: "bg-severity-critical/10 dark:bg-severity-critical/15",
		border: "border-severity-critical/30 dark:border-severity-critical/40",
		text: "text-severity-critical",
		badge:
			"bg-severity-critical/15 text-severity-critical border-severity-critical/30",
		cssVar: "var(--severity-critical)",
	},
} as const satisfies Record<string, SeverityEntry>;

// =============================================================================
// ENFORCEMENT
// =============================================================================

export const enforcementStyles = {
	enforced: {
		label: "Enforced",
		bg: "bg-enforcement-enforced/10 dark:bg-enforcement-enforced/15",
		border:
			"border-enforcement-enforced/30 dark:border-enforcement-enforced/40",
		text: "text-enforcement-enforced",
		badge:
			"bg-enforcement-enforced/15 text-enforcement-enforced border-enforcement-enforced/30",
		cssVar: "var(--enforcement-enforced)",
	},
	alerting: {
		label: "Alerting",
		bg: "bg-enforcement-alerting/10 dark:bg-enforcement-alerting/15",
		border:
			"border-enforcement-alerting/30 dark:border-enforcement-alerting/40",
		text: "text-enforcement-alerting",
		badge:
			"bg-enforcement-alerting/15 text-enforcement-alerting border-enforcement-alerting/30",
		cssVar: "var(--enforcement-alerting)",
	},
	documented: {
		label: "Documented",
		bg: "bg-enforcement-documented/10 dark:bg-enforcement-documented/15",
		border:
			"border-enforcement-documented/30 dark:border-enforcement-documented/40",
		text: "text-enforcement-documented",
		badge:
			"bg-enforcement-documented/15 text-enforcement-documented border-enforcement-documented/30",
		cssVar: "var(--enforcement-documented)",
	},
} as const satisfies Record<string, SeverityEntry>;

// =============================================================================
// RELATION TYPES
// =============================================================================

/**
 * Every relation's colours come from a single CSS custom property defined
 * in globals.css (`--relation-owns`, `--relation-uses`, etc.). Tailwind
 * exposes them via `@theme inline` so the classes below compile to real
 * utilities and the same hue is reused in SVG (edge strokes) via `cssVar`.
 *
 * The classes are written out explicitly — Tailwind's JIT scanner only
 * picks up literal strings, not template interpolations.
 */

type RelationEntry = {
	label: string;
	description: string;
	bg: string;
	border: string;
	text: string;
	badge: string;
	/** CSS `var()` expression — consumable as an SVG stroke/fill. */
	cssVar: string;
};

export const relationStyles = {
	owns: {
		label: "Owns",
		description: "Actor owns this asset",
		bg: "bg-relation-owns/10 dark:bg-relation-owns/15",
		border: "border-relation-owns/30 dark:border-relation-owns/40",
		text: "text-relation-owns",
		badge:
			"bg-relation-owns/15 text-relation-owns border-relation-owns/30",
		cssVar: "var(--relation-owns)",
	},
	uses: {
		label: "Uses",
		description: "Source uses target",
		bg: "bg-relation-uses/10 dark:bg-relation-uses/15",
		border: "border-relation-uses/30 dark:border-relation-uses/40",
		text: "text-relation-uses",
		badge:
			"bg-relation-uses/15 text-relation-uses border-relation-uses/30",
		cssVar: "var(--relation-uses)",
	},
	feeds: {
		label: "Feeds",
		description: "Source feeds target",
		bg: "bg-relation-feeds/10 dark:bg-relation-feeds/15",
		border: "border-relation-feeds/30 dark:border-relation-feeds/40",
		text: "text-relation-feeds",
		badge:
			"bg-relation-feeds/15 text-relation-feeds border-relation-feeds/30",
		cssVar: "var(--relation-feeds)",
	},
	contains: {
		label: "Contains",
		description: "Source contains target",
		bg: "bg-relation-contains/10 dark:bg-relation-contains/15",
		border: "border-relation-contains/30 dark:border-relation-contains/40",
		text: "text-relation-contains",
		badge:
			"bg-relation-contains/15 text-relation-contains border-relation-contains/30",
		cssVar: "var(--relation-contains)",
	},
	member_of: {
		label: "Member Of",
		description: "Source is a member of target",
		bg: "bg-relation-member-of/10 dark:bg-relation-member-of/15",
		border: "border-relation-member-of/30 dark:border-relation-member-of/40",
		text: "text-relation-member-of",
		badge:
			"bg-relation-member-of/15 text-relation-member-of border-relation-member-of/30",
		cssVar: "var(--relation-member-of)",
	},
	applies_to: {
		label: "Applies To",
		description: "Rule applies to target asset",
		bg: "bg-relation-applies-to/10 dark:bg-relation-applies-to/15",
		border: "border-relation-applies-to/30 dark:border-relation-applies-to/40",
		text: "text-relation-applies-to",
		badge:
			"bg-relation-applies-to/15 text-relation-applies-to border-relation-applies-to/30",
		cssVar: "var(--relation-applies-to)",
	},
} as const satisfies Record<string, RelationEntry>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export type ActorType = keyof typeof actorStyles;
export type AssetType = keyof typeof assetStyles;
export type RelationType = keyof typeof relationStyles;
export type EntityType = ActorType | AssetType;

/** Get style for any entity type (actor or asset) */
export function getEntityStyle(type: string) {
	if (type in actorStyles) {
		return { ...actorStyles[type as ActorType], entityType: "actor" as const };
	}
	if (type in assetStyles) {
		return { ...assetStyles[type as AssetType], entityType: "asset" as const };
	}
	// Fallback for unknown types
	return {
		icon: CircleHelp,
		label: type,
		bg: "bg-muted",
		border: "border-border",
		text: "text-muted-foreground",
		badge: "bg-muted text-muted-foreground border-border",
		cssVar: "var(--muted-foreground)",
		entityType: "unknown" as const,
	};
}

/** Get style for a rule severity. */
export type SeverityType = keyof typeof severityStyles;
export function getSeverityStyle(severity: string): SeverityEntry {
	if (severity in severityStyles) {
		return severityStyles[severity as SeverityType];
	}
	return {
		label: severity,
		bg: "bg-muted",
		border: "border-border",
		text: "text-muted-foreground",
		badge: "bg-muted text-muted-foreground border-border",
		cssVar: "var(--muted-foreground)",
	};
}

/** Get style for an enforcement tier. */
export type EnforcementType = keyof typeof enforcementStyles;
export function getEnforcementStyle(tier: string): SeverityEntry {
	if (tier in enforcementStyles) {
		return enforcementStyles[tier as EnforcementType];
	}
	return {
		label: tier,
		bg: "bg-muted",
		border: "border-border",
		text: "text-muted-foreground",
		badge: "bg-muted text-muted-foreground border-border",
		cssVar: "var(--muted-foreground)",
	};
}

/** Get style for a relation type */
export function getRelationStyle(type: string): RelationEntry {
	if (type in relationStyles) {
		return relationStyles[type as RelationType];
	}
	// Fallback for unknown relation types — muted / neutral.
	return {
		label: type,
		description: type,
		bg: "bg-muted",
		border: "border-border",
		text: "text-muted-foreground",
		badge: "bg-muted text-muted-foreground border-border",
		cssVar: "var(--muted-foreground)",
	};
}

/* ------------------------------------------------------------------------- */
/* Flow-role classifier                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Where an endpoint of a relation sits in the data-flow narrative:
 *   - `upstream` — data originates here, feeds the other end
 *   - `downstream` — data arrives here, consumes from the other end
 *   - `peer` — ownership / structural / governance link, not a flow
 */
export type FlowRole = "upstream" | "downstream" | "peer";

/**
 * Flow-role of each side of a relation. Storage direction (`from_uid -> to_uid`)
 * does not always match the data-flow direction — `USES` is the canonical
 * example: stored `actor -> asset`, but the asset is the upstream source and
 * the actor is the downstream consumer.
 */
const RELATION_FLOW: Record<
	string,
	{ from: FlowRole; to: FlowRole }
> = {
	// Upstream asset -> downstream asset. Storage matches flow.
	feeds: { from: "upstream", to: "downstream" },
	// Actor consumes data from the asset — asset is upstream, actor is downstream,
	// even though storage is `actor -> asset`.
	uses: { from: "downstream", to: "upstream" },
	// Parent contains child — structural but directional enough that it reads
	// as upstream → downstream on the canvas.
	contains: { from: "upstream", to: "downstream" },
	// Ownership / membership are not lineage — they float as peers so the
	// data-flow columns stay a clean story.
	owns: { from: "peer", to: "peer" },
	member_of: { from: "peer", to: "peer" },
	// Rules are directional: the rule flows into the assets it
	// constrains. On an asset page the rule gets rendered in its own
	// bottom band (via the dedicated rulesQuery path), so this only kicks
	// in when the centre IS a rule — its covered assets then populate the
	// normal downstream column with proper flow handles.
	applies_to: { from: "upstream", to: "downstream" },
};

/**
 * Given a relation and the side of it that the current entity occupies,
 * return the flow role of the OTHER end of the relation.
 *
 * `entitySide = "from"` means the current entity is `from_uid` (outgoing edge
 * in the `use-entity-relations` vocabulary). `"to"` means it is `to_uid`
 * (incoming). The returned role describes where the counterpart sits
 * relative to the current entity on the lineage canvas.
 */
export function getCounterpartFlowRole(
	relationType: string,
	entitySide: "from" | "to",
): FlowRole {
	const pair = RELATION_FLOW[relationType];
	if (!pair) return "peer";
	return entitySide === "from" ? pair.to : pair.from;
}
