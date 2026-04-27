"use client";

import { Search } from "lucide-react";
import { memo, useLayoutEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Mirror of query_parser.py's `_ALIASES` keys + the explicit keys the
// parser recognises. If a prefix isn't in this set it gets flagged as a
// typo — so keep in sync or valid queries will look red.
const KNOWN_PREFIXES = new Set([
	"a",
	"ds",
	"dr",
	"dp",
	"dsys",
	"p",
	"t",
	"ac",
	"r",
	"c",
	"f",
	"kind",
	"type",
	"sev",
	"severity",
	"owner",
	"member",
	"member_of",
	"uses",
	"feeds",
	"rule",
	"rules",
	"rule_for",
	"rules_for",
]);

type Token = { start: number; text: string; cls: string };

// Walk the raw string left-to-right producing an array of `{text, class}`
// segments whose concatenation equals the input exactly — that's the
// invariant the overlay relies on for pixel-perfect alignment with the
// hidden <input>.
function tokenize(input: string): Token[] {
	const out: Token[] = [];
	let i = 0;
	while (i < input.length) {
		const ch = input.charAt(i);

		// Runs of whitespace → neutral.
		if (ch === " " || ch === "\t") {
			let j = i;
			while (j < input.length && (input.charAt(j) === " " || input.charAt(j) === "\t")) j++;
			out.push({ start: i, text: input.slice(i, j), cls: "" });
			i = j;
			continue;
		}

		// Bare quoted phrase `"..."`. Tolerates a missing closing quote so
		// the overlay doesn't flip colour on every intermediate keystroke.
		if (ch === '"') {
			let j = i + 1;
			while (j < input.length && input.charAt(j) !== '"') j++;
			const end = j < input.length ? j + 1 : j;
			out.push({ start: i, text: input.slice(i, end), cls: "text-amber-400" });
			i = end;
			continue;
		}

		// Negation: `-foo` / `!foo`. Only at the start of a token — a bare
		// hyphen (e.g. inside a word) stays neutral.
		if ((ch === "-" || ch === "!") && i + 1 < input.length && input.charAt(i + 1) !== " ") {
			let j = i;
			while (j < input.length && input.charAt(j) !== " ") j++;
			out.push({ start: i, text: input.slice(i, j), cls: "text-orange-400" });
			i = j;
			continue;
		}

		// Read up to next space or structural char to see if it's a prefix.
		let j = i;
		while (
			j < input.length &&
			input.charAt(j) !== " " &&
			input.charAt(j) !== ":" &&
			input.charAt(j) !== '"'
		) {
			j++;
		}

		if (j < input.length && input.charAt(j) === ":") {
			const prefix = input.slice(i, j);
			const known = KNOWN_PREFIXES.has(prefix.toLowerCase());
			out.push({
				start: i,
				text: prefix,
				cls: known
					? "text-primary font-semibold"
					: "text-destructive underline decoration-wavy decoration-destructive/60 underline-offset-2",
			});
			out.push({ start: j, text: ":", cls: "text-muted-foreground" });
			i = j + 1;

			// Value after the colon — quoted (amber), bare (cyan), or
			// nothing (trailing colon just waits for more input).
			if (i < input.length && input.charAt(i) === '"') {
				let k = i + 1;
				while (k < input.length && input.charAt(k) !== '"') k++;
				const end = k < input.length ? k + 1 : k;
				out.push({ start: i, text: input.slice(i, end), cls: "text-amber-400" });
				i = end;
			} else {
				let k = i;
				while (k < input.length && input.charAt(k) !== " ") k++;
				if (k > i) {
					out.push({ start: i, text: input.slice(i, k), cls: "text-cyan-400" });
					i = k;
				}
			}
			continue;
		}

		// Plain bare word — free-text / semantic search fodder.
		out.push({ start: i, text: input.slice(i, j), cls: "text-foreground" });
		i = j;
	}
	return out;
}

interface HighlightedSearchInputProps {
	value: string;
	onChange: (value: string) => void;
	onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
	variant: "hero" | "compact";
	inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Search input with live DSL colour-coding. The underlying native
 * <input> is transparent-text but still owns focus, caret, and
 * selection; a sibling overlay renders the same characters wrapped in
 * coloured spans. Both use identical padding/font metrics so the
 * overlay sits directly under the real cursor.
 *
 * Known prefixes (ds:, owner:, uses:, …) go primary; unknown prefixes
 * are flagged destructive with a wavy underline so typos are instantly
 * visible. Quoted phrases go amber, negations orange, bare values cyan.
 */
export const HighlightedSearchInput = memo(function HighlightedSearchInput({
	value,
	onChange,
	onKeyDown,
	variant,
	inputRef,
}: HighlightedSearchInputProps) {
	const localInputRef = useRef<HTMLInputElement | null>(null);
	const overlayRef = useRef<HTMLDivElement | null>(null);

	// Keep overlay.scrollLeft pinned to input.scrollLeft. `onScroll` catches
	// most updates but not all browsers fire it for <input>, so we also
	// re-sync in a layout effect on every value change.
	const syncScroll = () => {
		const inp = localInputRef.current;
		const ov = overlayRef.current;
		if (inp && ov) ov.scrollLeft = inp.scrollLeft;
	};
	useLayoutEffect(syncScroll, [value]);

	const isHero = variant === "hero";
	const tokens = tokenize(value);

	return (
		<div className="relative group">
			<Search
				className={cn(
					"pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary",
					isHero ? "left-4 size-5" : "left-4 size-4",
				)}
			/>
			<div
				ref={overlayRef}
				aria-hidden
				className={cn(
					"absolute inset-0 pointer-events-none overflow-hidden flex items-center whitespace-pre",
					isHero ? "pl-12 pr-4 text-base" : "pl-11 pr-4 text-sm",
				)}
			>
				<div className="whitespace-pre">
					{tokens.length === 0 ? (
						<span>&nbsp;</span>
					) : (
						tokens.map((tk) => (
							<span key={tk.start} className={tk.cls}>
								{tk.text}
							</span>
						))
					)}
				</div>
			</div>
			<Input
				ref={(el) => {
					localInputRef.current = el;
					if (typeof inputRef === "function") inputRef(el);
					else if (inputRef) {
						(inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
					}
				}}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={onKeyDown}
				onScroll={syncScroll}
				onInput={syncScroll}
				placeholder="Search assets, tables, columns, teams, rules…"
				aria-label="Search the catalog"
				spellCheck={false}
				autoComplete="off"
				className={cn(
					"rounded-full border border-primary/20 bg-card/75 shadow-lg shadow-primary/10",
					"focus-visible:ring-primary/40 focus-visible:border-primary/50",
					// Transparent real text: the overlay is the only visible
					// rendering. `caret-foreground` keeps the cursor visible;
					// the Input primitive's `selection:*` classes keep
					// highlighted text legible during selection.
					"text-transparent caret-foreground",
					isHero ? "h-14 pl-12 pr-4 text-base" : "h-11 pl-11 pr-4 text-sm",
				)}
			/>
		</div>
	);
});
