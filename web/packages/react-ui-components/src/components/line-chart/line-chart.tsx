// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import {
  evenTicks,
  latestTime,
  runPath,
  scale,
  seriesInWindow,
  spreadLabels,
  type LineChartPoint,
  type LineChartSeries,
} from "./line-chart-geometry";

/** What `describeSeries` is given for one series, every number already through `formatValue`. */
interface LineChartSeriesSummary {
  id: string;
  label: string;
  /** The newest reading in the window. */
  latest: string;
  /** The lowest and highest readings in the window. */
  min: string;
  max: string;
}

interface LineChartProps extends Omit<
  React.ComponentProps<"div">,
  "children" | "role" | "aria-label" | "aria-describedby"
> {
  /** The chart's accessible name, naming what and over what time: "CPU and memory use, last 10 minutes". */
  "aria-label": string;
  /**
   * One to four series (style guide 3.9). Position decides the look: the first is `series-1`, solid,
   * with a round marker; keep the order stable so a series keeps its colour. A fifth series is a
   * programming error and throws: fold the rest into "Other" or draw small multiples.
   */
  series: readonly LineChartSeries[];
  /** How much time the x axis spans, in milliseconds, ending at the newest sample of any series. */
  windowMs: number;
  /** The y axis, `[min, max]`; readings outside it are drawn at its edge. The default is 0 to 100. */
  domain?: readonly [number, number];
  /** Where the hairline gridlines and their labels sit. The default is five, evenly over `domain`. */
  yTicks?: readonly number[];
  /** Formats a reading for the axis, the line labels and the summary. The default is a whole percentage. */
  formatValue?: (value: number) => string;
  /** Formats a sample time for the x axis. The default is the local hour and minute. */
  formatTime?: (t: number) => string;
  /**
   * The words for one series in the text alternative, given its formatted figures:
   * `({ label, latest, min, max }) => \`${label}: ${latest} now, lowest ${min}, highest ${max}.\``
   */
  describeSeries: (summary: LineChartSeriesSummary) => string;
  /** Shown in place of the chart while no series has two readings yet: "Collecting readings…". */
  emptyLabel: React.ReactNode;
  /** A pause longer than this, in milliseconds, breaks the line. The default is 1.5 times the usual interval. */
  maxGap?: number;
  /** The drawing's height in pixels; the width follows the container. */
  height?: number;
}

const MAX_SERIES = 4;
const DEFAULT_DOMAIN: readonly [number, number] = [0, 100];
const DEFAULT_WIDTH = 480;

const percent = new Intl.NumberFormat(undefined, {
  style: "unit",
  unit: "percent",
  maximumFractionDigits: 0,
});
const clock = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const defaultFormatValue = (value: number) => percent.format(value);
const defaultFormatTime = (t: number) => clock.format(t);

// Literal class names, so Tailwind finds them. Colour comes from the series tokens only; each series
// also has its own dash pattern and marker shape, because some pairs are close in lightness or under
// colour-vision deficiency (style guide 3.9).
const strokeClass = [
  "stroke-series-1",
  "stroke-series-2",
  "stroke-series-3",
  "stroke-series-4",
];
const fillClass = [
  "fill-series-1",
  "fill-series-2",
  "fill-series-3",
  "fill-series-4",
];
/** Solid, dashed, dotted, dash-dot. With round caps a dash of length 1 is a dot. */
const dashArray = [undefined, "6 4", "1 5", "10 4 1 4"] as const;
type MarkerShape = "circle" | "square" | "triangle" | "diamond";
const markerShape: readonly MarkerShape[] = [
  "circle",
  "square",
  "triangle",
  "diamond",
];

// Text is measured by estimate, not by the DOM, so the first render is already laid out. The 12px
// figures and labels average under 7px a character in Inter.
const CHAR_WIDTH = 7;
const PAD_TOP = 8;
const PAD_BOTTOM = 22;
const AXIS_GAP = 6;
const KEY_WIDTH = 14;
const LABEL_LINE = 15;
const MARKER_R = 3.5;

function markerPath(
  shape: MarkerShape,
  x: number,
  y: number,
  r: number,
): string {
  switch (shape) {
    case "circle":
      return `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
    case "square": {
      const s = r * 0.9;
      return `M${x - s} ${y - s} h${2 * s} v${2 * s} h${-2 * s} Z`;
    }
    case "triangle": {
      const s = r * 1.2;
      return `M${x} ${y - s} L${x + s} ${y + s * 0.8} L${x - s} ${y + s * 0.8} Z`;
    }
    case "diamond": {
      const s = r * 1.3;
      return `M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z`;
    }
  }
}

/** Follows the element's width with a ResizeObserver; attributes only, so nothing writes a style. */
function useWidth(): [React.RefCallback<HTMLDivElement>, number] {
  const [width, setWidth] = React.useState(DEFAULT_WIDTH);
  const ref = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      return;
    }
    const apply = (w: number) => {
      const rounded = Math.round(w);
      if (rounded > 0) {
        setWidth((prev) => (prev === rounded ? prev : rounded));
      }
    };
    apply(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        apply(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width];
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

/**
 * A small line chart of what the open page has sampled (style guide 3.9): one to four series over a
 * fixed time window ending at the newest sample. Drawn as SVG elements with presentation attributes
 * and token classes only, so it renders under `style-src 'self'` with no exception (UI-1). Each line
 * is labelled at its end with its newest value and a marker of its own shape; a missed sample breaks
 * the line rather than bridging it. To assistive technology it is one image with a name and a text
 * summary of each series (newest, lowest and highest in the window); the drawing is hidden.
 */
function LineChart({
  "aria-label": ariaLabel,
  series,
  windowMs,
  domain = DEFAULT_DOMAIN,
  yTicks,
  formatValue = defaultFormatValue,
  formatTime = defaultFormatTime,
  describeSeries,
  emptyLabel,
  maxGap,
  height = 176,
  className,
  ref,
  ...props
}: LineChartProps) {
  const descriptionId = React.useId();
  const [measureRef, width] = useWidth();
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      assignRef(ref, node);
      return measureRef(node);
    },
    [ref, measureRef],
  );
  if (series.length > MAX_SERIES) {
    throw new RangeError(
      `LineChart draws at most ${MAX_SERIES} series; fold the rest into "Other" or draw small multiples.`,
    );
  }

  const end = latestTime(series);
  const start = end === undefined ? 0 : end - windowMs;
  const shown = series.map((s) =>
    end === undefined
      ? {
          runs: [],
          latest: undefined,
          min: undefined,
          max: undefined,
          count: 0,
        }
      : seriesInWindow(s, start, end, maxGap),
  );
  const empty = !shown.some((s) => s.count >= 2);

  const summaries = series.flatMap((s, i) => {
    const w = shown[i];
    if (!w?.latest || w.min === undefined || w.max === undefined) {
      return [];
    }
    return [
      describeSeries({
        id: s.id,
        label: s.label,
        latest: formatValue(w.latest.value),
        min: formatValue(w.min),
        max: formatValue(w.max),
      }),
    ];
  });

  if (empty) {
    return (
      <div
        ref={setRefs}
        data-slot="line-chart"
        data-state="empty"
        role="img"
        aria-label={ariaLabel}
        aria-describedby={descriptionId}
        className={cn("relative w-full", className)}
        {...props}
      >
        {/* The chart's own height, so the page does not move when the line appears, and a dashed
            outline where the plot will be. */}
        <svg
          aria-hidden="true"
          focusable="false"
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="block"
        >
          <rect
            x={0.5}
            y={0.5}
            width={Math.max(0, width - 1)}
            height={Math.max(0, height - 1)}
            rx={6}
            fill="none"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            className="stroke-border"
          />
        </svg>
        <p
          id={descriptionId}
          className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground"
        >
          {emptyLabel}
        </p>
      </div>
    );
  }

  const [d0, d1] = domain;
  const ticks = yTicks ?? evenTicks(d0, d1, 5);
  const tickLabels = ticks.map((v) => formatValue(v));
  const lineLabels = series.map((_, i) => {
    const latest = shown[i]?.latest;
    return latest ? formatValue(latest.value) : undefined;
  });

  const left =
    Math.max(...tickLabels.map((l) => l.length), 1) * CHAR_WIDTH + AXIS_GAP;
  const wantedRight =
    Math.max(
      0,
      ...series.map((s, i) =>
        lineLabels[i] === undefined
          ? 0
          : (s.label.length + 1 + (lineLabels[i]?.length ?? 0)) * CHAR_WIDTH,
      ),
    ) +
    KEY_WIDTH +
    AXIS_GAP * 2;
  const right = Math.min(wantedRight, Math.round(width * 0.45));
  const x0 = left;
  const x1 = Math.max(x0 + 1, width - right);
  const y0 = PAD_TOP;
  const y1 = height - PAD_BOTTOM;

  const x = (t: number) => scale(t, start, end ?? 0, x0, x1);
  const y = (v: number) => scale(v, d0, d1, y1, y0);
  /** Hairlines on the pixel grid, so they stay one device pixel at 1x. */
  const crisp = (n: number) => Math.round(n) + 0.5;

  const latestY = series.map((_, i) => {
    const latest = shown[i]?.latest;
    return latest ? y(latest.value) : undefined;
  });
  const labelled = series
    .map((_, i) => i)
    .filter((i) => latestY[i] !== undefined);
  const placed = spreadLabels(
    labelled.map((i) => latestY[i] ?? 0),
    LABEL_LINE,
    y0 + 4,
    y1,
  );
  const labelY = new Map(labelled.map((i, k) => [i, placed[k] ?? 0]));

  const xTicks = end === undefined ? [] : [start, start + windowMs / 2, end];
  const xAnchor = ["start", "middle", "end"] as const;

  return (
    <div
      ref={setRefs}
      data-slot="line-chart"
      role="img"
      aria-label={ariaLabel}
      aria-describedby={descriptionId}
      className={cn("relative w-full", className)}
      {...props}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible text-xs"
      >
        <g data-slot="line-chart-grid">
          {ticks.map((v, i) => (
            <React.Fragment key={v}>
              <line
                x1={x0}
                x2={x1}
                y1={crisp(y(v))}
                y2={crisp(y(v))}
                strokeWidth={1}
                shapeRendering="crispEdges"
                className="stroke-border"
              />
              <text
                x={x0 - AXIS_GAP}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground tabular-nums"
              >
                {tickLabels[i]}
              </text>
            </React.Fragment>
          ))}
          {xTicks.map((t, i) => (
            <text
              key={xAnchor[i]}
              x={x(t)}
              y={height - 4}
              textAnchor={xAnchor[i]}
              className="fill-muted-foreground tabular-nums"
            >
              {formatTime(t)}
            </text>
          ))}
        </g>
        {series.map((s, i) => {
          const w = shown[i];
          if (!w) {
            return null;
          }
          const shape = markerShape[i] ?? "circle";
          return (
            <g key={s.id} data-slot="line-chart-series" data-series={i + 1}>
              {w.runs.map((run) =>
                run.length === 1 ? (
                  // A lone sample between two gaps has no line to draw: its marker shows it.
                  <path
                    key={run[0]?.t}
                    data-slot="line-chart-point"
                    d={markerPath(
                      shape,
                      x(run[0]?.t ?? 0),
                      y(run[0]?.value ?? 0),
                      MARKER_R - 1,
                    )}
                    className={fillClass[i]}
                  />
                ) : (
                  <path
                    key={run[0]?.t}
                    data-slot="line-chart-line"
                    d={runPath(run.map((p) => ({ x: x(p.t), y: y(p.value) })))}
                    fill="none"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={dashArray[i]}
                    className={strokeClass[i]}
                  />
                ),
              )}
              {w.latest ? (
                <path
                  data-slot="line-chart-marker"
                  d={markerPath(
                    shape,
                    x(w.latest.t),
                    y(w.latest.value),
                    MARKER_R,
                  )}
                  className={fillClass[i]}
                />
              ) : null}
              {w.latest ? (
                <g data-slot="line-chart-label">
                  {/* The label's own marker only where it has moved away from the line's end: a
                      label pushed clear of another, or a series that stopped before the others. */}
                  {Math.abs((labelY.get(i) ?? 0) - (latestY[i] ?? 0)) > 0.5 ||
                  w.latest.t !== end ? (
                    <path
                      d={markerPath(
                        shape,
                        x1 + AXIS_GAP + MARKER_R,
                        labelY.get(i) ?? 0,
                        MARKER_R,
                      )}
                      className={fillClass[i]}
                    />
                  ) : null}
                  {/* Chart text takes the text tokens, never a series colour (style guide 3.9). */}
                  <text
                    x={x1 + AXIS_GAP + KEY_WIDTH}
                    y={labelY.get(i)}
                    dominantBaseline="middle"
                    className="fill-foreground"
                  >
                    <tspan className="fill-muted-foreground">{s.label}</tspan>{" "}
                    <tspan className="font-medium tabular-nums">
                      {lineLabels[i]}
                    </tspan>
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p id={descriptionId} className="sr-only">
        {summaries.join(" ")}
      </p>
    </div>
  );
}

export { LineChart };
export type {
  LineChartPoint,
  LineChartProps,
  LineChartSeries,
  LineChartSeriesSummary,
};
