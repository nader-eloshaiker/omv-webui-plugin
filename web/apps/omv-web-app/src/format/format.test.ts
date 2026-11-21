// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  durationParts,
  formatBytes,
  longDurationParts,
  naturalCompare,
  parseByteCount,
  parseDecimal,
  percentOf,
  speedParts,
  wholePercent,
} from "./format.ts";

const NBSP = " ";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1.0 KiB"],
    [1536, "1.5 KiB"],
    [354_963_456, "338.5 MiB"],
    [4_104_114_176, "3.8 GiB"],
    [1024 * 1024 - 1, "1.0 MiB"],
    [3.6 * 1024 ** 4, "3.6 TiB"],
    [-1, "0 B"],
  ])("%d bytes is %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text.replace(" ", NBSP));
  });
});

describe("parseByteCount", () => {
  it("reads the server's decimal strings and refuses anything else", () => {
    expect(parseByteCount("4104114176")).toBe(4_104_114_176);
    expect(parseByteCount(12)).toBe(12);
    expect(parseByteCount("")).toBeNull();
    expect(parseByteCount(undefined)).toBeNull();
    expect(parseByteCount("lots")).toBeNull();
    expect(parseByteCount("-3")).toBeNull();
  });
});

describe("wholePercent and percentOf", () => {
  it.each([
    [0, 0],
    [0.2, "under1"],
    [1.49, 1],
    [41.4, 41],
    [99.6, 100],
    [120, 100],
  ] as const)("%d%% shows as %s", (value, shown) => {
    expect(wholePercent(value)).toBe(shown);
  });

  it("computes a share, and nothing of a zero whole", () => {
    expect(percentOf(1, 4)).toBe(25);
    expect(percentOf(1, 0)).toBeNull();
  });
});

describe("durationParts", () => {
  it.each([
    [0, { kind: "underMinute" }],
    [59.9, { kind: "underMinute" }],
    [35 * 60, { kind: "parts", parts: [{ unit: "minutes", count: 35 }] }],
    [
      5 * 3600 + 12 * 60 + 7,
      {
        kind: "parts",
        parts: [
          { unit: "hours", count: 5 },
          { unit: "minutes", count: 12 },
        ],
      },
    ],
    [
      12 * 86400 + 4 * 3600 + 59 * 60,
      {
        kind: "parts",
        parts: [
          { unit: "days", count: 12 },
          { unit: "hours", count: 4 },
        ],
      },
    ],
    [2 * 86400 + 30, { kind: "parts", parts: [{ unit: "days", count: 2 }] }],
    [
      19539.02,
      {
        kind: "parts",
        parts: [
          { unit: "hours", count: 5 },
          { unit: "minutes", count: 25 },
        ],
      },
    ],
  ])("%d s", (seconds, parts) => {
    expect(durationParts(seconds)).toEqual(parts);
  });
});

describe("longDurationParts", () => {
  const DAY = 86_400;
  it.each([
    [
      (3 * 365 + 41) * DAY + 3600,
      [
        { unit: "years", count: 3 },
        { unit: "days", count: 41 },
      ],
    ],
    [365 * DAY, [{ unit: "years", count: 1 }]],
    [
      41 * DAY + 7200,
      [
        { unit: "days", count: 41 },
        { unit: "hours", count: 2 },
      ],
    ],
  ])("%d s", (seconds, parts) => {
    expect(longDurationParts(seconds)).toEqual({ kind: "parts", parts });
  });
  it("keeps the short words under a minute", () => {
    expect(longDurationParts(30)).toEqual({ kind: "underMinute" });
  });
});

describe("speedParts", () => {
  it.each([
    [100, { unit: "mbit", value: "100" }],
    [999, { unit: "mbit", value: "999" }],
    [1000, { unit: "gbit", value: "1" }],
    [2500, { unit: "gbit", value: "2.5" }],
    [10000, { unit: "gbit", value: "10" }],
    [-1, null],
    [0, null],
  ])("%d Mbit/s is %j", (mbit, parts) => {
    expect(speedParts(mbit)).toEqual(parts);
  });
});

describe("parseDecimal", () => {
  it("reads numbers sent as text and refuses anything else", () => {
    expect(parseDecimal("3914.0")).toBe(3914);
    expect(parseDecimal(" 0.43 ")).toBe(0.43);
    expect(parseDecimal(41)).toBe(41);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("n/a")).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
    expect(parseDecimal(Number.NaN)).toBeNull();
  });
});

describe("naturalCompare", () => {
  it("orders numbered names as people count", () => {
    expect(["sdb", "sda10", "sda2", "Sda1"].sort(naturalCompare)).toEqual([
      "Sda1",
      "sda2",
      "sda10",
      "sdb",
    ]);
  });
});
