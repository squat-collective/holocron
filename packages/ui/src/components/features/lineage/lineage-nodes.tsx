"use client";

import {
	Handle,
	type Node,
	type NodeProps,
	type NodeTypes,
	Position,
} from "@xyflow/react";
import Link from "next/link";
import {
	getEntityStyle,
	getRelationStyle,
	getSeverityStyle,
} from "@/lib/entity-styles";
import { getRelationTypeIcon, RuleIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type {
	ActorNodeData,
	AssetNodeData,
	CollapsedNodeData,
	RuleCenterNodeData,
	RuleNodeData,
} from "./lineage-types";

function EntityNode({ data }: NodeProps<Node<AssetNodeData>>) {
	const Icon = data.icon;
	const style = data.sub ? getEntityStyle(data.sub) : null;
	const showTarget =
		data.handleMode === "target-only" || data.handleMode === "both";
	const showSource =
		data.handleMode === "source-only" || data.handleMode === "both";
	const showBottomTarget = data.handleMode === "target-bottom";
	const showTopSource = !!data.hasPeers;
	const showCentreBottomTarget = !!data.hasRules;

	return (
		<Link
			href={
				data.entityType === "asset"
					? `/assets/${data.uid}`
					: `/actors/${data.uid}`
			}
			className={cn(
				"group flex min-w-[200px] max-w-[240px] flex-col gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm transition-all hover:shadow-md",
				style?.border,
				data.isCenter &&
					// The main node reads as a star — gold border + gentle glow.
					"!border-star-gold/70 ring-2 ring-star-gold/40 shadow-[0_0_24px_-6px_var(--star-gold)]",
			)}
		>
			{showTarget && (
				<Handle
					id="flow-in"
					type="target"
					position={Position.Left}
					className="!bg-primary/60 !border-primary"
				/>
			)}
			{showBottomTarget && (
				<Handle
					type="target"
					position={Position.Bottom}
					className="!bg-primary/60 !border-primary"
				/>
			)}
			{showTopSource && (
				<Handle
					id="peer-top"
					type="source"
					position={Position.Top}
					className="!bg-primary/60 !border-primary"
				/>
			)}
			{showCentreBottomTarget && (
				<Handle
					id="rule-bottom"
					type="target"
					position={Position.Bottom}
					className="!bg-primary/60 !border-primary"
				/>
			)}
			<div className="flex items-center gap-2">
				<Icon
					className={cn(
						"size-4 shrink-0",
						data.isCenter
							? "text-star-gold"
							: (style?.text ?? "text-primary"),
					)}
				/>
				<div className="flex-1 min-w-0">
					<div
						className={cn(
							"font-medium truncate",
							data.isCenter && "text-star-gold",
						)}
					>
						{data.label}
					</div>
					{data.sub && (
						<div className="text-[10px] text-muted-foreground truncate">
							{data.sub}
						</div>
					)}
				</div>
			</div>

			{showSource && (
				<Handle
					id="flow-out"
					type="source"
					position={Position.Right}
					className="!bg-primary/60 !border-primary"
				/>
			)}
		</Link>
	);
}

/** Round avatar-style node for people/teams. Icon sits in a coloured circle,
 *  name underneath. Much lighter feel than the rectangular asset card. */
function ActorNode({ data }: NodeProps<Node<ActorNodeData>>) {
	const Icon = data.icon;
	const style = getEntityStyle(data.sub);
	const showTarget =
		data.handleMode === "target-only" || data.handleMode === "both";
	const showSource =
		data.handleMode === "source-only" || data.handleMode === "both";
	const showBottomTarget = data.handleMode === "target-bottom";
	const showTopSource = !!data.hasPeers;
	const showCentreBottomTarget = !!data.hasRules;
	return (
		<Link
			href={`/actors/${data.uid}`}
			className={cn(
				"flex flex-col items-center gap-1 min-w-[96px] max-w-[160px] group",
				data.isCenter && "scale-[1.1]",
			)}
		>
			{showTarget && (
				<Handle
					id="flow-in"
					type="target"
					position={Position.Left}
					className="!bg-primary/60 !border-primary !top-6"
				/>
			)}
			{showBottomTarget && (
				<Handle
					type="target"
					position={Position.Bottom}
					className="!bg-primary/60 !border-primary"
				/>
			)}
			{showTopSource && (
				<Handle
					id="peer-top"
					type="source"
					position={Position.Top}
					className="!bg-primary/60 !border-primary"
				/>
			)}
			{showCentreBottomTarget && (
				<Handle
					id="rule-bottom"
					type="target"
					position={Position.Bottom}
					className="!bg-primary/60 !border-primary"
				/>
			)}
			<div
				className={cn(
					"flex items-center justify-center rounded-full border-2 bg-card shadow-sm transition-all group-hover:shadow-md",
					data.isCenter ? "size-14" : "size-11",
					data.isCenter
						? "!border-star-gold ring-2 ring-star-gold/40 shadow-[0_0_24px_-6px_var(--star-gold)]"
						: style.border,
				)}
			>
				<Icon
					className={cn(
						data.isCenter ? "size-6" : "size-5",
						data.isCenter ? "text-star-gold" : style.text,
					)}
				/>
			</div>
			<div
				className={cn(
					"font-medium text-center leading-tight truncate max-w-full",
					data.isCenter ? "text-sm text-star-gold" : "text-[11px]",
				)}
			>
				{data.label}
			</div>
			<div className="text-[9px] text-muted-foreground">{data.sub}</div>
			{showSource && (
				<Handle
					id="flow-out"
					type="source"
					position={Position.Right}
					className="!bg-primary/60 !border-primary !top-6"
				/>
			)}
		</Link>
	);
}

/** `+N more` chip for when a peer group exceeds the soft cap. Clicking the
 *  chip expands its group — handled via `onNodeClick` upstream. */
function CollapsedNode({ data }: NodeProps<Node<CollapsedNodeData>>) {
	const relStyle = getRelationStyle(data.relationType);
	const Icon = getRelationTypeIcon(data.relationType);
	const showTarget =
		data.handleMode === "target-only" || data.handleMode === "both";
	const showSource =
		data.handleMode === "source-only" || data.handleMode === "both";
	const showBottomTarget = data.handleMode === "target-bottom";
	const showTopSource = data.handleMode === "source-top";
	return (
		<div
			className={cn(
				"flex items-center gap-1.5 rounded-full border-2 border-dashed bg-card px-3 py-1.5 text-xs shadow-sm cursor-pointer hover:shadow-md transition-all",
				relStyle.border,
			)}
			title={`Show ${data.count} more`}
		>
			{showTarget && (
				<Handle
					id="flow-in"
					type="target"
					position={Position.Left}
					className="!bg-muted-foreground/60 !border-muted-foreground"
				/>
			)}
			{showBottomTarget && (
				<Handle
					type="target"
					position={Position.Bottom}
					className="!bg-muted-foreground/60 !border-muted-foreground"
				/>
			)}
			{showTopSource && (
				<Handle
					type="source"
					position={Position.Top}
					className="!bg-muted-foreground/60 !border-muted-foreground"
				/>
			)}
			<Icon className={cn("size-3.5", relStyle.text)} />
			<span className="font-medium">+{data.count} more</span>
			{showSource && (
				<Handle
					id="flow-out"
					type="source"
					position={Position.Right}
					className="!bg-muted-foreground/60 !border-muted-foreground"
				/>
			)}
		</div>
	);
}

function RuleCenterNode({ data }: NodeProps<Node<RuleCenterNodeData>>) {
	const sev = getSeverityStyle(data.severity);
	const showTarget =
		data.handleMode === "target-only" || data.handleMode === "both";
	const showSource =
		data.handleMode === "source-only" || data.handleMode === "both";
	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm min-w-[220px] max-w-[260px]",
				"!border-star-gold ring-2 ring-star-gold/40 shadow-[0_0_24px_-6px_var(--star-gold)]",
			)}
		>
			{showTarget && (
				<Handle
					id="flow-in"
					type="target"
					position={Position.Left}
					className="!bg-primary/60 !border-primary"
				/>
			)}
			<RuleIcon className="size-4 shrink-0 text-star-gold" />
			<div className="flex-1 min-w-0">
				<div className="font-medium truncate text-star-gold">{data.label}</div>
				<div className={cn("text-[10px] truncate capitalize", sev.text)}>
					{data.severity}
				</div>
			</div>
			{showSource && (
				<Handle
					id="flow-out"
					type="source"
					position={Position.Right}
					className="!bg-primary/60 !border-primary"
				/>
			)}
		</div>
	);
}

/** Rule peer-node that sits in the band below the centre. Severity tint
 *  on the border + enforcement sub-label give at-a-glance context without
 *  needing a tooltip. Top source handle so the APPLIES_TO arrow rises
 *  into the centre's bottom. */
function RuleNode({ data }: NodeProps<Node<RuleNodeData>>) {
	const sev = getSeverityStyle(data.severity);
	const showTopSource = data.handleMode === "source-top";
	return (
		<Link
			href={`/rules/${data.uid}`}
			className={cn(
				"group flex min-w-[180px] max-w-[220px] flex-col gap-0.5 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm transition-all hover:shadow-md",
				sev.border,
			)}
			title={data.label}
		>
			{showTopSource && (
				<Handle
					type="source"
					position={Position.Top}
					className="!bg-primary/60 !border-primary"
				/>
			)}
			<div className="flex items-center gap-2">
				<RuleIcon className={cn("size-4 shrink-0", sev.text)} />
				<div className="flex-1 min-w-0">
					<div className="font-medium truncate">{data.label}</div>
					<div
						className={cn(
							"text-[10px] truncate capitalize",
							sev.text,
						)}
					>
						{data.severity}
						{data.enforcement ? ` · ${data.enforcement}` : ""}
					</div>
				</div>
			</div>
		</Link>
	);
}

export const nodeTypes: NodeTypes = {
	entity: EntityNode,
	actor: ActorNode,
	collapsed: CollapsedNode,
	rule_center: RuleCenterNode,
	rule: RuleNode,
};
