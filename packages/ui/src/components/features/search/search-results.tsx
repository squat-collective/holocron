"use client";

import { FrownIcon, Search } from "lucide-react";
import { AssetCard } from "@/components/features/assets/asset-card";
import { Skeleton } from "@/components/ui/skeleton";

interface Asset {
	uid: string;
	type: "dataset" | "report" | "process" | "system";
	name: string;
	description: string | null;
	status: "active" | "deprecated" | "draft";
}

interface SearchResultsProps {
	assets: Asset[];
	total: number;
	isLoading: boolean;
	query: string;
}

/**
 * Display search results as a list of asset cards.
 */
export function SearchResults({ assets, total, isLoading, query }: SearchResultsProps) {
	if (isLoading) {
		return (
			<div className="space-y-4">
				{[1, 2, 3].map((i) => (
					<Skeleton key={i} className="h-28 w-full" />
				))}
			</div>
		);
	}

	if (!query) {
		return (
			<div className="text-center py-12 text-muted-foreground">
				<Search className="mx-auto size-6 mb-2" />
				<p className="text-lg">Start typing to search for data assets</p>
				<p className="text-sm mt-2">Find datasets, reports, processes, and systems</p>
			</div>
		);
	}

	if (assets.length === 0) {
		return (
			<div className="text-center py-12 text-muted-foreground">
				<FrownIcon className="mx-auto size-6 mb-2" />
				<p className="text-lg">No results found for &quot;{query}&quot;</p>
				<p className="text-sm mt-2">Try different keywords or check the spelling</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				Found {total} {total === 1 ? "result" : "results"} for &quot;{query}&quot;
			</p>
			<div className="space-y-3">
				{assets.map((asset) => (
					<AssetCard key={asset.uid} asset={asset} />
				))}
			</div>
		</div>
	);
}
