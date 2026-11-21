// SPDX-License-Identifier: GPL-3.0-or-later
// Which disks may go into an array (phase 5 RAID design 0.7; owner, P1). Creating an array and adding a
// disk overwrite the disks they are given, and the server checks nothing about them, so each disk is
// placed by both the plugin's candidate list (MdMgmt.getCandidates) and the disks slice's disk-use
// model, and the stricter wins. Fail closed: when any input is missing, nothing is offered. Pure.
//
// USB: the plugin leaves out a disk connected by USB, by udev's ID_BUS=usb (read from its source on the
// test VM). DiskMgmt.getList does not report that property; udev names such a disk's stable link
// /dev/disk/by-id/usb-…, so that link is what this page reads. `hotpluggable` is not USB: the VM's
// SATA disks report it true and the plugin offers them (observed).
import type {
  ConfiguredFilesystem,
  DetectedFilesystem,
  DiskDevice,
  MdArray,
  MdDisk,
} from "@omv-webui/react-api-omv/generated";
import {
  belongsTo,
  byDeviceOrder,
  diskNames,
  diskUse,
  type FsRef,
  type SessionMarks,
  type WipeBlocker,
} from "../disks/diskUse.ts";
import { parseByteCount } from "../format/format.ts";

/** A disk offered for an array. */
export interface RaidDiskChoice {
  group: "empty" | "reuse";
  disk: DiskDevice;
  /** For "Erase and reuse": the file systems on it not used on this NAS (none: "not empty"). */
  holds: FsRef[];
}

export type RaidUnusable =
  | { kind: "blocked"; disk: DiskDevice; blockers: WipeBlocker[] }
  | { kind: "usb"; disk: DiskDevice }
  | { kind: "small"; disk: DiskDevice; min: number };

export type RaidChoices =
  | { state: "loading" }
  | { state: "failed"; error: unknown }
  | {
      state: "known";
      empty: RaidDiskChoice[];
      reuse: RaidDiskChoice[];
      unusable: RaidUnusable[];
    };

export interface RaidChoiceInputs {
  /** MdMgmt.getCandidates; undefined until read. */
  candidates: readonly MdDisk[] | undefined;
  disks: readonly DiskDevice[] | undefined;
  configured: readonly ConfiguredFilesystem[] | undefined;
  detected: readonly DetectedFilesystem[] | undefined;
  /** MdMgmt.enumerateDevices; the plugin is installed on these pages, so never null here. */
  arrays: readonly MdArray[] | undefined;
}

/** A disk connected by USB, by the stable link udev gives it for ID_BUS=usb. */
export const isUsb = (disk: Pick<DiskDevice, "devicefile" | "devicelinks">) =>
  [disk.devicefile, ...disk.devicelinks].some(
    (link) =>
      link.startsWith("/dev/disk/by-id/usb-") ||
      /^\/dev\/disk\/by-path\/.*-usb-/.test(link),
  );

export const bytesOf = (size: string): number => parseByteCount(size) ?? 0;

/**
 * 0.7's groups. `minSize`, when adding, is the smallest member's size: a smaller disk is "Too small".
 * `exclude` names devices that may not be offered whatever the lists say (the array's own members).
 */
export function raidChoices(
  inputs: RaidChoiceInputs,
  marks: (disk: DiskDevice) => SessionMarks,
  failure: { failed: boolean; error: unknown } = {
    failed: false,
    error: undefined,
  },
  minSize: number | null = null,
): RaidChoices {
  if (failure.failed) {
    return { state: "failed", error: failure.error };
  }
  const { candidates, disks, configured, detected, arrays } = inputs;
  if (
    candidates === undefined ||
    disks === undefined ||
    configured === undefined ||
    detected === undefined ||
    arrays === undefined
  ) {
    return { state: "loading" };
  }
  const offered = new Set(candidates.map((c) => c.devicefile));
  const empty: RaidDiskChoice[] = [];
  const reuse: RaidDiskChoice[] = [];
  const unusable: RaidUnusable[] = [];
  for (const disk of byDeviceOrder(disks)) {
    const names = diskNames(disk);
    const inCandidates = [...names].some((name) => offered.has(name));
    const use = diskUse(disk, { configured, detected, arrays }, marks(disk));
    if (!use.known) {
      return { state: "loading" };
    }
    if (use.blockers.length > 0) {
      unusable.push({ kind: "blocked", disk, blockers: use.blockers });
      continue;
    }
    if (isUsb(disk)) {
      unusable.push({ kind: "usb", disk });
      continue;
    }
    if (minSize !== null && bytesOf(disk.size) < minSize) {
      unusable.push({ kind: "small", disk, min: minSize });
      continue;
    }
    // The stricter wins: a disk the plugin offers but on which the model still sees a file system is
    // erased first, as one the plugin does not offer (it may carry an old array's marks, which the
    // plugin does not offer until wiped: observed).
    const choice: RaidDiskChoice = {
      group: inCandidates && use.unused.length === 0 ? "empty" : "reuse",
      disk,
      holds: use.unused,
    };
    (choice.group === "empty" ? empty : reuse).push(choice);
  }
  return { state: "known", empty, reuse, unusable };
}

/** Whether a disk is in the plugin's list now, by any of its names (after an erase, 3.4 step 2). */
export const isCandidate = (
  candidates: readonly MdDisk[],
  disk: Pick<DiskDevice, "canonicaldevicefile" | "devicefile" | "devicelinks">,
): boolean => {
  const names = diskNames(disk);
  return candidates.some((c) => names.has(c.devicefile));
};

/** The disks of an array, by their names in DiskMgmt.getList, for "exactly the chosen disks". */
export function sameDisks(
  members: readonly string[],
  chosen: readonly Pick<
    DiskDevice,
    "canonicaldevicefile" | "devicefile" | "devicelinks"
  >[],
): boolean {
  if (members.length !== chosen.length) {
    return false;
  }
  return chosen.every((disk) => {
    const names = diskNames(disk);
    return members.some((m) => names.has(m));
  });
}

/** The disk of DiskMgmt.getList a member device names (a disk or one of its partitions). */
export const diskOf = (
  device: string,
  disks: readonly DiskDevice[] | undefined,
): DiskDevice | undefined =>
  disks?.find((d) => belongsTo(device, diskNames(d)));

/** The smallest member's size, from getSlaves, for "at least {{size}} large". */
export const smallestMember = (
  slaves: readonly MdDisk[] | undefined,
): number | null => {
  const sizes = (slaves ?? []).map((s) => bytesOf(s.size)).filter((n) => n > 0);
  return sizes.length === 0 ? null : Math.min(...sizes);
};
