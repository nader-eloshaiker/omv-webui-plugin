// SPDX-License-Identifier: GPL-3.0-or-later
// A copy job's schedule in words and the form's mapping both ways (phase 5 services design 0.7 and
// section 6), and the self-tests' four-part schedule that moved here from the disks slice.
import { defaultScheduleValue } from "@omv-webui/react-ui-components";
import { describe, expect, it } from "vitest";
import {
  jobParts,
  jobScheduleWords,
  sameSchedule,
  scheduleFields,
  scheduleWords,
  selfTestScheduleOf,
  selfTestScheduleValue,
  storedScheduleFields,
  toScheduleValue,
  type StoredJobSchedule,
} from "./jobSchedule.ts";

/** A job's schedule as Rsync.get returns it (lists), every part "*" unless given. */
const job = (
  over: Partial<StoredJobSchedule> & { enable?: boolean } = {},
): StoredJobSchedule & { enable: boolean } => ({
  enable: true,
  minute: ["*"],
  hour: ["*"],
  dayofmonth: ["*"],
  month: ["*"],
  dayofweek: ["*"],
  everynminute: false,
  everynhour: false,
  everyndayofmonth: false,
  ...over,
});

describe("a job's schedule in words (0.7)", () => {
  it.each([
    [
      "not on a schedule",
      job({ enable: false, minute: ["0"], hour: ["3"] }),
      { kind: "manual" },
    ],
    [
      "every day",
      job({ minute: ["0"], hour: ["3"] }),
      { kind: "daily", hour: 3, minute: 0 },
    ],
    [
      "every week",
      job({ minute: ["30"], hour: ["22"], dayofweek: ["5"] }),
      { kind: "weekly", weekday: 5, hour: 22, minute: 30 },
    ],
    [
      "every week on Sunday as 7",
      job({ minute: ["0"], hour: ["4"], dayofweek: ["7"] }),
      { kind: "weekly", weekday: 7, hour: 4, minute: 0 },
    ],
    [
      "every month",
      job({ minute: ["15"], hour: ["1"], dayofmonth: ["31"] }),
      { kind: "monthly", day: 31, hour: 1, minute: 15 },
    ],
    ["every hour", job({ minute: ["5"] }), { kind: "hourly", minute: 5 }],
    [
      "every N hours",
      job({ minute: ["10"], hour: ["6"], everynhour: true }),
      { kind: "everyNHours", n: 6, minute: 10 },
    ],
    [
      "every N minutes",
      job({ minute: ["15"], everynminute: true }),
      { kind: "everyNMinutes", n: 15 },
    ],
  ])("%s", (_name, stored, words) => {
    expect(jobScheduleWords(stored)).toEqual(words);
  });

  it("reads Rsync.getList's comma-separated text as Rsync.get's lists", () => {
    expect(
      jobScheduleWords({
        ...job(),
        minute: "0",
        hour: "3",
        dayofmonth: "*",
        month: "*",
        dayofweek: "7",
      }),
    ).toEqual({ kind: "weekly", weekday: 7, hour: 3, minute: 0 });
  });

  it("says anything else part by part: several values, a month, every N days, values set elsewhere", () => {
    expect(
      jobScheduleWords(job({ minute: ["0", "30"], hour: ["8", "20"] })),
    ).toEqual({
      kind: "custom",
      parts: {
        minute: { kind: "values", values: [0, 30] },
        hour: { kind: "values", values: [8, 20] },
        day: { kind: "every" },
        month: { kind: "every" },
        weekday: { kind: "every" },
      },
    });
    expect(
      jobScheduleWords(job({ minute: ["0"], hour: ["3"], month: ["6"] })).kind,
    ).toBe("custom");
    expect(
      jobParts(job({ dayofmonth: ["2"], everyndayofmonth: true })).day,
    ).toEqual({ kind: "step", n: 2 });
    expect(jobParts(job({ dayofweek: "1-5" })).weekday).toEqual({
      kind: "raw",
      text: "1-5",
    });
    expect(jobParts(job({ dayofweek: ["0"] })).weekday).toEqual({
      kind: "raw",
      text: "0",
    });
    expect(
      jobScheduleWords(
        job({
          minute: ["0"],
          hour: ["3"],
          dayofmonth: ["1"],
          dayofweek: ["1"],
        }),
      ).kind,
    ).toBe("custom");
  });
});

describe("the form, both ways (section 6)", () => {
  it("opens a stored schedule on the choice it fits", () => {
    expect(toScheduleValue(job({ minute: ["0"], hour: ["3"] }))).toMatchObject({
      mode: "schedule",
      frequency: "daily",
      hour: "3",
      minute: "0",
      stored: false,
    });
    expect(
      toScheduleValue(job({ minute: ["45"], hour: ["2"], dayofweek: ["7"] })),
    ).toMatchObject({
      frequency: "weekly",
      weekday: "7",
      hour: "2",
      minute: "45",
    });
    expect(
      toScheduleValue(job({ minute: ["0"], hour: ["1"], dayofmonth: ["15"] })),
    ).toMatchObject({ frequency: "monthly", day: "15" });
    expect(toScheduleValue(job({ minute: ["20"] }))).toMatchObject({
      frequency: "hourly",
      minute: "20",
    });
    expect(
      toScheduleValue(job({ enable: false, minute: ["0"], hour: ["3"] })),
    ).toMatchObject({ mode: "manual", frequency: "daily" });
  });

  it("opens several values and every N on Custom, kept as stored", () => {
    const multi = toScheduleValue(job({ minute: ["0", "30"], hour: ["3"] }));
    expect(multi).toMatchObject({
      frequency: "custom",
      stored: true,
      custom: { minute: "0,30", hour: "3", day: "*", month: "*", weekday: "*" },
    });
    const everyN = toScheduleValue(
      job({ minute: ["10"], hour: ["6"], everynhour: true }),
    );
    expect(everyN).toMatchObject({
      frequency: "custom",
      stored: true,
      custom: { minute: "10", hour: "*/6" },
    });
    // One value each, but not one of the presets: Custom, and the selects can make it.
    expect(
      toScheduleValue(job({ minute: ["0"], hour: ["3"], month: ["6"] })),
    ).toMatchObject({ frequency: "custom", stored: false });
  });

  it("keeps a stored schedule exactly while no Custom select changed", () => {
    const stored = job({
      minute: ["0", "30"],
      hour: ["6"],
      everynhour: true,
      dayofweek: ["1", "7"],
    });
    const value = toScheduleValue(stored);
    expect(scheduleFields(value, stored)).toEqual(storedScheduleFields(stored));
    // A Custom select changed: the field says so, and the parts are written from the selects.
    const changed = {
      ...value,
      stored: false,
      custom: { ...value.custom, weekday: "3" },
    };
    expect(scheduleFields(changed, stored)).toEqual({
      minute: ["0", "30"],
      hour: ["6"],
      dayofmonth: ["*"],
      month: ["*"],
      dayofweek: ["3"],
      everynminute: false,
      everynhour: true,
      everyndayofmonth: false,
    });
  });

  it("writes each choice as lists of strings with the flags off", () => {
    const base = { ...defaultScheduleValue, minute: "5", hour: "4" };
    expect(scheduleFields({ ...base, frequency: "hourly" })).toEqual({
      minute: ["5"],
      hour: ["*"],
      dayofmonth: ["*"],
      month: ["*"],
      dayofweek: ["*"],
      everynminute: false,
      everynhour: false,
      everyndayofmonth: false,
    });
    expect(scheduleFields({ ...base, frequency: "daily" })).toMatchObject({
      minute: ["5"],
      hour: ["4"],
      dayofweek: ["*"],
    });
    expect(
      scheduleFields({ ...base, frequency: "weekly", weekday: "7" }),
    ).toMatchObject({ dayofweek: ["7"], dayofmonth: ["*"] });
    expect(
      scheduleFields({ ...base, frequency: "monthly", day: "31" }),
    ).toMatchObject({ dayofmonth: ["31"], dayofweek: ["*"] });
  });

  it("round-trips every row of 0.7", () => {
    for (const stored of [
      job({ minute: ["0"], hour: ["3"] }),
      job({ minute: ["30"], hour: ["22"], dayofweek: ["7"] }),
      job({ minute: ["15"], hour: ["1"], dayofmonth: ["28"] }),
      job({ minute: ["5"] }),
      job({ minute: ["10"], hour: ["6"], everynhour: true }),
      job({ minute: ["15"], everynminute: true }),
      job({ minute: ["0", "30"], hour: ["8", "20"], month: ["1", "7"] }),
      job({ minute: ["0"], hour: ["3"], dayofmonth: ["1"], dayofweek: ["1"] }),
    ]) {
      const value = toScheduleValue(stored);
      // Through the field without the "kept" shortcut: the selects' own text writes the same.
      const fields = scheduleFields({ ...value, stored: false });
      expect(sameSchedule(fields, storedScheduleFields(stored))).toBe(true);
    }
  });

  it("compares schedules as stored, not as typed", () => {
    expect(
      sameSchedule(
        storedScheduleFields(job({ minute: ["00"], hour: ["03"] })),
        storedScheduleFields(job({ minute: ["0"], hour: ["3"] })),
      ),
    ).toBe(true);
    expect(
      sameSchedule(
        storedScheduleFields(job({ minute: ["0"], hour: ["3"] })),
        storedScheduleFields(job({ minute: ["0"], hour: ["4"] })),
      ),
    ).toBe(false);
  });
});

// The self-tests' four parts, moved from disks/schedule.ts with their tests.
const fourPart = (
  hour: string,
  month = "*",
  dayofmonth = "*",
  dayofweek = "*",
) => ({ hour, month, dayofmonth, dayofweek });

describe("a self-test's schedule in words (disks design 6.2)", () => {
  it.each([
    [fourPart("03"), { kind: "daily", hour: 3 }],
    [fourPart("03", "*", "*", "7"), { kind: "weekly", weekday: 7, hour: 3 }],
    [fourPart("02", "*", "01"), { kind: "monthly", day: 1, hour: 2 }],
    [
      fourPart("05", "03", "15"),
      { kind: "yearly", month: 3, day: 15, hour: 5 },
    ],
    [fourPart("*"), { kind: "hourly" }],
    [fourPart("*", "*", "*", "6"), { kind: "hourlyOn", weekday: 6 }],
  ])("%o", (stored, words) => {
    expect(scheduleWords(stored)).toEqual(words);
  });

  it("writes anything else part by part, keeping values set elsewhere", () => {
    expect(scheduleWords(fourPart("05", "03", "15", "1"))).toEqual({
      kind: "custom",
      parts: { month: 3, day: 15, weekday: 1, hour: 5 },
    });
    expect(scheduleWords(fourPart("*", "*", "01"))).toEqual({
      kind: "custom",
      parts: { month: null, day: 1, weekday: null, hour: null },
    });
    expect(scheduleWords(fourPart("1,13"))).toEqual({
      kind: "custom",
      parts: { month: null, day: null, weekday: null, hour: { raw: "1,13" } },
    });
  });
});

describe("a self-test on the schedule field (disks design 6.4)", () => {
  it("opens on its preset, with no hourly choice and minutes left at 0", () => {
    expect(selfTestScheduleValue(fourPart("03", "*", "*", "7"))).toMatchObject({
      frequency: "weekly",
      weekday: "7",
      hour: "3",
      minute: "0",
    });
    expect(selfTestScheduleValue(fourPart("*"))).toMatchObject({
      frequency: "custom",
      custom: { hour: "*", month: "*", day: "*", weekday: "*" },
    });
  });

  it("sends the stock interface's exact forms, and round-trips", () => {
    for (const stored of [
      fourPart("03", "*", "*", "7"),
      fourPart("03"),
      fourPart("03", "*", "28"),
      fourPart("*", "12", "31", "5"),
    ]) {
      expect(selfTestScheduleOf(selfTestScheduleValue(stored))).toEqual(stored);
    }
    expect(
      selfTestScheduleOf({
        ...defaultScheduleValue,
        frequency: "monthly",
        day: "9",
        hour: "0",
      }),
    ).toEqual({ hour: "00", month: "*", dayofmonth: "09", dayofweek: "*" });
  });
});
