"use client";

import { Columns2, Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type Mode = "preview" | "map";

/** Two-button pill that switches the home shell between the search-result
 *  preview pane and the galaxy map. Mode is mirrored into the URL by the
 *  page so deep links land on the right view. */
export function ModeToggle({
	mode,
	onChange,
}: {
	mode: Mode;
	onChange: (next: Mode) => void;
}) {
	return (
		<div
			role="tablist"
			aria-label="View mode"
			className="inline-flex items-center rounded-full border border-primary/20 bg-card/60 p-0.5 text-xs"
		>
			<button
				type="button"
				role="tab"
				aria-selected={mode === "preview"}
				onClick={() => onChange("preview")}
				className={cn(
					"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
					mode === "preview"
						? "bg-primary/15 text-primary"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<Columns2 className="size-3.5" />
				Preview
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={mode === "map"}
				onClick={() => onChange("map")}
				className={cn(
					"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
					mode === "map"
						? "bg-primary/15 text-primary"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<Globe2 className="size-3.5" />
				Map
			</button>
		</div>
	);
}
