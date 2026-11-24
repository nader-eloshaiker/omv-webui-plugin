// SPDX-License-Identifier: GPL-3.0-or-later
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "../../utils";
import {
  fixedScale,
  isLonePoint,
  niceScale,
  PHONE_QUERY,
  plotRows,
  rowsInWindow,
  sampledSpanMs,
  seriesFigures,
  seriesKey,
  timeTicks,
  windowForViewport,
  type PlotRow,
  type SeriesFigures,
  type Timed,
  type ValueOf,
} from "../chart-model/chart-model";
import {
  useElementWidth,
  useMediaQuery,
} from "../chart-model/use-element-width";
import { prefersReducedMotion } from "../motion/motion";
import {
  ChartTable,
  ChartTableDisclosure,
  ChartTooltipCard,
  ChartTooltipRow,
  EmptyPlot,
  type ChartTableWords,
} from "./chart-parts";
import {
  chartFrameClass,
  dotClass,
  SERIES_DASH,
  TICK,
  TONE_TEXT,
  toneFor,
  type ChartAlert,
  type SeriesTone,
} from "./chart-theme";

/** One line on a live chart. */
interface LiveSeries<Row> {
  /** Stable across renders. */
  id: string;
  /** Its name in the tooltip, the table, the direct label and the text alternative: "In", "Processor". */
  label: string;
  /** Reads its figure from a sample; `null` is a missing reading, drawn as a gap and never as 0. */
  value: ValueOf<Row>;
}

/** What the caption and the text alternative are given, before any formatting. */
interface LiveChartSummary {
  /** How much time the samples shown actually cover, in milliseconds: "last 58 s". */
  sampledMs: number;
  /** The window the chart has room for, in milliseconds (shorter on a phone). */
  windowMs: number;
  /** How many samples are shown. */
  samples: number;
  /** Per series, in order: its label and its newest, highest and lowest readings. */
  series: (SeriesFigures & { id: string; label: string })[];
}

const plotHeight = cva("", {
  variants: {
    size: {
      /** A dashboard tile: a reading above a short chart. */
      tile: "h-26",
      /** A page of its own (Performance): axes with room to read. */
      large: "h-60",
    },
  },
  defaultVariants: { size: "tile" },
});
const PIXELS = { tile: 104, large: 240 } as const;

interface LiveChartProps<Row extends Timed>
  extends
    Omit<React.ComponentProps<"figure">, "children">,
    VariantProps<typeof plotHeight> {
  /** The session's samples, oldest first, exactly as the store keeps them. */
  data: readonly Row[];
  /** One to four lines. One draws in the brand trace with its area; more take the series colours, each with its own dash. */
  series: readonly LiveSeries<Row>[];
  /** What the chart shows, its accessible name: "Processor". */
  label: string;
  /** The usual time between samples, in milliseconds: the line moves one step over exactly this long. */
  intervalMs: number;
  /** How far back it reaches, ending at the newest sample. Default one minute. */
  windowMs?: number;
  /** The window on a phone (a viewport under 640px): default 30 seconds. */
  narrowWindowMs?: number;
  /** A pause longer than this breaks the line. Default 2.5 times `intervalMs`. */
  maxGapMs?: number;
  /**
   * The value axis: a fixed `[min, max]` for a share or a temperature, or `"nice"` (the default) for
   * an amount such as throughput, which rounds the highest reading up to 1, 2 or 5 times a power of
   * ten. Pass values already in the unit shown (MiB/s, not bytes per second).
   */
  domain?: readonly [number, number] | "nice";
  /** Where the gridlines sit on a fixed axis; its ends and middle by default. */
  ticks?: readonly number[];
  /** Area under a single line, for an amount from zero; off for a level such as a temperature. Default on for one series. */
  area?: boolean;
  /** Lines at an alert or a threshold, with their words. Values the caller knows, never invented here. */
  alerts?: readonly ChartAlert[];
  /** A reading with its unit: "12.4 MiB/s". */
  formatValue: (value: number) => string;
  /** An axis label: "50%", "20". Default `formatValue`. */
  formatTick?: (value: number) => string;
  /** How long ago, for the time axis and the tooltip: 0 is "now", 30 is "30 s". */
  formatAgo: (seconds: number) => string;
  /** The moment of a sample, for the tooltip and the table: "14:02:31". */
  formatTime: (t: number) => string;
  /** The words under the chart, with the real span: "Live · every 2 s · last 58 s". */
  caption: (summary: LiveChartSummary) => React.ReactNode;
  /** The text alternative a screen reader hears: what, over how long, now, highest and lowest. */
  describe: (summary: LiveChartSummary) => string;
  /** In place of the plot before the first sample: "Waiting for the first reading…". */
  emptyLabel: React.ReactNode;
  /** A missing reading in the tooltip and the table: "No reading". */
  missingLabel: string;
  /** The numbers one click away, or `false` when the page shows one table for several charts (`LiveTable`). */
  table: (ChartTableWords & { timeHeader: React.ReactNode }) | false;
  /** Name each line at its newest point. Default on for a large chart with more than one series. */
  directLabels?: boolean;
  /** Charts with the same id show their tooltips together, at the same moment. */
  syncId?: string;
  /** The ground the chart sits on, so its dots are ringed in it. */
  ground?: "surface" | "muted";
}

/**
 * Glide the live layers one step to the left when a sample arrives (foundation 7.2, "live line"), so
 * the line moves at the rate the data really arrives and is never redrawn from scratch. Recharts
 * clips each line with a clip path inside its own layer, so the clip's rectangle moves the opposite
 * way at the same rate and the plot's edges stay still. The head dot beats once per sample. Not while
 * a reader points at or focuses the chart, and never under reduced motion: then it redraws in place.
 */
function useLiveGlide(
  root: React.RefObject<HTMLDivElement | null>,
  latest: number | undefined,
  previous: number | undefined,
  windowMs: number,
  intervalMs: number,
  still: boolean,
) {
  React.useLayoutEffect(() => {
    const el = root.current;
    if (
      !el ||
      latest === undefined ||
      previous === undefined ||
      still ||
      prefersReducedMotion() ||
      typeof Element.prototype.animate !== "function"
    ) {
      return;
    }
    const grid = el.querySelector<SVGGraphicsElement>(
      ".recharts-cartesian-grid",
    );
    const width = grid?.getBBox().width ?? 0;
    const step = (width * (latest - previous)) / windowMs;
    if (!step || step > width / 4) {
      return;
    }
    const timing = { duration: intervalMs, easing: "linear" } as const;
    const shift = (px: number) => [
      { transform: `translateX(${px.toFixed(2)}px)` },
      { transform: "translateX(0)" },
    ];
    const animations: Animation[] = [];
    for (const layer of el.querySelectorAll<SVGGElement>(".live-layer")) {
      animations.push(layer.animate(shift(step), timing));
      for (const rect of layer.querySelectorAll<SVGRectElement>(
        "clipPath rect",
      )) {
        animations.push(rect.animate(shift(-step), timing));
      }
    }
    for (const head of el.querySelectorAll<SVGCircleElement>(
      ".live-head circle",
    )) {
      animations.push(
        head.animate(
          [
            { r: "6", opacity: 0.4 },
            { r: "3", opacity: 1 },
          ],
          { duration: 700, easing: "cubic-bezier(0.2, 0, 0, 1)" },
        ),
      );
    }
    return () => {
      for (const a of animations) {
        a.cancel();
      }
    };
  }, [root, latest, previous, windowMs, intervalMs, still]);
}

interface TickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
}

function summaryOf<Row extends Timed>(
  data: readonly Row[],
  series: readonly LiveSeries<Row>[],
  windowMs: number,
): LiveChartSummary {
  const newest = data.at(-1)?.t ?? 0;
  return {
    sampledMs: sampledSpanMs(data, windowMs),
    windowMs,
    samples: data.filter((row) => row.t >= newest - windowMs).length,
    series: series.map((s) => ({
      id: s.id,
      label: s.label,
      ...seriesFigures(data, s.value, windowMs),
    })),
  };
}

/**
 * A live chart of what this session sampled (foundation 8), on Recharts: an area for one amount, or
 * up to four lines, over the last minute (half a minute on a phone), with a time axis of seconds
 * ago, a value axis, alert lines with their words, a tooltip with the exact value and time (pointer,
 * or the arrow keys once focused), and a head dot on the newest sample. It starts empty, says the
 * span it really covers, and draws a missing reading or a pause in sampling as a gap.
 *
 * To a screen reader it is one image with a name and a description of now, highest and lowest; it
 * is not an application, so browsing is never trapped in it. The numbers are a table one click away.
 */
function LiveChart<Row extends Timed>({
  data,
  series,
  label,
  intervalMs,
  windowMs = 60_000,
  narrowWindowMs = 30_000,
  maxGapMs,
  domain = "nice",
  ticks,
  area,
  alerts,
  formatValue,
  formatTick,
  formatAgo,
  formatTime,
  caption,
  describe,
  emptyLabel,
  missingLabel,
  table,
  directLabels,
  syncId,
  ground,
  size,
  className,
  ref,
  ...props
}: LiveChartProps<Row>) {
  if (series.length < 1 || series.length > 4) {
    throw new RangeError(
      "LiveChart draws one to four series; fold the rest into Other or draw small multiples.",
    );
  }
  const id = React.useId();
  const gradientId = `live${id.replace(/[^a-zA-Z0-9]/g, "")}`;
  const summaryId = `${id}-summary`;
  const plotRef = React.useRef<HTMLDivElement | null>(null);
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const setPlot = React.useCallback(
    (node: HTMLDivElement | null) => {
      plotRef.current = node;
      return measureRef(node);
    },
    [measureRef],
  );
  const [still, setStill] = React.useState(false);

  const phone = useMediaQuery(PHONE_QUERY);
  const shownMs = windowForViewport(phone, windowMs, narrowWindowMs);
  const windowS = shownMs / 1000;
  const inView = rowsInWindow(data, shownMs);
  const rows = plotRows(
    inView,
    series.map((s) => s.value),
    maxGapMs ?? intervalMs * 2.5,
  );
  const summary = summaryOf(data, series, shownMs);
  const empty = summary.series.every((s) => s.count === 0);
  const latest = inView.at(-1);
  const previous = inView.at(-2);
  useLiveGlide(plotRef, latest?.t, previous?.t, shownMs, intervalMs, still);

  const values = rows.flatMap((row) =>
    series.map((_, i) => row[seriesKey(i)] ?? null),
  );
  const scale =
    domain === "nice" ? niceScale(values) : fixedScale(domain, ticks);
  const xTicks = timeTicks(windowS, width);
  const large = size === "large";
  const height = PIXELS[size ?? "tile"];
  const withArea = area ?? series.length === 1;
  const labelled = directLabels ?? (large && series.length > 1);
  const tones: SeriesTone[] = series.map((_, i) => toneFor(i, series.length));
  const dashes = series.map((_, i) =>
    series.length === 1 ? undefined : SERIES_DASH[i],
  );
  const tick = formatTick ?? formatValue;

  // Direct labels at the newest point: two heads closer than a line of text are pushed apart.
  const heads = series.map((_, i) => rows.at(-1)?.[seriesKey(i)] ?? null);
  const span = scale.domain[1] - scale.domain[0] || 1;
  const nudge = (i: number) => {
    const a = heads[i];
    const other = heads.find((h, j) => j !== i && h !== null && a !== null);
    if (
      a === null ||
      a === undefined ||
      other === undefined ||
      other === null
    ) {
      return 0;
    }
    const apart = (Math.abs(a - other) / span) * (height - 34);
    if (apart >= 14) {
      return 0;
    }
    return a >= other ? -(14 - apart) / 2 - 1 : (14 - apart) / 2 + 1;
  };

  const tableRows = React.useMemo(() => {
    const newest = data.at(-1)?.t ?? 0;
    return data
      .filter((row) => row.t >= newest - shownMs)
      .slice()
      .reverse();
  }, [data, shownMs]);

  return (
    <figure
      ref={ref}
      data-slot="live-chart"
      data-state={empty ? "empty" : undefined}
      className={cn("m-0 flex min-w-0 flex-col gap-1.5", className)}
      {...props}
    >
      <div
        ref={setPlot}
        className={cn(chartFrameClass({ ground }), plotHeight({ size }))}
        onPointerEnter={() => {
          setStill(true);
        }}
        onPointerLeave={() => {
          setStill(false);
        }}
        onFocus={() => {
          setStill(true);
        }}
        onBlur={() => {
          setStill(false);
        }}
      >
        {empty ? (
          <EmptyPlot height={plotHeight({ size })}>{emptyLabel}</EmptyPlot>
        ) : width > 0 ? (
          <ComposedChart
            width={width}
            height={height}
            data={rows}
            syncId={syncId}
            syncMethod="value"
            // An image with a name and a description, not an application: a screen reader browses
            // past it. It stays focusable, so the arrow keys still move the tooltip for a sighted
            // keyboard user.
            role="img"
            aria-label={label}
            aria-describedby={summaryId}
            margin={{ top: 8, right: labelled ? 44 : 10, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0"
                  className="[stop-color:var(--color-trace-area)]"
                />
                <stop
                  offset="1"
                  className="[stop-color:color-mix(in_srgb,var(--color-trace)_0%,transparent)]"
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={[-windowS, 0]}
              ticks={xTicks}
              allowDataOverflow
              interval={0}
              tickLine={false}
              axisLine={false}
              height={large ? 26 : 20}
              tick={(p: TickProps) => {
                const v = Number(p.payload?.value ?? 0);
                // The first and last are anchored inward so they never run past the plot's edges.
                const anchor =
                  v <= -windowS ? "start" : v >= 0 ? "end" : "middle";
                return (
                  <text
                    x={Number(p.x)}
                    y={Number(p.y) + 6}
                    dy="0.71em"
                    textAnchor={anchor}
                    fill="currentColor"
                    className="recharts-cartesian-axis-tick-value"
                  >
                    {formatAgo(-v)}
                  </text>
                );
              }}
            />
            <YAxis
              type="number"
              domain={[...scale.domain]}
              ticks={[...scale.ticks]}
              allowDataOverflow
              interval={0}
              tickFormatter={tick}
              tick={TICK}
              tickLine={false}
              axisLine={false}
              width={large ? 52 : 44}
              tickMargin={4}
            />
            {(alerts ?? []).map((alert) => (
              <ReferenceLine
                key={alert.value}
                y={alert.value}
                ifOverflow="extendDomain"
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="2 3"
                label={{
                  value: large ? alert.label : (alert.short ?? alert.label),
                  position: large ? "insideTopLeft" : "insideTopRight",
                  className: "text-xs font-semibold text-muted-foreground",
                  fill: "currentColor",
                }}
              />
            ))}
            {series.map((s, i) => {
              const tone = tones[i] ?? "trace";
              const common = {
                dataKey: seriesKey(i),
                name: s.label,
                type: "monotone" as const,
                stroke: "currentColor",
                strokeWidth: large ? 2.25 : 2,
                strokeLinecap: "round" as const,
                strokeLinejoin: "round" as const,
                isAnimationActive: false,
                activeDot: { r: 4, className: dotClass(tone) },
                // A lone reading between two gaps has no line: it is marked with a dot.
                dot: (p: { cx?: number; cy?: number; index?: number }) =>
                  p.index !== undefined &&
                  p.cx !== undefined &&
                  p.cy !== undefined &&
                  isLonePoint(rows, seriesKey(i), p.index) ? (
                    <circle
                      key={`lone-${p.index}`}
                      cx={p.cx}
                      cy={p.cy}
                      r={2.5}
                      className="fill-current"
                    />
                  ) : (
                    <g key={`none-${p.index ?? 0}`} />
                  ),
                // `live-layer` marks the layer the glide moves; the token class gives its colour.
                className: cn("live-layer", TONE_TEXT[tone]),
              };
              return withArea && series.length === 1 ? (
                <Area
                  key={s.id}
                  {...common}
                  fill={`url(#${gradientId})`}
                  fillOpacity={1}
                />
              ) : (
                <Line key={s.id} {...common} strokeDasharray={dashes[i]} />
              );
            })}
            {series.map((s, i) => {
              const v = heads[i];
              if (v === null || v === undefined) {
                return null;
              }
              const tone = tones[i] ?? "trace";
              return (
                <ReferenceDot
                  key={`head-${s.id}`}
                  x={0}
                  y={v}
                  r={3}
                  ifOverflow="visible"
                  fill="currentColor"
                  className={cn("live-head", dotClass(tone))}
                  label={
                    labelled
                      ? {
                          value: s.label,
                          position: "right",
                          dy: nudge(i),
                          className:
                            "text-xs font-semibold text-muted-foreground",
                          fill: "currentColor",
                        }
                      : undefined
                  }
                />
              );
            })}
            <Tooltip
              isAnimationActive={false}
              cursor={{ strokeWidth: 1 }}
              content={(p) => {
                const row = p.payload?.[0]?.payload as PlotRow | undefined;
                if (!p.active || !row || row.gap) {
                  return null;
                }
                return (
                  <ChartTooltipCard
                    title={formatTime(row.t)}
                    meta={formatAgo(-row.x)}
                  >
                    {series.map((s, i) => {
                      const v = row[seriesKey(i)];
                      return (
                        <ChartTooltipRow
                          key={s.id}
                          tone={tones[i] ?? "trace"}
                          dash={dashes[i]}
                          name={series.length > 1 ? s.label : label}
                          value={
                            v === null || v === undefined
                              ? missingLabel
                              : formatValue(v)
                          }
                        />
                      );
                    })}
                  </ChartTooltipCard>
                );
              }}
            />
          </ComposedChart>
        ) : null}
      </div>
      <figcaption className="flex items-center gap-1.5 text-caption text-tertiary-foreground">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-brand"
        />
        {caption(summary)}
      </figcaption>
      <p id={summaryId} className="sr-only">
        {describe(summary)}
      </p>
      {table === false || empty ? null : (
        <ChartTableDisclosure summary={table.summary}>
          <LiveTable
            data={tableRows}
            series={series}
            formatValue={formatValue}
            formatTime={formatTime}
            missingLabel={missingLabel}
            timeHeader={table.timeHeader}
            caption={table.caption}
          />
        </ChartTableDisclosure>
      )}
    </figure>
  );
}

interface LiveTableProps<Row extends Timed> {
  /** The rows to list, in the order to list them (newest first, usually). */
  data: readonly Row[];
  series: readonly LiveSeries<Row>[];
  formatValue: (value: number) => string;
  formatTime: (t: number) => string;
  missingLabel: string;
  timeHeader: React.ReactNode;
  caption: string;
}

/** The numbers behind one or more live charts: a row per sample, a column per series. */
function LiveTable<Row extends Timed>({
  data,
  series,
  formatValue,
  formatTime,
  missingLabel,
  timeHeader,
  caption,
}: LiveTableProps<Row>) {
  return (
    <ChartTable
      rows={data}
      rowKey={(row) => String(row.t)}
      caption={caption}
      columns={[
        { id: "time", header: timeHeader, cell: (row) => formatTime(row.t) },
        ...series.map((s) => ({
          id: s.id,
          header: s.label,
          numeric: true,
          cell: (row: Row) => {
            const v = s.value(row);
            return v === null || v === undefined || !Number.isFinite(v)
              ? missingLabel
              : formatValue(v);
          },
        })),
      ]}
    />
  );
}

export { LiveChart, LiveTable };
export type { LiveChartProps, LiveChartSummary, LiveSeries, LiveTableProps };
