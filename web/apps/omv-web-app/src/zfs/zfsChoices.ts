// SPDX-License-Identifier: GPL-3.0-or-later
// Which disks may go into a pool, or take the place of a pool's disk (phase 5 ZFS design 0.8; owner,
// P3). Creating a pool and replacing a disk overwrite the disks they are given, so each disk is placed
// by both the plugin's candidate list (Zfs.getEmptyCandidates) and the disks slice's disk-use model,
// and the stricter wins: the RAID slice's placement (raidChoices), with the ZFS pools' own disks in the
// model. The contract sends a disk only by its stable by-id name, so a disk without one is not offered.
//
// What the test VM showed (design section 20): the disks of a deleted pool, and a disk replaced out of
// a pool, keep ZFS's partition table and are not candidates until they are wiped. The model finds no
// file system on them, so they are offered under "Erase and reuse", with the quick wipe first.
import type {
  DiskDevice,
  ZfsCandidate,
} from "@omv-webui/react-api-omv/generated";
import { diskNames, type SessionMarks } from "../disks/diskUse.ts";
import { taskLines } from "../filesystems/terminal.ts";
import {
  bytesOf,
  diskOf,
  raidChoices,
  type RaidChoiceInputs,
  type RaidDiskChoice,
  type RaidUnusable,
} from "../raid/raidChoices.ts";
import { BY_ID, type PoolDisk } from "./zfsModel.ts";

/** A disk offered, with the stable name the server is sent. */
export interface ZfsDiskChoice extends RaidDiskChoice {
  /** For an empty disk, the plugin's own name for it; for one to erase, its by-id link. */
  byId: string;
}

export type ZfsUnusable = RaidUnusable | { kind: "noId"; disk: DiskDevice };

export type ZfsChoices =
  | { state: "loading" }
  | { state: "failed"; error: unknown }
  | {
      state: "known";
      empty: ZfsDiskChoice[];
      reuse: ZfsDiskChoice[];
      unusable: ZfsUnusable[];
    };

export interface ZfsChoiceInputs extends Omit<RaidChoiceInputs, "candidates"> {
  candidates: readonly ZfsCandidate[] | undefined;
}

/** The plugin's by-id name for a disk, when it offers it. */
export const candidateOf = (
  candidates: readonly ZfsCandidate[],
  disk: Pick<DiskDevice, "canonicaldevicefile" | "devicefile" | "devicelinks">,
): ZfsCandidate | undefined => {
  const names = diskNames(disk);
  return candidates.find((c) => names.has(c.devicefile));
};

/** A disk's own by-id link, the name sent for a disk to erase and reuse (0.8). */
export const byIdLink = (
  disk: Pick<DiskDevice, "devicefile" | "devicelinks">,
): string | null =>
  [disk.devicefile, ...disk.devicelinks].find(
    (link) =>
      BY_ID.test(link) &&
      !/-part\d+$/.test(link) &&
      !link.startsWith("/dev/disk/by-id/wwn-"),
  ) ??
  [disk.devicefile, ...disk.devicelinks].find(
    (link) => BY_ID.test(link) && !/-part\d+$/.test(link),
  ) ??
  null;

/** 0.8's groups for a new pool (`minSize` null) or a replacement (the smallest size it may have). */
export function zfsChoices(
  inputs: ZfsChoiceInputs,
  marks: (disk: DiskDevice) => SessionMarks,
  failure: { failed: boolean; error: unknown } = {
    failed: false,
    error: undefined,
  },
  minSize: number | null = null,
): ZfsChoices {
  const placed = raidChoices(inputs, marks, failure, minSize);
  if (placed.state !== "known") {
    return placed;
  }
  const candidates = inputs.candidates ?? [];
  const unusable: ZfsUnusable[] = [...placed.unusable];
  const named = (choice: RaidDiskChoice): ZfsDiskChoice | null => {
    const offered =
      choice.group === "empty"
        ? candidateOf(candidates, choice.disk)?.devicefile
        : undefined;
    const byId =
      offered !== undefined && BY_ID.test(offered)
        ? offered
        : byIdLink(choice.disk);
    if (byId === null) {
      unusable.push({ kind: "noId", disk: choice.disk });
      return null;
    }
    return { ...choice, byId };
  };
  const empty = placed.empty.map(named).filter((c) => c !== null);
  const reuse = placed.reuse.map(named).filter((c) => c !== null);
  return { state: "known", empty, reuse, unusable };
}

/** ZFS's report as lines: the plugin joins them with a line feed and a carriage return. */
export const reportLines = (text: string): string[] =>
  taskLines(text.replace(/\r/g, ""));

/** A pool's disk for people: its device on this NAS, else the name ZFS prints (without "-part1"). */
export function deviceOf(
  d: PoolDisk,
  disks: readonly DiskDevice[] | undefined,
): string {
  const disk = d.role === "missing" ? undefined : diskOf(d.path, disks);
  return (
    disk?.canonicaldevicefile ??
    (d.disk.name.split("/").pop() ?? d.disk.name).replace(/-part\d+$/, "")
  );
}

/** The smallest size a replacement must have: the disk's, or the smallest left in its group. */
export function minSizeFor(
  d: PoolDisk,
  all: readonly PoolDisk[],
  disks: readonly DiskDevice[] | undefined,
): number | null {
  const own = d.role === "missing" ? undefined : diskOf(d.path, disks);
  if (own !== undefined && bytesOf(own.size) > 0) {
    return bytesOf(own.size);
  }
  const sizes = all
    .filter((x) => x.group === d.group && x !== d)
    .map((x) => diskOf(x.path, disks))
    .map((x) => (x === undefined ? 0 : bytesOf(x.size)))
    .filter((n) => n > 0);
  return sizes.length === 0 ? null : Math.min(...sizes);
}
