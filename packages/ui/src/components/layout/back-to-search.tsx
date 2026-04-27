"use client";

import Link from "next/link";
import { useCosmicNav } from "@/hooks/use-cosmic-nav";
import { Button } from "@/components/ui/button";

/**
 * "Back to Search" link used on every detail page. Routes through
 * useCosmicNav so the galaxy background runs its reverse-warp transition
 * on the way home — matching the Holocron brand link in the header.
 */
export function BackToSearch() {
	const cosmicNav = useCosmicNav();

	const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
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
		cosmicNav("/");
	};

	return (
		<Link href="/" onClick={onClick}>
			<Button variant="ghost" size="sm" className="gap-2">
				<svg
					className="h-4 w-4"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					strokeWidth={2}
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
					/>
				</svg>
				Back to Search
			</Button>
		</Link>
	);
}
