// SPDX-License-Identifier: GPL-3.0-or-later
// The chart lab's pure rules: what a meter reads from a file system row, the waffle's squares and
// its gap at the mark, the live window and its honest span, the chart geometry's gaps, each network
// half's own scale, and the temperatures' limit, stacks, labels and bay rows.
import { describe, expect, it } from "vitest";
import {
  NO_READINGS,
  record,
  seriesOf,
  STILL_COUNT,
  STILL_START,
  stillFeed,
  stillReadings,
} from "./feed.ts";
import type { Box, DiskTemp, StackLayout } from "./model.ts";
import {
  bayPerRow,
  bayRows,
  DISKS,
  DISKS_24,
  EVERY_MS,
  FILE_SYSTEMS,
  linePath,
  liveAlt,
  MIN_RATE_SCALE,
  niceMax,
  overlaps,
  PLOT_H,
  rateScale,
  runsOf,
  sharedLimit,
  SMART_SETTINGS,
  spaceOf,
  spanWords,
  stackLayout,
  stackRange,
  stacksOf,
  tempOf,
  tempScale,
  trimmed,
  waffleDrawing,
  waffleOf,
  WINDOW_MS,
  withCopy,
  yAt,
} from "./model.ts";

/** The figures carry a non-breaking space before their unit, as the pages write them. */
const nb = (words: string) =>
  words.replace(/(\d) (?=[%A-Za-z°])/gu, "$1\u00a0");

const fixture = (id: string) => {
  const f = FILE_SYSTEMS.find((x) => x.id === id);
  if (!f) {
    throw new Error(id);
  }
  return f;
};

describe("space", () => {
  it("reads percentage, available, size and the admin's mark from the file system row", () => {
    const data = spaceOf(fixture("data"));
    expect(data).toMatchObject({
      name: "Data drive",
      used: 62,
      free: nb("1.4 TiB"),
      total: nb("3.6 TiB"),
      mark: 85,
      over: false,
    });
    expect(data?.valueText).toBe(
      nb("62 % used, 1.4 TiB free of 3.6 TiB, the warning mark is at 85 %."),
    );
  });

  it("has no mark when the admin set 0, and is over only at or past the mark", () => {
    expect(spaceOf(fixture("tank"))?.mark).toBeNull();
    expect(spaceOf(fixture("media"))).toMatchObject({ used: 91, over: true });
  });

  it("has no reading for a file system that sends -1", () => {
    const missing = {
      ...fixture("data"),
      read: {
        ...fixture("data").read,
        percentage: -1,
        size: "-1",
        available: "-1",
      },
    };
    expect(spaceOf(missing)).toBeNull();
  });

  it("crosses the Data drive's mark after the 1 TiB copy", () => {
    const after = withCopy(FILE_SYSTEMS).find((f) => f.id === "data");
    expect(after && spaceOf(after)).toMatchObject({
      used: 90,
      free: nb("409.6 GiB"),
      over: true,
    });
  });

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

  it("puts OMV's default mark between two columns at every size", () => {
    for (const shape of [
      { cols: 20, rows: 5 },
      { cols: 20, rows: 2 },
    ]) {
      const w = waffleOf(62, 85, shape);
      expect(w.mark).toMatchObject({ value: 85, col: 17, j: 0 });
      expect(w.squares.findIndex((q) => q.past)).toBe(w.mark?.at);
    }
  });

  it("opens a gap at the mark: a straight rule between columns, a stepped one inside a column", () => {
    const shape = { cols: 20, rows: 5 };
    const size = { sq: 7, gap: 2, wide: 6, ext: 3 };
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
    expect(none.width).toBe(20 * 9 - 2);
  });

  it("marks the used squares past the mark, which take the warning fill only with the word", () => {
    const media = spaceOf(fixture("media"));
    const w = waffleOf(media?.used ?? 0, media?.mark ?? null, {
      cols: 20,
      rows: 5,
    });
    expect(w.squares.filter((q) => q.past && q.fill > 0)).toHaveLength(6);
    expect(media?.over).toBe(true);
    expect(spaceOf(fixture("data"))?.over).toBe(false);
  });
});

describe("live readings", () => {
  it("keeps two minutes and says how far back honestly", () => {
    const samples = Array.from({ length: 70 }, (_, i) => ({
      t: STILL_START + i * EVERY_MS,
    }));
    const { kept, dropped } = trimmed(samples);
    expect(dropped).toBe(true);
    expect(kept.length).toBe(WINDOW_MS / EVERY_MS);
    expect(spanWords(kept, dropped)).toBe("Last 2 minutes");
    expect(spanWords(samples.slice(0, 5), false)).toBe("Since 10:31");
    expect(spanWords(samples.slice(0, 1), false)).toBe("One reading, at 10:31");
    expect(spanWords([], false)).toBe("No reading yet");
  });

  it("has a network rate only from the second reading, as the app derives it", () => {
    const feed = stillFeed();
    const one = record(NO_READINGS, feed.next(STILL_START));
    expect(seriesOf(one).rx).toHaveLength(0);
    const two = record(one, feed.next(STILL_START + EVERY_MS));
    expect(seriesOf(two).rx).toHaveLength(1);
    expect(seriesOf(two).memTotal).toBe(4104114176);
  });

  it("gives the same 40 readings every time for still=1", () => {
    const a = seriesOf(stillReadings().readings);
    const b = seriesOf(stillReadings().readings);
    expect(a.cpu).toHaveLength(STILL_COUNT);
    expect(a).toEqual(b);
    expect(a.last).toBe(STILL_START + (STILL_COUNT - 1) * EVERY_MS);
  });

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
    expect(linePath(points, 32000, 10).match(/M/gu)).toHaveLength(3);
  });

  it("states the value now and the range seen", () => {
    const points = [
      { t: STILL_START, v: 3 },
      { t: STILL_START + EVERY_MS, v: 41 },
      { t: STILL_START + 2 * EVERY_MS, v: 12 },
    ];
    expect(
      liveAlt("Processor", points, false, (n) => nb(`${String(n)} %`)),
    ).toBe(nb("Processor: 12 % now, between 3 % and 41 % since 10:31."));
  });

  it("rounds a scale up to 1, 2 or 5 times a power of ten", () => {
    expect(niceMax(0.2)).toBe(1);
    expect(niceMax(1.3)).toBe(2);
    expect(niceMax(38)).toBe(50);
    expect(niceMax(92)).toBe(100);
  });

  it("scales each half of the network chart on its own, from the readings seen", () => {
    const at = (vs: number[]) =>
      vs.map((v, i) => ({ t: STILL_START + i * EVERY_MS, v }));
    expect(rateScale(at([0.4, 38, 12]))).toBe(50);
    expect(rateScale(at([0.8, 1.7, 1.1]))).toBe(2);
    expect(rateScale(at([]))).toBe(MIN_RATE_SCALE);
    // The still set: a copy in at up to about 90 MiB/s, with about 1 MiB/s going out.
    const s = seriesOf(stillReadings().readings);
    expect(rateScale(s.rx)).toBe(100);
    expect(rateScale(s.tx)).toBe(2);
  });

  it("keeps a trickle out of 0.1 MiB/s clear of the baseline on the minimum scale", () => {
    const tiny = rateScale([{ t: 0, v: 0.1 }]);
    expect(tiny).toBe(1);
    const middle = PLOT_H / 2;
    // On its own scale a tenth of the half's height: about 5 of the plot's 100 units, so 5px on
    // the 112px plot and 4px on the compact one.
    expect(yAt(0.1, tiny, "down") - middle).toBeGreaterThan(4.5);
    // On the traffic in's scale it would lie on the baseline.
    expect(yAt(0.1, 100, "down") - middle).toBeLessThan(0.1);
  });
});

describe("temperatures", () => {
  const disks = DISKS.map((d) => tempOf(d, SMART_SETTINGS));

  it("reads text or numbers, and leaves a sleeping disk unread", () => {
    expect(disks.map((d) => d.c)).toEqual([34, 36, 35, 37, null, 31]);
    expect(disks.find((d) => d.device === "sdd")?.asleep).toBe(true);
  });

  it("draws the limit only when one is set", () => {
    expect(sharedLimit(disks)).toBe(45);
    const none = DISKS.map((d) => tempOf(d, { tempmax: 0 }));
    expect(sharedLimit(none)).toBeNull();
    expect(tempScale(disks, 45)).toMatchObject({ lo: 25, hi: 50 });
  });
});

describe("temperatures along one scale, stacked", () => {
  const six = DISKS.map((d) => tempOf(d, SMART_SETTINGS));
  const bay = DISKS_24.map((d) => tempOf(d, SMART_SETTINGS));
  // The chart's width at 390 (the frame's 358 less its padding), at the lab's full width and wider.
  const WIDTHS = [326, 640, 900];

  function layoutAt(list: DiskTemp[], width: number): StackLayout {
    const stacks = stacksOf(list);
    return stackLayout(stacks, {
      width,
      ...stackRange(stacks, sharedLimit(list)),
    });
  }

  it("stacks the 24 disks by whole degree, coolest first, in bay order within a degree", () => {
    const stacks = stacksOf(bay);
    expect(stacks.map((s) => [s.c, s.disks.length])).toEqual([
      [31, 1],
      [33, 1],
      [34, 3],
      [35, 5],
      [36, 4],
      [37, 3],
      [38, 1],
      [39, 1],
      [41, 1],
      [43, 1],
      [46, 1],
    ]);
    expect(stacks.find((s) => s.c === 35)?.disks.map((d) => d.device)).toEqual([
      "sdb",
      "sdc",
      "sde",
      "sdk",
      "sdo",
    ]);
    // The two sleeping disks are in no stack.
    expect(stacks.reduce((n, s) => n + s.disks.length, 0)).toBe(22);
  });

  it("never lets one marker overlap another, ties included", () => {
    for (const list of [six, bay]) {
      for (const width of WIDTHS) {
        const layout = layoutAt(list, width);
        const marks = layout.stacks.flatMap((s) => s.markers);
        expect(marks).toHaveLength(list.filter((d) => d.c !== null).length);
        marks.forEach((a, i) => {
          marks.slice(i + 1).forEach((b) => {
            const apart = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
            expect(apart).toBeGreaterThanOrEqual(layout.m);
          });
        });
      }
    }
  });

  it("keeps every label inside the chart and clear of the other labels and every column", () => {
    for (const list of [six, bay]) {
      for (const width of WIDTHS) {
        const layout = layoutAt(list, width);
        const labels = layout.stacks.map((s) => s.label.box);
        const columns: Box[] = layout.stacks.map((s) => ({
          x1: s.x - layout.m / 2,
          y1: 0,
          x2: s.x + layout.m / 2,
          y2: s.top,
        }));
        labels.forEach((a, i) => {
          expect(a.x1).toBeGreaterThanOrEqual(0);
          expect(a.x2).toBeLessThanOrEqual(width);
          labels.forEach((b, j) => {
            if (i !== j) {
              expect(overlaps(a, b)).toBe(false);
            }
          });
          for (const c of columns) {
            expect(overlaps(a, c)).toBe(false);
          }
        });
      }
    }
  });

  it("names a column of up to three, counts a taller one, and always names the hottest", () => {
    const layout = layoutAt(bay, 640);
    const at = (c: number) => layout.stacks.find((s) => s.c === c)?.label;
    expect(at(34)).toMatchObject({
      kind: "names",
      lines: ["sda", "sdh", "sdr"],
    });
    expect(at(35)).toMatchObject({ kind: "count", lines: ["5 disks"] });
    expect(at(36)).toMatchObject({ kind: "count", lines: ["4 disks"] });
    expect(at(46)).toMatchObject({ kind: "names", lines: ["sdt"] });
    // The hottest sits on its column, never lifted away from it.
    expect(at(46)?.leader).toBe(false);
  });
});

describe("temperatures in bay order", () => {
  it("fills a row when the disks fit, and otherwise uses rows of 12, 8 or 6 as a chassis does", () => {
    expect(bayPerRow(6, 330, 48, 8)).toBe(6);
    expect(bayPerRow(24, 330, 48, 8)).toBe(6);
    expect(bayPerRow(24, 700, 48, 8)).toBe(12);
    expect(bayPerRow(24, 500, 48, 8)).toBe(8);
    const rows = bayRows(DISKS_24, 6);
    expect(rows.map((r) => r.length)).toEqual([6, 6, 6, 6]);
    expect(rows[3]?.at(-1)?.read.devicename).toBe("sdv");
  });
});
