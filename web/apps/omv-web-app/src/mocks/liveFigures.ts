// SPDX-License-Identifier: GPL-3.0-or-later
// The mock's live figures (`pnpm dev:mock` and the tests only, UI-11): the processor and memory of
// each System.getInformation reply and the byte counters of each Network.enumerateDevicesList reply
// move from reply to reply, so the dashboard's live charts draw a plausible line rather than a flat
// one at the bottom. The app's live code is not touched: it records only what each reply says.
//
// Every figure is a function of the time of the reply alone, so it is the same for the same moment
// and never random: slow waves, with a peak in some windows of time chosen by a fixed hash of the
// window's number. A counter is the integral of its rate, in closed form from a fixed start, so it
// only ever grows and the app's rate between two readings is the rate drawn here. Received and sent
// move at different rates, and received has a burst of a few MiB/s now and then.
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";

const MIB = 1024 ** 2;
const TAU = 2 * Math.PI;

/** A number in [0, 1) from a whole number and a salt: the same inputs, the same number. */
export function hash01(n: number, salt: number): number {
  const x = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A peak that may come once in each window of time: where, how long and how high, or none. */
interface Peaks {
  /** Seconds per window. */
  window: number;
  /** How often a window has one, 0 to 1. */
  chance: number;
  /** Seconds the peak lasts. */
  length: number;
  /** Its height at the top, between these. */
  low: number;
  high: number;
  salt: number;
}

function peakIn(k: number, p: Peaks): { start: number; height: number } | null {
  if (hash01(k, p.salt) >= p.chance) {
    return null;
  }
  const start = k * p.window + hash01(k, p.salt + 1) * (p.window - p.length);
  const height = p.low + hash01(k, p.salt + 2) * (p.high - p.low);
  return { start, height };
}

/** A raised-cosine bump: 0 at its ends, `height` in the middle, smooth both ways. */
const bump = (s: number, length: number, height: number) =>
  s <= 0 || s >= length ? 0 : (height * (1 - Math.cos((TAU * s) / length))) / 2;

/** The bump's integral from its start to `s` seconds in. */
const bumpArea = (s: number, length: number, height: number) => {
  const x = Math.min(Math.max(s, 0), length);
  return (height / 2) * (x - (length / TAU) * Math.sin((TAU * x) / length));
};

/** The peaks' level at `t` seconds. */
function peaksAt(t: number, p: Peaks): number {
  const k = Math.floor(t / p.window);
  const peak = peakIn(k, p);
  return peak === null ? 0 : bump(t - peak.start, p.length, peak.height);
}

/** The peaks' integral from `from` to `t` seconds. */
function peaksArea(from: number, t: number, p: Peaks): number {
  let sum = 0;
  for (
    let k = Math.floor(from / p.window);
    k <= Math.floor(t / p.window);
    k += 1
  ) {
    const peak = peakIn(k, p);
    if (peak !== null) {
      sum +=
        bumpArea(t - peak.start, p.length, peak.height) -
        bumpArea(from - peak.start, p.length, peak.height);
    }
  }
  return sum;
}

/** A wave `0.5 + 0.5 sin`, between 0 and 1, of `period` seconds. */
const wave = (t: number, period: number, phase: number) =>
  0.5 + 0.5 * Math.sin((TAU * t) / period + phase);

/** The integral of `wave` from 0 to `t`. */
const waveArea = (t: number, period: number, phase: number) =>
  0.5 * t -
  ((0.5 * period) / TAU) *
    (Math.cos((TAU * t) / period + phase) - Math.cos(phase));

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const CPU_PEAKS: Peaks = {
  window: 40,
  chance: 0.4,
  length: 16,
  low: 25,
  high: 70,
  salt: 3,
};

/** Processor use in percent at `ms`: mostly low, with a peak in some windows of 40 seconds. */
export function processorAt(ms: number): number {
  const t = ms / 1000;
  const v =
    4 + 9 * wave(t, 97, 0) + 5 * wave(t, 23, 1.3) + peaksAt(t, CPU_PEAKS);
  return Math.round(clamp(v, 1, 98) * 100) / 100;
}

const MEMORY_PEAKS: Peaks = {
  window: 60,
  chance: 0.3,
  length: 20,
  low: 5,
  high: 14,
  salt: 7,
};

/** Memory in use as a share of the total at `ms`: a slow drift, and more while programs run. */
export function memoryShareAt(ms: number): number {
  const t = ms / 1000;
  const percent =
    18 +
    8 * wave(t, 300, 0.4) +
    3 * wave(t, 41, 2.1) +
    peaksAt(t, MEMORY_PEAKS);
  return clamp(percent, 5, 80) / 100;
}

/** One direction's rate: a floor, two waves and its peaks, in MiB/s. */
interface Flow {
  floor: number;
  slow: { amount: number; period: number; phase: number };
  fast: { amount: number; period: number; phase: number };
  peaks: Peaks;
}

const RECEIVED: Flow = {
  floor: 0.08,
  slow: { amount: 0.5, period: 71, phase: 0 },
  fast: { amount: 0.2, period: 13, phase: 0.7 },
  peaks: { window: 45, chance: 0.45, length: 10, low: 2, high: 6, salt: 11 },
};

const SENT: Flow = {
  floor: 0.03,
  slow: { amount: 0.18, period: 53, phase: 2 },
  fast: { amount: 0.08, period: 17, phase: 0.2 },
  peaks: { window: 70, chance: 0.35, length: 8, low: 0.8, high: 2.5, salt: 19 },
};

/** A flow shifted for one interface, so a second one does not move in step with the first. */
function flowFor(flow: Flow, iface: string): Flow {
  let h = 0;
  for (const c of iface) {
    h = (h * 31 + c.charCodeAt(0)) % 1000;
  }
  return {
    ...flow,
    slow: { ...flow.slow, phase: flow.slow.phase + h },
    fast: { ...flow.fast, phase: flow.fast.phase + h },
    peaks: { ...flow.peaks, salt: flow.peaks.salt + h },
  };
}

/** A flow's rate at `t` seconds, MiB/s. */
export function flowRate(flow: Flow, t: number): number {
  return (
    flow.floor +
    flow.slow.amount * wave(t, flow.slow.period, flow.slow.phase) +
    flow.fast.amount * wave(t, flow.fast.period, flow.fast.phase) +
    peaksAt(t, flow.peaks)
  );
}

/** A flow's bytes from `from` to `t` seconds. */
function flowBytes(flow: Flow, from: number, t: number): number {
  const area = (f: Flow["slow"]) =>
    f.amount *
    (waveArea(t, f.period, f.phase) - waveArea(from, f.period, f.phase));
  return (
    (flow.floor * (t - from) +
      area(flow.slow) +
      area(flow.fast) +
      peaksArea(from, t, flow.peaks)) *
    MIB
  );
}

/** Where every counter starts counting: when this module was loaded, so a session sums little. */
const START_S = Math.floor(Date.now() / 1000 / 600) * 600;

/** The received and sent rates of an interface at `ms`, MiB/s (for the tests). */
export function interfaceRates(
  iface: string,
  ms: number,
): { rx: number; tx: number } {
  const t = ms / 1000;
  return {
    rx: flowRate(flowFor(RECEIVED, iface), t),
    tx: flowRate(flowFor(SENT, iface), t),
  };
}

/** An interface's counters at `ms`: its captured counters plus what has flowed since the start. */
export function countersAt(
  iface: string,
  base: { rx: bigint; tx: bigint },
  ms: number,
  start = START_S,
): { rx: bigint; tx: bigint } {
  const t = Math.max(ms / 1000, start);
  return {
    rx:
      base.rx +
      BigInt(Math.floor(flowBytes(flowFor(RECEIVED, iface), start, t))),
    tx: base.tx + BigInt(Math.floor(flowBytes(flowFor(SENT, iface), start, t))),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const counter = (v: unknown): bigint =>
  typeof v === "string" && /^\d{1,20}$/u.test(v) ? BigInt(v) : 0n;

/**
 * A System.getInformation answer with the processor and memory of `ms`. Only a reply that carries
 * them (an administrator's) is changed; the total memory stays as captured.
 */
export function withLiveSystem(answer: FixedAnswer, ms: number): FixedAnswer {
  if (answer.status !== 200 || !isRecord(answer.value)) {
    return answer;
  }
  const value = answer.value;
  if (
    typeof value.cpuUtilization !== "number" ||
    typeof value.memTotal !== "string"
  ) {
    return answer;
  }
  const total = Number(value.memTotal);
  return {
    ...answer,
    value: {
      ...value,
      cpuUtilization: processorAt(ms),
      memUsed: String(Math.round(total * memoryShareAt(ms))),
    },
  };
}

/**
 * A Network.enumerateDevicesList answer whose connected interfaces (not the loopback) have the byte
 * counters of `ms`. An interface whose counters the server could not read ([]) stays as it is.
 */
export function withLiveCounters(answer: FixedAnswer, ms: number): FixedAnswer {
  if (answer.status !== 200 || !isRecord(answer.value)) {
    return answer;
  }
  const rows = answer.value.data;
  if (!Array.isArray(rows)) {
    return answer;
  }
  return {
    ...answer,
    value: {
      ...answer.value,
      data: rows.map((row: unknown) => {
        if (
          !isRecord(row) ||
          !isRecord(row.stats) ||
          row.link !== true ||
          row.devicename === "lo" ||
          row.type === "loopback" ||
          typeof row.devicename !== "string"
        ) {
          return row;
        }
        const now = countersAt(
          row.devicename,
          { rx: counter(row.stats.rx_bytes), tx: counter(row.stats.tx_bytes) },
          ms,
        );
        return {
          ...row,
          stats: {
            ...row.stats,
            rx_bytes: String(now.rx),
            tx_bytes: String(now.tx),
          },
        };
      }),
    },
  };
}
