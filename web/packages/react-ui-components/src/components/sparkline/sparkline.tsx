// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import {
  fixedScale,
  niceScale,
  plotRows,
  rowsInWindow,
  sampledSpanMs,
  seriesFigures,
  type PlotRow,
  type Timed,
  type ValueOf,
} from "../chart-model/chart-model";

/** What `describe` is given: the figures inside the window, before formatting. */
interface SparklineSummary {
  now: number | null;
  peak: number | null;
  /** How much time the samples in the window actually cover, in milliseconds. */
  sampledMs: number;
}

interface SparklineProps<Row extends Timed> extends Omit<
  React.ComponentProps<"svg">,
  "children" | "role" | "aria-label" | "values"
> {
  /** The session's samples, oldest first, as the app's store keeps them. */
  data: readonly Row[];
  /** The one figure drawn; `null` is a missing reading and leaves a gap. */
  value: ValueOf<Row>;
  /** How far back it reaches, ending at the newest sample. Default one minute. */
  windowMs?: number;
  /** The usual time between samples; a pause longer than 2.5 times it breaks the line. */
  intervalMs: number;
  /**
   * The value axis: a fixed `[min, max]` for a percentage or a temperature, or `"nice"` for a
   * throughput, which rounds the highest reading up to 1, 2 or 5 times a power of ten (foundation 8).
   */
  domain?: readonly [number, number] | "nice";
  /** The text alternative, with now and peak: `({ now, peak }) => "Processor: 12% now, peak 40%"`. */
  describe: (summary: SparklineSummary) => string;
}

// The drawing is stretched to its box; strokes do not scale, so they stay 2px at any width.
const W = 120;
const H = 32;
const PAD = 2;

function runsOf(rows: readonly PlotRow[]): PlotRow[][] {
  const runs: PlotRow[][] = [];
  let run: PlotRow[] = [];
  for (const row of rows) {
    if (row.s0 === null || row.s0 === undefined) {
      if (run.length > 0) {
        runs.push(run);
      }
      run = [];
    } else {
      run.push(row);
    }
  }
  if (run.length > 0) {
    runs.push(run);
  }
  return runs;
}

/**
 * One series in a line the height of a row of text (foundation 8): the brand trace with its area
 * fill, a fixed scale for percentages or a nice maximum for throughput, and a text alternative with
 * now and peak. It shows only what the session sampled, and a missing sample is a gap. No chart
 * library: plain SVG with token classes, so it costs nothing on a page that has no chart.
 */
function Sparkline<Row extends Timed>({
  data,
  value,
  windowMs = 60_000,
  intervalMs,
  domain = "nice",
  describe,
  className,
  ...props
}: SparklineProps<Row>) {
  const gradientId = `spark${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // Only the samples inside the window: the line starts where sampling started, not at the edge.
  const newest = data.at(-1)?.t ?? 0;
  const inView = rowsInWindow(data, windowMs).filter(
    (row) => row.t >= newest - windowMs,
  );
  const rows = plotRows(inView, [value], intervalMs * 2.5);
  const figures = seriesFigures(data, value, windowMs);
  const scale =
    domain === "nice"
      ? niceScale(rows.map((r) => r.s0 ?? null))
      : fixedScale(domain);
  const [d0, d1] = scale.domain;
  const windowS = windowMs / 1000;
  const x = (seconds: number) => ((seconds + windowS) / windowS) * W;
  const y = (v: number) =>
    H -
    PAD -
    ((Math.min(d1, Math.max(d0, v)) - d0) / (d1 - d0 || 1)) * (H - 2 * PAD);
  const runs = runsOf(rows);
  const head = rows.at(-1);
  const label = describe({
    now: figures.now,
    peak: figures.high,
    sampledMs: sampledSpanMs(data, windowMs),
  });
  return (
    <svg
      data-slot="sparkline"
      data-state={runs.length === 0 ? "empty" : undefined}
      role="img"
      aria-label={label}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("block h-8 w-full overflow-visible text-trace", className)}
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" className="[stop-color:var(--color-trace-area)]" />
          <stop
            offset="1"
            className="[stop-color:color-mix(in_srgb,var(--color-trace)_0%,transparent)]"
          />
        </linearGradient>
      </defs>
      {runs.length === 0 ? (
        // Nothing sampled yet: a dashed baseline where the line will be, never a calm flat line.
        <path
          d={`M0 ${H - PAD}H${W}`}
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
          className="stroke-border-control"
        />
      ) : null}
      {runs.map((run) => {
        const points = run.map(
          (r) => `${x(r.x).toFixed(2)} ${y(r.s0 ?? 0).toFixed(2)}`,
        );
        const first = run[0];
        const last = run.at(-1);
        if (!first || !last) {
          return null;
        }
        const line = `M${points.join("L")}`;
        // A lone sample between two gaps has no line: a round cap on a zero-length stroke draws it
        // as a dot that does not stretch with the box.
        return (
          <g key={first.t}>
            {run.length > 1 ? (
              <path
                d={`${line}L${x(last.x).toFixed(2)} ${H}L${x(first.x).toFixed(2)} ${H}Z`}
                fill={`url(#${gradientId})`}
                stroke="none"
              />
            ) : null}
            <path
              d={run.length > 1 ? line : `${line}h0`}
              fill="none"
              stroke="currentColor"
              strokeWidth={run.length > 1 ? 2 : 3}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
      {head && head.s0 !== null && head.s0 !== undefined ? (
        <path
          data-slot="sparkline-head"
          d={`M${x(0)} ${y(head.s0)}h0`}
          fill="none"
          stroke="currentColor"
          strokeWidth={6}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

export { Sparkline };
export type { SparklineProps, SparklineSummary };
