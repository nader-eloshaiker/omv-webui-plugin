// SPDX-License-Identifier: GPL-3.0-or-later
// The disks slice's small rules (phase 5 disks design 0.1, 0.2, 0.5, 1.3.2, 2.4): a disk's name in an
// address, its power word, its spin-down time, its label size, its temperature status, and the words
// for what smartctl reports. Pure, so each is tested by itself; the components only render them.
import type { RpcError } from "@omv-webui/react-api-omv/transport";
import { parseDecimal } from "../format/format.ts";

// ---- A disk in an address (0.5) ------------------------------------------------------------------

/** The kernel names a disk's page accepts: "sda", "nvme0n1", "mmcblk0". Nothing else reaches a call. */
export const DISK_NAME_PATTERN = /^[a-z][a-z0-9]{0,31}$/;

export const isDiskName = (value: unknown): value is string =>
  typeof value === "string" && DISK_NAME_PATTERN.test(value);

/** OMV's identifier for an object not saved yet (openmediavault's `$newObjectUuid`). */
export const NEW_OBJECT_UUID = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";

/**
 * Whether Smart.getDeviceSettings failed because the disk has no monitoring settings saved: OMV's
 * database lookup finds no object and says so (captured on the test VM, 2026-11-21). Only exactly
 * that reply means "not watched"; every other failure is an error (2.5).
 */
export function isNoDeviceSettings(
  error: RpcError | null | undefined,
): boolean {
  return (
    error !== null &&
    error !== undefined &&
    error.status === 500 &&
    /^The XPath query '.*\/\/services\/smart\/monitor\/device\[.*' does not return the requested number of 1 object\(s\)\.$/s.test(
      error.message,
    )
  );
}

/** Whether MdMgmt.enumerateDevices failed because the RAID plugin is not installed (0.6). */
export const isRaidPluginMissing = (
  error: RpcError | null | undefined,
): boolean => error?.status === 404;

// ---- Power (1.3.2) -------------------------------------------------------------------------------

export type PowerWord = "awake" | "standby" | "sleep" | "unknown";

/** A disk's power state as a word: never coloured, never a status. */
export function powerWord(powermode: string): PowerWord {
  const mode = powermode.trim().toUpperCase();
  if (mode.startsWith("ACTIVE") || mode.startsWith("IDLE")) {
    return "awake";
  }
  if (mode.startsWith("STANDBY")) {
    return "standby";
  }
  if (mode === "SLEEP") {
    return "sleep";
  }
  return "unknown";
}

export const isAsleep = (powermode: string): boolean => {
  const word = powerWord(powermode);
  return word === "standby" || word === "sleep";
};

/**
 * OMV's standby value as seconds (0.1): 1 to 240 is that many times 5 seconds; 241 to 251 is
 * (value − 240) times 30 minutes; 252 is 21 minutes; 255 is 21 minutes 15 seconds. 0 is "never"
 * (null), and so is anything outside the encoding.
 */
export function spinDownSeconds(value: number): number | null {
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  if (value <= 240) {
    return value * 5;
  }
  if (value <= 251) {
    return (value - 240) * 30 * 60;
  }
  if (value === 252) {
    return 21 * 60;
  }
  if (value === 255) {
    return 21 * 60 + 15;
  }
  return null;
}

// ---- Size on the label (0.1, D20) ----------------------------------------------------------------

const DECIMAL_UNITS = ["B", "kB", "MB", "GB", "TB", "PB"] as const;

/**
 * The size printed on a disk's label: decimal units, at most one decimal, dropped when whole
 * ("4 TB", "1.5 TB", "500 GB"). Null for no size.
 */
export function labelSize(
  bytes: number | null,
): { value: string; unit: string } | null {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < DECIMAL_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  if (rounded >= 1000 && unit < DECIMAL_UNITS.length - 1) {
    return { value: "1", unit: DECIMAL_UNITS[unit + 1] ?? "PB" };
  }
  return {
    value: Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1),
    unit: DECIMAL_UNITS[unit] ?? "B",
  };
}

// ---- Temperature (0.2, D11) ----------------------------------------------------------------------

/** OMV emails at the limit plus this many degrees (its monitoring configuration template). */
export const ALERT_MARGIN = 5;

export type TempStatus =
  | { status: "warning"; limit: number }
  | { status: "critical"; limit: number; alert: number }
  | null;

/**
 * A temperature's status against the disk's own limit, else the NAS-wide one (0 means none): Warning
 * at or above the limit, Critical at or above the limit plus 5 °C. No limit, no reading: no status.
 */
export function tempStatus(
  reading: number | null,
  deviceLimit: number,
  globalLimit: number,
): TempStatus {
  const limit = deviceLimit > 0 ? deviceLimit : globalLimit;
  if (reading === null || limit <= 0) {
    return null;
  }
  if (reading >= limit + ALERT_MARGIN) {
    return { status: "critical", limit, alert: limit + ALERT_MARGIN };
  }
  if (reading >= limit) {
    return { status: "warning", limit };
  }
  return null;
}

/** A temperature as whole degrees from a number or numeric text; null when none. */
export function degrees(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }
  const n = parseDecimal(value);
  return n === null ? null : Math.round(n);
}

// ---- What smartctl reports (2.4) -----------------------------------------------------------------

export type AssessmentReason =
  "pastBad" | "nowBad" | "someSectors" | "manySectors" | "other";

/** An attribute's `assessment` as a state and its reason (2.4.2), the way `overallstatus` maps. */
export function assessmentState(assessment: string): {
  status: "ok" | "warning" | "critical" | "unknown";
  reason: AssessmentReason | null;
} {
  switch (assessment) {
    case "GOOD":
      return { status: "ok", reason: null };
    case "BAD_ATTRIBUTE_IN_THE_PAST":
      return { status: "warning", reason: "pastBad" };
    case "BAD_SECTOR":
      return { status: "warning", reason: "someSectors" };
    case "BAD_ATTRIBUTE_NOW":
      return { status: "critical", reason: "nowBad" };
    case "BAD_SECTOR_MANY":
      return { status: "critical", reason: "manySectors" };
    default:
      return { status: "unknown", reason: "other" };
  }
}

/**
 * The value of an attribute's raw text: its leading whole number ("0", "34 (Min/Max 20/45)",
 * "12345h+06m" read as 12345), or the text as received when it has none.
 */
export function attributeValue(
  rawvalue: string,
): { kind: "number"; value: number } | { kind: "text"; text: string } {
  const match = /^\s*(\d+)/.exec(rawvalue);
  if (match?.[1] !== undefined) {
    return { kind: "number", value: Number(match[1]) };
  }
  return { kind: "text", text: rawvalue };
}

/** Hours from smartctl's text ("1234", "1234h+05m", 1234); null when there is no leading number. */
export function hoursOf(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const parsed = attributeValue(value.replace(/,/g, ""));
  return parsed.kind === "number" ? parsed.value : null;
}

export type TestResultWord =
  | { word: "passed"; status: "ok" }
  | { word: "running"; status: null }
  | { word: "aborted"; status: null }
  | { word: "interrupted"; status: null }
  | { word: "failed"; status: "critical" }
  | { word: "other"; status: "unknown"; text: string };

/** A self-test log entry's status in words (2.4.3.1). The tool's text is English; matched loosely. */
export function testResultWord(status: string): TestResultWord {
  const text = status.trim();
  const lower = text.toLowerCase();
  if (lower.startsWith("completed without error")) {
    return { word: "passed", status: "ok" };
  }
  if (lower.includes("in progress")) {
    return { word: "running", status: null };
  }
  if (lower.startsWith("aborted")) {
    return { word: "aborted", status: null };
  }
  if (lower.startsWith("interrupted")) {
    return { word: "interrupted", status: null };
  }
  if (lower.includes("failure") || lower.includes("fatal")) {
    return { word: "failed", status: "critical" };
  }
  return { word: "other", status: "unknown", text };
}

/** "Short offline" and "Short captive" are Short; the extended ones Long; anything else as received. */
export function testKindWord(
  description: string,
): "short" | "long" | { text: string } {
  const lower = description.trim().toLowerCase();
  if (lower.startsWith("short")) {
    return "short";
  }
  if (lower.startsWith("extended")) {
    return "long";
  }
  return { text: description.trim() };
}

/** `rotationrate`: "Solid State Device" is solid-state; "7200 rpm" a hard disk; else the text. */
export function diskKind(
  rotationrate: unknown,
):
  | { kind: "ssd" }
  | { kind: "hdd"; rpm: number }
  | { kind: "text"; text: string }
  | null {
  if (typeof rotationrate !== "string" || rotationrate.trim() === "") {
    return null;
  }
  const text = rotationrate.trim();
  if (/^solid state device$/i.test(text)) {
    return { kind: "ssd" };
  }
  const rpm = /^(\d+)\s*rpm$/i.exec(text);
  if (rpm?.[1] !== undefined) {
    return { kind: "hdd", rpm: Number(rpm[1]) };
  }
  return { kind: "text", text };
}

/** "pass 1/1 …1.2GiB/3.7TiB 32%": the percentage the last line of a secure wipe ends in, if any. */
export function wipeProgress(output: string): number | null {
  const lines = output.split(/\r?\n|\r/).filter((l) => l.trim() !== "");
  const last = lines.at(-1);
  if (last === undefined) {
    return null;
  }
  const match = /(\d{1,3})%\s*$/.exec(last);
  if (match?.[1] === undefined) {
    return null;
  }
  const value = Number(match[1]);
  return value >= 0 && value <= 100 ? value : null;
}

/** Whether a self-test task's output says the disk started the test (6.6). */
export const testBegan = (output: string): boolean =>
  /Testing has begun|Self-test has begun/i.test(output);
