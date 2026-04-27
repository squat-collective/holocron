"use client";

import { useParams } from "next/navigation";
import { ActorDetail } from "@/components/features/actors/actor-detail";
import { BackToSearch } from "@/components/layout/back-to-search";
import { useActor } from "@/hooks/use-actors";
import { useEscapeToHome } from "@/hooks/use-escape-to-home";

export default function ActorPage() {
	const params = useParams();
	const uid = params.uid as string;
	useEscapeToHome();

	const { data: actor, isLoading, error } = useActor(uid);

	return (
		<main className="w-full h-[calc(100dvh-3.625rem)] flex flex-col px-6 py-4 gap-3 overflow-hidden">
			<div className="shrink-0">
				<BackToSearch />
			</div>
			<div className="flex-1 min-h-0 flex flex-col">
				<ActorDetail actor={actor} isLoading={isLoading} error={error} />
			</div>
		</main>
	);
}
