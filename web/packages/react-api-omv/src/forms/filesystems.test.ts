// SPDX-License-Identifier: GPL-3.0-or-later
// The file-system requests (Phase 5): the generated form schemas, and the request schemas of the two
// create tasks, which have no form, accept what the contract accepts and nothing OMV would refuse
// (docs/04, "Request schemas"). Each value the contract accepts is also checked against OMV's own
// regular expression for the format, from openmediavault's PHP sources (OMV 8.6.1).
import bundle from "@omv-webui/spec-api-omv/openapi.json" with { type: "json" };
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  FileSystemMgmtGrowRequestSchema,
  FileSystemMgmtSetMountPointRequestSchema,
  FileSystemMgmtUmountByDirRequestSchema,
  FsTabSetRequestSchema,
} from "./generated/index.ts";

const ok = (schema: v.GenericSchema, value: unknown) =>
  v.safeParse(schema, value).success;

// OMV's checks: is_fs_uuid() in functions.inc, and the dirpath and devicefile formats in
// datamodel/schema.inc. PHP's /u makes \w match letters outside ASCII; the contract's patterns
// accept ASCII only, so this side is written with \p{L}\p{N}_ to be no stricter than PHP.
const OMV = {
  fsuuid: (s: string) =>
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s) ||
    /^([a-f0-9]{4}-[a-f0-9]{4}|[a-f0-9]{16}|[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2})$/i.test(
      s,
    ),
  dirpath: (s: string) =>
    /^(?!.*[/]\.{2}[/])(?!\.{2}[/])[-\p{L}\p{N}_./@ ]+$/u.test(s),
  devicefile: (s: string) =>
    /^\/dev(\/disk\/by-id)?\/[a-z0-9/.:_+-]+$/i.test(s),
};

describe("file-system UUID (OMV format `fsuuid`), to grow a file system", () => {
  it.each([
    "00000000-0000-4000-8000-000000000003",
    "0F1E2D3C-4B5A-4978-8695-A4B3C2D1E0F0",
    "0000-0001",
    "7A48-BA97",
    "0123456789ABCDEF",
    "2026-11-19-05-53-43-00",
  ])("accepts %s, as OMV does", (id) => {
    expect(ok(FileSystemMgmtGrowRequestSchema, { id })).toBe(true);
    expect(OMV.fsuuid(id)).toBe(true);
  });
  it.each([
    "",
    "/dev/sdd1",
    "/dev/disk/by-uuid/00000000-0000-4000-8000-000000000003",
    "UUID=00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000003 ",
    "0000-00001",
    "0123456789ABCDEFG",
    "2026-11-19-05-53-43",
  ])("rejects %j", (id) => {
    expect(ok(FileSystemMgmtGrowRequestSchema, { id })).toBe(false);
  });
  it("rejects a field the contract does not name", () => {
    expect(
      ok(FileSystemMgmtGrowRequestSchema, { id: "0000-0001", force: true }),
    ).toBe(false);
  });
});

describe("mount folder (OMV format `dirpath`, absolute), to unmount", () => {
  it.each([
    "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000003",
    "/srv/dev-disk-by-id-ata-Example_HDD_EXAMPLE-SERIAL-0101-part1",
    "/srv/mergerfs/pool 1",
    "/media/user@example",
  ])("accepts %s, as OMV does", (dir) => {
    expect(ok(FileSystemMgmtUmountByDirRequestSchema, { dir })).toBe(true);
    expect(OMV.dirpath(dir)).toBe(true);
  });
  it.each([
    "",
    "/",
    "srv/data",
    "/srv/",
    "/srv/../etc",
    "/srv/..",
    "/../srv",
    "/srv/data\n",
    "/srv/da;ta",
    "/srv/dätä",
  ])("rejects %j", (dir) => {
    expect(ok(FileSystemMgmtUmountByDirRequestSchema, { dir })).toBe(false);
  });
});

describe("setting up a found file system", () => {
  const valid = {
    id: "/dev/sdd1",
    usagewarnthreshold: 85,
    comment: "Media,Photos",
  };
  it.each([
    valid,
    { id: "/dev/sdd1" },
    { id: "/dev/disk/by-id/ata-Example_HDD_EXAMPLE-SERIAL-0101-part1" },
    { ...valid, usagewarnthreshold: 0 },
    { ...valid, usagewarnthreshold: 100 },
    { ...valid, comment: "" },
    { ...valid, comment: "x".repeat(200) },
  ])("accepts %j", (body) => {
    expect(ok(FileSystemMgmtSetMountPointRequestSchema, body)).toBe(true);
    expect(OMV.devicefile(body.id)).toBe(true);
  });
  it.each([
    [
      "by its UUID (OMV accepts it; the contract does not)",
      { id: "0000-0001" },
    ],
    ["with no id", { usagewarnthreshold: 85 }],
    ["below 0%", { ...valid, usagewarnthreshold: -1 }],
    ["above 100%", { ...valid, usagewarnthreshold: 101 }],
    ["at a fractional level", { ...valid, usagewarnthreshold: 85.5 }],
    [
      "with tags longer than 200 characters",
      { ...valid, comment: "x".repeat(201) },
    ],
    ["with a field the contract does not name", { ...valid, label: "media" }],
  ])("rejects a request %s", (_why, body) => {
    expect(ok(FileSystemMgmtSetMountPointRequestSchema, body)).toBe(false);
  });
});

describe("saving a mount entry's warning level and tags", () => {
  // As FsTab.getByFsName returned it on the test VM, with the level and tags changed.
  const valid = {
    uuid: "00000000-0000-4000-8000-000000000005",
    fsname: "/dev/disk/by-uuid/00000000-0000-4000-8000-000000000003",
    dir: "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000003",
    type: "ext4",
    opts: "defaults,nofail,user_xattr,usrquota,grpquota,acl",
    freq: 0,
    passno: 2,
    hidden: false,
    usagewarnthreshold: 90,
    comment: "Media,Photos,Backups",
  };
  it("accepts the entry sent back", () =>
    expect(ok(FsTabSetRequestSchema, valid)).toBe(true));
  it.each([
    "00000000-0000-4000-8000-000000000003",
    "/dev/sdd1",
    "/srv/mergerfs/pool",
  ])(
    "accepts fsname %s (a UUID, device file or folder, as OMV does)",
    (fsname) => {
      expect(ok(FsTabSetRequestSchema, { ...valid, fsname })).toBe(true);
      expect(
        OMV.fsuuid(fsname) || OMV.devicefile(fsname) || OMV.dirpath(fsname),
      ).toBe(true);
    },
  );
  it.each([
    ["fsname", ""],
    ["fsname", "../etc"],
    ["fsname", "UUID=0000-0001"],
    ["uuid", "not-a-uuid"],
    ["passno", 3],
    ["freq", 0.5],
    ["type", ""],
    ["dir", ""],
    ["usagewarnthreshold", 101],
    ["comment", "x".repeat(201)],
    ["hidden", "false"],
  ])("rejects %s %j", (field, value) => {
    expect(ok(FsTabSetRequestSchema, { ...valid, [field]: value })).toBe(false);
  });
  it.each(["uuid", "fsname", "dir", "type", "opts", "freq", "passno"])(
    "rejects a request without %s",
    (field) => {
      const rest = Object.fromEntries(
        Object.entries(valid).filter(([k]) => k !== field),
      );
      expect(ok(FsTabSetRequestSchema, rest)).toBe(false);
    },
  );
  it.each(["hidden", "usagewarnthreshold", "comment"])(
    "accepts a request without %s",
    (field) => {
      const rest = Object.fromEntries(
        Object.entries(valid).filter(([k]) => k !== field),
      );
      expect(ok(FsTabSetRequestSchema, rest)).toBe(true);
    },
  );
  it("rejects a field the contract does not name", () => {
    expect(ok(FsTabSetRequestSchema, { ...valid, _used: false })).toBe(false);
  });
});

// The two create tasks have no form (tasks never do), so their request schemas are read from the
// bundled contract, the source the generated types come from.
interface Schema {
  $ref?: string;
  enum?: unknown[];
  pattern?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean;
}
// The bundle's own type is too wide to read schemas from; this is the part the tests read.
const contract = bundle as unknown as {
  components: { schemas: Record<string, Schema> };
};
const deref = (s: Schema): Schema =>
  s.$ref ? deref(contract.components.schemas[s.$ref.split("/").pop()!]!) : s;
const request = (name: string) => deref({ $ref: name });
const field = (name: string, prop: string) =>
  deref(request(name).properties![prop]!);

describe("creating a file system on one disk", () => {
  const body = request("FileSystemMgmtCreateRequest");
  it("requires the device and the type, and nothing else", () => {
    expect(body.required).toEqual(["devicefile", "type"]);
    expect(body.additionalProperties).toBe(false);
  });
  it("offers EXT4, XFS, BTRFS and F2FS only (no JFS)", () => {
    expect(field("FileSystemMgmtCreateRequest", "type").enum).toEqual([
      "ext4",
      "xfs",
      "btrfs",
      "f2fs",
    ]);
  });
  it("takes the device in OMV's devicefile format", () => {
    expect(field("FileSystemMgmtCreateRequest", "devicefile").pattern).toBe(
      "^/dev(/disk/by-id)?/[a-zA-Z0-9/.:_+-]+$",
    );
  });
});

describe("combining disks into one BTRFS file system", () => {
  const body = request("FileSystemMgmtCreateBtrfsRequest");
  const devicefiles = new RegExp(
    field("FileSystemMgmtCreateBtrfsRequest", "devicefiles").pattern!,
    "u",
  );
  it("requires the profile and the devices, and sends no label", () => {
    expect(body.required).toEqual(["profile", "devicefiles"]);
    expect(body.additionalProperties).toBe(false);
    expect(Object.keys(body.properties!)).not.toContain("label");
  });
  it("offers single, RAID0, RAID1 and RAID10 (not dup)", () => {
    expect(field("FileSystemMgmtCreateBtrfsRequest", "profile").enum).toEqual([
      "single",
      "raid0",
      "raid1",
      "raid10",
    ]);
  });
  it.each([
    "/dev/sdb,/dev/sdc",
    "/dev/sdb,/dev/sdc,/dev/sdd,/dev/sde",
    "/dev/disk/by-id/ata-Example_HDD_EXAMPLE-SERIAL-0101,/dev/nvme0n1",
  ])("accepts %s, each part a device file OMV accepts", (value) => {
    expect(devicefiles.test(value)).toBe(true);
    for (const part of value.split(",")) {
      expect(OMV.devicefile(part)).toBe(true);
    }
  });
  it.each([
    ["one device (one disk uses the plain create)", "/dev/sdb"],
    ["a list with a space", "/dev/sdb, /dev/sdc"],
    ["a trailing comma", "/dev/sdb,/dev/sdc,"],
    ["an empty part", "/dev/sdb,,/dev/sdc"],
    ["a part outside /dev", "/dev/sdb,/tmp/sdc"],
    ["a part with a shell character", "/dev/sdb,/dev/sdc;reboot"],
    ["nothing", ""],
  ])("rejects %s", (_why, value) => {
    expect(devicefiles.test(value)).toBe(false);
  });
});
