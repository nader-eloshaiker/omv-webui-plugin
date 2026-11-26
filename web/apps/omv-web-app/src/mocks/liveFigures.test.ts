// SPDX-License-Identifier: GPL-3.0-or-later
// The mock's live figures: the same for the same moment, bounded, smooth, with peaks, and counters
// whose rate between two readings is the rate drawn.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { describe, expect, it } from "vitest";
import {
  countersAt,
  interfaceRates,
  memoryShareAt,
  processorAt,
  withLiveCounters,
  withLiveSystem,
} from "./liveFigures.ts";

const T0 = 1_795_089_000_000;
/** Every 2 seconds for an hour, as the dashboard reads. */
const HOUR = Array.from({ length: 1800 }, (_, i) => T0 + i * 2000);
const MIB = 1024 ** 2;

describe("the processor and memory", () => {
  it("are the same for the same moment", () => {
    expect(processorAt(T0)).toBe(processorAt(T0));
    expect(memoryShareAt(T0)).toBe(memoryShareAt(T0));
  });

  it("stay in bounds, move from reading to reading, and peak now and then", () => {
    const cpu = HOUR.map(processorAt);
    const memory = HOUR.map(memoryShareAt);
    expect(Math.min(...cpu)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...cpu)).toBeLessThanOrEqual(98);
    expect(Math.max(...cpu)).toBeGreaterThan(40);
    expect(new Set(cpu.slice(0, 30)).size).toBeGreaterThan(20);
    expect(Math.min(...memory)).toBeGreaterThanOrEqual(0.05);
    expect(Math.max(...memory)).toBeLessThanOrEqual(0.8);
    // Smooth: a peak climbs over several readings, never in one jump.
    for (let i = 1; i < cpu.length; i += 1) {
      expect(Math.abs(cpu[i]! - cpu[i - 1]!)).toBeLessThan(30);
    }
  });
});

describe("the network counters", () => {
  const base = { rx: 106928701n, tx: 158236022n };
  const start = Math.floor(T0 / 1000) - 60;

  it("only grow, and their rate between two readings is the rate drawn", () => {
    let before = countersAt("enp2s0", base, HOUR[0]!, start);
    for (const ms of HOUR.slice(1, 120)) {
      const now = countersAt("enp2s0", base, ms, start);
      expect(now.rx).toBeGreaterThan(before.rx);
      expect(now.tx).toBeGreaterThan(before.tx);
      const measured = Number(now.rx - before.rx) / 2 / MIB;
      const mid = interfaceRates("enp2s0", ms - 1000).rx;
      expect(Math.abs(measured - mid)).toBeLessThan(0.2);
      before = now;
    }
  });

  it("receive and send at different rates, with a burst of a few MiB/s now and then", () => {
    const rates = HOUR.map((ms) => interfaceRates("enp2s0", ms));
    const rx = rates.map((r) => r.rx);
    const tx = rates.map((r) => r.tx);
    expect(Math.max(...rx)).toBeGreaterThan(2);
    expect(Math.max(...rx)).toBeLessThan(8);
    expect(Math.min(...rx)).toBeGreaterThan(0);
    expect(rx.filter((v) => v > 1.5).length).toBeLessThan(rx.length / 2);
    expect(rates.filter((r) => r.rx !== r.tx).length).toBe(rates.length);
    expect(Math.max(...tx)).toBeLessThan(Math.max(...rx));
  });
});

describe("the replies", () => {
  it("move an administrator's processor and memory and keep the total", () => {
    const admin = CONTRACT_EXAMPLES.systemGetInformation.admin;
    const live = withLiveSystem(admin, T0);
    const value = live.value as typeof admin.value;
    expect(value.cpuUtilization).toBe(processorAt(T0));
    expect(value.memTotal).toBe(admin.value.memTotal);
    expect(Number(value.memUsed) / Number(value.memTotal)).toBeCloseTo(
      memoryShareAt(T0),
      5,
    );
    // A normal user's reply has neither, and an error is left alone.
    const user = CONTRACT_EXAMPLES.systemGetInformation.user;
    expect(withLiveSystem(user, T0)).toEqual(user);
    const failed = { status: 500, message: "Failed." };
    expect(withLiveSystem(failed, T0)).toBe(failed);
  });

  it("move a connected interface's counters and leave the loopback as read", () => {
    const list =
      CONTRACT_EXAMPLES.networkEnumerateDevicesList.ethernetAndLoopback;
    const live = withLiveCounters(list, Date.now() + 60_000);
    const [eth, lo] = (live.value as typeof list.value).data;
    const [ethBefore, loBefore] = list.value.data;
    expect(BigInt(eth!.stats.rx_bytes)).toBeGreaterThan(
      BigInt(ethBefore.stats.rx_bytes),
    );
    expect(lo).toEqual(loBefore);
  });
});
