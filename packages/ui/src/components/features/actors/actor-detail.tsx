"use client";

import { useMemo } from "react";
import { Activity, FrownIcon, Info, Mail, SearchX, Tag } from "lucide-react";
import { LineageGraph } from "@/components/features/lineage/lineage-graph";
import { DetailTabs } from "@/components/layout/detail-tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UnverifiedBadge } from "@/components/ui/unverified-badge";
import { useSetFocusedEntity } from "@/extensions";
import { actorStyles } from "@/lib/entity-styles";
import { getActorTypeIcon, type LucideIcon } from "@/lib/icons";
import type { ActorType } from "@/lib/wizard-store";

interface Actor {
	uid: string;
	type: "person" | "group";
	name: string;
	email: string | null;
	description: string | null;
	verified?: boolean;
	discovered_by?: string | null;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

interface ActorDetailProps {
	actor: Actor | undefined;
	isLoading: boolean;
	error: Error | null;
}

const typeBadge = (type: ActorType) => actorStyles[type].badge;

function formatDate(dateString: string): string {
	return new Date(dateString).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function ActorDetail({ actor, isLoading, error }: ActorDetailProps) {
	// Publish the focused actor — the actor extension reads this and
	// surfaces every edit/link/delete command through ⌘K.
	const focused = useMemo(
		() => (actor ? ({ kind: "actor" as const, entity: actor }) : null),
		[actor],
	);
	useSetFocusedEntity(focused);

	if (isLoading) return <ActorDetailSkeleton />;

	if (error) {
		return (
			<div className="text-center py-12">
				<FrownIcon className="mx-auto size-8 text-destructive mb-2" />
				<p className="text-lg text-destructive">{error.message}</p>
			</div>
		);
	}

	if (!actor) {
		return (
			<div className="text-center py-12">
				<SearchX className="mx-auto size-8 text-muted-foreground mb-2" />
				<p className="text-lg text-muted-foreground">Actor not found</p>
			</div>
		);
	}

	const TypeIcon = getActorTypeIcon(actor.type);
	const hasMetadata = Object.keys(actor.metadata).length > 0;

	return (
		<div className="flex-1 flex flex-col gap-3 min-h-0">
			{/* Header — always visible above the tabs. */}
			<Card className="border-primary/20 shrink-0 !py-4">
				<CardHeader className="pb-3">
					<div className="flex items-start justify-between gap-4 flex-wrap">
						<div className="flex items-center gap-3 min-w-0">
							<TypeIcon className="size-10 text-primary shrink-0" />
							<div className="min-w-0">
								<CardTitle className="text-3xl font-bold truncate">{actor.name}</CardTitle>
								<p className="text-muted-foreground text-sm mt-1">
									UID: <code className="bg-muted px-1 rounded">{actor.uid}</code>
								</p>
							</div>
						</div>
						<div className="flex gap-2 items-start flex-wrap justify-end">
							{actor.verified === false && <UnverifiedBadge discoveredBy={actor.discovered_by} />}
							<Badge variant="outline" className={typeBadge(actor.type)}>
								{actor.type}
							</Badge>
						</div>
					</div>
				</CardHeader>
				<CardContent className="pt-0">
					<CommandHint />
				</CardContent>
			</Card>

			<DetailTabs
				graphDescription={`Assets this ${actor.type} interacts with and memberships`}
				graph={
					<LineageGraph
						entityUid={actor.uid}
						entityName={actor.name}
						entityKind="actor"
						entityType={actor.type}
					/>
				}
				details={
					<div className="flex flex-wrap gap-4 pb-4">
						{actor.email && (
							<Brick title="Contact" icon={Mail} basis="min-w-[280px] flex-[1_1_320px]">
								<a
									href={`mailto:${actor.email}`}
									className="text-sm text-primary hover:underline break-all"
								>
									{actor.email}
								</a>
							</Brick>
						)}

						{actor.description && (
							<Brick title="Description" icon={Info} basis="min-w-[320px] flex-[2_1_420px]">
								<p className="text-sm whitespace-pre-wrap">{actor.description}</p>
							</Brick>
						)}

						{hasMetadata && (
							<Brick
								title="Additional metadata"
								icon={Tag}
								description="Custom fields"
								basis="min-w-[320px] flex-[1_1_420px]"
							>
								<dl className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
									{Object.entries(actor.metadata).map(([key, value]) => (
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
									<dt className="text-xs font-medium text-muted-foreground">Added</dt>
									<dd className="text-sm mt-0.5">{formatDate(actor.created_at)}</dd>
								</div>
								<div>
									<dt className="text-xs font-medium text-muted-foreground">Last updated</dt>
									<dd className="text-sm mt-0.5">{formatDate(actor.updated_at)}</dd>
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
/* Small helpers — shared visual language with asset-detail            */
/* ------------------------------------------------------------------ */

function Brick({
	title,
	description,
	icon: Icon,
	basis,
	children,
}: {
	title: string;
	description?: string;
	icon?: LucideIcon;
	basis: string;
	children: React.ReactNode;
}) {
	return (
		<Card className={basis}>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-base">
					{Icon ? <Icon className="size-4 text-primary" /> : null}
					<span>{title}</span>
				</CardTitle>
				{description && <CardDescription className="text-xs">{description}</CardDescription>}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

function CommandHint() {
	return (
		<div className="flex items-center gap-2 text-xs text-muted-foreground">
			<kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">⌘K</kbd>
			<span>to rename, edit email, link assets, or change type.</span>
		</div>
	);
}

function ActorDetailSkeleton() {
	return (
		<div className="space-y-6">
			<div className="flex items-start gap-3">
				<Skeleton className="h-12 w-12 rounded" />
				<div className="space-y-2">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-4 w-32" />
				</div>
			</div>
			<div className="flex flex-wrap gap-4">
				<Skeleton className="h-48 min-w-[320px] flex-[2_1_520px]" />
			</div>
		</div>
	);
}
