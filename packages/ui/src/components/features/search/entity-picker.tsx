"use client";

import { useQuery } from "@tanstack/react-query";
import {
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
	useId,
	useMemo,
	useState,
} from "react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import {
	getActorTypeIcon,
	getAssetTypeIcon,
	getContainerTypeIcon,
	type LucideIcon,
	RuleIcon,
	SchemaFieldIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Single shared picker for "find an entity to act on", powering every wizard
 * that used to roll its own debounce + abort + cursor + exact-match. All
 * results come from the hybrid search service (vector + FTS + DSL), so
 * apply-rule, attach-rule-to-asset, etc. all benefit from semantic ranking
 * for free. Caller-controlled tail options keep the wizard-specific "create
 * new" flows out of this component.
 */

export type HitKind = "asset" | "actor" | "rule" | "container" | "field";

export interface EntityHit {
	uid: string;
	name: string;
	kind: HitKind;
	type: string;
	severity?: "info" | "warning" | "critical";
	category?: string | null;
}

export interface TailOption {
	key: string;
	icon: LucideIcon;
	label: ReactNode;
	meta?: string;
	onSelect: () => void | Promise<void>;
}

interface SearchItem {
	kind?: string;
	uid?: string;
	name?: string;
	type?: string;
	severity?: string;
	category?: string | null;
}

export interface EntityPickerProps {
	query: string;
	onQueryChange: (q: string) => void;
	onPick: (hit: EntityHit) => void | Promise<void>;
	/** Limit results to these kinds. Empty / undefined = all kinds. */
	kinds?: readonly HitKind[];
	/** Further restrict to these `type` values (e.g. ["dataset","report"]). */
	types?: readonly string[];
	/** Hide hits whose uid is in this list (e.g. already-picked or self). */
	excludeUids?: Iterable<string>;
	placeholder?: string;
	inputRef?: RefObject<HTMLInputElement | null>;
	disabled?: boolean;
	className?: string;
	/** Render tail options shown below the entity rows (caller-owned "create new" flows). */
	renderTail?: (ctx: { query: string; hasExactMatch: boolean }) => readonly TailOption[];
	/** Called when Enter is pressed and the dropdown is empty/hidden. */
	onEnterFallback?: () => void;
	/** Called when Backspace is pressed and the input is empty. */
	onBackspaceEmpty?: () => void;
	/** Override icon + meta for a specific entity row (defaults to kind/type icon + type). */
	renderEntityMeta?: (hit: EntityHit) => { icon: LucideIcon; meta: string };
	/** How many hits to fetch from the API (default 20, displayed up to `displayLimit`). */
	fetchLimit?: number;
	displayLimit?: number;
	"aria-label"?: string;
}

const DEBOUNCE_MS = 150;
const ALL_KINDS: readonly HitKind[] = ["asset", "actor", "rule", "container", "field"];

function defaultEntityMeta(hit: EntityHit): { icon: LucideIcon; meta: string } {
	switch (hit.kind) {
		case "asset":
			return { icon: getAssetTypeIcon(hit.type), meta: hit.type };
		case "actor":
			return { icon: getActorTypeIcon(hit.type), meta: hit.type };
		case "rule":
			return { icon: RuleIcon, meta: hit.severity ?? "rule" };
		case "container":
			return { icon: getContainerTypeIcon(hit.type), meta: hit.type };
		case "field":
			return { icon: SchemaFieldIcon, meta: hit.type };
	}
}

function isHitKind(value: string): value is HitKind {
	return ALL_KINDS.includes(value as HitKind);
}

function projectHit(item: SearchItem): EntityHit | null {
	if (typeof item.uid !== "string" || typeof item.name !== "string") return null;
	if (typeof item.kind !== "string" || !isHitKind(item.kind)) return null;
	// Rules don't carry a `type` field in the API response (severity stands in);
	// fall back to the kind so consumers always have a stable string to display.
	const type = typeof item.type === "string" ? item.type : item.kind;
	const hit: EntityHit = {
		uid: item.uid,
		name: item.name,
		kind: item.kind,
		type,
	};
	if (item.severity === "info" || item.severity === "warning" || item.severity === "critical") {
		hit.severity = item.severity;
	}
	if (item.category !== undefined) hit.category = item.category;
	return hit;
}

function filterHits(
	items: SearchItem[],
	kindSet: ReadonlySet<HitKind> | null,
	typeSet: ReadonlySet<string> | null,
	excludeSet: ReadonlySet<string> | null,
	displayLimit: number,
): EntityHit[] {
	const out: EntityHit[] = [];
	for (const item of items) {
		const hit = projectHit(item);
		if (!hit) continue;
		if (kindSet && !kindSet.has(hit.kind)) continue;
		if (typeSet && !typeSet.has(hit.type)) continue;
		if (excludeSet?.has(hit.uid)) continue;
		out.push(hit);
		if (out.length >= displayLimit) break;
	}
	return out;
}

type Row = { kind: "entity"; hit: EntityHit } | { kind: "tail"; option: TailOption };

export function EntityPicker({
	query,
	onQueryChange,
	onPick,
	kinds,
	types,
	excludeUids,
	placeholder = "Search…",
	inputRef,
	disabled = false,
	className,
	renderTail,
	onEnterFallback,
	onBackspaceEmpty,
	renderEntityMeta = defaultEntityMeta,
	fetchLimit = 20,
	displayLimit = 10,
	"aria-label": ariaLabel,
}: EntityPickerProps) {
	const debounced = useDebounce(query, DEBOUNCE_MS);
	const trimmed = debounced.trim();
	const [cursor, setCursor] = useState(0);

	// Stable ids so the input can wire `aria-controls` and
	// `aria-activedescendant` at the listbox + the focused option.
	// Without these, screen readers can't follow the cursor as the user
	// arrows through the dropdown.
	const baseId = useId();
	const listboxId = `${baseId}-listbox`;
	const optionId = (idx: number) => `${baseId}-opt-${idx}`;

	const excludeSet = useMemo(() => (excludeUids ? new Set(excludeUids) : null), [excludeUids]);
	const kindSet = useMemo(
		() => (kinds && kinds.length > 0 ? new Set<HitKind>(kinds) : null),
		[kinds],
	);
	const typeSet = useMemo(() => (types && types.length > 0 ? new Set(types) : null), [types]);

	// Forward the wizard's allow-list to the API so the kind/type
	// filter applies *before* the top-N truncation. The previous
	// implementation pulled a globally-ranked top-N and then filtered
	// client-side, so a query that matched many other kinds first
	// would return the allowed kind empty even when matches existed
	// (#32). `filterHits` below stays as a defensive last pass for
	// excludeUids and to handle servers that don't yet support these
	// query params.
	const { data } = useQuery<{ items: SearchItem[] }>({
		queryKey: [
			"entity-picker",
			trimmed,
			fetchLimit,
			kinds ? [...kinds].sort() : null,
			types ? [...types].sort() : null,
		],
		queryFn: async ({ signal }) => {
			const params = new URLSearchParams();
			params.set("q", trimmed);
			params.set("limit", String(fetchLimit));
			if (kinds) for (const k of kinds) params.append("kind", k);
			if (types) for (const t of types) params.append("type", t);
			const res = await fetch(`/api/holocron/search?${params}`, { signal });
			if (!res.ok) throw new Error("search failed");
			return (await res.json()) as { items: SearchItem[] };
		},
		enabled: trimmed.length > 0 && !disabled,
		staleTime: 30_000,
	});

	const hits = useMemo<EntityHit[]>(
		() => (data ? filterHits(data.items, kindSet, typeSet, excludeSet, displayLimit) : []),
		[data, kindSet, typeSet, excludeSet, displayLimit],
	);

	const hasExactMatch = useMemo(() => {
		if (trimmed.length === 0) return false;
		const lower = trimmed.toLowerCase();
		return hits.some((h) => h.name.toLowerCase() === lower);
	}, [hits, trimmed]);

	const tail = useMemo<readonly TailOption[]>(() => {
		if (!renderTail) return [];
		return renderTail({ query: trimmed, hasExactMatch });
	}, [renderTail, trimmed, hasExactMatch]);

	const rows = useMemo<Row[]>(() => {
		const out: Row[] = hits.map((hit) => ({ kind: "entity", hit }));
		for (const option of tail) out.push({ kind: "tail", option });
		return out;
	}, [hits, tail]);

	const showDropdown = !disabled && rows.length > 0;
	const safeCursor = Math.min(cursor, Math.max(rows.length - 1, 0));

	const handleQueryChange = (next: string) => {
		onQueryChange(next);
		setCursor(0);
	};

	const commit = async (row: Row) => {
		if (row.kind === "entity") {
			await onPick(row.hit);
		} else {
			await row.option.onSelect();
		}
	};

	const handleEnter = (e: KeyboardEvent<HTMLInputElement>) => {
		if (!showDropdown) {
			if (!onEnterFallback) return;
			e.preventDefault();
			onEnterFallback();
			return;
		}
		e.preventDefault();
		const row = rows[safeCursor];
		if (row) void commit(row);
	};

	const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.metaKey || e.ctrlKey) return;
		switch (e.key) {
			case "ArrowDown":
				if (!showDropdown) return;
				e.preventDefault();
				setCursor((i) => Math.min(i + 1, rows.length - 1));
				return;
			case "ArrowUp":
				if (!showDropdown) return;
				e.preventDefault();
				setCursor((i) => Math.max(i - 1, 0));
				return;
			case "Enter":
				handleEnter(e);
				return;
			case "Backspace":
				if (query === "" && onBackspaceEmpty) {
					e.preventDefault();
					onBackspaceEmpty();
				}
				return;
		}
	};

	return (
		<div className={cn("relative", className)}>
			<Input
				ref={inputRef}
				value={query}
				onChange={(e) => handleQueryChange(e.target.value)}
				onKeyDown={handleKey}
				placeholder={placeholder}
				className="h-11"
				disabled={disabled}
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={showDropdown}
				aria-controls={showDropdown ? listboxId : undefined}
				aria-activedescendant={
					showDropdown && rows.length > 0 ? optionId(safeCursor) : undefined
				}
				aria-label={ariaLabel}
			/>
			{showDropdown && (
				<ul
					id={listboxId}
					role="listbox"
					className="absolute z-20 top-full left-0 right-0 mt-1.5 rounded-md border border-primary/15 bg-popover shadow-lg shadow-primary/10 overflow-hidden max-h-72 overflow-y-auto"
				>
					{rows.map((row, idx) => {
						const active = idx === safeCursor;
						if (row.kind === "entity") {
							const { icon: Icon, meta } = renderEntityMeta(row.hit);
							return (
								<li
								key={`hit-${row.hit.uid}`}
								id={optionId(idx)}
								role="option"
								aria-selected={active}
							>
									<button
										type="button"
										onClick={() => void commit(row)}
										onMouseEnter={() => setCursor(idx)}
										className={cn(
											"w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
											active ? "bg-primary/10" : "hover:bg-muted/40",
										)}
									>
										<Icon className="size-4 text-primary shrink-0" />
										<span className="flex-1 truncate">{row.hit.name}</span>
										<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
											{meta}
										</span>
									</button>
								</li>
							);
						}
						const { icon: Icon, label, meta, key } = row.option;
						return (
							<li
								key={`tail-${key}`}
								id={optionId(idx)}
								role="option"
								aria-selected={active}
							>
								<button
									type="button"
									onClick={() => void commit(row)}
									onMouseEnter={() => setCursor(idx)}
									className={cn(
										"w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
										active ? "bg-primary/10" : "hover:bg-muted/40",
									)}
								>
									<Icon className="size-4 text-primary shrink-0" />
									<span className="flex-1 truncate">{label}</span>
									{meta && (
										<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
											{meta}
										</span>
									)}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
