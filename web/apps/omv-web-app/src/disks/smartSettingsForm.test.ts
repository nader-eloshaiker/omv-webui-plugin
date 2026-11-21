// SPDX-License-Identifier: GPL-3.0-or-later
// The disk health settings form's rules (phase 5 disks design 5.2, 5.3).
import { describe, expect, it } from "vitest";
import {
  fromSettingsDraft,
  intervalIsOdd,
  settingsDirty,
  settingsProblems,
  toSettingsDraft,
  wholeMinutes,
} from "./smartSettingsForm.ts";

const factory = {
  enable: false,
  interval: 1800,
  powermode: "never",
  tempdiff: 0,
  tempmax: 0,
};

describe("the disk health settings form", () => {
  it("shows the interval in whole minutes, rounding a value set elsewhere", () => {
    expect(wholeMinutes(1800)).toBe(30);
    expect(wholeMinutes(45)).toBe(1);
    expect(wholeMinutes(10)).toBe(1);
    expect(wholeMinutes(150)).toBe(3);
    expect(intervalIsOdd(45)).toBe(true);
    expect(intervalIsOdd(1800)).toBe(false);
  });

  it("starts from what is saved, with the temperature fields off at 0", () => {
    expect(toSettingsDraft(factory)).toEqual({
      enable: false,
      minutes: "30",
      powermode: "never",
      tempWarn: false,
      tempAt: "55",
      tempDiffOn: false,
      tempDiffAt: "2",
    });
    expect(
      toSettingsDraft({ ...factory, tempmax: 50, powermode: "standby" }),
    ).toMatchObject({ tempWarn: true, tempAt: "50", powermode: "standby" });
  });

  it("sends all five fields, 0 for a temperature that is off", () => {
    const draft = { ...toSettingsDraft(factory), enable: true, minutes: "45" };
    expect(fromSettingsDraft(draft)).toEqual({
      enable: true,
      interval: 2700,
      powermode: "never",
      tempmax: 0,
      tempdiff: 0,
    });
    expect(
      fromSettingsDraft({ ...draft, tempWarn: true, tempDiffOn: true }),
    ).toMatchObject({ tempmax: 55, tempdiff: 2 });
  });

  it.each([
    ["0", true],
    ["1441", true],
    ["", true],
    ["2.5", true],
    ["1", false],
    ["1440", false],
  ])("minutes %s is refused: %s", (minutes, refused) => {
    expect(
      settingsProblems({ ...toSettingsDraft(factory), minutes }).minutes,
    ).toBe(refused);
  });

  it("checks a temperature only while it is ticked", () => {
    const draft = {
      ...toSettingsDraft(factory),
      tempAt: "",
      tempDiffAt: "101",
    };
    expect(settingsProblems(draft)).toEqual({
      minutes: false,
      tempAt: false,
      tempDiffAt: false,
    });
    expect(
      settingsProblems({ ...draft, tempWarn: true, tempDiffOn: true }),
    ).toEqual({ minutes: false, tempAt: true, tempDiffAt: true });
  });

  it("is not dirty for a rounded interval until it is edited", () => {
    const odd = { ...factory, interval: 45 };
    expect(settingsDirty(odd, toSettingsDraft(odd))).toBe(false);
    expect(settingsDirty(odd, { ...toSettingsDraft(odd), minutes: "2" })).toBe(
      true,
    );
  });
});
