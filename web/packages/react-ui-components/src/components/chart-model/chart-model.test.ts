// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  filledCells,
  fixedScale,
  isLonePoint,
  niceMax,
  niceScale,
  plotRows,
  ratioOf,
  ringArcs,
  rowsInWindow,
  sampledSpanMs,
  seriesFigures,
  STATIC_STEPS,
  timeTicks,
  windowForViewport,
} from "./chart-model";

/** The shape the app's session store keeps (web/apps/omv-web-app/src/live/liveSamples.ts). */
interface SystemSample {
  t: number;
  cpu: number | null;
  memory: number | null;
}

const T0 = 1_700_000_000_000;
const every2s = (values: (number | null)[], from = T0): SystemSample[] =>
  values.map((cpu, i) => ({ t: from + i * 2000, cpu, memory: null }));
const cpu = (s: SystemSample) => s.cpu;

describe("scales", () => {
  it.each([
    [0, 1],
    [-3, 1],
    [0.42, 0.5],
    [0.9, 2],
    [4.3, 5],
    [43, 50],
    [87, 200],
    [1234, 2000],
    [9_000_000, 20_000_000],
  ])("rounds %s up to the nice top %s, leaving headroom", (value, top) => {
    expect(niceMax(value)).toBe(top);
  });

  it("puts a nice axis from 0 over the readings, ignoring missing ones", () => {
    expect(niceScale([null, 3.1, 7.4, null])).toEqual({
      domain: [0, 10],
      ticks: [0, 5, 10],
    });
    expect(niceScale([])).toEqual({ domain: [0, 1], ticks: [0, 0.5, 1] });
  });

  it("uses finer steps for a chart of things now, which does not move", () => {
    expect(niceScale([3.6, 7.2], STATIC_STEPS, 1.05)).toEqual({
      domain: [0, 8],
      ticks: [0, 4, 8],
    });
    expect(niceMax(130, 1.05, STATIC_STEPS)).toBe(150);
  });

  it("keeps a fixed axis, with its ends and middle unless ticks are given", () => {
    expect(fixedScale([0, 100])).toEqual({
      domain: [0, 100],
      ticks: [0, 50, 100],
    });
    expect(fixedScale([30, 90], [30, 60, 90]).ticks).toEqual([30, 60, 90]);
  });
});

describe("the window", () => {
  const samples = every2s(Array.from({ length: 40 }, (_, i) => i));

  it("shows the samples in the window and the one before, so the line meets the edge", () => {
    const shown = rowsInWindow(samples, 60_000);
    // 78 s of samples: the newest at 78 s, the window from 18 s; the 16 s one is kept for the edge.
    expect(shown[0]?.t).toBe(T0 + 16_000);
    expect(shown.at(-1)?.t).toBe(T0 + 78_000);
    expect(rowsInWindow([], 60_000)).toEqual([]);
  });

  it("claims only the span really sampled while the page is filling the window", () => {
    expect(sampledSpanMs(every2s([1, 2, 3, 4, 5]), 60_000)).toBe(8000);
    expect(sampledSpanMs(samples, 60_000)).toBe(60_000);
    expect(sampledSpanMs([], 60_000)).toBe(0);
  });

  it("uses a shorter window on a phone, never a longer one", () => {
    expect(windowForViewport(true, 60_000, 30_000)).toBe(30_000);
    expect(windowForViewport(false, 60_000, 30_000)).toBe(60_000);
    expect(windowForViewport(true, 20_000, 30_000)).toBe(20_000);
  });
});

describe("rows for drawing", () => {
  it("keeps a missing figure null, never 0", () => {
    const rows = plotRows(every2s([12, null, 14]), [cpu], 5000);
    expect(rows.map((r) => r.s0)).toEqual([12, null, 14]);
    expect(rows.map((r) => r.x)).toEqual([-4, -2, 0]);
  });

  it("breaks the line where sampling paused, with a gap row and no invented value", () => {
    const samples = [
      ...every2s([10, 11]),
      // The tab was hidden for 30 s: nothing was read.
      ...every2s([12, 13], T0 + 32_000),
    ];
    const rows = plotRows(samples, [cpu], 5000);
    expect(rows).toHaveLength(5);
    const gap = rows[2];
    expect(gap?.gap).toBe(true);
    expect(gap?.s0).toBeNull();
    expect(rows.filter((r) => !r.gap).map((r) => r.s0)).toEqual([
      10, 11, 12, 13,
    ]);
  });

  it("marks a reading with no neighbours as a lone point", () => {
    const rows = plotRows(every2s([null, 5, null, 6, 7]), [cpu], 5000);
    expect(isLonePoint(rows, "s0", 1)).toBe(true);
    expect(isLonePoint(rows, "s0", 3)).toBe(false);
    expect(isLonePoint(rows, "s0", 0)).toBe(false);
  });

  it("states now, highest and lowest inside the window, skipping missing readings", () => {
    const samples = every2s([90, 3, null, 40, 12]);
    // A 6 s window: the 90 is older than that and not counted.
    expect(seriesFigures(samples, cpu, 6000)).toEqual({
      now: 12,
      high: 40,
      low: 3,
      count: 3,
    });
    expect(seriesFigures(every2s([4, null]), cpu, 60_000).now).toBeNull();
  });
});

describe("the time axis", () => {
  it("fits round steps back from now to the width", () => {
    expect(timeTicks(60, 400)).toEqual([-60, -30, 0]);
    expect(timeTicks(60, 1000)).toEqual([-60, -45, -30, -15, 0]);
    expect(timeTicks(600, 900)).toEqual([-600, -480, -360, -240, -120, 0]);
    expect(timeTicks(30, 300)).toEqual([-30, -15, 0]);
  });
});

describe("meters and rings", () => {
  it("clamps a ratio and survives a zero total", () => {
    expect(ratioOf(2.2, 3.6)).toBeCloseTo(0.611, 3);
    expect(ratioOf(5, 4)).toBe(1);
    expect(ratioOf(1, 0)).toBe(0);
  });

  it("fills whole cells so the amount can be counted", () => {
    expect(filledCells(0, 24)).toBe(0);
    expect(filledCells(0.01, 24)).toBe(1);
    expect(filledCells(0.5, 24)).toBe(12);
    expect(filledCells(0.999, 24)).toBe(23);
    expect(filledCells(1, 40)).toBe(40);
  });

  it("gives each area an equal arc with a gap, and one area the whole ring", () => {
    const arcs = ringArcs(4);
    expect(arcs.map((a) => a.rotate)).toEqual([0, 90, 180, 270]);
    expect(arcs[0]?.length).toBeCloseTo(23.4, 5);
    expect(ringArcs(1)).toEqual([{ length: 100, rotate: 0 }]);
    expect(ringArcs(0)).toEqual([]);
  });
});
