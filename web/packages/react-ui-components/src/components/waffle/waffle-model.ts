// SPDX-License-Identifier: GPL-3.0-or-later
// The waffle's geometry (owner, 2026-11-26: "space used is a waffle"), apart from how it is drawn, so
// it is tested without React. Squares each stand for a fixed share of the whole, filled a column at a
// time from the left and each column from the bottom, so the picture still reads as "more to the
// right". Every column is 5 % at every size (5 squares of 1 %, or 2 of 2.5 % in a table cell), so
// OMV's default warning mark of 85 % falls between two columns. A mark inside a column splits it: the
// gap steps round the squares before it.

/** How many squares across and up. */
export interface WaffleShape {
  cols: number;
  rows: number;
}

export interface WaffleSquare {
  /** The column, from the left. */
  col: number;
  /** The row, from the bottom. */
  row: number;
  /** How much of it is used, 0 to 1: the last used square is filled in part, nothing is rounded. */
  fill: number;
  /** It lies past the warning mark. */
  past: boolean;
}

export interface WaffleMark {
  /** The mark, percent. */
  value: number;
  /** How many squares lie before it: the mark at the nearest square boundary. */
  at: number;
  /** The column it falls in, and how many of that column's squares (from the bottom) are before it. */
  col: number;
  j: number;
}

export interface WaffleModel {
  squares: WaffleSquare[];
  /** What one square stands for, percent. */
  share: number;
  mark: WaffleMark | null;
}

/** `used` and `mark` are percentages of the whole; `mark` null when none is set. */
export function waffleOf(
  used: number,
  mark: number | null,
  shape: WaffleShape,
): WaffleModel {
  const count = shape.cols * shape.rows;
  const share = 100 / count;
  const at =
    mark === null
      ? null
      : Math.min(count, Math.max(0, Math.round(mark / share)));
  const squares = Array.from({ length: count }, (_, i) => ({
    col: Math.floor(i / shape.rows),
    row: i % shape.rows,
    fill: Math.min(1, Math.max(0, used / share - i)),
    past: at !== null && i >= at,
  }));
  return {
    squares,
    share,
    mark:
      at === null || mark === null
        ? null
        : {
            value: mark,
            at,
            col: Math.floor(at / shape.rows),
            j: at % shape.rows,
          },
  };
}

/** A waffle's drawing size in pixels: the square, the gap, the wider gap at the mark, the overhang. */
export interface WaffleSize {
  sq: number;
  gap: number;
  /** How much wider the gap at the mark is than the others. */
  wide: number;
  /** How far the mark's rule reaches past the squares, above and below. */
  ext: number;
  /** The squares' corner radius. */
  radius: number;
}

export interface WaffleDrawing {
  width: number;
  height: number;
  /** Each square's top left corner, in the order of `squares`. */
  at: { x: number; y: number }[];
  /** The rule in the gap at the mark: straight between two columns, or stepping round a split one. */
  rule: string | null;
  /** Where the rule meets the top, for the mark's value written above it. */
  ruleX: number | null;
}

const round2 = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * Where everything sits. The squares past the mark move right by `wide`, which opens the gap; when
 * the mark splits a column, the top of that column moves with them and the gap steps.
 */
export function waffleDrawing(
  model: WaffleModel,
  shape: WaffleShape,
  size: WaffleSize,
): WaffleDrawing {
  const { sq, gap, wide, ext } = size;
  const pitch = sq + gap;
  const shift = model.mark === null ? 0 : wide;
  const width = shape.cols * pitch - gap + shift;
  const height = shape.rows * pitch - gap + 2 * ext;
  const at = model.squares.map((s) => ({
    x: s.col * pitch + (s.past ? shift : 0),
    y: ext + (shape.rows - 1 - s.row) * pitch,
  }));
  const m = model.mark;
  if (m === null) {
    return { width, height, at, rule: null, ruleX: null };
  }
  const top = m.col * pitch + (wide - gap) / 2;
  if (m.j === 0) {
    return {
      width,
      height,
      at,
      rule: `M${round2(top)} 0V${round2(height)}`,
      ruleX: top,
    };
  }
  const bottom = m.col * pitch + sq + (gap + wide) / 2;
  const step = ext + (shape.rows - m.j) * pitch - gap / 2;
  return {
    width,
    height,
    at,
    rule: `M${round2(top)} 0V${round2(step)}H${round2(bottom)}V${round2(height)}`,
    ruleX: top,
  };
}

/** The three sizes a waffle is drawn at: a row of a map or list, a table cell, a page of its own. */
export type WaffleSizeName = "row" | "cell" | "page";

/** Every column is 5 % at every size: 1 % squares five high, or 2.5 % squares two high in a cell. */
export const WAFFLE_SHAPES: Readonly<Record<WaffleSizeName, WaffleShape>> = {
  row: { cols: 20, rows: 5 },
  cell: { cols: 20, rows: 2 },
  page: { cols: 20, rows: 5 },
};

export const WAFFLE_SIZES: Readonly<Record<WaffleSizeName, WaffleSize>> = {
  row: { sq: 7, gap: 2, wide: 6, ext: 3, radius: 1.5 },
  cell: { sq: 5, gap: 1.5, wide: 4, ext: 3, radius: 1 },
  page: { sq: 18, gap: 4, wide: 14, ext: 6, radius: 3 },
};
