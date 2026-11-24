// SPDX-License-Identifier: GPL-3.0-or-later
// What the lab's charts show, apart from how they are drawn: development only (UI-11). The metric
// definitions with their scales and thresholds, the window of samples a chart covers, the figures
// over it and the sentences a screen reader hears. OMV keeps no history as numbers (A7): a span is
// always the span actually sampled on this page.
import type { NasState } from "./data.ts";
import type { Sample } from "./live.ts";
import { SAMPLE_MS } from "./live.ts";

/* ─── What is charted ─────────────────────────────────────────────────────────────────────────── */

export type Metric = "cpu" | "mem" | "net" | "temp";
export const METRICS: readonly Metric[] = ["cpu", "mem", "net", "temp"];

export type SampleKey = "cpu" | "memGiB" | "rxMiB" | "txMiB" | "cpuTemp";
export type Tone = "trace" | "s1" | "s2";

interface SeriesDef {
  key: SampleKey;
  /** The series' name in a tooltip, a table head and the direct label. */
  name: string;
  tone: Tone;
  dash?: boolean;
}

export interface MetricDef {
  id: Metric;
  name: string;
  unit: string;
  digits: number;
  series: SeriesDef[];
  /** An amount from zero gets an area under its line; a level (temperature) is a line only. */
  area: boolean;
  /** The value axis for the values in view: fixed for shares and temperature, rounded up otherwise. */
  scale: (values: number[]) => { domain: [number, number]; ticks: number[] };
  threshold?: { value: number; label: string; short: string };
}

export function niceMax(v: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  return steps.find((s) => s >= v * 1.15) ?? 1000;
}

export function metricDefs(nas: NasState): Record<Metric, MetricDef> {
  const mem = nas.memTotalGiB;
  return {
    cpu: {
      id: "cpu",
      name: "Processor",
      unit: "%",
      digits: 0,
      series: [{ key: "cpu", name: "In use", tone: "trace" }],
      area: true,
      scale: () => ({ domain: [0, 100], ticks: [0, 50, 100] }),
    },
    mem: {
      id: "mem",
      name: "Memory",
      unit: "GiB",
      digits: 1,
      series: [{ key: "memGiB", name: "In use", tone: "trace" }],
      area: true,
      scale: () => ({
        domain: [0, mem],
        ticks: [0, Math.round((mem / 2) * 10) / 10, mem],
      }),
    },
    net: {
      id: "net",
      name: "Network",
      unit: "MiB/s",
      digits: 1,
      series: [
        { key: "rxMiB", name: "In", tone: "s1" },
        { key: "txMiB", name: "Out", tone: "s2", dash: true },
      ],
      area: false,
      scale: (values) => {
        const top = niceMax(Math.max(1, ...values));
        return { domain: [0, top], ticks: [0, top / 2, top] };
      },
    },
    temp: {
      id: "temp",
      name: "Processor temperature",
      unit: "°C",
      digits: 0,
      series: [{ key: "cpuTemp", name: "Temperature", tone: "trace" }],
      area: false,
      scale: () => ({ domain: [30, 90], ticks: [30, 60, 90] }),
      threshold: {
        value: 80,
        label: "Normal below 80\u00a0°C",
        short: "80\u00a0°C",
      },
    },
  };
}

/* ─── Formatting ──────────────────────────────────────────────────────────────────────────────── */

export const NBSP = "\u00a0";

export function fmt(value: number, def: MetricDef): string {
  return `${value.toFixed(def.digits)}${NBSP}${def.unit}`;
}

export function clock(t: number): string {
  return new Date(t).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "now", "40 s", "2 min": how long ago, for an axis tick or a tooltip. */
export function ago(seconds: number, long = false): string {
  const s = Math.round(Math.abs(seconds));
  if (s < 1) {
    return "now";
  }
  const text = s >= 60 && s % 60 === 0 ? `${s / 60}${NBSP}min` : `${s}${NBSP}s`;
  return long ? `${text} ago` : text;
}

/** The span a chart actually covers, in words: honest while the page is still filling it. */
export function spanWords(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) {
    return `${s}${NBSP}s`;
  }
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}${NBSP}min` : `${m}${NBSP}min ${r}${NBSP}s`;
}

/* ─── Live data in view ──────────────────────────────────────────────────────────────────────── */

export interface Row {
  /** Seconds before the newest sample (0 is the newest). */
  x: number;
  t: number;
  cpu: number;
  memGiB: number;
  rxMiB: number;
  txMiB: number;
  cpuTemp: number;
}

/**
 * The samples a window of `windowS` seconds shows, plus the one just before it so the line meets
 * the left edge instead of starting short of it (the axis clips it).
 */
export function inView(samples: Sample[], windowS: number): Sample[] {
  const last = samples.at(-1);
  if (!last) {
    return [];
  }
  const from = last.t - windowS * 1000;
  const first = samples.findIndex((s) => s.t >= from);
  return samples.slice(Math.max(0, first - 1));
}

/** Seconds actually sampled inside a window: what the caption may claim. */
export function sampledSeconds(samples: Sample[], windowS: number): number {
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) {
    return 0;
  }
  return Math.min(windowS, (last.t - first.t) / 1000);
}

export function toRows(samples: Sample[]): Row[] {
  const last = samples.at(-1)?.t ?? 0;
  return samples.map((s) => ({
    x: (s.t - last) / 1000,
    t: s.t,
    cpu: s.cpu,
    memGiB: s.memGiB,
    rxMiB: s.rxMiB,
    txMiB: s.txMiB,
    cpuTemp: s.cpuTemp,
  }));
}

export function stats(values: number[]) {
  const now = values.at(-1) ?? 0;
  const high = values.length ? Math.max(...values) : 0;
  const low = values.length ? Math.min(...values) : 0;
  const mean = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0;
  return { now, high, low, mean };
}

/** The sentence a screen reader hears for a live chart. */
export function liveSummary(
  def: MetricDef,
  samples: Sample[],
  windowS: number,
): string {
  const seen = inView(samples, windowS).filter(
    (s) => s.t >= (samples.at(-1)?.t ?? 0) - windowS * 1000,
  );
  const parts = def.series.map((series) => {
    const v = stats(seen.map((s) => s[series.key]));
    const name = def.series.length > 1 ? `${series.name}: ` : "";
    return `${name}now ${fmt(v.now, def)}, highest ${fmt(v.high, def)}, lowest ${fmt(v.low, def)}`;
  });
  return `${def.name}, sampled every ${SAMPLE_MS / 1000}${NBSP}s over the last ${spanWords(sampledSeconds(seen, windowS))} on this page. ${parts.join("; ")}.`;
}

/** The alert temperature in Disk health's settings (an example value in the lab). */
export const DISK_ALERT_C = 55;
