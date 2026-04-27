import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnverifiedBadge } from "@/components/ui/unverified-badge";
import { getAssetTypeIcon } from "@/lib/icons";

interface Asset {
	uid: string;
	type: "dataset" | "report" | "process" | "system";
	name: string;
	description: string | null;
	status: "active" | "deprecated" | "draft";
	verified?: boolean;
	discovered_by?: string | null;
}

interface AssetCardProps {
	asset: Asset;
}

const typeColors = {
	dataset: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
	report: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
	process: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
	system: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
} as const;

const statusColors = {
	active: "bg-green-100 text-green-800",
	deprecated: "bg-yellow-100 text-yellow-800",
	draft: "bg-gray-100 text-gray-800",
} as const;

/**
 * Card component for displaying an asset in search results.
 */
export function AssetCard({ asset }: AssetCardProps) {
	const Icon = getAssetTypeIcon(asset.type);

	return (
		<Link href={`/assets/${asset.uid}`}>
			<Card className="hover:shadow-md transition-shadow cursor-pointer">
				<CardHeader className="pb-2">
					<div className="flex items-start justify-between gap-2">
						<div className="flex items-center gap-2">
							<Icon className="size-5 text-primary shrink-0" />
							<CardTitle className="text-lg">{asset.name}</CardTitle>
						</div>
						<div className="flex gap-2 flex-wrap">
							{asset.verified === false && <UnverifiedBadge discoveredBy={asset.discovered_by} />}
							<Badge variant="outline" className={typeColors[asset.type]}>
								{asset.type}
							</Badge>
							<Badge variant="outline" className={statusColors[asset.status]}>
								{asset.status}
							</Badge>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<CardDescription className="line-clamp-2">
						{asset.description ?? "No description available"}
					</CardDescription>
				</CardContent>
			</Card>
		</Link>
	);
}
