"use client";

import {
	createContext,
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import {
	type GridNavOutcome,
	type ListboxNavOutcome,
	computeGridNavOutcome,
	computeListboxNavOutcome,
} from "./wizard-keys";

export type { GridNavOutcome, ListboxNavOutcome };
export { computeGridNavOutcome, computeListboxNavOutcome };

/**
 * Small shared primitives used by every wizard so the visual language stays
 * consistent: a progress bar across the top + a keyboard hint strip above
 * the footer. Plus the keyboard-navigation hooks every wizard should reach
 * for first (`useWizardAutoFocus`, `useGridNav`, `useListboxNav`,
 * `useConditionalAutoFocus`) so accessibility doesn't drift between
 * features.
 */

export function Stepper({
	current,
	total,
}: {
	current: number;
	total: number;
}) {
	return (
		<div className="flex items-center gap-1.5">
			{Array.from({ length: total }).map((_, i) => (
				<div
					key={i}
					className={cn(
						"h-1 flex-1 rounded-full transition-colors",
						i < current
							? "bg-primary"
							: i === current
								? "bg-primary/70"
								: "bg-muted",
					)}
				/>
			))}
		</div>
	);
}

export function Kbd({ children }: { children: ReactNode }) {
	return (
		<kbd className="inline-flex items-center gap-0.5 rounded border border-primary/20 bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-foreground/80">
			{children}
		</kbd>
	);
}

/* ------------------------------------------------------------------ */
/* Wizard focus: DRY autofocus behaviour across every step/phase      */
/*                                                                    */
/* Every wizard shell wraps its content in WizardFocusProvider so     */
/* `markInteracted` is reachable from anywhere in the tree, but the   */
/* autofocus hooks below ignore it — they always focus on mount.      */
/*                                                                    */
/* History: the provider used to gate autofocus on `hasInteracted`    */
/* so a wizard opened from ⌘K stayed "quiet" until the user pressed   */
/* Next. That broke arrow-key navigation on cold open: nothing got    */
/* focus, so ↑/↓ had no element to fire against (issue #7). The       */
/* provider stays for backwards compat with call sites that still     */
/* call `markInteracted`, but the autofocus contract is unconditional.*/
/*                                                                    */
/* Any primary element in any view just calls                         */
/*                                                                    */
/*     const ref = useRef<HTMLInputElement>(null);                    */
/*     useWizardAutoFocus(ref);                                       */
/*                                                                    */
/* and it gets focus on mount. No prop drilling, no per-dialog wiring.*/
/* ------------------------------------------------------------------ */

interface WizardFocusValue {
	hasInteracted: boolean;
	markInteracted: () => void;
}

const WizardFocusContext = createContext<WizardFocusValue>({
	hasInteracted: false,
	markInteracted: () => {},
});

export function WizardFocusProvider({
	initialInteracted,
	children,
}: {
	initialInteracted: boolean;
	children: ReactNode;
}) {
	const [hasInteracted, setHasInteracted] = useState(initialInteracted);
	const markInteracted = useCallback(() => {
		setHasInteracted(true);
	}, []);
	// useMemo-ish stable-ish object — small enough to just create; downstream
	// consumers only care about `hasInteracted` changes.
	const value: WizardFocusValue = { hasInteracted, markInteracted };
	return (
		<WizardFocusContext.Provider value={value}>
			{children}
		</WizardFocusContext.Provider>
	);
}

export function useWizardFocus(): WizardFocusValue {
	return useContext(WizardFocusContext);
}

/**
 * Attach this to any primary element to make it autofocus on mount.
 *
 * Runs once per mount inside `requestAnimationFrame` so the focus call
 * lands after Radix's own focus-management (we override
 * `onOpenAutoFocus` to a noop on every wizard Dialog — without this
 * hook the cold-open mount has no focused element and arrow keys go
 * nowhere). Subsequent re-renders of the same component don't refocus
 * because the effect only depends on the stable `ref` identity.
 */
export function useWizardAutoFocus<T extends HTMLElement>(
	ref: RefObject<T | null>,
): void {
	useEffect(() => {
		const raf = requestAnimationFrame(() => {
			ref.current?.focus();
		});
		return () => cancelAnimationFrame(raf);
	}, [ref]);
}

/**
 * Variant of `useWizardAutoFocus` for the multi-input case where a single
 * step renders different element types (Input / Textarea / Button)
 * depending on a discriminated spec — the single-ref hook can't compose
 * with a runtime branch.
 *
 * Pass a thunk that resolves the element at focus time:
 *
 *   const inputRef = useRef<HTMLInputElement>(null);
 *   const textareaRef = useRef<HTMLTextAreaElement>(null);
 *   useConditionalAutoFocus(
 *     () => spec.input === "textarea" ? textareaRef.current : inputRef.current,
 *     [spec.input],
 *   );
 */
export function useConditionalAutoFocus(
	resolve: () => HTMLElement | null,
	deps: ReadonlyArray<unknown>,
): void {
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		const raf = requestAnimationFrame(() => {
			resolve()?.focus();
		});
		return () => cancelAnimationFrame(raf);
	}, deps);
}

/* ------------------------------------------------------------------ */
/* Grid nav — the 2D button-grid pattern shared by every "pick a type" */
/* step (asset-create, actor-create, rule-create, schema-add-child).  */
/* ------------------------------------------------------------------ */

export interface UseGridNavOptions {
	/** Total number of cells. */
	length: number;
	/** Cells per row. */
	cols: number;
	/** Where the cursor starts. Out-of-range values clamp to 0. */
	initialIndex?: number;
	/** Called when the user presses Enter or Space on the focused cell. */
	onCommit?: (index: number) => void;
}

export interface UseGridNavResult {
	/** Index of the currently-focused cell. */
	cursor: number;
	/** Set the cursor manually (e.g. when the user clicks a cell). */
	setCursor: (index: number) => void;
	/**
	 * Ref array for the buttons. Wire each via
	 * `ref={(el) => { buttonsRef.current[idx] = el; }}` so the hook can
	 * move focus when the cursor changes.
	 */
	buttonsRef: RefObject<(HTMLButtonElement | null)[]>;
	/** Wire on each button as `onKeyDown={(e) => handleKey(e, idx)}`. */
	handleKey: (e: KeyboardEvent<HTMLElement>, index: number) => void;
}

/**
 * 2D arrow-key navigation for a button grid.
 *
 * - `←` / `→` move within a row (clamping at edges)
 * - `↑` / `↓` move between rows (clamping at top/bottom of the grid)
 * - `Enter` / `Space` call `onCommit(focusedIndex)` and prevent the
 *   default scroll-on-space behaviour
 * - Modifier keys are ignored so wizard-level shortcuts (`⌘↵` to advance
 *   to the next step) keep working when a grid cell has focus.
 *
 * Focus follows the cursor — but not on initial mount, so opening a step
 * doesn't yank focus into the grid before the user has interacted with
 * the dialog.
 */
export function useGridNav({
	length,
	cols,
	initialIndex = 0,
	onCommit,
}: UseGridNavOptions): UseGridNavResult {
	const safeInitial = Math.min(Math.max(0, initialIndex), Math.max(0, length - 1));
	const [cursor, setCursor] = useState(safeInitial);
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

	// Don't move focus on mount — the wizard's own autofocus hook owns
	// the initial focus target. Only subsequent cursor changes (driven
	// by arrow keys) follow the cursor.
	const cursorMountedRef = useRef(false);
	useEffect(() => {
		if (!cursorMountedRef.current) {
			cursorMountedRef.current = true;
			return;
		}
		buttonsRef.current[cursor]?.focus();
	}, [cursor]);

	const handleKey = useCallback(
		(e: KeyboardEvent<HTMLElement>, idx: number) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const outcome = computeGridNavOutcome(idx, e.key, { cols, length });
			if (outcome === null) return;
			if (outcome === "commit") {
				e.preventDefault();
				onCommit?.(idx);
				return;
			}
			e.preventDefault();
			setCursor(outcome);
		},
		[cols, length, onCommit],
	);

	return { cursor, setCursor, buttonsRef, handleKey };
}

/* ------------------------------------------------------------------ */
/* Listbox nav — the 1D list pattern shared by EntityPicker, the      */
/* add-consumers dropdown, and any future result/picker view.         */
/* ------------------------------------------------------------------ */

export interface UseListboxNavOptions<T> {
	items: readonly T[];
	/** Called when the user activates an item (Enter or Space). */
	onCommit?: (item: T, index: number) => void;
	/** Where the cursor starts. Default 0. */
	initialIndex?: number;
}

interface ListboxItemProps {
	role: "option";
	tabIndex: number;
	"aria-selected": boolean;
	id: string;
	ref: (el: HTMLElement | null) => void;
	onMouseEnter: () => void;
}

interface ListboxContainerProps {
	role: "listbox";
	"aria-activedescendant": string | undefined;
	tabIndex: number;
	onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

export interface UseListboxNavResult<T> {
	activeIndex: number;
	setActiveIndex: (i: number) => void;
	containerProps: ListboxContainerProps;
	itemProps: (index: number) => ListboxItemProps;
	activeItem: T | undefined;
}

/**
 * Roving-tabindex listbox — keyboard navigation + the ARIA spreaders to
 * make a `<div role="listbox">` actually screen-reader-friendly.
 *
 *  - `↑` / `↓` move the cursor (no wrap — feels jarring on long lists)
 *  - `Home` / `End` jump to ends
 *  - `Enter` / `Space` commit the active item
 *  - Mouse-hover updates the active index so click targets and keyboard
 *    targets stay in sync
 *
 * The single-tabindex pattern (only the active item is tabbable) keeps
 * the listbox a single Tab stop — assistive tech sees one widget, not N
 * buttons.
 */
export function useListboxNav<T>({
	items,
	onCommit,
	initialIndex = 0,
}: UseListboxNavOptions<T>): UseListboxNavResult<T> {
	const baseId = useId();
	const safeInitial = Math.min(
		Math.max(0, initialIndex),
		Math.max(0, items.length - 1),
	);
	const [activeIndex, setActiveIndexState] = useState(safeInitial);
	const itemRefs = useRef<(HTMLElement | null)[]>([]);

	// Clamp on length changes — a search box trimming results down to
	// zero shouldn't leave the cursor pointing at a stale row.
	useEffect(() => {
		if (items.length === 0) {
			setActiveIndexState(0);
			return;
		}
		setActiveIndexState((current) =>
			current >= items.length ? items.length - 1 : current,
		);
	}, [items.length]);

	const setActiveIndex = useCallback((i: number) => {
		setActiveIndexState(i);
	}, []);

	// Move browser focus to the active item when it changes by keyboard
	// — but not on mount, so the listbox doesn't steal focus.
	const mountedRef = useRef(false);
	useEffect(() => {
		if (!mountedRef.current) {
			mountedRef.current = true;
			return;
		}
		itemRefs.current[activeIndex]?.focus();
	}, [activeIndex]);

	const handleKey = useCallback(
		(e: KeyboardEvent<HTMLElement>) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const outcome = computeListboxNavOutcome(activeIndex, e.key, items.length);
			if (outcome === null) return;
			e.preventDefault();
			if (outcome === "commit") {
				const item = items[activeIndex];
				if (item !== undefined) onCommit?.(item, activeIndex);
				return;
			}
			setActiveIndexState(outcome);
		},
		[items, activeIndex, onCommit],
	);

	const itemId = useCallback((idx: number) => `${baseId}-opt-${idx}`, [baseId]);

	const containerProps: ListboxContainerProps = useMemo(
		() => ({
			role: "listbox",
			"aria-activedescendant":
				items.length > 0 ? itemId(activeIndex) : undefined,
			tabIndex: 0,
			onKeyDown: handleKey,
		}),
		[activeIndex, handleKey, items.length, itemId],
	);

	const itemProps = useCallback(
		(idx: number): ListboxItemProps => ({
			role: "option",
			tabIndex: idx === activeIndex ? 0 : -1,
			"aria-selected": idx === activeIndex,
			id: itemId(idx),
			ref: (el) => {
				itemRefs.current[idx] = el;
			},
			onMouseEnter: () => setActiveIndexState(idx),
		}),
		[activeIndex, itemId],
	);

	return {
		activeIndex,
		setActiveIndex,
		containerProps,
		itemProps,
		activeItem: items[activeIndex],
	};
}
