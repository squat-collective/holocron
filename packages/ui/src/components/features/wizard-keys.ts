/**
 * Pure key-mapping helpers for `wizard-shared.tsx`.
 *
 * Lives in its own file (not the .tsx) so vitest can import it from a
 * `.test.ts` without bringing the JSX transformer along. The React-side
 * hooks in `wizard-shared.tsx` re-export these.
 */

export type GridNavOutcome = number | "commit" | null;

/**
 * Given the focused cell + the key pressed + the grid shape, return one
 * of:
 *   - a number — the next cell to focus
 *   - `"commit"` — the user pressed Enter or Space; activate the cell
 *   - `null` — key ignored (clamp at edges, unrecognised keys, etc.)
 *
 * The caller is responsible for `e.preventDefault()` on non-null
 * outcomes — this function is purely the decision logic.
 */
export function computeGridNavOutcome(
	idx: number,
	key: string,
	{ cols, length }: { cols: number; length: number },
): GridNavOutcome {
	const col = idx % cols;
	const row = Math.floor(idx / cols);
	switch (key) {
		case "ArrowRight":
			return col < cols - 1 && idx + 1 < length ? idx + 1 : null;
		case "ArrowLeft":
			return col > 0 ? idx - 1 : null;
		case "ArrowDown":
			return idx + cols < length ? idx + cols : null;
		case "ArrowUp":
			return row > 0 ? idx - cols : null;
		case "Enter":
		case " ":
			return "commit";
		default:
			return null;
	}
}

export type ListboxNavOutcome = number | "commit" | null;

/** Same shape as `computeGridNavOutcome` but for a 1D listbox. */
export function computeListboxNavOutcome(
	idx: number,
	key: string,
	length: number,
): ListboxNavOutcome {
	if (length === 0) return null;
	switch (key) {
		case "ArrowDown":
			return Math.min(idx + 1, length - 1);
		case "ArrowUp":
			return Math.max(idx - 1, 0);
		case "Home":
			return 0;
		case "End":
			return length - 1;
		case "Enter":
		case " ":
			return "commit";
		default:
			return null;
	}
}
