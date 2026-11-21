// SPDX-License-Identifier: GPL-3.0-or-later
// Which devices Flow A offers for new storage (phase 5 file-systems design 6.3; owner, P1): each disk is
// placed by both the server's candidate list and the disks slice's disk-use model, and the stricter one
// wins. The server erases any device it is given (UX audit B14), so this is the interface's own
// safeguard. Fail closed: when any input is missing, nothing is offered. Pure, so each rule is tested by
// itself.
import type {
  ConfiguredFilesystem,
  DetectedFilesystem,
  DiskDevice,
  FilesystemCandidate,
  FileSystemMgmtCreateBtrfsRequestProfile,
  MdArray,
} from "@omv-webui/react-api-omv/generated";
import {
  belongsTo,
  byDeviceOrder,
  diskNames,
  diskUse,
  partitionParent,
  type FsRef,
  type SessionMarks,
  type WipeBlocker,
} from "../disks/diskUse.ts";
import { parseByteCount } from "../format/format.ts";
import { arrayState, type ArrayState } from "../raid/raidModel.ts";

/** A disk offered for new storage. */
export interface DiskChoice {
  kind: "disk";
  group: "empty" | "reuse";
  disk: DiskDevice;
  /** For "Erase and reuse": the file systems on it that are not used on this NAS (none: "not empty"). */
  holds: FsRef[];
  /** When a wipe of it succeeded in this session. */
  wipedAt?: number;
}

/** A RAID array offered for new storage (only with the RAID plugin). */
export interface ArrayChoice {
  kind: "raid";
  group: "raid";
  array: MdArray;
}

export type StorageChoice = DiskChoice | ArrayChoice;

/** A device that is not offered, with why. */
export type Unusable =
  | { kind: "disk"; disk: DiskDevice; blockers: WipeBlocker[] }
  | { kind: "unplaced"; device: string }
  /** An array short of a disk, not running or in an Unknown state (RAID design 9.3, D16). */
  | { kind: "array"; array: MdArray; state: ArrayState };

export type StorageChoices =
  | { state: "loading" }
  | { state: "failed"; error: unknown }
  | {
      state: "known";
      empty: DiskChoice[];
      raid: ArrayChoice[];
      reuse: DiskChoice[];
      unusable: Unusable[];
    };

export interface ChoiceInputs {
  /** FileSystemMgmt.getCandidatesBg's result; undefined until the task has ended. */
  candidates: readonly FilesystemCandidate[] | undefined;
  disks: readonly DiskDevice[] | undefined;
  configured: readonly ConfiguredFilesystem[] | undefined;
  detected: readonly DetectedFilesystem[] | undefined;
  /** null when the RAID plugin is not installed. */
  arrays: readonly MdArray[] | null | undefined;
}

/** A failed input, for its message; the first one wins. */
export interface ChoiceFailure {
  failed: boolean;
  error: unknown;
}

/** 6.3: the groups, and every device that is not offered with its reason. */
export function storageChoices(
  inputs: ChoiceInputs,
  marks: (disk: DiskDevice) => SessionMarks,
  failure: ChoiceFailure = { failed: false, error: undefined },
): StorageChoices {
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
  const placed = new Set<string>();
  const empty: DiskChoice[] = [];
  const reuse: DiskChoice[] = [];
  const raid: ArrayChoice[] = [];
  const unusable: Unusable[] = [];

  for (const disk of byDeviceOrder(disks.filter((d) => !d.israid))) {
    const names = diskNames(disk);
    for (const name of names) {
      if (offered.has(name)) {
        placed.add(name);
      }
    }
    const inCandidates = [...names].some((name) => offered.has(name));
    const sessionMarks = marks(disk);
    const use = diskUse(disk, { configured, detected, arrays }, sessionMarks);
    if (!use.known) {
      return { state: "loading" };
    }
    if (use.blockers.length > 0) {
      unusable.push({ kind: "disk", disk, blockers: use.blockers });
      continue;
    }
    // The stricter wins: a disk the server offers but on which the model still sees a file system is
    // erased first, as one the server does not offer.
    const choice: DiskChoice = {
      kind: "disk",
      group: inCandidates && use.unused.length === 0 ? "empty" : "reuse",
      disk,
      holds: use.unused,
      ...(sessionMarks.wipedAt === undefined
        ? {}
        : { wipedAt: sessionMarks.wipedAt }),
    };
    (choice.group === "empty" ? empty : reuse).push(choice);
  }

  for (const array of arrays ?? []) {
    if (!offered.has(array.devicefile)) {
      continue;
    }
    placed.add(array.devicefile);
    const holdsFs = [...configured, ...detected].some(
      (fs) =>
        fs.canonicaldevicefile === array.devicefile ||
        fs.parentdevicefile === array.devicefile ||
        partitionParent(fs.canonicaldevicefile) === array.devicefile,
    );
    // The RAID slice's stricter rule (its 9.3, D16): an array short of a disk, not running or in a
    // state this page cannot read is not offered; one that is synchronising or reshaping is.
    const state = arrayState(array);
    if (state.status === "critical" || state.status === "unknown") {
      unusable.push({ kind: "array", array, state });
    } else if (!holdsFs && !array._used) {
      raid.push({ kind: "raid", group: "raid", array });
    } else {
      unusable.push({ kind: "unplaced", device: array.devicefile });
    }
  }

  for (const candidate of candidates) {
    if (!placed.has(candidate.devicefile)) {
      unusable.push({ kind: "unplaced", device: candidate.devicefile });
    }
  }
  return { state: "known", empty, raid, reuse, unusable };
}

/** Every offered choice, in the groups' order (6.4 A1). */
export const allChoices = (
  choices: Extract<StorageChoices, { state: "known" }>,
): StorageChoice[] => [...choices.empty, ...choices.raid, ...choices.reuse];

/** A choice's stable key: the disk's stable device file, or the array's device file. */
export const choiceKey = (choice: StorageChoice): string =>
  choice.kind === "disk" ? choice.disk.devicefile : choice.array.devicefile;

/** The device name a choice is confirmed by and shown as: "/dev/sdb", "/dev/md0". */
export const choiceDevice = (choice: StorageChoice): string =>
  choice.kind === "disk"
    ? choice.disk.canonicaldevicefile
    : choice.array.devicefile;

// ---- Finding the new file system (6.6 step 4, 7.3) ------------------------------------------------

export type FoundFilesystem =
  | { kind: "found"; fs: DetectedFilesystem }
  | { kind: "notFound" }
  | { kind: "ambiguous" };

/**
 * The new file system among the mount candidates: the one on the chosen devices (a partition of the
 * disk, the disk itself, or for several disks every one of them). Exactly one must match.
 */
export function findNewFilesystem(
  candidates: readonly DetectedFilesystem[],
  devices: readonly Pick<
    DiskDevice,
    "canonicaldevicefile" | "devicefile" | "devicelinks"
  >[],
): FoundFilesystem {
  const each = devices.map((d) => diskNames(d));
  const on = (fs: DetectedFilesystem, names: ReadonlySet<string>) =>
    [fs.parentdevicefile, fs.canonicaldevicefile, ...fs.devicefiles].some((d) =>
      belongsTo(d, names),
    );
  const matches = candidates.filter((fs) =>
    devices.length === 1
      ? each[0] !== undefined && on(fs, each[0])
      : each.every((names) => on(fs, names)),
  );
  const byUuid = new Map<string, DetectedFilesystem>();
  for (const fs of matches) {
    byUuid.set(fs.uuid || fs.devicefile, fs);
  }
  const unique = [...byUuid.values()];
  if (unique.length === 0) {
    return { kind: "notFound" };
  }
  return unique.length === 1 && unique[0] !== undefined
    ? { kind: "found", fs: unique[0] }
    : { kind: "ambiguous" };
}

/** The same, for a RAID array: the file system made directly on it. */
export function findOnArray(
  candidates: readonly DetectedFilesystem[],
  arrayDevice: string,
): FoundFilesystem {
  return findNewFilesystem(candidates, [
    {
      canonicaldevicefile: arrayDevice,
      devicefile: arrayDevice,
      devicelinks: [],
    },
  ]);
}

// ---- Combine disks (7.1) -------------------------------------------------------------------------

export type BtrfsProfile = FileSystemMgmtCreateBtrfsRequestProfile;

/** The profiles offered, in 7.1's order; RAID1 is the default (P3). */
export const PROFILES: readonly BtrfsProfile[] = [
  "raid1",
  "raid10",
  "raid0",
  "single",
];

/** How many disks a way of combining needs. */
export const minDisks = (profile: BtrfsProfile): number =>
  profile === "raid10" ? 4 : 2;

/** About how much can be used (D18): an estimate in the browser, said with "about". */
export function btrfsUsable(
  sizes: readonly number[],
  profile: BtrfsProfile,
): number {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const largest = sizes.reduce((max, size) => Math.max(max, size), 0);
  switch (profile) {
    case "raid1":
    case "raid10":
      return Math.min(total / 2, total - largest);
    case "raid0":
      return total - Math.max(0, largest - (total - largest));
    case "single":
      return total;
  }
}

/** A disk's size in bytes, 0 when it has none. */
export const diskBytes = (disk: Pick<DiskDevice, "size">): number =>
  parseByteCount(disk.size) ?? 0;

/** The typed confirmation for several disks: every device name, one space between, in order (7.2). */
export const devicesToType = (devices: readonly string[]): string =>
  devices.join(" ");

// ---- Where a file system is (1.3, column "On") -------------------------------------------------

export type Placed = Pick<
  ConfiguredFilesystem,
  "parentdevicefile" | "canonicaldevicefile" | "devicefiles"
> & { hasmultipledevices?: boolean | ""; status?: number };

/** The devices a file system is on: every disk of a multi-device one, else its parent device. */
export function placesOf(fs: Placed): string[] {
  const devices =
    fs.hasmultipledevices === true && fs.devicefiles.length > 0
      ? fs.devicefiles.map(partitionParent)
      : [
          fs.parentdevicefile !== ""
            ? fs.parentdevicefile
            : partitionParent(fs.canonicaldevicefile),
        ];
  return [...new Set(devices.filter((d) => d !== ""))];
}

/** The disk a detected file system is on, from DiskMgmt.getList. */
export const diskOf = (
  fs: Pick<DetectedFilesystem, "parentdevicefile" | "canonicaldevicefile">,
  disks: readonly DiskDevice[] | undefined,
): DiskDevice | undefined =>
  disks?.find((d) => {
    const names = diskNames(d);
    return (
      belongsTo(fs.parentdevicefile, names) ||
      belongsTo(fs.canonicaldevicefile, names)
    );
  });
