"use client";

import {
	Background,
	BackgroundVariant,
	Controls,
	MiniMap,
	type Node,
	ReactFlow,
	ReactFlowProvider,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Database } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAssetRules } from "@/hooks/use-asset-rules";
import { type DirectedRelation, useEntityRelations } from "@/hooks/use-entity-relations";
import {
	FilterToggle,
	Legend,
	LineageFlowStyles,
	LoadingOverlay,
	minimapNodeColor,
	minimapNodeStroke,
	NoPeersOverlay,
	resolveEntityChip,
	resolveRelationChip,
	TypeChipGroup,
} from "./lineage-chrome";
import { edgeTypes } from "./lineage-edges";
import { flowRoleOf, layoutLineage } from "./lineage-layout";
import { nodeTypes } from "./lineage-nodes";
import type {
	ActorKind,
	AssetKind,
	CollapsedNodeData,
	Direction,
	RuleSeverity,
} from "./lineage-types";
import { useFilters } from "./use-lineage-filters";

export type { ActorKind, AssetKind, LineageFilters, RuleSeverity } from "./lineage-types";

/**
 * Lineage graph — shows the asset at the center, with upstream (incoming
 * relations), downstream (outgoing), and attached rules as floating nodes.
 *
 * Built on @xyflow/react so the user gets pan/zoom/fit for free. Custom node
 * components keep the look consistent with the rest of the shadcn cards.
 */

export interface LineageGraphProps {
	entityUid: string;
	entityName: string;
	/** What kind of node sits at the centre. Drives the center shape, the
	 *  colour palette, and whether we fetch rule attachments. */
	entityKind: "asset" | "actor" | "rule";
	/** The entity's sub-type — asset type, actor type, or rule severity. */
	entityType: AssetKind | ActorKind | RuleSeverity;
}

/** Module-level stable fallback so `data?.all ?? EMPTY_RELATIONS` keeps a
 *  constant array reference across renders and doesn't bust downstream
 *  memoisation. */
const EMPTY_RELATIONS: DirectedRelation[] = [];

export function LineageGraph(props: LineageGraphProps) {
	return (
		<ReactFlowProvider>
			<LineageGraphInner {...props} />
		</ReactFlowProvider>
	);
}

function LineageGraphInner({
	entityUid,
	entityName,
	entityKind,
	entityType,
}: LineageGraphProps) {
	const [filters, setFilters] = useFilters();
	const relationsQuery = useEntityRelations(entityUid);
	// Actors can't have applied rules — skip the query to avoid a 404.
	const rulesQuery = useAssetRules(entityKind === "asset" ? entityUid : "");
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
		() => new Set(),
	);

	// Don't render the graph at all until the initial fetches settle —
	// otherwise the centre node pops in, then peers + edges, then rules
	// one after another, which reads as a glitchy half-loaded graph.
	const isInitialLoading =
		relationsQuery.isLoading ||
		(entityKind === "asset" && rulesQuery.isLoading);

	// All relations the entity could show, before any user filter is
	// applied. Memoised so a missing-data fallback (`?? []`) doesn't spin a
	// fresh array reference on every render — that would cascade through
	// `filtered` → `graph` → `useNodesState` and blow the update-depth stack.
	const allRelations = useMemo(
		() => relationsQuery.data?.all ?? EMPTY_RELATIONS,
		[relationsQuery.data?.all],
	);

	// Unique entity sub-types and relation types present — used to render
	// one filter chip per type.
	const availableEntityTypes = useMemo(() => {
		const s = new Set<string>();
		for (const r of allRelations) s.add(r.other.type);
		return [...s].sort();
	}, [allRelations]);
	const availableRelationTypes = useMemo(() => {
		const s = new Set<string>();
		for (const r of allRelations) s.add(r.relation.type);
		return [...s].sort();
	}, [allRelations]);

	const filtered = useMemo(() => {
		// Classify once per relation — flow-role decides which column the
		// counterparty sits in, not the stored edge direction. Peers
		// (OWNS / MEMBER_OF / APPLIES_TO) float in a band above the centre
		// instead of leaking into the upstream/downstream columns.
		const shown = allRelations.filter((r) => {
			if (filters.hiddenEntityTypes.has(r.other.type)) return false;
			if (filters.hiddenRelationTypes.has(r.relation.type)) return false;
			const role = flowRoleOf(r);
			// Direction tab scopes only the data-flow columns. Peers always
			// stay visible — they aren't part of the upstream/downstream
			// story, so hiding them under a direction filter would just make
			// the graph feel broken.
			if (filters.direction === "upstream" && role === "downstream")
				return false;
			if (filters.direction === "downstream" && role === "upstream")
				return false;
			return true;
		});
		return {
			upstream: shown.filter((r) => flowRoleOf(r) === "upstream"),
			downstream: shown.filter((r) => flowRoleOf(r) === "downstream"),
			peers: shown.filter((r) => flowRoleOf(r) === "peer"),
			rules: filters.rules ? (rulesQuery.data?.items ?? []) : [],
		};
	}, [
		allRelations,
		rulesQuery.data?.items,
		filters.hiddenEntityTypes,
		filters.hiddenRelationTypes,
		filters.rules,
		filters.direction,
	]);

	const graph = useMemo(
		() =>
			layoutLineage({
				entityUid,
				entityName,
				entityKind,
				entityType,
				upstream: filtered.upstream,
				downstream: filtered.downstream,
				peers: filtered.peers,
				rules: filtered.rules,
				expandedGroups,
			}),
		[
			entityUid,
			entityName,
			entityKind,
			entityType,
			filtered.upstream,
			filtered.downstream,
			filtered.peers,
			filtered.rules,
			expandedGroups,
		],
	);

	const onNodeClick = useCallback(
		(_e: React.MouseEvent, node: Node) => {
			if (node.type !== "collapsed") return;
			const key = (node.data as CollapsedNodeData | undefined)?.groupKey;
			if (!key) return;
			setExpandedGroups((prev) => {
				const next = new Set(prev);
				next.add(key);
				return next;
			});
		},
		[],
	);

	const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

	useEffect(() => {
		setNodes(graph.nodes);
		setEdges(graph.edges);
	}, [graph.nodes, graph.edges, setNodes, setEdges]);

	const hasAnything =
		filtered.upstream.length +
			filtered.downstream.length +
			filtered.rules.length >
		0;

	return (
		<div className="flex flex-1 flex-col gap-3 min-h-0">
			{/* Filters — one chip per entity sub-type and relation type that
			    actually appears on this entity. Click a chip to hide/show that
			    type; click again to bring it back. Direction lives in its own
			    tab strip, and the centre-asset rule-stickers get their own
			    quick toggle. */}
			<div className="flex flex-col gap-2 text-sm">
				<div className="flex flex-wrap items-center gap-x-6 gap-y-2">
					{availableEntityTypes.length > 0 && (
						<TypeChipGroup
							label="Entities"
							types={availableEntityTypes}
							hidden={filters.hiddenEntityTypes}
							resolve={(t) => resolveEntityChip(t)}
							onToggle={(t) => {
								const next = new Set(filters.hiddenEntityTypes);
								if (next.has(t)) next.delete(t);
								else next.add(t);
								setFilters({ ...filters, hiddenEntityTypes: next });
							}}
						/>
					)}
					{availableRelationTypes.length > 0 && (
						<TypeChipGroup
							label="Relations"
							types={availableRelationTypes}
							hidden={filters.hiddenRelationTypes}
							resolve={(t) => resolveRelationChip(t)}
							onToggle={(t) => {
								const next = new Set(filters.hiddenRelationTypes);
								if (next.has(t)) next.delete(t);
								else next.add(t);
								setFilters({ ...filters, hiddenRelationTypes: next });
							}}
						/>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<Tabs
						value={filters.direction}
						onValueChange={(v) =>
							setFilters({ ...filters, direction: v as Direction })
						}
					>
						<TabsList className="h-8">
							<TabsTrigger value="upstream" className="text-xs h-7">
								Upstream
							</TabsTrigger>
							<TabsTrigger value="both" className="text-xs h-7">
								Both
							</TabsTrigger>
							<TabsTrigger value="downstream" className="text-xs h-7">
								Downstream
							</TabsTrigger>
						</TabsList>
					</Tabs>
					{entityKind === "asset" && (
						<FilterToggle
							id="f-rules"
							label="Rules"
							checked={filters.rules}
							onChange={(v) => setFilters({ ...filters, rules: v })}
						/>
					)}
					<div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
						<Database className="size-3.5" />
						<span>
							{filtered.upstream.length + filtered.downstream.length} relation
							{filtered.upstream.length + filtered.downstream.length === 1
								? ""
								: "s"}
							{filtered.rules.length > 0
								? ` · ${filtered.rules.length} rule${filtered.rules.length === 1 ? "" : "s"}`
								: ""}
						</span>
					</div>
				</div>
			</div>

			{/* Graph canvas. Until the initial relations + rules fetches
			    complete we show only the spinner — otherwise the user would
			    watch the centre node pop in, then edges, then rules, which
			    reads as a glitchy half-loaded graph.
			    Fixed `h-[60vh]` instead of `flex-1` because the page's
			    `<main>` uses `min-h-[…]` (PR #19, to allow page-level
			    scroll on tall wizards). With an unbounded parent height
			    `flex-1` can't grow, so ReactFlow's ResizeObserver reads
			    a 0-height container and refuses to render — that's the
			    "React Flow parent container needs a width and a height"
			    warning. Pinning to a viewport-relative height decouples
			    the canvas from the flex chain entirely and stays
			    responsive without breaking the page's scroll model. */}
			<div className="h-[60vh] min-h-[320px] w-full rounded-lg border border-primary/15 bg-background/20 relative overflow-hidden">
				{isInitialLoading ? (
					<LoadingOverlay />
				) : (
					<>
						<ReactFlow
							nodes={nodes}
							edges={edges}
							onNodesChange={onNodesChange}
							onEdgesChange={onEdgesChange}
							onNodeClick={onNodeClick}
							nodeTypes={nodeTypes}
							edgeTypes={edgeTypes}
							fitView
							fitViewOptions={{ padding: 0.2 }}
							proOptions={{ hideAttribution: true }}
							className="bg-transparent"
							minZoom={0.3}
							maxZoom={2}
						>
							<LineageFlowStyles />
							<Background
								variant={BackgroundVariant.Dots}
								gap={16}
								size={1}
								className="opacity-30"
							/>
							<Controls
								showInteractive={false}
								className="!bg-card/80 !border !border-primary/20 !rounded-md !shadow-md !overflow-hidden"
							/>
							<MiniMap
								pannable
								zoomable
								className="!bg-card/80 !border !border-primary/20 !rounded-md"
								maskColor="oklch(0 0 0 / 0.35)"
								nodeColor={minimapNodeColor}
								nodeStrokeColor={minimapNodeStroke}
								nodeBorderRadius={6}
								nodeStrokeWidth={2}
							/>
						</ReactFlow>
						{!hasAnything && <NoPeersOverlay />}
					</>
				)}
			</div>

			<Legend />
		</div>
	);
}
