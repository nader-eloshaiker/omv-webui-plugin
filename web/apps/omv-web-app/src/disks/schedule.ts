// SPDX-License-Identifier: GPL-3.0-or-later
// Scheduled self-tests in words, and the add/edit form's mapping both ways (phase 5 disks design 6.2,
// 6.4). A test is stored as month, day of month, weekday and hour, each a value or "*" (every). Pure,
// so each rule is tested by itself; the components turn the parts into the locale's words.
import type {
  DiskDevice,
  SmartScheduleEntry,
  SmartSetScheduledTestRequest,
} from "@omv-webui/react-api-omv/generated";
import { belongsTo, diskNames } from "./diskUse.ts";

/** One stored part: every (null), a number, or a value set elsewhere that is neither ("1,15"). */
export type SchedulePart = null | number | { raw: string };

export interface ScheduleParts {
  month: SchedulePart;
  day: SchedulePart;
  weekday: SchedulePart;
  hour: SchedulePart;
}

export function parsePart(value: string): SchedulePart {
  const text = value.trim();
  if (text === "*") {
    return null;
  }
  if (/^\d{1,2}$/.test(text)) {
    return Number(text);
  }
  return { raw: text };
}

export function scheduleParts(
  job: Pick<SmartScheduleEntry, "month" | "dayofmonth" | "dayofweek" | "hour">,
): ScheduleParts {
  return {
    month: parsePart(job.month),
    day: parsePart(job.dayofmonth),
    weekday: parsePart(job.dayofweek),
    hour: parsePart(job.hour),
  };
}

/** 6.2's rows: which sentence a schedule takes. Numbers only; anything else is custom. */
export type ScheduleWords =
  | { kind: "daily"; hour: number }
  | { kind: "weekly"; weekday: number; hour: number }
  | { kind: "monthly"; day: number; hour: number }
  | { kind: "yearly"; month: number; day: number; hour: number }
  | { kind: "hourly" }
  | { kind: "hourlyOn"; weekday: number }
  | { kind: "custom"; parts: ScheduleParts };

const num = (p: SchedulePart): p is number => typeof p === "number";

export function scheduleWords(
  job: Pick<SmartScheduleEntry, "month" | "dayofmonth" | "dayofweek" | "hour">,
): ScheduleWords {
  const parts = scheduleParts(job);
  const { month, day, weekday, hour } = parts;
  if (num(hour)) {
    if (month === null && day === null && weekday === null) {
      return { kind: "daily", hour };
    }
    if (month === null && day === null && num(weekday)) {
      return { kind: "weekly", weekday, hour };
    }
    if (month === null && num(day) && weekday === null) {
      return { kind: "monthly", day, hour };
    }
    if (num(month) && num(day) && weekday === null) {
      return { kind: "yearly", month, day, hour };
    }
  }
  if (hour === null && month === null && day === null) {
    if (weekday === null) {
      return { kind: "hourly" };
    }
    if (num(weekday)) {
      return { kind: "hourlyOn", weekday };
    }
  }
  return { kind: "custom", parts };
}

// ---- The form (6.4) ------------------------------------------------------------------------------

export const TEST_TYPES = ["S", "L", "C", "O"] as const;
export type TestType = (typeof TEST_TYPES)[number];
export const isTestType = (value: string): value is TestType =>
  (TEST_TYPES as readonly string[]).includes(value);

export type Often = "daily" | "weekly" | "monthly" | "custom";

/** The form's values, as the selects hold them: "*" or a number's digits, never zero-padded. */
export interface TestDraft {
  type: TestType;
  often: Often;
  /** "1" (Monday) to "7" (Sunday). */
  weekday: string;
  /** "1" to "31". */
  day: string;
  /** "0" to "23". */
  hour: string;
  custom: { month: string; day: string; weekday: string; hour: string };
  enable: boolean;
  comment: string;
}

export const NOTE_MAX = 200;

/** A new test: short, every Sunday at 03:00, on its schedule (6.4's defaults). */
export const NEW_DRAFT: TestDraft = {
  type: "S",
  often: "weekly",
  weekday: "7",
  day: "1",
  hour: "3",
  custom: { month: "*", day: "*", weekday: "*", hour: "3" },
  enable: true,
  comment: "",
};

const partText = (p: SchedulePart): string =>
  p === null ? "*" : typeof p === "number" ? String(p) : p.raw;

/** A stored test as the form opens it: on its preset when it fits one, else on Custom (6.4). */
export function toTestDraft(
  entry: Pick<
    SmartScheduleEntry,
    | "type"
    | "month"
    | "dayofmonth"
    | "dayofweek"
    | "hour"
    | "enable"
    | "comment"
  >,
): TestDraft {
  const words = scheduleWords(entry);
  const parts = scheduleParts(entry);
  const custom = {
    month: partText(parts.month),
    day: partText(parts.day),
    weekday: partText(parts.weekday),
    hour: partText(parts.hour),
  };
  const base: TestDraft = {
    ...NEW_DRAFT,
    type: isTestType(entry.type) ? entry.type : "S",
    custom,
    enable: entry.enable,
    comment: entry.comment,
  };
  switch (words.kind) {
    case "daily":
      return { ...base, often: "daily", hour: String(words.hour) };
    case "weekly":
      return {
        ...base,
        often: "weekly",
        weekday: String(words.weekday),
        hour: String(words.hour),
      };
    case "monthly":
      return {
        ...base,
        often: "monthly",
        day: String(words.day),
        hour: String(words.hour),
      };
    default:
      return { ...base, often: "custom" };
  }
}

const pad2 = (value: string): string =>
  value === "*" ? "*" : value.padStart(2, "0");

/** The four stored parts in the stock interface's exact forms: "*", "00"–"23", "01"–"12", "01"–"31", "1"–"7". */
export function scheduleOf(
  draft: TestDraft,
): Pick<
  SmartSetScheduledTestRequest,
  "hour" | "month" | "dayofmonth" | "dayofweek"
> {
  switch (draft.often) {
    case "daily":
      return {
        hour: pad2(draft.hour),
        month: "*",
        dayofmonth: "*",
        dayofweek: "*",
      };
    case "weekly":
      return {
        hour: pad2(draft.hour),
        month: "*",
        dayofmonth: "*",
        dayofweek: draft.weekday,
      };
    case "monthly":
      return {
        hour: pad2(draft.hour),
        month: "*",
        dayofmonth: pad2(draft.day),
        dayofweek: "*",
      };
    case "custom":
      return {
        hour: pad2(draft.custom.hour),
        month: pad2(draft.custom.month),
        dayofmonth: pad2(draft.custom.day),
        dayofweek: draft.custom.weekday,
      };
  }
}

/** The values each select offers, as the draft holds them. */
export const HOURS = Array.from({ length: 24 }, (_, i) => String(i));
export const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
export const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));
export const WEEKDAYS = ["1", "2", "3", "4", "5", "6", "7"];

export interface DraftProblems {
  /** A long test with hour "every hour": it would start again before it finishes (blocks Save). */
  longHourly: boolean;
  /** The note is longer than the stock form allows (blocks Save). */
  noteTooLong: boolean;
  /** A custom part holds a value set elsewhere that none of the selects offers (blocks Save). */
  oddValue: string | null;
  /** A long test every day: a warning, not a block. */
  longDaily: boolean;
}

export function draftProblems(draft: TestDraft): DraftProblems {
  const schedule = scheduleOf(draft);
  const custom = draft.custom;
  const offered = (value: string, options: readonly string[]) =>
    value === "*" || options.includes(value);
  const odd =
    draft.often !== "custom"
      ? null
      : ((
          [
            [custom.month, MONTHS],
            [custom.day, DAYS],
            [custom.weekday, WEEKDAYS],
            [custom.hour, HOURS],
          ] as const
        ).find(([value, options]) => !offered(value, options))?.[0] ?? null);
  return {
    longHourly: draft.type === "L" && schedule.hour === "*",
    noteTooLong: draft.comment.length > NOTE_MAX,
    oddValue: odd,
    longDaily:
      draft.type === "L" &&
      schedule.hour !== "*" &&
      schedule.dayofmonth === "*" &&
      schedule.dayofweek === "*",
  };
}

export const blocksSave = (p: DraftProblems): boolean =>
  p.longHourly || p.noteTooLong || p.oddValue !== null;

// ---- Whether a test runs (6.3, column 4) ---------------------------------------------------------

export type RunsWord =
  "yes" | "off" | "notWatched" | "globalOff" | "notConnected";

/**
 * The first reason that applies, in the design's order: turned off, the disk not watched (only known
 * for a connected disk), monitoring off for the whole NAS, the disk not connected.
 */
export function runsWord(input: {
  enable: boolean;
  connected: boolean;
  /** Whether the disk is watched; undefined while that is not known. */
  watched: boolean | undefined;
  globalOn: boolean;
}): RunsWord {
  if (!input.enable) {
    return "off";
  }
  if (input.connected && input.watched === false) {
    return "notWatched";
  }
  if (!input.globalOn) {
    return "globalOff";
  }
  if (!input.connected) {
    return "notConnected";
  }
  return "yes";
}

/** A schedule entry's disk is connected when the list names its device and a size (6.3). */
export const isConnected = (
  entry: Pick<SmartScheduleEntry, "devicefile" | "size">,
): boolean => entry.devicefile !== "" && entry.size !== "-1";

/** The disk a schedule entry names, by any of the disk's names. */
export function diskOfEntry(
  entry: Pick<SmartScheduleEntry, "devicefile" | "devicelinks">,
  disks: readonly DiskDevice[],
): DiskDevice | undefined {
  if (entry.devicefile === "") {
    return undefined;
  }
  return disks.find((disk) => {
    const names = diskNames(disk);
    return (
      belongsTo(entry.devicefile, names) ||
      entry.devicelinks.some((link) => names.has(link))
    );
  });
}
