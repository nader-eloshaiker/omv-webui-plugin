// SPDX-License-Identifier: GPL-3.0-or-later
// What a live chart, a bar chart or a sparkline shows, apart from how it is drawn (foundation 8). Kept
// free of React and of Recharts so the scales, the window, the gaps and the figures a text
// alternative states can be read and tested on their own, and so a page can compute its caption
// without loading a chart.
//
// OMV keeps no history as numbers (journal A7): a chart only ever shows samples this tab received.
// A sample states only what it read: a missing figure is `null`, never 0, and is drawn as a gap.
// Nothing here interpolates, smooths or fills in a value.

/** Anything stamped with the time it was received, in milliseconds on this computer's clock. */
export interface Timed {
  t: number;
}

/** Reads one figure from a row; `null` or `undefined` (or a non-finite number) is "no reading". */
export type ValueOf<Row> = (row: Row) => number | null | undefined;

/** A figure, or null when it is not a finite number. */
export function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/* ─── Scales ──────────────────────────────────────────────────────────────────────────────────── */

/** A value axis: its extent and the values its gridlines and labels sit at. */
export interface Scale {
  domain: readonly [number, number];
  ticks: readonly number[];
}

/** 1, 2 and 5 times a power of ten: coarse, so a live axis seldom changes while it is watched. */
export const LIVE_STEPS = [1, 2, 5, 10] as const;
/** Finer steps for a chart of things now (sizes), which does not move: 8 TiB rather than 10. */
export const STATIC_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;

/**
 * The smallest "nice" top of an axis (by default 1, 2 or 5 times a power of ten) that leaves
 * `headroom` above `value`, so the highest reading never touches the top. 0 and anything not
 * positive give 1.
 */
export function niceMax(
  value: number,
  headroom = 1.15,
  steps: readonly number[] = LIVE_STEPS,
): number {
  const wanted = value * headroom;
  if (!Number.isFinite(wanted) || wanted <= 0) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(wanted));
  for (const step of steps) {
    // The rounding keeps 0.1 * 3 from landing a hair above 0.3.
    const top = Number((step * power).toPrecision(12));
    if (top >= wanted) {
      return top;
    }
  }
  return 10 * power;
}

/** A throughput-style axis from 0 to a nice top above the highest reading, with a middle line. */
export function niceScale(
  values: readonly (number | null)[],
  steps: readonly number[] = LIVE_STEPS,
  headroom = 1.15,
): Scale {
  let high = 0;
  for (const v of values) {
    if (v !== null && v > high) {
      high = v;
    }
  }
  const top = niceMax(high, headroom, steps);
  return { domain: [0, top], ticks: [0, top / 2, top] };
}

/** A fixed axis (percentages, temperatures): its ends and middle unless `ticks` are given. */
export function fixedScale(
  domain: readonly [number, number],
  ticks?: readonly number[],
): Scale {
  const [low, high] = domain;
  return { domain, ticks: ticks ?? [low, (low + high) / 2, high] };
}

/* ─── The window of samples a chart covers ────────────────────────────────────────────────────── */

/**
 * The rows a window of `windowMs` ending at the newest row shows, plus the one just before it, so the
 * line meets the left edge instead of starting short of it (the axis clips it). Rows are in time
 * order, as the session store keeps them.
 */
export function rowsInWindow<Row extends Timed>(
  rows: readonly Row[],
  windowMs: number,
): Row[] {
  const last = rows.at(-1);
  if (last === undefined) {
    return [];
  }
  const from = last.t - windowMs;
  const first = rows.findIndex((row) => row.t >= from);
  return rows.slice(Math.max(0, first - 1));
}

/**
 * How much time the samples inside the window actually cover, first to last, in milliseconds: what
 * a caption may claim ("last 58 s"), never the window's capacity while the page is still filling it.
 */
export function sampledSpanMs(
  rows: readonly Timed[],
  windowMs: number,
): number {
  const last = rows.at(-1);
  if (last === undefined) {
    return 0;
  }
  const from = last.t - windowMs;
  const first = rows.find((row) => row.t >= from) ?? last;
  return Math.min(windowMs, last.t - first.t);
}

/** The window a live chart uses: a shorter one on a phone, so the line stays readable. */
export function windowForViewport(
  phone: boolean,
  windowMs: number,
  narrowWindowMs: number,
): number {
  return phone ? Math.min(windowMs, narrowWindowMs) : windowMs;
}

/** A phone: a viewport narrower than 640px, the `sm` breakpoint. */
export const PHONE_QUERY = "(max-width: 639.98px)";

/* ─── Rows for drawing ────────────────────────────────────────────────────────────────────────── */

/** Where each series' value sits in a plot row: `s0` is the first series. */
export type SeriesKey = `s${number}`;
export const seriesKey = (index: number): SeriesKey => `s${index}`;

/** One row as a chart draws it. */
export interface PlotRow {
  /** Seconds before the newest row: 0 is the newest, -60 a minute earlier. */
  x: number;
  /** When it was received, for the tooltip and the table. */
  t: number;
  /** A break inserted where samples are missing: every value is null, and it has no tooltip. */
  gap: boolean;
  [key: SeriesKey]: number | null;
}

/**
 * The rows to draw, each with one value per series. Where two neighbouring rows are further apart
 * than `maxGapMs` (a sample missed, the tab hidden, the poll slowed), a break row with no values is
 * put between them, so the line stops there instead of bridging the time nobody sampled.
 */
export function plotRows<Row extends Timed>(
  rows: readonly Row[],
  values: readonly ValueOf<Row>[],
  maxGapMs: number,
): PlotRow[] {
  const last = rows.at(-1);
  if (last === undefined) {
    return [];
  }
  const out: PlotRow[] = [];
  let previous: Row | undefined;
  for (const row of rows) {
    if (previous !== undefined && row.t - previous.t > maxGapMs) {
      const t = (previous.t + row.t) / 2;
      const gap: PlotRow = { x: (t - last.t) / 1000, t, gap: true };
      values.forEach((_, i) => {
        gap[seriesKey(i)] = null;
      });
      out.push(gap);
    }
    const plotted: PlotRow = {
      x: (row.t - last.t) / 1000,
      t: row.t,
      gap: false,
    };
    values.forEach((value, i) => {
      plotted[seriesKey(i)] = finiteOrNull(value(row));
    });
    out.push(plotted);
    previous = row;
  }
  return out;
}

/**
 * Whether the value at `index` stands alone, with no drawable neighbour on either side: a line can
 * not show it, so the chart marks it with a dot.
 */
export function isLonePoint(
  rows: readonly PlotRow[],
  key: SeriesKey,
  index: number,
): boolean {
  const here = rows[index]?.[key];
  if (here === null || here === undefined) {
    return false;
  }
  const before = rows[index - 1]?.[key];
  const after = rows[index + 1]?.[key];
  return (
    (before === null || before === undefined) &&
    (after === null || after === undefined)
  );
}

/* ─── Figures for words ───────────────────────────────────────────────────────────────────────── */

/** What a series did inside the window: for a text alternative, a caption or a readout. */
export interface SeriesFigures {
  /** The newest reading, or null when the newest sample has none. */
  now: number | null;
  high: number | null;
  low: number | null;
  /** How many samples inside the window had a reading. */
  count: number;
}

/** The newest, highest and lowest readings of one series inside the window (not the row before it). */
export function seriesFigures<Row extends Timed>(
  rows: readonly Row[],
  value: ValueOf<Row>,
  windowMs: number,
): SeriesFigures {
  const last = rows.at(-1);
  if (last === undefined) {
    return { now: null, high: null, low: null, count: 0 };
  }
  const from = last.t - windowMs;
  let high: number | null = null;
  let low: number | null = null;
  let count = 0;
  for (const row of rows) {
    const v = row.t >= from ? finiteOrNull(value(row)) : null;
    if (v === null) {
      continue;
    }
    count += 1;
    high = high === null ? v : Math.max(high, v);
    low = low === null ? v : Math.min(low, v);
  }
  return { now: finiteOrNull(value(last)), high, low, count };
}

/* ─── The time axis ───────────────────────────────────────────────────────────────────────────── */

/**
 * The time ticks, in seconds before now: the window's start and "now" always, and round steps back
 * from now in between, as many as the width holds (about one per 130px). A step too close to the
 * start is left out so two labels never collide.
 */
export function timeTicks(windowS: number, widthPx: number): number[] {
  const room = Math.max(2, Math.floor(widthPx / 130));
  const steps = windowS >= 300 ? [60, 120, 300, 600] : [15, 30, 60, 120];
  const step = steps.find((s) => windowS / s <= room) ?? windowS;
  const ticks = [-windowS];
  for (
    let s = -step * Math.floor((windowS - 0.6 * step) / step);
    s < 0;
    s += step
  ) {
    ticks.push(s);
  }
  ticks.push(0);
  return ticks;
}

/* ─── Meters and rings ────────────────────────────────────────────────────────────────────────── */

/** `value / max` clamped to 0..1; 0 when `max` is not positive. */
export function ratioOf(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value / max));
}

/**
 * How many of `cells` a segmented meter fills. Rounded up, so anything above zero shows at least one
 * cell and only a full reading fills the last.
 */
export function filledCells(ratio: number, cells: number): number {
  if (ratio <= 0) {
    return 0;
  }
  if (ratio >= 1) {
    return cells;
  }
  return Math.min(cells - 1, Math.max(1, Math.ceil(ratio * cells - 1e-9)));
}

/** One arc of a ring drawn on a circle with pathLength 100, starting at twelve o'clock. */
export interface RingArc {
  /** The arc's length, 0 to 100. */
  length: number;
  /** Where it starts, in degrees clockwise from twelve o'clock. */
  rotate: number;
}

/**
 * Equal arcs, one per area, with a small gap between neighbours so each reads as its own part. One
 * area is a full ring with no gap.
 */
export function ringArcs(count: number, gap = 1.6): RingArc[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [{ length: 100, rotate: 0 }];
  }
  const share = 100 / count;
  return Array.from({ length: count }, (_, i) => ({
    length: Math.max(0, share - gap),
    rotate: i * share * 3.6,
  }));
}
