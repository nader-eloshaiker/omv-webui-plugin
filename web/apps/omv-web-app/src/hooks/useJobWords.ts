// SPDX-License-Identifier: GPL-3.0-or-later
// A copy job in the locale's words (phase 5 services design 0.2, 0.7): its name, its schedule, and the
// plain-text names of its sides for titles, toasts and accessible names. Times are the NAS's clock;
// when the browser's time zone differs from the NAS's, "(NAS time)" follows the time (D16).
import type {
  RsyncJob,
  RsyncJobRow,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { useTranslation } from "react-i18next";
import { remoteWords, sidesOf, type Side } from "../services/jobModel.ts";
import { jobName } from "../services/jobName.ts";
import {
  jobScheduleWords,
  type JobPart,
  type StoredJobSchedule,
} from "../services/jobSchedule.ts";
import { monthText, weekdayText } from "./useSmartWords.ts";

/** 03:00 in the browser's locale. */
export const timeText = (hour: number, minute: number): string =>
  new Date(2024, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

/** The browser's own time zone, as the browser names it. */
const browserZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

/** Whether "(NAS time)" is said: the NAS's zone is known and is not the browser's. */
export const differsFromNas = (nasZone: string | undefined): boolean =>
  nasZone !== undefined && nasZone !== "" && nasZone !== browserZone();

export function useJobWords(nasZone?: string) {
  const { t } = useTranslation();
  const nas = differsFromNas(nasZone);
  const at = (hour: number, minute: number) => timeText(hour, minute);
  const withZone = (when: string) =>
    nas ? t("jobs.when.nasTime", { when }) : when;

  const part = (
    p: JobPart,
    every: string,
    named: (n: number) => string,
  ): string => {
    switch (p.kind) {
      case "every":
        return every;
      case "values":
        return p.values.map(named).join(", ");
      case "step":
        return t("jobs.when.everyN", { n: p.n });
      case "raw":
        return p.text;
    }
  };

  /** "Every day at 03:00" (0.7). */
  const when = (job: StoredJobSchedule & { enable: boolean }): string => {
    const words = jobScheduleWords(job);
    switch (words.kind) {
      case "manual":
        return t("jobs.when.manual");
      case "daily":
        return withZone(
          t("jobs.when.daily", { time: at(words.hour, words.minute) }),
        );
      case "weekly":
        return withZone(
          t("jobs.when.weekly", {
            weekday: weekdayText(words.weekday),
            time: at(words.hour, words.minute),
          }),
        );
      case "monthly":
        return withZone(
          t("jobs.when.monthly", {
            day: words.day,
            time: at(words.hour, words.minute),
          }),
        );
      case "hourly":
        return t("jobs.when.hourly", { minute: words.minute });
      case "everyNHours":
        return t("jobs.when.everyNHours", { n: words.n, minute: words.minute });
      case "everyNMinutes":
        return t("jobs.when.everyNMinutes", { n: words.n });
      case "custom": {
        const { parts } = words;
        const common = {
          months: part(parts.month, t("jobs.when.everyMonth"), monthText),
          days: part(parts.day, t("jobs.when.everyDay"), (day) =>
            t("jobs.when.dayN", { day }),
          ),
          weekdays: part(
            parts.weekday,
            t("jobs.when.everyWeekday"),
            weekdayText,
          ),
          hours: part(parts.hour, t("jobs.when.everyHour"), (h) =>
            timeText(h, 0),
          ),
        };
        return withZone(
          parts.minute.kind === "every"
            ? t("jobs.when.customEveryMinute", common)
            : t("jobs.when.custom", {
                ...common,
                minutes: part(parts.minute, "", String),
              }),
        );
      }
    }
  };

  /** The line under "Every N minutes" (0.7), or null. */
  const whenNote = (job: StoredJobSchedule & { enable: boolean }) =>
    jobScheduleWords(job).kind === "everyNMinutes"
      ? t("jobs.when.everyNMinutesNote")
      : null;

  /** A side as plain text: the folder's name, or "{{path}} on {{host}}", or the address as stored. */
  const sideText = (
    side: Side,
    folders: readonly SharedFolder[] | undefined,
  ) => {
    if (side.kind === "folder") {
      const folder = folders?.find((f) => f.uuid === side.uuid);
      return folder?.name ?? t("job.folderGone");
    }
    const words = remoteWords(side.uri);
    return words === null
      ? side.uri
      : t("jobs.remoteText", { path: words.path, host: words.host });
  };

  const auto = (src: string, dest: string) =>
    t("jobs.name.auto", { src, dest });

  /**
   * A list row's name: its note, or "{{src}} to {{dest}}" (0.2), another computer's side said as
   * "{{path}} on {{host}}" rather than its stored address.
   */
  const rowName = (
    row: Pick<
      RsyncJobRow,
      "comment" | "srcname" | "destname" | "type" | "mode" | "src" | "dest"
    >,
  ) => {
    const sides = sidesOf(row);
    const named = (side: Side | undefined, stored: string) =>
      side?.kind === "remote" ? sideText(side, undefined) : stored;
    return jobName(
      {
        comment: row.comment ?? "",
        srcname: named(sides?.from, row.srcname),
        destname: named(sides?.to, row.destname),
      },
      auto,
    );
  };

  /** A stored job's name, its sides named from the folder list. */
  const name = (
    job: Pick<RsyncJob, "comment" | "type" | "mode" | "src" | "dest">,
    folders: readonly SharedFolder[] | undefined,
  ): string => {
    const sides = sidesOf(job);
    return jobName(
      {
        comment: job.comment ?? "",
        srcname: sides === null ? "" : sideText(sides.from, folders),
        destname: sides === null ? "" : sideText(sides.to, folders),
      },
      auto,
    );
  };

  return { when, whenNote, sideText, rowName, name, auto };
}
