"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ListChecks, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useListboxNav } from "@/components/features/wizard-shared";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { assetTypeIcons } from "@/lib/icons";
import {
	closeWizard,
	type GovernanceAudit,
	type GovernanceListParams,
	type GovernanceListResult,
} from "@/lib/wizard-store";

/**
 * Governance list wizard — read-only result view for the saved-search
 * commands ("Find unverified" / "Find unowned" / "Find undocumented").
 *
 * Each audit maps to a fixed query string against `/api/holocron/assets`.
 * Results are paginated by the backend (default limit 50); we surface the
 * total + the first page and let the user click through to details for
 * any individual asset that needs attention.
 */

const AUDIT_META: Record<
	GovernanceAudit,
	{
		title: string;
		description: string;
		filter: string;
		emptyLabel: string;
	}
> = {
	unverified: {
		title: "Unverified assets",
		description:
			"Assets that landed via discovery and haven't been confirmed by a human yet.",
		filter: "verified=false",
		emptyLabel: "Everything is verified — nice.",
	},
	unowned: {
		title: "Unowned assets",
		description:
			"Assets with no incoming `owns` relation. Pick one and assign an owner.",
		filter: "has_owner=false",
		emptyLabel: "Every asset has an owner.",
	},
	undocumented: {
		title: "Undocumented assets",
		description:
			"Assets with an empty description. Documentation hygiene starts here.",
		filter: "has_description=false",
		emptyLabel: "Every asset has a description.",
	},
};

interface Frame {
	id: string;
	kind: "governance-list";
	params: GovernanceListParams;
	resolve: (result: GovernanceListResult | null) => void;
}

interface ApiAsset {
	uid: string;
	name: string;
	type: "dataset" | "report" | "process" | "system";
	description: string | null;
	verified: boolean;
}

interface ApiList {
	items: ApiAsset[];
	total: number;
}

export function GovernanceListWizard({
	frame,
}: {
	frame: Frame;
	isTop: boolean;
	isNested: boolean;
}) {
	const [open, setOpen] = useState(true);
	const meta = AUDIT_META[frame.params.audit];

	const { data, isLoading, error } = useQuery<ApiList>({
		queryKey: ["governance-audit", frame.params.audit],
		queryFn: async () => {
			const res = await fetch(
				`/api/holocron/assets?${meta.filter}&limit=100`,
			);
			if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
			return (await res.json()) as ApiList;
		},
		staleTime: 30 * 1000,
	});

	const close = () => {
		setOpen(false);
		closeWizard(frame.id, { closed: true });
	};

	const items = data?.items ?? [];
	const total = data?.total ?? 0;

	// Keyboard nav: ↑/↓ moves the cursor, Home/End jump to ends, Enter
	// navigates to the focused asset's detail page. Mouse hover keeps
	// the active row in sync so click and keyboard targets line up.
	const { containerProps, itemProps } = useListboxNav({
		items,
		onCommit: (asset) => {
			window.location.assign(`/assets/${asset.uid}`);
		},
	});

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) close();
			}}
		>
			<DialogContent className="sm:max-w-2xl bg-card/90 backdrop-blur-xl border-primary/20">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base">
						<ShieldAlert className="size-4 text-primary" />
						<span>{meta.title}</span>
						{!isLoading && (
							<span className="text-xs font-normal text-muted-foreground ml-auto">
								{total === 1 ? "1 match" : `${total} matches`}
							</span>
						)}
					</DialogTitle>
					<DialogDescription className="text-xs leading-relaxed">
						{meta.description}
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-12 w-full" />
						<Skeleton className="h-12 w-full" />
						<Skeleton className="h-12 w-full" />
					</div>
				) : error ? (
					<p className="text-sm text-destructive">{error.message}</p>
				) : items.length === 0 ? (
					<p className="text-sm text-muted-foreground py-6 text-center flex items-center justify-center gap-2">
						<ListChecks className="size-4 text-emerald-500" />
						{meta.emptyLabel}
					</p>
				) : (
					<ScrollArea className="max-h-[60vh] pr-2">
						<ul className="space-y-1.5" {...containerProps}>
							{items.map((asset, idx) => (
								<AssetRow
									key={asset.uid}
									asset={asset}
									itemProps={itemProps(idx)}
								/>
							))}
						</ul>
						{total > items.length && (
							<p className="text-xs text-muted-foreground mt-3 text-center">
								Showing {items.length} of {total}. Refine via the API for the
								rest.
							</p>
						)}
					</ScrollArea>
				)}

				<DialogFooter>
					<Button onClick={close}>Close</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AssetRow({
	asset,
	itemProps,
}: {
	asset: ApiAsset;
	itemProps: ReturnType<typeof useListboxNav<ApiAsset>>["itemProps"] extends (
		idx: number,
	) => infer R
		? R
		: never;
}) {
	const Icon = assetTypeIcons[asset.type] ?? ShieldAlert;
	const { ref, ...rest } = itemProps;
	return (
		<li>
			<a
				href={`/assets/${asset.uid}`}
				ref={(el) => ref(el)}
				{...rest}
				className="flex items-center gap-3 rounded-md border bg-card/40 px-3 py-2 text-sm hover:bg-card/80 hover:border-primary/40 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 aria-selected:bg-card/80 aria-selected:border-primary/40"
			>
				<Icon className="size-4 text-primary shrink-0" />
				<div className="min-w-0 flex-1">
					<div className="font-medium truncate">{asset.name}</div>
					<div className="text-xs text-muted-foreground truncate">
						{asset.type}
						{asset.description ? ` · ${asset.description}` : ""}
					</div>
				</div>
				<ArrowRight className="size-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 transition-opacity" />
			</a>
		</li>
	);
}
