"use client";

import type { AssetTreeNode } from "@squat-collective/holocron-ts";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssetTree } from "@/hooks/use-asset-tree";

interface AssetChildrenPanelProps {
	uid: string;
}

/**
 * Renders the immediate `contains` children of an asset (depth=1).
 *
 * Hierarchical assets — table → columns, sheet → visuals, etc. —
 * appear here once the parent has at least one child wired via a
 * `contains` relation. Empty parents render nothing so the panel
 * stays out of the way for top-level assets without a hierarchy.
 */
export function AssetChildrenPanel({ uid }: AssetChildrenPanelProps) {
	const { data, isLoading, error } = useAssetTree(uid, 1);

	if (isLoading) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-7 w-full" />
				<Skeleton className="h-7 w-3/4" />
			</div>
		);
	}

	if (error) {
		return <p className="text-sm text-muted-foreground">{error.message}</p>;
	}

	const children = data?.children ?? [];
	if (children.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No contained assets. Wire children via a <code>contains</code> relation
				or use <code>POST /assets/{uid}/schema</code>.
			</p>
		);
	}

	return (
		<ul className="divide-y">
			{children.map((child: AssetTreeNode) => (
				<li
					key={child.asset.uid}
					className="flex items-center justify-between gap-3 py-2"
				>
					<Link
						href={`/assets/${child.asset.uid}`}
						className="text-sm font-medium hover:underline truncate"
					>
						{child.asset.name}
					</Link>
					<Badge variant="outline" className="shrink-0 text-xs">
						{child.asset.type}
					</Badge>
				</li>
			))}
		</ul>
	);
}
