// SPDX-License-Identifier: GPL-3.0-or-later
// Flow D, "Set up disk monitoring" (phase 5 disks design 7): from the reader's choices and what the
// interface has read, the disks offered, the settings to save, which disks get a self-test, and the
// ordered steps of the run (7.5). Pure, so each rule is tested by itself; the page renders the result
// and makes the calls.
import type {
  DiskDevice,
  EmailNotificationSettings,
  SmartDevice,
  SmartScheduleEntry,
  SmartSetScheduledTestRequest,
  SmartSetSettingsRequest,
  SmartSetSettingsRequestPowermode,
  SmartSettings,
} from "@omv-webui/react-api-omv/generated";
import { naturalCompare } from "../format/format.ts";

export type TestChoice = "short" | "long" | "both" | "none";

export interface SetUpChoices {
  /** The disks to watch, by canonical device file ("/dev/sdb"). */
  disks: readonly string[];
  tests: TestChoice;
  /** OMV's weekday number of the weekly short test: 1 Monday to 7 Sunday. */
  shortWeekday: number;
  /** The hour of the weekly short test, 0 to 23. */
  shortHour: number;
  /** The day of the month of the monthly long test, 1 to 28. */
  longDay: number;
  longHour: number;
  /** "Let sleeping disks sleep". */
  sleep: boolean;
  /** "Warn me when a disk gets too hot", and at how many °C. */
  temp: boolean;
  tempLimit: number;
}

/** D9: a short test every Sunday at 03:00; the long one on day 1 at 03:00. */
export const DEFAULT_TESTS = {
  tests: "short",
  shortWeekday: 7,
  shortHour: 3,
  longDay: 1,
  longHour: 3,
} as const satisfies Partial<SetUpChoices>;

/** "Warn at" starts at 55 °C unless a limit is saved (7.3 D). */
export const DEFAULT_TEMP_LIMIT = 55;

// ---- C. Sleeping disks (7.3, the exact table) ----------------------------------------------------

/** Whether "Let sleeping disks sleep" starts ticked for the saved `powermode`. */
export const sleepStartsTicked = (powermode: string): boolean =>
  powermode !== "sleep";

/** What the checkbox saves: a gentler saved choice is kept (D8), otherwise standby or never. */
export function powermodeFor(
  saved: string,
  ticked: boolean,
): SmartSetSettingsRequestPowermode {
  if (ticked) {
    return saved === "idle" ? "idle" : "standby";
  }
  return saved === "sleep" ? "sleep" : "never";
}

/** Whether a powermode skips checks of sleeping disks (for the summary's words). */
export const skipsSleeping = (powermode: string): boolean =>
  powermode === "standby" || powermode === "idle";

// ---- Step 1: the NAS-wide settings ---------------------------------------------------------------

/** Step 1's write: monitoring on, the chosen powermode and limit, the read interval and tempdiff. */
export function settingsToSave(
  saved: SmartSettings,
  choices: Pick<SetUpChoices, "sleep" | "temp" | "tempLimit">,
): SmartSetSettingsRequest {
  return {
    enable: true,
    interval: saved.interval,
    powermode: powermodeFor(saved.powermode, choices.sleep),
    tempdiff: saved.tempdiff,
    tempmax: choices.temp ? choices.tempLimit : 0,
  };
}

/** Step 1 is skipped ("Already as chosen") when it would write what is saved. */
export const settingsUnchanged = (
  saved: SmartSettings,
  next: SmartSetSettingsRequest,
): boolean =>
  saved.enable === next.enable &&
  saved.interval === next.interval &&
  saved.powermode === next.powermode &&
  saved.tempdiff === next.tempdiff &&
  saved.tempmax === next.tempmax;

// ---- A. Which disks ------------------------------------------------------------------------------

const byDevice = (
  a: { canonicaldevicefile: string },
  b: { canonicaldevicefile: string },
) => naturalCompare(a.canonicaldevicefile, b.canonicaldevicefile);

export interface DiskOffer {
  /** Disks in the check that are not watched yet: offered, in device order. */
  offered: SmartDevice[];
  /** Disks in the check that are watched already. */
  watched: SmartDevice[];
  /** Disks of DiskMgmt.getList the check did not list (no health readings); read-only ones left out. */
  notListed: string[];
}

/** 7.3 A: the disks of the session's check, split into offered and already watched (D7). */
export function diskOffer(
  check: readonly SmartDevice[],
  disks: readonly Pick<DiskDevice, "canonicaldevicefile" | "isreadonly">[],
): DiskOffer {
  const inCheck = new Set(check.map((d) => d.canonicaldevicefile));
  return {
    offered: check.filter((d) => !d.monitor).sort(byDevice),
    watched: check.filter((d) => d.monitor).sort(byDevice),
    notListed: disks
      .filter((d) => !d.isreadonly && !inCheck.has(d.canonicaldevicefile))
      .map((d) => d.canonicaldevicefile)
      .sort(naturalCompare),
  };
}

/** Ticked by default, except a disk whose health could not be read (7.3 A). */
export const tickedByDefault = (disk: Pick<SmartDevice, "overallstatus">) =>
  disk.overallstatus !== "BAD_STATUS";

// ---- B. Self-tests -------------------------------------------------------------------------------

type DiskNames = Pick<
  SmartDevice,
  "canonicaldevicefile" | "devicefile" | "devicelinks"
>;

/** The scheduled tests of a disk: Smart.getScheduleList names the disk by its canonical file. */
export function testsOf(
  disk: DiskNames,
  schedule: readonly Pick<SmartScheduleEntry, "devicefile">[],
): number {
  const names = new Set(
    [disk.canonicaldevicefile, disk.devicefile, ...disk.devicelinks].filter(
      (n) => n !== "",
    ),
  );
  return schedule.filter((e) => names.has(e.devicefile)).length;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export type TestSchedule = Pick<
  SmartSetScheduledTestRequest,
  "type" | "hour" | "month" | "dayofmonth" | "dayofweek"
>;

/** The schedule in the exact forms the stock interface sends (6.4). */
export function scheduleOf(
  kind: "S" | "L",
  choices: SetUpChoices,
): TestSchedule {
  return kind === "S"
    ? {
        type: "S",
        hour: pad2(choices.shortHour),
        month: "*",
        dayofmonth: "*",
        dayofweek: String(choices.shortWeekday),
      }
    : {
        type: "L",
        hour: pad2(choices.longHour),
        month: "*",
        dayofmonth: pad2(choices.longDay),
        dayofweek: "*",
      };
}

export const kindsOf = (tests: TestChoice): ("S" | "L")[] =>
  tests === "short"
    ? ["S"]
    : tests === "long"
      ? ["L"]
      : tests === "both"
        ? ["S", "L"]
        : [];

// ---- The plan ------------------------------------------------------------------------------------

export type PlanStep =
  | { id: "global"; kind: "global"; wasOn: boolean }
  | { id: string; kind: "watch"; disk: SmartDevice }
  | { id: string; kind: "test"; test: "S" | "L"; disk: SmartDevice }
  | { id: "apply"; kind: "apply" }
  | { id: "verify"; kind: "verify" };

export interface SetUpPlan {
  /** Step 1's write. */
  settings: SmartSetSettingsRequest;
  /** Step 1 writes nothing new ("Already as chosen"). */
  settingsUnchanged: boolean;
  /** The disks to watch, in device order. */
  watch: SmartDevice[];
  /** The disks that get the chosen tests: the watched ones (new or already) with no test yet. */
  testDisks: SmartDevice[];
  /** Disks to watch or already watched that keep the tests they have, with how many. */
  keeps: { device: string; count: number }[];
  steps: PlanStep[];
}

export function setUpPlan(
  choices: SetUpChoices,
  reads: {
    settings: SmartSettings;
    check: readonly SmartDevice[];
    schedule: readonly Pick<SmartScheduleEntry, "devicefile">[];
  },
): SetUpPlan {
  const settings = settingsToSave(reads.settings, choices);
  const chosen = new Set(choices.disks);
  const watch = reads.check
    .filter((d) => !d.monitor && chosen.has(d.canonicaldevicefile))
    .sort(byDevice);
  const covered = [...watch, ...reads.check.filter((d) => d.monitor)].sort(
    byDevice,
  );
  const keeps: SetUpPlan["keeps"] = [];
  const testDisks: SmartDevice[] = [];
  for (const disk of covered) {
    const count = testsOf(disk, reads.schedule);
    if (count > 0) {
      keeps.push({ device: disk.canonicaldevicefile, count });
    } else {
      testDisks.push(disk);
    }
  }
  const kinds = kindsOf(choices.tests);
  const steps: PlanStep[] = [
    { id: "global", kind: "global", wasOn: reads.settings.enable },
    ...watch.map((disk): PlanStep => ({
      id: `watch:${disk.canonicaldevicefile}`,
      kind: "watch",
      disk,
    })),
    ...testDisks.flatMap((disk) =>
      kinds.map((test): PlanStep => ({
        id: `test:${test}:${disk.canonicaldevicefile}`,
        kind: "test",
        test,
        disk,
      })),
    ),
    { id: "apply", kind: "apply" },
    { id: "verify", kind: "verify" },
  ];
  return {
    settings,
    settingsUnchanged: settingsUnchanged(reads.settings, settings),
    watch,
    testDisks: kinds.length > 0 ? testDisks : [],
    keeps: kinds.length > 0 ? keeps : [],
    steps,
  };
}

/** The "Warn at" text as a limit: a whole number from 1 to 100, else null (the form refuses it). */
export function parseLimit(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,3}$/.test(value)) {
    return null;
  }
  const n = Number(value);
  return n >= 1 && n <= 100 ? n : null;
}

// ---- Words for the schedule, in the browser's locale (0.1) -----------------------------------------

/** OMV's weekday number (1 Monday to 7 Sunday) as the locale's long name: "Sunday". */
export function weekdayName(weekday: number, locale?: string): string {
  // 1 January 2024 was a Monday.
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, weekday)));
}

/** An hour as the locale's hours and minutes, minutes always 00: "03:00". */
export function hourName(hour: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, 1, hour)));
}

/** Email is set up when it is on and has an address to send to (4.4). */
export const emailConfigured = (
  email: Pick<EmailNotificationSettings, "enable" | "primaryemail"> | undefined,
): boolean =>
  email !== undefined && email.enable && email.primaryemail.trim() !== "";

// ---- The form ------------------------------------------------------------------------------------

/** What the form holds while the reader decides. */
export interface SetUpDraft {
  /** Ticks the reader changed, by canonical device file; others follow the default. */
  ticks: Readonly<Record<string, boolean>>;
  tests: TestChoice;
  shortWeekday: number;
  shortHour: number;
  longDay: number;
  longHour: number;
  sleep: boolean;
  temp: boolean;
  tempText: string;
}

export function isTicked(
  draft: SetUpDraft,
  disk: Pick<SmartDevice, "canonicaldevicefile" | "overallstatus">,
): boolean {
  return draft.ticks[disk.canonicaldevicefile] ?? tickedByDefault(disk);
}

/** The form's choices, once Continue is pressed and the limit has been checked. */
export function choicesOf(
  draft: SetUpDraft,
  offer: DiskOffer,
  tempLimit: number,
): SetUpChoices {
  return {
    disks: offer.offered
      .filter((d) => isTicked(draft, d))
      .map((d) => d.canonicaldevicefile),
    tests: draft.tests,
    shortWeekday: draft.shortWeekday,
    shortHour: draft.shortHour,
    longDay: draft.longDay,
    longHour: draft.longHour,
    sleep: draft.sleep,
    temp: draft.temp,
    tempLimit,
  };
}

/** The form's starting state for what is saved (7.3 B to D). */
export function initialDraft(settings: SmartSettings): SetUpDraft {
  return {
    ticks: {},
    ...DEFAULT_TESTS,
    sleep: sleepStartsTicked(settings.powermode),
    temp: settings.tempmax > 0,
    tempText: String(
      settings.tempmax > 0 ? settings.tempmax : DEFAULT_TEMP_LIMIT,
    ),
  };
}
