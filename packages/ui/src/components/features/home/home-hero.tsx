"use client";

import { HighlightedSearchInput } from "@/components/features/search/highlighted-search-input";
import { BrandIcon } from "@/lib/icons";
import { ModeToggle, type Mode } from "./mode-toggle";

interface HomeHeroProps {
	inputRef: React.Ref<HTMLInputElement>;
	query: string;
	onQueryChange: (next: string) => void;
	onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
	mode: Mode;
	onModeChange: (next: Mode) => void;
}

/** Empty-state landing screen — centred hero with the brand mark + search.
 *  Renders only when there's no active query and we're in preview mode. */
export function HomeHero({
	inputRef,
	query,
	onQueryChange,
	onKeyDown,
	mode,
	onModeChange,
}: HomeHeroProps) {
	return (
		<main className="relative w-full flex justify-center px-4 pt-16 sm:pt-24 pb-24">
			<div className="w-full max-w-2xl space-y-6">
				<div className="text-center space-y-3">
					<div className="flex items-center justify-center gap-3">
						<BrandIcon className="size-9 text-primary drop-shadow-[0_0_14px_oklch(0.72_0.22_290_/_0.5)]" />
						<h1 className="text-5xl font-bold tracking-tight">Holocron</h1>
					</div>
					<p className="text-muted-foreground">
						Search the galaxy of your data.
					</p>
				</div>

				<div>
					<HighlightedSearchInput
						inputRef={inputRef}
						value={query}
						onChange={onQueryChange}
						onKeyDown={onKeyDown}
						variant="hero"
					/>
					<div className="mt-4 flex items-center justify-center">
						<ModeToggle mode={mode} onChange={onModeChange} />
					</div>
					<p className="mt-3 text-center text-xs text-muted-foreground/80">
						<kbd className="inline-flex items-center gap-0.5 rounded border border-primary/20 bg-card/60 px-1.5 py-0.5 text-[10px] font-mono">
							↑↓
						</kbd>{" "}
						browse ·{" "}
						<kbd className="inline-flex items-center gap-0.5 rounded border border-primary/20 bg-card/60 px-1.5 py-0.5 text-[10px] font-mono">
							Enter
						</kbd>{" "}
						open
					</p>
				</div>
			</div>
		</main>
	);
}
