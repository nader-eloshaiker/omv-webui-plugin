// SPDX-License-Identifier: GPL-3.0-or-later
// The RAID requests (phase 5 RAID design 12): the generated form schemas accept what the contract
// accepts, which is stricter than the plugin's datamodels (rpc.mdmgmt.*), and nothing OMV would
// refuse. Each device file the contract accepts is also checked against OMV's own regular
// expression for the `devicefile` format, from openmediavault's PHP sources (OMV 8.6.1).
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  MdMgmtAddRequestSchema,
  MdMgmtCreateRequestSchema,
  MdMgmtDeleteRequestSchema,
  MdMgmtGrowRequestSchema,
  MdMgmtRemoveRequestSchema,
  MdMgmtSetSyncActionRequestSchema,
} from "./generated/index.ts";

const ok = (schema: v.GenericSchema, value: unknown) =>
  v.safeParse(schema, value).success;

// OMV's `devicefile` format (datamodel/schema.inc).
const omvDevicefile = (s: string) =>
  /^\/dev(\/disk\/by-id)?\/[a-z0-9/.:_+-]+$/i.test(s);

const SDB =
  "/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-0003";
const SDC =
  "/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-0004";
const SDD =
  "/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-0005";

describe("an array's device file, the only way a request names an array", () => {
  it.each(["/dev/md0", "/dev/md9", "/dev/md127", "/dev/md255"])(
    "accepts %s, as OMV does",
    (devicefile) => {
      expect(ok(MdMgmtDeleteRequestSchema, { devicefile })).toBe(true);
      expect(omvDevicefile(devicefile)).toBe(true);
    },
  );
  it.each([
    "",
    "/dev/md",
    "/dev/md1000",
    "/dev/md/0",
    "/dev/md/media",
    "/dev/md0p1",
    "/dev/sdb",
    "/dev/disk/by-id/md-uuid-00000000:00000000:00000000:00000001",
    "md0",
    "/dev/md0 ",
    "/dev/md0\n",
  ])("rejects %j", (devicefile) => {
    expect(ok(MdMgmtDeleteRequestSchema, { devicefile })).toBe(false);
  });
  it.each([
    { name: "no device file", value: {} },
    { name: "a number", value: { devicefile: 0 } },
    {
      name: "a field the contract does not name",
      value: { devicefile: "/dev/md0", force: true },
    },
  ])("rejects $name", ({ value }) => {
    expect(ok(MdMgmtDeleteRequestSchema, value)).toBe(false);
  });
});

describe("create", () => {
  const create = (over: Record<string, unknown> = {}) => ({
    devices: [SDB, SDC],
    name: "",
    level: "mirror",
    ...over,
  });
  it.each(["mirror", "raid5", "raid6", "raid10", "stripe"])(
    "accepts the level %s",
    (level) => {
      expect(ok(MdMgmtCreateRequestSchema, create({ level }))).toBe(true);
    },
  );
  it("accepts disks by their kernel names too, as OMV does", () => {
    for (const d of ["/dev/sdb", "/dev/sdc"]) {
      expect(omvDevicefile(d)).toBe(true);
    }
    expect(
      ok(
        MdMgmtCreateRequestSchema,
        create({ devices: ["/dev/sdb", "/dev/sdc"] }),
      ),
    ).toBe(true);
  });
  it.each([
    { name: "one disk", over: { devices: [SDB] } },
    { name: "no disk", over: { devices: [] } },
    { name: "a disk twice", over: { devices: [SDB, SDB] } },
    {
      name: "a path that is not a device file",
      over: { devices: [SDB, "/tmp/disk"] },
    },
    {
      name: "a device file with a space",
      over: { devices: [SDB, "/dev/sd c"] },
    },
    { name: "a device file as a string, not a list", over: { devices: SDB } },
    { name: "a name", over: { name: "media" } },
    { name: "a name of one space", over: { name: " " } },
    { name: "a name of shell words", over: { name: "x; true" } },
    { name: "no name", over: { name: undefined } },
    { name: "mdadm's own level word raid1", over: { level: "raid1" } },
    { name: "the level raid0", over: { level: "raid0" } },
    { name: "the level linear", over: { level: "linear" } },
    { name: "the level raid4", over: { level: "raid4" } },
    { name: "an empty level", over: { level: "" } },
    { name: "a field the contract does not name", over: { force: true } },
  ])("rejects $name", ({ over }) => {
    expect(ok(MdMgmtCreateRequestSchema, create(over))).toBe(false);
  });
  it("accepts four disks for the levels that need them", () => {
    const four = ["/dev/sdb", "/dev/sdc", "/dev/sdd", "/dev/sde"];
    expect(
      ok(MdMgmtCreateRequestSchema, create({ devices: four, level: "raid6" })),
    ).toBe(true);
  });
});

describe("add and remove take exactly one disk", () => {
  it.each([
    { name: "add", schema: MdMgmtAddRequestSchema, disk: SDD },
    { name: "remove", schema: MdMgmtRemoveRequestSchema, disk: "/dev/sdb" },
  ])("$name accepts one", ({ schema, disk }) => {
    expect(ok(schema, { devicefile: "/dev/md0", devices: [disk] })).toBe(true);
  });
  it.each([
    { name: "add, none", schema: MdMgmtAddRequestSchema, devices: [] },
    { name: "add, two", schema: MdMgmtAddRequestSchema, devices: [SDC, SDD] },
    {
      name: "add, not a device file",
      schema: MdMgmtAddRequestSchema,
      devices: ["sdd"],
    },
    { name: "remove, none", schema: MdMgmtRemoveRequestSchema, devices: [] },
    {
      name: "remove, two",
      schema: MdMgmtRemoveRequestSchema,
      devices: ["/dev/sdb", "/dev/sdc"],
    },
    {
      name: "remove, not a device file",
      schema: MdMgmtRemoveRequestSchema,
      devices: ["../sdb"],
    },
  ])("rejects $name", ({ schema, devices }) => {
    expect(ok(schema, { devicefile: "/dev/md0", devices })).toBe(false);
  });
  it.each([
    { name: "add", schema: MdMgmtAddRequestSchema },
    { name: "remove", schema: MdMgmtRemoveRequestSchema },
  ])("$name rejects an array named any other way", ({ schema }) => {
    expect(ok(schema, { devicefile: "/dev/sdb", devices: ["/dev/sdc"] })).toBe(
      false,
    );
    expect(ok(schema, { devicefile: "/dev/md/0", devices: ["/dev/sdc"] })).toBe(
      false,
    );
  });
});

describe("grow takes one or more disks, each once", () => {
  it.each([[[SDD]], [[SDC, SDD]]])("accepts %j", (devices) => {
    expect(
      ok(MdMgmtGrowRequestSchema, { devicefile: "/dev/md0", devices }),
    ).toBe(true);
  });
  it.each([
    { name: "none", devices: [] },
    { name: "a disk twice", devices: [SDD, SDD] },
    { name: "not a device file", devices: ["sde"] },
  ])("rejects $name", ({ devices }) => {
    expect(
      ok(MdMgmtGrowRequestSchema, { devicefile: "/dev/md0", devices }),
    ).toBe(false);
  });
});

describe("setSyncAction takes check and idle, never repair", () => {
  it.each(["check", "idle"])("accepts %s", (action) => {
    expect(
      ok(MdMgmtSetSyncActionRequestSchema, { devicefile: "/dev/md0", action }),
    ).toBe(true);
  });
  it.each(["repair", "resync", "frozen", "", "CHECK"])(
    "rejects %j",
    (action) => {
      expect(
        ok(MdMgmtSetSyncActionRequestSchema, {
          devicefile: "/dev/md0",
          action,
        }),
      ).toBe(false);
    },
  );
});
