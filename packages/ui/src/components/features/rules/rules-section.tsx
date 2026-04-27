"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleHelp, Pin, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { useAssetRules } from "@/hooks/use-asset-rules";
import { type LucideIcon, RuleIcon } from "@/lib/icons";
import { type AppliedRule, ENFORCEMENT_META, type RuleEnforcement, SEVERITY_META } from "./types";

export interface SchemaPathOption {
	path: string;
	depth: number;
	kind: "container" | "field";
	containerType?: string;
	dataType?: string;
	icon: LucideIcon;
}

interface RulesSectionProps {
	assetUid: string;
}

const ENFORCEMENT_ORDER: RuleEnforcement[] = ["enforced", "alerting", "documented"];

export function RulesSection({ assetUid }: RulesSectionProps) {
	const { data, isLoading, error } = useAssetRules(assetUid);
	const [deleteTarget, setDeleteTarget] = useState<AppliedRule | null>(null);
	const queryClient = useQueryClient();

	const deleteMutation = useMutation({
		mutationFn: async (relationUid: string) => {
			const res = await fetch(`/api/holocron/relations/${relationUid}`, {
				method: "DELETE",
			});
			if (!res.ok && res.status !== 204) {
				throw new Error(`Failed to detach rule (${res.status})`);
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["rules", "for-asset", assetUid] });
			toast.success(
				deleteTarget?.rule.name ? `Detached rule “${deleteTarget.rule.name}”` : "Rule detached",
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
					<CardTitle>Rules</CardTitle>
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
					<CardTitle>Rules</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-destructive">
					Failed to load: {error.message}
				</CardContent>
			</Card>
		);
	}

	const items = data?.items ?? [];
	// No rules — hide the brick; the palette's "Attach a data-quality rule"
	// command is the entry point.
	if (items.length === 0) return null;

	const byTier = new Map<RuleEnforcement | "unknown", AppliedRule[]>();
	for (const item of items) {
		const key = (item.enforcement ?? "unknown") as RuleEnforcement | "unknown";
		const list = byTier.get(key) ?? [];
		list.push(item);
		byTier.set(key, list);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<RuleIcon className="size-4 text-primary" />
					<span>Rules</span>
					<Badge variant="outline" className="text-muted-foreground ml-1">
						{items.length}
					</Badge>
				</CardTitle>
				<CardDescription>
					Data-quality rules this asset respects or should respect.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-5">
						{ENFORCEMENT_ORDER.map((tier) => {
							const bucket = byTier.get(tier) ?? [];
							if (bucket.length === 0) return null;
							const meta = ENFORCEMENT_META[tier];
							const MetaIcon = meta.icon;
							return (
								<div key={tier} className="space-y-2">
									<div className="flex items-center gap-2 text-sm font-medium">
										<MetaIcon className="size-4" />
										<span>{meta.label}</span>
										<span className="text-muted-foreground font-normal">· {meta.description}</span>
									</div>
									<div className="space-y-2">
										{bucket.map((item) => (
											<RuleRow
												key={item.rule.uid}
												item={item}
												onDelete={() => setDeleteTarget(item)}
											/>
										))}
									</div>
								</div>
							);
						})}

					{byTier.has("unknown") && (
						<div className="space-y-2">
							<div className="flex items-center gap-2 text-sm font-medium">
								<CircleHelp className="size-4" />
								<span>No enforcement set</span>
							</div>
							<div className="space-y-2">
								{(byTier.get("unknown") ?? []).map((item) => (
									<RuleRow
										key={item.rule.uid}
										item={item}
										onDelete={() => setDeleteTarget(item)}
									/>
								))}
							</div>
						</div>
					)}
				</div>
			</CardContent>

			<Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Detach this rule?</DialogTitle>
						<DialogDescription>
							This removes the rule's link to this asset. The rule itself continues to exist and may
							still apply to other assets.
						</DialogDescription>
					</DialogHeader>
					<div className="text-sm">
						<span className="font-medium">{deleteTarget?.rule.name}</span>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteTarget(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (deleteTarget) deleteMutation.mutate(deleteTarget.relation_uid);
							}}
						>
							{deleteMutation.isPending ? "Detaching…" : "Detach"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}

function RuleRow({ item, onDelete }: { item: AppliedRule; onDelete: () => void }) {
	const sev = SEVERITY_META[item.rule.severity];
	return (
		<div className="flex items-start justify-between gap-3 border rounded-md p-3 hover:bg-muted/30 transition-colors">
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex items-center gap-2 flex-wrap">
					<Link
						href={`/rules/${item.rule.uid}`}
						className="font-medium hover:underline truncate"
					>
						{item.rule.name}
					</Link>
					<Badge variant="outline" className={sev.className}>
						{sev.label}
					</Badge>
					{item.rule.category && (
						<Badge variant="outline" className="text-xs text-muted-foreground">
							{item.rule.category}
						</Badge>
					)}
					{item.field_path && (
						<Badge variant="outline" className="font-mono text-xs">
							{item.field_path}
						</Badge>
					)}
				</div>
				<p className="text-sm text-muted-foreground">{item.rule.description}</p>
				{item.note && (
					<p className="text-xs text-muted-foreground italic flex items-start gap-1">
						<Pin className="size-3 mt-0.5 shrink-0" /> {item.note}
					</p>
				)}
			</div>
			<Button
				variant="ghost"
				size="icon"
				className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
				onClick={onDelete}
				title="Detach this rule from the asset"
			>
				<Trash2Icon className="h-4 w-4" />
			</Button>
		</div>
	);
}
