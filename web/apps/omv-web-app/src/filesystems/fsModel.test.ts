// SPDX-License-Identifier: GPL-3.0-or-later
// The file systems slice's rules (phase 5 file-systems design 0.1, 0.2, 0.5 to 0.8), one by one.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ConfiguredFilesystem,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  addressIn,
  choiceText,
  endSection,
  findFsRow,
  fsAddress,
  fsName,
  fsState,
  fsUsage,
  growBlockers,
  isFsAddress,
  isZfs,
  levelChoices,
  listRows,
  otherModules,
  ownUuid,
  rowStatus,
  sameUuid,
  splitTags,
  tagsToSave,
  tagsTooLong,
  unmountBlockers,
  usedBy,
  zfsPool,
  type UsedBy,
} from "./fsModel.ts";

const SDA1 = CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value
  .data[0] as unknown as ConfiguredFilesystem;
const row = (
  over: Partial<ConfiguredFilesystem> = {},
): ConfiguredFilesystem => ({
  ...SDA1,
  ...over,
});
const SDA1_UUID = "00000000-0000-4000-8000-000000000001";
const FOLDER = CONTRACT_EXAMPLES.shareMgmtGetList.populated.value
  .data[0] as unknown as SharedFolder;
// The captured list with a ZFS mirror (sda1, then the pool's own folder tank and tank/media): no UUID.
const ZFS_ROWS = CONTRACT_EXAMPLES.fileSystemMgmtGetList.zfs.value
  .data as unknown as ConfiguredFilesystem[];
const [ZFS_SDA1, TANK, MEDIA] = ZFS_ROWS as [
  ConfiguredFilesystem,
  ConfiguredFilesystem,
  ConfiguredFilesystem,
];

it("reads the captured rows these tests rest on", () => {
  expect(SDA1.uuid).toBe(SDA1_UUID);
  expect(ZFS_SDA1.uuid).toBe(SDA1_UUID);
  expect([TANK.uuid, MEDIA.uuid]).toEqual([null, null]);
  expect([TANK.type, MEDIA.type]).toEqual(["zfs", "zfs"]);
});

describe("addresses (0.5)", () => {
  it.each([
    ["00000000-0000-4000-8000-000000000001", true],
    ["ABCD-1234", true],
    ["0000000000000090", true],
    ["abc", false],
    ["add", false],
    ["add-multi", false],
    [`${"0".repeat(8)}-0000-4000-8000-0000000000011`, false],
    ["../../rpc.php", false],
    ["2026-11-19-05-53-43-00", false],
    ["", false],
  ])("%s passes the pattern: %s", (value, ok) => {
    expect(isFsAddress(value)).toBe(ok);
  });

  it("finds the row by its UUID, ignoring case, or a missing one by its stable path", () => {
    const missing = row({
      status: 3,
      uuid: "",
      devicefile: "/dev/disk/by-uuid/00000000-0000-4000-8000-0000000000aa",
    });
    const rows = [SDA1, missing];
    expect(findFsRow(rows, SDA1_UUID.toUpperCase())).toBe(SDA1);
    expect(findFsRow(rows, "00000000-0000-4000-8000-0000000000AA")).toBe(
      missing,
    );
    expect(findFsRow(rows, "00000000-0000-4000-8000-0000000000ff")).toBe(
      undefined,
    );
  });

  it("gives no page to one being created, the system drive, or a row with no usable ID", () => {
    expect(fsAddress(SDA1)).toBe(SDA1.uuid);
    expect(fsAddress(row({ status: 2 }))).toBe(null);
    expect(fsAddress(row({ mountpoint: "/" }))).toBe(null);
    expect(
      fsAddress(
        row({
          status: 3,
          uuid: "",
          devicefile: "/dev/disk/by-id/ata-EXAMPLE-part1",
        }),
      ),
    ).toBe(null);
    expect(findFsRow([row({ status: 2 })], SDA1_UUID)).toBe(undefined);
  });

  it("finds another read's file system in the list, for the dashboard's links (9)", () => {
    expect(addressIn([SDA1], { uuid: SDA1.uuid, devicefile: "" })).toBe(
      SDA1.uuid,
    );
    expect(addressIn([SDA1], { uuid: "", devicefile: SDA1.devicefile })).toBe(
      SDA1.uuid,
    );
    expect(addressIn([], { uuid: SDA1.uuid, devicefile: "" })).toBe(null);
  });
});

describe("a file system without a UUID: ZFS (ZFS design 10.3)", () => {
  it("treats a null UUID as none: it matches nothing, not even another null", () => {
    expect(ownUuid(TANK)).toBe("");
    expect(ownUuid(SDA1)).toBe(SDA1_UUID);
    expect(sameUuid(null, null)).toBe(false);
    expect(sameUuid("", "")).toBe(false);
    expect(sameUuid(null, SDA1_UUID)).toBe(false);
    expect(sameUuid(SDA1_UUID, "")).toBe(false);
    expect(sameUuid(SDA1_UUID.toUpperCase(), SDA1_UUID)).toBe(true);
  });

  it("finds a row by its address past ZFS rows listed before it", () => {
    expect(findFsRow([TANK, MEDIA, ZFS_SDA1], SDA1_UUID)).toBe(ZFS_SDA1);
    expect(findFsRow([TANK, MEDIA], SDA1_UUID)).toBe(undefined);
  });

  it("gives a ZFS file system no page, from its own row or another read's", () => {
    expect(fsAddress(TANK)).toBe(null);
    expect(fsAddress(MEDIA)).toBe(null);
    // Even with a UUID, a ZFS file system is managed with its pool, not here.
    expect(fsAddress({ ...MEDIA, uuid: SDA1_UUID })).toBe(null);
    expect(addressIn(ZFS_ROWS, { uuid: null, devicefile: "tank/media" })).toBe(
      null,
    );
    // A null UUID never picks the first row with none.
    expect(addressIn(ZFS_ROWS, { uuid: null, devicefile: "" })).toBe(null);
    expect(addressIn(ZFS_ROWS, { uuid: SDA1_UUID, devicefile: "" })).toBe(
      SDA1_UUID,
    );
  });

  it("names its pool and its type", () => {
    expect(isZfs(MEDIA)).toBe(true);
    expect(isZfs(SDA1)).toBe(false);
    expect(zfsPool(TANK)).toBe("tank");
    expect(zfsPool(MEDIA)).toBe("tank");
    expect(zfsPool({ devicefile: "", devicename: "pool2/a/b" })).toBe("pool2");
    expect(fsName(MEDIA)).toEqual({ kind: "label", text: "tank/media" });
  });

  it("never offers grow or unmount for a ZFS row", () => {
    expect(growBlockers(MEDIA, false)).toContain("multi");
    expect(
      unmountBlockers(MEDIA, { kind: "none" }, false, "unmount"),
    ).toContainEqual({ kind: "noFstab" });
  });
});

describe("names, tags and levels (0.1, 2.6)", () => {
  it("names a file system by its label, else its type on its device", () => {
    expect(fsName(row({ label: " media " }))).toEqual({
      kind: "label",
      text: "media",
    });
    expect(fsName(row({ label: null }))).toEqual({
      kind: "onDevice",
      type: "ext4",
      device: "/dev/sda1",
    });
    expect(fsName(row({ label: "", canonicaldevicefile: "" }))).toEqual({
      kind: "onDevice",
      type: "ext4",
      device: SDA1.devicefile,
    });
  });

  it("splits tags as OMV stores them, and saves them sorted, without repeats", () => {
    expect(splitTags("Media,Photos")).toEqual(["Media", "Photos"]);
    expect(splitTags(" , ")).toEqual([]);
    expect(tagsToSave("Photos, Media,Photos ,")).toBe("Media,Photos");
    expect(tagsToSave("")).toBe("");
    expect(tagsTooLong("x".repeat(200))).toBe(false);
    expect(tagsTooLong("x".repeat(201))).toBe(true);
  });

  it("keeps a level set elsewhere as a choice of its own", () => {
    expect(levelChoices(85)).toEqual([0, 50, 75, 80, 85, 90, 95]);
    expect(levelChoices(60)).toEqual([0, 50, 60, 75, 80, 85, 90, 95]);
  });

  it("names a file system as the classic shared-folder picker does: its tags, else its device (6.8)", () => {
    expect(choiceText(row({ comment: "Media,Photos" }))).toBe("[Media,Photos]");
    expect(choiceText(row({ comment: "" }))).toBe("/dev/sda1");
  });

  it("leaves the system drive out of the list's own rows (1.3.2)", () => {
    expect(listRows([SDA1, row({ mountpoint: "/" })])).toEqual([SDA1]);
  });
});

describe("state and usage (0.2)", () => {
  it.each([
    [{ status: 1, mounted: true }, [], "ok"],
    [{ status: 1, mounted: false }, ["fstab"], "setUpPending"],
    [{ status: 1, mounted: false }, ["monit"], "notMounted"],
    [{ status: 2, mounted: false }, [], "creating"],
    [{ status: 3, mounted: false }, ["fstab"], "missing"],
  ] as const)("%o with %o pending is %s", (fs, pending, want) => {
    expect(fsState(row(fs), pending)).toBe(want);
  });

  it("reads usage only for a mounted file system, by the dashboard's rule", () => {
    expect(fsUsage(row())).toBe("below");
    expect(fsUsage(row({ mounted: false }))).toBe("none");
    expect(fsUsage(row({ percentage: 90, usagewarnthreshold: 85 }))).toBe(
      "warning",
    );
    expect(fsUsage(row({ percentage: 100 }))).toBe("critical");
    expect(fsUsage(row({ percentage: -1 }))).toBe("unknown");
    expect(fsUsage(row({ usagewarnthreshold: undefined }))).toBe("below");
  });

  it("counts each file system once by the worse of state and usage; a pending mount is fine", () => {
    expect(rowStatus("ok", "warning")).toBe("warning");
    expect(rowStatus("missing", "none")).toBe("critical");
    expect(rowStatus("notMounted", "none")).toBe("critical");
    expect(rowStatus("setUpPending", "none")).toBe("ok");
    expect(rowStatus("creating", "none")).toBe("ok");
    expect(rowStatus("ok", "unknown")).toBe("unknown");
  });
});

describe("what uses it (0.6)", () => {
  const entry = { ...CONTRACT_EXAMPLES.fsTabGetByFsName.entry.value };
  it("finds shared folders by the mount entry's UUID", () => {
    expect(
      usedBy(
        row(),
        { ...entry, uuid: FOLDER.mntentref },
        {
          data: [FOLDER],
          failed: false,
        },
      ),
    ).toEqual({ kind: "shares", folders: [FOLDER] });
  });

  it("falls back to the folder's mount entry folder when the entry was not read", () => {
    const fs = row({ mountpoint: FOLDER.mntent?.dir ?? "" });
    expect(usedBy(fs, undefined, { data: [FOLDER], failed: false }).kind).toBe(
      "shares",
    );
  });

  it("is something else when the server says used and no folder is found, never nothing", () => {
    expect(
      usedBy(row({ _used: true }), false, { data: [], failed: false }),
    ).toEqual({ kind: "other" });
    expect(
      usedBy(row({ _used: false }), false, { data: [], failed: false }),
    ).toEqual({ kind: "none" });
    expect(
      usedBy(row(), false, { data: undefined, failed: true, error: "x" }),
    ).toEqual({ kind: "unchecked", error: "x" });
    expect(usedBy(row(), false, { data: undefined, failed: false })).toEqual({
      kind: "loading",
    });
  });
});

describe("the interface's own refusals (0.8)", () => {
  it("refuses to grow one not mounted, read-only, or BTRFS on several disks, or while it changes", () => {
    expect(growBlockers(row(), false)).toEqual([]);
    expect(growBlockers(row({ mounted: false }), false)).toEqual([
      "notMounted",
    ]);
    expect(growBlockers(row({ _readonly: true }), false)).toEqual(["readOnly"]);
    expect(growBlockers(row({ hasmultipledevices: true }), false)).toEqual([
      "multi",
    ]);
    expect(growBlockers(row(), true)).toEqual(["busy"]);
  });

  it("refuses to unmount one in use, naming the folders, and the system drive or a type not mounted by OMV", () => {
    const shares: UsedBy = { kind: "shares", folders: [FOLDER] };
    expect(
      unmountBlockers(row({ _used: true }), shares, false, "unmount"),
    ).toEqual([
      {
        kind: "shared",
        names: ["a4share"],
        folders: [{ uuid: FOLDER.uuid, name: "a4share" }],
      },
    ]);
    expect(
      unmountBlockers(
        row({ _used: true }),
        { kind: "other" },
        false,
        "unmount",
      ),
    ).toEqual([{ kind: "other" }]);
    expect(
      unmountBlockers(
        row({ _used: true }),
        { kind: "unchecked", error: undefined },
        false,
        "unmount",
      ),
    ).toEqual([{ kind: "used" }]);
    expect(
      unmountBlockers(
        row({ _used: false, mountpoint: "/" }),
        { kind: "none" },
        false,
        "unmount",
      ),
    ).toEqual([{ kind: "readOnly" }]);
    expect(
      unmountBlockers(
        row({ _used: false, propfstab: false }),
        { kind: "none" },
        false,
        "unmount",
      ),
    ).toEqual([{ kind: "noFstab" }]);
    expect(
      unmountBlockers(
        row({ _used: false, status: 2 }),
        { kind: "none" },
        true,
        "unmount",
      ),
    ).toEqual([{ kind: "creating" }, { kind: "busy" }]);
  });

  it("refuses to remove a missing one only while it is used or changing", () => {
    const missing = row({ status: 3, _used: false, propfstab: false });
    expect(unmountBlockers(missing, { kind: "none" }, false, "remove")).toEqual(
      [],
    );
    expect(
      unmountBlockers(
        { ...missing, _used: true },
        { kind: "other" },
        false,
        "remove",
      ),
    ).toEqual([{ kind: "other" }]);
  });

  it("chooses the closing section: unmount, remove, or undo in the band for a mount only pending (D16)", () => {
    expect(endSection(row(), [])).toBe("unmount");
    expect(endSection(row({ status: 3, mounted: false }), [])).toBe("remove");
    expect(endSection(row({ mounted: false }), [])).toBe("remove");
    expect(
      endSection(row({ mounted: false }), [
        "collectd",
        "fstab",
        "monit",
        "quota",
      ]),
    ).toBe("pendingOnly");
    expect(endSection(row({ mounted: false }), ["fstab", "ssh"])).toBe(
      "unmount",
    );
    expect(endSection(row({ status: 2 }), [])).toBe(null);
  });

  it("names the modules pending beyond an action's own (R10)", () => {
    expect(
      otherModules(
        ["collectd", "monit", "nfs", "quota"],
        ["collectd", "monit", "quota"],
      ),
    ).toEqual(["nfs"]);
  });
});
