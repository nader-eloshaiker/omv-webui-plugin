// SPDX-License-Identifier: GPL-3.0-or-later
// Scheduled self-tests in the locale's words (phase 5 disks design 0.1, 6.2): hours as the locale's
// hours and minutes, weekdays and months by name (OMV numbers weekdays 1 Monday to 7 Sunday).
import type { SmartScheduleEntry } from "@omv-webui/react-api-omv/generated";
import { useTranslation } from "react-i18next";
import { isTestType, type TestType } from "../disks/schedule.ts";
import { scheduleWords, type SchedulePart } from "../services/jobSchedule.ts";

/** 03:00 in the browser's locale. */
export const hourText = (hour: number): string =>
  new Date(2024, 0, 1, hour, 0).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

/** 1 Monday to 7 Sunday; 1 January 2024 was a Monday. */
export const weekdayText = (weekday: number): string =>
  new Date(2024, 0, weekday).toLocaleDateString(undefined, {
    weekday: "long",
  });

export const monthText = (month: number): string =>
  new Date(2024, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
  });

export function useScheduleText() {
  const { t } = useTranslation();

  const part = (
    p: SchedulePart,
    every: string,
    named: (n: number) => string,
  ): string => (p === null ? every : typeof p === "number" ? named(p) : p.raw);

  /** "Every Sunday at 03:00" (6.2). */
  const when = (
    job: Pick<
      SmartScheduleEntry,
      "month" | "dayofmonth" | "dayofweek" | "hour"
    >,
  ): string => {
    const words = scheduleWords(job);
    switch (words.kind) {
      case "daily":
        return t("smart.tests.when.daily", { hour: hourText(words.hour) });
      case "weekly":
        return t("smart.tests.when.weekly", {
          weekday: weekdayText(words.weekday),
          hour: hourText(words.hour),
        });
      case "monthly":
        return t("smart.tests.when.monthly", {
          day: words.day,
          hour: hourText(words.hour),
        });
      case "yearly":
        return t("smart.tests.when.yearly", {
          day: words.day,
          month: monthText(words.month),
          hour: hourText(words.hour),
        });
      case "hourly":
        return t("smart.tests.when.hourly");
      case "hourlyOn":
        return t("smart.tests.when.hourlyOn", {
          weekday: weekdayText(words.weekday),
        });
      case "custom": {
        const { parts } = words;
        return t("smart.tests.when.custom", {
          months: part(
            parts.month,
            t("smart.tests.when.everyMonth"),
            monthText,
          ),
          days: part(parts.day, t("smart.tests.when.everyDay"), (day) =>
            t("smart.tests.when.dayN", { day }),
          ),
          weekdays: part(
            parts.weekday,
            t("smart.tests.when.everyWeekday"),
            weekdayText,
          ),
          hours: part(parts.hour, t("smart.tests.when.everyHour"), hourText),
        });
      }
    }
  };

  /** "Short self-test"; a kind a later OMV adds is shown as its letter. */
  const typeName = (type: string): string =>
    isTestType(type) ? t(`smart.tests.type.${type}`) : type;
  /** "short self-test", for sentences. */
  const typeLower = (type: string): string =>
    isTestType(type) ? t(`smart.tests.typeLower.${type}`) : type;

  /** "Short self-test, every Sunday at 03:00" (4.5, column 5). */
  const summary = (
    job: Pick<
      SmartScheduleEntry,
      "type" | "month" | "dayofmonth" | "dayofweek" | "hour"
    >,
  ): string => {
    const words = when(job);
    return t("smart.tests.summary", {
      type: typeName(job.type),
      // The sentence's own capital goes inside the summary.
      when: words.charAt(0).toLocaleLowerCase() + words.slice(1),
    });
  };

  return { when, typeName, typeLower, summary };
}

export type { TestType };
