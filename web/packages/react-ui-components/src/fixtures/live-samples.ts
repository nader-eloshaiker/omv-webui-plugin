// SPDX-License-Identifier: GPL-3.0-or-later
// Story fixtures only (never exported from an entry): live samples in exactly the shapes the app's
// session store keeps (web/apps/omv-web-app/src/live/liveSamples.ts), so the stories prove that the
// charts take the store's samples as they are, with no adapter inventing values. A missing figure is
// null. Deterministic, so a story looks the same on every visit.

/** As `SystemSample` in the app. */
export interface DemoSystemSample {
  t: number;
  cpu: number | null;
  memory: number | null;
  memUsed: number | null;
  memTotal: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
}

/** As `TrafficSample` in the app: bytes per second per interface since the previous reading. */
export interface DemoTrafficSample {
  t: number;
  since: number;
  interfaces: ReadonlyMap<string, { rx: number | null; tx: number | null }>;
}

/** 24 November 2026, 14:00:00 UTC: the newest sample of every fixture. */
export const NOW = Date.UTC(2026, 10, 24, 14, 0, 0);
export const INTERVAL_MS = 2000;
const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

/** A smooth, repeatable wobble in 0..1 (no Math.random: a story must look the same every time). */
function wave(i: number, seed: number): number {
  const v =
    0.5 +
    0.28 * Math.sin(i * 0.37 + seed) +
    0.14 * Math.sin(i * 1.13 + seed * 2.1) +
    0.08 * Math.sin(i * 2.9 + seed * 0.7);
  return Math.min(1, Math.max(0, v));
}

/** `count` system samples, one every 2 s, the newest at NOW; `missing` indexes read nothing. */
export function systemSamples(
  count: number,
  options: { busy?: boolean; missing?: readonly number[] } = {},
): DemoSystemSample[] {
  const memTotal = 8 * GIB;
  return Array.from({ length: count }, (_, i) => {
    const t = NOW - (count - 1 - i) * INTERVAL_MS;
    if (options.missing?.includes(i)) {
      return {
        t,
        cpu: null,
        memory: null,
        memUsed: null,
        memTotal,
        load1: null,
        load5: null,
        load15: null,
      };
    }
    const cpu = (options.busy ? 55 : 6) + wave(i, 1) * (options.busy ? 40 : 22);
    const memUsed = (2.6 + wave(i, 4) * 0.5) * GIB;
    return {
      t,
      cpu: Math.round(cpu * 10) / 10,
      memory: Math.round((memUsed / memTotal) * 1000) / 10,
      memUsed,
      memTotal,
      load1: Math.round((0.2 + wave(i, 2)) * 100) / 100,
      load5: 0.48,
      load15: 0.41,
    };
  });
}

/** Traffic on eth0; samples between `pause[0]` and `pause[1]` (indexes) were never read (tab hidden). */
export function trafficSamples(
  count: number,
  options: { pause?: readonly [number, number] } = {},
): DemoTrafficSample[] {
  const out: DemoTrafficSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const [from, to] = options.pause ?? [-1, -1];
    if (i >= from && i <= to) {
      continue;
    }
    const t = NOW - (count - 1 - i) * INTERVAL_MS;
    out.push({
      t,
      since: t - INTERVAL_MS,
      interfaces: new Map([
        [
          "eth0",
          {
            rx: (4 + wave(i, 3) * 38) * MIB,
            // The counter went down once (a reset): that reading has no rate.
            tx:
              i === Math.floor(count / 3) ? null : (0.6 + wave(i, 5) * 6) * MIB,
          },
        ],
      ]),
    });
  }
  return out;
}

const NBSP = "\u00a0";

/** "now", "30 s", "1 min". */
export function formatAgo(seconds: number): string {
  const s = Math.round(Math.abs(seconds));
  if (s < 1) {
    return "now";
  }
  return s >= 60 && s % 60 === 0 ? `${s / 60}${NBSP}min` : `${s}${NBSP}s`;
}

/** "14:00:00", in UTC so a story reads the same in every time zone. */
export function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });
}

/** "58 s", "1 min 20 s". */
export function spanWords(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) {
    return `${s}${NBSP}s`;
  }
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}${NBSP}min` : `${m}${NBSP}min ${r}${NBSP}s`;
}

export const percent = (v: number) => `${Math.round(v)}%`;
export const mibPerSecond = (v: number) => `${v.toFixed(1)}${NBSP}MiB/s`;
export const toMiB = (bytes: number | null | undefined) =>
  bytes === null || bytes === undefined ? null : bytes / MIB;
