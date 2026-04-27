"use client";

import { memo } from "react";
import type { CatalogHit } from "@/hooks/use-catalog-search";
import { actorStyles, assetStyles, getSeverityStyle } from "@/lib/entity-styles";
import {
	getActorTypeIcon,
	getAssetTypeIcon,
	getContainerTypeIcon,
	PiiIcon,
	RuleIcon,
	SchemaFieldIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

interface HitRowProps {
	hit: CatalogHit;
	index: number;
	selected: boolean;
	onClick: () => void;
	onHover: () => void;
}

/**
 * Per-kind styling for a hit row — maps every entity type back to the
 * same color tokens used on detail pages, badges, lineage edges, and
 * the graph. Returns `null` when a kind doesn't carry its own color.
 */
function hitStyle(hit: CatalogHit): {
	text: string;
	border: string;
	bg: string;
	badge: string;
} | null {
	switch (hit.kind) {
		case "asset":
			return assetStyles[hit.type];
		case "actor":
			return actorStyles[hit.type];
		case "rule":
			return getSeverityStyle(hit.severity);
		case "container":
		case "field":
			return null;
	}
}

/**
 * One row in a search results list. Memoized so the list doesn't re-render
 * unchanged rows on every keystroke (the hits array is a new ref each time
 * but per-hit identity + selection state are stable).
 */
export const HitRow = memo(function HitRow({
	hit,
	index,
	selected,
	onClick,
	onHover,
}: HitRowProps) {
	const style = hitStyle(hit);
	return (
		<button
			type="button"
			data-hit-index={index}
			onClick={onClick}
			onMouseEnter={onHover}
			className={cn(
				"w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
				"border-l-2",
				selected
					? cn(style?.border ?? "border-primary", style?.bg ?? "bg-primary/10")
					: cn(
							style?.border
								? `${style.border} opacity-60 hover:opacity-100`
								: "border-transparent",
							"hover:bg-muted/30",
						),
			)}
		>
			<HitIcon hit={hit} />
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium text-sm">{hit.name}</span>
					{hit.kind === "field" && hit.pii && (
						<span className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200">
							<PiiIcon className="size-2.5" /> PII
						</span>
					)}
				</div>
				<HitSubtitle hit={hit} />
			</div>
			<HitMeta hit={hit} />
		</button>
	);
});

function HitIcon({ hit }: { hit: CatalogHit }) {
	switch (hit.kind) {
		case "asset": {
			const Icon = getAssetTypeIcon(hit.type);
			return <Icon className={cn("size-4 shrink-0", assetStyles[hit.type].text)} />;
		}
		case "actor": {
			const Icon = getActorTypeIcon(hit.type);
			return <Icon className={cn("size-4 shrink-0", actorStyles[hit.type].text)} />;
		}
		case "container": {
			const Icon = getContainerTypeIcon(hit.container_type);
			return <Icon className="size-4 shrink-0 text-muted-foreground" />;
		}
		case "field":
			return <SchemaFieldIcon className="size-4 shrink-0 text-muted-foreground" />;
		case "rule": {
			const sev = getSeverityStyle(hit.severity);
			return <RuleIcon className={cn("size-4 shrink-0", sev.text)} />;
		}
	}
}

function HitSubtitle({ hit }: { hit: CatalogHit }) {
	let text: string | null = null;
	switch (hit.kind) {
		case "asset":
			text = hit.description;
			break;
		case "actor":
			text = hit.email ?? hit.description ?? null;
			break;
		case "rule":
			text = hit.description;
			break;
		case "container":
		case "field":
			text = `${hit.asset_name} · ${hit.path}`;
			break;
	}
	if (!text) return null;
	return <div className="truncate text-xs text-muted-foreground">{text}</div>;
}

function HitMeta({ hit }: { hit: CatalogHit }) {
	const chipBase =
		"ml-auto text-[10px] uppercase tracking-wide rounded-full border px-1.5 py-0.5";
	switch (hit.kind) {
		case "asset":
			return <span className={cn(chipBase, assetStyles[hit.type].badge)}>{hit.type}</span>;
		case "actor":
			return <span className={cn(chipBase, actorStyles[hit.type].badge)}>{hit.type}</span>;
		case "rule":
			return (
				<span className={cn(chipBase, getSeverityStyle(hit.severity).badge)}>
					{hit.severity}
				</span>
			);
		case "container":
			return hit.container_type ? (
				<span className={cn(chipBase, "text-muted-foreground border-border/60")}>
					{hit.container_type}
				</span>
			) : null;
		case "field":
			return hit.data_type ? (
				<span className="ml-auto font-mono text-[10px] text-muted-foreground">
					{hit.data_type}
				</span>
			) : null;
	}
}
