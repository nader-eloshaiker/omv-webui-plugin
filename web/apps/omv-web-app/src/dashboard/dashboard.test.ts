// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  attentionRows,
  clockDifferenceSeconds,
  emailAlerts,
  httpsState,
  memoryUsage,
} from "./dashboard.ts";

describe("memoryUsage", () => {
  it("computes the share from used and total, not from memUtilization", () => {
    expect(
      memoryUsage({ memUsed: "1073741824", memTotal: "4294967296" }),
    ).toEqual({
      used: 1_073_741_824,
      total: 4_294_967_296,
      percent: 25,
    });
  });

  it("gives nothing when a figure is missing or the total is zero", () => {
    expect(memoryUsage({ memUsed: "1", memTotal: undefined })).toBeNull();
    expect(memoryUsage({ memUsed: "1", memTotal: "0" })).toBeNull();
  });
});

describe("attentionRows", () => {
  const now = 1_795_089_029_000;

  it("is empty when nothing needs attention", () => {
    expect(
      attentionRows({ ts: now / 1000, rebootRequired: false }, now),
    ).toEqual([]);
  });

  it("lists a restart first, then a clock difference over five minutes", () => {
    expect(
      attentionRows({ ts: now / 1000 - 3600, rebootRequired: true }, now),
    ).toEqual([{ kind: "restart" }, { kind: "clock", seconds: 3600 }]);
  });

  it("allows five minutes either way", () => {
    expect(attentionRows({ ts: now / 1000 + 300 }, now)).toEqual([]);
    expect(attentionRows({ ts: now / 1000 + 301 }, now)).toEqual([
      { kind: "clock", seconds: 301 },
    ]);
    expect(clockDifferenceSeconds(100, 160_000)).toBe(60);
  });
});

describe("emailAlerts", () => {
  const complete = {
    enable: true,
    server: "smtp.example.com",
    port: 587,
    sender: "nas@example.com",
    primaryemail: "admin@example.com",
  };

  it("is done only when enabled with server, port, sender and primary address", () => {
    expect(emailAlerts(complete)).toBe("done");
    expect(emailAlerts({ ...complete, server: " " })).toBe("incomplete");
    expect(emailAlerts({ ...complete, sender: "" })).toBe("incomplete");
    expect(emailAlerts({ ...complete, primaryemail: "" })).toBe("incomplete");
    expect(emailAlerts({ ...complete, port: 0 })).toBe("incomplete");
    expect(emailAlerts({ ...complete, enable: false })).toBe("off");
  });
});

describe("httpsState", () => {
  it("tells the setting from the connection", () => {
    expect(httpsState(false, "https:")).toBe("off");
    expect(httpsState(true, "https:")).toBe("on");
    expect(httpsState(true, "http:")).toBe("onButNotUsed");
  });
});
