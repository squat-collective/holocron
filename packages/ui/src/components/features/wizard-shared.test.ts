import { describe, expect, it } from "vitest";

import {
	computeGridNavOutcome,
	computeListboxNavOutcome,
} from "./wizard-keys";

/* ---------------- computeGridNavOutcome ---------------- */

describe("computeGridNavOutcome", () => {
	const grid = { cols: 2, length: 5 };
	// Layout indexed left→right, top→bottom:
	//   0 1
	//   2 3
	//   4 _

	it("ArrowRight inside a row moves +1", () => {
		expect(computeGridNavOutcome(0, "ArrowRight", grid)).toBe(1);
	});

	it("ArrowRight at the end of a row clamps", () => {
		// idx=1 is the right edge of row 0 → no movement.
		expect(computeGridNavOutcome(1, "ArrowRight", grid)).toBeNull();
	});

	it("ArrowRight on the last row never falls off the end", () => {
		// idx=4 is the only cell in row 2 (length=5) — col<cols-1 is true,
		// but idx+1 (=5) is past `length`, so no movement.
		expect(computeGridNavOutcome(4, "ArrowRight", grid)).toBeNull();
	});

	it("ArrowLeft moves -1", () => {
		expect(computeGridNavOutcome(1, "ArrowLeft", grid)).toBe(0);
	});

	it("ArrowLeft at column 0 clamps", () => {
		expect(computeGridNavOutcome(0, "ArrowLeft", grid)).toBeNull();
	});

	it("ArrowDown moves down by one row", () => {
		expect(computeGridNavOutcome(0, "ArrowDown", grid)).toBe(2);
	});

	it("ArrowDown at the last row clamps", () => {
		// idx=3 (row 1, col 1) + cols (=2) = 5, past length → null.
		expect(computeGridNavOutcome(3, "ArrowDown", grid)).toBeNull();
	});

	it("ArrowUp moves up by one row", () => {
		expect(computeGridNavOutcome(2, "ArrowUp", grid)).toBe(0);
	});

	it("ArrowUp at row 0 clamps", () => {
		expect(computeGridNavOutcome(0, "ArrowUp", grid)).toBeNull();
	});

	it("Enter commits", () => {
		expect(computeGridNavOutcome(2, "Enter", grid)).toBe("commit");
	});

	it("Space commits", () => {
		expect(computeGridNavOutcome(2, " ", grid)).toBe("commit");
	});

	it("unknown keys return null", () => {
		expect(computeGridNavOutcome(0, "Tab", grid)).toBeNull();
		expect(computeGridNavOutcome(0, "x", grid)).toBeNull();
	});

	it("3-column grid with partial last row — arrow keys respect both row and length", () => {
		// 7 items / 3 cols → rows: [0,1,2] [3,4,5] [6]
		const odd = { cols: 3, length: 7 };
		// idx=5 is the right edge of row 1 (col=2) — ArrowRight clamps.
		// Right-arrow doesn't wrap to the next row by design; that's
		// what ArrowDown is for.
		expect(computeGridNavOutcome(5, "ArrowRight", odd)).toBeNull();
		// idx=6 is the lone last-row cell. col=0, so col<cols-1 holds,
		// but idx+1=7 is past length → no movement.
		expect(computeGridNavOutcome(6, "ArrowRight", odd)).toBeNull();
		// ArrowDown from idx=4 (col=1, row=1) lands on idx=7 — out of
		// bounds, so it clamps.
		expect(computeGridNavOutcome(4, "ArrowDown", odd)).toBeNull();
		// ArrowDown from idx=3 (col=0, row=1) reaches idx=6 — in-bounds.
		expect(computeGridNavOutcome(3, "ArrowDown", odd)).toBe(6);
	});
});

/* ---------------- computeListboxNavOutcome ---------------- */

describe("computeListboxNavOutcome", () => {
	it("ArrowDown moves +1", () => {
		expect(computeListboxNavOutcome(0, "ArrowDown", 5)).toBe(1);
	});

	it("ArrowDown clamps at the end (no wrap)", () => {
		// Long-list wrap feels jarring — last item should stay last.
		expect(computeListboxNavOutcome(4, "ArrowDown", 5)).toBe(4);
	});

	it("ArrowUp moves -1", () => {
		expect(computeListboxNavOutcome(2, "ArrowUp", 5)).toBe(1);
	});

	it("ArrowUp clamps at 0 (no wrap)", () => {
		expect(computeListboxNavOutcome(0, "ArrowUp", 5)).toBe(0);
	});

	it("Home jumps to 0", () => {
		expect(computeListboxNavOutcome(3, "Home", 5)).toBe(0);
	});

	it("End jumps to last", () => {
		expect(computeListboxNavOutcome(0, "End", 5)).toBe(4);
	});

	it("Enter commits", () => {
		expect(computeListboxNavOutcome(2, "Enter", 5)).toBe("commit");
	});

	it("Space commits", () => {
		expect(computeListboxNavOutcome(2, " ", 5)).toBe("commit");
	});

	it("unknown keys return null", () => {
		expect(computeListboxNavOutcome(0, "Tab", 5)).toBeNull();
	});

	it("empty list ignores every key", () => {
		// Defensive: a search box that trims results to zero shouldn't
		// emit phantom commits or move the cursor anywhere.
		for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "]) {
			expect(computeListboxNavOutcome(0, key, 0)).toBeNull();
		}
	});
});
