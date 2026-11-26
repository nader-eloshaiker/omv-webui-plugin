// SPDX-License-Identifier: GPL-3.0-or-later
// Three ways to draw the live readouts: Processor and Memory (System.getInformation
// `cpuUtilization`, `memUsed`, `memTotal`) and Network in and out (the change in
// Network.enumerateDevicesList `stats.rx_bytes` and `stats.tx_bytes` for enp2s0). Development only
// (UI-11).
//
// Only the readings this page took are drawn, by the time each arrived: the newest at the right
// edge, two minutes across, an empty stretch where the page was not yet open, a gap where it was
// paused. Each chart is an image with a text alternative giving the value now and the range seen.
// Lines are labelled at their right end with their current value, in the text inks, never a series
// colour, and each series has its own dash or position. A new reading shifts the chart left by its
// step over `--duration-glide`, and the end label glides to its value; under reduced motion both
// are drawn in place. No dot rides the head of a line and nothing pulses.
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { animate, curveAt, durationAt } from "../reel/helpers/tokens.ts";
import { useReducedMotion } from "../reel/helpers/useReducedMotion.ts";
import { useGlideValue } from "../reel/stage.ts";
import type { Series } from "./feed.ts";
import type { Point } from "./model.ts";
import {
  areaPath,
  endShare,
  EVERY_MS,
  gibText,
  linePath,
  liveAlt,
  niceMax,
  pct,
  PLOT_H,
  PLOT_W,
  rangeOf,
  rateText,
  scaleText,
  spanWords,
  spread,
  WINDOW_MS,
  xAt,
  yAt,
} from "./model.ts";
import { useSvgId } from "./svgId.ts";

const v = (name: string, value: number) =>
  ({ [name]: String(value) }) as CSSProperties;

/**
 * The plot's group, shifted back by the new reading's step and slid into place, so the chart moves
 * left as time does. Not on the first reading, and not under reduced motion.
 */
function useShift(last: number | null) {
  const ref = useRef<SVGGElement>(null);
  const prevRef = useRef(last);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const before = prevRef.current;
    prevRef.current = last;
    const g = ref.current;
    if (!g || reduced || before === null || last === null || last <= before) {
      return;
    }
    const dx = ((last - before) / WINDOW_MS) * PLOT_W;
    if (dx >= PLOT_W) {
      return;
    }
    animate(
      g,
      [{ transform: `translateX(${dx.toFixed(2)}px)` }, { transform: "none" }],
      {
        duration: durationAt(g, "--duration-glide"),
        easing: curveAt(g, "--ease-standard"),
      },
    );
  }, [last, reduced]);
  return ref;
}

/** The newest columns rise from their baseline over `--duration-base` as they arrive. */
function useRise(last: number | null) {
  const ref = useRef<SVGGElement>(null);
  const prevRef = useRef(last);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const before = prevRef.current;
    prevRef.current = last;
    const g = ref.current;
    if (!g || reduced || before === null || last === null || last <= before) {
      return;
    }
    for (const rect of g.querySelectorAll("[data-newest]")) {
      animate(rect, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], {
        duration: durationAt(g, "--duration-base"),
        easing: curveAt(g, "--ease-standard"),
      });
    }
  }, [last, reduced]);
  return ref;
}

function Svg({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      className={className ? `ch-svg ${className}` : "ch-svg"}
      viewBox={`0 0 ${String(PLOT_W)} ${String(PLOT_H)}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** A label beside the end of a line, at the line's height, its figure gliding to the new value. */
function EndLabel({
  share,
  value,
  format,
  name,
}: {
  share: number;
  value: number | null;
  format: (n: number) => string;
  name?: string;
}) {
  const shown = useGlideValue(value ?? 0);
  return (
    <span className="ch-end" style={v("--y", share)}>
      {name ? <span className="ch-end-name">{name}</span> : null}
      <span className="ch-end-value">
        {value === null ? "No reading" : format(shown)}
      </span>
    </span>
  );
}

/** A figure that glides to each new reading. */
function Figure({
  value,
  format,
}: {
  value: number | null;
  format: (n: number) => string;
}) {
  const shown = useGlideValue(value ?? 0);
  return <>{value === null ? "No reading yet" : format(shown)}</>;
}

// ─── A. One trace each ────────────────────────────────────────────────────────────────────────

/**
 * A single live trace in `trace` over its `trace-area` fill (the one gradient), on a fixed scale,
 * labelled at its right end with the value now.
 */
export function Trace({
  name,
  points,
  last,
  dropped,
  max,
  format,
  scale,
  aside,
}: {
  name: string;
  points: Point[];
  last: number | null;
  dropped: boolean;
  max: number;
  format: (n: number) => string;
  scale: string;
  aside?: string;
}) {
  const gradient = useSvgId("chg");
  const shift = useShift(last);
  const now = points.at(-1)?.v ?? null;
  return (
    <div
      className="ch-tr"
      role="img"
      aria-label={liveAlt(name, points, dropped, format)}
    >
      <span className="ch-tr-head">
        <span className="ch-tr-name">{name}</span>
        {aside ? <span className="ch-tr-aside">{aside}</span> : null}
      </span>
      <span className="ch-plot">
        <span className="ch-plot-area">
          <Svg>
            <defs>
              <linearGradient
                id={gradient}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="0"
                y2={PLOT_H}
              >
                <stop offset="0" className="ch-area-top" />
                <stop offset="1" className="ch-area-bottom" />
              </linearGradient>
            </defs>
            <path
              d={`M0 ${String(yAt(max, max, "full"))}H${String(PLOT_W)}`}
              className="ch-grid"
            />
            <path
              d={`M0 ${String(yAt(0, max, "full"))}H${String(PLOT_W)}`}
              className="ch-base"
            />
            {last === null ? null : (
              <g ref={shift}>
                <path
                  d={areaPath(points, last, max)}
                  fill={`url(#${gradient})`}
                />
                <path
                  d={linePath(points, last, max)}
                  className="ch-line ch-line-trace"
                />
              </g>
            )}
          </Svg>
          <span className="ch-scale">{scale}</span>
        </span>
        <span className="ch-gutter">
          {last === null ? null : (
            <EndLabel
              share={now === null ? 1 : endShare(now, max)}
              value={now}
              format={format}
            />
          )}
        </span>
      </span>
    </div>
  );
}

export function TracesStrip({ s }: { s: Series }) {
  // In and out each on their own scale, said at the top of each chart.
  const netIn = niceMax(rangeOf(s.rx)?.max ?? 0);
  const netOut = niceMax(rangeOf(s.tx)?.max ?? 0);
  return (
    <div className="ch-strip ch-strip-traces">
      <Trace
        name="Processor"
        points={s.cpu}
        last={s.last}
        dropped={s.dropped}
        max={100}
        format={pct}
        scale={pct(100)}
      />
      <Trace
        name="Memory"
        points={s.memory}
        last={s.last}
        dropped={s.dropped}
        max={100}
        format={pct}
        scale={pct(100)}
        aside={
          s.memUsed !== null && s.memTotal !== null
            ? `${gibText(s.memUsed)} of ${gibText(s.memTotal)}`
            : undefined
        }
      />
      <Trace
        name="Network in"
        points={s.rx}
        last={s.last}
        dropped={s.dropped}
        max={netIn}
        format={rateText}
        scale={scaleText(netIn)}
      />
      <Trace
        name="Network out"
        points={s.tx}
        last={s.last}
        dropped={s.dropped}
        max={netOut}
        format={rateText}
        scale={scaleText(netOut)}
      />
    </div>
  );
}

// ─── B. Two charts, four series ───────────────────────────────────────────────────────────────

/** Two end labels stay this share of the plot apart: enough on the compact plot's 88px. */
const LABEL_GAP = 0.4;
const MIRROR_LABEL_GAP = 0.22;

/** Processor and memory on one 0 to 100 % scale: two series, solid and dashed, each labelled. */
export function PercentPair({ s }: { s: Series }) {
  const shift = useShift(s.last);
  const cpu = s.cpu.at(-1)?.v ?? null;
  const mem = s.memory.at(-1)?.v ?? null;
  const [cpuY, memY] = spread(
    cpu === null ? 0 : endShare(cpu, 100),
    mem === null ? 0 : endShare(mem, 100),
    LABEL_GAP,
  );
  return (
    <div
      className="ch-pair"
      role="img"
      aria-label={`${liveAlt("Processor", s.cpu, s.dropped, pct)} ${liveAlt("Memory", s.memory, s.dropped, pct)}`}
    >
      <span className="ch-tr-head">
        <span className="ch-tr-name">Processor and memory</span>
        {s.memUsed !== null && s.memTotal !== null ? (
          <span className="ch-tr-aside">
            Memory: {gibText(s.memUsed)} of {gibText(s.memTotal)}
          </span>
        ) : null}
      </span>
      <span className="ch-plot" data-gutter="wide">
        <span className="ch-plot-area ch-plot-tall">
          <Svg>
            <path
              d={`M0 ${String(yAt(50, 100, "full"))}H${String(PLOT_W)}`}
              className="ch-grid"
            />
            <path
              d={`M0 ${String(yAt(100, 100, "full"))}H${String(PLOT_W)}`}
              className="ch-grid"
            />
            <path
              d={`M0 ${String(yAt(0, 100, "full"))}H${String(PLOT_W)}`}
              className="ch-base"
            />
            {s.last === null ? null : (
              <g ref={shift}>
                <path
                  d={linePath(s.memory, s.last, 100)}
                  className="ch-line ch-line-s2"
                />
                <path
                  d={linePath(s.cpu, s.last, 100)}
                  className="ch-line ch-line-s1"
                />
              </g>
            )}
          </Svg>
          <span className="ch-scale">{pct(100)}</span>
          <span className="ch-scale ch-scale-mid">{pct(50)}</span>
        </span>
        <span className="ch-gutter">
          {s.last === null ? null : (
            <>
              <EndLabel
                share={cpuY}
                value={cpu}
                format={pct}
                name="Processor"
              />
              <EndLabel share={memY} value={mem} format={pct} name="Memory" />
            </>
          )}
        </span>
      </span>
      <span className="ch-key" aria-hidden="true">
        <span className="ch-key-item">
          <svg viewBox="0 0 24 8" className="ch-key-line">
            <path d="M0 4H24" className="ch-line ch-line-s1" />
          </svg>
          Processor
        </span>
        <span className="ch-key-item">
          <svg viewBox="0 0 24 8" className="ch-key-line">
            <path d="M0 4H24" className="ch-line ch-line-s2" />
          </svg>
          Memory
        </span>
      </span>
    </div>
  );
}

/** Traffic in above the baseline and out below it, on one scale: two series, solid and dashed. */
export function NetworkMirror({ s }: { s: Series }) {
  const shift = useShift(s.last);
  const max = niceMax(
    Math.max(rangeOf(s.rx)?.max ?? 0, rangeOf(s.tx)?.max ?? 0),
  );
  const rx = s.rx.at(-1)?.v ?? null;
  const tx = s.tx.at(-1)?.v ?? null;
  // In sits above the middle, out below it; each label stays on its own side, far enough from the
  // baseline that the two never touch on the compact plot.
  const inY = Math.min(
    0.5 - MIRROR_LABEL_GAP,
    rx === null ? 0.3 : endShare(rx, max, "up"),
  );
  const outY = Math.max(
    0.5 + MIRROR_LABEL_GAP,
    tx === null ? 0.7 : endShare(tx, max, "down"),
  );
  return (
    <div
      className="ch-pair"
      role="img"
      aria-label={`${liveAlt("Network in", s.rx, s.dropped, rateText)} ${liveAlt("Network out", s.tx, s.dropped, rateText)}`}
    >
      <span className="ch-tr-head">
        <span className="ch-tr-name">Network, in above and out below</span>
        <span className="ch-tr-aside">enp2s0</span>
      </span>
      <span className="ch-plot" data-gutter="wide">
        <span className="ch-plot-area ch-plot-tall">
          <Svg>
            <path
              d={`M0 ${String(yAt(max, max, "up"))}H${String(PLOT_W)}`}
              className="ch-grid"
            />
            <path
              d={`M0 ${String(yAt(max, max, "down"))}H${String(PLOT_W)}`}
              className="ch-grid"
            />
            <path
              d={`M0 ${String(PLOT_H / 2)}H${String(PLOT_W)}`}
              className="ch-base"
            />
            {s.last === null ? null : (
              <g ref={shift}>
                <path
                  d={linePath(s.rx, s.last, max, "up")}
                  className="ch-line ch-line-s3"
                />
                <path
                  d={linePath(s.tx, s.last, max, "down")}
                  className="ch-line ch-line-s4"
                />
              </g>
            )}
          </Svg>
          <span className="ch-scale">{scaleText(max)} in</span>
          <span className="ch-scale ch-scale-bottom">{scaleText(max)} out</span>
        </span>
        <span className="ch-gutter">
          {s.last === null ? null : (
            <>
              <EndLabel share={inY} value={rx} format={rateText} name="In" />
              <EndLabel share={outY} value={tx} format={rateText} name="Out" />
            </>
          )}
        </span>
      </span>
    </div>
  );
}

export function PairedStrip({ s }: { s: Series }) {
  return (
    <div className="ch-strip ch-strip-pair">
      <PercentPair s={s} />
      <NetworkMirror s={s} />
    </div>
  );
}

// ─── C. Figures first, the readings beneath ───────────────────────────────────────────────────

const COL_W = (EVERY_MS / WINDOW_MS) * PLOT_W;

/** One column per reading: up from the bottom, or out from the middle (`mirror`). */
function columnsOf(
  points: Point[],
  last: number,
  max: number,
  mode: "full" | "up" | "down",
  width: number,
): ReactNode[] {
  const newest = points.at(-1)?.t;
  return points.flatMap((p) => {
    if (p.v === null) {
      return [];
    }
    const x = xAt(p.t, last) - width;
    const top = yAt(p.v, max, mode);
    const base = mode === "full" ? yAt(0, max, "full") : PLOT_H / 2;
    // Never thinner than a hairline, so a reading of 0 still shows it was taken.
    const y = mode === "down" ? base : Math.min(top, base - 0.8);
    const h = mode === "down" ? Math.max(top - base, 0.8) : base - y;
    return [
      <rect
        key={p.t}
        x={x.toFixed(2)}
        y={y.toFixed(2)}
        width={width.toFixed(2)}
        height={h.toFixed(2)}
        data-newest={p.t === newest || undefined}
        data-dir={mode === "down" ? "down" : "up"}
      />,
    ];
  });
}

function Columns({
  points,
  last,
  max,
  alt,
}: {
  points: Point[];
  last: number | null;
  max: number;
  alt: string;
}) {
  const shift = useShift(last);
  const rise = useRise(last);
  return (
    <span className="ch-cols" role="img" aria-label={alt}>
      <Svg>
        <path
          d={`M0 ${String(yAt(0, max, "full"))}H${String(PLOT_W)}`}
          className="ch-base"
        />
        {last === null ? null : (
          <g ref={shift}>
            <g ref={rise} className="ch-col ch-col-trace">
              {columnsOf(points, last, max, "full", COL_W * 0.62)}
            </g>
          </g>
        )}
      </Svg>
    </span>
  );
}

function MirrorColumns({ s, max }: { s: Series; max: number }) {
  const shift = useShift(s.last);
  const rise = useRise(s.last);
  return (
    <span
      className="ch-cols ch-cols-mirror"
      role="img"
      aria-label={`${liveAlt("Network in", s.rx, s.dropped, rateText)} ${liveAlt("Network out", s.tx, s.dropped, rateText)}`}
    >
      <Svg>
        <path
          d={`M0 ${String(PLOT_H / 2)}H${String(PLOT_W)}`}
          className="ch-base"
        />
        {s.last === null ? null : (
          <g ref={shift}>
            <g ref={rise}>
              <g className="ch-col ch-col-s1">
                {columnsOf(s.rx, s.last, max, "up", COL_W * 0.62)}
              </g>
              <g className="ch-col ch-col-s2">
                {columnsOf(s.tx, s.last, max, "down", COL_W * 0.34)}
              </g>
            </g>
          </g>
        )}
      </Svg>
      <span className="ch-cols-side ch-cols-side-in">In</span>
      <span className="ch-cols-side ch-cols-side-out">Out</span>
    </span>
  );
}

/** Memory as used of total, with the range this page saw marked under the bar. */
function MemoryMeter({ s }: { s: Series }) {
  const range = rangeOf(s.memory);
  const now = range?.now ?? null;
  const shown = useGlideValue(now ?? 0);
  if (
    now === null ||
    s.memUsed === null ||
    s.memTotal === null ||
    range === null
  ) {
    return <span className="ch-mem ch-muted">No reading yet</span>;
  }
  return (
    <span className="ch-mem">
      <span
        className="ch-mem-bar"
        role="meter"
        aria-label="Memory in use"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(now)}
        aria-valuetext={`${pct(now)}, ${gibText(s.memUsed)} of ${gibText(s.memTotal)}; between ${pct(range.min)} and ${pct(range.max)} ${s.dropped ? "in the last 2 minutes" : "since this page opened"}.`}
      >
        <span className="ch-mem-fill" style={v("--v", shown / 100)} />
      </span>
      <span
        className="ch-mem-range"
        aria-hidden="true"
        style={{ ...v("--lo", range.min / 100), ...v("--hi", range.max / 100) }}
      />
      <span className="ch-mem-seen" aria-hidden="true">
        Seen: {pct(range.min)} to {pct(range.max)}
      </span>
    </span>
  );
}

export function FiguresStrip({ s }: { s: Series }) {
  const net = niceMax(
    Math.max(rangeOf(s.rx)?.max ?? 0, rangeOf(s.tx)?.max ?? 0),
  );
  const cpu = s.cpu.at(-1)?.v ?? null;
  const mem = s.memory.at(-1)?.v ?? null;
  const rx = s.rx.at(-1)?.v ?? null;
  const tx = s.tx.at(-1)?.v ?? null;
  return (
    <dl className="ch-strip ch-figs">
      <div className="ch-fig" data-w="cpu">
        <dt>Processor</dt>
        <dd>
          <span className="ch-fig-value">
            <Figure value={cpu} format={pct} />
          </span>
          <Columns
            points={s.cpu}
            last={s.last}
            max={100}
            alt={liveAlt("Processor", s.cpu, s.dropped, pct)}
          />
        </dd>
      </div>
      <div className="ch-fig" data-w="mem">
        <dt>Memory</dt>
        <dd>
          <span className="ch-fig-value">
            <Figure value={mem} format={pct} />
            {s.memUsed !== null && s.memTotal !== null ? (
              <span className="ch-fig-aside">
                , {gibText(s.memUsed)} of {gibText(s.memTotal)}
              </span>
            ) : null}
          </span>
          <MemoryMeter s={s} />
        </dd>
      </div>
      <div className="ch-fig" data-w="net">
        <dt>Network</dt>
        <dd>
          <span className="ch-fig-value">
            <Figure value={rx} format={rateText} />
            <span className="ch-fig-aside"> in, </span>
            <Figure value={tx} format={rateText} />
            <span className="ch-fig-aside"> out</span>
          </span>
          <MirrorColumns s={s} max={net} />
        </dd>
      </div>
    </dl>
  );
}

/** The one line a strip says about its readings: how far back, and how often. */
export function SpanLine({ s, paused }: { s: Series; paused: boolean }) {
  const span = spanWords(s.cpu, s.dropped);
  return (
    <p className="ch-span">
      {span}, a reading every 2 seconds{paused ? ", paused" : ""}
    </p>
  );
}
