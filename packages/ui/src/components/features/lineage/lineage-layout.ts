import { type Edge, MarkerType, type Node } from "@xyflow/react";
import type { AppliedRule } from "@/components/features/rules/types";
import {
	type FlowRole,
	getCounterpartFlowRole,
	getRelationStyle,
} from "@/lib/entity-styles";
import { getActorTypeIcon, getAssetTypeIcon } from "@/lib/icons";
import type { DirectedRelation } from "@/hooks/use-entity-relations";
import type {
	ActorKind,
	ActorNodeData,
	AssetKind,
	AssetNodeData,
	CollapsedNodeData,
	HandleMode,
	RuleCenterNodeData,
	RuleNodeData,
	RuleSeverity,
} from "./lineage-types";

// Layout constants. Every edge carries a ~24px label badge at its
// midpoint, so we keep each inter-node gap comfortably larger than that
// (aim for ~140px minimum clearance) — otherwise the badge overshoots
// the endpoints and bumps into the nodes it connects. Node cards are
// ~220px wide / ~56px tall today; COL_W / ROW_H / *_BAND_Y below are
// sized relative to that so tight single-peer configurations still look
// breathable.
const COL_W = 380;
const ROW_H = 96;
const GROUP_GAP = 36;
const COLLAPSE_THRESHOLD = 3;
const CENTER_X = 0;
const UPSTREAM_X = -COL_W;
const DOWNSTREAM_X = COL_W;
/** Horizontal slot width for the peer band above the centre. */
const PEER_SLOT_W = 260;
/** Vertical offset of the peer band centre from the centre node. */
const PEER_BAND_Y = -220;
/** Horizontal slot width for the rule band below the centre. */
const RULE_SLOT_W = 260;
/** Vertical offset of the rule band centre from the centre node. */
const RULE_BAND_Y = 220;
/** Above this many rule nodes we collapse into a +N chip to keep the
 *  band from turning into a data-quality wall. */
const RULE_COLLAPSE_THRESHOLD = 5;

/**
 * Classify a DirectedRelation for lineage-graph placement. Returns the
 * counterparty's flow-role relative to the centre entity — this is where
 * the peer NODE should sit, not where the stored edge points.
 */
export function flowRoleOf(rel: DirectedRelation): FlowRole {
	// `direction` in DirectedRelation is "outgoing" when the centre is the
	// `from_uid` of the stored edge, and "incoming" when it is the `to_uid`.
	const entitySide = rel.direction === "outgoing" ? "from" : "to";
	return getCounterpartFlowRole(rel.relation.type, entitySide);
}

/** Edge stroke colour — delegated to the shared relation palette so chips,
 *  edge pills, and SVG strokes all pull from the same CSS custom property. */
function edgeColor(relationType: string): string {
	return getRelationStyle(relationType).cssVar;
}

/** Build the lineage graph. Relations are grouped by (direction × type) and
 *  groups with more than `COLLAPSE_THRESHOLD` items get a "+N more" chip that
 *  the user can click to expand (see `expandedGroups`). Rules live inside the
 *  center node as stickers — no separate rule peers. */
export function layoutLineage(params: {
	entityUid: string;
	entityName: string;
	entityKind: "asset" | "actor" | "rule";
	entityType: AssetKind | ActorKind | RuleSeverity;
	upstream: DirectedRelation[];
	downstream: DirectedRelation[];
	peers: DirectedRelation[];
	rules: AppliedRule[];
	expandedGroups: Set<string>;
}): { nodes: Node[]; edges: Edge[] } {
	const {
		entityUid,
		entityName,
		entityKind,
		entityType,
		upstream,
		downstream,
		peers,
		rules,
		expandedGroups,
	} = params;

	const nodes: Node[] = [];
	const edges: Edge[] = [];

	// Center node — the asset, orbited by data-flow columns (left/right),
	// a peer band (top), and a rule band (bottom). Handles follow the
	// layout: empty sides stay hidden so drag-to-connect stubs don't
	// clutter the canvas.
	const hasUpstream = upstream.length > 0;
	const hasDownstream = downstream.length > 0;
	const hasPeers = peers.length > 0;
	const hasRules = rules.length > 0;
	const centerHandleMode: HandleMode =
		hasUpstream && hasDownstream
			? "both"
			: hasUpstream
				? "target-only"
				: hasDownstream
					? "source-only"
					: "both";

	const centerId = `${entityKind}:${entityUid}`;
	if (entityKind === "asset") {
		nodes.push({
			id: centerId,
			type: "entity",
			position: { x: CENTER_X, y: 0 },
			data: {
				label: entityName,
				icon: getAssetTypeIcon(entityType as AssetKind),
				entityType: "asset",
				uid: entityUid,
				sub: entityType,
				isCenter: true,
				handleMode: centerHandleMode,
				hasPeers,
				hasRules,
			} satisfies AssetNodeData,
			draggable: false,
		});
	} else if (entityKind === "actor") {
		// Actor center — reuse the avatar node. We flag it via `isCenter`
		// so ActorNode applies the star-gold treatment.
		nodes.push({
			id: centerId,
			type: "actor",
			position: { x: CENTER_X, y: 0 },
			data: {
				label: entityName,
				icon: getActorTypeIcon(entityType as ActorKind),
				uid: entityUid,
				sub: entityType,
				isCenter: true,
				handleMode: centerHandleMode,
				hasPeers,
				hasRules,
			} satisfies ActorNodeData,
			draggable: false,
		});
	} else {
		// Rule centre — dedicated rule node with severity tint + star-gold
		// glow when centre. Rule applies_to edges will point from here to
		// each attached asset as a downstream peer.
		nodes.push({
			id: centerId,
			type: "rule_center",
			position: { x: CENTER_X, y: 0 },
			data: {
				label: entityName,
				severity: entityType as RuleSeverity,
				uid: entityUid,
				isCenter: true,
				handleMode: centerHandleMode,
			} satisfies RuleCenterNodeData,
			draggable: false,
		});
	}

	function groupByType(
		rels: DirectedRelation[],
	): [string, DirectedRelation[]][] {
		const m = new Map<string, DirectedRelation[]>();
		for (const r of rels) {
			const list = m.get(r.relation.type) ?? [];
			list.push(r);
			m.set(r.relation.type, list);
		}
		return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	}

	function placeColumn(
		rels: DirectedRelation[],
		flowSide: "upstream" | "downstream",
		x: number,
	) {
		const groups = groupByType(rels);
		// Compute visible counts per group (cap when not expanded).
		const perGroupVisible = groups.map(([relType, items]) => {
			const key = `${flowSide}:${relType}`;
			const expanded = expandedGroups.has(key);
			const collapse = !expanded && items.length > COLLAPSE_THRESHOLD;
			const shown = collapse ? COLLAPSE_THRESHOLD : items.length;
			const rowCount = collapse ? shown + 1 : shown; // +1 for +N chip
			return { relType, items, key, collapse, shown, rowCount };
		});
		const totalRows = perGroupVisible.reduce((s, g) => s + g.rowCount, 0);
		const totalHeight =
			totalRows * ROW_H +
			Math.max(0, perGroupVisible.length - 1) * GROUP_GAP;

		let y = -totalHeight / 2 + ROW_H / 2;
		for (const group of perGroupVisible) {
			// Upstream nodes connect to the centre via their RIGHT side
			// (source handle). Downstream nodes connect via their LEFT
			// (target handle). The opposite side is inert — hide it.
			const peerHandleMode: HandleMode =
				flowSide === "upstream" ? "source-only" : "target-only";
			const visibleItems = group.items.slice(0, group.shown);
			for (const rel of visibleItems) {
				const isActor = rel.other.entityType === "actor";
				const nodeId = `${flowSide}:${rel.relation.uid}`;
				nodes.push({
					id: nodeId,
					type: isActor ? "actor" : "entity",
					position: { x, y },
					data: isActor
						? ({
								label: rel.other.name,
								icon: getActorTypeIcon(rel.other.type),
								uid: rel.other.uid,
								sub: rel.other.type,
								handleMode: peerHandleMode,
							} satisfies ActorNodeData)
						: ({
								label: rel.other.name,
								icon: getAssetTypeIcon(
									rel.other.type as "dataset" | "report" | "process" | "system",
								),
								entityType: "asset",
								uid: rel.other.uid,
								sub: rel.other.type,
								handleMode: peerHandleMode,
							} satisfies AssetNodeData),
					draggable: true,
				});
				// Arrow always points from upstream → downstream, regardless
				// of how the relation is stored. A USES edge stored as
				// `actor -> asset` still renders asset → actor when viewed
				// from the asset's perspective. Both endpoints are pinned
				// to their flow-specific handle ids (`flow-in` / `flow-out`)
				// so the line always enters the left of a node and exits
				// the right — otherwise xyflow is free to grab the peer or
				// rule handle that happens to share a type.
				const source = flowSide === "upstream" ? nodeId : centerId;
				const target = flowSide === "upstream" ? centerId : nodeId;
				edges.push({
					id: `e:${flowSide}:${rel.relation.uid}`,
					source,
					sourceHandle: "flow-out",
					target,
					targetHandle: "flow-in",
					type: "relation",
					data: { relationType: rel.relation.type },
					style: {
						stroke: edgeColor(rel.relation.type),
						strokeWidth: 1.5,
					},
					markerEnd: {
						type: MarkerType.ArrowClosed,
						color: edgeColor(rel.relation.type),
					},
				});
				y += ROW_H;
			}

			if (group.collapse) {
				const hidden = group.items.length - group.shown;
				const nodeId = `collapsed:${flowSide}:${group.relType}`;
				nodes.push({
					id: nodeId,
					type: "collapsed",
					position: { x, y },
					data: {
						count: hidden,
						groupKey: group.key,
						relationType: group.relType,
						// The collapsed-chip node only exposes the inner handle it
						// needs, so the direction field still maps onto stored
						// incoming/outgoing for handle placement.
						direction: flowSide === "upstream" ? "incoming" : "outgoing",
						handleMode: peerHandleMode,
					} satisfies CollapsedNodeData,
					draggable: true,
				});
				const source = flowSide === "upstream" ? nodeId : centerId;
				const target = flowSide === "upstream" ? centerId : nodeId;
				edges.push({
					id: `e:collapsed:${flowSide}:${group.relType}`,
					source,
					sourceHandle: "flow-out",
					target,
					targetHandle: "flow-in",
					type: "relation",
					data: { relationType: group.relType },
					style: {
						stroke: edgeColor(group.relType),
						strokeWidth: 1.25,
						strokeDasharray: "4 3",
					},
					markerEnd: {
						type: MarkerType.ArrowClosed,
						color: edgeColor(group.relType),
					},
				});
				y += ROW_H;
			}
			y += GROUP_GAP;
		}
	}

	function placePeerBand(rels: DirectedRelation[]) {
		if (rels.length === 0) return;
		const groups = groupByType(rels);
		// Peers live on a single horizontal strip above the centre. Each
		// group gets up to COLLAPSE_THRESHOLD slots; a "+N more" chip
		// stands in for the rest so the band doesn't sprawl.
		const slots: Array<
			| { kind: "peer"; rel: DirectedRelation }
			| {
					kind: "collapsed";
					relType: string;
					hidden: number;
					groupKey: string;
			  }
		> = [];
		for (const [relType, items] of groups) {
			const key = `peer:${relType}`;
			const expanded = expandedGroups.has(key);
			const collapse = !expanded && items.length > COLLAPSE_THRESHOLD;
			const shown = collapse ? COLLAPSE_THRESHOLD : items.length;
			for (const rel of items.slice(0, shown)) slots.push({ kind: "peer", rel });
			if (collapse) {
				slots.push({
					kind: "collapsed",
					relType,
					hidden: items.length - shown,
					groupKey: key,
				});
			}
		}
		// Centre the strip horizontally over the centre node.
		const bandWidth = slots.length * PEER_SLOT_W;
		let x = -bandWidth / 2 + PEER_SLOT_W / 2;
		const y = PEER_BAND_Y;
		for (const slot of slots) {
			if (slot.kind === "peer") {
				const rel = slot.rel;
				const isActor = rel.other.entityType === "actor";
				const nodeId = `peer:${rel.relation.uid}`;
				nodes.push({
					id: nodeId,
					type: isActor ? "actor" : "entity",
					position: { x, y },
					data: isActor
						? ({
								label: rel.other.name,
								icon: getActorTypeIcon(rel.other.type),
								uid: rel.other.uid,
								sub: rel.other.type,
								handleMode: "target-bottom",
							} satisfies ActorNodeData)
						: ({
								label: rel.other.name,
								icon: getAssetTypeIcon(
									rel.other.type as "dataset" | "report" | "process" | "system",
								),
								entityType: "asset",
								uid: rel.other.uid,
								sub: rel.other.type,
								handleMode: "target-bottom",
							} satisfies AssetNodeData),
					draggable: true,
				});
				// Peer edges aren't data flow. Draw a short dashed line
				// from the centre's top-source handle up to the peer's
				// bottom-target handle, with no arrowhead — the
				// connection itself is the whole message.
				edges.push({
					id: `e:peer:${rel.relation.uid}`,
					source: centerId,
					sourceHandle: "peer-top",
					target: nodeId,
					type: "relation",
					data: { relationType: rel.relation.type },
					style: {
						stroke: edgeColor(rel.relation.type),
						strokeWidth: 1.25,
						strokeDasharray: "2 4",
					},
				});
			} else {
				const nodeId = `collapsed:peer:${slot.relType}`;
				nodes.push({
					id: nodeId,
					type: "collapsed",
					position: { x, y },
					data: {
						count: slot.hidden,
						groupKey: slot.groupKey,
						relationType: slot.relType,
						direction: "outgoing",
						handleMode: "target-bottom",
					} satisfies CollapsedNodeData,
					draggable: true,
				});
				edges.push({
					id: `e:collapsed:peer:${slot.relType}`,
					source: centerId,
					sourceHandle: "peer-top",
					target: nodeId,
					type: "relation",
					data: { relationType: slot.relType },
					style: {
						stroke: edgeColor(slot.relType),
						strokeWidth: 1.1,
						strokeDasharray: "2 4",
					},
				});
			}
			x += PEER_SLOT_W;
		}
	}

	function placeRuleBand(rulesList: AppliedRule[]) {
		if (rulesList.length === 0) return;
		// Rules are grouped visually as "just rules" — no per-type split.
		const expanded = expandedGroups.has("rules:applies_to");
		const collapse =
			!expanded && rulesList.length > RULE_COLLAPSE_THRESHOLD;
		const shown = collapse
			? RULE_COLLAPSE_THRESHOLD
			: rulesList.length;
		const slotCount = collapse ? shown + 1 : shown;
		const bandWidth = slotCount * RULE_SLOT_W;
		let x = -bandWidth / 2 + RULE_SLOT_W / 2;
		const y = RULE_BAND_Y;
		for (const applied of rulesList.slice(0, shown)) {
			const nodeId = `rule:${applied.rule.uid}`;
			nodes.push({
				id: nodeId,
				type: "rule",
				position: { x, y },
				data: {
					label: applied.rule.name,
					severity: applied.rule.severity,
					enforcement: applied.enforcement ?? null,
					uid: applied.rule.uid,
					handleMode: "source-top",
				} satisfies RuleNodeData,
				draggable: true,
			});
			// APPLIES_TO is directional: the rule is the source, the asset
			// the target. Render the arrow accordingly — rule-top-source
			// → centre-bottom-target.
			edges.push({
				id: `e:rule:${applied.rule.uid}`,
				source: nodeId,
				target: centerId,
				targetHandle: "rule-bottom",
				type: "relation",
				data: { relationType: "applies_to", kind: "rule" },
				style: {
					stroke: edgeColor("applies_to"),
					strokeWidth: 1.25,
					strokeDasharray: "4 3",
				},
				markerEnd: {
					type: MarkerType.ArrowClosed,
					color: edgeColor("applies_to"),
				},
			});
			x += RULE_SLOT_W;
		}
		if (collapse) {
			const nodeId = "collapsed:rules";
			nodes.push({
				id: nodeId,
				type: "collapsed",
				position: { x, y },
				data: {
					count: rulesList.length - shown,
					groupKey: "rules:applies_to",
					relationType: "applies_to",
					direction: "incoming",
					handleMode: "source-top",
				} satisfies CollapsedNodeData,
				draggable: true,
			});
			edges.push({
				id: "e:collapsed:rules",
				source: nodeId,
				target: centerId,
				targetHandle: "rule-bottom",
				type: "relation",
				data: { relationType: "applies_to", kind: "rule" },
				style: {
					stroke: edgeColor("applies_to"),
					strokeWidth: 1.1,
					strokeDasharray: "4 3",
				},
				markerEnd: {
					type: MarkerType.ArrowClosed,
					color: edgeColor("applies_to"),
				},
			});
		}
	}

	placeColumn(upstream, "upstream", UPSTREAM_X);
	placeColumn(downstream, "downstream", DOWNSTREAM_X);
	placePeerBand(peers);
	placeRuleBand(rules);

	return { nodes, edges };
}
