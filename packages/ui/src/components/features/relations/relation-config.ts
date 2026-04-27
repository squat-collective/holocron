import type { EntityType } from "@/lib/entity-styles";

/**
 * All relation types supported by the API. Mirrors the SDK's RelationType
 * union. Lineage is asset-only via FEEDS — there is no separate
 * PRODUCES/CONSUMES/DERIVED_FROM vocabulary.
 */
export const RELATION_TYPES = [
	"owns",
	"uses",
	"feeds",
	"contains",
	"member_of",
] as const;

export type RelationTypeValue = (typeof RELATION_TYPES)[number];

type Side = "actor" | "asset" | "any";

interface RelationRule {
	value: RelationTypeValue;
	label: string;
	description: string;
	/** Preferred entity kind on the `from` side (loose). */
	fromSide: Side;
	/** Preferred entity kind on the `to` side (loose). */
	toSide: Side;
}

/**
 * Loose mapping between relation type and the expected entity kinds on each
 * end. The server allows any combination, but the picker uses these to hide
 * irrelevant choices by default.
 */
export const RELATION_RULES: Record<RelationTypeValue, RelationRule> = {
	owns: {
		value: "owns",
		label: "Owns",
		description: "Actor owns target asset or actor",
		fromSide: "actor",
		toSide: "any",
	},
	uses: {
		value: "uses",
		label: "Uses",
		description: "Source uses target",
		fromSide: "actor",
		toSide: "any",
	},
	member_of: {
		value: "member_of",
		label: "Member of",
		description: "Actor is a member of another actor",
		fromSide: "actor",
		toSide: "any",
	},
	feeds: {
		value: "feeds",
		label: "Feeds",
		description: "Source asset feeds target asset (upstream → downstream)",
		fromSide: "asset",
		toSide: "asset",
	},
	contains: {
		value: "contains",
		label: "Contains",
		description: "Source asset contains target asset",
		fromSide: "asset",
		toSide: "asset",
	},
};

/**
 * Given a relation type and which end of it the current entity occupies,
 * return the set of entity types that the OTHER end is expected to be.
 */
export function allowedOtherEntityTypes(
	relationType: RelationTypeValue,
	currentSide: "from" | "to",
): Side {
	const rule = RELATION_RULES[relationType];
	return currentSide === "from" ? rule.toSide : rule.fromSide;
}

/**
 * For a given entity type on the current page, returns the list of relation
 * types where that entity makes sense as the "from" side.
 */
export function relationTypesForEntity(entityType: EntityType): RelationTypeValue[] {
	const kind = isActorType(entityType) ? "actor" : "asset";
	return RELATION_TYPES.filter((type) => {
		const rule = RELATION_RULES[type];
		return (
			rule.fromSide === "any" ||
			rule.fromSide === kind ||
			// Allow reversing: if the relation's `toSide` matches the entity, we can
			// still use it by flipping direction (handled in the dialog).
			rule.toSide === "any" ||
			rule.toSide === kind
		);
	});
}

function isActorType(type: EntityType): boolean {
	return type === "person" || type === "group";
}

export function sideMatches(side: Side, entityKind: "actor" | "asset"): boolean {
	return side === "any" || side === entityKind;
}
