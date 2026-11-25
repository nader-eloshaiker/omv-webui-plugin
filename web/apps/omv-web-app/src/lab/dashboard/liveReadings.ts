// SPDX-License-Identifier: GPL-3.0-or-later
// The live strip's readings of the session's samples: the first interface's rates in MiB/s, and the
// Network lane's words for them. Development only (UI-11).
import type { TrafficSample } from "../../live/liveSamples.ts";
import { useLiveSamples } from "../../live/useLive.ts";

const MiB = 1024 ** 2;
const NBSP = "\u00a0";
const IFACE = "enp2s0";

export const rx = (s: TrafficSample): number | null => {
  const v = s.interfaces.get(IFACE)?.rx;
  return v === null || v === undefined ? null : v / MiB;
};

export const tx = (s: TrafficSample): number | null => {
  const v = s.interfaces.get(IFACE)?.tx;
  return v === null || v === undefined ? null : v / MiB;
};

/** "1.4" for a rate in MiB/s, two decimals under one. */
export function rate(v: number): string {
  return v < 1 ? v.toFixed(2) : v.toFixed(1);
}

/** "↓ 4.2 ↑ 0.6 MiB/s", for the Network lane; null before the second reading. */
export function useRateWords(): string | null {
  const { traffic } = useLiveSamples();
  const last = traffic.at(-1);
  const r = last ? rx(last) : null;
  const t = last ? tx(last) : null;
  if (r === null || t === null) {
    return null;
  }
  return `↓${NBSP}${rate(r)} ↑${NBSP}${rate(t)} MiB/s`;
}
