// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  SmartAttribute,
  SmartInformation,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  aboutFacts,
  hoursAgo,
  hoursDuration,
  keyReadings,
  reportLines,
} from "./healthDetails.ts";

describe("hoursDuration", () => {
  it.each([
    [26280, [{ unit: "years", count: 3 }]],
    [
      35021,
      [
        { unit: "years", count: 3 },
        { unit: "days", count: 364 },
      ],
    ],
    [
      30,
      [
        { unit: "days", count: 1 },
        { unit: "hours", count: 6 },
      ],
    ],
    [5, [{ unit: "hours", count: 5 }]],
    [0, [{ unit: "hours", count: 0 }]],
    [24 * 365 + 3, [{ unit: "years", count: 1 }]],
  ])("%d hours", (hours, parts) => {
    expect(hoursDuration(hours)).toEqual(parts);
  });
});

describe("aboutFacts", () => {
  it("takes the known keys in order, each only when present", () => {
    const info = CONTRACT_EXAMPLES.smartGetInformation.ataFailing
      .value as unknown as SmartInformation;
    expect(aboutFacts(info).map((f) => f.key)).toEqual([
      "modelFamily",
      "model",
      "firmware",
      "kind",
      "capacity",
      "powerOnTime",
      "powerCycles",
    ]);
    expect(aboutFacts(info)).toContainEqual({
      key: "kind",
      kind: { kind: "hdd", rpm: 5400 },
    });
    expect(aboutFacts(info)).toContainEqual({
      key: "powerOnTime",
      hours: 35021,
    });
  });
  it("leaves out what an NVMe disk does not report", () => {
    const info = CONTRACT_EXAMPLES.smartGetInformation.nvme
      .value as unknown as SmartInformation;
    const keys = aboutFacts(info).map((f) => f.key);
    expect(keys).not.toContain("capacity");
    expect(keys).not.toContain("modelFamily");
  });
});

describe("keyReadings", () => {
  const attr = (id: number, rawvalue = "0"): SmartAttribute => ({
    id,
    attrname: `A${String(id)}`,
    flags: "",
    value: 100,
    worst: 100,
    threshold: 0,
    whenfailed: "-",
    rawvalue,
    description: "",
    prefailure: false,
    assessment: "GOOD",
  });
  it("lists the readings that matter, in the design's order, with the temperature last", () => {
    const readings = keyReadings([
      attr(12, "84"),
      attr(194, "34 (Min/Max 20/45)"),
      attr(5, "8"),
      attr(9, "1234h+05m"),
      attr(190, "30"),
      attr(1),
    ]);
    expect(readings.map((r) => r.id)).toEqual([5, 9, 12, "temperature"]);
    expect(readings.at(-1)?.value).toEqual({ kind: "number", value: 34 });
    expect(readings[1]?.value).toEqual({ kind: "number", value: 1234 });
  });
  it("leaves out what About this disk already shows, so it is shown once", () => {
    const all = [attr(5, "0"), attr(9, "1234"), attr(12, "84")];
    expect(keyReadings(all, new Set([9, 12])).map((r) => r.id)).toEqual([5]);
    expect(keyReadings(all, new Set([9])).map((r) => r.id)).toEqual([5, 12]);
  });
  it("uses 190 for the temperature when 194 is missing", () => {
    expect(keyReadings([attr(190, "31")]).at(-1)?.attribute.id).toBe(190);
  });
});

describe("hoursAgo and reportLines", () => {
  it("counts back from the disk's power-on hours", () => {
    expect(hoursAgo("26270", 26280)).toBe(10);
    expect(hoursAgo("26270", null)).toBeNull();
    expect(hoursAgo("x", 10)).toBeNull();
    expect(hoursAgo("20", 10)).toBeNull();
  });
  it("splits a report into lines without a trailing empty one", () => {
    expect(reportLines("a\nb\n")).toEqual(["a", "b"]);
    expect(reportLines("a\r\nb")).toEqual(["a", "b"]);
  });
});
