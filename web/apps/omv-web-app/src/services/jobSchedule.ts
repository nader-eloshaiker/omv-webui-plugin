// SPDX-License-Identifier: GPL-3.0-or-later
// Schedules in words, and the library's ScheduleField mapped to and from what OMV stores (phase 5
// services design 0.7; phase 5 disks design 6.2, 6.4, whose four-part self-test schedule moved here
// from disks/schedule.ts). Pure, so each rule is tested by itself; the hooks turn the kinds into the
// locale's words.
//
// A copy job stores five cron fields (minute, hour, day of the month, month, weekday), each a list of
// values or "*" (every), and three "every N" flags for minute, hour and day of the month: with a flag
// on, the field's one value N means every N (read from source: the job's cron line writes "*\/N").
// Rsync.get returns the fields as lists, Rsync.getList as comma-separated text; both are read here.
// Weekday 1 is Monday and 7 is Sunday (the classic form's values; cron also reads 0 as Sunday).
import {
  defaultScheduleValue,
  type ScheduleCustomParts,
  type ScheduleFieldValue,
  type ScheduleFrequency,
} from "@omv-webui/react-ui-components";

// ---- One stored part -----------------------------------------------------------------------------

/** One stored part: every (null), a number, or a value set elsewhere that is neither ("1,15"). */
export type SchedulePart = null | number | { raw: string };

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

// ---- The self-tests' four parts (disks design 6.2) -----------------------------------------------

/** A self-test's schedule: month, day of the month, weekday and hour, each "*" or a value. */
export interface FourPartSchedule {
  month: string;
  dayofmonth: string;
  dayofweek: string;
  hour: string;
}

export interface ScheduleParts {
  month: SchedulePart;
  day: SchedulePart;
  weekday: SchedulePart;
  hour: SchedulePart;
}

export function scheduleParts(job: FourPartSchedule): ScheduleParts {
  return {
    month: parsePart(job.month),
    day: parsePart(job.dayofmonth),
    weekday: parsePart(job.dayofweek),
    hour: parsePart(job.hour),
  };
}

/** 6.2's rows: which sentence a self-test schedule takes. Numbers only; anything else is custom. */
export type ScheduleWords =
  | { kind: "daily"; hour: number }
  | { kind: "weekly"; weekday: number; hour: number }
  | { kind: "monthly"; day: number; hour: number }
  | { kind: "yearly"; month: number; day: number; hour: number }
  | { kind: "hourly" }
  | { kind: "hourlyOn"; weekday: number }
  | { kind: "custom"; parts: ScheduleParts };

const num = (p: SchedulePart): p is number => typeof p === "number";

export function scheduleWords(job: FourPartSchedule): ScheduleWords {
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

// ---- A copy job's schedule (services design 0.7) -------------------------------------------------

/** The schedule fields of a job, as Rsync.get (lists) or Rsync.getList (comma-separated) returns them. */
export interface StoredJobSchedule {
  minute: readonly string[] | string;
  hour: readonly string[] | string;
  dayofmonth: readonly string[] | string;
  month: readonly string[] | string;
  dayofweek: readonly string[] | string;
  everynminute?: boolean;
  everynhour?: boolean;
  everyndayofmonth?: boolean;
}

/** The schedule fields Rsync.set takes: lists of strings and the three flags. */
export interface JobScheduleFields {
  minute: string[];
  hour: string[];
  dayofmonth: string[];
  month: string[];
  dayofweek: string[];
  everynminute: boolean;
  everynhour: boolean;
  everyndayofmonth: boolean;
}

/** One part of a job's schedule, read. */
export type JobPart =
  | { kind: "every" }
  /** One value or several, in the stored order. */
  | { kind: "values"; values: number[] }
  /** "Every N", from the part's flag. */
  | { kind: "step"; n: number }
  /** Anything else, shown as stored. */
  | { kind: "raw"; text: string };

export interface JobParts {
  minute: JobPart;
  hour: JobPart;
  day: JobPart;
  month: JobPart;
  weekday: JobPart;
}

/** The largest value each part takes (the contract's anchored patterns). */
const RANGES: Record<keyof JobParts, readonly [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  day: [1, 31],
  month: [1, 12],
  weekday: [1, 7],
};

const listOf = (value: readonly string[] | string): string[] =>
  (typeof value === "string" ? value.split(",") : [...value])
    .map((v) => v.trim())
    .filter((v) => v !== "");

function readPart(
  stored: readonly string[] | string,
  part: keyof JobParts,
  stepFlag: boolean,
): JobPart {
  const items = listOf(stored);
  const text = items.join(",");
  if (items.length === 0) {
    return { kind: "raw", text };
  }
  if (items.length === 1 && items[0] === "*") {
    return { kind: "every" };
  }
  const [low, high] = RANGES[part];
  const numbers = items.map((v) => (/^\d{1,2}$/.test(v) ? Number(v) : NaN));
  if (numbers.some((n) => Number.isNaN(n) || n < low || n > high)) {
    // Cron's own forms set elsewhere ("*/5", "1-5", weekday 0) are kept and shown as stored.
    return { kind: "raw", text };
  }
  if (stepFlag) {
    const n = numbers[0];
    return numbers.length === 1 && n !== undefined && n > 0
      ? { kind: "step", n }
      : { kind: "raw", text };
  }
  return { kind: "values", values: numbers };
}

export function jobParts(job: StoredJobSchedule): JobParts {
  return {
    minute: readPart(job.minute, "minute", job.everynminute === true),
    hour: readPart(job.hour, "hour", job.everynhour === true),
    day: readPart(job.dayofmonth, "day", job.everyndayofmonth === true),
    month: readPart(job.month, "month", false),
    weekday: readPart(job.dayofweek, "weekday", false),
  };
}

/** 0.7's rows: which sentence a job's schedule takes. */
export type JobScheduleWords =
  /** `enable` false: "Only when started here". */
  | { kind: "manual" }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekly"; weekday: number; hour: number; minute: number }
  | { kind: "monthly"; day: number; hour: number; minute: number }
  | { kind: "hourly"; minute: number }
  | { kind: "everyNHours"; n: number; minute: number }
  /** With the line about a run still going when the next is due. */
  | { kind: "everyNMinutes"; n: number }
  | { kind: "custom"; parts: JobParts };

/** The part's one value, or undefined. */
const one = (p: JobPart): number | undefined =>
  p.kind === "values" && p.values.length === 1 ? p.values[0] : undefined;

const every = (p: JobPart): boolean => p.kind === "every";

/** The sentence a schedule takes, whatever `enable` says (the form shows it beside "Only when…"). */
export function jobScheduleKind(
  job: StoredJobSchedule,
): Exclude<JobScheduleWords, { kind: "manual" }> {
  const parts = jobParts(job);
  const { minute, hour, day, month, weekday } = parts;
  const m = one(minute);
  const h = one(hour);
  const restEvery = every(month);
  if (m !== undefined && h !== undefined && restEvery) {
    if (every(day) && every(weekday)) {
      return { kind: "daily", hour: h, minute: m };
    }
    const w = one(weekday);
    if (every(day) && w !== undefined) {
      return { kind: "weekly", weekday: w, hour: h, minute: m };
    }
    const d = one(day);
    if (d !== undefined && every(weekday)) {
      return { kind: "monthly", day: d, hour: h, minute: m };
    }
  }
  const dayAndRestEvery = every(day) && every(weekday) && restEvery;
  if (dayAndRestEvery && m !== undefined && every(hour)) {
    return { kind: "hourly", minute: m };
  }
  if (dayAndRestEvery && m !== undefined && hour.kind === "step") {
    return { kind: "everyNHours", n: hour.n, minute: m };
  }
  if (dayAndRestEvery && minute.kind === "step" && every(hour)) {
    return { kind: "everyNMinutes", n: minute.n };
  }
  return { kind: "custom", parts };
}

export function jobScheduleWords(
  job: StoredJobSchedule & { enable: boolean },
): JobScheduleWords {
  return job.enable ? jobScheduleKind(job) : { kind: "manual" };
}

// ---- ScheduleField, both ways --------------------------------------------------------------------

/** A part as Custom's select holds it: "*", a number's digits, or the stored text ("0,30", "*\/2"). */
function partText(p: JobPart): string {
  switch (p.kind) {
    case "every":
      return "*";
    case "values":
      return p.values.join(",");
    case "step":
      return `*/${String(p.n)}`;
    case "raw":
      return p.text;
  }
}

/** Custom's selects can make it: every part "*" or one value. */
const selectable = (p: JobPart): boolean =>
  p.kind === "every" || one(p) !== undefined;

export interface ToScheduleOptions {
  /** The frequencies the form offers; a schedule that fits another opens on Custom. All by default. */
  frequencies?: readonly ScheduleFrequency[];
}

/**
 * A stored schedule as the form opens it (section 6): on the choice it fits, else on Custom with the
 * stored values, which are kept (`stored`) unless a Custom select is changed. `enable` false opens on
 * "Only when I start it" with the stored schedule behind it.
 */
export function toScheduleValue(
  job: StoredJobSchedule & { enable: boolean },
  { frequencies }: ToScheduleOptions = {},
): ScheduleFieldValue {
  const parts = jobParts(job);
  const custom: ScheduleCustomParts = {
    minute: partText(parts.minute),
    hour: partText(parts.hour),
    day: partText(parts.day),
    month: partText(parts.month),
    weekday: partText(parts.weekday),
  };
  const base: ScheduleFieldValue = {
    ...defaultScheduleValue,
    mode: job.enable ? "schedule" : "manual",
    custom,
    stored: false,
  };
  const words = jobScheduleKind(job);
  const offered = (f: ScheduleFrequency) =>
    frequencies === undefined || frequencies.includes(f);
  const s = String;
  switch (words.kind) {
    case "hourly":
      if (offered("hourly")) {
        return { ...base, frequency: "hourly", minute: s(words.minute) };
      }
      break;
    case "daily":
      if (offered("daily")) {
        return {
          ...base,
          frequency: "daily",
          hour: s(words.hour),
          minute: s(words.minute),
        };
      }
      break;
    case "weekly":
      if (offered("weekly")) {
        return {
          ...base,
          frequency: "weekly",
          weekday: s(words.weekday),
          hour: s(words.hour),
          minute: s(words.minute),
        };
      }
      break;
    case "monthly":
      if (offered("monthly")) {
        return {
          ...base,
          frequency: "monthly",
          day: s(words.day),
          hour: s(words.hour),
          minute: s(words.minute),
        };
      }
      break;
    default:
      break;
  }
  const allSelectable = Object.values(parts).every(selectable);
  return { ...base, frequency: "custom", stored: !allSelectable };
}

/** A Custom part's text back into its list and flag: "*", "5", "0,30" or "*\/2". */
function partFields(text: string): { list: string[]; step: boolean } {
  const trimmed = text.trim();
  const step = /^\*\/(\d{1,2})$/.exec(trimmed);
  if (step?.[1] !== undefined) {
    return { list: [step[1]], step: true };
  }
  const list = listOf(trimmed);
  return { list: list.length === 0 ? ["*"] : list, step: false };
}

/** The stored fields as Rsync.set takes them: lists and flags exactly as read. */
export function storedScheduleFields(
  job: StoredJobSchedule,
): JobScheduleFields {
  return {
    minute: listOf(job.minute),
    hour: listOf(job.hour),
    dayofmonth: listOf(job.dayofmonth),
    month: listOf(job.month),
    dayofweek: listOf(job.dayofweek),
    everynminute: job.everynminute === true,
    everynhour: job.everynhour === true,
    everyndayofmonth: job.everyndayofmonth === true,
  };
}

/**
 * What Rsync.set is sent for the form's value. A stored schedule still marked `stored` (no Custom
 * select changed) is sent exactly as it was read, so a schedule set in the classic interface survives
 * a save of the note or email (section 6).
 */
export function scheduleFields(
  value: ScheduleFieldValue,
  stored?: StoredJobSchedule,
): JobScheduleFields {
  if (value.frequency === "custom" && value.stored && stored !== undefined) {
    return storedScheduleFields(stored);
  }
  const fields = (
    minute: string,
    hour: string,
    day: string,
    month: string,
    weekday: string,
  ): JobScheduleFields => {
    const m = partFields(minute);
    const h = partFields(hour);
    const d = partFields(day);
    return {
      minute: m.list,
      hour: h.list,
      dayofmonth: d.list,
      month: partFields(month).list,
      dayofweek: partFields(weekday).list,
      everynminute: m.step,
      everynhour: h.step,
      everyndayofmonth: d.step,
    };
  };
  switch (value.frequency) {
    case "hourly":
      return fields(value.minute, "*", "*", "*", "*");
    case "daily":
      return fields(value.minute, value.hour, "*", "*", "*");
    case "weekly":
      return fields(value.minute, value.hour, "*", "*", value.weekday);
    case "monthly":
      return fields(value.minute, value.hour, value.day, "*", "*");
    case "custom": {
      const c = value.custom;
      return fields(c.minute, c.hour, c.day, c.month, c.weekday);
    }
  }
}

/** Whether two schedules run at the same times (the fields compared as Rsync.set would store them). */
export function sameSchedule(
  a: JobScheduleFields,
  b: JobScheduleFields,
): boolean {
  const list = (l: readonly string[]) =>
    l.map((v) => (/^\d+$/.test(v) ? String(Number(v)) : v)).join(",");
  return (
    list(a.minute) === list(b.minute) &&
    list(a.hour) === list(b.hour) &&
    list(a.dayofmonth) === list(b.dayofmonth) &&
    list(a.month) === list(b.month) &&
    list(a.dayofweek) === list(b.dayofweek) &&
    a.everynminute === b.everynminute &&
    a.everynhour === b.everynhour &&
    a.everyndayofmonth === b.everyndayofmonth
  );
}

/** A new job's schedule (D4): on a schedule, every day at 03:00. */
export const NEW_JOB_SCHEDULE: ScheduleFieldValue = defaultScheduleValue;

// ---- The self-test form on ScheduleField (disks design 6.4) --------------------------------------

/** The frequencies the self-test form offers: no "every hour", and no minutes anywhere. */
export const SELF_TEST_FREQUENCIES: readonly ScheduleFrequency[] = [
  "daily",
  "weekly",
  "monthly",
  "custom",
];

/** A self-test's four parts as the field opens them (minute 0, hours only, no "Only when…"). */
export function selfTestScheduleValue(
  entry: FourPartSchedule,
): ScheduleFieldValue {
  const value = toScheduleValue(
    { ...entry, minute: "0", enable: true },
    { frequencies: SELF_TEST_FREQUENCIES },
  );
  // A value Custom's selects cannot make stays visible as itself (the field shows it in mono).
  return { ...value, stored: false };
}

const pad2 = (value: string): string =>
  /^\d+$/.test(value) ? value.padStart(2, "0") : value;

/** The four stored parts in the stock interface's exact forms: "*", "00"–"23", "01"–"12", "01"–"31", "1"–"7". */
export function selfTestScheduleOf(
  value: ScheduleFieldValue,
): FourPartSchedule {
  const fields = scheduleFields({ ...value, stored: false });
  const text = (list: readonly string[], padded: boolean) =>
    list.map((v) => (padded ? pad2(v) : v)).join(",");
  return {
    hour: text(fields.hour, true),
    month: text(fields.month, true),
    dayofmonth: text(fields.dayofmonth, true),
    dayofweek: text(fields.dayofweek, false),
  };
}
