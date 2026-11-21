// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  isMonitoringDirty,
  limitProblem,
  monitoringDraft,
  monitoringRequest,
  ownLimit,
  watchLocked,
} from "./monitoringForm.ts";

const saved = {
  uuid: "00000000-0000-4000-8000-000000000601",
  enable: true,
  devicefile: "/dev/disk/by-id/ata-Example_EXAMPLE-SERIAL-0101",
  devicetype: "",
  tempdiff: 3,
  tempmax: 0,
  _used: false,
};

describe("the monitoring form", () => {
  it("starts unwatched when no settings are saved", () => {
    expect(monitoringDraft(null)).toEqual({
      enable: false,
      limitMode: "same",
      limit: "",
    });
  });

  it("starts from the saved limit", () => {
    expect(monitoringDraft({ ...saved, tempmax: 55 })).toEqual({
      enable: true,
      limitMode: "own",
      limit: "55",
    });
  });

  it("knows a change", () => {
    expect(isMonitoringDirty(saved, monitoringDraft(saved))).toBe(false);
    expect(
      isMonitoringDirty(saved, { ...monitoringDraft(saved), enable: false }),
    ).toBe(true);
    expect(
      isMonitoringDirty(saved, { enable: true, limitMode: "own", limit: "50" }),
    ).toBe(true);
    expect(
      isMonitoringDirty(null, { enable: true, limitMode: "same", limit: "" }),
    ).toBe(true);
  });

  it.each([
    ["50", 50],
    [" 1 ", 1],
    ["100", 100],
    ["0", null],
    ["101", null],
    ["4.5", null],
    ["", null],
    ["-3", null],
  ])("reads the own limit %s as %s", (text, limit) => {
    expect(ownLimit(text)).toBe(limit);
  });

  it("refuses an own limit outside 1 to 100, and ignores the field for the shared limit", () => {
    expect(limitProblem({ enable: true, limitMode: "own", limit: "200" })).toBe(
      "range",
    );
    expect(
      limitProblem({ enable: true, limitMode: "same", limit: "200" }),
    ).toBeNull();
  });

  it("sends all five fields, tempdiff as read, the new-object identifier for a first save", () => {
    expect(
      monitoringRequest({ devicefile: "/dev/disk/by-id/x" }, saved, {
        enable: true,
        limitMode: "own",
        limit: "48",
      }),
    ).toEqual({
      uuid: saved.uuid,
      devicefile: "/dev/disk/by-id/x",
      enable: true,
      tempdiff: 3,
      tempmax: 48,
    });
    expect(
      monitoringRequest({ devicefile: "/dev/disk/by-id/x" }, null, {
        enable: true,
        limitMode: "same",
        limit: "",
      }),
    ).toEqual({
      uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
      devicefile: "/dev/disk/by-id/x",
      enable: true,
      tempdiff: 0,
      tempmax: 0,
    });
  });

  it("locks watching while scheduled self-tests refer to a watched disk (D13)", () => {
    expect(watchLocked({ ...saved, _used: true })).toBe(true);
    expect(watchLocked({ ...saved, _used: true, enable: false })).toBe(false);
    expect(watchLocked(saved)).toBe(false);
    expect(watchLocked(null)).toBe(false);
  });
});
