"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, FrownIcon, Info, ListTree, MapPin, Network, SearchX, Tag } from "lucide-react";
import Link from "next/link";
import { AssetChildrenPanel } from "@/components/features/assets/asset-children-panel";
import { LineageGraph } from "@/components/features/lineage/lineage-graph";
import { RelationsSection } from "@/components/features/relations/relations-section";
import { RulesSection } from "@/components/features/rules/rules-section";
import { DetailTabs } from "@/components/layout/detail-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UnverifiedBadge } from "@/components/ui/unverified-badge";
import { useSetFocusedEntity } from "@/extensions";
import { getSpecKeys } from "@/lib/asset-specs";
import { assetStyles } from "@/lib/entity-styles";
import {
	getAssetTypeIcon,
	getContainerTypeIcon,
	type LucideIcon,
	PiiIcon,
	SchemaFieldIcon,
	SpecIcon,
} from "@/lib/icons";
import type { SchemaNode } from "@/lib/schema-ops";

interface Asset {
	uid: string;
	type: "dataset" | "report" | "process" | "system";
	name: string;
	description: string | null;
	location: string | null;
	status: "active" | "deprecated" | "draft";
	verified?: boolean;
	discovered_by?: string | null;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

interface AssetDetailProps {
	asset: Asset | undefined;
	isLoading: boolean;
	error: Error | null;
}

const typeBadge = (type: "dataset" | "report" | "process" | "system") => assetStyles[type].badge;

// Status uses neutral semantic tokens — outside the "node identity" palette.
const statusColors = {
	active: "bg-enforcement-enforced/15 text-enforcement-enforced border-enforcement-enforced/30",
	deprecated: "bg-enforcement-alerting/15 text-enforcement-alerting border-enforcement-alerting/30",
	draft: "bg-muted text-muted-foreground border-border",
} as const;

const specLabels: Record<string, string> = {
	tool: "Tool",
	format: "Format",
	refresh_schedule: "Refresh Schedule",
	audience: "Target Audience",
	storage: "Storage",
	row_count: "Rows",
	pii: "Contains PII",
	orchestrator: "Orchestrator",
	schedule: "Schedule",
	runtime: "Runtime",
	language: "Language",
	vendor: "Vendor",
	type: "System Type",
	environment: "Environment",
	api_available: "API Available",
};

const specValueLabels: Record<string, Record<string, string>> = {
	tool: {
		excel: "Excel",
		powerbi: "Power BI",
		tableau: "Tableau",
		looker: "Looker",
		metabase: "Metabase",
		jupyter: "Jupyter Notebook",
		other: "Other",
	},
	format: {
		xlsx: "Excel (.xlsx)",
		csv: "CSV",
		pdf: "PDF",
		pbix: "Power BI (.pbix)",
		twbx: "Tableau (.twbx)",
		html: "HTML/Web",
		table: "Database Table",
		view: "Database View",
		parquet: "Parquet",
		json: "JSON",
		avro: "Avro",
		other: "Other",
	},
	refresh_schedule: {
		realtime: "Real-time",
		hourly: "Hourly",
		daily: "Daily",
		weekly: "Weekly",
		monthly: "Monthly",
		manual: "Manual",
		static: "Static",
	},
	storage: {
		postgresql: "PostgreSQL",
		mysql: "MySQL",
		bigquery: "BigQuery",
		snowflake: "Snowflake",
		redshift: "Redshift",
		s3: "S3/Object Storage",
		datalake: "Data Lake",
		other: "Other",
	},
	pii: { yes: "Yes", no: "No", anonymized: "Anonymized", unknown: "Unknown" },
	orchestrator: {
		airflow: "Apache Airflow",
		dagster: "Dagster",
		prefect: "Prefect",
		dbt: "dbt",
		cron: "Cron",
		lambda: "AWS Lambda",
		other: "Other",
	},
	language: {
		python: "Python",
		sql: "SQL",
		scala: "Scala",
		java: "Java",
		shell: "Shell/Bash",
		other: "Other",
	},
	type: {
		saas: "SaaS",
		onprem: "On-Premise",
		hybrid: "Hybrid",
		internal: "Internal/Custom",
	},
	environment: {
		production: "Production",
		staging: "Staging",
		development: "Development",
		test: "Test",
	},
	api_available: { yes: "Yes", no: "No", limited: "Limited" },
};

function getSpecLabel(key: string): string {
	return specLabels[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSpecValueLabel(key: string, value: unknown): string {
	const strValue = String(value);
	return specValueLabels[key]?.[strValue] ?? strValue;
}

function formatDate(dateString: string): string {
	return new Date(dateString).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function AssetDetail({ asset, isLoading, error }: AssetDetailProps) {
	// When the user lands here from a search hit on a container or field, the
	// referrer encodes the schema path as `?schema=Customers/email`. We
	// decode it once on mount and pass to SchemaTreeView so it can scroll
	// the matching row into view + glow it for a moment.
	const [highlightSchemaPath, setHighlightSchemaPath] = useState<string[] | null>(null);
	useEffect(() => {
		if (typeof window === "undefined") return;
		const url = new URL(window.location.href);
		const raw = url.searchParams.get("schema");
		if (!raw) return;
		setHighlightSchemaPath(raw.split("/").map(decodeURIComponent));
	}, []);

	// Publish the focused entity so the asset extension surfaces its
	// commands in ⌘K.
	const focused = useMemo(
		() => (asset ? ({ kind: "asset" as const, entity: asset }) : null),
		[asset],
	);
	useSetFocusedEntity(focused);

	if (isLoading) {
		return <AssetDetailSkeleton />;
	}

	if (error) {
		return (
			<div className="text-center py-12">
				<FrownIcon className="mx-auto size-8 text-destructive mb-2" />
				<p className="text-lg text-destructive">{error.message}</p>
			</div>
		);
	}

	if (!asset) {
		return (
			<div className="text-center py-12">
				<SearchX className="mx-auto size-8 text-muted-foreground mb-2" />
				<p className="text-lg text-muted-foreground">Asset not found</p>
			</div>
		);
	}

	const TypeIcon = getAssetTypeIcon(asset.type);

	const specKeys = getSpecKeys(asset.type);
	const specs: Record<string, unknown> = {};
	const customMetadata: Record<string, unknown> = {};
	const schema = asset.metadata.schema as SchemaNode[] | undefined;

	for (const [key, value] of Object.entries(asset.metadata)) {
		if (key === "schema") continue;
		if (specKeys.includes(key)) specs[key] = value;
		else customMetadata[key] = value;
	}

	const hasSpecs = Object.keys(specs).length > 0;
	const hasCustomMetadata = Object.keys(customMetadata).length > 0;
	const hasSchema = schema && schema.length > 0;

	return (
		<div className="flex-1 flex flex-col gap-3 min-h-0">
			{/* Header — always visible above the tabs. */}
			<Card className="border-primary/20 shrink-0 !py-4">
				<CardHeader className="pb-3">
					<div className="flex items-start justify-between gap-4 flex-wrap">
						<div className="flex items-center gap-3 min-w-0">
							<TypeIcon className="size-10 text-primary shrink-0" />
							<div className="min-w-0">
								<CardTitle className="text-3xl font-bold truncate">{asset.name}</CardTitle>
								<p className="text-muted-foreground text-sm mt-1">
									UID: <code className="bg-muted px-1 rounded">{asset.uid}</code>
								</p>
							</div>
						</div>
						<div className="flex gap-2 items-start flex-wrap justify-end">
							{asset.verified === false && <UnverifiedBadge discoveredBy={asset.discovered_by} />}
							<Badge variant="outline" className={typeBadge(asset.type)}>
								{asset.type}
							</Badge>
							<Badge variant="outline" className={statusColors[asset.status]}>
								{asset.status}
							</Badge>
						</div>
					</div>
				</CardHeader>
				<CardContent className="pt-0">
					<CommandHint />
				</CardContent>
			</Card>

			<DetailTabs
				defaultTab={highlightSchemaPath ? "details" : "graph"}
				graphDescription="Upstream, downstream, users & rules"
				graph={
					<LineageGraph
						entityUid={asset.uid}
						entityName={asset.name}
						entityKind="asset"
						entityType={asset.type}
					/>
				}
				details={
					<div className="flex flex-wrap gap-4 pb-4">
						{asset.description && (
							<Brick title="Description" icon={Info} basis="min-w-[320px] flex-[2_1_420px]">
								<p className="text-sm whitespace-pre-wrap">{asset.description}</p>
							</Brick>
						)}

						{asset.location && (
							<Brick title="Location" icon={MapPin} basis="min-w-[280px] flex-[1_1_320px]">
								<code className="text-xs font-mono break-all bg-muted rounded px-1.5 py-0.5 inline-block">
									{asset.location}
								</code>
							</Brick>
						)}

						{hasSpecs && (
							<Brick
								title="Specifications"
								icon={SpecIcon}
								description="Key technical details"
								basis="min-w-[320px] flex-[2_1_520px]"
							>
								<div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
									{Object.entries(specs).map(([key, value]) => (
										<div key={key} className="bg-background rounded-lg p-2.5 border">
											<dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
												{getSpecLabel(key)}
											</dt>
											<dd className="text-sm font-semibold mt-1 break-words">
												{getSpecValueLabel(key, value)}
											</dd>
										</div>
									))}
								</div>
							</Brick>
						)}

						<Brick
							title="Data Schema"
							icon={SpecIcon}
							description="Structure and fields"
							basis="min-w-[320px] flex-[2_1_520px]"
							headerExtra={
								<Link
									href={`/assets/${asset.uid}/schema`}
									className="text-xs text-primary hover:underline inline-flex items-center gap-1"
								>
									<ListTree className="size-3.5" /> Edit
								</Link>
							}
						>
							{hasSchema ? (
								<SchemaTreeView
									nodes={schema}
									highlightPath={highlightSchemaPath}
								/>
							) : (
								<p className="text-sm text-muted-foreground">
									No schema yet.{" "}
									<Link
										href={`/assets/${asset.uid}/schema`}
										className="text-primary hover:underline"
									>
										Open the schema editor
									</Link>{" "}
									to start modeling sheets, tables, and their fields.
								</p>
							)}
						</Brick>

						<div className="flex-1 min-w-[320px]">
							<RelationsSection entityUid={asset.uid} entityName={asset.name} />
						</div>

						<Brick
							title="Contained assets"
							icon={Network}
							description="Hierarchical children via `contains`"
							basis="min-w-[320px] flex-[1_1_320px]"
						>
							<AssetChildrenPanel uid={asset.uid} />
						</Brick>

						<div className="flex-1 min-w-[320px]">
							<RulesSection assetUid={asset.uid} />
						</div>

						{hasCustomMetadata && (
							<Brick
								title="Additional metadata"
								icon={Tag}
								description="Custom fields"
								basis="min-w-[320px] flex-[1_1_420px]"
							>
								<dl className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
									{Object.entries(customMetadata).map(([key, value]) => (
										<div key={key}>
											<dt className="text-xs font-medium text-muted-foreground">{key}</dt>
											<dd className="text-sm mt-0.5 break-words">
												{typeof value === "object" ? JSON.stringify(value) : String(value)}
											</dd>
										</div>
									))}
								</dl>
							</Brick>
						)}

						<Brick title="History" icon={Activity} basis="min-w-[280px] flex-[1_1_320px]">
							<dl className="grid grid-cols-2 gap-3">
								<div>
									<dt className="text-xs font-medium text-muted-foreground">Created</dt>
									<dd className="text-sm mt-0.5">{formatDate(asset.created_at)}</dd>
								</div>
								<div>
									<dt className="text-xs font-medium text-muted-foreground">Last updated</dt>
									<dd className="text-sm mt-0.5">{formatDate(asset.updated_at)}</dd>
								</div>
							</dl>
						</Brick>
					</div>
				}
			/>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Brick — one dashboard tile. Size driven by `basis` so content-rich */
/* tiles claim more space and small ones sit next to each other.      */
/* ------------------------------------------------------------------ */

function Brick({
	title,
	description,
	icon: Icon,
	basis,
	headerExtra,
	children,
}: {
	title: string;
	description?: string;
	icon?: LucideIcon;
	basis: string;
	headerExtra?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<Card className={basis}>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between gap-2">
					<CardTitle className="flex items-center gap-2 text-base">
						{Icon ? <Icon className="size-4 text-primary" /> : null}
						<span>{title}</span>
					</CardTitle>
					{headerExtra}
				</div>
				{description && <CardDescription className="text-xs">{description}</CardDescription>}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

function _EmptyHint({ text, commandHint }: { text: string; commandHint: string }) {
	return (
		<p className="text-sm text-muted-foreground">
			{text}{" "}
			<span className="italic">
				Press <kbd className="px-1 py-0.5 rounded border bg-muted">⌘K</kbd> →{" "}
				<span className="text-foreground">{commandHint}</span>.
			</span>
		</p>
	);
}

function CommandHint() {
	return (
		<div className="flex items-center gap-2 text-xs text-muted-foreground">
			<kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">⌘K</kbd>
			<span>to edit, link, attach rules, or add consumers.</span>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Schema tree (unchanged, read-only)                                 */
/* ------------------------------------------------------------------ */

function SchemaTreeView({
	nodes,
	depth = 0,
	parentPath = [],
	highlightPath = null,
}: {
	nodes: SchemaNode[];
	depth?: number;
	parentPath?: string[];
	highlightPath?: string[] | null;
}) {
	return (
		<div className={depth > 0 ? "ml-4 border-l pl-3" : ""}>
			{nodes.map((node) => {
				const Icon =
					node.nodeType === "container"
						? getContainerTypeIcon(node.containerType)
						: SchemaFieldIcon;
				const path = [...parentPath, node.name];
				const isHighlight =
					highlightPath !== null &&
					highlightPath.length === path.length &&
					highlightPath.every((seg, i) => seg === path[i]);
				return (
					<SchemaRow
						key={node.id}
						node={node}
						path={path}
						depth={depth}
						isHighlight={isHighlight}
						highlightPath={highlightPath}
						Icon={Icon}
					/>
				);
			})}
		</div>
	);
}

function SchemaRow({
	node,
	path,
	depth,
	isHighlight,
	highlightPath,
	Icon,
}: {
	node: SchemaNode;
	path: string[];
	depth: number;
	isHighlight: boolean;
	highlightPath: string[] | null;
	Icon: LucideIcon;
}) {
	// Scroll the matched row into view + flash a brief highlight ring. We
	// fade the ring after a couple of seconds so the page settles.
	const rowRef = useRef<HTMLDivElement | null>(null);
	const [glowing, setGlowing] = useState(isHighlight);
	useEffect(() => {
		if (!isHighlight || !rowRef.current) return;
		rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
		const t = setTimeout(() => setGlowing(false), 2400);
		return () => clearTimeout(t);
	}, [isHighlight]);

	const highlightCls = glowing
		? "bg-primary/15 ring-1 ring-primary/40 transition-all duration-700"
		: "transition-all duration-700";

	if (node.nodeType === "container") {
		return (
			<div className="py-1">
				<div
					ref={rowRef}
					className={`flex items-center gap-2 font-medium text-sm rounded-md px-1 ${highlightCls}`}
				>
					<Icon className="size-4 text-muted-foreground" />
					<span>{node.name}</span>
					<span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
						{node.containerType ?? "container"}
					</span>
				</div>
				{node.description && (
					<p className="text-xs text-muted-foreground ml-6">{node.description}</p>
				)}
				{node.children && node.children.length > 0 && (
					<SchemaTreeView
						nodes={node.children}
						depth={depth + 1}
						parentPath={path}
						highlightPath={highlightPath}
					/>
				)}
			</div>
		);
	}

	return (
		<div
			ref={rowRef}
			className={`py-1 flex items-center gap-2 text-sm rounded-md px-1 ${highlightCls}`}
		>
			<Icon className="size-3 text-muted-foreground" />
			<span className="font-medium">{node.name}</span>
			{node.dataType && (
				<span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
					{node.dataType}
				</span>
			)}
			{node.pii && (
				<span className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-1.5 py-0.5 rounded flex items-center gap-0.5">
					<PiiIcon className="size-3" /> PII
				</span>
			)}
			{node.description && (
				<span className="text-xs text-muted-foreground">— {node.description}</span>
			)}
		</div>
	);
}

function AssetDetailSkeleton() {
	return (
		<div className="space-y-6">
			<div className="flex items-start gap-3">
				<Skeleton className="h-12 w-12 rounded" />
				<div className="space-y-2">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-4 w-48" />
				</div>
			</div>
			<div className="flex flex-wrap gap-4">
				<Skeleton className="h-32 min-w-[320px] flex-[2_1_420px]" />
				<Skeleton className="h-32 min-w-[280px] flex-[1_1_320px]" />
				<Skeleton className="h-48 min-w-[320px] flex-[2_1_520px]" />
			</div>
		</div>
	);
}
