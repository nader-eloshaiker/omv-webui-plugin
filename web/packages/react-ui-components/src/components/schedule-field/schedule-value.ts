// SPDX-License-Identifier: GPL-3.0-or-later
// The value `ScheduleField` holds, apart from the component so the constants can be shared.

/** How often a schedule runs; `custom` is the five cron-like parts. */
export type ScheduleFrequency =
  "hourly" | "daily" | "weekly" | "monthly" | "custom";

/** Every frequency, in the order the How often list offers them. */
export const SCHEDULE_FREQUENCIES: readonly ScheduleFrequency[] = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "custom",
];

/**
 * Custom's five parts. Each is `"*"` (every) or a number's digits, never zero-padded; anything else
 * (a stored `"0,30"` or `"*\/2"`) is shown as itself, in the mono face of `Identifier`, until changed.
 */
export interface ScheduleCustomParts {
  minute: string;
  hour: string;
  /** Day of the month, `"1"` to `"31"`. */
  day: string;
  /** `"1"` (January) to `"12"`. */
  month: string;
  /** `"1"` (Monday) to `"7"` (Sunday). */
  weekday: string;
}

/**
 * The field's value: plain, serialisable, held by the caller, which maps it to and from what it
 * stores (phase 5 services design 0.7; the disks slice's self-test form). Numbers are digit strings,
 * never zero-padded.
 *
 * - `mode`: `"manual"` runs only when started; the schedule's parts are kept for when it is put back
 *   on a schedule.
 * - `frequency` picks which of the parts apply: `hourly` uses `minute`; `daily` `hour` and `minute`;
 *   `weekly` adds `weekday`; `monthly` adds `day`; `custom` uses `custom` only.
 * - `stored`: `true` while `custom` holds a schedule set elsewhere that the selects cannot make
 *   (several values, "every N"). The field shows `storedNote` on Custom and sets it `false` as soon
 *   as a Custom select is changed, so the caller knows to keep its stored value only while it is
 *   still `true`.
 */
export interface ScheduleFieldValue {
  mode: "manual" | "schedule";
  frequency: ScheduleFrequency;
  /** `"0"` to `"59"`. */
  minute: string;
  /** `"0"` to `"23"`. */
  hour: string;
  /** `"1"` (Monday) to `"7"` (Sunday). */
  weekday: string;
  /** `"1"` to `"31"`. */
  day: string;
  custom: ScheduleCustomParts;
  stored: boolean;
}

/** A new schedule as design 0.7 sets it: on a schedule, every day at 03:00. */
export const defaultScheduleValue: ScheduleFieldValue = {
  mode: "schedule",
  frequency: "daily",
  minute: "0",
  hour: "3",
  weekday: "1",
  day: "1",
  custom: { minute: "0", hour: "3", day: "*", month: "*", weekday: "*" },
  stored: false,
};
