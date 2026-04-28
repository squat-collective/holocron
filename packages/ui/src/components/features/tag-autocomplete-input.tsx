"use client";

import { Tag } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { useTagsCatalog } from "@/hooks/use-tags-catalog";
import { cn } from "@/lib/utils";

/**
 * Tag input with autosuggest. Wraps a plain `<Input>` and overlays a
 * dropdown listbox of catalog tags that match the current draft. Free-
 * text entry still works (Enter / comma / Tab on the typed string),
 * keyboard navigation across the dropdown follows the same pattern as
 * the EntityPicker (combobox + listbox ARIA, roving cursor).
 *
 * Suggestions are filtered + ordered client-side from the cached
 * `/tags` payload, so typing has no per-keystroke network cost. We
 * exclude tags the user has already added and rank by usage count
 * (most-used first) so the dominant spelling surfaces.
 */
export interface TagAutocompleteInputProps {
	/** Current draft (controlled). */
	value: string;
	onValueChange: (next: string) => void;
	/** Called with a normalised tag (lowercased, `#`-stripped, trimmed). */
	onAdd: (normalised: string) => void;
	/** Called when Backspace is pressed on an empty draft. */
	onBackspaceEmpty?: () => void;
	/** Tags already chosen on this form — excluded from suggestions. */
	excluded: readonly string[];
	placeholder?: string;
	inputRef?: React.RefObject<HTMLInputElement | null>;
	/** Maximum suggestions to display (default 8). */
	maxSuggestions?: number;
}

const DEFAULT_MAX = 8;

function normalise(raw: string): string {
	return raw.trim().replace(/^#/, "").toLowerCase();
}

export function TagAutocompleteInput({
	value,
	onValueChange,
	onAdd,
	onBackspaceEmpty,
	excluded,
	placeholder,
	inputRef,
	maxSuggestions = DEFAULT_MAX,
}: TagAutocompleteInputProps) {
	const { data } = useTagsCatalog();
	const [cursor, setCursor] = useState(-1);
	const baseId = useId();
	const listboxId = `${baseId}-tags-list`;
	const optionId = (i: number) => `${baseId}-tag-${i}`;

	const draft = normalise(value);
	const excludedSet = useMemo(() => new Set(excluded), [excluded]);

	const suggestions = useMemo(() => {
		if (!data) return [];
		if (draft.length === 0) return [];
		return data.tags
			.filter((t) => !excludedSet.has(t.name) && t.name.includes(draft))
			.slice(0, maxSuggestions);
	}, [data, draft, excludedSet, maxSuggestions]);

	const showDropdown = suggestions.length > 0;
	// `-1` means cursor is on the input (Enter adds the literal typed
	// text); `0..N-1` selects a suggestion (Enter adds that one).
	const safeCursor = Math.min(Math.max(cursor, -1), suggestions.length - 1);

	const commitSuggestion = (idx: number) => {
		const pick = suggestions[idx];
		if (pick) {
			onAdd(pick.name);
			setCursor(-1);
		}
	};

	const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.metaKey || e.ctrlKey) return;

		if (e.key === "ArrowDown") {
			if (!showDropdown) return;
			e.preventDefault();
			setCursor((i) => Math.min(i + 1, suggestions.length - 1));
			return;
		}
		if (e.key === "ArrowUp") {
			if (!showDropdown) return;
			e.preventDefault();
			setCursor((i) => Math.max(i - 1, -1));
			return;
		}
		if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
			if (showDropdown && safeCursor >= 0) {
				e.preventDefault();
				commitSuggestion(safeCursor);
				return;
			}
			if (value.trim().length === 0) return;
			e.preventDefault();
			const normalised = normalise(value);
			if (normalised) onAdd(normalised);
			setCursor(-1);
			return;
		}
		if (e.key === "Escape" && showDropdown) {
			e.preventDefault();
			setCursor(-1);
			return;
		}
		if (e.key === "Backspace" && value === "" && onBackspaceEmpty) {
			e.preventDefault();
			onBackspaceEmpty();
		}
	};

	return (
		<div className="relative">
			<Input
				ref={inputRef}
				value={value}
				onChange={(e) => {
					onValueChange(e.target.value);
					setCursor(-1);
				}}
				onKeyDown={handleKey}
				placeholder={placeholder}
				className="h-11"
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={showDropdown}
				aria-controls={showDropdown ? listboxId : undefined}
				aria-activedescendant={
					showDropdown && safeCursor >= 0 ? optionId(safeCursor) : undefined
				}
			/>
			{showDropdown && (
				<ul
					id={listboxId}
					role="listbox"
					className="absolute z-20 top-full left-0 right-0 mt-1.5 rounded-md border border-primary/15 bg-popover shadow-lg shadow-primary/10 overflow-hidden max-h-64 overflow-y-auto"
				>
					{suggestions.map((tag, idx) => {
						const active = idx === safeCursor;
						return (
							<li
								key={tag.name}
								id={optionId(idx)}
								role="option"
								aria-selected={active}
							>
								<button
									type="button"
									onClick={() => commitSuggestion(idx)}
									onMouseEnter={() => setCursor(idx)}
									className={cn(
										"w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
										active ? "bg-primary/10" : "hover:bg-muted/40",
									)}
								>
									<Tag className="size-3.5 text-primary shrink-0" />
									<span className="flex-1 truncate font-mono text-[13px]">
										{tag.name}
									</span>
									<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
										{tag.count}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
