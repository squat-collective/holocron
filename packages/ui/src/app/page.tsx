"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { GalaxyMapHandle } from "@/components/features/galaxy-map/galaxy-map";
import { GalaxyMap } from "@/components/features/galaxy-map/galaxy-map-lazy";
import { HomeHero } from "@/components/features/home/home-hero";
import { type Mode, ModeToggle } from "@/components/features/home/mode-toggle";
import { HighlightedSearchInput } from "@/components/features/search/highlighted-search-input";
import { HitRow } from "@/components/features/search/hit-row";
import { SelectedHitPreview } from "@/components/features/search/selected-hit-preview";
import { GalaxySpinner } from "@/components/ui/galaxy-spinner";
import {
	type CatalogHit,
	type CatalogSearchResults,
	flattenResults,
	hitHref,
	hitKey,
	useCatalogSearch,
} from "@/hooks/use-catalog-search";
import { useCosmicNav } from "@/hooks/use-cosmic-nav";
import { useDebounce } from "@/hooks/use-debounce";
import { setRotationBoost } from "@/lib/galaxy-store";

interface AssetSummary {
	uid: string;
	name: string;
}

interface AssetList {
	items: AssetSummary[];
}

export default function Home() {
	// useSearchParams forces client-side rendering for the subtree it lives in.
	// The Suspense boundary lets Next prerender the shell at build time.
	return (
		<Suspense fallback={null}>
			<HomeInner />
		</Suspense>
	);
}

function HomeInner() {
	const cosmicNav = useCosmicNav();
	const queryClient = useQueryClient();
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	// Mode lives in the URL (`?mode=map`) so it's shareable + the
	// command palette can deep-link straight here.
	const mode: Mode = searchParams.get("mode") === "map" ? "map" : "preview";
	const setMode = (next: Mode) => {
		const params = new URLSearchParams(searchParams);
		if (next === "map") params.set("mode", "map");
		else params.delete("mode");
		const qs = params.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const [query, setQuery] = useState("");
	const debouncedQuery = useDebounce(query, 150);
	const { results, isFetching } = useCatalogSearch(debouncedQuery);
	const hits = useMemo(() => flattenResults(results), [results]);
	const [selectedIndex, setSelectedIndex] = useState(0);

	const listRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const mapHandleRef = useRef<GalaxyMapHandle | null>(null);

	const showResults = debouncedQuery.trim().length > 0;
	const showHero = !showResults && mode === "preview";
	const selectedHit: CatalogHit | undefined = hits[selectedIndex];
	// In map mode the active hit is the user's keyboard / hover selection;
	// in preview mode the map isn't mounted so the prop is moot.
	const activeHit = mode === "map" ? (selectedHit ?? null) : null;

	useEffect(() => {
		searchInputRef.current?.focus();
	}, [showHero]);

	useEffect(() => {
		setSelectedIndex(0);
	}, [debouncedQuery]);

	useEffect(() => {
		const boost = 1 + Math.min(3, query.trim().length * 0.25);
		setRotationBoost(boost);
		return () => setRotationBoost(1);
	}, [query]);

	useEffect(() => {
		const el = listRef.current?.querySelector<HTMLElement>(
			`[data-hit-index="${selectedIndex}"]`,
		);
		el?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	const openHit = (hit: CatalogHit) => {
		cosmicNav(hitHref(hit));
	};

	const openRandomAsset = () => {
		const cached = queryClient.getQueryData<AssetList>([
			"catalog-search",
			"assets",
		]);
		const items = cached?.items ?? [];
		if (items.length === 0) return;
		const pick = items[Math.floor(Math.random() * items.length)];
		if (pick) cosmicNav(`/assets/${pick.uid}`);
	};

	// Shared keyboard handler — arrows always navigate hits; Enter opens
	// the highlighted hit; Shift+Enter in map mode forwards to the
	// canvas to toggle a lock on that hit. Map-mode arrow camera nav
	// is handled inside the GalaxyMap component (it watches arrow keys
	// only when no input has focus, so this handler doesn't conflict).
	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			if (hits.length === 0) return;
			event.preventDefault();
			setSelectedIndex((i) => Math.min(i + 1, hits.length - 1));
			return;
		}
		if (event.key === "ArrowUp") {
			if (hits.length === 0) return;
			event.preventDefault();
			setSelectedIndex((i) => Math.max(i - 1, 0));
			return;
		}
		if (event.key === "Enter" && event.shiftKey) {
			if (mode !== "map") return; // lock only makes sense on the canvas
			event.preventDefault();
			const hit = hits[selectedIndex];
			if (hit) mapHandleRef.current?.toggleLockHit(hit);
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			const hit = hits[selectedIndex];
			if (hit) {
				openHit(hit);
			} else if (query.trim().length === 0) {
				openRandomAsset();
			}
			return;
		}
		if (event.key === "Escape") {
			setQuery("");
		}
	};

	if (showHero) {
		return (
			<HomeHero
				inputRef={searchInputRef}
				query={query}
				onQueryChange={setQuery}
				onKeyDown={handleKeyDown}
				mode={mode}
				onModeChange={setMode}
			/>
		);
	}

	return (
		<main className="relative w-full h-[calc(100dvh-3.625rem)] flex flex-col px-6 py-4 gap-4 overflow-hidden">
			{/* Top bar — shared search input + mode toggle + result chip. */}
			<div className="shrink-0 flex items-center gap-3">
				<div className="flex-1 max-w-3xl">
					<HighlightedSearchInput
						inputRef={searchInputRef}
						value={query}
						onChange={setQuery}
						onKeyDown={handleKeyDown}
						variant="compact"
					/>
				</div>
				<ModeToggle mode={mode} onChange={setMode} />
				{showResults && (
					<div className="text-xs text-muted-foreground flex items-center gap-2">
						<span>
							{hits.length} result{hits.length === 1 ? "" : "s"}
						</span>
						{isFetching && <GalaxySpinner size={18} />}
						{mode === "map" && hits.length > 0 && (
							<span className="ml-1 hidden md:inline">
								·{" "}
								<kbd className="font-mono text-[10px] px-1 py-0.5 rounded border border-primary/20 bg-card/60">
									⇧↵
								</kbd>{" "}
								lock
							</span>
						)}
					</div>
				)}
			</div>

			{/* Body — LEFT pane (preview / map) + RIGHT pane (results list).
			    Same shape across both modes; only the LEFT pane swaps. The
			    results list collapses when there's no query to give the
			    map full bleed. */}
			<div className="flex-1 min-h-0 flex gap-4">
				<div className="flex-[3] min-w-0 flex flex-col">
					{mode === "map" ? (
						<GalaxyMap ref={mapHandleRef} activeHit={activeHit} />
					) : hits.length === 0 ? (
						<EmptyPreview query={debouncedQuery} isFetching={isFetching} />
					) : selectedHit ? (
						<SelectedHitPreview hit={selectedHit} />
					) : null}
				</div>
				{showResults && (
					<div className="flex-[2] min-w-0 max-w-md flex flex-col">
						<ResultsPanel
							ref={listRef}
							hits={hits}
							results={results}
							selectedIndex={selectedIndex}
							isFetching={isFetching}
							query={debouncedQuery}
							onSelect={openHit}
							onHover={setSelectedIndex}
						/>
					</div>
				)}
			</div>
		</main>
	);
}

function EmptyPreview({
	query,
	isFetching,
}: {
	query: string;
	isFetching: boolean;
}) {
	return (
		<div className="flex-1 min-h-0 w-full rounded-lg border border-primary/15 bg-background/20 flex flex-col items-center justify-center text-sm text-muted-foreground">
			{isFetching ? (
				<GalaxySpinner size={200} label="Searching the galaxy…" />
			) : (
				<>
					<p>Nothing in orbit for &ldquo;{query}&rdquo;.</p>
					<p className="text-xs mt-1">Try a different search.</p>
				</>
			)}
		</div>
	);
}

interface ResultsPanelProps {
	hits: CatalogHit[];
	results: CatalogSearchResults;
	selectedIndex: number;
	isFetching: boolean;
	query: string;
	onSelect: (hit: CatalogHit) => void;
	onHover: (index: number) => void;
}

function ResultsPanel({
	hits,
	selectedIndex,
	isFetching,
	query,
	onSelect,
	onHover,
	ref,
}: ResultsPanelProps & { ref: React.Ref<HTMLDivElement> }) {
	if (hits.length === 0) {
		return (
			<div className="flex-1 min-h-0 rounded-xl border border-primary/15 bg-card/60 p-6 text-center text-sm text-muted-foreground flex items-center justify-center">
				{isFetching ? (
					<GalaxySpinner size={160} label="Searching the catalog…" />
				) : (
					<>No matches for &ldquo;{query}&rdquo;.</>
				)}
			</div>
		);
	}

	return (
		<div
			ref={ref}
			className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-primary/15 bg-card/60 shadow-lg shadow-primary/5 divide-y divide-primary/10"
		>
			{hits.map((hit, index) => (
				<HitRow
					key={hitKey(hit)}
					hit={hit}
					index={index}
					selected={index === selectedIndex}
					onClick={() => onSelect(hit)}
					onHover={() => onHover(index)}
				/>
			))}
		</div>
	);
}
