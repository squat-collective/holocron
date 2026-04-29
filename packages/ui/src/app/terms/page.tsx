"use client";

import type { Term } from "@squat-collective/holocron-ts";
import { BookOpen, Plus, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { CreateTermDialog } from "@/components/features/terms/create-term-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GalaxySpinner } from "@/components/ui/galaxy-spinner";
import { useEscapeToHome } from "@/hooks/use-escape-to-home";
import { useTerms } from "@/hooks/use-terms";

const STATUS_BADGE: Record<NonNullable<Term["status"]>, string> = {
	draft: "bg-muted text-muted-foreground border-border",
	approved:
		"bg-enforcement-enforced/15 text-enforcement-enforced border-enforcement-enforced/30",
	deprecated:
		"bg-enforcement-alerting/15 text-enforcement-alerting border-enforcement-alerting/30",
};

/**
 * Business Glossary index — list every term in the workspace, plus a
 * one-click "New term" entry point. Detail view + asset-linking come
 * in a follow-up; for now the list is the shared vocabulary surface.
 */
export default function TermsPage() {
	useEscapeToHome();
	const { data, isLoading, error } = useTerms();
	const [createOpen, setCreateOpen] = useState(false);

	return (
		<main className="w-full min-h-[calc(100dvh-3.625rem)] flex flex-col px-6 py-6 gap-4 max-w-5xl mx-auto">
			<header className="flex items-start justify-between gap-4 flex-wrap">
				<div>
					<h1 className="text-2xl font-semibold flex items-center gap-2">
						<BookOpen className="size-6 text-primary" />
						Business Glossary
					</h1>
					<p className="text-sm text-muted-foreground mt-1 max-w-xl">
						Canonical definitions for the business concepts shared across the
						catalog. Link terms to assets via{" "}
						<code className="bg-muted px-1 rounded">defines</code> relations to
						declare which dataset, column, or report a concept lives in.
					</p>
				</div>
				<Button onClick={() => setCreateOpen(true)}>
					<Plus className="size-4" />
					New term
				</Button>
			</header>

			{isLoading ? (
				<div className="flex justify-center py-16">
					<GalaxySpinner size={120} label="Loading terms…" />
				</div>
			) : error ? (
				<div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
					Failed to load terms: {error.message}
				</div>
			) : !data || data.items.length === 0 ? (
				<EmptyState onCreate={() => setCreateOpen(true)} />
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					{data.items.map((term) => (
						<TermCard key={term.uid} term={term} />
					))}
				</div>
			)}

			<CreateTermDialog open={createOpen} onOpenChange={setCreateOpen} />
		</main>
	);
}

function TermCard({ term }: { term: Term }) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-start justify-between gap-2">
					<CardTitle className="text-base font-semibold truncate">
						{term.name}
					</CardTitle>
					<div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
						{term.pii && (
							<Badge
								variant="outline"
								className="text-[10px] gap-1 border-destructive/50 text-destructive"
							>
								<ShieldAlert className="size-3" />
								PII
							</Badge>
						)}
						<Badge
							variant="outline"
							className={`text-[10px] capitalize ${STATUS_BADGE[term.status]}`}
						>
							{term.status}
						</Badge>
					</div>
				</div>
			</CardHeader>
			<CardContent className="text-sm space-y-2">
				<p className="line-clamp-3 text-muted-foreground">{term.definition}</p>
				<dl className="flex items-center gap-3 flex-wrap text-xs">
					{term.domain && (
						<div>
							<dt className="inline text-muted-foreground">Domain: </dt>
							<dd className="inline font-medium">{term.domain}</dd>
						</div>
					)}
					{term.unit && (
						<div>
							<dt className="inline text-muted-foreground">Unit: </dt>
							<dd className="inline font-medium">{term.unit}</dd>
						</div>
					)}
					{term.formula && (
						<div className="basis-full">
							<dt className="inline text-muted-foreground">Formula: </dt>
							<dd className="inline font-mono text-xs bg-muted/40 px-1 rounded">
								{term.formula}
							</dd>
						</div>
					)}
				</dl>
			</CardContent>
		</Card>
	);
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
	return (
		<div className="rounded-md border border-dashed border-border/60 p-10 text-center">
			<BookOpen className="size-8 text-muted-foreground mx-auto mb-3" />
			<h2 className="text-base font-medium mb-1">No glossary terms yet</h2>
			<p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
				Define your first business term — a metric like "Revenue", a status
				like "Active Customer", or a domain entity like "Order".
			</p>
			<Button onClick={onCreate}>
				<Plus className="size-4" />
				New term
			</Button>
		</div>
	);
}
