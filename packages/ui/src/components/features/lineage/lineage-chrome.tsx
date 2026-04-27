"use client";

import type { Node } from "@xyflow/react";
import { FrownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { GalaxySpinner } from "@/components/ui/galaxy-spinner";
import { Label } from "@/components/ui/label";
import {
	getEntityStyle,
	getRelationStyle,
	relationStyles,
} from "@/lib/entity-styles";
import { getRelationTypeIcon, type LucideIcon, RuleIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type {
	ActorNodeData,
	AssetNodeData,
	CollapsedNodeData,
} from "./lineage-types";

export function FilterToggle({
	id,
	label,
	checked,
	onChange,
}: {
	id: string;
	label: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(v) => onChange(v === true)}
			/>
			<Label htmlFor={id} className="cursor-pointer text-sm">
				{label}
			</Label>
		</div>
	);
}

/** Resolves a sub-type into the bits needed by TypeChip: a label, an icon,
 *  and the palette classes (bg/border/text) for the chip pill. */
interface ChipStyle {
	label: string;
	icon: LucideIcon;
	bg: string;
	border: string;
	text: string;
}

export function resolveEntityChip(type: string): ChipStyle {
	const style = getEntityStyle(type);
	return {
		label: style.label,
		icon: style.icon,
		bg: style.bg,
		border: style.border,
		text: style.text,
	};
}

export function resolveRelationChip(type: string): ChipStyle {
	const style = getRelationStyle(type);
	return {
		label: style.label,
		icon: getRelationTypeIcon(type),
		bg: style.bg,
		border: style.border,
		text: style.text,
	};
}

/** Row of click-to-toggle pills for filtering peers by sub-type. A hidden
 *  chip reads as muted/outlined; click to bring it back. */
export function TypeChipGroup({
	label,
	types,
	hidden,
	resolve,
	onToggle,
}: {
	label: string;
	types: string[];
	hidden: Set<string>;
	resolve: (t: string) => ChipStyle;
	onToggle: (t: string) => void;
}) {
	return (
		<div className="flex items-center gap-1.5 flex-wrap">
			<span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mr-1">
				{label}
			</span>
			{types.map((t) => {
				const s = resolve(t);
				const off = hidden.has(t);
				const Icon = s.icon;
				return (
					<button
						key={t}
						type="button"
						onClick={() => onToggle(t)}
						className={cn(
							"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all",
							off
								? "bg-muted/40 border-border/60 text-muted-foreground opacity-60"
								: cn(s.bg, s.border, s.text),
						)}
						aria-pressed={!off}
						title={off ? `Show ${s.label}` : `Hide ${s.label}`}
					>
						<Icon className="size-3" />
						{s.label}
					</button>
				);
			})}
		</div>
	);
}

/** Covers the graph while the initial relations fetch is in flight. */
export function LoadingOverlay() {
	return (
		<div className="absolute inset-0 flex items-center justify-center bg-background/40">
			<GalaxySpinner size={200} label="Charting lineage…" />
		</div>
	);
}

/** Floats above the graph when there are no peer relations to show — the
 *  centre node is still visible underneath. */
export function NoPeersOverlay() {
	return (
		<div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
			<div className="rounded-full border border-primary/15 bg-card/80 px-3 py-1 text-[11px] text-muted-foreground shadow-sm inline-flex items-center gap-1.5">
				<FrownIcon className="size-3" />
				No connections yet — add some via <kbd className="px-1 rounded border bg-muted text-[10px]">⌘K</kbd>.
			</div>
		</div>
	);
}

/**
 * Legend — derives from `relationStyles` so the edge icon + colour in the
 * graph and the chip in the legend stay in sync. Rules appear as the dotted
 * line they use in the graph.
 */
export function Legend() {
	const entries = (Object.keys(relationStyles) as (keyof typeof relationStyles)[])
		.map((type) => ({
			type,
			icon: getRelationTypeIcon(type),
			style: relationStyles[type],
		}));
	return (
		<div className="flex flex-wrap gap-1.5 text-[10px]">
			{entries.map(({ type, icon: Icon, style }) => (
				<Badge
					key={type}
					variant="outline"
					className={cn(
						"gap-1 font-normal",
						style.bg,
						style.border,
						style.text,
					)}
				>
					<Icon className="size-3" />
					{style.label}
				</Badge>
			))}
			<Badge
				variant="outline"
				className="gap-1 font-normal text-muted-foreground"
			>
				<RuleIcon className="size-3" />
				Rule (dotted)
			</Badge>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* MiniMap colour helpers — mirror the on-canvas palette               */
/* ------------------------------------------------------------------ */

export function minimapNodeColor(node: Node): string {
	if (node.type === "collapsed") return "var(--muted)";
	const d = node.data as AssetNodeData | ActorNodeData | undefined;
	if (d?.isCenter && node.type === "entity") return "var(--star-gold)";
	const sub = d?.sub;
	if (!sub) return "var(--muted)";
	return getEntityStyle(sub).cssVar;
}

export function minimapNodeStroke(node: Node): string {
	if (node.type === "collapsed") {
		const d = node.data as CollapsedNodeData | undefined;
		return d ? getRelationStyle(d.relationType).cssVar : "var(--border)";
	}
	const d = node.data as AssetNodeData | ActorNodeData | undefined;
	if (d?.isCenter && node.type === "entity") return "var(--star-gold)";
	const sub = d?.sub;
	return sub ? getEntityStyle(sub).cssVar : "var(--border)";
}

/**
 * Themes React Flow's built-in Controls + MiniMap so they stop reading as
 * white floating boxes. React Flow exposes each sub-part as a BEM class
 * (`.react-flow__controls-button`, `.react-flow__minimap-mask`, etc.) — we
 * override colours, borders, and hover states via a scoped <style>.
 */
export function LineageFlowStyles() {
	return (
		<style>{`
			/* Controls — card-coloured buttons, clean dividers, primary on hover. */
			.react-flow__controls {
				box-shadow: none !important;
			}
			.react-flow__controls-button {
				background: var(--card) !important;
				color: var(--card-foreground) !important;
				border: none !important;
				border-bottom: 1px solid var(--border) !important;
				width: 28px;
				height: 28px;
				transition: background 120ms ease, color 120ms ease;
			}
			.react-flow__controls-button:last-child { border-bottom: none !important; }
			.react-flow__controls-button:hover {
				background: var(--accent) !important;
				color: var(--primary) !important;
			}
			.react-flow__controls-button svg {
				fill: currentColor;
			}

			/* MiniMap — themed background + viewport mask. */
			.react-flow__minimap {
				background: var(--card) !important;
			}
			.react-flow__minimap-mask {
				fill: oklch(0 0 0 / 0.35) !important;
				stroke: var(--primary) !important;
				stroke-opacity: 0.4;
				stroke-width: 1;
			}
		`}</style>
	);
}
