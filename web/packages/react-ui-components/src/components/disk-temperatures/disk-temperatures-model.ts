// SPDX-License-Identifier: GPL-3.0-or-later
// The disks' temperatures by kind (owner, 2026-11-26), apart from how they are drawn: what a disk's
// reading is, the one scale and alert limit, the groups (each RAID array, then each ZFS pool, then the
// disks in neither by kind) and what the dashboard shows past eight disks. Pure and free of words:
// each group says where it comes from in data, and the caller writes its title.
//
// The inputs are the fields of the contract's rows that this reads, declared here because the library
// does not depend on the API package; the generated DTOs fit them as they are:
// - a disk: DiskMgmt.getList (DiskDevice) or Smart.getList (SmartDevice) `devicename`,
//   `canonicaldevicefile`, `devicelinks` and `temperature`, and DiskMgmt.getList `powermode` (a read
//   that never wakes a sleeping disk, so one in standby has no figure);
// - its kind: `driveKindOf` (drive-picture-model.ts), from `devicename` and Smart.getInformation;
// - the alert limit: Smart.getSettings `tempmax`, or Smart.getDeviceSettings `tempmax` for one disk;
// - the groups: MdMgmt.enumerateDevices (MdArray), Zfs.getPoolStatus (ZfsPoolStatus) with
//   Zfs.getPoolDevices (ZfsPoolDevice) for each pool, and FileSystemMgmt.getList
//   (ConfiguredFilesystem) `devicename` and `label` for the name of the file system on an array.
import type { DrivePictureKind } from "../drive-picture/drive-picture-model";

/** The fields of a DiskMgmt.getList or Smart.getList row the temperatures read. */
export interface DiskRow {
  devicename: string;
  canonicaldevicefile: string;
  devicelinks: readonly string[];
  /** Degrees Celsius as text or a whole number; the empty string when unknown. */
  temperature: number | string;
  /** DiskMgmt.getList only: "STANDBY" or "SLEEP" for a disk that is asleep. */
  powermode?: string;
}

/** One disk, as the app hands it over. */
export interface DiskTemperatureInput {
  disk: DiskRow;
  /** For the picture and the group only. */
  kind: DrivePictureKind;
  /** Smart.getDeviceSettings `tempmax`; 0 or absent uses the setting for every disk. */
  tempmax?: number;
}

/** One disk's reading, ready to draw. */
export interface DiskTemperature {
  device: string;
  /** `canonicaldevicefile` and `devicelinks`: how a member of an array or pool is found. */
  file: string;
  links: readonly string[];
  kind: DrivePictureKind;
  /** Degrees Celsius; null when the disk reports none or is asleep. */
  c: number | null;
  asleep: boolean;
  /** The alert limit for this disk; null when none is set. */
  limit: number | null;
}

/** DiskMgmt.getList's `temperature` is text or a whole number; anything else is unknown. */
export function celsiusOf(value: number | string): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (!/^-?\d+(\.\d+)?$/u.test(value.trim())) {
    return null;
  }
  return Number(value);
}

/** A disk's reading, with Smart.getSettings `tempmax` as the limit when it has none of its own. */
export function diskTemperatureOf(
  input: DiskTemperatureInput,
  settings: { tempmax: number },
): DiskTemperature {
  const { disk } = input;
  const asleep = disk.powermode === "STANDBY" || disk.powermode === "SLEEP";
  const own = input.tempmax ?? 0;
  const limit = own > 0 ? own : settings.tempmax > 0 ? settings.tempmax : null;
  return {
    device: disk.devicename,
    file: disk.canonicaldevicefile,
    links: disk.devicelinks,
    kind: input.kind,
    c: asleep ? null : celsiusOf(disk.temperature),
    asleep,
    limit,
  };
}

/** At or past its alert limit: only then may its level take the warning colour, with the words. */
export function diskOverLimit(d: DiskTemperature): boolean {
  return d.c !== null && d.limit !== null && d.c >= d.limit;
}

/** The one alert limit every read disk shares, or null when there is none or they differ. */
export function sharedLimit(disks: readonly DiskTemperature[]): number | null {
  const limits = new Set(disks.filter((d) => d.c !== null).map((d) => d.limit));
  if (limits.size !== 1) {
    return null;
  }
  const [only] = limits;
  return only ?? null;
}

export interface TemperatureScale {
  lo: number;
  hi: number;
  ticks: number[];
}

/** A scale in steps of 5 °C round the readings and the limit, with room either side. */
export function temperatureScale(
  disks: readonly DiskTemperature[],
  limit: number | null,
): TemperatureScale {
  const values = disks.flatMap((d) => (d.c === null ? [] : [d.c]));
  const all = limit === null ? values : [...values, limit];
  if (all.length === 0) {
    return { lo: 20, hi: 50, ticks: [20, 30, 40, 50] };
  }
  const lo = Math.floor((Math.min(...all) - 4) / 5) * 5;
  const hi = Math.ceil((Math.max(...all) + 4) / 5) * 5;
  const ticks: number[] = [];
  for (let c = lo; c <= hi; c += 5) {
    ticks.push(c);
  }
  return { lo, hi, ticks };
}

/** Where a reading sits on the scale, 0 to 1. */
export function temperatureShare(c: number, scale: TemperatureScale): number {
  return Math.min(1, Math.max(0, (c - scale.lo) / (scale.hi - scale.lo)));
}

// ─── The groups ──────────────────────────────────────────────────────────────────────────────────

/** The fields of an MdMgmt.enumerateDevices row the groups read. */
export interface ArrayRow {
  devicefile: string;
  name: string;
  level: string;
  /** The members as device files: a whole disk ("/dev/sdb") or a partition ("/dev/sdb1"). */
  devices: readonly string[];
  state: string | false;
  syncaction: string | null;
}

/** One pool: its Zfs.getPoolStatus row and its Zfs.getPoolDevices list. */
export interface PoolRows {
  status: { name: string; state: string };
  devices: readonly { devicefile: string; vdev: string }[];
}

export interface VolumeRows {
  /** MdMgmt.enumerateDevices; empty when there is no array or no RAID plugin (the read is 404). */
  arrays: readonly ArrayRow[];
  /** Zfs.getPoolStatus, each pool with its Zfs.getPoolDevices; empty without the ZFS plugin. */
  pools: readonly PoolRows[];
  /** FileSystemMgmt.getList `devicename` and `label`: the name of the file system on an array. */
  labels: readonly { devicename: string; label: string | null }[];
}

/** Whether a member's device file is this disk, or a partition on it, by the kernel's naming. */
export function memberOnDisk(member: string, disk: string): boolean {
  if (member === disk) {
    return true;
  }
  if (disk === "" || !member.startsWith(disk)) {
    return false;
  }
  const rest = member.slice(disk.length);
  if (disk.startsWith("/dev/disk/")) {
    return /^-part\d+$/u.test(rest);
  }
  // A disk whose name ends in a digit (nvme0n1) numbers its partitions after a "p" (nvme0n1p1), so
  // nvme0n10 is another disk, not a partition of nvme0n1.
  return /\d$/u.test(disk) ? /^p\d+$/u.test(rest) : /^\d+$/u.test(rest);
}

function isMember(member: string, d: DiskTemperature): boolean {
  return [d.file, ...d.links].some((path) => memberOnDisk(member, path));
}

/**
 * An array's own name: the label of the file system on it, else the part of mdadm's `name` after
 * the colon (an array made on another computer), else null, for the caller to name it by `device`.
 */
export function arrayNameOf(
  a: Pick<ArrayRow, "devicefile" | "name">,
  labels: VolumeRows["labels"],
): string | null {
  const device = a.devicefile.replace(/^\/dev\//u, "");
  const label = labels.find((l) => l.devicename === device)?.label;
  if (label !== undefined && label !== null && label !== "") {
    return label;
  }
  const own = a.name.split(":").at(-1) ?? "";
  return own !== "" ? own : null;
}

/** A pool's arrangement, from Zfs.getPoolDevices `vdev`, for the caller's words. */
export interface PoolLayout {
  /**
   * The kinds of its groups, without their numbers: "mirror", "raidz1", "raidz2", "raidz3", "draid".
   * Empty for disks directly under the pool (a single disk or a stripe). A disk being replaced sits
   * in a "replacing-1" group inside its mirror, and a spare in "spare-…": neither is an arrangement.
   */
  kinds: readonly string[];
  /** How many groups. */
  groups: number;
  /** How many member devices. */
  members: number;
}

export function poolLayoutOf(devices: PoolRows["devices"]): PoolLayout {
  const groups = new Set(
    devices
      .map((d) => d.vdev)
      .filter((v) => v !== "" && !/^(replacing|spare)/u.test(v)),
  );
  const kinds = [
    ...new Set(
      [...groups].map((g) =>
        g.replace(/-\d+$/u, "").replace(/^draid.*/u, "draid"),
      ),
    ),
  ];
  return { kinds, groups: groups.size, members: devices.length };
}

/** What an array or pool is doing, when it needs saying. */
export interface VolumeState {
  tone: "warning" | "critical";
  /** A disk is being rebuilt; one is missing or has failed; the volume cannot be used now. */
  reason: "rebuilding" | "degraded" | "unavailable";
}

/**
 * MdMgmt.enumerateDevices `syncaction` "recover" is a rebuild, and "degraded" in `state` is an array
 * short of a disk. Otherwise nothing.
 */
export function arrayStateOf(
  a: Pick<ArrayRow, "state" | "syncaction">,
): VolumeState | null {
  if (a.syncaction === "recover") {
    return { tone: "warning", reason: "rebuilding" };
  }
  if (typeof a.state === "string" && /\bdegraded\b/u.test(a.state)) {
    return { tone: "warning", reason: "degraded" };
  }
  return null;
}

/** Zfs.getPoolStatus `state`, and a disk being replaced. */
export function poolStateOf(p: PoolRows): VolumeState | null {
  if (p.status.state === "ONLINE") {
    return null;
  }
  if (p.status.state === "DEGRADED") {
    return p.devices.some((d) => d.vdev.startsWith("replacing"))
      ? { tone: "warning", reason: "rebuilding" }
      : { tone: "warning", reason: "degraded" };
  }
  return { tone: "critical", reason: "unavailable" };
}

interface GroupBase {
  /** "md:/dev/md0", "zfs:tank" or "kind:hdd". */
  id: string;
  /** What the array or pool is doing, when it needs saying. */
  state: VolumeState | null;
  /** In device order. */
  disks: DiskTemperature[];
}

/** A RAID array: its device ("md0"), its own name or null, and mdadm's level ("raid1"). */
export interface ArrayGroup extends GroupBase {
  from: "md";
  device: string;
  name: string | null;
  level: string;
}

/** A ZFS pool: its name and arrangement. */
export interface PoolGroup extends GroupBase {
  from: "zfs";
  name: string;
  layout: PoolLayout;
}

/** The disks in no array or pool, of one kind. */
export interface KindGroup extends GroupBase {
  from: "kind";
  kind: DrivePictureKind;
}

export type DiskGroup = ArrayGroup | PoolGroup | KindGroup;

const byDevice = new Intl.Collator("en", { numeric: true });

const inDeviceOrder = (list: readonly DiskTemperature[]) =>
  [...list].sort((a, b) => byDevice.compare(a.device, b.device));

const KIND_ORDER: readonly DrivePictureKind[] = ["hdd", "ssd", "nvme"];

/**
 * Each array (in device order), then each pool (by name), each with the disks it is made of; then
 * the disks in no array or pool, by kind: hard disks, SSDs, NVMe SSDs. Every disk is in exactly one
 * group, in device order within it, and a group with no disk is left out. A member is found by
 * `canonicaldevicefile` (an array's) or `devicelinks` (a pool's), a partition belongs to the disk it
 * is on, a member that matches no disk is left out, and a disk in two volumes is in the first only.
 */
export function diskGroups(
  disks: readonly DiskTemperature[],
  volumes: VolumeRows,
): DiskGroup[] {
  const placed = new Set<string>();
  const take = (members: readonly string[]) => {
    const list = disks.filter(
      (d) => !placed.has(d.device) && members.some((m) => isMember(m, d)),
    );
    for (const d of list) {
      placed.add(d.device);
    }
    return inDeviceOrder(list);
  };
  const arrays = [...volumes.arrays]
    .sort((a, b) => byDevice.compare(a.devicefile, b.devicefile))
    .map((a): ArrayGroup => ({
      id: `md:${a.devicefile}`,
      from: "md",
      device: a.devicefile.replace(/^\/dev\//u, ""),
      name: arrayNameOf(a, volumes.labels),
      level: a.level,
      state: arrayStateOf(a),
      disks: take(a.devices),
    }));
  const pools = [...volumes.pools]
    .sort((a, b) => byDevice.compare(a.status.name, b.status.name))
    .map((p): PoolGroup => ({
      id: `zfs:${p.status.name}`,
      from: "zfs",
      name: p.status.name,
      layout: poolLayoutOf(p.devices),
      state: poolStateOf(p),
      disks: take(p.devices.map((d) => d.devicefile)),
    }));
  const rest = KIND_ORDER.map((kind): KindGroup => ({
    id: `kind:${kind}`,
    from: "kind",
    kind,
    state: null,
    disks: inDeviceOrder(
      disks.filter((d) => d.kind === kind && !placed.has(d.device)),
    ),
  }));
  return [...arrays, ...pools, ...rest].filter((g) => g.disks.length > 0);
}

// ─── On the dashboard ────────────────────────────────────────────────────────────────────────────
//
// The dashboard answers "does anything need me?", and the Disks page shows every disk. So on the
// dashboard up to eight disks are all shown; past that, the groups with a disk at or over its alert
// limit are shown whole, the others are summed up in one sentence and opened in place on request. A
// disk over its limit is never behind the disclosure.

/** Up to this many disks, the dashboard shows them all. */
export const DASHBOARD_ALL = 8;

export interface DashboardSplit {
  shown: DiskGroup[];
  rest: DiskGroup[];
}

export function dashboardSplit(
  groups: readonly DiskGroup[],
  all: number = DASHBOARD_ALL,
): DashboardSplit {
  const total = groups.reduce((n, g) => n + g.disks.length, 0);
  if (total <= all) {
    return { shown: [...groups], rest: [] };
  }
  return {
    shown: groups.filter((g) => g.disks.some(diskOverLimit)),
    rest: groups.filter((g) => !g.disks.some(diskOverLimit)),
  };
}

/** What the sentence for the disks behind the disclosure says, for the caller's words. */
export interface RestSummary {
  /** How many disks are behind it. */
  count: number;
  /** How many of them were read: a disk asleep or unread is not counted in the range. */
  read: number;
  /** The lowest and highest reading among them; null when none was read. */
  lo: number | null;
  hi: number | null;
  /** The shared alert limit, or null. */
  limit: number | null;
  /** Every disk is behind it: no group is over the limit. */
  all: boolean;
}

export function restSummary(
  rest: readonly DiskTemperature[],
  all: boolean,
  limit: number | null,
): RestSummary {
  const read = rest.flatMap((d) => (d.c === null ? [] : [d.c]));
  return {
    count: rest.length,
    read: read.length,
    lo: read.length === 0 ? null : Math.min(...read),
    hi: read.length === 0 ? null : Math.max(...read),
    limit,
    all,
  };
}
