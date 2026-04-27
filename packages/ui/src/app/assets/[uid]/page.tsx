"use client";

import { useParams } from "next/navigation";
import { AssetDetail } from "@/components/features/assets/asset-detail";
import { BackToSearch } from "@/components/layout/back-to-search";
import { useAsset } from "@/hooks/use-asset";
import { useEscapeToHome } from "@/hooks/use-escape-to-home";

export default function AssetPage() {
	const params = useParams();
	const uid = params.uid as string;
	useEscapeToHome();

	const { data: asset, isLoading, error } = useAsset(uid);

	return (
		<main className="w-full h-[calc(100dvh-3.625rem)] flex flex-col px-6 py-4 gap-3 overflow-hidden">
			<div className="shrink-0">
				<BackToSearch />
			</div>
			<div className="flex-1 min-h-0 flex flex-col">
				<AssetDetail asset={asset} isLoading={isLoading} error={error} />
			</div>
		</main>
	);
}
