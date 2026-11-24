// SPDX-License-Identifier: GPL-3.0-or-later
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  DiskDevice,
  SmartDevice,
  SmartDeviceList,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import type { DiskUseResult } from "../disks/diskUse.ts";
import { BAY_SLOTS, bayRole, baySlots } from "./driveBay.ts";

const DISKS = CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value
  .data as unknown as DiskDevice[];
const CHECK = (
  JSON.parse(
    CONTRACT_EXAMPLES.execGetOutput.smartDevicesFinished.value.output,
  ) as SmartDeviceList
).data;
const known = (uses: DiskUseResult["uses"]): DiskUseResult => ({
  known: true,
  uses,
  blockers: [],
  unused: [],
});
const FS = { label: "data", type: "ext4", device: "/dev/sdb1", size: null };

describe("baySlots", () => {
  const uses = new Map<string, DiskUseResult>([
    ["nvme0n1", known([{ kind: "system" }])],
    ["sda", known([{ kind: "none" }])],
    ["sdb", known([{ kind: "fsInUse", fs: FS, used: true }])],
  ]);

  it("says Not checked for every disk before a check, and links each to its page", () => {
    const slots = baySlots(DISKS, uses, true, undefined);
    expect(slots.map((s) => s.devicename)).toEqual(
      DISKS.map((d) => d.devicename),
    );
    expect(slots.every((s) => s.health.kind === "notChecked")).toBe(true);
    expect(slots.every((s) => s.linked)).toBe(true);
    expect(slots[0]).toMatchObject({
      devicename: "nvme0n1",
      kind: "ssd",
      role: { kind: "system" },
      temperature: 30,
    });
    expect(slots[1]).toMatchObject({ kind: "disk", role: { kind: "none" } });
    expect(slots[2]?.role).toEqual({ kind: "fs", name: "data" });
  });

  it("takes each disk's reading from the check, and No reading for one it did not list", () => {
    const check: SmartDevice[] = [
      {
        ...CHECK[0]!,
        canonicaldevicefile: "/dev/sda",
        overallstatus: "BAD_SECTOR",
      },
    ];
    const slots = baySlots(DISKS, uses, true, check);
    expect(slots[0]?.health).toEqual({ kind: "noReading" });
    expect(slots[1]?.health).toEqual({ kind: "read", status: "warning" });
  });

  it("fails closed: no role at all while the inventory is not known, never Empty", () => {
    const slots = baySlots(DISKS, uses, false, undefined);
    expect(slots.every((s) => s.role === null)).toBe(true);
    const unknown = new Map([
      ["sda", { ...known([{ kind: "unknown" }]), known: false }],
    ]);
    expect(baySlots(DISKS, unknown, true, undefined)[1]?.role).toBeNull();
  });

  it("says a disk in standby is asleep, and shows at most twelve slots", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...DISKS[1]!,
      devicename: `sd${String.fromCharCode(97 + i)}`,
      canonicaldevicefile: `/dev/sd${String.fromCharCode(97 + i)}`,
      powermode: i === 0 ? "STANDBY" : "ACTIVE or IDLE",
    }));
    const slots = baySlots(many, new Map(), true, undefined);
    expect(slots).toHaveLength(BAY_SLOTS);
    expect(slots[0]?.asleep).toBe(true);
    expect(slots[1]?.asleep).toBe(false);
  });

  it("does not link a name the route would refuse", () => {
    const odd = [{ ...DISKS[1]!, devicename: "../x" }];
    expect(baySlots(odd, new Map(), true, undefined)[0]?.linked).toBe(false);
  });
});

describe("bayRole", () => {
  it.each([
    [
      { kind: "fsSetUp", fs: FS },
      { kind: "notMounted", name: "data" },
    ],
    [
      { kind: "fsUnused", fs: { ...FS, label: "" } },
      { kind: "notMounted", name: "/dev/sdb1" },
    ],
    [{ kind: "fsCreating" }, { kind: "creating" }],
    [{ kind: "swap" }, { kind: "swap" }],
    [
      { kind: "raid", array: { name: "nas:0", devicefile: "/dev/md0" } },
      { kind: "raid", name: "md0" },
    ],
    [
      { kind: "zfs", pool: "tank" },
      { kind: "zfs", pool: "tank" },
    ],
    [{ kind: "wiping" }, { kind: "wiping" }],
    [{ kind: "wiped", at: 1 }, { kind: "none" }],
    [{ kind: "unknown" }, null],
  ] as const)("%o is %o", (use, role) => {
    expect(bayRole(use)).toEqual(role);
  });
});
