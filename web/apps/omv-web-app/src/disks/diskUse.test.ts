// SPDX-License-Identifier: GPL-3.0-or-later
// The wipe safeguard's rules (phase 5 disks design 0.6; owner, P1 to P5), one by one.
import type {
  ConfiguredFilesystem,
  DetectedFilesystem,
  DiskDevice,
  MdArray,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  belongsTo,
  byDeviceOrder,
  diskNames,
  diskUse,
  hasUntraceableStorage,
  partitionParent,
  type UseInputs,
} from "./diskUse.ts";

const disk = (over: Partial<DiskDevice> = {}): DiskDevice => ({
  devicename: "sdb",
  canonicaldevicefile: "/dev/sdb",
  devicefile: "/dev/disk/by-id/ata-Example_HDD_EXAMPLE-SERIAL-0102",
  devicelinks: [
    "/dev/disk/by-id/ata-Example_HDD_EXAMPLE-SERIAL-0102",
    "/dev/disk/by-path/pci-0000:00:17.0-ata-2",
  ],
  model: "Example HDD",
  size: "4000787030016",
  description: "",
  vendor: "ATA",
  serialnumber: "EXAMPLE-SERIAL-0102",
  wwn: "",
  israid: false,
  isroot: false,
  isreadonly: false,
  powermode: "ACTIVE or IDLE",
  temperature: "",
  hotpluggable: false,
  ...over,
});

const detected = (
  over: Partial<DetectedFilesystem> = {},
): DetectedFilesystem => ({
  devicename: "sdb1",
  devicefile: "/dev/disk/by-uuid/00000000-0000-4000-8000-000000000201",
  predictabledevicefile: "",
  canonicaldevicefile: "/dev/sdb1",
  parentdevicefile: "/dev/sdb",
  devlinks: [],
  uuid: "00000000-0000-4000-8000-000000000201",
  label: "",
  type: "ext4",
  mounted: false,
  mountpoint: "",
  blocks: "-1",
  size: "-1",
  available: "-1",
  used: "-1",
  percentage: -1,
  description: "",
  hasmultipledevices: false,
  devicefiles: ["/dev/sdb1"],
  comment: "",
  _readonly: false,
  _used: false,
  ...over,
});

const configured = (
  over: Partial<ConfiguredFilesystem> = {},
): ConfiguredFilesystem => ({
  ...detected(),
  status: 1,
  mounted: true,
  mountpoint: "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000201",
  size: "4000000000000",
  ...over,
});

const array = (over: Partial<MdArray> = {}): MdArray => ({
  _used: true,
  name: "nas:0",
  devicefile: "/dev/md0",
  uuid: "0a1b2c3d:4e5f6071:8293a4b5:c6d7e8f9",
  level: "raid1",
  numdevices: 2,
  devices: ["/dev/sdb", "/dev/sdc"],
  size: "4000652656640",
  state: "clean",
  syncaction: "idle",
  description: "",
  ...over,
});

const nothing: UseInputs = { configured: [], detected: [], arrays: null };

describe("partitionParent", () => {
  it.each([
    ["/dev/sdb3", "/dev/sdb"],
    ["/dev/sdaa12", "/dev/sdaa"],
    ["/dev/nvme0n1p2", "/dev/nvme0n1"],
    ["/dev/mmcblk0p1", "/dev/mmcblk0"],
    ["/dev/md0p1", "/dev/md0"],
    ["/dev/disk/by-id/ata-X_SERIAL-part1", "/dev/disk/by-id/ata-X_SERIAL"],
    ["/dev/sdb", "/dev/sdb"],
    ["/dev/nvme0n1", "/dev/nvme0n1"],
    ["/dev/mmcblk0", "/dev/mmcblk0"],
    ["/dev/md0", "/dev/md0"],
    ["/dev/mapper/crypt-data", "/dev/mapper/crypt-data"],
  ])("%s belongs to %s", (device, parent) => {
    expect(partitionParent(device)).toBe(parent);
  });

  it("matches a partition by any of the disk's names, and never a neighbour", () => {
    const names = diskNames(disk());
    expect(belongsTo("/dev/sdb2", names)).toBe(true);
    expect(
      belongsTo(
        "/dev/disk/by-id/ata-Example_HDD_EXAMPLE-SERIAL-0102-part1",
        names,
      ),
    ).toBe(true);
    expect(belongsTo("/dev/sdba1", names)).toBe(false);
    expect(belongsTo("/dev/sd", names)).toBe(false);
    expect(belongsTo("", names)).toBe(false);
  });
});

describe("diskUse", () => {
  it("finds nothing on an empty disk, and allows the wipe", () => {
    const result = diskUse(disk(), nothing);
    expect(result).toEqual({
      known: true,
      uses: [{ kind: "none" }],
      blockers: [],
      unused: [],
    });
  });

  it("refuses the system disk and a read-only disk (P1)", () => {
    expect(diskUse(disk({ isroot: true }), nothing).blockers).toEqual([
      { kind: "system" },
    ]);
    expect(diskUse(disk({ isroot: true }), nothing).uses[0]).toEqual({
      kind: "system",
    });
    expect(diskUse(disk({ isreadonly: true }), nothing).blockers).toEqual([
      { kind: "readOnly" },
    ]);
  });

  it("refuses a disk with a mounted or used file system, naming it (P1)", () => {
    const mounted = diskUse(disk(), {
      ...nothing,
      configured: [configured({ label: "data" })],
    });
    expect(mounted.blockers).toEqual([
      {
        kind: "fsInUse",
        used: false,
        fs: {
          label: "data",
          type: "ext4",
          device: "/dev/sdb1",
          size: 4e12,
          address: expect.any(String) as unknown,
        },
      },
    ]);
    const used = diskUse(disk(), {
      ...nothing,
      configured: [configured({ mounted: false, _used: true })],
    });
    expect(used.blockers[0]).toMatchObject({ kind: "fsInUse", used: true });
  });

  it("refuses a disk whose file system is set up but not mounted, even before Apply (P1)", () => {
    const result = diskUse(disk(), {
      ...nothing,
      configured: [configured({ mounted: false, status: 1 })],
    });
    expect(result.uses).toEqual([
      { kind: "fsSetUp", fs: expect.objectContaining({ device: "/dev/sdb1" }) },
    ]);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]?.kind).toBe("fsSetUp");
  });

  it("refuses a disk whose set-up file system is missing but still names the disk", () => {
    const result = diskUse(disk(), {
      ...nothing,
      configured: [
        configured({
          status: 3,
          mounted: false,
          canonicaldevicefile: "",
          devicefiles: [],
          parentdevicefile: "",
          devicefile:
            "/dev/disk/by-id/ata-Example_HDD_EXAMPLE-SERIAL-0102-part1",
        }),
      ],
    });
    expect(result.blockers.map((b) => b.kind)).toEqual(["fsSetUp"]);
  });

  it("refuses a disk while a file system is being created on it", () => {
    const result = diskUse(disk(), {
      ...nothing,
      configured: [
        configured({
          status: 2,
          mounted: false,
          canonicaldevicefile: "",
          devicefiles: [],
          parentdevicefile: "/dev/sdb",
        }),
      ],
    });
    expect(result.uses).toEqual([{ kind: "fsCreating" }]);
    expect(result.blockers).toEqual([{ kind: "fsCreating" }]);
  });

  it("refuses a disk that holds swap space, which only enumerateFilesystems lists (P5)", () => {
    const result = diskUse(disk(), {
      ...nothing,
      detected: [detected({ type: "swap", canonicaldevicefile: "/dev/sdb2" })],
    });
    expect(result.uses).toEqual([{ kind: "swap" }]);
    expect(result.blockers).toEqual([{ kind: "swap" }]);
  });

  it("refuses a RAID member, whole disk or partition (P1)", () => {
    const whole = diskUse(disk(), { ...nothing, arrays: [array()] });
    expect(whole.blockers).toEqual([
      { kind: "raid", array: { name: "nas:0", devicefile: "/dev/md0" } },
    ]);
    const part = diskUse(disk(), {
      ...nothing,
      arrays: [array({ devices: ["/dev/sdb1", "/dev/sdc1"], name: "" })],
    });
    expect(part.uses).toEqual([
      { kind: "raid", array: { name: "", devicefile: "/dev/md0" } },
    ]);
    expect(
      diskUse(
        disk({
          devicename: "sdd",
          canonicaldevicefile: "/dev/sdd",
          devicefile: "/dev/sdd",
          devicelinks: [],
        }),
        { ...nothing, arrays: [array()] },
      ).blockers,
    ).toEqual([]);
  });

  it("refuses a disk being wiped in this session", () => {
    const result = diskUse(disk(), nothing, { wiping: true });
    expect(result.uses).toEqual([{ kind: "wiping" }]);
    expect(result.blockers).toEqual([{ kind: "wiping" }]);
  });

  it("allows a file system not used on this NAS, and names it for the confirmation", () => {
    const foreign = detected({ label: "old-pc", type: "ntfs" });
    const result = diskUse(disk(), { ...nothing, detected: [foreign] });
    expect(result.blockers).toEqual([]);
    expect(result.uses).toEqual([
      {
        kind: "fsUnused",
        fs: { label: "old-pc", type: "ntfs", device: "/dev/sdb1", size: null },
      },
    ]);
    expect(result.unused).toHaveLength(1);
  });

  it("does not count a configured file system twice when both reads list it", () => {
    const fs = configured();
    const result = diskUse(disk(), {
      ...nothing,
      configured: [fs],
      detected: [detected({ mounted: true })],
    });
    expect(result.uses).toHaveLength(1);
    expect(result.blockers).toHaveLength(1);
  });

  it("refuses a file system mounted without OMV's entry (the system's own boot partition)", () => {
    const result = diskUse(disk(), {
      ...nothing,
      detected: [
        detected({ mounted: true, mountpoint: "/boot/efi", type: "vfat" }),
      ],
    });
    expect(result.blockers.map((b) => b.kind)).toEqual(["fsInUse"]);
  });

  it("says Empty after a wipe in this session, until a read finds something", () => {
    expect(
      diskUse(disk(), nothing, { wiping: false, wipedAt: 1000 }).uses,
    ).toEqual([{ kind: "wiped", at: 1000 }]);
    expect(
      diskUse(
        disk(),
        { ...nothing, detected: [detected()] },
        { wiping: false, wipedAt: 1000 },
      ).uses[0]?.kind,
    ).toBe("fsUnused");
  });

  it.each([
    ["the configured file systems", { configured: undefined }],
    ["the detected file systems", { detected: undefined }],
    ["the RAID arrays", { arrays: undefined }],
  ])("fails closed when %s could not be read", (_what, missing) => {
    const result = diskUse(disk(), { ...nothing, ...missing });
    expect(result.known).toBe(false);
    expect(result.uses).toEqual([{ kind: "unknown" }]);
    expect(result.blockers).toEqual([{ kind: "unchecked" }]);
  });

  it("keeps the system-disk refusal beside the unchecked one", () => {
    const result = diskUse(disk({ isroot: true }), {
      ...nothing,
      configured: undefined,
    });
    expect(result.blockers.map((b) => b.kind)).toEqual(["system", "unchecked"]);
  });

  it("lists the uses in reading order and the blockers in the page's order", () => {
    const result = diskUse(disk({ isroot: true }), {
      configured: [configured({ label: "data" })],
      detected: [detected({ type: "swap", canonicaldevicefile: "/dev/sdb5" })],
      arrays: [array({ devices: ["/dev/sdb3"] })],
    });
    expect(result.uses.map((u) => u.kind)).toEqual([
      "system",
      "fsInUse",
      "swap",
      "raid",
    ]);
    expect(result.blockers.map((b) => b.kind)).toEqual([
      "system",
      "fsInUse",
      "swap",
      "raid",
    ]);
  });
});

describe("hasUntraceableStorage", () => {
  const disks = [disk()];

  it("is false when every file system is on a known disk or array", () => {
    expect(
      hasUntraceableStorage(disks, {
        configured: [configured()],
        detected: [],
        arrays: [array({ devicefile: "/dev/md0" })],
      }),
    ).toBe(false);
    expect(
      hasUntraceableStorage(disks, {
        configured: [
          configured({
            parentdevicefile: "/dev/md0",
            canonicaldevicefile: "/dev/md0",
            devicefiles: ["/dev/md0"],
          }),
        ],
        detected: [],
        arrays: [array()],
      }),
    ).toBe(false);
  });

  it("is true for a file system on an encrypted device, LVM or an array without the plugin (P4)", () => {
    const mapper = configured({
      parentdevicefile: "/dev/dm-0",
      canonicaldevicefile: "/dev/dm-0",
      devicefile: "/dev/mapper/crypt-data",
      devicefiles: ["/dev/dm-0"],
    });
    expect(
      hasUntraceableStorage(disks, {
        configured: [mapper],
        detected: [],
        arrays: null,
      }),
    ).toBe(true);
    const handMade = configured({
      parentdevicefile: "/dev/md127",
      canonicaldevicefile: "/dev/md127",
      devicefile: "/dev/md127",
      devicefiles: ["/dev/md127"],
    });
    expect(
      hasUntraceableStorage(disks, {
        configured: [handMade],
        detected: [],
        arrays: null,
      }),
    ).toBe(true);
  });

  it("ignores swap, file systems not mounted and not set up, and missing ones", () => {
    expect(
      hasUntraceableStorage(disks, {
        configured: [
          configured({
            status: 3,
            parentdevicefile: "",
            devicefiles: [],
            canonicaldevicefile: "",
          }),
        ],
        detected: [
          detected({
            type: "swap",
            parentdevicefile: "/dev/dm-1",
            canonicaldevicefile: "/dev/dm-1",
            devicefiles: ["/dev/dm-1"],
          }),
        ],
        arrays: null,
      }),
    ).toBe(false);
  });

  it("is false while an input is missing (the wipe is refused then anyway)", () => {
    expect(
      hasUntraceableStorage(disks, { ...nothing, configured: undefined }),
    ).toBe(false);
  });
});

describe("byDeviceOrder", () => {
  it("sorts by the kernel name in natural order", () => {
    expect(
      byDeviceOrder([
        { devicename: "sdb" },
        { devicename: "nvme0n1" },
        { devicename: "sda" },
        { devicename: "sdaa" },
      ]).map((d) => d.devicename),
    ).toEqual(["nvme0n1", "sda", "sdaa", "sdb"]);
  });
});
