"use client";

import { useParams } from "next/navigation";
import { BackToSearch } from "@/components/layout/back-to-search";
import { RuleDetail } from "@/components/features/rules/rule-detail";
import { useEscapeToHome } from "@/hooks/use-escape-to-home";
import { useRule } from "@/hooks/use-rule";

export default function RulePage() {
	const params = useParams();
	const uid = params.uid as string;
	useEscapeToHome();

	const { data: rule, isLoading, error } = useRule(uid);

	return (
		<main className="w-full h-[calc(100dvh-3.625rem)] flex flex-col px-6 py-4 gap-3 overflow-hidden">
			<div className="shrink-0">
				<BackToSearch />
			</div>
			<div className="flex-1 min-h-0 flex flex-col">
				<RuleDetail rule={rule} isLoading={isLoading} error={error} />
			</div>
		</main>
	);
}
