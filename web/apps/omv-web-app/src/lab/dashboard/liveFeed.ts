// SPDX-License-Identifier: GPL-3.0-or-later
// The live strip's samples, through the app's own pipeline: development only (UI-11). The lab boots
// no mock and no query client, so nothing polls; this stands in for the two replies the shell's
// combined read records (System.getInformation and the interface counters), shaped by their
// generated DTOs (SystemFigures, DeviceCounters) and handed to the same recorders app.ts uses.
// The strip then reads them with the app's own useLiveSamples (src/live). A minute is prefilled, so a
// screenshot shows a page open a while.
import { useEffect } from "react";
import type { DeviceCounters, SystemFigures } from "../../live/liveSamples.ts";
import { recordCounters, recordSystem } from "../../live/liveSamples.ts";

export const FEED_MS = 2000;
const PREFILL = 30;
const MEM_TOTAL = 3.8 * 1024 ** 3;

let seed = 11;
function rand(): number {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

let cpu = 4;
let memUsed = 0.34 * 1024 ** 3;
let rx = 0n;
let tx = 0n;
let primed = false;

function step(at: number) {
  const burst = rand() > 0.85;
  cpu = Math.min(92, Math.max(1, cpu * 0.55 + (burst ? 30 : 4) * rand() + 1));
  memUsed = Math.min(
    MEM_TOTAL * 0.6,
    Math.max(0.3 * 1024 ** 3, memUsed + (rand() - 0.5) * 24 * 1024 ** 2),
  );
  const inRate = (burst ? 40 : 3) * rand() * 1024 ** 2;
  const outRate = rand() * 0.8 * 1024 ** 2;
  rx += BigInt(Math.round((inRate * FEED_MS) / 1000));
  tx += BigInt(Math.round((outRate * FEED_MS) / 1000));
  const info: SystemFigures = {
    cpuUtilization: cpu,
    memUsed: String(Math.round(memUsed)),
    memTotal: String(Math.round(MEM_TOTAL)),
    loadAverage: { "1min": cpu / 40, "5min": 0.2, "15min": 0.15 },
  };
  recordSystem(info, at);
  const device: DeviceCounters = {
    devicename: "enp2s0",
    type: "ethernet",
    stats: { rx_bytes: rx.toString(), tx_bytes: tx.toString() },
  };
  recordCounters({ data: [device] }, at);
}

/** Starts the feed while a strip is mounted; `still` records the prefill only (screenshots). */
export function useLiveFeed(still: boolean): void {
  useEffect(() => {
    if (!primed) {
      primed = true;
      const now = Date.now();
      for (let i = PREFILL; i >= 0; i -= 1) {
        step(now - i * FEED_MS);
      }
    }
    if (still) {
      return;
    }
    const timer = window.setInterval(() => {
      step(Date.now());
    }, FEED_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [still]);
}
