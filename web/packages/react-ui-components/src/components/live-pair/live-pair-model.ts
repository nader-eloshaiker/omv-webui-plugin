// SPDX-License-Identifier: GPL-3.0-or-later
// What the paired live charts show (owner, 2026-11-26: "two charts, four series"), apart from how they
// are drawn: the window, the gaps, each half's own scale, where the end labels sit, and the figures a
// text alternative states. Pure, so every rule is tested without React, and free of words: the
// caller turns a summary or a span into its own sentence.
//
// Only the readings the page itself took are drawn, by the time each arrived: the newest at the right
// edge, an empty stretch where the page was not yet open, a gap where it paused (journal 2026-11-24,
// decision 3). Nothing here interpolates, smooths or fills in a value.
import { niceMax } from "../chart-model/chart-model";

/** One reading of one series: when this page received it, and its value (null: none). */
export interface LivePoint {
  t: number;
  v: number | null;
}

/** A reading every 2 seconds, two minutes across: the session's live poll (journal 2026-11-24). */
export const LIVE_INTERVAL_MS = 2000;
export const LIVE_WINDOW_MS = 120_000;

/** The plot's width and height in its own units: drawn at any width with `preserveAspectRatio="none"`. */
export const PLOT_W = 600;
export const PLOT_H = 100;
/** Room above and below so a stroke on the top or bottom is not cut in half. */
const PAD = 3;

/** Where a reading taken at `t` sits when the newest reading, at `last`, is at the right edge. */
export function xAt(
  t: number,
  last: number,
  windowMs: number = LIVE_WINDOW_MS,
): number {
  return PLOT_W - ((last - t) / windowMs) * PLOT_W;
}

/** How a value is placed: on the whole height, up from the middle, or down from it. */
export type PlotHalf = "full" | "up" | "down";

/** A value's height on a scale from 0 to `max`. */
export function yAt(v: number, max: number, half: PlotHalf): number {
  const k = Math.min(1, Math.max(0, max > 0 ? v / max : 0));
  if (half === "full") {
    return PLOT_H - PAD - k * (PLOT_H - 2 * PAD);
  }
  const middle = PLOT_H / 2;
  const reach = middle - PAD;
  return half === "up" ? middle - k * reach : middle + k * reach;
}

/**
 * The runs of joined points: a missing value, or two readings further apart than `joinMs` (by
 * default two and a half intervals), starts a new run. A pause is a gap, never a guess.
 */
export function runsOf(
  points: readonly LivePoint[],
  joinMs: number = LIVE_INTERVAL_MS * 2.5,
): { t: number; v: number }[][] {
  const runs: { t: number; v: number }[][] = [];
  let run: { t: number; v: number }[] = [];
  let prev: number | null = null;
  for (const p of points) {
    if (p.v === null || (prev !== null && p.t - prev > joinMs)) {
      if (run.length > 0) {
        runs.push(run);
      }
      run = [];
    }
    if (p.v !== null) {
      run.push({ t: p.t, v: p.v });
    }
    prev = p.t;
  }
  if (run.length > 0) {
    runs.push(run);
  }
  return runs;
}

const round1 = (n: number) => (Math.round(n * 10) / 10).toString();

export interface LineGeometry {
  /** The newest reading's time, at the right edge. */
  last: number;
  /** The top of the scale. */
  max: number;
  half?: PlotHalf;
  windowMs?: number;
  intervalMs?: number;
}

/** The line through the points, one subpath per run. A reading on its own is one interval wide. */
export function linePath(
  points: readonly LivePoint[],
  {
    last,
    max,
    half = "full",
    windowMs = LIVE_WINDOW_MS,
    intervalMs = LIVE_INTERVAL_MS,
  }: LineGeometry,
): string {
  return runsOf(points, intervalMs * 2.5)
    .map((run) => {
      const first = run[0];
      if (first === undefined) {
        return "";
      }
      if (run.length === 1) {
        const x = xAt(first.t, last, windowMs);
        const y = round1(yAt(first.v, max, half));
        return `M${round1(x - (intervalMs / windowMs) * PLOT_W)} ${y}H${round1(x)}`;
      }
      return run
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"}${round1(xAt(p.t, last, windowMs))} ${round1(yAt(p.v, max, half))}`,
        )
        .join("");
    })
    .join("");
}

/** The newest value's height as a share of the plot from its top, for a label beside the line's end. */
export function endShare(
  v: number,
  max: number,
  half: PlotHalf = "full",
): number {
  return yAt(v, max, half) / PLOT_H;
}

/**
 * Two labels beside the ends of two lines, kept at least `gap` (a share of the plot's height) apart
 * and inside the plot, so they never sit on each other.
 */
export function spread(a: number, b: number, gap: number): [number, number] {
  if (Math.abs(a - b) >= gap) {
    return [a, b];
  }
  const mid = (a + b) / 2;
  const lo = Math.min(1 - gap, Math.max(0, mid - gap / 2));
  return a <= b ? [lo, lo + gap] : [lo + gap, lo];
}

/** The newest value and the range seen. */
export interface LiveRange {
  now: number | null;
  min: number;
  max: number;
}

/** The newest value and the range seen; null when nothing was read. */
export function liveRange(points: readonly LivePoint[]): LiveRange | null {
  const values = points.flatMap((p) => (p.v === null ? [] : [p.v]));
  if (values.length === 0) {
    return null;
  }
  return {
    now: points.at(-1)?.v ?? null,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/**
 * The smallest scale a half of a mirrored chart takes, in the caller's unit, so a trickle stands
 * clear of the baseline instead of lying on it: for rates in MiB/s, 1.
 */
export const MIN_RATE_SCALE = 1;

/**
 * One half of a mirrored chart: its own scale, from the readings the page holds, rounded up to 1, 2 or
 * 5 times a power of ten and never under `floor`. The halves are scaled apart, so a copy in at
 * 90 MiB/s does not flatten the 1 MiB/s going out.
 */
export function rateScale(
  points: readonly LivePoint[],
  floor: number = MIN_RATE_SCALE,
): number {
  return niceMax(Math.max(liveRange(points)?.max ?? 0, floor), 1);
}

/** How far back the readings on screen go, for the caller's words. */
export type LiveSpan =
  /** No reading yet. */
  | { kind: "none" }
  /** One reading, at `at`. */
  | { kind: "one"; at: number }
  /** Every reading since `from`, when the page opened or the chart first read. */
  | { kind: "since"; from: number }
  /** Older readings were let go: the whole window. */
  | { kind: "window" };

/**
 * How far back the readings go, said honestly: "Since 10:31" while the page has been open less than
 * the window, "Last 2 minutes" once older readings have been let go.
 */
export function liveSpan(
  points: readonly { t: number }[],
  dropped: boolean,
): LiveSpan {
  const first = points[0];
  if (first === undefined) {
    return { kind: "none" };
  }
  if (points.length === 1) {
    return { kind: "one", at: first.t };
  }
  return dropped ? { kind: "window" } : { kind: "since", from: first.t };
}

/** What a text alternative says about one series: its name, the value now and the range seen. */
export interface LiveSummary {
  name: string;
  /** Null when nothing was read. */
  range: LiveRange | null;
  /** How many readings had a value. */
  count: number;
  span: LiveSpan;
}

export function liveSummary(
  name: string,
  points: readonly LivePoint[],
  dropped: boolean,
): LiveSummary {
  return {
    name,
    range: liveRange(points),
    count: points.filter((p) => p.v !== null).length,
    span: liveSpan(points, dropped),
  };
}

/** The newest reading's time across several series: the right edge every chart of a strip shares. */
export function newestOf(
  ...series: readonly (readonly { t: number }[])[]
): number | null {
  let last: number | null = null;
  for (const points of series) {
    const t = points.at(-1)?.t;
    if (t !== undefined && (last === null || t > last)) {
      last = t;
    }
  }
  return last;
}
