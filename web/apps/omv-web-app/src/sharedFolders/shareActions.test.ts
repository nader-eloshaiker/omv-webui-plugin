// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ConfiguredFilesystem,
  ShareCandidate,
  SharedFolder,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  candidateOf,
  defaultFsChoice,
  deleteBlockers,
  folderChanged,
  folderFs,
  folderState,
  folderTodo,
  fsChoices,
  readsRefusal,
  repointRefusal,
  saveAccessRefusal,
  shareRefusal,
  smbOnRefusal,
  type DeleteInput,
} from "./shareActions.ts";

const clone = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

const FOLDERS = clone<SharedFolder[]>(
  CONTRACT_EXAMPLES.shareMgmtGetList.withAccess.value.data,
);
const byName = (name: string): SharedFolder => {
  const found = FOLDERS.find((f) => f.name === name);
  if (found === undefined) {
    throw new Error(name);
  }
  return found;
};
const PHOTOS = byName("Photos");
const WHOLE = byName("Whole");
const A4 = byName("a4share");
const SHARE = clone<SmbShareRow>(
  CONTRACT_EXAMPLES.smbGetShareList.one.value.data[0],
);
const CANDIDATES = clone<ShareCandidate[]>(
  CONTRACT_EXAMPLES.shareMgmtGetCandidates.several.value,
);
const TAGGED = clone<ConfiguredFilesystem[]>(
  CONTRACT_EXAMPLES.fileSystemMgmtGetList.withTags.value.data,
);

/** A file system row like the captured ones, mounted where a folder of `withAccess` says. */
function fsAt(
  device: string,
  dir: string,
  fsname: string,
  over: Partial<ConfiguredFilesystem> = {},
): ConfiguredFilesystem {
  const base = TAGGED[0] as ConfiguredFilesystem;
  return {
    ...base,
    devicename: device.replace("/dev/", ""),
    canonicaldevicefile: device,
    devicefile: fsname,
    mountpoint: dir,
    ...over,
  };
}
const SDA1 = fsAt(
  "/dev/sda1",
  "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000007",
  "/dev/disk/by-uuid/00000000-0000-4000-8000-000000000007",
);
const SDD1 = fsAt(
  "/dev/sdd1",
  "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000008",
  "/dev/disk/by-uuid/00000000-0000-4000-8000-000000000008",
  { comment: "Media" },
);
const SDB1 = fsAt(
  "/dev/sdb1",
  "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-00000000000f",
  "/dev/disk/by-uuid/00000000-0000-4000-8000-00000000000f",
  { type: "btrfs" },
);
const TANK = fsAt("tank", "/tank", "tank", {
  type: "zfs",
  uuid: null,
  devicename: "tank",
});
const ROOT = fsAt("/dev/sde1", "/", "/dev/disk/by-uuid/root");
const ALL_FS = [SDA1, SDD1, SDB1, TANK, ROOT];

const read = <T>(data: readonly T[] | undefined, failed = false) => ({
  data,
  failed,
  error: failed ? new Error("read failed") : undefined,
});

describe("a folder's file system", () => {
  it("is found by the mount entry's folder or device path", () => {
    expect(folderFs(PHOTOS, ALL_FS)).toBe(SDD1);
    expect(folderFs(WHOLE, ALL_FS)).toBe(SDB1);
    expect(folderFs({ mntent: { fsname: SDA1.devicefile } }, ALL_FS)).toBe(
      SDA1,
    );
    expect(folderFs({ mntent: undefined }, ALL_FS)).toBeUndefined();
  });

  it("is matched to its candidate by a folder on it, else by the description's device or name", () => {
    expect(candidateOf(SDD1, CANDIDATES, FOLDERS)?.uuid).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
    expect(candidateOf(SDB1, CANDIDATES)?.uuid).toBe(
      "00000000-0000-4000-8000-000000000003",
    );
    expect(candidateOf(TANK, CANDIDATES)?.uuid).toBe(
      "00000000-0000-4000-8000-000000000004",
    );
    expect(candidateOf(ROOT, CANDIDATES)).toBeUndefined();
  });
});

describe("which file systems can hold a shared folder (0.6)", () => {
  it("offers the candidates OMV and this interface both allow, ZFS included", () => {
    const choices = fsChoices(CANDIDATES, ALL_FS, FOLDERS);
    expect(choices.offered.map((o) => o.fs.canonicaldevicefile)).toEqual([
      "/dev/sda1",
      "/dev/sdd1",
      "/dev/sdb1",
      "tank",
    ]);
    expect(choices.cannot).toEqual([{ fs: ROOT, reason: "system" }]);
  });

  it.each([
    [{ mounted: false }, "notMounted"],
    [{ status: 3 as const, mounted: false }, "missing"],
    [{ status: 2 as const, mounted: false }, "notMounted"],
    [{ mountopts: "ro,nofail" }, "readOnly"],
  ])("refuses %j: %s", (over, reason) => {
    const fs = { ...SDA1, ...over };
    expect(fsChoices(CANDIDATES, [fs]).cannot).toEqual([{ fs, reason }]);
  });

  it("refuses a mounted file system OMV does not offer", () => {
    const choices = fsChoices(CANDIDATES.slice(0, 1), [SDA1, SDB1]);
    expect(choices.cannot).toEqual([{ fs: SDB1, reason: "notCandidate" }]);
  });

  it("offers a full file system with its usage", () => {
    const full = { ...SDA1, percentage: 100, available: "0" };
    expect(fsChoices(CANDIDATES, [full]).offered[0]?.usage).toBe("critical");
  });

  it("chooses the one handed over, else the only one, else none", () => {
    const { offered } = fsChoices(CANDIDATES, ALL_FS, FOLDERS);
    expect(defaultFsChoice(offered, SDB1.devicefile)?.fs).toBe(SDB1);
    expect(defaultFsChoice(offered, null)).toBeUndefined();
    expect(defaultFsChoice(offered.slice(0, 1), null)?.fs).toBe(SDA1);
    expect(defaultFsChoice(offered.slice(0, 1), "gone")?.fs).toBe(SDA1);
  });
});

describe("a folder's state (0.3, 2.4)", () => {
  it("takes the worse of the folder's and its file system's", () => {
    expect(folderState(PHOTOS, SDD1)).toEqual({ pill: "ok" });
    expect(folderState(PHOTOS, { ...SDD1, mounted: false })).toEqual({
      pill: "critical",
      reason: "fsNotMounted",
    });
    expect(folderState(PHOTOS, { ...SDD1, status: 3, mounted: false })).toEqual(
      { pill: "critical", reason: "fsMissing" },
    );
    expect(folderState({ status: "ENOENT" }, SDD1)).toEqual({
      pill: "critical",
      reason: "ENOENT",
    });
    expect(folderState({ status: "EFUTURE" }, SDD1)).toEqual({
      pill: "unknown",
      code: "EFUTURE",
    });
  });

  it.each([
    ["ENOENT_DB_MNTENT", SDD1, undefined, true, false, "fsGone"],
    [
      "ENOENT",
      { ...SDD1, mounted: false },
      undefined,
      true,
      false,
      "notMounted",
    ],
    ["ENOENT", SDD1, undefined, true, false, "missing"],
    ["ENOTDIR", SDD1, undefined, true, false, "notDir"],
    ["OK", SDD1, { ...SHARE }, true, false, null],
    ["OK", SDD1, { ...SHARE }, false, false, "smbOff"],
    ["OK", SDD1, { ...SHARE }, true, true, "smbDown"],
    ["OK", SDD1, undefined, false, false, null],
  ] as const)("%s → %s", (status, fs, share, on, down, todo) => {
    expect(
      folderTodo({
        folder: { status, privileges: PHOTOS.privileges },
        fs,
        share,
        smbOn: on,
        smbDown: down,
      }),
    ).toBe(todo);
  });

  it("says nobody can open a share with guest access off and no access", () => {
    expect(
      folderTodo({
        folder: { status: "OK", privileges: "" },
        fs: SDD1,
        share: SHARE,
        smbOn: true,
        smbDown: false,
      }),
    ).toBe("nobody");
    expect(
      folderTodo({
        folder: { status: "OK", privileges: "" },
        fs: SDD1,
        share: { ...SHARE, guest: "allow" },
        smbOn: true,
        smbDown: false,
      }),
    ).toBeNull();
  });
});

describe("refusals before an action (0.9)", () => {
  it("waits for every read, and fails closed on the first failure", () => {
    expect(readsRefusal([{ failed: false, ready: true }])).toBeNull();
    expect(readsRefusal([{ failed: false, ready: false }])).toEqual({
      kind: "loading",
    });
    const error = new Error("x");
    expect(
      readsRefusal([
        { failed: false, ready: false },
        { failed: true, error, ready: false },
      ]),
    ).toEqual({ kind: "unread", error });
  });

  it("refuses to share with guest access off while nobody has access", () => {
    const base = { smbOn: true, hostname: "nas" } as const;
    expect(
      shareRefusal({ ...base, folder: { privileges: "" }, guest: "no" }),
    ).toEqual({ kind: "needAccess" });
    expect(
      shareRefusal({ ...base, folder: { privileges: "" }, guest: "allow" }),
    ).toBeNull();
    expect(shareRefusal({ ...base, folder: PHOTOS, guest: "no" })).toBeNull();
    expect(
      shareRefusal({ ...base, folder: PHOTOS, guest: "no", running: "access" }),
    ).toEqual({ kind: "running", action: "access" });
    expect(
      shareRefusal({ ...base, smbOn: undefined, folder: PHOTOS, guest: "no" }),
    ).toEqual({ kind: "loading" });
  });

  it("refuses to share while SMB is off and the NAS's name is too long", () => {
    expect(
      shareRefusal({
        folder: PHOTOS,
        guest: "no",
        smbOn: false,
        hostname: "nas-living-room1",
      }),
    ).toEqual({ kind: "hostTooLong", host: "nas-living-room1", length: 16 });
    // With SMB on already, the name is not checked again.
    expect(
      shareRefusal({
        folder: PHOTOS,
        guest: "no",
        smbOn: true,
        hostname: "nas-living-room1",
      }),
    ).toBeNull();
    expect(smbOnRefusal("nas")).toBeNull();
    expect(smbOnRefusal("nas.example.lan")).toBeNull();
  });

  it("refuses to save access that leaves nobody while shared with guest access off", () => {
    expect(saveAccessRefusal({ list: [], share: SHARE })).toEqual({
      kind: "lastAccess",
    });
    expect(saveAccessRefusal({ list: [{ perms: 0 }], share: SHARE })).toEqual({
      kind: "lastAccess",
    });
    expect(
      saveAccessRefusal({ list: [{ perms: 5 }], share: SHARE }),
    ).toBeNull();
    expect(
      saveAccessRefusal({ list: [], share: { ...SHARE, guest: "allow" } }),
    ).toBeNull();
    expect(saveAccessRefusal({ list: [], share: undefined })).toBeNull();
  });

  it("repairs only a folder that cannot be reached", () => {
    expect(
      repointRefusal({ folder: PHOTOS, fsOffered: true, path: null }),
    ).toEqual({ kind: "okOnly" });
    expect(
      repointRefusal({
        folder: { status: "ENOENT" },
        fsOffered: true,
        path: null,
      }),
    ).toBeNull();
    expect(
      repointRefusal({
        folder: { status: "ENOENT" },
        fsOffered: true,
        path: { key: "addShare.path.invalid" },
      }),
    ).toEqual({ kind: "path", problem: { key: "addShare.path.invalid" } });
    expect(
      repointRefusal({
        folder: { status: "ENOENT" },
        fsOffered: false,
        path: null,
      }),
    ).toEqual({ kind: "fsNotOffered" });
  });

  it("notices a folder that changed since it was read", () => {
    expect(folderChanged(PHOTOS, { ...PHOTOS })).toBe(false);
    expect(folderChanged(PHOTOS, { ...PHOTOS, reldirpath: "x/" })).toBe(true);
    expect(folderChanged(PHOTOS, { ...PHOTOS, name: "P" })).toBe(true);
    expect(folderChanged(PHOTOS, { ...PHOTOS, mntentref: "m" })).toBe(true);
    expect(folderChanged(PHOTOS, undefined)).toBe(true);
  });
});

describe("deleting a shared folder (8.1)", () => {
  const input = (over: Partial<DeleteInput> = {}): DeleteInput => ({
    folder: A4,
    folders: read(FOLDERS),
    shares: read<SmbShareRow>([]),
    fileSystems: read(ALL_FS),
    ...over,
  });
  const kinds = (list: readonly { kind: string }[]) => list.map((b) => b.kind);

  it("may start when nothing uses it", () => {
    expect(deleteBlockers(input())).toEqual({ keep: [], files: [] });
  });

  it("is refused both ways while an SMB share refers, even one turned off", () => {
    const shares = read([
      { ...SHARE, sharedfolderref: A4.uuid, enable: false },
    ]);
    const result = deleteBlockers(input({ shares }));
    expect(kinds(result.keep)).toEqual(["smb"]);
    expect(kinds(result.files)).toEqual(["smb"]);
  });

  it("is refused while something else uses it", () => {
    const result = deleteBlockers(input({ folder: { ...A4, _used: true } }));
    expect(kinds(result.keep)).toEqual(["other"]);
  });

  it("fails closed when a read failed or has not arrived", () => {
    expect(
      kinds(deleteBlockers(input({ shares: read(undefined, true) })).keep),
    ).toEqual(["unread"]);
    expect(
      kinds(deleteBlockers(input({ folders: read(undefined) })).keep),
    ).toEqual(["loading"]);
    const fsFailed = deleteBlockers(
      input({ fileSystems: read(undefined, true) }),
    );
    expect(kinds(fsFailed.keep)).toEqual([]);
    expect(kinds(fsFailed.files)).toEqual(["unread"]);
  });

  it("waits for an action of this session", () => {
    expect(kinds(deleteBlockers(input({ running: "access" })).keep)).toEqual([
      "running",
    ]);
  });

  it("keeps the files-only refusals to deleting with files", () => {
    const notOk = deleteBlockers(
      input({ folder: { ...A4, status: "ENOENT" } }),
    );
    expect(kinds(notOk.keep)).toEqual([]);
    expect(kinds(notOk.files)).toEqual(["notOk"]);

    const unmounted = deleteBlockers(
      input({ fileSystems: read([{ ...SDA1, mounted: false }]) }),
    );
    expect(kinds(unmounted.files)).toEqual(["fsNotMounted"]);

    expect(
      kinds(deleteBlockers(input({ fileSystems: read([]) })).files),
    ).toEqual(["fsNotMounted"]);

    const whole = deleteBlockers(input({ folder: WHOLE }));
    expect(kinds(whole.files)).toEqual(["whole"]);

    const onRoot = deleteBlockers(
      input({
        fileSystems: read([{ ...SDA1, mountpoint: "/" }]),
        folder: { ...A4, mntent: { ...A4.mntent, dir: "/" } },
      }),
    );
    expect(kinds(onRoot.files)).toEqual(["system"]);
  });

  it("names the other folder inside it", () => {
    const media = {
      ...PHOTOS,
      uuid: "00000000-0000-4000-8000-0000000000aa",
      name: "Media",
      reldirpath: "Media/",
    };
    const inner = {
      ...PHOTOS,
      uuid: "00000000-0000-4000-8000-0000000000ab",
      name: "Holiday",
      reldirpath: "Media/Holiday/",
    };
    const result = deleteBlockers(
      input({ folder: media, folders: read([...FOLDERS, media, inner]) }),
    );
    expect(result.files).toContainEqual({ kind: "inside", other: inner });
    // Same name in another folder ("Media2") is not inside.
    const near = { ...inner, reldirpath: "Media2/" };
    expect(
      kinds(
        deleteBlockers(input({ folder: media, folders: read([media, near]) }))
          .files,
      ),
    ).toEqual([]);
  });
});
