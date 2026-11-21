// SPDX-License-Identifier: GPL-3.0-or-later
// What a disk's health details show (phase 5 disks design 2.4): the facts of "About this disk", the
// key readings, and durations from power-on hours. Pure, so each rule is tested by itself; the
// component renders the result with the catalogue's words.
import type {
  SmartAttribute,
  SmartInformation,
} from "@omv-webui/react-api-omv/generated";
import { attributeValue, diskKind, hoursOf } from "./diskWords.ts";

export type HoursUnit = "years" | "days" | "hours";

/**
 * A duration from hours, in its two largest units (design 0.1: Phase 3's duration rule with a years
 * unit added): 26,280 hours is "3 years", 35,021 hours "3 years, 364 days", 30 hours "1 day, 6 hours".
 * A year is 365 days.
 */
export function hoursDuration(
  hours: number,
): { unit: HoursUnit; count: number }[] {
  const whole = Math.max(0, Math.floor(hours));
  const years = Math.floor(whole / (365 * 24));
  const days = Math.floor((whole % (365 * 24)) / 24);
  const rest = whole % 24;
  const parts: { unit: HoursUnit; count: number }[] = [
    { unit: "years", count: years },
    { unit: "days", count: days },
    { unit: "hours", count: rest },
  ];
  const first = parts.findIndex((p) => p.count > 0);
  if (first < 0) {
    return [{ unit: "hours", count: 0 }];
  }
  return parts.slice(first, first + 2).filter((p) => p.count > 0);
}

export type AboutFact =
  | { key: "modelFamily" | "model" | "capacity"; text: string }
  | { key: "firmware"; text: string }
  | {
      key: "kind";
      kind: NonNullable<ReturnType<typeof diskKind>>;
    }
  | { key: "powerOnTime"; hours: number }
  | { key: "powerCycles"; count: number };

const textOf = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** The known facts of Smart.getInformation, in the design's order, each only when present (2.4.1). */
export function aboutFacts(info: SmartInformation): AboutFact[] {
  const facts: AboutFact[] = [];
  const family = textOf(info.modelfamily);
  if (family !== "") {
    facts.push({ key: "modelFamily", text: family });
  }
  const model = textOf(info.devicemodel);
  if (model !== "") {
    facts.push({ key: "model", text: model });
  }
  const firmware = textOf(info.firmwareversion);
  if (firmware !== "") {
    facts.push({ key: "firmware", text: firmware });
  }
  const kind = diskKind(info["rotationrate"]);
  if (kind !== null) {
    facts.push({ key: "kind", kind });
  }
  const capacity = textOf(info.usercapacity);
  if (capacity !== "") {
    facts.push({ key: "capacity", text: capacity });
  }
  const hours = hoursOf(info.poweronhours);
  if (hours !== null) {
    facts.push({ key: "powerOnTime", hours });
  }
  const cycles = hoursOf(info.powercycles);
  if (cycles !== null) {
    facts.push({ key: "powerCycles", count: cycles });
  }
  return facts;
}

/** The readings that matter most to an owner, in the design's order (2.4.2). */
export const KEY_READINGS = [5, 197, 198, 187, 199, 9, 12] as const;
export type KeyReadingId = (typeof KEY_READINGS)[number] | "temperature";

export interface KeyReading {
  id: KeyReadingId;
  attribute: SmartAttribute;
  value: ReturnType<typeof attributeValue>;
}

/** The key readings the disk reports; the temperature is 194, else 190. */
export function keyReadings(
  attributes: readonly SmartAttribute[],
): KeyReading[] {
  const byId = new Map(attributes.map((a) => [a.id, a]));
  const readings: KeyReading[] = [];
  for (const id of KEY_READINGS) {
    const attribute = byId.get(id);
    if (attribute !== undefined) {
      readings.push({
        id,
        attribute,
        value: attributeValue(attribute.rawvalue),
      });
    }
  }
  const temperature = byId.get(194) ?? byId.get(190);
  if (temperature !== undefined) {
    readings.push({
      id: "temperature",
      attribute: temperature,
      value: attributeValue(temperature.rawvalue),
    });
  }
  return readings;
}

/**
 * How long ago a self-test ran, in hours, from its power-on hours and the disk's own now; null when
 * either is unknown or the test is not in the past.
 */
export function hoursAgo(
  lifetime: string,
  poweronhours: number | null,
): number | null {
  const at = hoursOf(lifetime);
  if (at === null || poweronhours === null || poweronhours < at) {
    return null;
  }
  return poweronhours - at;
}

/** Split a report into lines for the log block; a trailing newline adds no empty line. */
export const reportLines = (report: string): string[] => {
  const lines = report.split(/\r?\n/);
  if (lines.length > 1 && lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
};
