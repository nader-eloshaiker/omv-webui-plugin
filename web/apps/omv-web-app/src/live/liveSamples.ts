// SPDX-License-Identifier: GPL-3.0-or-later
// The live samples the charts draw from (owner, 2026-11-24, "The new look", item 3). OMV keeps no
// history as numbers (A7), so a chart can only show what this tab has read. Kept for the session in
// memory only: never in browser storage (UI-13), emptied on sign-out through the app's reset path
// (app.ts), gone when the tab closes. At most the last ten minutes are kept, by time, not by count.
//
// Two series, each stamped with this computer's time of receipt, so a wrong NAS clock cannot bend
// the axis:
// - system samples, one per System.getInformation reply: processor, memory and load;
// - traffic samples, one per Network.enumerateDevicesList reply that yields a rate: bytes per second
//   for each interface, from the difference with the previous reading of its counters.
// A sample states only what it read. A figure the reply did not carry is null, never 0; a rate that
// cannot be derived (no previous reading, a counter that went down, an unreadable counter) is left
// out rather than guessed.
import type {
  NetworkDevice,
  SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import { memoryUsage } from "../dashboard/dashboard.ts";
import { parseByteCount } from "../format/format.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";

/** How far back the samples reach: the last ten minutes. */
export const LIVE_WINDOW_MS = 10 * 60_000;

export interface SystemSample {
  /** When the reply arrived, on this computer's clock (ms). */
  t: number;
  /** Processor use, percent. */
  cpu: number | null;
  /** Memory in use, percent of the total, as the dashboard's meter computes it. */
  memory: number | null;
  /** Memory in use and in total, bytes. */
  memUsed: number | null;
  memTotal: number | null;
  /** Load average over one, five and fifteen minutes. */
  load1: number | null;
  load5: number | null;
  load15: number | null;
}

/** One interface's throughput since the previous reading, bytes per second. */
export interface InterfaceRate {
  rx: number | null;
  tx: number | null;
}

export interface TrafficSample {
  /** When the reply arrived, on this computer's clock (ms). */
  t: number;
  /** When the previous reading arrived: each rate is the average over `since` to `t`. */
  since: number;
  /** Only interfaces with at least one rate; the loopback interface is never listed. */
  interfaces: ReadonlyMap<string, InterfaceRate>;
}

/** The counters of one reading, kept to derive the next reading's rates. */
export interface CounterReading {
  t: number;
  byInterface: ReadonlyMap<string, { rx: bigint | null; tx: bigint | null }>;
}

export interface LiveState {
  system: readonly SystemSample[];
  traffic: readonly TrafficSample[];
  /** The last reading of the counters; null until the first, and after sign-out. */
  counters: CounterReading | null;
}

/** The time actually sampled, first to last receipt, so a chart can say "last 58 s". */
export interface SampledSpan {
  from: number;
  to: number;
  ms: number;
}

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** What a system sample reads of a System.getInformation reply. */
export type SystemFigures = Pick<
  SystemInformation,
  "cpuUtilization" | "memUsed" | "memTotal" | "loadAverage"
>;
/** What a counter reading reads of each Network.enumerateDevicesList row. */
export type DeviceCounters = Pick<
  NetworkDevice,
  "devicename" | "type" | "stats"
>;

/** A system sample from one System.getInformation reply, received at `receivedAtMs`. */
export function systemSample(
  info: SystemFigures,
  receivedAtMs: number,
): SystemSample {
  const load = info.loadAverage;
  return {
    t: receivedAtMs,
    cpu: finite(info.cpuUtilization),
    memory: memoryUsage(info)?.percent ?? null,
    memUsed: parseByteCount(info.memUsed),
    memTotal: parseByteCount(info.memTotal),
    load1: finite(load?.["1min"]),
    load5: finite(load?.["5min"]),
    load15: finite(load?.["15min"]),
  };
}

/**
 * The series with one more sample, in time order: a sample no newer than the last is ignored (the
 * same reply seen twice), and only the last ten minutes, counted back from the newest, are kept.
 */
export function addTimed<S extends { t: number }>(
  samples: readonly S[],
  sample: S,
): readonly S[] {
  const last = samples.at(-1);
  if (last !== undefined && sample.t <= last.t) {
    return samples;
  }
  const from = sample.t - LIVE_WINDOW_MS;
  return [...samples.filter((s) => s.t >= from), sample];
}

/** First to last receipt time; null when nothing has been sampled. */
export function sampledSpan(
  samples: readonly { t: number }[],
): SampledSpan | null {
  const first = samples[0];
  const last = samples.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }
  return { from: first.t, to: last.t, ms: last.t - first.t };
}

// A kernel counter is an unsigned 64-bit whole number sent as decimal text; anything else is
// unreadable. BigInt, because it passes 2^53 over a long uptime.
const COUNTER = /^\d{1,20}$/;
const counter = (value: unknown): bigint | null =>
  typeof value === "string" && COUNTER.test(value) ? BigInt(value) : null;

const isLoopback = (device: Pick<NetworkDevice, "devicename" | "type">) =>
  device.type === "loopback" || device.devicename === "lo";

/** The counters of one Network.enumerateDevicesList reply, received at `receivedAtMs`. */
export function counterReading(
  devices: readonly DeviceCounters[],
  receivedAtMs: number,
): CounterReading {
  const byInterface = new Map<
    string,
    { rx: bigint | null; tx: bigint | null }
  >();
  for (const device of devices) {
    if (isLoopback(device)) {
      continue;
    }
    // The server sends [] for an interface whose counters it cannot read; the transport makes it {}.
    const rx = counter(device.stats.rx_bytes);
    const tx = counter(device.stats.tx_bytes);
    if (rx !== null || tx !== null) {
      byInterface.set(device.devicename, { rx, tx });
    }
  }
  return { t: receivedAtMs, byInterface };
}

/** Bytes per second between two readings of one counter; null when it went down (reset, wrap). */
function rateOf(
  previous: bigint | null | undefined,
  current: bigint | null,
  seconds: number,
): number | null {
  if (previous === null || previous === undefined || current === null) {
    return null;
  }
  const delta = current - previous;
  return delta < 0n ? null : Number(delta) / seconds;
}

/**
 * The rates between the previous reading and this one, or null when there are none: no previous
 * reading, one no older than this, one older than the window (its average would not be live), or no
 * interface with a counter in both. A counter that went down was reset (a restart, an interface made
 * again, a wrap), so that interface has no rate this time; the new reading is the next baseline.
 */
export function trafficSample(
  previous: CounterReading | null,
  current: CounterReading,
): TrafficSample | null {
  if (previous === null) {
    return null;
  }
  const elapsed = current.t - previous.t;
  if (elapsed <= 0 || elapsed > LIVE_WINDOW_MS) {
    return null;
  }
  const seconds = elapsed / 1000;
  const interfaces = new Map<string, InterfaceRate>();
  for (const [name, now] of current.byInterface) {
    const before = previous.byInterface.get(name);
    const rx = rateOf(before?.rx, now.rx, seconds);
    const tx = rateOf(before?.tx, now.tx, seconds);
    if (rx !== null || tx !== null) {
      interfaces.set(name, { rx, tx });
    }
  }
  return interfaces.size === 0
    ? null
    : { t: current.t, since: previous.t, interfaces };
}

/** The live state with one more counter reading: the baseline moves on, a rate is added when one exists. */
export function addCounters(
  state: LiveState,
  reading: CounterReading,
): LiveState {
  if (state.counters !== null && reading.t <= state.counters.t) {
    return state;
  }
  const sample = trafficSample(state.counters, reading);
  return {
    ...state,
    counters: reading,
    traffic: sample === null ? state.traffic : addTimed(state.traffic, sample),
  };
}

export const EMPTY_LIVE: LiveState = {
  system: [],
  traffic: [],
  counters: null,
};

/** The session's live samples. Emptied with the other view state when the session ends (app.ts). */
export const liveSamples = createMemoryStore<LiveState>(EMPTY_LIVE);

/** Record one System.getInformation reply, received at `receivedAtMs`. */
export function recordSystem(info: SystemFigures, receivedAtMs: number): void {
  liveSamples.set((state) => ({
    system: addTimed(state.system, systemSample(info, receivedAtMs)),
  }));
}

/** Record one Network.enumerateDevicesList reply, received at `receivedAtMs`. */
export function recordCounters(
  list: { readonly data: readonly DeviceCounters[] },
  receivedAtMs: number,
): void {
  liveSamples.set((state) =>
    addCounters(state, counterReading(list.data, receivedAtMs)),
  );
}
