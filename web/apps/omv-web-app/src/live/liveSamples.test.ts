// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { afterEach, describe, expect, it, vi } from "vitest";
import { storageSnapshot } from "../stores/storageSnapshot.ts";
import {
  addCounters,
  addTimed,
  counterReading,
  EMPTY_LIVE,
  LIVE_WINDOW_MS,
  liveSamples,
  recordCounters,
  recordSystem,
  sampledSpan,
  systemSample,
  trafficSample,
  type CounterReading,
  type DeviceCounters,
} from "./liveSamples.ts";

afterEach(() => {
  liveSamples.reset();
});

const INFO = CONTRACT_EXAMPLES.systemGetInformation.admin.value;

describe("systemSample", () => {
  it("takes processor, memory and load from the reply, stamped with the receipt time", () => {
    const sample = systemSample(INFO, 1000);
    expect(sample.t).toBe(1000);
    expect(sample.cpu).toBe(INFO.cpuUtilization);
    expect(sample.memory).toBeCloseTo(9, 0);
    expect(sample.memUsed).toBe(Number(INFO.memUsed));
    expect(sample.memTotal).toBe(Number(INFO.memTotal));
    expect(sample.load1).toBe(INFO.loadAverage["1min"]);
    expect(sample.load5).toBe(INFO.loadAverage["5min"]);
    expect(sample.load15).toBe(INFO.loadAverage["15min"]);
  });

  // A figure the reply did not carry, or could not be read, stays missing: never 0.
  it.each([
    {
      name: "a normal user's reply (no administrator fields)",
      info: {},
    },
    {
      name: "figures that are not numbers",
      info: {
        cpuUtilization: Number.NaN,
        memUsed: "lots",
        memTotal: "",
        loadAverage: { "1min": Number.POSITIVE_INFINITY },
      },
    },
    {
      name: "a zero total memory",
      info: { memUsed: "0", memTotal: "0", loadAverage: {} },
    },
  ])("leaves out what it did not read: $name", ({ info }) => {
    const sample = systemSample(info, 5);
    expect(sample).toMatchObject({
      t: 5,
      cpu: null,
      memory: null,
      load1: null,
      load5: null,
      load15: null,
    });
    expect(sample.memTotal === null || sample.memTotal === 0).toBe(true);
  });
});

describe("addTimed: at most the last ten minutes, by time", () => {
  const at = (t: number) => ({ t });

  it.each([
    {
      name: "keeps every sample of ten minutes at 2 s (no count cap)",
      times: Array.from({ length: 301 }, (_, i) => i * 2000),
      expected: 301,
    },
    {
      name: "drops what is older than ten minutes before the newest",
      times: [0, 1000, LIVE_WINDOW_MS + 500],
      expected: 2,
    },
    {
      name: "keeps a sample exactly ten minutes old",
      times: [0, LIVE_WINDOW_MS],
      expected: 2,
    },
    {
      name: "starts again after a long pause",
      times: [0, 2000, 4000, 4000 + LIVE_WINDOW_MS + 1],
      expected: 1,
    },
    {
      name: "ignores a reply seen twice and one older than the last",
      times: [1000, 1000, 500, 2000],
      expected: 2,
    },
  ])("$name", ({ times, expected }) => {
    let samples: readonly { t: number }[] = [];
    for (const t of times) {
      samples = addTimed(samples, at(t));
    }
    expect(samples).toHaveLength(expected);
    const span = sampledSpan(samples);
    expect(span?.ms).toBeLessThanOrEqual(LIVE_WINDOW_MS);
    expect(samples.map((s) => s.t)).toEqual(
      [...samples.map((s) => s.t)].sort((a, b) => a - b),
    );
  });
});

describe("sampledSpan", () => {
  it.each([
    { name: "nothing sampled", times: [], expected: null },
    {
      name: "one sample",
      times: [7000],
      expected: { from: 7000, to: 7000, ms: 0 },
    },
    {
      name: "first to last receipt time",
      times: [1000, 3000, 59_000],
      expected: { from: 1000, to: 59_000, ms: 58_000 },
    },
  ])("$name", ({ times, expected }) => {
    expect(sampledSpan(times.map((t) => ({ t })))).toEqual(expected);
  });
});

type Row = DeviceCounters;
const row = (
  devicename: string,
  rx: string | undefined,
  tx: string | undefined,
  type = "ethernet",
): Row => ({
  devicename,
  type,
  stats: {
    ...(rx === undefined ? {} : { rx_bytes: rx }),
    ...(tx === undefined ? {} : { tx_bytes: tx }),
  },
});
const reading = (t: number, ...rows: Row[]): CounterReading =>
  counterReading(rows, t);

describe("counterReading", () => {
  it("reads each interface's byte counters as whole numbers, past 2^53", () => {
    const r = reading(
      10,
      row("enp2s0", "18446744073709551615", "9007199254740993"),
    );
    expect(r.byInterface.get("enp2s0")).toEqual({
      rx: 18446744073709551615n,
      tx: 9007199254740993n,
    });
  });

  it.each([
    {
      name: "the loopback interface by type",
      rows: [row("x", "1", "1", "loopback")],
    },
    { name: "the loopback interface by name", rows: [row("lo", "1", "1", "")] },
    {
      name: "counters the server could not read ([] becomes {})",
      rows: [row("enp2s0", undefined, undefined)],
    },
    {
      name: "counters that are not whole numbers",
      rows: [
        row("a", "-1", "1.5"),
        row("b", "", " 12"),
        row("c", "1e3", "0x10"),
      ],
    },
    {
      name: "a counter longer than 64 bits can be",
      rows: [row("d", "123456789012345678901", undefined)],
    },
  ])("leaves out $name", ({ rows }) => {
    expect(counterReading(rows, 0).byInterface.size).toBe(0);
  });

  it("keeps an interface with one readable counter, the other missing", () => {
    expect(
      reading(0, row("enp2s0", "100", "garbage")).byInterface.get("enp2s0"),
    ).toEqual({ rx: 100n, tx: null });
  });
});

describe("trafficSample: rates from consecutive readings", () => {
  it.each([
    {
      name: "bytes per second over the time between the two receipts",
      previous: reading(1000, row("enp2s0", "1000", "500")),
      current: reading(3000, row("enp2s0", "5000", "700")),
      expected: {
        t: 3000,
        since: 1000,
        interfaces: new Map([["enp2s0", { rx: 2000, tx: 100 }]]),
      },
    },
    {
      name: "a counter that did not move is a real 0",
      previous: reading(0, row("enp2s0", "42", "42")),
      current: reading(10_000, row("enp2s0", "42", "42")),
      expected: {
        t: 10_000,
        since: 0,
        interfaces: new Map([["enp2s0", { rx: 0, tx: 0 }]]),
      },
    },
    {
      name: "a reset counter (restart, interface made again, wrap) has no rate; the other one does",
      previous: reading(0, row("enp2s0", "900000", "100")),
      current: reading(2000, row("enp2s0", "12", "300")),
      expected: {
        t: 2000,
        since: 0,
        interfaces: new Map([["enp2s0", { rx: null, tx: 100 }]]),
      },
    },
    {
      name: "an interface new since the last reading has no rate yet",
      previous: reading(0, row("enp2s0", "0", "0")),
      current: reading(
        2000,
        row("enp2s0", "2000", "0"),
        row("bond0", "5", "5"),
      ),
      expected: {
        t: 2000,
        since: 0,
        interfaces: new Map([["enp2s0", { rx: 1000, tx: 0 }]]),
      },
    },
    {
      name: "counters past 2^53",
      previous: reading(0, row("enp2s0", "9007199254740993", "0")),
      current: reading(1000, row("enp2s0", "9007199254741993", "0")),
      expected: {
        t: 1000,
        since: 0,
        interfaces: new Map([["enp2s0", { rx: 1000, tx: 0 }]]),
      },
    },
  ])("$name", ({ previous, current, expected }) => {
    expect(trafficSample(previous, current)).toEqual(expected);
  });

  it.each([
    {
      name: "no previous reading",
      previous: null,
      current: reading(1000, row("enp2s0", "1", "1")),
    },
    {
      name: "a previous reading no older than this one",
      previous: reading(1000, row("enp2s0", "1", "1")),
      current: reading(1000, row("enp2s0", "2", "2")),
    },
    {
      name: "a previous reading older than the window",
      previous: reading(0, row("enp2s0", "1", "1")),
      current: reading(LIVE_WINDOW_MS + 1, row("enp2s0", "2", "2")),
    },
    {
      name: "every counter reset",
      previous: reading(0, row("enp2s0", "10", "10")),
      current: reading(1000, row("enp2s0", "1", "1")),
    },
    {
      name: "counters the server could not read this time",
      previous: reading(0, row("enp2s0", "10", "10")),
      current: reading(1000, row("enp2s0", undefined, undefined)),
    },
  ])(
    "gives no sample, rather than an invented one, for $name",
    ({ previous, current }) => {
      expect(trafficSample(previous, current)).toBeNull();
    },
  );
});

describe("addCounters", () => {
  it("adds a rate when there is one and always moves the baseline on", () => {
    let state = addCounters(EMPTY_LIVE, reading(0, row("e", "0", "0")));
    expect(state.traffic).toEqual([]);
    state = addCounters(state, reading(2000, row("e", "4000", "0")));
    expect(state.traffic).toHaveLength(1);
    // A reset of the received counter: no rate for it (the sent one did not move: a real 0), and the
    // next one is measured from here.
    state = addCounters(state, reading(4000, row("e", "10", "0")));
    expect(state.traffic).toHaveLength(2);
    expect(state.traffic.at(-1)?.interfaces.get("e")).toEqual({
      rx: null,
      tx: 0,
    });
    state = addCounters(state, reading(6000, row("e", "2010", "0")));
    expect(state.traffic.at(-1)?.interfaces.get("e")).toEqual({
      rx: 1000,
      tx: 0,
    });
    expect(state.counters?.t).toBe(6000);
  });

  it("ignores a reading no newer than the baseline", () => {
    const state = addCounters(EMPTY_LIVE, reading(2000, row("e", "5", "5")));
    expect(addCounters(state, reading(1000, row("e", "0", "0")))).toBe(state);
  });
});

describe("the session store", () => {
  const LIST =
    CONTRACT_EXAMPLES.networkEnumerateDevicesList.ethernetAndLoopback.value;

  it("records replies in memory only, never in browser storage, and empties on reset", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const before = storageSnapshot();
    recordSystem(INFO, 1000);
    recordSystem(INFO, 3000);
    recordCounters(LIST, 1000);
    recordCounters(LIST, 3000);
    const state = liveSamples.getState();
    expect(state.system.map((s) => s.t)).toEqual([1000, 3000]);
    expect(state.traffic).toHaveLength(1);
    expect([...state.traffic[0]!.interfaces.keys()]).not.toContain("lo");
    expect(setItem).not.toHaveBeenCalled();
    expect(storageSnapshot()).toEqual(before);
    liveSamples.reset();
    expect(liveSamples.getState()).toEqual(EMPTY_LIVE);
  });
});
