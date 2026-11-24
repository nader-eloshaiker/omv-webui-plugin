// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  SharedFolder,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { afterEach, describe, expect, it } from "vitest";
import { savedMarks } from "../pending/savedMarks.ts";
import {
  beginAction,
  clearHandover,
  endAction,
  folderPending,
  forgetFolder,
  handedOverFs,
  handOverFs,
  recordCreated,
  recordSaved,
  recordSmbSaved,
  runningOn,
  sectionPending,
  sharesSession,
  smbSwitchPending,
  unfinishedWork,
} from "./sharesSession.ts";

const FOLDERS = JSON.parse(
  JSON.stringify(CONTRACT_EXAMPLES.shareMgmtGetList.withAccess.value.data),
) as SharedFolder[];
const PHOTOS = FOLDERS[1] as SharedFolder;
const EXISTING = FOLDERS[2] as SharedFolder;
const SHARE = CONTRACT_EXAMPLES.smbGetShareList.one.value
  .data[0] as SmbShareRow;

afterEach(() => {
  sharesSession.reset();
  savedMarks.reset();
});

describe("the shares session", () => {
  it("runs one action per folder at a time", () => {
    expect(beginAction(PHOTOS.uuid, "access")).toBe(true);
    expect(beginAction(PHOTOS.uuid, "share")).toBe(false);
    expect(beginAction(EXISTING.uuid, "share")).toBe(true);
    expect(runningOn(PHOTOS.uuid)).toBe("access");
    endAction(PHOTOS.uuid);
    expect(runningOn(PHOTOS.uuid)).toBeNull();
    expect(beginAction(PHOTOS.uuid, "delete")).toBe(true);
  });

  it("shows a section's mark while its module is pending, and forgets the marks after an apply", () => {
    recordSaved(PHOTOS.uuid, "access");
    recordSaved(PHOTOS.uuid, "access");
    const state = sharesSession.getState();
    expect(state.saved[PHOTOS.uuid]).toEqual(["access"]);
    expect(
      sectionPending(state, PHOTOS.uuid, "access", ["sharedfolders"]),
    ).toBe(true);
    expect(sectionPending(state, PHOTOS.uuid, "access", ["samba"])).toBe(true);
    expect(sectionPending(state, PHOTOS.uuid, "access", ["ssh"])).toBe(false);
    expect(sectionPending(state, PHOTOS.uuid, "sharing", ["samba"])).toBe(
      false,
    );
    expect(folderPending(state, PHOTOS.uuid, ["sharedfolders"])).toBe(true);
    expect(folderPending(state, EXISTING.uuid, ["sharedfolders"])).toBe(false);

    savedMarks.answered(["samba"]);
    expect(sharesSession.getState().saved[PHOTOS.uuid]).toEqual(["access"]);
    savedMarks.answered(["ssh"]);
    expect(sharesSession.getState().saved).toEqual({});
  });

  it("marks the SMB page's switch until applied", () => {
    recordSmbSaved();
    expect(smbSwitchPending(sharesSession.getState(), ["samba", "avahi"])).toBe(
      true,
    );
    expect(smbSwitchPending(sharesSession.getState(), [])).toBe(false);
    savedMarks.answered([]);
    expect(sharesSession.getState().smbSaved).toBe(false);
  });

  it("keeps the file system Flow A handed over, in memory", () => {
    expect(handedOverFs()).toBeNull();
    handOverFs("/dev/disk/by-uuid/00000000-0000-4000-8000-000000000008");
    expect(handedOverFs()).toBe(
      "/dev/disk/by-uuid/00000000-0000-4000-8000-000000000008",
    );
    clearHandover();
    expect(handedOverFs()).toBeNull();
  });

  it("is emptied by reset, as the session ends", () => {
    recordCreated({ uuid: PHOTOS.uuid, name: PHOTOS.name, smb: true });
    beginAction(PHOTOS.uuid, "add");
    sharesSession.reset();
    expect(sharesSession.getState()).toEqual({
      created: [],
      saved: {},
      smbSaved: false,
      workgroupSaved: false,
      running: {},
      handover: null,
    });
  });
});

describe("unfinished work (1.5)", () => {
  const made = (smb: boolean) => {
    recordCreated({ uuid: PHOTOS.uuid, name: PHOTOS.name, smb });
    return sharesSession.getState();
  };

  it.each([
    [
      "not saved yet",
      true,
      "OK",
      [SHARE],
      ["sharedfolders", "systemd"],
      "notSaved",
    ],
    ["no SMB share yet", true, "OK", [], [], "notShared"],
    ["shared", true, "OK", [SHARE], [], null],
    ["not shared, not chosen", false, "OK", [], [], null],
    ["folder not made", true, "ENOENT", [], ["sharedfolders"], "noDir"],
  ] as const)("%s", (_label, smb, status, shares, pending, kind) => {
    const state = made(smb);
    const lines = unfinishedWork(
      state,
      [{ ...PHOTOS, status }],
      shares,
      pending,
    );
    expect(lines.map((l) => l.kind)).toEqual(kind === null ? [] : [kind]);
  });

  it("says nothing without the share list, for a folder still being worked on, or one removed", () => {
    expect(unfinishedWork(made(true), [PHOTOS], undefined, [])).toEqual([]);
    beginAction(PHOTOS.uuid, "add");
    expect(
      unfinishedWork(sharesSession.getState(), [PHOTOS], [], ["sharedfolders"]),
    ).toEqual([]);
    endAction(PHOTOS.uuid);
    expect(unfinishedWork(sharesSession.getState(), [], [], [])).toEqual([]);
    forgetFolder(PHOTOS.uuid);
    expect(sharesSession.getState().created).toEqual([]);
  });
});
