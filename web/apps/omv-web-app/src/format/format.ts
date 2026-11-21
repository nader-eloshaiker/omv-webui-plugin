// SPDX-License-Identifier: GPL-3.0-or-later
// How the pages write numbers (phase 3 design 0.1): bytes in binary units with one decimal, whole
// percentages with "<1%" for a small non-zero share, and durations as their two largest units. Pure,
// so the rules are tested without React; the words come from the catalogue (useFormat.ts).

const NBSP = " ";
const UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

/** A byte count in binary units, one decimal, a non-breaking space before the unit: `7.6 GiB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return `0${NBSP}B`;
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Bytes are whole; a rounded 1024.0 of a unit moves up rather than showing "1024.0 KiB".
  if (unit > 0 && Number(value.toFixed(1)) >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${text}${NBSP}${UNITS[unit] ?? "B"}`;
}

/**
 * A byte count the server sends as a decimal string (A4). The values the pages show are far below
 * 2^53, so a number is exact enough; anything that is not a count is null.
 */
export function parseByteCount(
  value: string | number | undefined,
): number | null {
  if (value === undefined || value === "") {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** A percentage as a whole number, or "under1" for a share above 0 and below 1. */
export function wholePercent(percent: number): number | "under1" {
  if (!Number.isFinite(percent) || percent <= 0) {
    return 0;
  }
  if (percent < 1) {
    return "under1";
  }
  return Math.min(100, Math.round(percent));
}

/** `part` of `whole` in percent; null when the whole is not a positive number. */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

export type DurationUnit = "years" | "days" | "hours" | "minutes";

export type DurationParts =
  | { kind: "underMinute" }
  | { kind: "parts"; parts: { unit: DurationUnit; count: number }[] };

/**
 * A duration as its two largest units, starting at the largest that is not zero: 12 days, 4 hours;
 * 5 hours, 12 minutes; 35 minutes. A zero second unit is left out (2 days, not "2 days, 0 hours").
 * Under a minute has its own words.
 */
export function durationParts(seconds: number): DurationParts {
  const total = Math.floor(Math.max(0, Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(total / 60);
  if (minutes === 0) {
    return { kind: "underMinute" };
  }
  const all: { unit: DurationUnit; count: number }[] = [
    { unit: "days", count: Math.floor(minutes / 1440) },
    { unit: "hours", count: Math.floor((minutes % 1440) / 60) },
    { unit: "minutes", count: minutes % 60 },
  ];
  const first = all.findIndex((p) => p.count > 0);
  const parts = all.slice(first, first + 2).filter((p) => p.count > 0);
  return { kind: "parts", parts };
}

/**
 * A long duration, such as a disk's power-on time (phase 5 disks design 0.1): the same rule with a
 * years unit of 365 days added before days. 3 years, 41 days; 41 days, 2 hours.
 */
export function longDurationParts(seconds: number): DurationParts {
  const base = durationParts(seconds);
  const total = Math.floor(Math.max(0, Number.isFinite(seconds) ? seconds : 0));
  const days = Math.floor(total / 86_400);
  if (base.kind === "underMinute" || days < 365) {
    return base;
  }
  const years = Math.floor(days / 365);
  const rest = days % 365;
  const parts: { unit: DurationUnit; count: number }[] = [
    { unit: "years", count: years },
  ];
  if (rest > 0) {
    parts.push({ unit: "days", count: rest });
  }
  return { kind: "parts", parts };
}

/**
 * A network speed in Mbit/s as network equipment labels it (phase 5 design 0.1): under 1000 in
 * Mbit/s, otherwise Gbit/s with at most one decimal, dropped when whole. Null when the speed is not
 * reported (-1, or anything that is not a positive number).
 */
export function speedParts(
  mbit: number,
): { unit: "mbit" | "gbit"; value: string } | null {
  if (!Number.isFinite(mbit) || mbit <= 0) {
    return null;
  }
  if (mbit < 1000) {
    return { unit: "mbit", value: String(Math.round(mbit)) };
  }
  const gbit = Math.round(mbit / 100) / 10;
  return {
    unit: "gbit",
    value: Number.isInteger(gbit) ? String(gbit) : gbit.toFixed(1),
  };
}

/**
 * A number the server sends as text ("3914.0", "0.43", "30") or as a number. Null for anything that
 * is not a finite number, including the empty string.
 */
export function parseDecimal(
  value: string | number | undefined | null,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const text = value.trim();
  if (text === "") {
    return null;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** Natural order for names: `sdb` before `sdaa`, `disk2` before `disk10`. */
export const naturalCompare = (a: string, b: string): number =>
  collator.compare(a, b);

const LOG_TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

/** A log entry's moment, from epoch seconds, in this computer's locale and time zone (D11). */
export const formatEpochSeconds = (epochSeconds: number): string =>
  LOG_TIME.format(epochSeconds * 1000);
