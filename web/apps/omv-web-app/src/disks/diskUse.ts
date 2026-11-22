// SPDX-License-Identifier: GPL-3.0-or-later
// What a disk is used for, and whether it may be wiped (phase 5 disks design 0.6, 1.3.1, 3.1; owner,
// P1 to P5). The server does not refuse to wipe a disk that is in use (UX audit B14), so this is the
// interface's own safeguard: every refusal below is decided here, from the reads that do not wake a
// disk. Pure, so each rule is tested by itself.
//
// Fail closed: when any input could not be read (or has not been read yet), nothing is known about
// what the disks hold, and no disk can be wiped until a read succeeds.
import type {
  ConfiguredFilesystem,
  DetectedFilesystem,
  DiskDevice,
  MdArray,
} from "@omv-webui/react-api-omv/generated";
import { fsAddress, isZfs, sameUuid, zfsPool } from "../filesystems/fsModel.ts";
import { naturalCompare, parseByteCount } from "../format/format.ts";

/** A file system as the "Used for" words and the wipe confirmation name it. */
export interface FsRef {
  /** The file system's own label; empty when it has none. */
  label: string;
  /** The type, such as "ext4". */
  type: string;
  /** The device it is on, such as "/dev/sdb1", for "EXT4 on /dev/sdb1". */
  device: string;
  /** Bytes, when the reply has a reading (only a mounted file system has one). */
  size: number | null;
  /** The file system's page, for one OMV has set up (file-systems design 9); absent otherwise. */
  address?: string | null;
}

export interface ArrayRef {
  /** mdadm's name, such as "nas:0"; empty when it has none. */
  name: string;
  devicefile: string;
}

export type DiskUse =
  | { kind: "system" }
  | { kind: "fsInUse"; fs: FsRef; used: boolean }
  | { kind: "fsSetUp"; fs: FsRef }
  | { kind: "fsCreating" }
  | { kind: "fsUnused"; fs: FsRef }
  | { kind: "swap" }
  | { kind: "raid"; array: ArrayRef }
  | { kind: "zfs"; pool: string }
  | { kind: "wiping" }
  | { kind: "wiped"; at: number }
  | { kind: "none" }
  | { kind: "unknown" };

/** Why a disk cannot be wiped, in the order the page lists them (3.1). */
export type WipeBlocker =
  | { kind: "system" }
  | { kind: "readOnly" }
  | { kind: "fsInUse"; fs: FsRef; used: boolean }
  | { kind: "fsSetUp"; fs: FsRef }
  | { kind: "fsCreating" }
  | { kind: "swap" }
  | { kind: "raid"; array: ArrayRef }
  | { kind: "zfs"; pool: string }
  | { kind: "wiping" }
  | { kind: "unchecked" };

/** A ZFS pool's disks, from Zfs.getPoolStatus and that pool's Zfs.getPoolDevices (the ZFS design 10.2). */
export interface ZfsPoolDisks {
  pool: string;
  /** Every device path ZFS opened the pool's disks by: data disks, spares and the other classes. */
  devices: readonly string[];
}

/** The reads 0.6 decides from. `undefined` means not read (still loading, or the read failed). */
export interface UseInputs {
  /** FileSystemMgmt.getList: the file systems OMV has set up or is creating. */
  configured: readonly ConfiguredFilesystem[] | undefined;
  /** FileSystemMgmt.enumerateFilesystems: every file system the system detects, swap included. */
  detected: readonly DetectedFilesystem[] | undefined;
  /** MdMgmt.enumerateDevices; `null` when the RAID plugin is not installed (the 404 reply). */
  arrays: readonly MdArray[] | null | undefined;
  /**
   * The ZFS pools' disks (the ZFS design 0.8, 10.2); `null` when the ZFS plugin is not installed (its
   * 404). An empty list while the file-system lists report ZFS file systems is a failed read (D10).
   */
  zfs: readonly ZfsPoolDisks[] | null | undefined;
}

/** What this session knows about a disk beyond the reads: a wipe running now, or one that ended. */
export interface SessionMarks {
  wiping: boolean;
  /** When a wipe of this disk succeeded in this session (this computer's clock). */
  wipedAt?: number;
}

export interface DiskUseResult {
  /** False when an input is missing: "Not known", and the wipe is refused (fail closed). */
  known: boolean;
  /** The "Used for" lines, in reading order: system disk, file systems, RAID, ZFS (1.3.1). */
  uses: DiskUse[];
  /** Every reason the wipe is refused, in 3.1's order; empty when it may be wiped. */
  blockers: WipeBlocker[];
  /** File systems not used on this NAS, which the confirmation names (3.3). */
  unused: FsRef[];
}

// ---- Device names -------------------------------------------------------------------------------

/**
 * The disk a partition's device file names: "/dev/sdb3" to "/dev/sdb", "/dev/nvme0n1p2" to
 * "/dev/nvme0n1", "/dev/mmcblk0p1" to "/dev/mmcblk0", ".../by-id/ata-X-part1" to ".../by-id/ata-X".
 * A name with no partition number is returned unchanged.
 */
export function partitionParent(device: string): string {
  const byLink = /^(.+)-part\d+$/.exec(device);
  if (byLink?.[1] !== undefined) {
    return byLink[1];
  }
  // A kernel name that ends in a digit numbers its partitions after a "p".
  const afterP = /^(.*\d)p\d+$/.exec(device);
  if (afterP?.[1] !== undefined) {
    return afterP[1];
  }
  const plain = /^(\/dev\/(?:sd|hd|vd|xvd)[a-z]+)\d+$/.exec(device);
  if (plain?.[1] !== undefined) {
    return plain[1];
  }
  return device;
}

/** Every name of a disk: its canonical and stable device files and every link. */
export function diskNames(
  disk: Pick<DiskDevice, "canonicaldevicefile" | "devicefile" | "devicelinks">,
): Set<string> {
  return new Set(
    [disk.canonicaldevicefile, disk.devicefile, ...disk.devicelinks].filter(
      (name) => name !== "",
    ),
  );
}

/** Whether a device file is the disk itself or one of its partitions. */
export function belongsTo(device: string, names: ReadonlySet<string>): boolean {
  if (device === "") {
    return false;
  }
  return names.has(device) || names.has(partitionParent(device));
}

type FsRow = Pick<
  DetectedFilesystem,
  "parentdevicefile" | "devicefiles" | "canonicaldevicefile" | "devicefile"
>;

/** The device files a file-system row names for where it lives. */
const placesOf = (fs: FsRow): string[] =>
  [
    fs.parentdevicefile,
    fs.canonicaldevicefile,
    fs.devicefile,
    ...fs.devicefiles,
  ].filter((d) => d !== "");

const onDisk = (fs: FsRow, names: ReadonlySet<string>) =>
  placesOf(fs).some((d) => belongsTo(d, names));

function fsRef(
  fs: Pick<
    DetectedFilesystem,
    "type" | "canonicaldevicefile" | "devicefile" | "size"
  > & {
    // FileSystemMgmt.getList reports null for a file system still being created.
    label: string | null;
  },
): FsRef {
  const size = parseByteCount(fs.size);
  return {
    label: (fs.label ?? "").trim(),
    type: fs.type,
    device: fs.canonicaldevicefile || fs.devicefile,
    size: size !== null && size > 0 ? size : null,
  };
}

/** Whether a detected file system is one OMV has set up (a row of getList), by UUID or device. */
function isConfigured(
  fs: DetectedFilesystem,
  configured: readonly ConfiguredFilesystem[],
): boolean {
  // A missing UUID (ZFS reports null) matches nothing: two rows without one are not the same.
  return configured.some(
    (c) =>
      sameUuid(c.uuid, fs.uuid) ||
      (c.canonicaldevicefile !== "" &&
        c.canonicaldevicefile === fs.canonicaldevicefile) ||
      (c.devicefile !== "" && c.devicefile === fs.devicefile),
  );
}

/**
 * The ZFS pools a disk is part of (the ZFS design 10.2), from the ZFS file systems the lists report:
 * each names its pool's disks in `devicefiles` and the first of them in `parentdevicefile`. Null when a
 * ZFS row names no disk at all: then no disk can be said to be outside the pool (fail closed).
 */
function zfsPoolsOn(
  rows: readonly FsRow[],
  names: ReadonlySet<string>,
): string[] | null {
  const pools: string[] = [];
  for (const fs of rows) {
    const members = [fs.parentdevicefile, ...fs.devicefiles].filter(
      (d) => d !== "",
    );
    if (members.length === 0) {
      return null;
    }
    const pool = zfsPool(fs);
    if (members.some((d) => belongsTo(d, names)) && !pools.includes(pool)) {
      pools.push(pool);
    }
  }
  return pools;
}

// ---- The rules ----------------------------------------------------------------------------------

/** 0.6: what a disk holds, and whether it may be wiped. */
export function diskUse(
  disk: DiskDevice,
  inputs: UseInputs,
  marks: SessionMarks = { wiping: false },
): DiskUseResult {
  const uses: DiskUse[] = [];
  const blockers: WipeBlocker[] = [];
  if (disk.isroot) {
    uses.push({ kind: "system" });
    blockers.push({ kind: "system" });
  }
  if (disk.isreadonly) {
    blockers.push({ kind: "readOnly" });
  }

  /** Nothing is known about what the disk holds, so the wipe is refused. */
  const notKnown = (): DiskUseResult => {
    uses.push({ kind: "unknown" });
    if (marks.wiping) {
      blockers.push({ kind: "wiping" });
    }
    blockers.push({ kind: "unchecked" });
    return { known: false, uses, blockers, unused: [] };
  };

  const { configured, detected, arrays, zfs } = inputs;
  if (
    configured === undefined ||
    detected === undefined ||
    arrays === undefined ||
    zfs === undefined
  ) {
    return notKnown();
  }

  const names = diskNames(disk);
  // A ZFS file system is not a file system on this disk but part of a pool across disks: the disk is
  // part of that pool, whatever is mounted (the ZFS design 10.2).
  const zfsRows = [...configured, ...detected].filter(isZfs);
  const pools = zfsPoolsOn(zfsRows, names);
  // The pools' own disks, spares and caches included, also for a pool whose file systems are not
  // listed. No pool while the lists show ZFS file systems is a failed read (fail closed, D10).
  if (
    pools === null ||
    (zfs !== null && zfs.length === 0 && zfsRows.length > 0)
  ) {
    return notKnown();
  }
  for (const pool of zfs ?? []) {
    if (
      pool.devices.some((d) => belongsTo(d, names)) &&
      !pools.includes(pool.pool)
    ) {
      pools.push(pool.pool);
    }
  }

  const inUse: DiskUse[] = [];
  const setUp: DiskUse[] = [];
  const creating: DiskUse[] = [];
  const unusedUses: DiskUse[] = [];
  const unused: FsRef[] = [];
  const blockInUse: WipeBlocker[] = [];
  const blockSetUp: WipeBlocker[] = [];
  const seen = new Set<string>();

  for (const fs of configured) {
    if (isZfs(fs)) {
      continue;
    }
    if (fs.status === 2) {
      if (fs.parentdevicefile !== "" && belongsTo(fs.parentdevicefile, names)) {
        if (creating.length === 0) {
          creating.push({ kind: "fsCreating" });
        }
      }
      continue;
    }
    if (!onDisk(fs, names)) {
      continue;
    }
    const ref = { ...fsRef(fs), address: fsAddress(fs) };
    seen.add(ref.device);
    if (fs.mounted || fs._used) {
      inUse.push({ kind: "fsInUse", fs: ref, used: fs._used });
      blockInUse.push({ kind: "fsInUse", fs: ref, used: fs._used });
    } else {
      setUp.push({ kind: "fsSetUp", fs: ref });
      blockSetUp.push({ kind: "fsSetUp", fs: ref });
    }
  }

  let swap = false;
  for (const fs of detected) {
    if (!onDisk(fs, names)) {
      continue;
    }
    if (fs.type === "swap") {
      swap = true;
      continue;
    }
    if (isZfs(fs)) {
      continue;
    }
    const ref = fsRef(fs);
    if (seen.has(ref.device) || isConfigured(fs, configured)) {
      continue;
    }
    seen.add(ref.device);
    if (fs.mounted || fs._used) {
      // Mounted without OMV's entry (the system's own boot partition, or a mount made by hand).
      inUse.push({ kind: "fsInUse", fs: ref, used: fs._used });
      blockInUse.push({ kind: "fsInUse", fs: ref, used: fs._used });
    } else {
      unusedUses.push({ kind: "fsUnused", fs: ref });
      unused.push(ref);
    }
  }

  const raid: DiskUse[] = [];
  const blockRaid: WipeBlocker[] = [];
  for (const array of arrays ?? []) {
    if (array.devices.some((d) => belongsTo(d, names))) {
      const ref = { name: array.name.trim(), devicefile: array.devicefile };
      raid.push({ kind: "raid", array: ref });
      blockRaid.push({ kind: "raid", array: ref });
    }
  }

  uses.push(...inUse, ...setUp, ...creating, ...unusedUses);
  if (swap) {
    uses.push({ kind: "swap" });
  }
  uses.push(...raid);
  for (const pool of pools) {
    uses.push({ kind: "zfs", pool });
  }

  blockers.push(...blockInUse, ...blockSetUp);
  if (creating.length > 0) {
    blockers.push({ kind: "fsCreating" });
  }
  if (swap) {
    blockers.push({ kind: "swap" });
  }
  blockers.push(...blockRaid);
  for (const pool of pools) {
    blockers.push({ kind: "zfs", pool });
  }

  if (marks.wiping) {
    uses.push({ kind: "wiping" });
    blockers.push({ kind: "wiping" });
  } else if (uses.length === 0) {
    uses.push(
      marks.wipedAt === undefined
        ? { kind: "none" }
        : { kind: "wiped", at: marks.wipedAt },
    );
  }
  return { known: true, uses, blockers, unused };
}

/**
 * Whether the NAS has storage this interface cannot trace to its disks (0.6, P4): a file system that
 * is mounted or set up, on a device that is neither a disk of the list nor a RAID array the plugin
 * reported (encrypted disks, LVM, ZFS pools, or an array made without the plugin). The wipe
 * confirmation of a disk that holds nothing known then says so. False while an input is missing: the
 * wipe is refused then anyway.
 */
export function hasUntraceableStorage(
  disks: readonly DiskDevice[],
  inputs: UseInputs,
): boolean {
  const { configured, detected, arrays } = inputs;
  if (
    configured === undefined ||
    detected === undefined ||
    arrays === undefined
  ) {
    return false;
  }
  const names = new Set<string>();
  for (const disk of disks) {
    for (const name of diskNames(disk)) {
      names.add(name);
    }
  }
  const arrayDevices = new Set((arrays ?? []).map((a) => a.devicefile));
  const traceable = (fs: FsRow) => {
    const places = placesOf(fs);
    return places.some(
      (d) => belongsTo(d, names) || arrayDevices.has(partitionParent(d)),
    );
  };
  const present = configured.filter((fs) => fs.status === 1);
  const mounted = detected.filter((fs) => fs.mounted && fs.type !== "swap");
  return [...present, ...mounted].some((fs) => !traceable(fs));
}

/** The disks of a list in device order (natural order of the device name). */
export const byDeviceOrder = <T extends Pick<DiskDevice, "devicename">>(
  disks: readonly T[],
): T[] => [...disks].sort((a, b) => naturalCompare(a.devicename, b.devicename));
