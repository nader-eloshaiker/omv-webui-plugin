// SPDX-License-Identifier: GPL-3.0-or-later
// Scheduled self-tests: the add/edit form's mapping (phase 5 disks design 6.4) and whether a test
// runs (6.3). The schedule in words is tested with services/jobSchedule.ts, where it moved.
import { describe, expect, it } from "vitest";
import {
  blocksSave,
  draftProblems,
  isConnected,
  NEW_DRAFT,
  runsWord,
  scheduleOf,
  toTestDraft,
  type TestDraft,
} from "./schedule.ts";

const job = (hour: string, month = "*", dayofmonth = "*", dayofweek = "*") => ({
  hour,
  month,
  dayofmonth,
  dayofweek,
});

const entry = (
  over: Partial<{
    type: string;
    hour: string;
    month: string;
    dayofmonth: string;
    dayofweek: string;
    enable: boolean;
    comment: string;
  }> = {},
) => ({
  type: "S",
  enable: true,
  comment: "",
  ...job("03", "*", "*", "7"),
  ...over,
});

describe("the form", () => {
  it("opens a stored test on its preset when it fits one", () => {
    expect(toTestDraft(entry())).toMatchObject({
      often: "weekly",
      weekday: "7",
      hour: "3",
    });
    expect(toTestDraft(entry({ dayofweek: "*" }))).toMatchObject({
      often: "daily",
      hour: "3",
    });
    expect(
      toTestDraft(entry({ dayofweek: "*", dayofmonth: "01", type: "L" })),
    ).toMatchObject({ often: "monthly", day: "1", type: "L" });
  });

  it("opens anything else on Custom, with the stored parts", () => {
    expect(
      toTestDraft(entry({ month: "03", dayofmonth: "15", dayofweek: "1" })),
    ).toMatchObject({
      often: "custom",
      custom: { month: "3", day: "15", weekday: "1", hour: "3" },
    });
  });

  it("sends the stock interface's exact forms", () => {
    const d = (over: Partial<TestDraft>): TestDraft => ({
      ...NEW_DRAFT,
      ...over,
    });
    expect(scheduleOf(d({ often: "daily", hour: "3" }))).toEqual({
      hour: "03",
      month: "*",
      dayofmonth: "*",
      dayofweek: "*",
    });
    expect(
      scheduleOf(d({ often: "weekly", weekday: "7", hour: "23" })),
    ).toEqual({ hour: "23", month: "*", dayofmonth: "*", dayofweek: "7" });
    expect(scheduleOf(d({ often: "monthly", day: "9", hour: "0" }))).toEqual({
      hour: "00",
      month: "*",
      dayofmonth: "09",
      dayofweek: "*",
    });
    expect(
      scheduleOf(
        d({
          often: "custom",
          custom: { month: "3", day: "*", weekday: "1", hour: "*" },
        }),
      ),
    ).toEqual({ hour: "*", month: "03", dayofmonth: "*", dayofweek: "1" });
  });

  it("round-trips a stored schedule", () => {
    for (const stored of [
      entry(),
      entry({ dayofweek: "*" }),
      entry({ dayofweek: "*", dayofmonth: "28" }),
      entry({ month: "12", dayofmonth: "31", dayofweek: "5", hour: "*" }),
    ]) {
      const { hour, month, dayofmonth, dayofweek } = stored;
      expect(scheduleOf(toTestDraft(stored))).toEqual({
        hour,
        month,
        dayofmonth,
        dayofweek,
      });
    }
  });

  it("refuses a long test every hour, a long note and a value no select offers", () => {
    const long = { ...NEW_DRAFT, type: "L" as const };
    expect(
      draftProblems({
        ...long,
        often: "custom",
        custom: { month: "*", day: "*", weekday: "*", hour: "*" },
      }).longHourly,
    ).toBe(true);
    expect(draftProblems({ ...long, often: "daily" })).toMatchObject({
      longHourly: false,
      longDaily: true,
    });
    expect(blocksSave(draftProblems({ ...long, often: "daily" }))).toBe(false);
    expect(
      draftProblems({ ...NEW_DRAFT, comment: "x".repeat(201) }).noteTooLong,
    ).toBe(true);
    expect(
      draftProblems({ ...NEW_DRAFT, comment: "x".repeat(200) }).noteTooLong,
    ).toBe(false);
    const odd = toTestDraft(entry({ hour: "1,13" }));
    expect(draftProblems(odd).oddValue).toBe("1,13");
    expect(blocksSave(draftProblems(odd))).toBe(true);
    expect(blocksSave(draftProblems(NEW_DRAFT))).toBe(false);
  });
});

describe("runsWord", () => {
  const base = { enable: true, connected: true, watched: true, globalOn: true };
  it.each([
    [base, "yes"],
    [{ ...base, enable: false, watched: false, globalOn: false }, "off"],
    [{ ...base, watched: false, globalOn: false }, "notWatched"],
    [{ ...base, globalOn: false }, "globalOff"],
    [{ ...base, connected: false, watched: undefined }, "notConnected"],
    [
      { ...base, connected: false, watched: undefined, globalOn: false },
      "globalOff",
    ],
    [{ ...base, watched: undefined }, "yes"],
  ] as const)("%o is %s", (input, word) => {
    expect(runsWord(input)).toBe(word);
  });
  it("finds a disconnected test's disk by its empty device and size", () => {
    expect(isConnected({ devicefile: "/dev/sda", size: "1" })).toBe(true);
    expect(isConnected({ devicefile: "", size: "-1" })).toBe(false);
  });
});

describe("the form on the library's schedule field", () => {
  it("round-trips each preset and Custom through the field's value", async () => {
    const { fromScheduleValue, toScheduleValue } =
      await import("./schedule.ts");
    for (const stored of [
      entry(),
      entry({ dayofweek: "*" }),
      entry({ dayofweek: "*", dayofmonth: "28" }),
      entry({ month: "12", dayofmonth: "31", dayofweek: "5", hour: "*" }),
    ]) {
      const draft = toTestDraft(stored);
      const value = toScheduleValue(draft);
      expect(value).toMatchObject({
        mode: "schedule",
        minute: "0",
        stored: false,
      });
      expect(fromScheduleValue(value, draft)).toEqual(draft);
    }
  });
});
