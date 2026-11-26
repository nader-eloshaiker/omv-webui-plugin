// SPDX-License-Identifier: GPL-3.0-or-later
// "Right now" as an instrument panel: the paired live charts the owner chose (processor and memory on
// one percent scale; the network mirrored, in above the line and out below, each half on its own
// scale), each headed by its figures large and in mono, and drawn taller with the area under each
// line filled, the one gradient style guide 10 keeps because it shows the data. Development only
// (UI-11); built in the lab because the library's LivePair has neither the large figures nor the
// filled areas, and moves to the library only if the owner takes it.
//
// Teal solid and violet dashed as everywhere: the figure's key repeats the line's stroke, and each
// line is named at its end. A text alternative per chart says each series now and its range.
import {
  LIVE_INTERVAL_MS,
  LIVE_WINDOW_MS,
  liveSpan,
  liveSummary,
  rateScale,
  type LivePoint,
  type LiveSummary,
} from "@omv-webui/react-ui-components";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "../../format/format.ts";
import { MEM_TOTAL, type LiveReadings } from "./live.ts";
import { useVars } from "./vars.ts";

const W = 600;
const H = 160;
const PAD = 3;

type Half = "full" | "up" | "down";

const xAt = (t: number, last: number) => W - ((last - t) / LIVE_WINDOW_MS) * W;
function yAt(v: number, max: number, half: Half): number {
  const k = Math.min(1, Math.max(0, max > 0 ? v / max : 0));
  if (half === "full") {
    return H - PAD - k * (H - 2 * PAD);
  }
  const mid = H / 2;
  return half === "up" ? mid - k * (mid - PAD) : mid + k * (mid - PAD);
}
const r1 = (n: number) => String(Math.round(n * 10) / 10);

/** Runs of joined readings: a missing value or a pause of more than 2.5 intervals breaks the line. */
function runs(points: readonly LivePoint[]): { t: number; v: number }[][] {
  const out: { t: number; v: number }[][] = [];
  let run: { t: number; v: number }[] = [];
  let prev: number | null = null;
  for (const p of points) {
    if (
      p.v === null ||
      (prev !== null && p.t - prev > LIVE_INTERVAL_MS * 2.5)
    ) {
      if (run.length > 0) {
        out.push(run);
      }
      run = [];
    }
    if (p.v !== null) {
      run.push({ t: p.t, v: p.v });
    }
    prev = p.t;
  }
  if (run.length > 0) {
    out.push(run);
  }
  return out;
}

/** The line, and the area between it and its base, one subpath per run. */
function paths(
  points: readonly LivePoint[],
  last: number,
  max: number,
  half: Half,
): { line: string; area: string } {
  const base = half === "full" ? H - PAD : H / 2;
  const line: string[] = [];
  const area: string[] = [];
  for (const run of runs(points)) {
    const pts = run.map((p) => [xAt(p.t, last), yAt(p.v, max, half)] as const);
    const first = pts[0];
    const end = pts.at(-1);
    if (!first || !end) {
      continue;
    }
    const along = pts
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${r1(x)} ${r1(y)}`)
      .join("");
    line.push(along);
    area.push(
      `${along}L${r1(end[0])} ${r1(base)}L${r1(first[0])} ${r1(base)}Z`,
    );
  }
  return { line: line.join(""), area: area.join("") };
}

/** A figure over its chart: the series' name with its stroke, and its value now, large and in mono. */
function Figure({
  name,
  stroke,
  value,
  unit,
}: {
  name: string;
  stroke: "solid" | "dashed";
  value: string;
  unit: string;
}) {
  return (
    <div className="wl-figure">
      <span className="wl-figure-name">
        <svg viewBox="0 0 24 8" aria-hidden="true" data-stroke={stroke}>
          <path d="M1 4H23" />
        </svg>
        {name}
      </span>
      <span className="wl-figure-value">
        {value}
        <span className="wl-figure-unit">{unit}</span>
      </span>
    </div>
  );
}

/** A line's name at its end, at its height: geometry through the CSSOM. */
function EndName({ share, children }: { share: number; children: string }) {
  const ref = useVars<HTMLSpanElement>({ "--y": `${String(share * 100)}%` });
  return (
    <span ref={ref} className="wl-endname" aria-hidden="true">
      {children}
    </span>
  );
}

interface Series {
  name: string;
  label: string;
  points: readonly LivePoint[];
  stroke: "solid" | "dashed";
  half: Half;
  max: number;
}

function Chart({
  title,
  aside,
  series,
  scales,
  alt,
  figures,
}: {
  title: string;
  aside?: string;
  series: readonly Series[];
  scales: readonly { at: "top" | "middle" | "bottom"; text: string }[];
  alt: string;
  figures: React.ReactNode;
}) {
  const id = useId().replace(/:/gu, "");
  const last = Math.max(...series.flatMap((s) => s.points.map((p) => p.t)), 0);
  return (
    <div className="wl-chart">
      <p className="wl-chart-head">
        <span>{title}</span>
        {aside ? <span className="wl-chart-aside">{aside}</span> : null}
      </p>
      <div className="wl-figures">{figures}</div>
      <div className="wl-plot" role="img" aria-label={alt}>
        <svg
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            {series.map((s, i) => (
              <linearGradient
                key={s.name}
                id={`${id}-${String(i)}`}
                x1="0"
                x2="0"
                y1={s.half === "down" ? "1" : "0"}
                y2={s.half === "down" ? "0" : "1"}
              >
                <stop
                  offset="0"
                  className="wl-stop-strong"
                  data-stroke={s.stroke}
                />
                <stop
                  offset="1"
                  className="wl-stop-faint"
                  data-stroke={s.stroke}
                />
              </linearGradient>
            ))}
          </defs>
          {series[0]?.half === "full" ? (
            <>
              <path
                className="wl-rule"
                d={`M0 ${r1(yAt(50, 100, "full"))}H${String(W)}`}
              />
              <path
                className="wl-rule"
                d={`M0 ${r1(yAt(100, 100, "full"))}H${String(W)}`}
              />
              <path className="wl-base" d={`M0 ${r1(H - PAD)}H${String(W)}`} />
            </>
          ) : (
            <path className="wl-base" d={`M0 ${String(H / 2)}H${String(W)}`} />
          )}
          {series.map((s, i) => {
            const p = paths(s.points, last, s.max, s.half);
            return (
              <g key={s.name}>
                {s.stroke === "solid" || s.half !== "full" ? (
                  <path
                    d={p.area}
                    fill={`url(#${id}-${String(i)})`}
                    className="wl-area"
                  />
                ) : null}
                <path d={p.line} className="wl-line" data-stroke={s.stroke} />
              </g>
            );
          })}
        </svg>
        {scales.map((s) => (
          <span key={s.at} className="wl-scale" data-at={s.at}>
            {s.text}
          </span>
        ))}
        <span className="wl-ends">
          {series.map((s) => {
            const v = s.points.at(-1)?.v ?? 0;
            const y = yAt(v, s.max, s.half) / H;
            return (
              <EndName key={s.name} share={y}>
                {s.name}
              </EndName>
            );
          })}
        </span>
      </div>
    </div>
  );
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

export function RightNow({ live }: { live: LiveReadings }) {
  const { t } = useTranslation();
  const titleId = useId();
  const decimal = (v: number, digits: number) =>
    v.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  const pct = (v: number) =>
    t("dashboard.now.percent", { value: Math.round(v) });
  const rate = (v: number) =>
    t("dashboard.now.rate", { value: decimal(v, v < 1 ? 2 : 1) });
  const scale = (v: number) =>
    t("dashboard.now.rate", { value: String(Math.round(v * 100) / 100) });
  const describe =
    (format: (v: number) => string) =>
    (s: LiveSummary): string => {
      if (s.range === null) {
        return t("dashboard.now.describeNone", { name: s.name });
      }
      const now =
        s.range.now === null
          ? t("dashboard.now.describeNoValue")
          : t("dashboard.now.describeNow", { value: format(s.range.now) });
      if (s.span.kind === "since") {
        return t("dashboard.now.describeSince", {
          name: s.name,
          now,
          min: format(s.range.min),
          max: format(s.range.max),
          time: clock(s.span.from),
        });
      }
      return t("dashboard.now.describeOne", { name: s.name, now });
    };
  const span = liveSpan(live.processor, false);
  const spanWords =
    span.kind === "since"
      ? t("dashboard.now.spanSince", { time: clock(span.from) })
      : span.kind === "one"
        ? t("dashboard.now.spanOne", { time: clock(span.at) })
        : t("dashboard.now.spanNone");

  const now = (points: readonly LivePoint[]) => points.at(-1)?.v ?? null;
  const split = (text: string) => {
    const at =
      text.lastIndexOf(" ") >= 0
        ? text.lastIndexOf(" ")
        : text.lastIndexOf(" ");
    return { value: text.slice(0, at), unit: text.slice(at + 1) };
  };
  const figure = (
    name: string,
    stroke: "solid" | "dashed",
    v: number | null,
    format: (n: number) => string,
  ) => {
    const words =
      v === null
        ? { value: t("dashboard.now.noReading"), unit: "" }
        : split(format(v));
    return (
      <Figure
        name={name}
        stroke={stroke}
        value={words.value}
        unit={words.unit}
      />
    );
  };

  const inMax = rateScale(live.received);
  const outMax = rateScale(live.sent);
  const percentSeries: Series[] = [
    {
      name: t("dashboard.now.processor"),
      label: t("dashboard.now.processor"),
      points: live.processor,
      stroke: "solid",
      half: "full",
      max: 100,
    },
    {
      name: t("dashboard.now.memory"),
      label: t("dashboard.now.memory"),
      points: live.memory,
      stroke: "dashed",
      half: "full",
      max: 100,
    },
  ];
  const mirrorSeries: Series[] = [
    {
      name: t("dashboard.now.in"),
      label: t("dashboard.now.inLabel"),
      points: live.received,
      stroke: "solid",
      half: "up",
      max: inMax,
    },
    {
      name: t("dashboard.now.out"),
      label: t("dashboard.now.outLabel"),
      points: live.sent,
      stroke: "dashed",
      half: "down",
      max: outMax,
    },
  ];
  const altOf = (series: readonly Series[], format: (v: number) => string) =>
    series
      .map((s) => describe(format)(liveSummary(s.label, s.points, false)))
      .join(" ");

  return (
    <section className="wl-panel wl-now" aria-labelledby={titleId}>
      <div className="wl-panel-head">
        <h2 id={titleId} className="wl-panel-title">
          {t("dashboard.now.title")}
        </h2>
        <p className="wl-panel-note">
          {t("dashboard.now.caption", { span: spanWords })}
        </p>
      </div>
      <div className="wl-now-charts">
        <Chart
          title={t("dashboard.now.percentTitle")}
          aside={
            live.memUsed === null
              ? undefined
              : t("dashboard.now.memoryAside", {
                  used: formatBytes(live.memUsed),
                  total: formatBytes(MEM_TOTAL),
                })
          }
          series={percentSeries}
          scales={[
            { at: "top", text: pct(100) },
            { at: "middle", text: pct(50) },
          ]}
          alt={altOf(percentSeries, pct)}
          figures={
            <>
              {figure(
                t("dashboard.now.processor"),
                "solid",
                now(live.processor),
                pct,
              )}
              {figure(
                t("dashboard.now.memory"),
                "dashed",
                now(live.memory),
                pct,
              )}
            </>
          }
        />
        <Chart
          title={t("dashboard.now.mirrorTitle")}
          aside="enp2s0"
          series={mirrorSeries}
          scales={[
            { at: "top", text: scale(inMax) },
            { at: "bottom", text: scale(outMax) },
          ]}
          alt={`${altOf(mirrorSeries, rate)} ${t("dashboard.now.scales", {
            in: scale(inMax),
            out: scale(outMax),
          })}`}
          figures={
            <>
              {figure(t("dashboard.now.in"), "solid", now(live.received), rate)}
              {figure(t("dashboard.now.out"), "dashed", now(live.sent), rate)}
            </>
          }
        />
      </div>
    </section>
  );
}
