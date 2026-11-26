// SPDX-License-Identifier: GPL-3.0-or-later
// The chart lab's pure rules: what a meter reads from a file system row, the cells, the live window
// and its honest span, the chart geometry's gaps, and the temperatures' limit and labels.
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
import {
  cellsOf,
  DISKS,
  EVERY_MS,
  FILE_SYSTEMS,
  labelRows,
  linePath,
  liveAlt,
  niceMax,
  runsOf,
  sharedLimit,
  SMART_SETTINGS,
  spaceOf,
  spanWords,
  tempOf,
  tempScale,
  trimmed,
  WINDOW_MS,
  withCopy,
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

  it("fills cells exactly, the last one in part, and marks the cells past the mark", () => {
    const cells = cellsOf(62, 85, 20);
    expect(cells.slice(0, 12).every((c) => c.fill === 1)).toBe(true);
    expect(cells[12]?.fill).toBeCloseTo(0.4);
    expect(cells[13]?.fill).toBe(0);
    expect(cells.findIndex((c) => c.zone)).toBe(17);
    expect(cellsOf(50, null, 10).some((c) => c.zone)).toBe(false);
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

  it("puts labels that would overlap in separate rows", () => {
    expect(
      labelRows([
        { x: 100, width: 60 },
        { x: 120, width: 60 },
        { x: 300, width: 60 },
      ]),
    ).toEqual([0, 1, 0]);
  });
});
