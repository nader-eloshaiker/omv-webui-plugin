// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import { useGlide } from "../motion/motion";
import { animateElement, curveAt, durationAt } from "../motion/motion-tokens";
import { useReducedMotion } from "../motion/reduced-motion";
import {
  areaPath,
  endShare,
  figureParts,
  linePath,
  LIVE_INTERVAL_MS,
  LIVE_WINDOW_MS,
  liveSummary,
  MIN_RATE_SCALE,
  newestOf,
  PLOT_H,
  PLOT_W,
  rateScale,
  spread,
  yAt,
  type FigureParts,
  type LivePoint,
  type LiveSummary,
} from "./live-pair-model";

/**
 * `default`: the strip's charts, each line named at its end with its value now, a key under each.
 * `large`: the dashboard's instrument (owner, 2026-11-27): each chart headed by its figures, large and
 * in mono, each with a key repeating its line's stroke; the plot taller (180px, 140px compact) with
 * the area under each line filled; the lines named at their ends.
 */
type LiveChartSize = "default" | "large";

/** One line of a chart: its name and the readings this page took, oldest first. */
interface LiveSeries {
  /** The name written at the line's end and in the key: "Processor", "In". */
  name: string;
  /** The name in the text alternative, where it stands alone: "Network in". The default is `name`. */
  label?: string;
  points: readonly LivePoint[];
}

interface LiveChartBaseProps extends Omit<
  React.ComponentProps<"div">,
  "children" | "role" | "aria-label" | "title"
> {
  /** The chart's name over it: "Processor and memory". */
  title: React.ReactNode;
  /** A fact beside the name, in secondary text: "Memory: 0.33 GiB of 3.8 GiB", the interface's name. */
  aside?: React.ReactNode;
  /** The newest reading's time, at the right edge. The default is the newest point of this chart. */
  now?: number | null;
  /** Older readings were let go, so the chart shows the whole window rather than "since" a time. */
  dropped?: boolean;
  /** How much time runs across the plot. The default is two minutes. */
  windowMs?: number;
  /** How often a reading is taken; a pause of more than two and a half of these breaks the line. */
  intervalMs?: number;
  /** A reading with its unit, for the end labels: "12 %", "38.6 MiB/s". Called for every glide frame. */
  format: (value: number) => string;
  /** The end label's words when the newest reading has no value: "No reading". */
  missing: React.ReactNode;
  /**
   * One series in words, for the chart's text alternative: "Processor: 12 % now, between 1 % and
   * 41 % since 10:31." The summary carries the name, the range seen and how far back it goes.
   */
  describe: (summary: LiveSummary) => string;
  /** `large`: figures over the chart and the areas filled. The default is the strip's chart. */
  size?: LiveChartSize;
  /**
   * The large figure's number and its unit, apart: `{ value: "38.6", unit: "MiB/s" }`. The default
   * splits `format`'s words at their last space.
   */
  formatFigure?: (value: number) => FigureParts;
}

interface LivePercentChartProps extends LiveChartBaseProps {
  /** Two series on one 0 to 100 scale: the first teal and solid, the second violet and dashed. */
  series: readonly [LiveSeries, LiveSeries];
  /** A scale mark, "100 %", "50 %". The default is `format`. */
  formatScale?: (value: number) => string;
}

interface LiveMirrorChartProps extends LiveChartBaseProps {
  /** Above the baseline, teal and solid: the traffic in. */
  above: LiveSeries;
  /** Below the baseline, violet and dashed: the traffic out. */
  below: LiveSeries;
  /** The smallest scale each half takes, in the readings' unit. The default is 1 (MiB/s). */
  floor?: number;
  /** A half's scale written at its edge: "100 MiB/s". */
  formatScale: (value: number) => string;
  /** The two scales in words, after the series in the text alternative: "In is drawn on a scale to …". */
  describeScales: (aboveMax: number, belowMax: number) => string;
  /** A line under the key, in secondary text: "The two halves are scaled separately." */
  note?: React.ReactNode;
}

/**
 * The plot's group, shifted back by the new reading's step and slid into place over the glide
 * duration, so the chart moves left as time does. Not on the first reading, not after a jump of a
 * whole window, and not under reduced motion. The Web Animations API only: nothing writes a style.
 */
function useShift(last: number | null, windowMs: number) {
  const ref = React.useRef<SVGGElement>(null);
  const prevRef = React.useRef(last);
  const reduced = useReducedMotion();
  React.useLayoutEffect(() => {
    const before = prevRef.current;
    prevRef.current = last;
    const g = ref.current;
    if (!g || reduced || before === null || last === null || last <= before) {
      return;
    }
    const dx = ((last - before) / windowMs) * PLOT_W;
    if (dx >= PLOT_W) {
      return;
    }
    animateElement(
      g,
      [{ transform: `translateX(${dx.toFixed(2)}px)` }, { transform: "none" }],
      {
        duration: durationAt(g, "--duration-glide"),
        easing: curveAt(g, "--ease-standard"),
      },
    );
  }, [last, reduced, windowMs]);
  return ref;
}

const lineClass = {
  solid:
    "fill-none stroke-series-2 stroke-2 [stroke-linecap:round] [stroke-linejoin:round]",
  dashed:
    "fill-none stroke-series-1 stroke-2 [stroke-dasharray:6_4] [stroke-linecap:round] [stroke-linejoin:round]",
} as const;

function Plot({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${String(PLOT_W)} ${String(PLOT_H)}`}
      preserveAspectRatio="none"
      className="block size-full overflow-hidden [&_path]:[vector-effect:non-scaling-stroke]"
    >
      {children}
    </svg>
  );
}

function Rule({ y, kind }: { y: number; kind: "grid" | "base" }) {
  return (
    <path
      data-part={kind}
      d={`M0 ${String(y)}H${String(PLOT_W)}`}
      className={
        kind === "base"
          ? "fill-none stroke-border-control stroke-1"
          : "fill-none stroke-border stroke-1 [stroke-dasharray:2_3]"
      }
    />
  );
}

/**
 * A scale's value at the plot's edge, on the ground the chart sits on so the rule under it does not
 * cross it: the page, or the ground a `Panel` names in `--ground`.
 */
function ScaleMark({
  at,
  children,
}: {
  at: "top" | "middle" | "bottom";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "absolute start-0 bg-[var(--ground,var(--theme-page))] pe-1 text-xs leading-3 text-tertiary-foreground tabular-nums",
        at === "top" && "-top-px",
        at === "middle" && "top-[calc(50%-6px)]",
        at === "bottom" && "-bottom-px",
      )}
    >
      {children}
    </span>
  );
}

/** A label beside the end of a line, at the line's height, its figure gliding to the new value. */
function EndLabel({
  share,
  value,
  format,
  name,
  missing,
}: {
  share: number;
  value: number | null;
  format: (n: number) => string;
  name: string;
  missing: React.ReactNode;
}) {
  const shown = useGlide(value);
  return (
    <span
      data-slot="live-end-label"
      className="absolute start-0 flex -translate-y-1/2 flex-col whitespace-nowrap transition-[top] duration-glide ease-standard"
      style={{ top: `${String(share * 100)}%` }}
    >
      <span className="text-xs leading-[13px] text-muted-foreground">
        {name}
      </span>
      <span className="text-body leading-5 font-semibold text-foreground tabular-nums">
        {value === null || shown === null ? missing : format(shown)}
      </span>
    </span>
  );
}

/**
 * Sets `top` on an element through the CSSOM from a share of its parent's height, so geometry from
 * data never becomes a style attribute in markup (UI-1).
 */
function useTopShare<T extends HTMLElement>(share: number) {
  const ref = React.useRef<T>(null);
  React.useLayoutEffect(() => {
    ref.current?.style.setProperty("top", `${String(share * 100)}%`);
  }, [share]);
  return ref;
}

/** A line's name beside its end, at its height (the large chart: the value is in the figure). */
function EndName({ share, children }: { share: number; children: string }) {
  const ref = useTopShare<HTMLSpanElement>(share);
  return (
    <span
      ref={ref}
      data-slot="live-end-label"
      className="absolute start-0 -translate-y-1/2 whitespace-nowrap text-xs text-muted-foreground transition-[top] duration-glide ease-standard"
    >
      <span>{children}</span>
    </span>
  );
}

/** A line's stroke, drawn small: the key beside a series' name. */
function StrokeKey({
  stroke,
  className,
}: {
  stroke: "solid" | "dashed";
  className: string;
}) {
  return (
    <svg viewBox="0 0 24 8" aria-hidden="true" className={className}>
      <path d="M1 4H23" className={lineClass[stroke]} />
    </svg>
  );
}

/**
 * A large figure over its chart: the series' name after its line's stroke, and its value now, large
 * and in mono with the unit smaller beside it, gliding to a new value.
 */
function Figure({
  name,
  stroke,
  value,
  format,
  formatFigure,
  missing,
}: {
  name: string;
  stroke: "solid" | "dashed";
  value: number | null;
  format: (n: number) => string;
  formatFigure?: (n: number) => FigureParts;
  missing: React.ReactNode;
}) {
  const shown = useGlide(value);
  const parts =
    value === null || shown === null
      ? null
      : formatFigure
        ? formatFigure(shown)
        : figureParts(format(shown));
  return (
    <span data-slot="live-figure" className="flex min-w-0 flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
        <StrokeKey stroke={stroke} className="h-2 w-5" />
        {name}
      </span>
      <span className="font-mono text-figure leading-[1.1] font-medium text-foreground tabular-nums">
        {parts === null ? (
          missing
        ) : (
          <>
            {parts.value}
            {parts.unit === "" ? null : (
              <span className="ms-1.5 text-section font-normal text-muted-foreground">
                {parts.unit}
              </span>
            )}
          </>
        )}
      </span>
    </span>
  );
}

/**
 * The area under a line, filled with its series' colour from strong at the line to faint at the
 * base: the one gradient style guide 10 keeps, because it shows how much.
 */
function Area({
  d,
  stroke,
  toward,
}: {
  d: string;
  stroke: "solid" | "dashed";
  /** Where the line is: up from the base (a full plot, the upper half) or down from it. */
  toward: "up" | "down";
}) {
  const id = `livearea${React.useId().replace(/[^a-zA-Z0-9]/gu, "")}`;
  const colour =
    stroke === "solid"
      ? "[stop-color:var(--theme-series-2)]"
      : "[stop-color:var(--theme-series-1)]";
  return (
    <>
      <defs>
        <linearGradient
          id={id}
          x1="0"
          x2="0"
          y1={toward === "down" ? "1" : "0"}
          y2={toward === "down" ? "0" : "1"}
        >
          <stop offset="0" className={cn(colour, "[stop-opacity:0.42]")} />
          <stop offset="1" className={cn(colour, "[stop-opacity:0.02]")} />
        </linearGradient>
      </defs>
      <path data-part="area" d={d} fill={`url(#${id})`} stroke="none" />
    </>
  );
}

/** The key under a chart: each line's stroke beside its name, so the dash is learnt once. */
function Key({ solid, dashed }: { solid: string; dashed: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      {(
        [
          ["solid", solid],
          ["dashed", dashed],
        ] as const
      ).map(([kind, name]) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 24 8" className="h-2 w-6">
            <path d="M1 4H23" className={lineClass[kind]} />
          </svg>
          {name}
        </span>
      ))}
    </span>
  );
}

function ChartHead({
  title,
  aside,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2.5">
      <span className="text-caption text-muted-foreground">{title}</span>
      {aside === undefined ? null : (
        <span className="text-xs text-tertiary-foreground tabular-nums">
          {aside}
        </span>
      )}
    </span>
  );
}

const chartClass = cva("flex min-w-0 flex-[1_1_300px] flex-col", {
  variants: { size: { default: "gap-1.5", large: "gap-2.5" } },
  defaultVariants: { size: "default" },
});
const plotClass = cva("grid gap-2", {
  variants: {
    size: {
      default: "grid-cols-[minmax(0,1fr)_6.5rem]",
      large: "grid-cols-[minmax(0,1fr)_3.5rem]",
    },
  },
  defaultVariants: { size: "default" },
});
const areaClass = cva("relative", {
  variants: {
    size: { default: "h-28 compact:h-22", large: "h-45 compact:h-35" },
  },
  defaultVariants: { size: "default" },
});

/** The large chart's figures over its plot, of different widths in one row. */
const figuresClass = "flex flex-wrap gap-x-7 gap-y-1.5";

/**
 * Two end labels stay this share of the plot apart: a name and a value on the compact plot's 88px,
 * or a name alone on the large plot's 140px.
 */
const LABEL_GAP = { default: 0.4, large: 0.12 } as const;
const MIRROR_LABEL_GAP = { default: 0.22, large: 0.06 } as const;

/**
 * Two series on one 0 to 100 scale (processor and memory), the first teal and solid, the second
 * violet and dashed, each named at its end (style guide 3.9). The plot is an image with a text
 * alternative: each series' value now and the range this page saw. The title and the aside over it
 * are text, read before it. `size="large"` heads the plot with both figures and fills the area under
 * the first line; the second, dashed, stays a line so the two never stack their fills.
 */
function LivePercentChart({
  series,
  title,
  aside,
  now,
  dropped = false,
  windowMs = LIVE_WINDOW_MS,
  intervalMs = LIVE_INTERVAL_MS,
  format,
  formatScale = format,
  formatFigure,
  missing,
  describe,
  size = "default",
  className,
  ...props
}: LivePercentChartProps) {
  const [first, second] = series;
  const large = size === "large";
  const last = now === undefined ? newestOf(first.points, second.points) : now;
  const shift = useShift(last, windowMs);
  const a = first.points.at(-1)?.v ?? null;
  const b = second.points.at(-1)?.v ?? null;
  const [aY, bY] = spread(
    a === null ? 0 : endShare(a, 100),
    b === null ? 0 : endShare(b, 100),
    LABEL_GAP[size],
  );
  const alt = [first, second]
    .map((s) => describe(liveSummary(s.label ?? s.name, s.points, dropped)))
    .join(" ");
  const geometry = { max: 100, windowMs, intervalMs };
  return (
    <div
      data-slot="live-percent-chart"
      data-size={size}
      className={cn(chartClass({ size }), className)}
      {...props}
    >
      <ChartHead title={title} aside={aside} />
      {/* The plot is the image: its name, aside and note stay text a screen reader reads. */}
      <span
        role="img"
        aria-label={alt}
        className={cn(large && "flex flex-col gap-2.5")}
      >
        {large ? (
          <span className={figuresClass}>
            <Figure
              name={first.name}
              stroke="solid"
              value={a}
              format={format}
              formatFigure={formatFigure}
              missing={missing}
            />
            <Figure
              name={second.name}
              stroke="dashed"
              value={b}
              format={format}
              formatFigure={formatFigure}
              missing={missing}
            />
          </span>
        ) : null}
        <span className={plotClass({ size })}>
          <span className={areaClass({ size })}>
            <Plot>
              <Rule y={yAt(50, 100, "full")} kind="grid" />
              <Rule y={yAt(100, 100, "full")} kind="grid" />
              <Rule y={yAt(0, 100, "full")} kind="base" />
              {last === null ? null : (
                <g ref={shift}>
                  {large ? (
                    <Area
                      d={areaPath(first.points, { ...geometry, last })}
                      stroke="solid"
                      toward="up"
                    />
                  ) : null}
                  <path
                    data-part="line"
                    d={linePath(second.points, { ...geometry, last })}
                    className={lineClass.dashed}
                  />
                  <path
                    data-part="line"
                    d={linePath(first.points, { ...geometry, last })}
                    className={lineClass.solid}
                  />
                </g>
              )}
            </Plot>
            <ScaleMark at="top">{formatScale(100)}</ScaleMark>
            <ScaleMark at="middle">{formatScale(50)}</ScaleMark>
          </span>
          <span className="relative">
            {last === null ? null : large ? (
              <>
                <EndName share={aY}>{first.name}</EndName>
                <EndName share={bY}>{second.name}</EndName>
              </>
            ) : (
              <>
                <EndLabel
                  share={aY}
                  value={a}
                  format={format}
                  name={first.name}
                  missing={missing}
                />
                <EndLabel
                  share={bY}
                  value={b}
                  format={format}
                  name={second.name}
                  missing={missing}
                />
              </>
            )}
          </span>
        </span>
      </span>
      {large ? null : <Key solid={first.name} dashed={second.name} />}
    </div>
  );
}

/**
 * Two rates mirrored about a baseline (the network: in above, out below), each half on its own scale
 * written at its edge, so a copy in at 90 MiB/s does not flatten the 1 MiB/s going out. Each scale is
 * the smallest of 1, 2 or 5 times a power of ten over the readings this page holds, never under
 * `floor`, and glides to a new scale when a bigger reading arrives or an old one is let go.
 * `size="large"` heads the plot with both figures and fills each half from its line to the baseline.
 */
function LiveMirrorChart({
  above,
  below,
  title,
  aside,
  now,
  dropped = false,
  windowMs = LIVE_WINDOW_MS,
  intervalMs = LIVE_INTERVAL_MS,
  floor = MIN_RATE_SCALE,
  format,
  formatScale,
  formatFigure,
  missing,
  describe,
  describeScales,
  note,
  size = "default",
  className,
  ...props
}: LiveMirrorChartProps) {
  const large = size === "large";
  const last = now === undefined ? newestOf(above.points, below.points) : now;
  const shift = useShift(last, windowMs);
  const aboveMax = rateScale(above.points, floor);
  const belowMax = rateScale(below.points, floor);
  const aboveShown = useGlide(aboveMax) ?? aboveMax;
  const belowShown = useGlide(belowMax) ?? belowMax;
  const a = above.points.at(-1)?.v ?? null;
  const b = below.points.at(-1)?.v ?? null;
  // Each label stays on its own side, far enough from the baseline that the two never touch.
  const aY = Math.min(
    0.5 - MIRROR_LABEL_GAP[size],
    a === null ? 0.3 : endShare(a, aboveShown, "up"),
  );
  const bY = Math.max(
    0.5 + MIRROR_LABEL_GAP[size],
    b === null ? 0.7 : endShare(b, belowShown, "down"),
  );
  const alt = [
    ...[above, below].map((s) =>
      describe(liveSummary(s.label ?? s.name, s.points, dropped)),
    ),
    describeScales(aboveMax, belowMax),
  ].join(" ");
  const geometry = { windowMs, intervalMs };
  const upper = { ...geometry, max: aboveShown, half: "up" as const };
  const lower = { ...geometry, max: belowShown, half: "down" as const };
  return (
    <div
      data-slot="live-mirror-chart"
      data-size={size}
      className={cn(chartClass({ size }), className)}
      {...props}
    >
      <ChartHead title={title} aside={aside} />
      {/* The plot is the image: its name, aside and note stay text a screen reader reads. */}
      <span
        role="img"
        aria-label={alt}
        className={cn(large && "flex flex-col gap-2.5")}
      >
        {large ? (
          <span className={figuresClass}>
            <Figure
              name={above.name}
              stroke="solid"
              value={a}
              format={format}
              formatFigure={formatFigure}
              missing={missing}
            />
            <Figure
              name={below.name}
              stroke="dashed"
              value={b}
              format={format}
              formatFigure={formatFigure}
              missing={missing}
            />
          </span>
        ) : null}
        <span className={plotClass({ size })}>
          <span className={areaClass({ size })}>
            <Plot>
              <Rule y={yAt(1, 1, "up")} kind="grid" />
              <Rule y={yAt(1, 1, "down")} kind="grid" />
              <Rule y={PLOT_H / 2} kind="base" />
              {last === null ? null : (
                <g ref={shift}>
                  {large ? (
                    <>
                      <Area
                        d={areaPath(above.points, { ...upper, last })}
                        stroke="solid"
                        toward="up"
                      />
                      <Area
                        d={areaPath(below.points, { ...lower, last })}
                        stroke="dashed"
                        toward="down"
                      />
                    </>
                  ) : null}
                  <path
                    data-part="line"
                    d={linePath(above.points, { ...upper, last })}
                    className={lineClass.solid}
                  />
                  <path
                    data-part="line"
                    d={linePath(below.points, { ...lower, last })}
                    className={lineClass.dashed}
                  />
                </g>
              )}
            </Plot>
            <ScaleMark at="top">{formatScale(aboveMax)}</ScaleMark>
            <ScaleMark at="bottom">{formatScale(belowMax)}</ScaleMark>
          </span>
          <span className="relative">
            {last === null ? null : large ? (
              <>
                <EndName share={aY}>{above.name}</EndName>
                <EndName share={bY}>{below.name}</EndName>
              </>
            ) : (
              <>
                <EndLabel
                  share={aY}
                  value={a}
                  format={format}
                  name={above.name}
                  missing={missing}
                />
                <EndLabel
                  share={bY}
                  value={b}
                  format={format}
                  name={below.name}
                  missing={missing}
                />
              </>
            )}
          </span>
        </span>
      </span>
      {large ? null : <Key solid={above.name} dashed={below.name} />}
      {note === undefined ? null : (
        <span className="text-xs text-tertiary-foreground">{note}</span>
      )}
    </div>
  );
}

interface LivePairProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** The two percentages on one scale: processor and memory. `now` is the strip's, unless set. */
  percent: LivePercentChartProps;
  /** The mirrored rates: network in and out. `now` is the strip's, unless set. */
  mirror: LiveMirrorChartProps;
  /**
   * The one line the strip says about its readings: how far back, and how often. "Since 10:31, a
   * reading every 2 seconds." Built by the caller from `liveSpan`.
   */
  caption?: React.ReactNode;
  /**
   * `large`: the dashboard's instrument, each chart headed by its figures large and in mono, the plots
   * taller and the areas under the lines filled. A chart's own `size` wins over this.
   */
  size?: LiveChartSize;
}

/**
 * The live readouts as two charts with four series (owner, 2026-11-26): processor and memory on one
 * percent scale, and the network mirrored, in above the line and out below, each half on its own
 * scale. Teal (`series-2`) solid and violet (`series-1`) dashed in both, each line named at its end.
 * Both charts share one right edge, the newest reading of any series. It draws only the readings it
 * is given and never fetches; a new reading shifts both charts left over the glide duration, the end
 * labels and the scales glide to their values, and under reduced motion all of it lands in place.
 * Nothing pulses, and no dot rides the head of a line. `size="large"` is the same model and the same
 * text alternatives, drawn as the dashboard's instrument: figures over each plot, the plots taller,
 * the areas filled, and each line named at its end with its value in the figure.
 */
function LivePair({
  percent,
  mirror,
  caption,
  size = "default",
  className,
  ...props
}: LivePairProps) {
  const now = newestOf(
    percent.series[0].points,
    percent.series[1].points,
    mirror.above.points,
    mirror.below.points,
  );
  return (
    <div
      data-slot="live-pair"
      data-size={size}
      className={cn("flex min-w-0 flex-col gap-3.5", className)}
      {...props}
    >
      <div className="flex flex-wrap items-start gap-x-9 gap-y-6">
        <LivePercentChart now={now} {...percent} size={percent.size ?? size} />
        <LiveMirrorChart now={now} {...mirror} size={mirror.size ?? size} />
      </div>
      {caption === undefined ? null : (
        <p className="m-0 text-caption text-muted-foreground">{caption}</p>
      )}
    </div>
  );
}

export { LiveMirrorChart, LivePair, LivePercentChart };
export type {
  LiveChartSize,
  LiveMirrorChartProps,
  LivePairProps,
  LivePercentChartProps,
  LiveSeries,
};
