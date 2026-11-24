// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's drive bay (dashboard spec 9.1): one slot per disk of DiskMgmt.getList, in device
// order, with the session's disk-health reading, what the disk holds in short words, and one quiet
// fact. Pure, so each rule is tested by itself.
//
// Fail closed: what a disk holds is said only when every input of the disk inventory was read
// (disks/diskUse.ts); until then the role is left out, never "Empty", so the picture never suggests
// that a disk is free. A disk the check did not list has "No reading"; before any check, "Not checked".
import type {
  DiskDevice,
  SmartDevice,
} from "@omv-webui/react-api-omv/generated";
import type { DiskUse, DiskUseResult } from "../disks/diskUse.ts";
import { isAsleep, isDiskName } from "../disks/diskWords.ts";
import { diskState, diskTemperature } from "./dashboard.ts";

/** At most this many slots; the rest are counted after the bay (spec 9.1). */
export const BAY_SLOTS = 12;

/** What a disk holds, in the bay's short words. */
export type BayRole =
  | { kind: "system" }
  | { kind: "fs"; name: string }
  | { kind: "notMounted"; name: string }
  | { kind: "creating" }
  | { kind: "swap" }
  | { kind: "raid"; name: string }
  | { kind: "zfs"; pool: string }
  | { kind: "wiping" }
  | { kind: "none" };

/** The slot's health: before a check, not in the check, or the check's reading. */
export type BayHealth =
  | { kind: "notChecked" }
  | { kind: "noReading" }
  | { kind: "read"; status: "ok" | "warning" | "critical" | "unknown" };

export interface BaySlot {
  /** The kernel name, the slot's id and its words: "sda". */
  devicename: string;
  /** An NVMe disk is solid-state; anything else draws the generic face (DiskMgmt.getList has no rotation rate). */
  kind: "ssd" | "disk";
  health: BayHealth;
  /** Null while what the disk holds is not known (fail closed). */
  role: BayRole | null;
  /** Whole degrees from DiskMgmt.getList, when it has one. */
  temperature: number | null;
  /** In standby or asleep: checking it wakes it. */
  asleep: boolean;
  /** Whether the slot links to the disk's page (a name the route accepts). */
  linked: boolean;
}

const fsWords = (fs: { label: string; device: string }): string =>
  fs.label.trim() !== "" ? fs.label : fs.device;

/** "/dev/md0" to "md0". */
const baseName = (devicefile: string): string =>
  devicefile.split("/").at(-1) ?? devicefile;

/** The first use of a disk, in the order the Disks page lists them, as the bay's role. */
export function bayRole(use: DiskUse | undefined): BayRole | null {
  switch (use?.kind) {
    case "system":
      return { kind: "system" };
    case "fsInUse":
      return { kind: "fs", name: fsWords(use.fs) };
    case "fsSetUp":
    case "fsUnused":
      return { kind: "notMounted", name: fsWords(use.fs) };
    case "fsCreating":
      return { kind: "creating" };
    case "swap":
      return { kind: "swap" };
    case "raid":
      // The array's device ("md0"), short and the same as the RAID page's; mdadm's own name
      // ("nas:0") carries the host name and says less.
      return { kind: "raid", name: baseName(use.array.devicefile) };
    case "zfs":
      return { kind: "zfs", pool: use.pool };
    case "wiping":
      return { kind: "wiping" };
    case "wiped":
    case "none":
      return { kind: "none" };
    case "unknown":
    case undefined:
      return null;
  }
}

/** A disk's health in the session's check, matched by its device file. */
export function bayHealth(
  disk: Pick<DiskDevice, "canonicaldevicefile">,
  check: readonly SmartDevice[] | undefined,
): BayHealth {
  if (check === undefined) {
    return { kind: "notChecked" };
  }
  const reading = check.find(
    (d) => d.canonicaldevicefile === disk.canonicaldevicefile,
  );
  return reading === undefined
    ? { kind: "noReading" }
    : { kind: "read", status: diskState(reading.overallstatus).status };
}

/**
 * The bay's slots, in the order given (device order), at most `BAY_SLOTS`. `usesKnown` is the
 * inventory's state: anything but every input read leaves every role out.
 */
export function baySlots(
  disks: readonly DiskDevice[],
  uses: ReadonlyMap<string, DiskUseResult>,
  usesKnown: boolean,
  check: readonly SmartDevice[] | undefined,
): BaySlot[] {
  return disks.slice(0, BAY_SLOTS).map((disk) => {
    const use = uses.get(disk.devicename);
    return {
      devicename: disk.devicename,
      kind: disk.devicename.startsWith("nvme") ? "ssd" : "disk",
      health: bayHealth(disk, check),
      role: usesKnown && use?.known === true ? bayRole(use.uses[0]) : null,
      temperature: diskTemperature(disk.temperature),
      asleep: isAsleep(disk.powermode),
      linked: isDiskName(disk.devicename),
    };
  });
}
