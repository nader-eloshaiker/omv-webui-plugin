// SPDX-License-Identifier: GPL-3.0-or-later
// The segment bar's geometry (owner, 2026-11-27: "space used is one row of segments"), apart from how
// it is drawn, so it is tested without React. One row of 20 segments of 5 % each at every size,
// filled from the left, the last used segment filled in part, so nothing is rounded. OMV's default
// warning mark of 85 % falls between two segments, and a mark inside a segment splits it in two at
// the mark. Each size has one fixed width, and where a value sits depends on the value and the size
// alone, never on the mark, so the same value sits at the same place on every row of a list or table.

/** How many segments the bar has, at every size. */
export const SEGMENT_COUNT = 20;

/** What one segment stands for, percent. */
export const SEGMENT_SHARE = 100 / SEGMENT_COUNT;

/** One piece of the bar: a whole segment, or one of the two parts of the segment the mark splits. */
export interface SegmentPiece {
  /** The segment it belongs to, from the left, 0 to 19. */
  segment: number;
  /** The part of the whole it stands for, percent. */
  from: number;
  to: number;
  /** How much of it is used, 0 to 1: the last used piece is filled in part. */
  fill: number;
  /** It lies past the warning mark. */
  past: boolean;
}

export interface SegmentBarMark {
  /** The mark, percent, 0 to 100. */
  value: number;
  /** The segment the mark falls inside and splits, or null when it falls between two (or at an end). */
  split: number | null;
}

export interface SegmentBarModel {
  pieces: SegmentPiece[];
  mark: SegmentBarMark | null;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/** `used` and `mark` are percentages of the whole; `mark` null when none is set. */
export function segmentBarOf(
  used: number,
  mark: number | null,
): SegmentBarModel {
  const m = mark === null ? null : clamp(mark, 0, 100);
  const pieces: SegmentPiece[] = [];
  let split: number | null = null;
  const piece = (segment: number, from: number, to: number) => {
    pieces.push({
      segment,
      from,
      to,
      fill: clamp((used - from) / (to - from), 0, 1),
      past: m !== null && from >= m,
    });
  };
  for (let i = 0; i < SEGMENT_COUNT; i += 1) {
    const from = i * SEGMENT_SHARE;
    const to = from + SEGMENT_SHARE;
    if (m !== null && m > from && m < to) {
      split = i;
      piece(i, from, m);
      piece(i, m, to);
    } else {
      piece(i, from, to);
    }
  }
  return { pieces, mark: m === null ? null : { value: m, split } };
}

/** A bar's drawing size in pixels. */
export interface SegmentBarSize {
  /** One segment's width. */
  segment: number;
  /** One segment's height. */
  height: number;
  /** The gap between two segments. */
  gap: number;
  /** The gap at the mark, wider than the others, with the rule in its middle. */
  wide: number;
  /** How far the mark's rule reaches past the segments, above and below. */
  ext: number;
  /** The rule's width. */
  rule: number;
  /** The narrowest a piece of a split segment is drawn, so it still reads as a piece. */
  piece: number;
  /** The segments' corner radius. */
  radius: number;
}

/** The bar's fixed width at a size: 20 segments and the 19 gaps between them. */
export function segmentBarWidth(size: SegmentBarSize): number {
  return SEGMENT_COUNT * size.segment + (SEGMENT_COUNT - 1) * size.gap;
}

/**
 * Where a value sits, in pixels from the bar's left edge: inside its segment, in proportion. It
 * depends on the value and the size alone, so the same value lines up row under row.
 */
export function segmentBarX(value: number, size: SegmentBarSize): number {
  const v = clamp(value, 0, 100);
  const i = Math.min(SEGMENT_COUNT - 1, Math.floor(v / SEGMENT_SHARE));
  return (
    i * (size.segment + size.gap) +
    ((v - i * SEGMENT_SHARE) / SEGMENT_SHARE) * size.segment
  );
}

export interface SegmentBarDrawing {
  width: number;
  height: number;
  /** Each piece's left edge, width and filled width, in the order of `pieces`. */
  at: { x: number; w: number; filled: number }[];
  /** The straight rule at the mark, top to bottom. */
  rule: string | null;
  /** The rule's x, for the mark's value written above it. */
  ruleX: number | null;
}

const round2 = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * Where everything sits. The rule stands at the mark's exact value: in the middle of the gap between
 * two segments, or at the value inside the segment it splits. The pieces either side of it stop half
 * the wide gap short of it, so the gap there is wider than the others and the rule never steps.
 */
export function segmentBarDrawing(
  model: SegmentBarModel,
  size: SegmentBarSize,
): SegmentBarDrawing {
  const pitch = size.segment + size.gap;
  const width = segmentBarWidth(size);
  const height = size.height + 2 * size.ext;
  const m = model.mark;
  const ruleX =
    m === null
      ? null
      : clamp(
          m.split === null
            ? (m.value / SEGMENT_SHARE) * pitch - size.gap / 2
            : segmentBarX(m.value, size),
          size.rule / 2,
          width - size.rule / 2,
        );
  const at = model.pieces.map((p) => {
    const start = p.segment * pitch;
    const base = p.segment * SEGMENT_SHARE;
    let left = start + ((p.from - base) / SEGMENT_SHARE) * size.segment;
    let right = start + ((p.to - base) / SEGMENT_SHARE) * size.segment;
    if (ruleX !== null) {
      // Half the wide gap either side of the rule; but a narrow piece of a split segment keeps the
      // width of a piece, at the cost of its side of the gap, so it never reads as a second rule.
      const clear = size.rule / 2 + 0.5;
      if (p.past) {
        const end = right;
        left = Math.max(left, ruleX + size.wide / 2);
        if (end - left < size.piece) {
          left = Math.max(ruleX + clear, Math.min(left, end - size.piece));
        }
      } else {
        const start = left;
        right = Math.min(right, ruleX - size.wide / 2);
        if (right - start < size.piece) {
          right = Math.min(ruleX - clear, Math.max(right, start + size.piece));
        }
      }
    }
    const w = Math.max(0, right - left);
    return { x: left, w, filled: w * p.fill };
  });
  return {
    width,
    height,
    at,
    rule: ruleX === null ? null : `M${round2(ruleX)} 0V${round2(height)}`,
    ruleX,
  };
}

/** The three sizes a bar is drawn at: a row of a map or list, a table cell, a page of its own. */
export type SegmentBarSizeName = "row" | "cell" | "page";

/**
 * Every size has 20 segments of 5 %; only the pixels differ. The segments stand taller than they are
 * wide, so the bar has presence beside the words, and each size is one fixed width:
 * `row` 198px by 14 (a row of the NAS map), `cell` 148.5px by 12 (in a 36 to 44px table row, with
 * the rule's reach 18px in all), `page` 636px by 40 (a file system's own page, scaled down to a
 * narrower column).
 */
export const SEGMENT_BAR_SIZES: Readonly<
  Record<SegmentBarSizeName, SegmentBarSize>
> = {
  row: {
    segment: 8,
    height: 14,
    gap: 2,
    wide: 5,
    ext: 3,
    rule: 1.5,
    piece: 1.5,
    radius: 1.5,
  },
  cell: {
    segment: 6,
    height: 12,
    gap: 1.5,
    wide: 3.5,
    ext: 3,
    rule: 1.25,
    piece: 1.25,
    radius: 1,
  },
  page: {
    segment: 28,
    height: 40,
    gap: 4,
    wide: 12,
    ext: 7,
    rule: 2,
    piece: 3,
    radius: 4,
  },
};
