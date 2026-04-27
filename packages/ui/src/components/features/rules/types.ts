/**
 * Types mirroring the API's Rule + APPLIES_TO contract.
 *
 * The `Rule` lives on the node (WHAT data respects). The `enforcement` tier
 * lives on the APPLIES_TO relation (WHERE we're at implementing it for each
 * asset) — same rule can be `enforced` on prod, `documented` on legacy.
 */

export type RuleSeverity = "info" | "warning" | "critical";
export type RuleEnforcement = "enforced" | "alerting" | "documented";

export interface Rule {
	uid: string;
	name: string;
	description: string;
	severity: RuleSeverity;
	category: string | null;
	verified: boolean;
	discovered_by: string | null;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface AppliedRule {
	rule: Rule;
	relation_uid: string;
	enforcement: RuleEnforcement | null;
	field_path: string | null;
	note: string | null;
	properties: Record<string, unknown>;
}

export interface AppliedRulesResponse {
	items: AppliedRule[];
	total: number;
}

export interface RuleListResponse {
	items: Rule[];
	total: number;
}

import { enforcementStyles, severityStyles } from "@/lib/entity-styles";
import { enforcementIcons, type LucideIcon } from "@/lib/icons";

/** UI glyphs + shared classes for each enforcement tier. The palette lives
 *  in entity-styles.ts so cards, badges, and lineage nodes stay coherent. */
export const ENFORCEMENT_META: Record<
	RuleEnforcement,
	{ label: string; icon: LucideIcon; className: string; description: string }
> = {
	enforced: {
		label: enforcementStyles.enforced.label,
		icon: enforcementIcons.enforced,
		className: enforcementStyles.enforced.badge,
		description: "Actively checked — failures block usage",
	},
	alerting: {
		label: enforcementStyles.alerting.label,
		icon: enforcementIcons.alerting,
		className: enforcementStyles.alerting.badge,
		description: "Checked — failures raise an alert but don't block",
	},
	documented: {
		label: enforcementStyles.documented.label,
		icon: enforcementIcons.documented,
		className: enforcementStyles.documented.badge,
		description: "No check in place — documented for future control",
	},
};

export const SEVERITY_META: Record<
	RuleSeverity,
	{ label: string; className: string }
> = {
	info: {
		label: severityStyles.info.label.toLowerCase(),
		className: severityStyles.info.badge,
	},
	warning: {
		label: severityStyles.warning.label.toLowerCase(),
		className: severityStyles.warning.badge,
	},
	critical: {
		label: severityStyles.critical.label.toLowerCase(),
		className: severityStyles.critical.badge,
	},
};
