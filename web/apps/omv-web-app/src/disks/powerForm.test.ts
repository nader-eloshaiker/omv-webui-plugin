// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  isPowerDirty,
  monitoringKeepsAwake,
  powerRequest,
  startingDraft,
} from "./powerForm.ts";

const saved = {
  uuid: "00000000-0000-4000-8000-000000000401",
  devicefile: "/dev/disk/by-id/ata-Example_EXAMPLE-SERIAL-0003",
  apm: 127,
  aam: 0,
  spindowntime: 241,
  writecache: true,
};

describe("the power settings form", () => {
  it("starts from OMV's defaults with the write cache on when nothing is saved (P6)", () => {
    expect(startingDraft(undefined)).toEqual({
      spindowntime: 0,
      apm: 0,
      aam: 0,
      writecache: true,
    });
  });

  it("starts from what is saved", () => {
    expect(startingDraft(saved)).toEqual({
      spindowntime: 241,
      apm: 127,
      aam: 0,
      writecache: true,
    });
    expect(startingDraft({ ...saved, aam: 64 }).aam).toBe(0);
  });

  it("is always a change when nothing is saved, otherwise only when a field differs", () => {
    expect(isPowerDirty(undefined, startingDraft(undefined))).toBe(true);
    expect(isPowerDirty(saved, startingDraft(saved))).toBe(false);
    expect(
      isPowerDirty(saved, { ...startingDraft(saved), writecache: false }),
    ).toBe(true);
  });

  it("sends all six fields, with OMV's new-object identifier for a first save", () => {
    const draft = startingDraft(undefined);
    expect(
      powerRequest({ devicefile: "/dev/disk/by-id/x" }, undefined, draft),
    ).toEqual({
      uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
      devicefile: "/dev/disk/by-id/x",
      apm: 0,
      aam: 0,
      spindowntime: 0,
      writecache: true,
    });
    expect(
      powerRequest(
        { devicefile: "/dev/disk/by-id/x" },
        saved,
        startingDraft(saved),
      ).uuid,
    ).toBe(saved.uuid);
  });

  it.each([
    [
      {
        spindowntime: 241,
        watched: true,
        monitoringOn: true,
        powermode: "never",
      },
      true,
    ],
    [
      {
        spindowntime: 0,
        watched: true,
        monitoringOn: true,
        powermode: "never",
      },
      false,
    ],
    [
      {
        spindowntime: 241,
        watched: false,
        monitoringOn: true,
        powermode: "never",
      },
      false,
    ],
    [
      {
        spindowntime: 241,
        watched: true,
        monitoringOn: false,
        powermode: "never",
      },
      false,
    ],
    [
      {
        spindowntime: 241,
        watched: true,
        monitoringOn: true,
        powermode: "standby",
      },
      false,
    ],
    [
      {
        spindowntime: 241,
        watched: true,
        monitoringOn: true,
        powermode: undefined,
      },
      false,
    ],
  ])("warns that monitoring keeps the disk awake: %o is %s", (input, warns) => {
    expect(monitoringKeepsAwake(input)).toBe(warns);
  });
});
