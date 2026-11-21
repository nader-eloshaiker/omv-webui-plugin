// SPDX-License-Identifier: GPL-3.0-or-later
// Flow D's plan (phase 5 disks design 7.3 to 7.5), rule by rule.
import type {
  SmartDevice,
  SmartSettings,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TESTS,
  diskOffer,
  hourName,
  parseLimit,
  powermodeFor,
  scheduleOf,
  settingsToSave,
  settingsUnchanged,
  setUpPlan,
  sleepStartsTicked,
  tickedByDefault,
  weekdayName,
  type SetUpChoices,
} from "./setupPlan.ts";

const device = (
  name: string,
  over: Partial<SmartDevice> = {},
): SmartDevice => ({
  devicename: name,
  canonicaldevicefile: `/dev/${name}`,
  devicefile: `/dev/disk/by-id/ata-Example_${name}`,
  devicelinks: [`/dev/disk/by-id/ata-Example_${name}`],
  model: "Example HDD 4TB",
  size: "4000787030016",
  temperature: "34",
  description: "",
  vendor: "ATA",
  serialnumber: `EXAMPLE-SERIAL-${name}`,
  wwn: "",
  overallstatus: "GOOD",
  uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
  monitor: false,
  _used: false,
  ...over,
});

const factory: SmartSettings = {
  enable: false,
  interval: 1800,
  powermode: "never",
  tempdiff: 0,
  tempmax: 0,
};

const choices = (over: Partial<SetUpChoices> = {}): SetUpChoices => ({
  disks: [],
  ...DEFAULT_TESTS,
  sleep: true,
  temp: false,
  tempLimit: 55,
  ...over,
});

describe("sleeping disks (7.3 C)", () => {
  it.each([
    ["never", true, "standby", "never"],
    ["sleep", false, "standby", "sleep"],
    ["standby", true, "standby", "never"],
    ["idle", true, "idle", "never"],
  ] as const)(
    "saved %s starts ticked=%s, saves %s ticked and %s unticked",
    (saved, starts, ticked, unticked) => {
      expect(sleepStartsTicked(saved)).toBe(starts);
      expect(powermodeFor(saved, true)).toBe(ticked);
      expect(powermodeFor(saved, false)).toBe(unticked);
    },
  );
});

describe("step 1's settings", () => {
  it("turns monitoring on, keeps the read interval and tempdiff, and sets the limit", () => {
    const saved = { ...factory, interval: 900, tempdiff: 3 };
    expect(
      settingsToSave(saved, { sleep: true, temp: true, tempLimit: 55 }),
    ).toEqual({
      enable: true,
      interval: 900,
      powermode: "standby",
      tempdiff: 3,
      tempmax: 55,
    });
    expect(
      settingsToSave(saved, { sleep: false, temp: false, tempLimit: 55 })
        .tempmax,
    ).toBe(0);
  });

  it("is skipped when it would write what is saved", () => {
    const saved: SmartSettings = {
      enable: true,
      interval: 1800,
      powermode: "standby",
      tempdiff: 0,
      tempmax: 50,
    };
    const next = settingsToSave(saved, {
      sleep: true,
      temp: true,
      tempLimit: 50,
    });
    expect(settingsUnchanged(saved, next)).toBe(true);
    expect(settingsUnchanged(saved, { ...next, tempmax: 55 })).toBe(false);
    expect(settingsUnchanged(factory, settingsToSave(factory, choices()))).toBe(
      false,
    );
  });
});

describe("the disks offered (7.3 A)", () => {
  it("offers unwatched disks of the check, names watched ones, and lists disks without readings", () => {
    const offer = diskOffer(
      [
        device("sdb"),
        device("sda", { monitor: true }),
        device("sdc", { overallstatus: "BAD_STATUS" }),
      ],
      [
        { canonicaldevicefile: "/dev/sda", isreadonly: false },
        { canonicaldevicefile: "/dev/sdb", isreadonly: false },
        { canonicaldevicefile: "/dev/sdc", isreadonly: false },
        { canonicaldevicefile: "/dev/sdf", isreadonly: false },
        { canonicaldevicefile: "/dev/sr0", isreadonly: true },
      ],
    );
    expect(offer.offered.map((d) => d.canonicaldevicefile)).toEqual([
      "/dev/sdb",
      "/dev/sdc",
    ]);
    expect(offer.watched.map((d) => d.canonicaldevicefile)).toEqual([
      "/dev/sda",
    ]);
    expect(offer.notListed).toEqual(["/dev/sdf"]);
    expect(
      tickedByDefault(device("sdc", { overallstatus: "BAD_STATUS" })),
    ).toBe(false);
    expect(
      tickedByDefault(device("sdc", { overallstatus: "BAD_SECTOR" })),
    ).toBe(true);
  });
});

describe("the schedule", () => {
  it("uses the stock interface's exact forms", () => {
    expect(scheduleOf("S", choices())).toEqual({
      type: "S",
      hour: "03",
      month: "*",
      dayofmonth: "*",
      dayofweek: "7",
    });
    expect(scheduleOf("L", choices({ longDay: 9, longHour: 23 }))).toEqual({
      type: "L",
      hour: "23",
      month: "*",
      dayofmonth: "09",
      dayofweek: "*",
    });
  });

  it.each([
    ["55", 55],
    [" 1 ", 1],
    ["100", 100],
    ["0", null],
    ["101", null],
    ["5.5", null],
    ["", null],
  ])("reads the limit %s as %s", (text, value) => {
    expect(parseLimit(text)).toBe(value);
  });
});

describe("the plan (7.5)", () => {
  const check = [
    device("sdc"),
    device("sda", {
      monitor: true,
      uuid: "00000000-0000-4000-8000-000000000601",
    }),
    device("sdb"),
    device("sdd", { monitor: true }),
  ];
  const schedule = [{ devicefile: "/dev/sda" }, { devicefile: "/dev/sda" }];

  it("orders global, watches, tests by disk and kind, apply, verify", () => {
    const plan = setUpPlan(
      choices({ disks: ["/dev/sdb", "/dev/sdc"], tests: "both" }),
      { settings: factory, check, schedule },
    );
    expect(plan.steps.map((s) => s.id)).toEqual([
      "global",
      "watch:/dev/sdb",
      "watch:/dev/sdc",
      "test:S:/dev/sdb",
      "test:L:/dev/sdb",
      "test:S:/dev/sdc",
      "test:L:/dev/sdc",
      "test:S:/dev/sdd",
      "test:L:/dev/sdd",
      "apply",
      "verify",
    ]);
    expect(plan.keeps).toEqual([{ device: "/dev/sda", count: 2 }]);
    expect(plan.testDisks.map((d) => d.devicename)).toEqual([
      "sdb",
      "sdc",
      "sdd",
    ]);
    expect(plan.steps[0]).toEqual({
      id: "global",
      kind: "global",
      wasOn: false,
    });
  });

  it("adds no test step and keeps nothing when no test is chosen", () => {
    const plan = setUpPlan(choices({ disks: ["/dev/sdb"], tests: "none" }), {
      settings: factory,
      check,
      schedule,
    });
    expect(plan.steps.map((s) => s.id)).toEqual([
      "global",
      "watch:/dev/sdb",
      "apply",
      "verify",
    ]);
    expect(plan.keeps).toEqual([]);
  });

  it("never watches a disk that is not offered, even if named", () => {
    const plan = setUpPlan(choices({ disks: ["/dev/sda", "/dev/zz"] }), {
      settings: factory,
      check,
      schedule,
    });
    expect(plan.watch).toEqual([]);
  });
});

describe("schedule words", () => {
  it("names OMV's weekdays and hours in the locale", () => {
    expect(weekdayName(1, "en-GB")).toBe("Monday");
    expect(weekdayName(7, "en-GB")).toBe("Sunday");
    expect(hourName(3, "en-GB")).toBe("03:00");
    expect(hourName(23, "en-GB")).toBe("23:00");
  });
});
