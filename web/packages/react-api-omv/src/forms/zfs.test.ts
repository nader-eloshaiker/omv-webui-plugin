// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS requests (phase 5 ZFS design 12.1): the contract accepts what the interface sends, which
// is far stricter than the plugin's datamodels (rpc.zfs.*, which check almost nothing), and every
// value it accepts is one OMV and the plugin would take. Mutations are checked through their
// generated form schemas; the reads and the delete task have no form, so their request schemas are
// checked from the bundled contract with the transport's own validator.
import bundle from "@omv-webui/spec-api-omv/openapi.json" with { type: "json" };
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import type { Schema, SchemaTable } from "../contract/types.ts";
import { validate } from "../transport/schema.ts";
import {
  ZfsAddObjectRequestSchema,
  ZfsAddPoolRequestSchema,
  ZfsClearPoolRequestSchema,
  ZfsDeviceOfflineRequestSchema,
  ZfsDeviceOnlineRequestSchema,
  ZfsDeviceReplaceRequestSchema,
  ZfsQuickSnapshotRequestSchema,
  ZfsRollbackSnapshotRequestSchema,
  ZfsScrubPoolRequestSchema,
  ZfsSetPropertiesRequestSchema,
  ZfsStopScrubRequestSchema,
} from "./generated/index.ts";

const ok = (schema: v.GenericSchema, value: unknown) =>
  v.safeParse(schema, value).success;

// OMV's `devicefile` format (datamodel/schema.inc), which rpc.zfs.addpool checks for each disk.
const omvDevicefile = (s: string) =>
  /^\/dev(\/disk\/by-id)?\/[a-z0-9/.:_+-]+$/i.test(s);

const SDB =
  "/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-0003";
const SDC =
  "/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-0004";
const SDD =
  "/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-0005";
const long = (n: number) => `a${"b".repeat(n - 1)}`;

// The bundle with its references as the transport's schema table names them, so a request schema
// is checked by the validator that checks replies.
const bundled = bundle as unknown as {
  components: { schemas: Record<string, unknown> };
};
const byName = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(byName)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).map(([k, x]) => [
            k,
            k === "$ref" && typeof x === "string"
              ? x.split("/").pop()
              : byName(x),
          ]),
        )
      : value;
const TABLE = byName(bundled.components.schemas) as SchemaTable;
const accepts = (schemaName: string, value: unknown) =>
  validate(value, { $ref: schemaName } satisfies Schema, TABLE).length === 0;

describe("a new pool's name (0.7)", () => {
  const pool = (name: string) => ({
    pooltype: "mirror",
    force: false,
    mountpoint: "",
    name,
    devices: [SDB, SDC],
    devalias: "id",
    ashift: true,
    ashiftval: 12,
    casesensitivity: "sensitive",
    compress: true,
    compresstype: "lz4",
  });
  it.each([
    "tank",
    "Tank_2",
    "a",
    "media1",
    "logs",
    "etcetera",
    "my-pool",
    long(32),
  ])("accepts %s", (name) => {
    expect(ok(ZfsAddPoolRequestSchema, pool(name))).toBe(true);
  });
  it.each([
    ["empty", ""],
    ["33 characters", long(33)],
    ["a digit first", "1tank"],
    ["a hyphen first", "-tank"],
    ["an underscore first", "_tank"],
    ["a space", "tank pool"],
    ["a slash", "tank/media"],
    ["a full stop", "tank.old"],
    ["a colon", "tank:old"],
    ["a letter outside ASCII", "tänk"],
    ["a line feed", "tank\n"],
    ["ZFS's word mirror", "mirror"],
    ["a name starting with mirror", "mirrorpool"],
    ["ZFS's word in capitals", "MIRROR"],
    ["raidz", "raidz"],
    ["a name starting with raidz", "Raidz1"],
    ["draid", "draid2"],
    ["spare", "spares"],
    ["log", "log"],
    ["log in capitals", "LOG"],
    ["the system folder etc", "etc"],
    ["the system folder Etc", "Etc"],
    ["the system folder lib64", "lib64"],
    ["the system folder srv", "srv"],
    ["the system folder media", "media"],
    ["the system folder tmp", "TMP"],
  ])("rejects %s", (_why, name) => {
    expect(ok(ZfsAddPoolRequestSchema, pool(name))).toBe(false);
  });
});

describe("creating a pool takes only the interface's fixed settings", () => {
  const pool = (over: Record<string, unknown> = {}) => ({
    pooltype: "mirror",
    force: false,
    mountpoint: "",
    name: "tank",
    devices: [SDB, SDC],
    devalias: "id",
    ashift: true,
    ashiftval: 12,
    casesensitivity: "sensitive",
    compress: true,
    compresstype: "lz4",
    ...over,
  });
  it.each(["mirror", "raidz1", "raidz2", "raidz3", "basic"])(
    "accepts the layout %s",
    (pooltype) => {
      expect(ok(ZfsAddPoolRequestSchema, pool({ pooltype }))).toBe(true);
    },
  );
  it.each([
    { name: "another layout", over: { pooltype: "draid" } },
    {
      name: "stripe, which the plugin calls basic",
      over: { pooltype: "stripe" },
    },
    { name: "forcing", over: { force: true } },
    { name: "a folder of its own", over: { mountpoint: "/srv/tank" } },
    { name: "disks by path", over: { devalias: "path" } },
    { name: "disks by kernel name", over: { devalias: "dev" } },
    { name: "no block size", over: { ashift: false } },
    { name: "another block size", over: { ashiftval: 9 } },
    {
      name: "case-insensitive names",
      over: { casesensitivity: "insensitive" },
    },
    { name: "compression off", over: { compress: false } },
    { name: "another compression", over: { compresstype: "zstd" } },
    { name: "no disk", over: { devices: [] } },
    { name: "a disk twice", over: { devices: [SDB, SDB] } },
    { name: "a field the contract does not name", over: { atime: "off" } },
  ])("rejects $name", ({ over }) => {
    expect(ok(ZfsAddPoolRequestSchema, pool(over))).toBe(false);
  });
  it.each(["compress", "compresstype", "name", "devices", "pooltype", "force"])(
    "requires %s",
    (field) => {
      const body = Object.fromEntries(
        Object.entries(pool()).filter(([key]) => key !== field),
      );
      expect(ok(ZfsAddPoolRequestSchema, body)).toBe(false);
    },
  );
});

describe("a disk by its stable by-id name, the only way a request names a disk", () => {
  it.each([
    SDB,
    `${SDB}-part1`,
    "/dev/disk/by-id/nvme-eui.0000000000000001",
    "/dev/disk/by-id/wwn-0x5000c500a1b2c3d4",
  ])("accepts %s, which OMV's device-file format accepts too", (disk) => {
    expect(ok(ZfsAddPoolRequestSchema.entries.devices, [disk])).toBe(true);
    expect(
      ok(ZfsDeviceOfflineRequestSchema, { pool: "tank", device: disk }),
    ).toBe(true);
    expect(omvDevicefile(disk)).toBe(true);
  });
  it.each([
    "",
    "/dev/sdb",
    "/dev/sdb1",
    "/dev/disk/by-path/pci-0000:01:02.0-ata-3",
    "/dev/disk/by-id/",
    "/dev/disk/by-id/.",
    "/dev/disk/by-id/..",
    "/dev/disk/by-id/../../sda",
    "/dev/disk/by-id/-x",
    "/dev/disk/by-id/a b",
    `${SDB}\n`,
    "5813342277894411042",
  ])("rejects %j", (disk) => {
    expect(ok(ZfsAddPoolRequestSchema.entries.devices, [disk])).toBe(false);
    expect(
      ok(ZfsDeviceOfflineRequestSchema, { pool: "tank", device: disk }),
    ).toBe(false);
    expect(
      ok(ZfsDeviceReplaceRequestSchema, {
        pool: "tank",
        olddevice: `${SDC}-part1`,
        newdevice: disk,
      }),
    ).toBe(false);
  });
});

describe("an existing pool's name", () => {
  const schemas = [
    ZfsScrubPoolRequestSchema,
    ZfsStopScrubRequestSchema,
    ZfsClearPoolRequestSchema,
  ];
  it.each(["tank", "Tank.old:2-b_c", long(64)])("accepts %s", (name) => {
    for (const schema of schemas) {
      expect(ok(schema, { name })).toBe(true);
    }
    expect(accepts("ZfsPoolNameRequest", { name })).toBe(true);
  });
  it.each([
    "",
    "-rf",
    "1tank",
    "tank/media",
    "tank media",
    "tank@snap",
    "../tank",
    long(65),
  ])("rejects %j", (name) => {
    for (const schema of schemas) {
      expect(ok(schema, { name })).toBe(false);
    }
    expect(accepts("ZfsPoolNameRequest", { name })).toBe(false);
  });
  it("rejects a field the contract does not name", () => {
    expect(ok(ZfsScrubPoolRequestSchema, { name: "tank", force: true })).toBe(
      false,
    );
  });
});

describe("a pool's or file system's full name", () => {
  const snap = (name: string) => ({ name, recursive: false });
  it.each([
    "tank",
    "tank/media",
    "tank/0data",
    "tank/a.b:c-d_e",
    "tank/a/b/c/d/e/f/g/h",
  ])("accepts %s", (name) => {
    expect(ok(ZfsQuickSnapshotRequestSchema, snap(name))).toBe(true);
  });
  it.each([
    ["nine parts after the pool", "tank/a/b/c/d/e/f/g/h/i"],
    ["an empty part", "tank//media"],
    ["a slash at the end", "tank/"],
    ["a slash first", "/tank"],
    ["a part .", "tank/."],
    ["a part ..", "tank/.."],
    ["a hyphen first in a part", "tank/-x"],
    ["a space", "tank/my media"],
    ["a snapshot", "tank/media@x"],
    [
      "more than 255 characters",
      `tank/${long(60)}/${long(60)}/${long(60)}/${long(60)}/${long(60)}`,
    ],
  ])("rejects %s", (_why, name) => {
    expect(ok(ZfsQuickSnapshotRequestSchema, snap(name))).toBe(false);
  });
  it("requires recursive, as a boolean", () => {
    expect(ok(ZfsQuickSnapshotRequestSchema, { name: "tank/media" })).toBe(
      false,
    );
    expect(
      ok(ZfsQuickSnapshotRequestSchema, { name: "tank/media", recursive: 1 }),
    ).toBe(false);
  });
});

describe("a snapshot's full name", () => {
  it.each(["tank/media@2026-11-21_12-00-00", "tank@before", "tank/a/b@x.y:z"])(
    "accepts %s",
    (name) => {
      expect(ok(ZfsRollbackSnapshotRequestSchema, { name })).toBe(true);
    },
  );
  it.each([
    "tank/media",
    "tank/media@",
    "tank/media@-x",
    "tank/media@a@b",
    "tank/media@a/b",
    "@x",
    "tank/media@a b",
  ])("rejects %j", (name) => {
    expect(ok(ZfsRollbackSnapshotRequestSchema, { name })).toBe(false);
  });
});

describe("adding a file system", () => {
  const add = (over: Record<string, unknown> = {}) => ({
    type: "filesystem",
    path: "tank",
    name: "media",
    mountpoint: "",
    ...over,
  });
  it.each(["media", "0data", "a.b-c_d", long(64)])(
    "accepts the name %s",
    (name) => {
      expect(ok(ZfsAddObjectRequestSchema, add({ name }))).toBe(true);
    },
  );
  it.each([
    ["empty", ""],
    [".", "."],
    ["..", ".."],
    ["a full stop first", ".hidden"],
    ["a hyphen first", "-x"],
    ["a slash, which would make parents", "a/b"],
    ["a space", "a b"],
    ["a colon", "a:b"],
    ["65 characters", long(65)],
  ])("rejects the name %s", (_why, name) => {
    expect(ok(ZfsAddObjectRequestSchema, add({ name }))).toBe(false);
  });
  it.each([
    { name: "a snapshot", over: { type: "snapshot" } },
    { name: "a volume", over: { type: "volume" } },
    { name: "a clone", over: { type: "clone" } },
    { name: "a nested file system", over: { path: "tank/media" } },
    { name: "a folder of its own", over: { mountpoint: "/srv/media" } },
    { name: "a compression of its own", over: { compression: "zstd" } },
    { name: "a record size", over: { recordsize: "1M" } },
  ])("rejects $name", ({ over }) => {
    expect(ok(ZfsAddObjectRequestSchema, add(over))).toBe(false);
  });
});

describe("a file system's size limit and compression", () => {
  const set = (properties: unknown[], over: Record<string, unknown> = {}) => ({
    type: "Filesystem",
    name: "tank/media",
    properties,
    ...over,
  });
  const quota = (value: string) => ({
    property: "quota",
    value,
    modified: true,
  });
  const compression = (value: string) => ({
    property: "compression",
    value,
    modified: true,
  });
  it.each([
    [[quota("none")]],
    [[quota("1G")]],
    [[quota("500G")]],
    [[quota("2T")]],
    [[quota("999999G")]],
    [[compression("lz4")]],
    [[compression("off")]],
    [[quota("6G"), compression("off")]],
  ])("accepts %j", (properties) => {
    expect(ok(ZfsSetPropertiesRequestSchema, set(properties))).toBe(true);
  });
  it.each([
    ["no property", []],
    ["three properties", [quota("1G"), compression("lz4"), quota("2G")]],
    ["a fraction", [quota("1.5G")]],
    ["zero", [quota("0G")]],
    ["mebibytes", [quota("100M")]],
    ["binary suffixes", [quota("1Gi")]],
    ["no suffix", [quota("1073741824")]],
    ["an empty limit", [quota("")]],
    ["another compression", [compression("zstd")]],
    ["compression on", [compression("on")]],
    [
      "another property",
      [{ property: "recordsize", value: "1M", modified: true }],
    ],
    ["an item not marked modified", [{ ...quota("1G"), modified: false }]],
    ["an item without modified", [{ property: "quota", value: "1G" }]],
  ])("rejects %s", (_why, properties) => {
    expect(ok(ZfsSetPropertiesRequestSchema, set(properties))).toBe(false);
  });
  it.each([
    { name: "a pool", over: { type: "Pool", name: "tank" } },
    { name: "a volume", over: { type: "Volume" } },
    { name: "a snapshot", over: { type: "Snapshot", name: "tank/media@x" } },
  ])("rejects the properties of $name", ({ over }) => {
    expect(ok(ZfsSetPropertiesRequestSchema, set([quota("1G")], over))).toBe(
      false,
    );
  });
});

describe("taking a disk offline and bringing it back, replacing it", () => {
  const disk = { pool: "tank", device: `${SDC}-part1` };
  it("take the pool and one disk", () => {
    expect(ok(ZfsDeviceOfflineRequestSchema, disk)).toBe(true);
    expect(ok(ZfsDeviceOnlineRequestSchema, disk)).toBe(true);
    expect(ok(ZfsDeviceOfflineRequestSchema, { ...disk, pool: "-f" })).toBe(
      false,
    );
    expect(ok(ZfsDeviceOnlineRequestSchema, { pool: "tank" })).toBe(false);
  });
  it("replace takes the old disk as the pool lists it and the new one by its by-id name", () => {
    expect(
      ok(ZfsDeviceReplaceRequestSchema, {
        pool: "tank",
        olddevice: `${SDC}-part1`,
        newdevice: SDD,
      }),
    ).toBe(true);
    expect(
      ok(ZfsDeviceReplaceRequestSchema, { pool: "tank", olddevice: SDC }),
    ).toBe(false);
  });
});

describe("the reports and the disks of a pool (no form: read from the contract)", () => {
  it.each([
    { type: "Pool", name: "tank" },
    { type: "Filesystem", name: "tank" },
    { type: "Filesystem", name: "tank/media" },
  ])("accepts the report of $type $name", (body) => {
    expect(accepts("ZfsGetObjectDetailsRequest", body)).toBe(true);
  });
  it.each([
    { type: "Pool", name: "tank/media" },
    { type: "Volume", name: "tank/vm" },
    { type: "Snapshot", name: "tank/media@x" },
    { type: "Pool", name: "-x" },
    { type: "Pool" },
    { type: "Pool", name: "tank", extra: true },
  ])("rejects %j", (body) => {
    expect(accepts("ZfsGetObjectDetailsRequest", body)).toBe(false);
  });
});

describe("deleting (a task: read from the contract)", () => {
  it.each([
    {
      type: "Snapshot",
      name: "tank/media@2026-11-21_12-00-00",
      mp: "",
      recursive: false,
    },
    {
      type: "Filesystem",
      name: "tank/media",
      mp: "/tank/media",
      recursive: false,
    },
    { type: "Pool", name: "tank", mp: "/tank", recursive: false },
  ])("accepts a $type", (body) => {
    expect(accepts("ZfsDeleteObjectRequest", body)).toBe(true);
  });
  it.each([
    ["a volume", { type: "Volume", name: "tank/vm", mp: "", recursive: false }],
    [
      "recursively",
      {
        type: "Filesystem",
        name: "tank/media",
        mp: "/tank/media",
        recursive: true,
      },
    ],
    [
      "the pool's own folder as a file system",
      { type: "Filesystem", name: "tank", mp: "/tank", recursive: false },
    ],
    [
      "a file system without its folder",
      { type: "Filesystem", name: "tank/media", mp: "", recursive: false },
    ],
    [
      "a snapshot with a folder",
      {
        type: "Snapshot",
        name: "tank/media@x",
        mp: "/tank/media",
        recursive: false,
      },
    ],
    [
      "a file system named as a snapshot",
      {
        type: "Filesystem",
        name: "tank/media@x",
        mp: "/tank/media",
        recursive: false,
      },
    ],
    [
      "a pool named as a file system",
      { type: "Pool", name: "tank/media", mp: "/tank/media", recursive: false },
    ],
    [
      "the root folder",
      { type: "Pool", name: "tank", mp: "/", recursive: false },
    ],
    [
      "a folder with ..",
      { type: "Pool", name: "tank", mp: "/tank/../etc", recursive: false },
    ],
    [
      "a relative folder",
      { type: "Pool", name: "tank", mp: "tank", recursive: false },
    ],
    ["no recursive", { type: "Pool", name: "tank", mp: "/tank" }],
    [
      "a field the contract does not name",
      {
        type: "Pool",
        name: "tank",
        mp: "/tank",
        recursive: false,
        force: true,
      },
    ],
  ])("rejects %s", (_why, body) => {
    expect(accepts("ZfsDeleteObjectRequest", body)).toBe(false);
  });
});
