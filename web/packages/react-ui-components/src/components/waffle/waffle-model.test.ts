// SPDX-License-Identifier: GPL-3.0-or-later
// The waffle's geometry: squares filled exactly, a column at a time from the bottom; OMV's default
// mark between two columns at every size; the gap at the mark, straight between columns or stepped
// inside one; and which squares lie past it.
import { describe, expect, it } from "vitest";
import {
  WAFFLE_SHAPES,
  WAFFLE_SIZES,
  waffleDrawing,
  waffleOf,
} from "./waffle-model";

describe("the waffle's geometry", () => {
  it("fills squares exactly, the last one in part, a column at a time from the bottom", () => {
    const w = waffleOf(62.4, 85, { cols: 20, rows: 5 });
    expect(w.share).toBe(1);
    expect(w.squares.slice(0, 62).every((q) => q.fill === 1)).toBe(true);
    expect(w.squares[62]?.fill).toBeCloseTo(0.4);
    expect(w.squares[63]?.fill).toBe(0);
    // Square 62 is the third from the bottom of the thirteenth column.
    expect(w.squares[62]).toMatchObject({ col: 12, row: 2 });
    expect(waffleOf(50, null, { cols: 10, rows: 2 }).mark).toBeNull();
  });

  it("makes every column 5 % at every size", () => {
    for (const shape of Object.values(WAFFLE_SHAPES)) {
      expect(100 / shape.cols).toBe(5);
    }
  });

  it("puts OMV's default mark between two columns at every size", () => {
    for (const shape of Object.values(WAFFLE_SHAPES)) {
      const w = waffleOf(62, 85, shape);
      expect(w.mark).toMatchObject({ value: 85, col: 17, j: 0 });
      expect(w.squares.findIndex((q) => q.past)).toBe(w.mark?.at);
    }
  });

  it("opens a gap at the mark: a straight rule between columns, a stepped one inside a column", () => {
    const shape = WAFFLE_SHAPES.row;
    const size = WAFFLE_SIZES.row;
    const straight = waffleDrawing(waffleOf(62, 85, shape), shape, size);
    expect(straight.width).toBe(20 * 9 - 2 + 6);
    expect(straight.rule).toMatch(/^M[\d.]+ 0V[\d.]+$/u);
    // The last square before the mark and the first past it are a wider gap apart than any others.
    const before = straight.at[84];
    const after = straight.at[85];
    expect(before && after && after.x - (before.x + size.sq)).toBe(
      size.gap + size.wide,
    );
    const stepped = waffleDrawing(waffleOf(41, 88, shape), shape, size);
    expect(stepped.rule).toMatch(/H/u);
    // 88 % is 17 columns and three squares: the fourth square of column 17 moves with the past ones.
    expect(stepped.at[87]?.x).toBe(17 * 9);
    expect(stepped.at[88]?.x).toBe(17 * 9 + 6);
    const none = waffleDrawing(waffleOf(28, null, shape), shape, size);
    expect(none.rule).toBeNull();
    expect(none.ruleX).toBeNull();
    expect(none.width).toBe(20 * 9 - 2);
  });

  it("marks the used squares past the mark: six 1 % squares and three 2.5 % squares at 91 %", () => {
    const row = waffleOf(91, 85, WAFFLE_SHAPES.row);
    expect(row.squares.filter((q) => q.past && q.fill > 0)).toHaveLength(6);
    const cell = waffleOf(91, 85, WAFFLE_SHAPES.cell);
    expect(cell.squares.filter((q) => q.past && q.fill > 0)).toHaveLength(3);
  });

  it("keeps a mark of 0 or 100 at the ends", () => {
    expect(waffleOf(10, 0, WAFFLE_SHAPES.row).mark?.at).toBe(0);
    expect(waffleOf(10, 100, WAFFLE_SHAPES.row).mark?.at).toBe(100);
  });
});
