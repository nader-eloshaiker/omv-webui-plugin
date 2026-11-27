// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import { useGlide } from "../motion/motion";
import { animateElement, curveAt, durationAt } from "../motion/motion-tokens";
import { useReducedMotion } from "../motion/reduced-motion";
import {
  endShare,
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
  type LivePoint,
  type LiveSummary,
} from "./live-pair-model";

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

/** A scale's value at the plot's edge, on the page ground so the rule under it does not cross it. */
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
        "absolute start-0 bg-page pe-1 text-xs leading-3 text-tertiary-foreground tabular-nums",
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

const chartClass = "flex min-w-0 flex-[1_1_300px] flex-col gap-1.5";
const plotClass = "grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2";
const areaClass = "relative h-28 compact:h-22";

/** Two end labels stay this share of the plot apart: enough on the compact plot's 88px. */
const LABEL_GAP = 0.4;
const MIRROR_LABEL_GAP = 0.22;

/**
 * Two series on one 0 to 100 scale (processor and memory), the first teal and solid, the second
 * violet and dashed, each named at its end with its value now (style guide 3.9). The plot is an
 * image with a text alternative: each series' value now and the range this page saw. The title and
 * the aside over it are text, read before it.
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
  missing,
  describe,
  className,
  ...props
}: LivePercentChartProps) {
  const [first, second] = series;
  const last = now === undefined ? newestOf(first.points, second.points) : now;
  const shift = useShift(last, windowMs);
  const a = first.points.at(-1)?.v ?? null;
  const b = second.points.at(-1)?.v ?? null;
  const [aY, bY] = spread(
    a === null ? 0 : endShare(a, 100),
    b === null ? 0 : endShare(b, 100),
    LABEL_GAP,
  );
  const alt = [first, second]
    .map((s) => describe(liveSummary(s.label ?? s.name, s.points, dropped)))
    .join(" ");
  const geometry = { max: 100, windowMs, intervalMs };
  return (
    <div
      data-slot="live-percent-chart"
      className={cn(chartClass, className)}
      {...props}
    >
      <ChartHead title={title} aside={aside} />
      {/* The plot is the image: its name, aside and note stay text a screen reader reads. */}
      <span role="img" aria-label={alt} className={plotClass}>
        <span className={areaClass}>
          <Plot>
            <Rule y={yAt(50, 100, "full")} kind="grid" />
            <Rule y={yAt(100, 100, "full")} kind="grid" />
            <Rule y={yAt(0, 100, "full")} kind="base" />
            {last === null ? null : (
              <g ref={shift}>
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
          {last === null ? null : (
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
      <Key solid={first.name} dashed={second.name} />
    </div>
  );
}

/**
 * Two rates mirrored about a baseline (the network: in above, out below), each half on its own scale
 * written at its edge, so a copy in at 90 MiB/s does not flatten the 1 MiB/s going out. Each scale is
 * the smallest of 1, 2 or 5 times a power of ten over the readings this page holds, never under
 * `floor`, and glides to a new scale when a bigger reading arrives or an old one is let go.
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
  missing,
  describe,
  describeScales,
  note,
  className,
  ...props
}: LiveMirrorChartProps) {
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
    0.5 - MIRROR_LABEL_GAP,
    a === null ? 0.3 : endShare(a, aboveShown, "up"),
  );
  const bY = Math.max(
    0.5 + MIRROR_LABEL_GAP,
    b === null ? 0.7 : endShare(b, belowShown, "down"),
  );
  const alt = [
    ...[above, below].map((s) =>
      describe(liveSummary(s.label ?? s.name, s.points, dropped)),
    ),
    describeScales(aboveMax, belowMax),
  ].join(" ");
  const geometry = { windowMs, intervalMs };
  return (
    <div
      data-slot="live-mirror-chart"
      className={cn(chartClass, className)}
      {...props}
    >
      <ChartHead title={title} aside={aside} />
      {/* The plot is the image: its name, aside and note stay text a screen reader reads. */}
      <span role="img" aria-label={alt} className={plotClass}>
        <span className={areaClass}>
          <Plot>
            <Rule y={yAt(1, 1, "up")} kind="grid" />
            <Rule y={yAt(1, 1, "down")} kind="grid" />
            <Rule y={PLOT_H / 2} kind="base" />
            {last === null ? null : (
              <g ref={shift}>
                <path
                  data-part="line"
                  d={linePath(above.points, {
                    ...geometry,
                    last,
                    max: aboveShown,
                    half: "up",
                  })}
                  className={lineClass.solid}
                />
                <path
                  data-part="line"
                  d={linePath(below.points, {
                    ...geometry,
                    last,
                    max: belowShown,
                    half: "down",
                  })}
                  className={lineClass.dashed}
                />
              </g>
            )}
          </Plot>
          <ScaleMark at="top">{formatScale(aboveMax)}</ScaleMark>
          <ScaleMark at="bottom">{formatScale(belowMax)}</ScaleMark>
        </span>
        <span className="relative">
          {last === null ? null : (
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
      <Key solid={above.name} dashed={below.name} />
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
}

/**
 * The live readouts as two charts with four series (owner, 2026-11-26): processor and memory on one
 * percent scale, and the network mirrored, in above the line and out below, each half on its own
 * scale. Teal (`series-2`) solid and violet (`series-1`) dashed in both, each line named at its end.
 * Both charts share one right edge, the newest reading of any series. It draws only the readings it
 * is given and never fetches; a new reading shifts both charts left over the glide duration, the end
 * labels and the scales glide to their values, and under reduced motion all of it lands in place.
 * Nothing pulses, and no dot rides the head of a line.
 */
function LivePair({
  percent,
  mirror,
  caption,
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
      className={cn("flex min-w-0 flex-col gap-3.5", className)}
      {...props}
    >
      <div className="flex flex-wrap items-start gap-x-9 gap-y-6">
        <LivePercentChart now={now} {...percent} />
        <LiveMirrorChart now={now} {...mirror} />
      </div>
      {caption === undefined ? null : (
        <p className="m-0 text-caption text-muted-foreground">{caption}</p>
      )}
    </div>
  );
}

export { LiveMirrorChart, LivePair, LivePercentChart };
export type {
  LiveMirrorChartProps,
  LivePairProps,
  LivePercentChartProps,
  LiveSeries,
};
