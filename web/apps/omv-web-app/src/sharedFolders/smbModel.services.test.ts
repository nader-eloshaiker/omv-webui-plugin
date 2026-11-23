// SPDX-License-Identifier: GPL-3.0-or-later
// The rest of SMB (phase 5 services design 11): the workgroup's rule and write, a share's recycle bin,
// SMB.getShare's object written back, and when a recycle bin can be emptied.
import type {
  SmbSettings,
  SmbShare,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  changedShareRequest,
  emptyBlocker,
  NEW_RECYCLE_DAYS,
  newShareRequest,
  otherOptionsDiffer,
  recycleChoiceOf,
  recycleDaysOf,
  recycleRemovedSomething,
  recycleValid,
  recycleView,
  shareChoicesOf,
  workgroupRequest,
  workgroupValid,
} from "./smbModel.ts";

const SHARE: SmbShare = {
  uuid: "00000000-0000-4000-8000-000000000401",
  sharedfolderref: "00000000-0000-4000-8000-000000000201",
  enable: true,
  comment: "",
  guest: "no",
  readonly: false,
  browseable: true,
  recyclebin: false,
  recyclemaxsize: 5,
  recyclemaxage: 0,
  hidedotfiles: false,
  inheritacls: true,
  inheritpermissions: false,
  easupport: true,
  storedosattributes: false,
  hostsallow: "",
  hostsdeny: "",
  audit: false,
  timemachine: true,
  timemachinemaxsize: "500G",
  extraoptions: "veto files = /x/",
  followsymlinks: true,
  widelinks: false,
  macoscompat: true,
  transportencryption: false,
};

describe("the workgroup (11.2)", () => {
  it.each([
    ["WORKGROUP", true],
    ["Home Net", true],
    ["a!#$%&'()-.@^", true],
    ["_{}~", true],
    ["X".repeat(15), true],
    ["X".repeat(16), false],
    ["", false],
    ["WORK/GROUP", false],
    ["WORK:GROUP", false],
    ["Gruppé", false],
    ['say "hi"', false],
  ])("%s is %s", (workgroup, valid) => {
    expect(workgroupValid(workgroup)).toBe(valid);
  });

  it("writes the whole reply back with only the workgroup changed", () => {
    const settings = {
      enable: true,
      workgroup: "WORKGROUP",
      serverstring: "%h server",
      loglevel: 0,
      extraoptions: "x",
    } as SmbSettings;
    expect(workgroupRequest(settings, "HOME")).toEqual({
      ...settings,
      workgroup: "HOME",
    });
  });
});

describe("a share's recycle bin (11.3)", () => {
  it.each([
    [{ recyclebin: false, recyclemaxage: 7 }, { kind: "off" }],
    [{ recyclebin: true, recyclemaxage: 0 }, { kind: "forever" }],
    [
      { recyclebin: true, recyclemaxage: 30 },
      { kind: "days", days: 30 },
    ],
    [{}, { kind: "off" }],
  ])("%o reads as %o", (share, view) => {
    expect(recycleView(share)).toEqual(view);
  });

  it("opens with the stored days, or 30 for a bin that was off (D13)", () => {
    expect(recycleChoiceOf({ recyclebin: true, recyclemaxage: 0 })).toEqual({
      on: true,
      days: "0",
    });
    expect(recycleChoiceOf({ recyclebin: false, recyclemaxage: 0 })).toEqual({
      on: false,
      days: String(NEW_RECYCLE_DAYS),
    });
    expect(shareChoicesOf(undefined).recycle).toEqual({
      on: false,
      days: "30",
    });
  });

  it.each([
    ["0", 0],
    ["30", 30],
    [" 30 ", 30],
    ["3650", 3650],
    ["3651", null],
    ["-1", null],
    ["1.5", null],
    ["", null],
    ["abc", null],
  ])("days %j are %j", (days, value) => {
    expect(recycleDaysOf(days)).toBe(value);
  });

  it("is valid off whatever the days, and on only with valid days", () => {
    expect(recycleValid(undefined)).toBe(true);
    expect(recycleValid({ on: false, days: "x" })).toBe(true);
    expect(recycleValid({ on: true, days: "x" })).toBe(false);
    expect(recycleValid({ on: true, days: "10" })).toBe(true);
  });

  it("D12: the share read with getShare goes back whole, changing only the bin", () => {
    const request = changedShareRequest(SHARE, {
      ...shareChoicesOf({
        ...SHARE,
        sharedfoldername: "Photos",
      } as SmbShareRow),
      recycle: { on: true, days: "14" },
    });
    expect(request).toEqual({ ...SHARE, recyclebin: true, recyclemaxage: 14 });
  });

  it("turning the bin off keeps its days and size limit", () => {
    const stored = { ...SHARE, recyclebin: true, recyclemaxage: 9 };
    expect(
      changedShareRequest(stored, { recycle: { on: false, days: "9" } }),
    ).toEqual({ ...stored, recyclebin: false });
  });

  it("a getShareList row is sent without its folder's name", () => {
    const row = { ...SHARE, sharedfoldername: "Photos" } as SmbShareRow;
    expect(changedShareRequest(row, {})).not.toHaveProperty("sharedfoldername");
  });

  it("the bin and its days are not 'other options' any more; its size limit is", () => {
    const plain = {
      ...SHARE,
      recyclemaxsize: 0,
      hidedotfiles: true,
      inheritacls: false,
      timemachine: false,
      timemachinemaxsize: "",
      extraoptions: "",
      macoscompat: false,
      sharedfoldername: "Photos",
    } as SmbShareRow;
    expect(otherOptionsDiffer(plain)).toBe(false);
    expect(
      otherOptionsDiffer({ ...plain, recyclebin: true, recyclemaxage: 30 }),
    ).toBe(false);
    expect(otherOptionsDiffer({ ...plain, recyclemaxsize: 5 })).toBe(true);
  });

  it("a new share takes the bin when asked, with no size limit", () => {
    const request = newShareRequest(SHARE.sharedfolderref, {
      browseable: true,
      readonly: false,
      guest: "no",
      recycle: { on: true, days: "30" },
    });
    expect(request).toMatchObject({
      recyclebin: true,
      recyclemaxage: 30,
      recyclemaxsize: 0,
    });
    expect(
      newShareRequest(SHARE.sharedfolderref, {
        browseable: true,
        readonly: false,
        guest: "no",
      }),
    ).toMatchObject({ recyclebin: false, recyclemaxage: 0 });
  });
});

describe("emptying a recycle bin (11.4)", () => {
  it.each([
    {
      why: "may start",
      input: { pending: [], smbOn: true, savedHere: false, running: false },
      blocker: null,
    },
    {
      why: "samba pending",
      input: {
        pending: ["samba"],
        smbOn: true,
        savedHere: false,
        running: false,
      },
      blocker: "pending",
    },
    {
      why: "this session's bin not applied",
      input: {
        pending: ["samba"],
        smbOn: true,
        savedHere: true,
        running: false,
      },
      blocker: "notApplied",
    },
    {
      why: "SMB off",
      input: {
        pending: ["nfs"],
        smbOn: false,
        savedHere: false,
        running: false,
      },
      blocker: "smbOff",
    },
    {
      why: "running here",
      input: { pending: [], smbOn: true, savedHere: false, running: true },
      blocker: "running",
    },
    {
      why: "the pending modules not read",
      input: {
        pending: undefined,
        smbOn: true,
        savedHere: false,
        running: false,
      },
      blocker: "unread",
    },
    {
      why: "SMB's state not known",
      input: {
        pending: [],
        smbOn: undefined,
        savedHere: false,
        running: false,
      },
      blocker: "unread",
    },
  ])("$why", ({ input, blocker }) => {
    expect(emptyBlocker(input)).toBe(blocker);
  });

  it.each([
    ["removed '/srv/x/Photos/.recycle/alex/a.jpg'\n", true],
    [
      "Please wait, empty recyle bin of /srv/x/Photos ...\nremoved directory '/srv/x/Photos/.recycle/alex'\n",
      true,
    ],
    ["Please wait, empty recyle bin of /srv/x/Photos ...\n", false],
    ["", false],
    ["not removed anything\n", false],
  ])("output %j removed something: %s", (output, removed) => {
    expect(recycleRemovedSomething(output)).toBe(removed);
  });
});
