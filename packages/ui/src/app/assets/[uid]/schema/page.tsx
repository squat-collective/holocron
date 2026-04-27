"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SchemaEditor } from "@/components/features/schema/schema-editor";
import { Button } from "@/components/ui/button";
import { useAsset } from "@/hooks/use-asset";
import { useEscapeTo } from "@/hooks/use-escape-to-home";

/**
 * Whole-asset schema editor — a navigable tree with inline keyboard
 * shortcuts (n / a / r / d / p / t). Distinct from the per-node detail
 * route at /schema/[...path] which is just a deep-link surface.
 *
 * Esc bounces back to the parent asset rather than home, since the editor
 * is conceptually a sub-page of the asset.
 */
export default function SchemaEditorPage() {
	const params = useParams();
	const uid = params.uid as string;
	useEscapeTo(`/assets/${uid}`);

	const { data: asset, isLoading, error } = useAsset(uid);

	return (
		<main className="w-full h-[calc(100dvh-3.625rem)] flex flex-col px-6 py-4 gap-3 overflow-hidden">
			<div className="shrink-0">
				<Link href={`/assets/${uid}`}>
					<Button variant="ghost" size="sm" className="gap-2">
						<ArrowLeft className="size-4" />
						Back to {asset?.name ?? "asset"}
					</Button>
				</Link>
			</div>
			<div className="flex-1 min-h-0 flex flex-col">
				<SchemaEditor asset={asset} isLoading={isLoading} error={error} />
			</div>
		</main>
	);
}
