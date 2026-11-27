// SPDX-License-Identifier: GPL-3.0-or-later
// The live strip's readings of the session's samples: the first interface's rates in MiB/s.
// Development only (UI-11).
import type { TrafficSample } from "../../live/liveSamples.ts";

const MiB = 1024 ** 2;
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
