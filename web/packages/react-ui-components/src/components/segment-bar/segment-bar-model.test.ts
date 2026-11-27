// SPDX-License-Identifier: GPL-3.0-or-later
// The segment bar's geometry: twenty segments of 5 % at every size, filled exactly from the left;
// OMV's default mark as a straight rule between two segments, and a mark inside a segment splitting
// it; the same value at the same place whatever the mark; and the ends.
import { describe, expect, it } from "vitest";
import {
  SEGMENT_BAR_SIZES,
  SEGMENT_COUNT,
  segmentBarDrawing,
  segmentBarOf,
  segmentBarWidth,
  segmentBarX,
} from "./segment-bar-model";

const SIZES = Object.values(SEGMENT_BAR_SIZES);

/** The x where a drawing's used part ends: the right edge of the last piece with any fill. */
function fillEnd(value: number, mark: number | null, size = SIZES[0]) {
  if (size === undefined) {
    throw new Error("no size");
  }
  const d = segmentBarDrawing(segmentBarOf(value, mark), size);
  const filled = d.at.filter((p) => p.filled > 0);
  const last = filled.at(-1);
  return last === undefined ? 0 : last.x + last.filled;
}

describe("the segment bar's geometry", () => {
  it("has twenty segments of 5 % at every size, one fixed width each", () => {
    expect(SEGMENT_COUNT).toBe(20);
    const model = segmentBarOf(62, null);
    expect(model.pieces).toHaveLength(20);
    expect(model.pieces.map((p) => p.to - p.from)).toEqual(
      Array.from({ length: 20 }, () => 5),
    );
    for (const size of SIZES) {
      const d = segmentBarDrawing(model, size);
      expect(d.at).toHaveLength(20);
      expect(d.width).toBe(segmentBarWidth(size));
      // Every segment as wide as the next, and taller than the old 7px squares were wide.
      expect(new Set(d.at.map((p) => p.w))).toEqual(new Set([size.segment]));
      expect(size.height).toBeGreaterThan(7);
      expect(size.wide).toBeGreaterThan(size.gap);
    }
    expect(segmentBarWidth(SEGMENT_BAR_SIZES.row)).toBe(198);
  });

  it("fills from the left, the last used segment in part", () => {
    const model = segmentBarOf(62.4, 85);
    expect(model.pieces.slice(0, 12).every((p) => p.fill === 1)).toBe(true);
    expect(model.pieces[12]?.fill).toBeCloseTo(0.48);
    expect(model.pieces.slice(13).every((p) => p.fill === 0)).toBe(true);
    const size = SEGMENT_BAR_SIZES.row;
    const d = segmentBarDrawing(model, size);
    expect(d.at[12]?.filled).toBeCloseTo(0.48 * size.segment);
    expect(d.at[13]?.filled).toBe(0);
  });

  it("draws a mark at 85 % as a straight rule between segments 17 and 18", () => {
    for (const size of SIZES) {
      const model = segmentBarOf(62, 85);
      expect(model.mark).toEqual({ value: 85, split: null });
      expect(model.pieces).toHaveLength(20);
      expect(model.pieces.findIndex((p) => p.past)).toBe(17);
      const d = segmentBarDrawing(model, size);
      const pitch = size.segment + size.gap;
      // In the middle of the boundary after the 17th segment.
      expect(d.ruleX).toBe(17 * pitch - size.gap / 2);
      expect(d.rule).toMatch(/^M[\d.]+ 0V[\d.]+$/u);
      // The gap there is the wide one, the others the plain gap.
      const before = d.at[16];
      const after = d.at[17];
      expect(before && after && after.x - (before.x + before.w)).toBeCloseTo(
        size.wide,
      );
      const plain = d.at[15];
      expect(plain && before && before.x - (plain.x + plain.w)).toBeCloseTo(
        size.gap,
      );
    }
  });

  it("splits segment 18 at a mark of 88 %, the rule at the mark between the two pieces", () => {
    for (const size of SIZES) {
      const model = segmentBarOf(41, 88);
      expect(model.mark).toEqual({ value: 88, split: 17 });
      expect(model.pieces).toHaveLength(21);
      const [a, b] = model.pieces.filter((p) => p.segment === 17);
      expect(a).toMatchObject({ from: 85, to: 88, past: false });
      expect(b).toMatchObject({ from: 88, to: 90, past: true });
      const d = segmentBarDrawing(model, size);
      expect(d.ruleX).toBeCloseTo(segmentBarX(88, size));
      expect(d.rule).toMatch(/^M[\d.]+ 0V[\d.]+$/u);
      const pa = d.at[17];
      const pb = d.at[18];
      if (pa === undefined || pb === undefined) {
        throw new Error("no pieces");
      }
      const ruleX = d.ruleX ?? 0;
      // Both pieces drawn, at least a piece wide, either side of the rule and clear of it.
      expect(pa.w).toBeGreaterThanOrEqual(size.piece);
      expect(pb.w).toBeGreaterThanOrEqual(size.piece);
      expect(pa.x + pa.w).toBeLessThan(ruleX - size.rule / 2);
      expect(pb.x).toBeGreaterThan(ruleX + size.rule / 2);
      // The larger piece keeps half the wide gap; the gap between the two is wider than the others.
      expect(ruleX - (pa.x + pa.w)).toBeCloseTo(size.wide / 2);
      expect(pb.x - (pa.x + pa.w)).toBeGreaterThan(size.gap);
    }
  });

  it("keeps a narrow piece of a split segment a piece wide, never a hairline", () => {
    const size = SEGMENT_BAR_SIZES.row;
    // 88 %: the piece past the mark stands for 2 %, 3.2px, and half the wide gap would leave 0.7px.
    const d = segmentBarDrawing(segmentBarOf(95, 88), size);
    const past = d.at[18];
    expect(past?.w).toBe(size.piece);
    // Its right edge stays the segment's own.
    expect(past && past.x + past.w).toBeCloseTo(17 * 10 + 8);
  });

  it("puts the same value at the same place at a given size, whatever the mark", () => {
    for (const size of SIZES) {
      const at = segmentBarX(62, size);
      expect(fillEnd(62, 85, size)).toBeCloseTo(at);
      expect(fillEnd(62, 88, size)).toBeCloseTo(at);
      expect(fillEnd(62, null, size)).toBeCloseTo(at);
      // And the mark's rule stands still whatever is used.
      const rules = [10, 62, 91].map(
        (used) => segmentBarDrawing(segmentBarOf(used, 85), size).ruleX,
      );
      expect(new Set(rules).size).toBe(1);
    }
  });

  it("marks the used pieces past the mark", () => {
    const model = segmentBarOf(91, 85);
    expect(model.pieces.filter((p) => p.past && p.fill > 0)).toHaveLength(2);
    expect(model.pieces.filter((p) => !p.past && p.fill > 0)).toHaveLength(17);
  });

  it("draws 0 and 100 with nothing rounded", () => {
    const size = SEGMENT_BAR_SIZES.row;
    const empty = segmentBarDrawing(segmentBarOf(0, 85), size);
    expect(empty.at.every((p) => p.filled === 0)).toBe(true);
    const full = segmentBarDrawing(segmentBarOf(100, 85), size);
    expect(full.at.every((p) => p.filled === p.w)).toBe(true);
    expect(fillEnd(100, null)).toBe(segmentBarWidth(size));
    // A hair over a boundary shows, a hair under a whole does not fill it.
    expect(segmentBarOf(0.4, null).pieces[0]?.fill).toBeCloseTo(0.08);
    expect(segmentBarOf(99.6, null).pieces[19]?.fill).toBeCloseTo(0.92);
  });

  it("keeps a mark of 0 or 100 inside the drawing, at its end", () => {
    const size = SEGMENT_BAR_SIZES.row;
    const low = segmentBarDrawing(segmentBarOf(10, 0), size);
    expect(low.ruleX).toBe(size.rule / 2);
    expect(segmentBarOf(10, 0).pieces.every((p) => p.past)).toBe(true);
    const high = segmentBarDrawing(segmentBarOf(10, 100), size);
    expect(high.ruleX).toBe(segmentBarWidth(size) - size.rule / 2);
    expect(segmentBarOf(10, 100).pieces.some((p) => p.past)).toBe(false);
  });

  it("draws no rule and no wide gap with no mark", () => {
    for (const size of SIZES) {
      const model = segmentBarOf(28, null);
      expect(model.mark).toBeNull();
      expect(model.pieces.some((p) => p.past)).toBe(false);
      const d = segmentBarDrawing(model, size);
      expect(d.rule).toBeNull();
      expect(d.ruleX).toBeNull();
      for (let i = 1; i < d.at.length; i += 1) {
        const prev = d.at[i - 1];
        const cur = d.at[i];
        expect(prev && cur && cur.x - (prev.x + prev.w)).toBeCloseTo(size.gap);
      }
    }
  });
});
