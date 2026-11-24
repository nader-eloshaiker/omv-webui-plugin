// SPDX-License-Identifier: GPL-3.0-or-later
// The design lab's charts, drawn with Recharts: development only (UI-11). What they may show is set
// by A7 (journal): OMV keeps no history as numbers, so a live chart shows only what this page has
// sampled, says so, and starts empty. Colour comes from the direction's classes, never from a
// presentation attribute (an SVG attribute does not resolve var()): every mark carries a class and
// lab.css paints it. Single-series live charts draw in the brand trace (foundation 3.2); the two
// network series use the categorical series colours, each with its own dash and a direct label
// (style guide 3.9). Each chart has a text equivalent: a caption with now, highest and lowest, and
// the numbers as a table one click away.
//
// Live movement follows the foundation's "live line": when a sample arrives the line moves left by
// one step over exactly one sampling interval (Web Animations API), so the chart is never redrawn
// from scratch and moves at the rate the data really arrives. Recharts' own animation is off for
// live data. While a reader points at or focuses a chart, or under reduced motion, it redraws in
// place instead.
import type { ReactNode } from "react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricDef, Row, Tone } from "./chartModel.ts";
import {
  ago,
  clock,
  DISK_ALERT_C,
  fmt,
  inView,
  NBSP,
  spanWords,
  toRows,
} from "./chartModel.ts";
import type { Disk, FileSystem } from "./data.ts";
import { percent, size } from "./data.ts";
import type { Sample } from "./live.ts";
import { SAMPLE_MS } from "./live.ts";
import { reducedMotion } from "./motion.ts";
import { cx } from "./util.ts";

/**
 * Recharts writes a text's fill into its style; currentColor hands the colour to the stylesheet,
 * which sets `color` per class from the direction's tokens.
 */
const TICK = { fill: "currentColor" } as const;

/* ─── Shared pieces ───────────────────────────────────────────────────────────────────────────── */

export function Swatch({ tone, dash }: { tone: Tone; dash?: boolean }) {
  return (
    <svg
      className={cx("lx-chart-swatch", `is-${tone}`, dash && "is-dash")}
      width="16"
      height="8"
      viewBox="0 0 16 8"
      aria-hidden="true"
    >
      <path d="M1 4h14" />
    </svg>
  );
}

/** What a tooltip's content needs from Recharts: whether it is shown, and the row pointed at. */
interface TipState {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}

function LiveTip({ active, payload, def }: TipState & { def: MetricDef }) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row) {
    return null;
  }
  return (
    <div className="lx-chart-tip">
      <p className="lx-chart-tip-time">
        <span className="lx-num">{clock(row.t)}</span>
        <span className="lx-chart-tip-ago">{ago(row.x, true)}</span>
      </p>
      <ul>
        {def.series.map((s) => (
          <li key={s.key}>
            <Swatch tone={s.tone} dash={s.dash} />
            <span className="lx-chart-tip-name">
              {def.series.length > 1 ? s.name : def.name}
            </span>
            <span className="lx-num lx-chart-tip-val">
              {fmt(row[s.key], def)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Glide the live layers one step to the left when a new sample arrives, unless the reader is
 * pointing at the chart, it has focus, or motion is reduced. Recharts clips each line to the plot
 * with a clip path inside the line's own layer, so the clip's rectangle is moved the opposite way at
 * the same rate and the plot's edges stay still. The head dot beats once per sample.
 */
function useLiveGlide(
  root: React.RefObject<HTMLDivElement | null>,
  latest: number | undefined,
  previous: number | undefined,
  windowS: number,
  still: boolean,
) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || latest === undefined || previous === undefined) {
      return;
    }
    if (still || reducedMotion()) {
      return;
    }
    const grid = el.querySelector<SVGGraphicsElement>(
      ".recharts-cartesian-grid",
    );
    const width = grid?.getBBox().width ?? 0;
    const step = (width * (latest - previous)) / 1000 / windowS;
    if (!step || step > width / 4) {
      return;
    }
    const timing = { duration: SAMPLE_MS, easing: "linear" } as const;
    const shift = (px: number) => [
      { transform: `translateX(${px.toFixed(2)}px)` },
      { transform: "translateX(0)" },
    ];
    const animations: Animation[] = [];
    for (const layer of el.querySelectorAll<SVGGElement>(".lx-glide")) {
      animations.push(layer.animate(shift(step), timing));
      for (const rect of layer.querySelectorAll<SVGRectElement>(
        "clipPath rect",
      )) {
        animations.push(rect.animate(shift(-step), timing));
      }
    }
    for (const head of el.querySelectorAll<SVGCircleElement>(
      ".lx-chart-head circle",
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
  }, [root, latest, previous, windowS, still]);
}

interface AxisTickProps {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
}

/**
 * A time tick: "1 min" … "now". The first and last are anchored inward so they never run past the
 * plot's edges, which matters at 390px where a chart spans the screen.
 */
function TimeTick({
  x,
  y,
  payload,
  windowS,
}: AxisTickProps & { windowS: number }) {
  const v = Number(payload?.value ?? 0);
  const anchor = v <= -windowS ? "start" : v >= 0 ? "end" : "middle";
  return (
    <text
      x={Number(x)}
      y={Number(y) + 6}
      dy="0.71em"
      textAnchor={anchor}
      fill="currentColor"
      className="recharts-cartesian-axis-tick-value"
    >
      {ago(v)}
    </text>
  );
}

/** The width of an element, kept current; 0 until it is laid out. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

/* ─── The live chart ─────────────────────────────────────────────────────────────────────────── */

export type LiveSize = "tile" | "large";

/**
 * One metric over the last `windowS` seconds this page sampled: a time axis of seconds ago, a value
 * axis, a tooltip with the exact value and time (pointer or arrow keys once focused), a threshold
 * line where one means something, and a head dot on the newest sample.
 */
export function LiveChart({
  def,
  samples,
  windowS,
  size = "tile",
  syncId,
  labels = size === "large",
}: {
  def: MetricDef;
  samples: Sample[];
  windowS: number;
  size?: LiveSize;
  syncId?: string;
  /** Name each line at its newest point (two series in a large chart). */
  labels?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const [still, setStill] = useState(false);
  const seen = inView(samples, windowS);
  const rows = toRows(seen);
  const values = def.series.flatMap((s) => rows.map((r) => r[s.key]));
  const { domain, ticks } = def.scale(values);
  const latest = seen.at(-1);
  const previous = seen.at(-2);
  useLiveGlide(rootRef, latest?.t, previous?.t, windowS, still);

  // The window's start and "now" always, and round steps back from now in between, as many as
  // the width holds (about one per 130px); a step too close to the start is left out.
  const width = useWidth(rootRef);
  const room = Math.max(2, Math.floor(width / 130));
  const steps = windowS >= 300 ? [60, 120, 300, 600] : [15, 30, 60];
  const tick = steps.find((step) => windowS / step <= room) ?? windowS;
  const xTicks: number[] = [-windowS];
  for (
    let s = -tick * Math.floor((windowS - 0.6 * tick) / tick);
    s < 0;
    s += tick
  ) {
    xTicks.push(s);
  }
  xTicks.push(0);
  const yFormat = (v: number) =>
    def.unit === "%" ? `${v}%` : v.toFixed(v % 1 === 0 ? 0 : 1);
  const tall = size === "large";
  // Direct labels at the newest point: when two heads sit closer than a line of text, push the
  // upper one up and the lower one down so both stay readable.
  const heads = def.series.map((s) => (latest ? latest[s.key] : 0));
  const plotPx = (tall ? 240 : 96) - 34;
  const apart =
    heads.length < 2
      ? Infinity
      : (Math.abs((heads[0] ?? 0) - (heads[1] ?? 0)) /
          (domain[1] - domain[0])) *
        plotPx;
  const nudge = (i: number) => {
    if (apart >= 14) {
      return 0;
    }
    const upper = (heads[i] ?? 0) >= (heads[1 - i] ?? 0);
    return upper ? -(14 - apart) / 2 - 1 : (14 - apart) / 2 + 1;
  };

  return (
    <div
      ref={rootRef}
      className={cx("lx-chart", `lx-chart--${size}`)}
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
      <ComposedChart
        responsive
        className="lx-chart-surface"
        data={rows}
        syncId={syncId}
        syncMethod="value"
        title={`${def.name}, last ${spanWords(windowS)}`}
        margin={{
          top: 8,
          right: labels && def.series.length > 1 ? 40 : 10,
          bottom: 0,
          left: 0,
        }}
      >
        <defs>
          <linearGradient id={`fill${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" className="lx-chart-stop0" />
            <stop offset="1" className="lx-chart-stop1" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} className="lx-chart-grid" />
        <XAxis
          dataKey="x"
          type="number"
          domain={[-windowS, 0]}
          ticks={xTicks}
          allowDataOverflow
          tick={(props: AxisTickProps) => (
            <TimeTick {...props} windowS={windowS} />
          )}
          tickLine={false}
          axisLine={false}
          height={tall ? 26 : 20}
          interval={0}
          className="lx-chart-axis"
        />
        <YAxis
          type="number"
          domain={domain}
          ticks={ticks}
          allowDataOverflow
          tickFormatter={yFormat}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={tall ? 48 : 42}
          tickMargin={4}
          interval={0}
          className="lx-chart-axis"
        />
        {def.threshold ? (
          <ReferenceLine
            y={def.threshold.value}
            className="lx-chart-ref"
            ifOverflow="extendDomain"
            label={{
              value: tall ? def.threshold.label : def.threshold.short,
              position: tall ? "insideTopLeft" : "insideTopRight",
              className: "lx-chart-reflabel",
              fill: "currentColor",
            }}
          />
        ) : null}
        {def.series.map((s) =>
          def.area ? (
            <Area
              key={s.key}
              dataKey={s.key}
              name={s.name}
              type="monotone"
              className={cx("lx-glide lx-chart-series", `is-${s.tone}`)}
              fill={`url(#fill${id})`}
              isAnimationActive={false}
              dot={false}
              activeDot={{
                r: 4,
                className: cx("lx-chart-active", `is-${s.tone}`),
              }}
            />
          ) : (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              type="monotone"
              className={cx(
                "lx-glide lx-chart-series",
                `is-${s.tone}`,
                s.dash && "is-dash",
              )}
              isAnimationActive={false}
              dot={false}
              activeDot={{
                r: 4,
                className: cx("lx-chart-active", `is-${s.tone}`),
              }}
            />
          ),
        )}
        {latest
          ? def.series.map((s, i) => (
              <ReferenceDot
                key={`head-${s.key}`}
                x={0}
                y={latest[s.key]}
                r={3}
                ifOverflow="visible"
                className={cx("lx-chart-head", `is-${s.tone}`)}
                label={
                  labels && def.series.length > 1
                    ? {
                        value: s.name,
                        position: "right",
                        dy: nudge(i),
                        className: "lx-chart-direct",
                        fill: "currentColor",
                      }
                    : undefined
                }
              />
            ))
          : null}
        <Tooltip
          isAnimationActive={false}
          cursor={{ className: "lx-chart-cursor" }}
          content={(props) => (
            <LiveTip active={props.active} payload={props.payload} def={def} />
          )}
        />
      </ComposedChart>
    </div>
  );
}

/** The numbers behind live charts, newest first: the table equivalent. */
export function LiveTable({
  defs,
  samples,
  windowS,
  caption,
}: {
  defs: MetricDef[];
  samples: Sample[];
  windowS: number;
  caption: string;
}) {
  const last = samples.at(-1)?.t ?? 0;
  const rows = samples
    .filter((s) => s.t >= last - windowS * 1000)
    .slice()
    .reverse();
  const columns = defs.flatMap((def) =>
    def.series.map((s) => ({
      key: `${def.id}-${s.key}`,
      head:
        def.series.length > 1
          ? `${def.name} ${s.name.toLowerCase()}`
          : def.name,
      unit: def.unit,
      get: (row: Sample) => row[s.key].toFixed(def.digits),
    })),
  );
  return (
    <div className="lx-chart-tablewrap">
      <table className="lx-table lx-chart-table">
        <caption className="lx-vh">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="is-num">
                {c.head} <span className="lx-chart-table-unit">({c.unit})</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.t}>
              <th scope="row" className="lx-num">
                {clock(row.t)}
              </th>
              {columns.map((c) => (
                <td key={c.key} className="lx-num is-num">
                  {c.get(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Storage charts ─────────────────────────────────────────────────────────────────────────── */

function BarTip<T>({
  active,
  payload,
  render,
}: TipState & {
  render: (row: T) => ReactNode;
}) {
  const row = payload?.[0]?.payload as T | undefined;
  if (!active || !row) {
    return null;
  }
  return <div className="lx-chart-tip">{render(row)}</div>;
}

interface CapRow {
  name: string;
  used: number;
  free: number;
  sizeTiB: number;
  usedTiB: number;
  pct: number;
  almostFull: boolean;
}

/**
 * Where the space is: each file system's size to one scale, the used part filled. The meters
 * elsewhere say how full each one is; this says how big each is beside the others. The bar is the
 * capacity blue; a file system past its threshold keeps a blue bar and says "Almost full" in words.
 */
export function CapacityChart({
  fileSystems,
  label,
}: {
  fileSystems: FileSystem[];
  label: string;
}) {
  const rows: CapRow[] = [...fileSystems]
    .sort((a, b) => b.sizeTiB - a.sizeTiB)
    .map((f) => {
      const pct = percent(f.usedTiB, f.sizeTiB);
      return {
        name: f.label,
        used: f.usedTiB,
        free: f.sizeTiB - f.usedTiB,
        sizeTiB: f.sizeTiB,
        usedTiB: f.usedTiB,
        pct,
        almostFull: pct >= 85,
      };
    });
  const top = Math.ceil(Math.max(...rows.map((r) => r.sizeTiB)));
  const ticks = [0, top / 2, top];
  return (
    <div className="lx-chart lx-chart--bars">
      <BarChart
        responsive
        className="lx-chart-surface"
        data={rows}
        layout="vertical"
        title={label}
        barCategoryGap={rows.length > 4 ? 9 : 12}
        margin={{ top: 4, right: 92, bottom: 0, left: 0 }}
      >
        <CartesianGrid horizontal={false} className="lx-chart-grid" />
        <XAxis
          type="number"
          domain={[0, top]}
          ticks={ticks}
          tickFormatter={(v: number) => `${v}${NBSP}TiB`}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          height={22}
          className="lx-chart-axis"
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={78}
          className="lx-chart-axis lx-chart-axis--names"
        />
        <Bar
          dataKey="used"
          stackId="fs"
          className="lx-chart-bar is-used"
          radius={[3, 0, 0, 3]}
          isAnimationActive={!reducedMotion()}
          animationDuration={640}
        />
        <Bar
          dataKey="free"
          stackId="fs"
          className="lx-chart-bar is-free"
          radius={[0, 3, 3, 0]}
          isAnimationActive={!reducedMotion()}
          animationDuration={640}
        >
          <LabelList
            position="right"
            className="lx-chart-barlabel"
            fill="currentColor"
            valueAccessor={(entry: { payload: CapRow }) =>
              entry.payload.almostFull
                ? `${entry.payload.pct}% · Almost full`
                : `${entry.payload.pct}%`
            }
          />
        </Bar>
        <Tooltip
          isAnimationActive={false}
          cursor={{ className: "lx-chart-band" }}
          content={(props) => (
            <BarTip<CapRow>
              active={props.active}
              payload={props.payload}
              render={(row) => (
                <>
                  <p className="lx-chart-tip-time">{row.name}</p>
                  <p className="lx-num">
                    {size(row.usedTiB)} of {size(row.sizeTiB)} used · {row.pct}%
                  </p>
                  <p className="lx-chart-tip-ago">
                    {size(row.sizeTiB - row.usedTiB)} free
                    {row.almostFull ? " · Almost full" : ""}
                  </p>
                </>
              )}
            />
          )}
        />
      </BarChart>
    </div>
  );
}

export function CapacityTable({ fileSystems }: { fileSystems: FileSystem[] }) {
  return (
    <div className="lx-chart-tablewrap">
      <table className="lx-table lx-chart-table">
        <caption className="lx-vh">Space by file system</caption>
        <thead>
          <tr>
            <th scope="col">File system</th>
            <th scope="col" className="is-num">
              Used
            </th>
            <th scope="col" className="is-num">
              Size
            </th>
            <th scope="col" className="is-num">
              Full
            </th>
          </tr>
        </thead>
        <tbody>
          {fileSystems.map((f) => (
            <tr key={f.id}>
              <th scope="row">{f.label}</th>
              <td className="lx-num is-num">{size(f.usedTiB)}</td>
              <td className="lx-num is-num">{size(f.sizeTiB)}</td>
              <td className="lx-num is-num">
                {percent(f.usedTiB, f.sizeTiB)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TempRow {
  name: string;
  temp: number | null;
  shown: number;
  role: string;
}

/** A disk's name under its bar; a disk without a reading says so where its bar would be. */
function DiskTick({
  x,
  y,
  payload,
  rows,
}: AxisTickProps & { rows: TempRow[] }) {
  const name = String(payload?.value ?? "");
  const silent = rows.find((r) => r.name === name)?.temp === null;
  return (
    <text
      x={Number(x)}
      y={Number(y)}
      textAnchor="middle"
      fill="currentColor"
      className="recharts-cartesian-axis-tick-value lx-chart-disktick"
    >
      <tspan x={Number(x)} dy="0.9em">
        {name}
      </tspan>
      {silent ? (
        <tspan x={Number(x)} dy="1.35em" className="lx-chart-disktick-note">
          no reading
        </tspan>
      ) : null}
    </text>
  );
}

/**
 * Each disk's temperature now, against the alert temperature set in Disk health. One measure across
 * disks, so one colour; a disk that reports no temperature (over USB) says so instead of a bar.
 */
export function DiskTempChart({ disks }: { disks: Disk[] }) {
  const rows: TempRow[] = disks.map((d) => ({
    name: d.device,
    temp: d.temp,
    shown: d.temp ?? 0,
    role: d.role,
  }));
  return (
    <div className="lx-chart lx-chart--bars lx-chart--temps">
      <BarChart
        responsive
        className="lx-chart-surface"
        data={rows}
        title="Disk temperatures now"
        barCategoryGap="28%"
        margin={{ top: 18, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} className="lx-chart-grid" />
        <XAxis
          dataKey="name"
          type="category"
          tick={(props: AxisTickProps) => <DiskTick {...props} rows={rows} />}
          tickLine={false}
          axisLine={false}
          height={40}
          interval={0}
          className="lx-chart-axis lx-chart-axis--names"
        />
        <YAxis
          type="number"
          domain={[0, 70]}
          ticks={[0, 35, 70]}
          tickFormatter={(v: number) => `${v}°`}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={32}
          className="lx-chart-axis"
        />
        <ReferenceLine
          y={DISK_ALERT_C}
          className="lx-chart-ref"
          label={{
            value: `Alert at ${DISK_ALERT_C}${NBSP}°C`,
            position: "insideTopRight",
            className: "lx-chart-reflabel",
            fill: "currentColor",
          }}
        />
        <Bar
          dataKey="shown"
          className="lx-chart-bar is-used"
          radius={[3, 3, 0, 0]}
          isAnimationActive={!reducedMotion()}
          animationDuration={640}
        >
          <LabelList
            position="top"
            className="lx-chart-barlabel"
            fill="currentColor"
            valueAccessor={(entry: { payload: TempRow }) =>
              entry.payload.temp === null ? "" : `${entry.payload.temp}°`
            }
          />
        </Bar>
        <Tooltip
          isAnimationActive={false}
          cursor={{ className: "lx-chart-band" }}
          content={(props) => (
            <BarTip<TempRow>
              active={props.active}
              payload={props.payload}
              render={(row) => (
                <>
                  <p className="lx-chart-tip-time">
                    <span className="lx-mono">{row.name}</span>
                    <span className="lx-chart-tip-ago">{row.role}</span>
                  </p>
                  <p className="lx-num">
                    {row.temp === null
                      ? "Reports no temperature (USB)"
                      : `${row.temp}${NBSP}°C now`}
                  </p>
                </>
              )}
            />
          )}
        />
      </BarChart>
    </div>
  );
}

export function DiskTempTable({ disks }: { disks: Disk[] }) {
  return (
    <div className="lx-chart-tablewrap">
      <table className="lx-table lx-chart-table">
        <caption className="lx-vh">Disk temperatures now</caption>
        <thead>
          <tr>
            <th scope="col">Disk</th>
            <th scope="col">Holds</th>
            <th scope="col" className="is-num">
              Temperature
            </th>
          </tr>
        </thead>
        <tbody>
          {disks.map((d) => (
            <tr key={d.id}>
              <th scope="row" className="lx-mono">
                {d.device}
              </th>
              <td>{d.role}</td>
              <td className="lx-num is-num">
                {d.temp === null ? "Not reported" : `${d.temp}${NBSP}°C`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
