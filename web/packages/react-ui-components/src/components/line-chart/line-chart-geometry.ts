// SPDX-License-Identifier: GPL-3.0-or-later
// The arithmetic behind LineChart, kept free of React so it can be read and tested on its own. Every
// output is a number or an SVG path string; nothing here touches the DOM.

interface LineChartPoint {
  /** When the sample was taken, in milliseconds since the epoch. */
  t: number;
  /** The reading. `null` (or a non-finite number) is a sample that failed: the line breaks there. */
  value: number | null;
}

interface LineChartSeries {
  /** Stable across renders; the React key. */
  id: string;
  /** The series' name, shown beside its line and given to `describeSeries`: "CPU", "Memory". */
  label: string;
  points: readonly LineChartPoint[];
}

/** One sample that can be drawn: inside the window and with a finite value. */
interface Sample {
  t: number;
  value: number;
}

/** What the window shows of one series. */
interface SeriesInWindow {
  /** Runs of samples close enough in time to be joined; a gap starts a new run. */
  runs: Sample[][];
  /** The last sample in the window, or `undefined` when the window holds none. */
  latest: Sample | undefined;
  min: number | undefined;
  max: number | undefined;
  /** How many drawable samples the window holds. */
  count: number;
}

/** How much longer than the usual interval a pause may be before the line breaks. */
const GAP_FACTOR = 1.5;

function isDrawable(point: LineChartPoint): point is Sample {
  return point.value !== null && Number.isFinite(point.value);
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : sorted[mid];
}

/** The time of the newest drawable sample across all series; the window ends there. */
function latestTime(series: readonly LineChartSeries[]): number | undefined {
  let latest: number | undefined;
  for (const s of series) {
    for (const p of s.points) {
      if (
        isDrawable(p) &&
        Number.isFinite(p.t) &&
        (latest === undefined || p.t > latest)
      ) {
        latest = p.t;
      }
    }
  }
  return latest;
}

/**
 * Cuts one series to the window `[start, end]` and splits it into runs. Two neighbouring samples are
 * joined only if they are no further apart than `maxGap`; by default that is 1.5 times the series' own
 * median interval, so one missed sample at a steady rate breaks the line. A failed sample (`value:
 * null`) always breaks it. Nothing is interpolated.
 */
function seriesInWindow(
  series: LineChartSeries,
  start: number,
  end: number,
  maxGap?: number,
): SeriesInWindow {
  const ordered = series.points
    .filter((p) => Number.isFinite(p.t) && p.t >= start && p.t <= end)
    .sort((a, b) => a.t - b.t);

  const intervals: number[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (prev && cur && isDrawable(prev) && isDrawable(cur) && cur.t > prev.t) {
      intervals.push(cur.t - prev.t);
    }
  }
  const usual = median(intervals);
  const limit = maxGap ?? (usual === undefined ? Infinity : usual * GAP_FACTOR);

  const runs: Sample[][] = [];
  let run: Sample[] = [];
  let min: number | undefined;
  let max: number | undefined;
  let count = 0;
  for (const p of ordered) {
    if (!isDrawable(p)) {
      if (run.length > 0) {
        runs.push(run);
      }
      run = [];
      continue;
    }
    const prev = run.at(-1);
    if (prev && p.t - prev.t > limit) {
      runs.push(run);
      run = [];
    }
    run.push({ t: p.t, value: p.value });
    count += 1;
    min = min === undefined ? p.value : Math.min(min, p.value);
    max = max === undefined ? p.value : Math.max(max, p.value);
  }
  if (run.length > 0) {
    runs.push(run);
  }
  return { runs, latest: runs.at(-1)?.at(-1), min, max, count };
}

/** A path through the points of one run: `M x y L x y ...`, to a tenth of a pixel. */
function runPath(points: readonly { x: number; y: number }[]): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`)
    .join(" ");
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Maps `value` from `[d0, d1]` onto `[r0, r1]`, clamped to the range. */
function scale(
  value: number,
  d0: number,
  d1: number,
  r0: number,
  r1: number,
): number {
  if (d1 === d0) {
    return (r0 + r1) / 2;
  }
  const f = Math.min(1, Math.max(0, (value - d0) / (d1 - d0)));
  return r0 + f * (r1 - r0);
}

/**
 * Moves label centres apart so that none is closer than `gap` to the next, keeping them inside
 * `[top, bottom]` and as near their wanted position as that allows. Returns positions in input order.
 */
function spreadLabels(
  wanted: readonly number[],
  gap: number,
  top: number,
  bottom: number,
): number[] {
  const order = wanted.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const placed = order.map((o) => Math.min(bottom, Math.max(top, o.y)));
  for (let k = 1; k < placed.length; k += 1) {
    placed[k] = Math.max(placed[k] ?? 0, (placed[k - 1] ?? 0) + gap);
  }
  const overflow = (placed.at(-1) ?? bottom) - bottom;
  if (overflow > 0) {
    placed[placed.length - 1] = bottom;
    for (let k = placed.length - 2; k >= 0; k -= 1) {
      placed[k] = Math.min(placed[k] ?? 0, (placed[k + 1] ?? 0) - gap);
    }
  }
  const out: number[] = new Array<number>(wanted.length);
  order.forEach((o, k) => {
    out[o.i] = placed[k] ?? o.y;
  });
  return out;
}

/** `count` evenly spaced values from `d0` to `d1` inclusive. */
function evenTicks(d0: number, d1: number, count: number): number[] {
  if (count < 2) {
    return [d0];
  }
  return Array.from(
    { length: count },
    (_, i) => d0 + ((d1 - d0) * i) / (count - 1),
  );
}

export { evenTicks, latestTime, runPath, scale, seriesInWindow, spreadLabels };
export type { LineChartPoint, LineChartSeries, Sample, SeriesInWindow };
