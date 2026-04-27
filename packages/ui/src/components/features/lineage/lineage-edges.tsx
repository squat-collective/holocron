"use client";

import {
	BaseEdge,
	type Edge,
	EdgeLabelRenderer,
	type EdgeProps,
	type EdgeTypes,
	getBezierPath,
} from "@xyflow/react";
import { getRelationStyle } from "@/lib/entity-styles";
import { getRelationTypeIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { RelationEdgeData } from "./lineage-types";

function RelationEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data,
	markerEnd,
	style,
}: EdgeProps<Edge<RelationEdgeData>>) {
	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});
	const relationType = data?.relationType ?? "";
	const Icon = getRelationTypeIcon(relationType);
	const style$ = getRelationStyle(relationType);
	const isRule = data?.kind === "rule";

	return (
		<>
			<BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
			<EdgeLabelRenderer>
				<div
					// `nodrag nopan` are well-known xyflow classes that stop pan/zoom
					// from hijacking the pointer when you hover over the badge.
					className={cn(
						"nodrag nopan absolute pointer-events-auto",
						"flex items-center justify-center rounded-full border shadow-sm",
						"size-6",
						isRule
							? "bg-muted text-muted-foreground border-border"
							: cn(style$.bg, style$.border, style$.text),
					)}
					style={{
						transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
					}}
					title={style$.label}
					aria-label={style$.label}
				>
					<Icon className="size-3.5" />
				</div>
			</EdgeLabelRenderer>
		</>
	);
}

export const edgeTypes: EdgeTypes = {
	relation: RelationEdge,
};
