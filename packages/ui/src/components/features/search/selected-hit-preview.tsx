"use client";

import { ArrowRight, CalendarClock, MapPin } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { LineageGraph } from "@/components/features/lineage/lineage-graph";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActor } from "@/hooks/use-actors";
import { useAsset } from "@/hooks/use-asset";
import { type CatalogHit, hitHref, hitKey } from "@/hooks/use-catalog-search";
import { actorStyles, assetStyles, getEntityStyle, getSeverityStyle } from "@/lib/entity-styles";
import {
	getActorTypeIcon,
	getAssetTypeIcon,
	getContainerTypeIcon,
	PiiIcon,
	RuleIcon,
	SchemaFieldIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Right-pane preview of the currently-selected search hit.
 *
 * - Asset / container / field → summary + asset's full lineage graph
 *   (lineage centered on the parent asset so you see every upstream,
 *   downstream, and attached rule in one place).
 * - Actor → summary + actor-centric relations graph.
 * - Rule → summary card; no lineage graph (rules attach to assets rather
 *   than participating in asset↔asset lineage).
 */

interface Props {
	hit: CatalogHit;
}

// Memoized by hit identity. Typing in the search box re-renders the parent
// but the hit reference swaps only when the user arrow-keys to a different
// result. Without this memo every keystroke would unmount the preview —
// and with it the LineageGraph + its underlying shared fetches.
export const SelectedHitPreview = memo(
	function SelectedHitPreview({ hit }: Props) {
		switch (hit.kind) {
			case "asset":
				return <AssetPreview hit={hit} />;
			case "container":
			case "field":
				return <SubAssetPreview hit={hit} />;
			case "actor":
				return <ActorPreview hit={hit} />;
			case "rule":
				return <RulePreview hit={hit} />;
		}
	},
	(prev, next) => hitKey(prev.hit) === hitKey(next.hit),
);

/* ------------------------------------------------------------------ */
/* Asset preview                                                       */
/* ------------------------------------------------------------------ */

function AssetPreview({ hit }: { hit: Extract<CatalogHit, { kind: "asset" }> }) {
	const { data: full } = useAsset(hit.uid);
	const style = getEntityStyle(hit.type);
	const Icon = getAssetTypeIcon(hit.type);
	return (
		<PreviewShell>
			<PreviewHeader
				icon={<Icon className={cn("size-6", style.text)} />}
				title={hit.name}
				badges={
					<>
						<Badge variant="outline" className={assetStyles[hit.type].badge}>
							{hit.type}
						</Badge>
						<Badge variant="outline" className="text-muted-foreground">
							{hit.status}
						</Badge>
					</>
				}
				href={`/assets/${hit.uid}`}
			/>
			{(hit.description || full?.location) && (
				<PreviewFields>
					{hit.description && <Field label="Description" value={hit.description} />}
					{full?.location && (
						<Field
							label="Location"
							icon={<MapPin className="size-3" />}
							value={
								<code className="font-mono text-xs bg-muted rounded px-1 py-0.5 break-all">
									{full.location}
								</code>
							}
						/>
					)}
					{full?.updated_at && (
						<Field
							label="Last updated"
							icon={<CalendarClock className="size-3" />}
							value={new Date(full.updated_at).toLocaleDateString()}
						/>
					)}
				</PreviewFields>
			)}
			<GraphPanel>
				<LineageGraph
					entityUid={hit.uid}
					entityName={hit.name}
					entityKind="asset"
					entityType={hit.type}
				/>
			</GraphPanel>
		</PreviewShell>
	);
}

/* ------------------------------------------------------------------ */
/* Container / field preview — parent's asset lineage                  */
/* ------------------------------------------------------------------ */

function SubAssetPreview({ hit }: { hit: Extract<CatalogHit, { kind: "container" | "field" }> }) {
	const { data: parent } = useAsset(hit.asset_uid);
	const Icon =
		hit.kind === "container" ? getContainerTypeIcon(hit.container_type) : SchemaFieldIcon;
	return (
		<PreviewShell>
			<PreviewHeader
				icon={<Icon className="size-6 text-muted-foreground" />}
				title={hit.name}
				subtitle={
					<>
						Inside <strong className="text-foreground">{hit.asset_name}</strong>
					</>
				}
				badges={
					<>
						<Badge variant="outline" className="text-muted-foreground">
							{hit.kind === "container"
								? (hit.container_type ?? "container")
								: (hit.data_type ?? "field")}
						</Badge>
						{hit.kind === "field" && hit.pii && (
							<Badge
								variant="outline"
								className="gap-1 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
							>
								<PiiIcon className="size-2.5" /> PII
							</Badge>
						)}
					</>
				}
				href={hitHref(hit)}
			/>
			<PreviewFields>
				<Field
					label="Path"
					value={
						<code className="font-mono text-xs bg-muted rounded px-1 py-0.5 break-all">
							{hit.path}
						</code>
					}
				/>
				{hit.description && <Field label="Description" value={hit.description} />}
			</PreviewFields>
			<GraphPanel>
				{parent && (
					<LineageGraph
						entityUid={parent.uid}
						entityName={parent.name}
						entityKind="asset"
						entityType={parent.type}
					/>
				)}
			</GraphPanel>
		</PreviewShell>
	);
}

/* ------------------------------------------------------------------ */
/* Actor preview                                                       */
/* ------------------------------------------------------------------ */

function ActorPreview({ hit }: { hit: Extract<CatalogHit, { kind: "actor" }> }) {
	const { data: full } = useActor(hit.uid);
	const style = getEntityStyle(hit.type);
	const Icon = getActorTypeIcon(hit.type);
	return (
		<PreviewShell>
			<PreviewHeader
				icon={<Icon className={cn("size-6", style.text)} />}
				title={hit.name}
				badges={
					<Badge variant="outline" className={actorStyles[hit.type].badge}>
						{hit.type}
					</Badge>
				}
				href={`/actors/${hit.uid}`}
			/>
			{(hit.email || hit.description || full?.description) && (
				<PreviewFields>
					{hit.email && <Field label="Email" value={hit.email} />}
					{(hit.description ?? full?.description) && (
						<Field label="Description" value={hit.description ?? full?.description ?? ""} />
					)}
				</PreviewFields>
			)}
			<GraphPanel>
				<LineageGraph
					entityUid={hit.uid}
					entityName={hit.name}
					entityKind="actor"
					entityType={hit.type}
				/>
			</GraphPanel>
		</PreviewShell>
	);
}

/* ------------------------------------------------------------------ */
/* Rule preview                                                        */
/* ------------------------------------------------------------------ */

function RulePreview({ hit }: { hit: Extract<CatalogHit, { kind: "rule" }> }) {
	const sev = getSeverityStyle(hit.severity);
	return (
		<PreviewShell>
			<PreviewHeader
				icon={<RuleIcon className={cn("size-6", sev.text)} />}
				title={hit.name}
				badges={
					<>
						<Badge variant="outline" className={sev.badge}>
							{hit.severity}
						</Badge>
						{hit.category && (
							<Badge variant="outline" className="text-muted-foreground">
								{hit.category}
							</Badge>
						)}
					</>
				}
				href={`/rules/${hit.uid}`}
			/>
			<PreviewFields>
				<Field label="Description" value={hit.description} />
			</PreviewFields>
			<GraphPanel>
				<LineageGraph
					entityUid={hit.uid}
					entityName={hit.name}
					entityKind="rule"
					entityType={hit.severity}
				/>
			</GraphPanel>
		</PreviewShell>
	);
}

/* ------------------------------------------------------------------ */
/* Shared shell + small atoms                                          */
/* ------------------------------------------------------------------ */

function PreviewShell({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-col gap-3 h-full min-h-0">{children}</div>;
}

function PreviewHeader({
	icon,
	title,
	subtitle,
	badges,
	href,
}: {
	icon: React.ReactNode;
	title: string;
	subtitle?: React.ReactNode;
	badges?: React.ReactNode;
	href: string;
}) {
	return (
		<Card className="shrink-0 !py-3">
			<CardHeader className="!pb-0">
				<div className="flex items-start gap-3 flex-wrap">
					<div className="flex items-center gap-2 min-w-0 flex-1">
						<span className="shrink-0">{icon}</span>
						<div className="min-w-0">
							<CardTitle className="text-lg truncate">{title}</CardTitle>
							{subtitle && (
								<CardDescription className="text-xs mt-0.5 truncate">{subtitle}</CardDescription>
							)}
						</div>
					</div>
					<div className="flex gap-1.5 items-start flex-wrap">{badges}</div>
					<Link
						href={href}
						className="inline-flex items-center gap-1 text-xs text-primary hover:underline self-center"
					>
						Open
						<ArrowRight className="size-3" />
					</Link>
				</div>
			</CardHeader>
		</Card>
	);
}

function PreviewFields({ children }: { children: React.ReactNode }) {
	return (
		<Card className="shrink-0 !py-3">
			<CardContent className="!px-4">
				<dl className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">{children}</dl>
			</CardContent>
		</Card>
	);
}

function Field({
	label,
	icon,
	value,
}: {
	label: string;
	icon?: React.ReactNode;
	value: React.ReactNode;
}) {
	return (
		<div className="min-w-0">
			<dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
				{icon}
				{label}
			</dt>
			<dd className="text-sm mt-0.5 break-words">{value}</dd>
		</div>
	);
}

function GraphPanel({ children }: { children: React.ReactNode }) {
	return (
		<Card className="flex-1 flex flex-col min-h-0 !gap-2 !py-3">
			<CardContent className="flex-1 flex flex-col min-h-0 !px-3">{children}</CardContent>
		</Card>
	);
}
