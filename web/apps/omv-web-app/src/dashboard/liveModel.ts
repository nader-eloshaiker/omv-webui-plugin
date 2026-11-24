// SPDX-License-Identifier: GPL-3.0-or-later
// What the dashboard's "Right now" card concludes from the session's live samples (dashboard spec
// 8.2): which interface to show, the rate unit shared by the figures and the axis, the network rows,
// and the readings table with a row where the line breaks. Pure, so each rule is tested by itself.
import type { NetworkDevice } from "@omv-webui/react-api-omv/generated";
import type { SystemSample, TrafficSample } from "../live/liveSamples.ts";
import { visibleInterfaces } from "./dashboard.ts";

/** The usual time between samples while the card is on screen (live/liveDemand.ts, LIVE_CHART_MS). */
export const LIVE_INTERVAL_MS = 2_000;
/** How far back the plots reach: one minute, half a minute on a phone. */
export const LIVE_WINDOW_MS = 60_000;
export const LIVE_NARROW_WINDOW_MS = 30_000;
/**
 * A pause longer than this breaks the line: 2.5 times the 10 s interval of the other pages, so the
 * samples read before the reader arrived join into a line instead of a row of lone dots. A hidden
 * tab still breaks it, honestly.
 */
export const LIVE_MAX_GAP_MS = 25_000;

/** A rate unit, binary (IEC), and what a reading in bytes per second is divided by to be in it. */
export type RateUnit = "kib" | "mib" | "gib";
const DIVISOR: Record<RateUnit, number> = {
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
};

/**
 * The unit for a window of rates, from its highest reading, so the figures and the axis share one
 * unit and a glide never changes unit midway: KiB/s under 1 MiB/s, MiB/s under 1 GiB/s, else GiB/s.
 */
export function rateUnit(highestBytesPerSecond: number): {
  unit: RateUnit;
  divisor: number;
} {
  const unit: RateUnit =
    highestBytesPerSecond >= DIVISOR.gib
      ? "gib"
      : highestBytesPerSecond >= DIVISOR.mib
        ? "mib"
        : "kib";
  return { unit, divisor: DIVISOR[unit] };
}

/** A rate in a unit, with one decimal, in the reader's locale: "1.2". */
export function rateNumber(value: number, divisor: number): string {
  return (value / divisor).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** One interface's rates over time, in bytes per second; null where the sample had none. */
export interface RateRow {
  t: number;
  rx: number | null;
  tx: number | null;
}

/** The rates of one interface, as rows for its plot. */
export function interfaceRates(
  traffic: readonly TrafficSample[],
  devicename: string,
): RateRow[] {
  return traffic.map((sample) => {
    const rate = sample.interfaces.get(devicename);
    return { t: sample.t, rx: rate?.rx ?? null, tx: rate?.tx ?? null };
  });
}

/** The highest rate in the last `windowMs` (counted back from the newest row), either direction; 0 for none. */
export function highestRate(
  rows: readonly RateRow[],
  windowMs: number,
): number {
  const newest = rows.at(-1)?.t;
  if (newest === undefined) {
    return 0;
  }
  let highest = 0;
  for (const row of rows) {
    if (row.t < newest - windowMs) {
      continue;
    }
    for (const value of [row.rx, row.tx]) {
      if (value !== null && Number.isFinite(value) && value > highest) {
        highest = value;
      }
    }
  }
  return highest;
}

/**
 * The interface the Network tile shows: the one this page most likely reaches the NAS through, when
 * it is listed; else the first connected one that is neither loopback nor virtual; else none.
 */
export function liveInterface(
  devices: readonly NetworkDevice[],
  thisPage: string | null,
): string | null {
  const { shown } = visibleInterfaces(devices);
  if (thisPage !== null && shown.some((d) => d.devicename === thisPage)) {
    return thisPage;
  }
  return shown.find((d) => d.link)?.devicename ?? null;
}

/** One row of the readings table: a sample with its network rates, or where the line breaks. */
export type ReadingRow =
  | {
      kind: "reading";
      t: number;
      cpu: number | null;
      memory: number | null;
      rx: number | null;
      tx: number | null;
    }
  | { kind: "gap"; after: number; before: number };

/** A traffic sample counts as read with a system sample when they arrived this close together. */
const SAME_READ_MS = 1_000;

/**
 * The readings table under the three plots (spec 8.2): one row per system sample in the window,
 * newest first, with the network rates read in the same round, and a "No readings" row where two
 * samples are further apart than the line joins.
 */
export function readingRows(
  system: readonly SystemSample[],
  rates: readonly RateRow[],
  windowMs: number,
  maxGapMs: number = LIVE_MAX_GAP_MS,
): ReadingRow[] {
  const newest = system.at(-1)?.t;
  if (newest === undefined) {
    return [];
  }
  const shown = system.filter((s) => s.t >= newest - windowMs);
  const rateAt = (t: number): RateRow | undefined => {
    let best: RateRow | undefined;
    for (const row of rates) {
      const apart = Math.abs(row.t - t);
      if (apart <= SAME_READ_MS && (!best || apart < Math.abs(best.t - t))) {
        best = row;
      }
    }
    return best;
  };
  const rows: ReadingRow[] = [];
  for (let i = shown.length - 1; i >= 0; i -= 1) {
    const sample = shown[i];
    if (sample === undefined) {
      continue;
    }
    const newer = shown[i + 1];
    if (newer !== undefined && newer.t - sample.t > maxGapMs) {
      rows.push({ kind: "gap", after: sample.t, before: newer.t });
    }
    const rate = rateAt(sample.t);
    rows.push({
      kind: "reading",
      t: sample.t,
      cpu: sample.cpu,
      memory: sample.memory,
      rx: rate?.rx ?? null,
      tx: rate?.tx ?? null,
    });
  }
  return rows;
}
