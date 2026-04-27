"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { type DirectedRelation, useEntityRelations } from "@/hooks/use-entity-relations";
import { getRelationStyle } from "@/lib/entity-styles";
import { getRelationTypeIcon, RelationIcon } from "@/lib/icons";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { EntityChip } from "./entity-chip";

interface RelationsSectionProps {
	entityUid: string;
	entityName: string;
}

type GroupKey = string;

interface Group {
	key: GroupKey;
	title: string;
	description: string;
	items: DirectedRelation[];
}

/**
 * Turn a (relationType, direction) pair into a human-readable section title
 * relative to the current entity.
 */
function titleFor(
	relationType: string,
	direction: "outgoing" | "incoming",
): {
	title: string;
	description: string;
} {
	const style = getRelationStyle(relationType);
	const labelRaw = style.label;
	if (direction === "outgoing") {
		return {
			title: labelRaw,
			description: style.description,
		};
	}
	// Incoming — describe from the counterparty's perspective
	switch (relationType) {
		case "owns":
			return { title: "Owned by", description: "Actors that own this" };
		case "uses":
			return { title: "Used by", description: "Entities using this" };
		case "feeds":
			return { title: "Fed by", description: "Sources feeding this" };
		case "contains":
			return { title: "Contained in", description: "Parents containing this" };
		case "member_of":
			return { title: "Members", description: "Actors that are members of this" };
		default:
			return { title: `${labelRaw} (incoming)`, description: style.description };
	}
}

export function RelationsSection({ entityUid, entityName }: RelationsSectionProps) {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useEntityRelations(entityUid);
	const [deleteTarget, setDeleteTarget] = useState<DirectedRelation | null>(null);

	const deleteMutation = useMutation({
		mutationFn: async (uid: string) => {
			const res = await fetch(`/api/holocron/relations/${uid}`, { method: "DELETE" });
			if (!res.ok) throw new Error("Failed to delete relation");
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.relations.all });
			toast.success(
				deleteTarget?.other?.name
					? `Removed link to “${deleteTarget.other.name}”`
					: "Relation removed",
			);
			setDeleteTarget(null);
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-32" />
				</CardHeader>
				<CardContent>
					<Skeleton className="h-16 w-full" />
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Relations</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-destructive">
					Failed to load relations: {error.message}
				</CardContent>
			</Card>
		);
	}

	const items = data?.all ?? [];
	// No relations — hide the brick entirely. The palette's "Link to another
	// entity" command is the discovery path.
	if (items.length === 0) return null;

	const groups: Group[] = Object.entries(data?.byType ?? {})
		.map(([key, list]) => {
			const [relationType, direction] = key.split(":") as [string, "outgoing" | "incoming"];
			const { title, description } = titleFor(relationType, direction);
			return { key, title, description, items: list };
		})
		.sort((a, b) => a.title.localeCompare(b.title));

	return (
		<>
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2">
						<RelationIcon className="size-4 text-primary" /> Relations
					</CardTitle>
					<CardDescription>
						{`${items.length} ${items.length === 1 ? "relation" : "relations"} connected to ${entityName}`}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					{groups.map((group) => {
						const relationType = group.key.split(":")[0] ?? "";
						const Icon = getRelationTypeIcon(relationType);
						const style = getRelationStyle(relationType);
						return (
							<div key={group.key}>
								<div className="mb-2 flex items-center gap-2 flex-wrap">
									<span
										className={cn(
											"inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
											style.bg,
											style.border,
											style.text,
										)}
									>
										<Icon className="size-3.5" />
										{group.title}
									</span>
									<span className="text-xs text-muted-foreground">{group.description}</span>
								</div>
								<ul className={cn("space-y-1.5 border-l-2 pl-3 ml-2", style.border)}>
									{group.items.map((item) => (
										<li key={item.relation.uid} className="flex items-center gap-2">
											<EntityChip
												uid={item.other.uid}
												name={item.other.name}
												type={item.other.type}
												entityKind={item.other.entityType}
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
												aria-label="Delete relation"
												onClick={() => setDeleteTarget(item)}
											>
												<Trash2Icon className="h-4 w-4" />
											</Button>
										</li>
									))}
								</ul>
							</div>
						);
					})}
				</CardContent>
			</Card>

			<Dialog
				open={!!deleteTarget}
				onOpenChange={(next) => {
					if (!next) setDeleteTarget(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete relation</DialogTitle>
						<DialogDescription asChild>
							<div className="space-y-2">
								<p>
									Remove the link between <span className="font-medium">{entityName}</span> and{" "}
									<span className="font-medium">{deleteTarget?.other.name}</span>?
								</p>
								<p className="text-destructive">This cannot be undone.</p>
							</div>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteTarget(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.relation.uid)}
							disabled={deleteMutation.isPending}
						>
							{deleteMutation.isPending ? "Deleting…" : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
