"use client";

import { LayoutGrid, Network } from "lucide-react";
import { useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDetailTabShortcuts } from "@/hooks/use-detail-tab-shortcuts";

/**
 * The shared Graph | Details tab switcher used on every node-detail page
 * (asset, actor, rule). Owns the tab state and the `g` / `d` keyboard
 * shortcuts so callers only pass the content of each pane.
 *
 * The Graph pane is wrapped in a translucent card with a configurable
 * title/description — keeps the visual language identical across pages.
 * The Details pane scrolls internally so the page chrome stays put.
 */
export function DetailTabs({
	graphTitle = "Lineage",
	graphDescription,
	graph,
	details,
	defaultTab = "graph",
}: {
	graphTitle?: string;
	graphDescription?: React.ReactNode;
	graph: React.ReactNode;
	details: React.ReactNode;
	/** Which tab is open on first render. Callers force "details" when the
	 *  user arrives via a deep link that points at a row inside the details
	 *  pane (e.g. a schema-field search hit). */
	defaultTab?: "graph" | "details";
}) {
	const [activeTab, setActiveTab] = useState<"graph" | "details">(defaultTab);
	useDetailTabShortcuts(setActiveTab);

	return (
		<Tabs
			value={activeTab}
			onValueChange={(v) => setActiveTab(v as "graph" | "details")}
			className="flex-1 flex flex-col min-h-0 gap-3"
		>
			<TabsList className="self-start">
				<TabsTrigger value="graph" className="gap-1.5">
					<Network className="size-3.5" />
					Graph
					<kbd className="ml-1 rounded border border-primary/20 bg-muted/40 px-1 py-0 text-[10px] font-mono">
						g
					</kbd>
				</TabsTrigger>
				<TabsTrigger value="details" className="gap-1.5">
					<LayoutGrid className="size-3.5" />
					Details
					<kbd className="ml-1 rounded border border-primary/20 bg-muted/40 px-1 py-0 text-[10px] font-mono">
						d
					</kbd>
				</TabsTrigger>
			</TabsList>

			<TabsContent
				value="graph"
				className="flex-1 flex flex-col min-h-0 mt-0"
			>
				<Card className="flex-1 flex flex-col min-h-0 !gap-3 !py-4">
					<CardHeader className="pb-0">
						<CardTitle className="flex items-center gap-2 text-base">
							<Network className="size-4 text-primary" />
							<span>{graphTitle}</span>
						</CardTitle>
						{graphDescription && (
							<CardDescription className="text-xs">
								{graphDescription}
							</CardDescription>
						)}
					</CardHeader>
					<CardContent className="flex-1 flex flex-col min-h-0">
						{graph}
					</CardContent>
				</Card>
			</TabsContent>

			<TabsContent
				value="details"
				className="flex-1 min-h-0 mt-0 overflow-auto"
			>
				{details}
			</TabsContent>
		</Tabs>
	);
}
