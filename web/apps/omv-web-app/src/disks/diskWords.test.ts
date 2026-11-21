// SPDX-License-Identifier: GPL-3.0-or-later
import { RpcError } from "@omv-webui/react-api-omv/transport";
import { describe, expect, it } from "vitest";
import {
  assessmentState,
  attributeValue,
  degrees,
  diskKind,
  hoursOf,
  isDiskName,
  isNoDeviceSettings,
  isRaidPluginMissing,
  labelSize,
  powerWord,
  spinDownSeconds,
  tempStatus,
  testBegan,
  testKindWord,
  testResultWord,
  wipeProgress,
} from "./diskWords.ts";

const rpcError = (status: number, message: string) =>
  new RpcError({ status, code: 0, message, operationId: "test" });

describe("isDiskName", () => {
  it.each(["sda", "nvme0n1", "mmcblk0", "sr0", "a"])("accepts %s", (name) => {
    expect(isDiskName(name)).toBe(true);
  });
  it.each([
    "SDA",
    "",
    "0sda",
    "sda1/../x",
    "..%2F..%2Frpc",
    "cciss!c0d0",
    "sd-a",
    "a".repeat(33),
    undefined,
    7,
  ])("refuses %s", (name) => {
    expect(isDiskName(name)).toBe(false);
  });
});

describe("isNoDeviceSettings", () => {
  const captured =
    "The XPath query './/services/smart/monitor/device[(devicefile='/dev/nvme0n1' or devicefile='/dev/disk/by-diskseq/1')]' does not return the requested number of 1 object(s).";
  it("recognises exactly the captured reply", () => {
    expect(isNoDeviceSettings(rpcError(500, captured))).toBe(true);
  });
  it("takes every other failure for an error", () => {
    expect(isNoDeviceSettings(rpcError(500, "Something else."))).toBe(false);
    expect(isNoDeviceSettings(rpcError(400, captured))).toBe(false);
    expect(
      isNoDeviceSettings(
        rpcError(
          500,
          "The XPath query './/system/fstab/mntent' does not return the requested number of 1 object(s).",
        ),
      ),
    ).toBe(false);
    expect(isNoDeviceSettings(undefined)).toBe(false);
  });
});

describe("isRaidPluginMissing", () => {
  it("is the 404 of an unknown service, and nothing else", () => {
    expect(
      isRaidPluginMissing(rpcError(404, "RPC service 'MdMgmt' not found.")),
    ).toBe(true);
    expect(isRaidPluginMissing(rpcError(500, "mdadm failed"))).toBe(false);
    expect(isRaidPluginMissing(null)).toBe(false);
  });
});

describe("powerWord", () => {
  it.each([
    ["ACTIVE or IDLE", "awake"],
    ["ACTIVE", "awake"],
    ["IDLE", "awake"],
    ["IDLE_A", "awake"],
    ["STANDBY", "standby"],
    ["STANDBY_Y", "standby"],
    ["SLEEP", "sleep"],
    ["UNKNOWN", "unknown"],
    ["ERROR", "unknown"],
    ["", "unknown"],
    ["SOMETHING", "unknown"],
  ])("%s is %s", (mode, word) => {
    expect(powerWord(mode)).toBe(word);
  });
});

describe("spinDownSeconds", () => {
  it.each([
    [0, null],
    [60, 300],
    [120, 600],
    [240, 1200],
    [241, 1800],
    [242, 3600],
    [251, 19800],
    [252, 1260],
    [253, null],
    [255, 1275],
    [-1, null],
    [1.5, null],
  ])("%d is %s seconds", (value, seconds) => {
    expect(spinDownSeconds(value)).toBe(seconds);
  });
});

describe("labelSize", () => {
  it.each([
    [4000787030016, { value: "4", unit: "TB" }],
    [1500301910016, { value: "1.5", unit: "TB" }],
    [500107862016, { value: "500.1", unit: "GB" }],
    [8589934592, { value: "8.6", unit: "GB" }],
    [999999999999, { value: "1", unit: "TB" }],
    [921600, { value: "921.6", unit: "kB" }],
    [null, null],
    [0, null],
  ])("%s bytes is %o on the label", (bytes, size) => {
    expect(labelSize(bytes)).toEqual(size);
  });
});

describe("tempStatus", () => {
  it("uses the disk's own limit, else the NAS-wide one", () => {
    expect(tempStatus(50, 0, 50)).toEqual({ status: "warning", limit: 50 });
    expect(tempStatus(50, 60, 50)).toBeNull();
    expect(tempStatus(55, 0, 50)).toEqual({
      status: "critical",
      limit: 50,
      alert: 55,
    });
    expect(tempStatus(54, 0, 50)).toEqual({ status: "warning", limit: 50 });
  });
  it("has no status without a limit or a reading (D11)", () => {
    expect(tempStatus(90, 0, 0)).toBeNull();
    expect(tempStatus(null, 40, 40)).toBeNull();
  });
  it("reads degrees from numbers and numeric text", () => {
    expect(degrees("34")).toBe(34);
    expect(degrees(33.6)).toBe(34);
    expect(degrees("")).toBeNull();
    expect(degrees(undefined)).toBeNull();
  });
});

describe("assessmentState", () => {
  it.each([
    ["GOOD", "ok", null],
    ["BAD_ATTRIBUTE_IN_THE_PAST", "warning", "pastBad"],
    ["BAD_SECTOR", "warning", "someSectors"],
    ["BAD_ATTRIBUTE_NOW", "critical", "nowBad"],
    ["BAD_SECTOR_MANY", "critical", "manySectors"],
    ["NEW_VALUE", "unknown", "other"],
  ])("%s is %s", (assessment, status, reason) => {
    expect(assessmentState(assessment)).toEqual({ status, reason });
  });
});

describe("attributeValue and hoursOf", () => {
  it.each([
    ["0", { kind: "number", value: 0 }],
    ["34 (Min/Max 20/45)", { kind: "number", value: 34 }],
    ["12345h+06m", { kind: "number", value: 12345 }],
    ["-", { kind: "text", text: "-" }],
    ["", { kind: "text", text: "" }],
  ])("%s", (raw, value) => {
    expect(attributeValue(raw)).toEqual(value);
  });
  it("reads power-on hours in each form", () => {
    expect(hoursOf("1234h+05m")).toBe(1234);
    expect(hoursOf("26,280")).toBe(26280);
    expect(hoursOf(12)).toBe(12);
    expect(hoursOf("none")).toBeNull();
    expect(hoursOf(undefined)).toBeNull();
  });
});

describe("testResultWord and testKindWord", () => {
  it.each([
    ["Completed without error       ", "passed"],
    ["Self-test routine in progress", "running"],
    ["Aborted by host", "aborted"],
    ["Interrupted (host reset)", "interrupted"],
    ["Completed: read failure", "failed"],
    ["Fatal or unknown error", "failed"],
    ["Something new", "other"],
  ])("%s is %s", (status, word) => {
    expect(testResultWord(status).word).toBe(word);
  });
  it("keeps the text of an unknown result", () => {
    expect(testResultWord(" Odd ")).toEqual({
      word: "other",
      status: "unknown",
      text: "Odd",
    });
  });
  it.each([
    ["Short offline", "short"],
    ["Short captive", "short"],
    ["Extended offline", "long"],
    ["Extended captive", "long"],
  ])("%s is %s", (description, kind) => {
    expect(testKindWord(description)).toBe(kind);
  });
  it("keeps any other kind as text", () => {
    expect(testKindWord("Conveyance offline")).toEqual({
      text: "Conveyance offline",
    });
  });
});

describe("diskKind", () => {
  it("reads smartctl's rotation rate", () => {
    expect(diskKind("Solid State Device")).toEqual({ kind: "ssd" });
    expect(diskKind("7200 rpm")).toEqual({ kind: "hdd", rpm: 7200 });
    expect(diskKind("Unknown")).toEqual({ kind: "text", text: "Unknown" });
    expect(diskKind(undefined)).toBeNull();
    expect(diskKind("")).toBeNull();
  });
});

describe("wipeProgress and testBegan", () => {
  it("reads the percentage the last line ends in", () => {
    expect(
      wipeProgress(
        "shred: /dev/sdb: pass 1/1 (random)...\nshred: /dev/sdb: pass 1/1 (random)...1.2GiB/3.7TiB 32%\n",
      ),
    ).toBe(32);
    expect(wipeProgress("shred: /dev/sdb: pass 1/1 (random)...\n")).toBeNull();
    expect(wipeProgress("")).toBeNull();
    expect(wipeProgress("x 140%")).toBeNull();
  });
  it("finds the line that says a test began", () => {
    expect(testBegan("...\nTesting has begun.\n")).toBe(true);
    expect(testBegan("Self-test has begun\n")).toBe(true);
    expect(testBegan("Device open failed\n")).toBe(false);
  });
});
