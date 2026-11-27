// SPDX-License-Identifier: GPL-3.0-or-later
// The chart lab's readings: development only (UI-11). The lab boots no mock and no query client, so
// this stands in for the two replies a live strip reads every 2 seconds, shaped by their generated
// DTOs: System.getInformation (SystemFigures: `cpuUtilization`, `memUsed`, `memTotal`) and
// Network.enumerateDevicesList (DeviceCounters: enp2s0's `stats.rx_bytes` and `stats.tx_bytes`).
// They go through the app's own sample functions (src/live/liveSamples.ts), so a network rate exists
// only from the second reading on, as in the app.
//
// The values agree with the mock's fixtures: 4104114176 bytes of memory with about 355 MB in use,
// a processor near idle, enp2s0 at 1 Gbit/s with its counters starting where the example's are. Now
// and then a computer copies files to the NAS: the traffic in rises, the processor with it.
//
// The page starts with no reading and is never filled in backwards. `still=1` is the one exception,
// for screenshots: a fixed set of 40 readings from 10:31:04, said as such on the page.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type {
  CounterReading,
  DeviceCounters,
  SystemFigures,
  SystemSample,
  TrafficSample,
} from "../../live/liveSamples.ts";
import {
  counterReading,
  systemSample,
  trafficSample,
} from "../../live/liveSamples.ts";
import type { Point } from "./model.ts";
import { EVERY_MS, toMiB, trimmed } from "./model.ts";

const MEM_TOTAL = 4104114176;
const MEM_BASE = 354963456;
const MiB = 1024 ** 2;

export interface RawReading {
  t: number;
  /** System.getInformation. */
  info: SystemFigures;
  /** Network.enumerateDevicesList `data`. */
  devices: DeviceCounters[];
}

/** A seeded generator, so a seed always gives the same readings. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Feed {
  next: (t: number) => RawReading;
}

/** What the network is doing in a reading: idle, a computer copying to the NAS, or reading from it. */
export type Activity = "idle" | "copy-in" | "read-out";

/**
 * The readings in turn. `plan` says what each reading falls in; without it, now and then a computer
 * copies files to the NAS or plays a film from it, for 16 to 30 seconds.
 */
export function createFeed(
  seed: number,
  plan?: (index: number) => Activity,
): Feed {
  const rand = prng(seed);
  let index = 0;
  let cpu = 2;
  let mem = MEM_BASE;
  let rx = 106928701n;
  let tx = 158236022n;
  let left = 0;
  let doing: Activity = "idle";
  let last: number | null = null;
  return {
    next(t) {
      if (plan) {
        doing = plan(index);
      } else {
        if (left === 0) {
          doing = "idle";
          if (rand() > 0.9) {
            doing = rand() > 0.4 ? "copy-in" : "read-out";
            left = 8 + Math.floor(rand() * 8);
          }
        }
        left = Math.max(0, left - 1);
      }
      index += 1;
      const busy = doing !== "idle";
      const target =
        doing === "copy-in"
          ? 22 + rand() * 18
          : doing === "read-out"
            ? 9 + rand() * 8
            : 1 + rand() * 4;
      cpu = Math.max(0, Math.min(100, cpu * 0.35 + target * 0.65));
      const memTarget = busy ? MEM_BASE + 64 * MiB : MEM_BASE;
      mem = Math.round(mem * 0.8 + memTarget * 0.2 + (rand() - 0.5) * 2 * MiB);
      const seconds = last === null ? EVERY_MS / 1000 : (t - last) / 1000;
      last = t;
      const inRate =
        doing === "copy-in"
          ? (62 + rand() * 30) * MiB
          : doing === "read-out"
            ? (0.3 + rand() * 0.4) * MiB
            : rand() * 0.4 * MiB;
      const outRate =
        doing === "copy-in"
          ? (0.8 + rand() * 0.9) * MiB
          : doing === "read-out"
            ? (14 + rand() * 12) * MiB
            : rand() * 0.12 * MiB;
      rx += BigInt(Math.round(inRate * seconds));
      tx += BigInt(Math.round(outRate * seconds));
      return {
        t,
        info: {
          cpuUtilization: cpu,
          memUsed: String(mem),
          memTotal: String(MEM_TOTAL),
          loadAverage: { "1min": cpu / 40, "5min": 0.04, "15min": 0 },
        },
        devices: [
          {
            devicename: "enp2s0",
            type: "ethernet",
            stats: { rx_bytes: rx.toString(), tx_bytes: tx.toString() },
          },
          {
            devicename: "lo",
            type: "loopback",
            stats: { rx_bytes: "0", tx_bytes: "0" },
          },
        ],
      };
    },
  };
}

export interface Readings {
  system: SystemSample[];
  traffic: TrafficSample[];
  counters: CounterReading | null;
  /** Older readings were let go: the charts show the last two minutes, not since the page opened. */
  dropped: boolean;
}

export const NO_READINGS: Readings = {
  system: [],
  traffic: [],
  counters: null,
  dropped: false,
};

/** The readings with one more reply recorded, kept to the last two minutes. */
export function record(state: Readings, raw: RawReading): Readings {
  const lastT = state.system.at(-1)?.t;
  if (lastT !== undefined && raw.t <= lastT) {
    return state;
  }
  const system = trimmed([...state.system, systemSample(raw.info, raw.t)]);
  const reading = counterReading(raw.devices, raw.t);
  const sample = trafficSample(state.counters, reading);
  const traffic = trimmed(
    sample === null ? state.traffic : [...state.traffic, sample],
  );
  return {
    system: system.kept,
    traffic: traffic.kept,
    counters: reading,
    dropped: state.dropped || system.dropped,
  };
}

/** When the still set starts: 10:31:04 on this computer's clock, whatever its time zone. */
export const STILL_START = new Date(2026, 10, 19, 10, 31, 4).getTime();
export const STILL_COUNT = 40;
const STILL_SEED = 7;

/**
 * The still set: a computer copies files to the NAS in readings 6 to 17 and again from reading 26
 * on, so the traffic in is high while the traffic out stays near 1 MiB/s: the case where one shared
 * scale lost the traffic out. The shape is the same on every screenshot.
 */
export function stillFeed(): Feed {
  return createFeed(STILL_SEED, (i) =>
    (i >= 6 && i < 18) || i >= 26 ? "copy-in" : "idle",
  );
}

/** The 40 readings of `still=1`, every 2 seconds from STILL_START, and the feed to go on with. */
export function stillReadings(): { readings: Readings; feed: Feed } {
  const feed = stillFeed();
  let readings = NO_READINGS;
  for (let i = 0; i < STILL_COUNT; i += 1) {
    readings = record(readings, feed.next(STILL_START + i * EVERY_MS));
  }
  return { readings, feed };
}

interface Action {
  type: "reading";
  raw: RawReading;
}

function reducer(state: Readings, action: Action): Readings {
  return record(state, action.raw);
}

/**
 * The page's readings: one when the page opens and every 2 seconds after, unless paused; still
 * starts paused on the fixed set. "Take a reading" adds one now (in still, 2 seconds after the last,
 * so a screenshot after it is the same every time).
 */
export function useReadings(still: boolean, paused: boolean) {
  const [start] = useState(() =>
    still
      ? stillReadings()
      : { readings: NO_READINGS, feed: createFeed(Date.now() % 100000) },
  );
  const feed = start.feed;
  const [readings, dispatch] = useReducer(reducer, start.readings);
  // The newest reading's time, for "Take a reading" and the interval, which run outside render.
  const lastRef = useRef<number | null>(
    start.readings.system.at(-1)?.t ?? null,
  );
  const newest = readings.system.at(-1)?.t ?? null;
  useEffect(() => {
    lastRef.current = newest;
  }, [newest]);

  const take = useCallback(() => {
    const last = lastRef.current;
    const t = still ? (last ?? STILL_START) + EVERY_MS : Date.now();
    if (last !== null && t <= last) {
      return;
    }
    lastRef.current = t;
    dispatch({ type: "reading", raw: feed.next(t) });
  }, [feed, still]);

  useEffect(() => {
    if (still || paused) {
      return;
    }
    // The first reading as the page opens (or as it plays again), unless one has just been taken.
    const last = lastRef.current;
    if (last === null || Date.now() - last >= EVERY_MS) {
      take();
    }
    const timer = window.setInterval(take, EVERY_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [still, paused, take]);

  return { readings, take };
}

/** The interface the network figures are for: the first one the list gives that is not loopback. */
export const IFACE = "enp2s0";

export interface Series {
  /** System.getInformation `cpuUtilization`, percent. */
  cpu: Point[];
  /** `memUsed` of `memTotal`, percent, as the dashboard's meter computes it. */
  memory: Point[];
  /** The newest `memUsed` and `memTotal`, bytes. */
  memUsed: number | null;
  memTotal: number | null;
  /** Network.enumerateDevicesList: enp2s0's traffic in and out, MiB/s, from the second reading on. */
  rx: Point[];
  tx: Point[];
  /** The newest reading, which every chart's right edge stands for. */
  last: number | null;
  dropped: boolean;
}

export function seriesOf(readings: Readings): Series {
  const newest = readings.system.at(-1);
  const rate = (s: TrafficSample, k: "rx" | "tx"): Point => {
    const v = s.interfaces.get(IFACE)?.[k];
    return { t: s.t, v: v === null || v === undefined ? null : toMiB(v) };
  };
  return {
    cpu: readings.system.map((s) => ({ t: s.t, v: s.cpu })),
    memory: readings.system.map((s) => ({ t: s.t, v: s.memory })),
    memUsed: newest?.memUsed ?? null,
    memTotal: newest?.memTotal ?? null,
    rx: readings.traffic.map((s) => rate(s, "rx")),
    tx: readings.traffic.map((s) => rate(s, "tx")),
    last: newest?.t ?? null,
    dropped: readings.dropped,
  };
}
