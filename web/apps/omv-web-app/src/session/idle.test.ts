// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { formatCountdown, idlePhase, warningLeadMs } from "./idle.ts";

const MINUTE = 60_000;

describe("idlePhase", () => {
  it.each([
    // [now - last activity, timeout in minutes, phase]
    [0, 0, { kind: "off" }],
    [10 * MINUTE, undefined, { kind: "off" }],
    [0, 5, { kind: "active", warnInMs: 4 * MINUTE }],
    [4 * MINUTE - 1, 5, { kind: "active", warnInMs: 1 }],
    [4 * MINUTE, 5, { kind: "warning", remainingMs: MINUTE }],
    [5 * MINUTE - 1000, 5, { kind: "warning", remainingMs: 1000 }],
    [5 * MINUTE, 5, { kind: "expired" }],
    // A one-minute timeout warns for the last half of it.
    [30_000, 1, { kind: "warning", remainingMs: 30_000 }],
    [29_999, 1, { kind: "active", warnInMs: 1 }],
  ])(
    "%i ms after the last activity, with %s minutes",
    (idle, timeout, phase) => {
      expect(idlePhase(1_000_000 + idle, 1_000_000, timeout)).toEqual(phase);
    },
  );
});

describe("warningLeadMs", () => {
  it("is a minute, or half the timeout when that is shorter", () => {
    expect(warningLeadMs(5 * MINUTE)).toBe(MINUTE);
    expect(warningLeadMs(MINUTE)).toBe(30_000);
  });
});

describe("formatCountdown", () => {
  it.each([
    [60_000, "1:00"],
    [59_001, "1:00"],
    [59_000, "0:59"],
    [5_000, "0:05"],
    [1, "0:01"],
    [0, "0:00"],
    [-5, "0:00"],
    [125_000, "2:05"],
  ])("%i ms reads %s", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});
