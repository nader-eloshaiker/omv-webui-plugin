// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { NetworkDevice } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import type { SystemSample, TrafficSample } from "../live/liveSamples.ts";
import {
  highestRate,
  interfaceRates,
  liveInterface,
  rateUnit,
  readingRows,
} from "./liveModel.ts";

const MIB = 1024 ** 2;

describe("rateUnit", () => {
  it.each([
    [0, "kib"],
    [MIB - 1, "kib"],
    [MIB, "mib"],
    [1024 * MIB - 1, "mib"],
    [1024 * MIB, "gib"],
  ] as const)("%d bytes per second is shown in %s", (value, unit) => {
    expect(rateUnit(value).unit).toBe(unit);
  });
});

const traffic = (
  t: number,
  rates: Record<string, { rx: number | null; tx: number | null }>,
): TrafficSample => ({
  t,
  since: t - 2000,
  interfaces: new Map(Object.entries(rates)),
});

describe("interfaceRates and highestRate", () => {
  const samples = [
    traffic(0, { enp2s0: { rx: 4 * MIB, tx: 1 } }),
    traffic(70_000, { enp2s0: { rx: 2 * MIB, tx: 3 * MIB } }),
    traffic(72_000, { eth1: { rx: 9 * MIB, tx: 9 * MIB } }),
  ];

  it("reads one interface, with a gap where a sample did not have it", () => {
    expect(interfaceRates(samples, "enp2s0")).toEqual([
      { t: 0, rx: 4 * MIB, tx: 1 },
      { t: 70_000, rx: 2 * MIB, tx: 3 * MIB },
      { t: 72_000, rx: null, tx: null },
    ]);
  });

  it("takes the highest of either direction in the window only", () => {
    expect(highestRate(interfaceRates(samples, "enp2s0"), 60_000)).toBe(
      3 * MIB,
    );
    expect(highestRate([], 60_000)).toBe(0);
  });
});

describe("liveInterface", () => {
  const LIST = CONTRACT_EXAMPLES.networkEnumerateDevicesList.ethernetAndLoopback
    .value.data as unknown as NetworkDevice[];

  it("takes the interface this page uses, else the first connected one, never loopback", () => {
    expect(liveInterface(LIST, null)).toBe("enp2s0");
    expect(liveInterface(LIST, "lo")).toBe("enp2s0");
    const unplugged = LIST.map((d) => ({ ...d, link: false }));
    expect(liveInterface(unplugged, null)).toBeNull();
    expect(liveInterface(unplugged, "enp2s0")).toBe("enp2s0");
  });
});

describe("readingRows", () => {
  const sample = (t: number, cpu: number | null = 10): SystemSample => ({
    t,
    cpu,
    memory: 40,
    memUsed: null,
    memTotal: null,
    load1: null,
    load5: null,
    load15: null,
  });

  it("lists the window newest first, with the rates of the same read and a row where the line breaks", () => {
    const rows = readingRows(
      [sample(0), sample(10_000), sample(40_000), sample(42_000, null)],
      [
        { t: 40_300, rx: 5, tx: 6 },
        { t: 30_000, rx: 1, tx: 1 },
      ],
      60_000,
    );
    expect(rows).toEqual([
      { kind: "reading", t: 42_000, cpu: null, memory: 40, rx: null, tx: null },
      { kind: "reading", t: 40_000, cpu: 10, memory: 40, rx: 5, tx: 6 },
      { kind: "gap", after: 10_000, before: 40_000 },
      { kind: "reading", t: 10_000, cpu: 10, memory: 40, rx: null, tx: null },
      { kind: "reading", t: 0, cpu: 10, memory: 40, rx: null, tx: null },
    ]);
  });

  it("leaves out what is older than the window, and is empty without a sample", () => {
    expect(readingRows([sample(0), sample(70_000)], [], 60_000)).toHaveLength(
      1,
    );
    expect(readingRows([], [], 60_000)).toEqual([]);
  });
});
