// SPDX-License-Identifier: GPL-3.0-or-later
// "Two charts, four series" (owner, round two): Processor and Memory (System.getInformation
// `cpuUtilization`, `memUsed`, `memTotal`) on one 0 to 100 % scale, and Network in and out (the
// change in Network.enumerateDevicesList `stats.rx_bytes` and `stats.tx_bytes` for enp2s0) mirrored
// about a baseline, each half on its own scale. Development only (UI-11).
//
// Only the readings this page took are drawn, by the time each arrived: the newest at the right
// edge, two minutes across, an empty stretch where the page was not yet open, a gap where it was
// paused. Each chart is an image with a text alternative giving the value now and the range seen.
//
// Colour: the analogous pair that flanks Sky's base, teal (`series-2`, 195) solid and violet
// (`series-1`, 292) dashed, in both charts: processor and traffic in teal, memory and traffic out
// violet. Lines are named at their right end with their current value, in the text inks, never a
// series colour. A new reading shifts the chart left by its step over `--duration-glide`, the end
// labels glide to their value, and a half whose scale changes glides to it; under reduced motion all
// of it is drawn in place. No dot rides the head of a line and nothing pulses.
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { animate, curveAt, durationAt } from "../reel/helpers/tokens.ts";
import { useReducedMotion } from "../reel/helpers/useReducedMotion.ts";
import { useGlideValue } from "../reel/stage.ts";
import type { Series } from "./feed.ts";
import {
  endShare,
  gibText,
  linePath,
  liveAlt,
  pct,
  PLOT_H,
  PLOT_W,
  rateScale,
  rateText,
  scaleText,
  spanWords,
  spread,
  WINDOW_MS,
  yAt,
} from "./model.ts";

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

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="ch-svg"
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
  name: string;
}) {
  const shown = useGlideValue(value ?? 0);
  return (
    <span className="ch-end" style={v("--y", share)}>
      <span className="ch-end-name">{name}</span>
      <span className="ch-end-value">
        {value === null ? "No reading" : format(shown)}
      </span>
    </span>
  );
}

/** The key under a chart: each line's stroke beside its name, so the dash is learnt once. */
function Key({ solid, dashed }: { solid: string; dashed: string }) {
  return (
    <span className="ch-key" aria-hidden="true">
      <span className="ch-key-item">
        <svg viewBox="0 0 24 8" className="ch-key-line">
          <path d="M1 4H23" className="ch-line ch-line-teal" />
        </svg>
        {solid}
      </span>
      <span className="ch-key-item">
        <svg viewBox="0 0 24 8" className="ch-key-line">
          <path d="M1 4H23" className="ch-line ch-line-violet" />
        </svg>
        {dashed}
      </span>
    </span>
  );
}

/** Two end labels stay this share of the plot apart: enough on the compact plot's 88px. */
const LABEL_GAP = 0.4;
const MIRROR_LABEL_GAP = 0.22;

/** Processor and memory on one 0 to 100 % scale: processor teal and solid, memory violet and dashed. */
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
      <span className="ch-plot">
        <span className="ch-plot-area">
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
                  className="ch-line ch-line-violet"
                />
                <path
                  d={linePath(s.cpu, s.last, 100)}
                  className="ch-line ch-line-teal"
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
      <Key solid="Processor" dashed="Memory" />
    </div>
  );
}

/**
 * Traffic in above the baseline and out below it, each half on its own scale written at its edge,
 * so a copy in at 90 MiB/s does not flatten the 1 MiB/s going out. Each scale is the smallest of 1,
 * 2 or 5 times a power of ten over the readings this page holds, never under 1 MiB/s, and glides to
 * a new scale when a bigger reading arrives or an old one is let go.
 */
export function NetworkMirror({ s }: { s: Series }) {
  const shift = useShift(s.last);
  const inMax = rateScale(s.rx);
  const outMax = rateScale(s.tx);
  const inShown = useGlideValue(inMax);
  const outShown = useGlideValue(outMax);
  const rx = s.rx.at(-1)?.v ?? null;
  const tx = s.tx.at(-1)?.v ?? null;
  // In sits above the middle, out below it; each label stays on its own side, far enough from the
  // baseline that the two never touch on the compact plot.
  const inY = Math.min(
    0.5 - MIRROR_LABEL_GAP,
    rx === null ? 0.3 : endShare(rx, inShown, "up"),
  );
  const outY = Math.max(
    0.5 + MIRROR_LABEL_GAP,
    tx === null ? 0.7 : endShare(tx, outShown, "down"),
  );
  return (
    <div
      className="ch-pair"
      role="img"
      aria-label={`${liveAlt("Network in", s.rx, s.dropped, rateText)} ${liveAlt("Network out", s.tx, s.dropped, rateText)} In is drawn on a scale to ${scaleText(inMax)} and out on a scale to ${scaleText(outMax)}.`}
    >
      <span className="ch-tr-head">
        <span className="ch-tr-name">
          Network, in above the line and out below
        </span>
        <span className="ch-tr-aside">enp2s0</span>
      </span>
      <span className="ch-plot">
        <span className="ch-plot-area">
          <Svg>
            <path
              d={`M0 ${String(yAt(1, 1, "up"))}H${String(PLOT_W)}`}
              className="ch-grid"
            />
            <path
              d={`M0 ${String(yAt(1, 1, "down"))}H${String(PLOT_W)}`}
              className="ch-grid"
            />
            <path
              d={`M0 ${String(PLOT_H / 2)}H${String(PLOT_W)}`}
              className="ch-base"
            />
            {s.last === null ? null : (
              <g ref={shift}>
                <path
                  d={linePath(s.rx, s.last, inShown, "up")}
                  className="ch-line ch-line-teal"
                />
                <path
                  d={linePath(s.tx, s.last, outShown, "down")}
                  className="ch-line ch-line-violet"
                />
              </g>
            )}
          </Svg>
          <span className="ch-scale">{scaleText(inMax)}</span>
          <span className="ch-scale ch-scale-bottom">{scaleText(outMax)}</span>
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
      <Key solid="In" dashed="Out" />
      <span className="ch-tr-note">The two halves are scaled separately.</span>
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

/** The one line a strip says about its readings: how far back, and how often. */
export function SpanLine({ s, paused }: { s: Series; paused: boolean }) {
  const span = spanWords(s.cpu, s.dropped);
  return (
    <p className="ch-span">
      {span}, a reading every 2 seconds{paused ? ", paused" : ""}
    </p>
  );
}
