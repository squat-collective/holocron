"use client";

import { Command as CommandKey } from "lucide-react";
import Link from "next/link";
import { useCosmicNav } from "@/hooks/use-cosmic-nav";
import { BrandIcon } from "@/lib/icons";

/**
 * Minimal header — brand on the left, ⌘K hint on the right. Every
 * navigation flows through the search home page or the command palette,
 * so there's no list/admin nav anymore.
 */
export function Header() {
	const cosmicNav = useCosmicNav();

	const intercept =
		(href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
			if (
				event.defaultPrevented ||
				event.button !== 0 ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				event.shiftKey
			) {
				return;
			}
			event.preventDefault();
			cosmicNav(href);
		};

	return (
		<header className="border-b border-primary/10 bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/50 relative z-20">
			<div className="container mx-auto px-4">
				<div className="flex h-14 items-center justify-between">
					<Link
						href="/"
						onClick={intercept("/")}
						className="flex items-center gap-2 font-bold text-lg"
					>
						<BrandIcon className="size-5 text-primary" />
						<span>Holocron</span>
					</Link>

					<kbd
						className="hidden sm:inline-flex items-center gap-1 rounded border bg-muted/50 px-2 py-1 text-[11px] font-mono text-muted-foreground"
						title="Press ⌘K (or Ctrl+K) to open the command palette"
					>
						<CommandKey className="size-3" />K
					</kbd>
				</div>
			</div>
		</header>
	);
}
