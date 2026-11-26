// SPDX-License-Identifier: GPL-3.0-or-later
// The live pair's pure rules: a pause or a missing value is a gap, never joined; each half of the
// mirrored chart has its own scale from the readings seen, never under the minimum; a trickle stays
// clear of the baseline; the end labels never sit on each other; and the span is said honestly.
import { describe, expect, it } from "vitest";
import { LIVE_START, liveReadings } from "../../fixtures/chart-fixtures";
import {
  endShare,
  linePath,
  LIVE_INTERVAL_MS,
  LIVE_WINDOW_MS,
  liveRange,
  liveSpan,
  liveSummary,
  MIN_RATE_SCALE,
  newestOf,
  PLOT_H,
  PLOT_W,
  rateScale,
  runsOf,
  spread,
  xAt,
  yAt,
} from "./live-pair-model";

const at = (vs: readonly (number | null)[]) =>
  vs.map((v, i) => ({ t: LIVE_START + i * LIVE_INTERVAL_MS, v }));

describe("the live pair's model", () => {
  it("breaks the line at a pause or a missing value, never joining across it", () => {
    const points = [
      { t: 0, v: 1 },
      { t: 2000, v: 2 },
      { t: 4000, v: null },
      { t: 6000, v: 3 },
      { t: 30000, v: 4 },
      { t: 32000, v: 5 },
    ];
    expect(runsOf(points).map((r) => r.length)).toEqual([2, 1, 2]);
    expect(
      linePath(points, { last: 32000, max: 10 }).match(/M/gu),
    ).toHaveLength(3);
  });

  it("draws a reading on its own one interval wide, never a dot", () => {
    const path = linePath([{ t: 0, v: 50 }], { last: 0, max: 100 });
    expect(path).toBe(
      `M${String(PLOT_W - (LIVE_INTERVAL_MS / LIVE_WINDOW_MS) * PLOT_W)} 50H${String(PLOT_W)}`,
    );
  });

  it("puts the newest reading at the right edge and the window's start at the left", () => {
    expect(xAt(1000, 1000)).toBe(PLOT_W);
    expect(xAt(1000 - LIVE_WINDOW_MS, 1000)).toBe(0);
  });

  it("scales each half on its own, from the readings seen, rounded to 1, 2 or 5 times a power of ten", () => {
    expect(rateScale(at([0.4, 38, 12]))).toBe(50);
    expect(rateScale(at([0.8, 1.7, 1.1]))).toBe(2);
    expect(rateScale(at([92]))).toBe(100);
    expect(rateScale(at([]))).toBe(MIN_RATE_SCALE);
    expect(rateScale(at([0.2]))).toBe(1);
    expect(rateScale(at([3]), 10)).toBe(10);
    // The busy set: a copy in at up to about 90 MiB/s, with about 1 MiB/s going out.
    const busy = liveReadings(40, (i) =>
      (i >= 6 && i < 18) || i >= 26 ? "copy-in" : "idle",
    );
    expect(rateScale(busy.received)).toBe(100);
    expect(rateScale(busy.sent)).toBe(2);
  });

  it("keeps a trickle out of 0.1 MiB/s clear of the baseline on the minimum scale", () => {
    const tiny = rateScale([{ t: 0, v: 0.1 }]);
    expect(tiny).toBe(1);
    const middle = PLOT_H / 2;
    // A tenth of the half's height: about 5 of the plot's 100 units, 5px on the 112px plot.
    expect(yAt(0.1, tiny, "down") - middle).toBeGreaterThan(4.5);
    // On the traffic in's scale it would lie on the baseline.
    expect(yAt(0.1, 100, "down") - middle).toBeLessThan(0.1);
  });

  it("keeps two end labels apart and inside the plot", () => {
    const [a, b] = spread(0.5, 0.52, 0.4);
    expect(Math.abs(a - b)).toBeCloseTo(0.4);
    expect(Math.min(a, b)).toBeGreaterThanOrEqual(0);
    expect(Math.max(a, b)).toBeLessThanOrEqual(1);
    expect(spread(0.1, 0.9, 0.4)).toEqual([0.1, 0.9]);
    expect(endShare(100, 100)).toBeCloseTo(0.03);
  });

  it("states the value now and the range seen, and how far back honestly", () => {
    const points = at([3, 41, 12]);
    expect(liveRange(points)).toEqual({ now: 12, min: 3, max: 41 });
    expect(liveRange(at([null]))).toBeNull();
    expect(liveRange(at([5, null]))).toEqual({ now: null, min: 5, max: 5 });
    expect(liveSummary("Processor", points, false)).toEqual({
      name: "Processor",
      range: { now: 12, min: 3, max: 41 },
      count: 3,
      span: { kind: "since", from: LIVE_START },
    });
    expect(liveSpan([], false)).toEqual({ kind: "none" });
    expect(liveSpan(points.slice(0, 1), false)).toEqual({
      kind: "one",
      at: LIVE_START,
    });
    expect(liveSpan(points, true)).toEqual({ kind: "window" });
  });

  it("finds the right edge every chart of a strip shares", () => {
    expect(newestOf(at([1, 2]), at([1, 2, 3]), [])).toBe(
      LIVE_START + 2 * LIVE_INTERVAL_MS,
    );
    expect(newestOf([], [])).toBeNull();
  });

  it("keeps only the window, from the newest reading back", () => {
    const long = liveReadings(80, () => "idle");
    expect(long.dropped).toBe(true);
    expect(long.processor.length).toBe(LIVE_WINDOW_MS / LIVE_INTERVAL_MS);
    const short = liveReadings(5, () => "idle");
    expect(short.dropped).toBe(false);
    // A rate needs two counter readings.
    expect(short.received).toHaveLength(4);
  });
});
