// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS slice's rules (phase 5 ZFS design 0.2 to 0.12): how a pool and a file system are addressed
// and named, the plugin's flat list read as pools, file systems and volumes, ZFS's own report read as
// a tree of disk groups and disks with their states and error counts, the check or rebuild under way,
// a pool's state worst first, what it protects and about how much space it gives, what uses a file
// system, and the interface's own refusals. The plugin checks almost nothing for these methods (read
// from source), so every refusal is decided here, and each fails closed: a state, a report or a disk
// this page cannot read makes the actions that depend on it unavailable. Pure, so each rule is tested
// by itself on the captured examples; the components render the result.
//
// What the test VM showed and the design first assumed otherwise (design section 20):
// - the report's lines are joined by a line feed and a carriage return, its tree indented by a tab and
//   two spaces a level;
// - while a disk is replaced, getPoolDevices gives the old and the new disk the same group,
//   "replacing-1": one replacement in progress, not two disks;
// - `lastscrub` carries a time zone ("… UTC 2026"); the report's scan line does not, so the date shown
//   is lastscrub's, and the scan line says whether it was a check or a rebuild;
// - `compressratio` and `dedup` read "1.00", without an "x";
// - the contract only accepts by-id device paths, so a pool whose disks ZFS names otherwise cannot have
//   its disks changed here (fail closed);
// - the usable-space estimate is calibrated on the VM's pools (usableSize).
import type {
  SharedFolder,
  ZfsObject,
  ZfsPoolDevice,
  ZfsSnapshot,
} from "@omv-webui/react-api-omv/generated";
import { partitionParent } from "../disks/diskUse.ts";

// ---- Addresses (0.7) ------------------------------------------------------------------------------

/** A pool's name in an address: a letter, then up to 63 letters, digits, "_", ".", ":" or "-". */
export const POOL_ADDRESS = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
/** One part of a file system's name after the pool. A letter or digit first, so never "." or "..". */
const FS_PART = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const MAX_FS_PARTS = 8;
const MAX_NAME = 255;

export const isPoolAddress = (value: unknown): value is string =>
  typeof value === "string" && POOL_ADDRESS.test(value);

/** A file system's full name as an address ("tank", "tank/media"); the pool's own folder included. */
export function isFsAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_NAME) {
    return false;
  }
  const [pool, ...parts] = value.split("/");
  return (
    isPoolAddress(pool) &&
    parts.length <= MAX_FS_PARTS &&
    parts.every((part) => FS_PART.test(part))
  );
}

/** Whether an object of the list has a page here: its name passes the address patterns. */
export const hasPage = (row: Pick<ZfsObject, "type" | "path">): boolean =>
  row.type === "Pool" ? isPoolAddress(row.path) : isFsAddress(row.path);

// ---- The flat list (1.1) --------------------------------------------------------------------------

export const isPoolRow = (row: Pick<ZfsObject, "type">): boolean =>
  row.type === "Pool";
export const isFsRow = (row: Pick<ZfsObject, "type">): boolean =>
  row.type === "Filesystem";
export const isVolumeRow = (row: Pick<ZfsObject, "type">): boolean =>
  row.type === "Volume";

/** The pool a row is on: its `pool`, else the first part of its full name. */
export const poolOf = (row: Pick<ZfsObject, "path" | "pool">): string =>
  row.pool ?? row.path.split("/")[0] ?? "";

export const pools = (rows: readonly ZfsObject[]): ZfsObject[] =>
  rows.filter(isPoolRow);

/** The pool's own folder: the file-system row of the pool's own name (`poolroot`). */
export const poolRoot = (
  rows: readonly ZfsObject[],
  pool: string,
): ZfsObject | undefined =>
  rows.find(
    (r) => isFsRow(r) && r.path === pool && (r.poolroot ?? true) !== false,
  );

/** The pool's file systems and volumes, the pool's own folder first, in the server's order. */
export function onPool(rows: readonly ZfsObject[], pool: string): ZfsObject[] {
  const root = poolRoot(rows, pool);
  const rest = rows.filter(
    (r) =>
      (isFsRow(r) || isVolumeRow(r)) &&
      r !== root &&
      r.path.startsWith(`${pool}/`),
  );
  return root === undefined ? rest : [root, ...rest];
}

/** File systems and volumes inside one (its full name and a "/"). */
export const inside = (rows: readonly ZfsObject[], path: string): ZfsObject[] =>
  rows.filter(
    (r) => (isFsRow(r) || isVolumeRow(r)) && r.path.startsWith(`${path}/`),
  );

/** The pool row an address names. Every later call uses the row's fields, never the address (UI-4). */
export const findPool = (
  rows: readonly ZfsObject[],
  address: string,
): ZfsObject | undefined =>
  isPoolAddress(address)
    ? rows.find((r) => isPoolRow(r) && r.path === address)
    : undefined;

/** The file system or volume row an address names. */
export const findFs = (
  rows: readonly ZfsObject[],
  address: string,
): ZfsObject | undefined =>
  isFsAddress(address)
    ? rows.find((r) => (isFsRow(r) || isVolumeRow(r)) && r.path === address)
    : undefined;

export const isLocked = (row: Pick<ZfsObject, "keystatus">): boolean =>
  row.keystatus.trim().toLowerCase() === "unavailable";
export const isEncrypted = (row: Pick<ZfsObject, "encryption">): boolean => {
  const word = row.encryption.trim().toLowerCase();
  return word !== "" && word !== "off" && word !== "n/a" && word !== "-";
};
/** A clone: the snapshot it was made from, or null. */
export const originOf = (row: Pick<ZfsObject, "origin">): string | null => {
  const origin = row.origin.trim();
  return origin === "" || origin === "n/a" || origin === "-" ? null : origin;
};
/** A file system with no folder: made so in the classic interface (`none`, or empty). */
export const hasNoFolder = (row: Pick<ZfsObject, "mountpoint">): boolean => {
  const mp = row.mountpoint.trim();
  return mp === "" || mp === "none" || mp === "-" || mp === "legacy";
};

// ---- Names for new pools and file systems (0.7, P5) ----------------------------------------------

const NEW_POOL = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const NEW_FS = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
/** Words ZFS keeps for itself: "log", and any name starting with one of the others. */
const RESERVED_PREFIX = ["mirror", "raidz", "draid", "spare"];
/** Folders the system uses at the top of the disk; the pool's folder would be /<name>. */
const SYSTEM_FOLDERS = new Set([
  "bin",
  "boot",
  "dev",
  "etc",
  "home",
  "lib",
  "lib32",
  "lib64",
  "media",
  "mnt",
  "opt",
  "proc",
  "root",
  "run",
  "sbin",
  "srv",
  "sys",
  "tmp",
  "usr",
  "var",
]);

export type PoolNameProblem = "pattern" | "reserved" | "systemFolder" | "taken";

/** Why a new pool cannot have this name; null when it may. "Taken" compares without case. */
export function poolNameProblem(
  name: string,
  existing: readonly string[],
): PoolNameProblem | null {
  if (!NEW_POOL.test(name)) {
    return "pattern";
  }
  const lower = name.toLowerCase();
  if (lower === "log" || RESERVED_PREFIX.some((w) => lower.startsWith(w))) {
    return "reserved";
  }
  if (SYSTEM_FOLDERS.has(lower)) {
    return "systemFolder";
  }
  if (existing.some((p) => p.toLowerCase() === lower)) {
    return "taken";
  }
  return null;
}

export type FsNameProblem = "pattern" | "taken";

/**
 * Why a new file system at the top of `pool` cannot have this name; null when it may. The plugin does
 * not refuse a name that is taken: it answers as if it had created it and changes nothing (observed),
 * so this check, made again just before the create, is the only guard.
 */
export function fsNameProblem(
  name: string,
  rows: readonly ZfsObject[],
  pool: string,
): FsNameProblem | null {
  if (!NEW_FS.test(name) || name === "." || name === "..") {
    return "pattern";
  }
  const lower = `${pool}/${name}`.toLowerCase();
  return rows.some(
    (r) => (isFsRow(r) || isVolumeRow(r)) && r.path.toLowerCase() === lower,
  )
    ? "taken"
    : null;
}

// ---- ZFS's report on a pool (0.3, 0.4) -----------------------------------------------------------

export type GroupClass =
  "data" | "spares" | "logs" | "cache" | "special" | "dedup";

export type LayoutKey =
  | "mirror"
  | "raidz1"
  | "raidz2"
  | "raidz3"
  | "single"
  | "stripe"
  | "draid"
  | "other";

export interface ReportDisk {
  /** The name the report prints: the last part of the disk's path, or a number for a missing one. */
  name: string;
  /** ZFS's word for it, in capitals. */
  state: string;
  read: number;
  write: number;
  checksum: number;
  /** "(resilvering)" on the disk ZFS is rebuilding onto. */
  resilvering: boolean;
  /** The path a missing disk was last seen at ("was /dev/…"). */
  was: string | null;
}

/** One place in a group: a disk, or two disks while one takes the place of the other. */
export type ReportEntry =
  | { kind: "disk"; disk: ReportDisk }
  | {
      kind: "replacing" | "spare";
      /** The group ZFS made for the pair ("replacing-1", "spare-0"). */
      vdev: string;
      state: string;
      old: ReportDisk;
      new: ReportDisk;
    };

export interface ReportGroup {
  class: GroupClass;
  /** ZFS's name for the group ("mirror-0"), or null for disks directly under the pool or a class. */
  vdev: string | null;
  layout: LayoutKey;
  /** The group's own word, "ONLINE" or "DEGRADED"; empty for disks directly under the pool. */
  state: string;
  entries: ReportEntry[];
}

export type ScanKind = "check" | "rebuild";
export type ScanStatus = "running" | "paused" | "finished" | "stopped";

export interface Scan {
  kind: ScanKind;
  status: ScanStatus;
  /** Percent done, one decimal, while running or paused. */
  percent: number | null;
  /** Seconds left, from "hh:mm:ss to go" (with "N days"), while running. */
  secondsLeft: number | null;
  /** What a finished check repaired ("0B", "12K"). */
  repaired: string | null;
  /** Errors a finished check or rebuild could not repair. */
  errors: number | null;
}

export type PoolReport =
  | { known: false }
  | {
      known: true;
      name: string;
      /** The pool's state as the report says it. */
      state: string;
      /** The scan line; null when ZFS reports none (never checked, nothing rebuilt). */
      scan: Scan | null;
      groups: ReportGroup[];
      /** Damaged files ZFS counts (`errors:`): 0 for "No known data errors". */
      dataErrors: number;
    };

const KEY_LINE =
  /^\s*(pool|state|status|action|see|scan|remove|checkpoint|config|errors):\s?(.*)$/;
const TREE_HEAD = /^NAME\s+STATE\s+READ\s+WRITE\s+CKSUM\s*$/;
const CLASSES: Readonly<Record<string, GroupClass>> = {
  spares: "spares",
  logs: "logs",
  cache: "cache",
  special: "special",
  dedup: "dedup",
};

/** An error count as ZFS prints it: "0", "12", "1.2K", "3M". */
function countOf(text: string): number | null {
  const match = /^(\d+(?:\.\d+)?)([KMGTP]?)$/.exec(text);
  if (match?.[1] === undefined) {
    return null;
  }
  const scale = { "": 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15 }[
    match[2] ?? ""
  ];
  return Math.round(Number(match[1]) * (scale ?? 1));
}

/** The layout a group's name says: "mirror-0", "raidz2-1", "draid1:…". */
export function layoutOfVdev(vdev: string): LayoutKey {
  if (/^mirror-\d+$/.test(vdev)) {
    return "mirror";
  }
  const z = /^raidz([123]?)-\d+$/.exec(vdev);
  if (z !== null) {
    const level = z[1] === "" || z[1] === undefined ? "1" : z[1];
    return `raidz${level}` as LayoutKey;
  }
  if (/^draid/.test(vdev)) {
    return "draid";
  }
  return "other";
}

const isGroupName = (name: string): boolean =>
  /^(mirror|raidz[123]?|draid[^ ]*)-\d+$/.test(name) || /^draid/.test(name);
const isPairName = (name: string): "replacing" | "spare" | null =>
  /^replacing-\d+$/.test(name)
    ? "replacing"
    : /^spare-\d+$/.test(name)
      ? "spare"
      : null;

interface TreeLine {
  depth: number;
  name: string;
  state: string;
  counts: [number, number, number] | null;
  note: string;
}

/** One line of the tree: a tab, two spaces a level, the name, and its state and counts if any. */
function treeLine(line: string): TreeLine | null {
  const body = line.replace(/^\t/, "");
  const indent = /^( *)/.exec(body)?.[1]?.length ?? 0;
  const tokens = body.trim().split(/\s+/);
  const name = tokens[0];
  if (name === undefined || name === "" || indent % 2 !== 0) {
    return null;
  }
  const state = tokens[1] ?? "";
  const counts =
    tokens.length >= 5
      ? [
          countOf(tokens[2] ?? ""),
          countOf(tokens[3] ?? ""),
          countOf(tokens[4] ?? ""),
        ]
      : null;
  if (counts !== null && counts.some((c) => c === null)) {
    return null;
  }
  return {
    depth: indent / 2,
    name,
    state,
    counts: counts as [number, number, number] | null,
    note: tokens.slice(counts === null ? 2 : 5).join(" "),
  };
}

const diskOfLine = (line: TreeLine): ReportDisk => {
  const was = /\bwas (\S+)/.exec(line.note)?.[1] ?? null;
  return {
    name: line.name,
    state: line.state.toUpperCase(),
    read: line.counts?.[0] ?? 0,
    write: line.counts?.[1] ?? 0,
    checksum: line.counts?.[2] ?? 0,
    resilvering: /\(resilvering\)/.test(line.note),
    was,
  };
};

/** "1 days 02:03:04", "00:01:35" to seconds. */
function secondsOf(text: string): number | null {
  const match = /^(?:(\d+) days? )?(\d+):(\d{2}):(\d{2})$/.exec(text.trim());
  if (match === null) {
    return null;
  }
  const [, days, h, m, s] = match;
  return (
    Number(days ?? 0) * 86400 + Number(h) * 3600 + Number(m) * 60 + Number(s)
  );
}

/**
 * The `scan:` paragraph, its first line and the lines under it joined: null when ZFS reports nothing,
 * "unknown" for a form this page does not recognise.
 */
export function readScan(text: string): Scan | null | "unknown" {
  const all = text.replace(/\s+/g, " ").trim();
  if (all === "" || /^none requested/.test(all)) {
    return null;
  }
  const percent = /(\d+(?:\.\d+)?)% done/.exec(all)?.[1];
  const left = /done, (.+?) to go/.exec(all)?.[1];
  const base = {
    percent: percent === undefined ? null : Math.min(100, Number(percent)),
    secondsLeft: left === undefined ? null : secondsOf(left),
    repaired: null,
    errors: null,
  };
  if (/^scrub in progress/.test(all)) {
    return { ...base, kind: "check", status: "running" };
  }
  if (/^scrub paused/.test(all)) {
    return { ...base, kind: "check", status: "paused", secondsLeft: null };
  }
  if (/^scrub canceled/.test(all)) {
    return { ...base, kind: "check", status: "stopped", percent: null };
  }
  const repaired = /^scrub repaired (\S+) in .+? with (\d+) errors/.exec(all);
  if (repaired !== null) {
    return {
      kind: "check",
      status: "finished",
      percent: null,
      secondsLeft: null,
      repaired: repaired[1] ?? null,
      errors: Number(repaired[2]),
    };
  }
  if (/^resilver in progress/.test(all)) {
    return { ...base, kind: "rebuild", status: "running" };
  }
  if (/^resilver canceled/.test(all)) {
    return { ...base, kind: "rebuild", status: "stopped", percent: null };
  }
  const resilvered = /^resilvered (\S+) in .+? with (\d+) errors/.exec(all);
  if (resilvered !== null) {
    return {
      kind: "rebuild",
      status: "finished",
      percent: null,
      secondsLeft: null,
      repaired: null,
      errors: Number(resilvered[2]),
    };
  }
  return "unknown";
}

/**
 * ZFS's report on a pool (getObjectDetails, type Pool), read into its tree (0.4), its scan line and
 * its errors line. Anything this page does not recognise in the tree, or a report without one, is
 * "not known" (fail closed): the state is then Unknown and every action on a disk is unavailable.
 */
export function parsePoolReport(report: unknown): PoolReport {
  if (typeof report !== "string") {
    return { known: false };
  }
  const lines = report.replace(/\r/g, "").split("\n");
  const sections = new Map<string, string[]>();
  let key: string | null = null;
  for (const line of lines) {
    const match = KEY_LINE.exec(line);
    if (match?.[1] !== undefined && !line.startsWith("\t")) {
      key = match[1];
      sections.set(key, [match[2] ?? ""]);
      continue;
    }
    if (key !== null) {
      sections.get(key)?.push(line);
    }
  }
  const name = sections.get("pool")?.[0]?.trim() ?? "";
  const state = sections.get("state")?.[0]?.trim().toUpperCase() ?? "";
  const config = (sections.get("config") ?? []).filter((l) => l.trim() !== "");
  const head = config.findIndex((l) => TREE_HEAD.test(l.trim()));
  if (name === "" || state === "" || head === -1) {
    return { known: false };
  }

  const groups: ReportGroup[] = [];
  const top: ReportGroup = {
    class: "data",
    vdev: null,
    layout: "single",
    state: "",
    entries: [],
  };
  let klass: GroupClass = "data";
  let group: ReportGroup | null = null;
  let classGroup: ReportGroup | null = null;
  let pair: {
    kind: "replacing" | "spare";
    line: TreeLine;
    disks: ReportDisk[];
  } | null = null;
  let pairDepth = -1;
  let rootSeen = false;

  const closePair = (): boolean => {
    if (pair === null) {
      return true;
    }
    const [old, fresh] = pair.disks;
    const owner = group ?? classGroup ?? top;
    if (old === undefined || fresh === undefined || pair.disks.length !== 2) {
      return false;
    }
    owner.entries.push({
      kind: pair.kind,
      vdev: pair.line.name,
      state: pair.line.state.toUpperCase(),
      old,
      new: fresh,
    });
    pair = null;
    pairDepth = -1;
    return true;
  };

  for (const raw of config.slice(head + 1)) {
    const line = treeLine(raw);
    if (line === null) {
      return { known: false };
    }
    if (pair !== null && line.depth <= pairDepth && !closePair()) {
      return { known: false };
    }
    if (line.depth === 0) {
      const cls = CLASSES[line.name];
      if (cls !== undefined && line.state === "") {
        klass = cls;
        group = null;
        classGroup = {
          class: cls,
          vdev: null,
          layout: "other",
          state: "",
          entries: [],
        };
        groups.push(classGroup);
        continue;
      }
      if (rootSeen || line.name !== name) {
        return { known: false };
      }
      rootSeen = true;
      continue;
    }
    if (line.depth === 1) {
      group = null;
      if (isGroupName(line.name)) {
        group = {
          class: klass,
          vdev: line.name,
          layout: layoutOfVdev(line.name),
          state: line.state.toUpperCase(),
          entries: [],
        };
        groups.push(group);
        continue;
      }
      const kind = isPairName(line.name);
      if (kind !== null) {
        pair = { kind, line, disks: [] };
        pairDepth = 1;
        continue;
      }
      (classGroup ?? top).entries.push({
        kind: "disk",
        disk: diskOfLine(line),
      });
      continue;
    }
    if (line.depth === 2 && group !== null) {
      const kind = isPairName(line.name);
      if (kind !== null) {
        pair = { kind, line, disks: [] };
        pairDepth = 2;
        continue;
      }
      group.entries.push({ kind: "disk", disk: diskOfLine(line) });
      continue;
    }
    if (pair !== null && line.depth === pairDepth + 1) {
      pair.disks.push(diskOfLine(line));
      continue;
    }
    return { known: false };
  }
  if (!closePair() || !rootSeen) {
    return { known: false };
  }
  if (top.entries.length > 0) {
    top.layout = top.entries.length === 1 ? "single" : "stripe";
    groups.unshift(top);
  }
  // A class whose disks sit in a group of their own ("logs" with "mirror-1") keeps only that group.
  const kept = groups.filter((g) => g.class === "data" || g.entries.length > 0);
  groups.length = 0;
  groups.push(...kept);
  for (const g of groups) {
    if (g.class === "data" && g.entries.length === 0) {
      return { known: false };
    }
  }
  if (!groups.some((g) => g.class === "data")) {
    return { known: false };
  }

  const scan = sections.has("scan")
    ? readScan((sections.get("scan") ?? []).join(" "))
    : null;
  if (scan === "unknown") {
    // A scan line in a form this page does not know.
    return { known: false };
  }
  const errorsLine = sections.get("errors")?.[0]?.trim() ?? "";
  let dataErrors = 0;
  if (!/^No known data errors/i.test(errorsLine)) {
    const counted = /^(\d+) data errors?/.exec(errorsLine);
    if (counted?.[1] !== undefined) {
      dataErrors = Number(counted[1]);
    } else if (/^Permanent errors have been detected/i.test(errorsLine)) {
      // zpool status -v lists each damaged file on a line of its own under this one.
      const files = (sections.get("errors") ?? [])
        .slice(1)
        .filter((l) => l.trim() !== "").length;
      dataErrors = Math.max(1, files);
    } else {
      return { known: false };
    }
  }
  return { known: true, name, state, scan, groups, dataErrors };
}

/** The data groups of a report (not spares or the other classes). */
export const dataGroups = (report: PoolReport): ReportGroup[] =>
  report.known ? report.groups.filter((g) => g.class === "data") : [];

/** Every disk the report names, with its group. */
export function reportDisks(
  report: PoolReport,
): { disk: ReportDisk; group: ReportGroup; pair: ReportEntry | null }[] {
  if (!report.known) {
    return [];
  }
  return report.groups.flatMap((group) =>
    group.entries.flatMap(
      (
        entry,
      ): {
        disk: ReportDisk;
        group: ReportGroup;
        pair: ReportEntry | null;
      }[] =>
        entry.kind === "disk"
          ? [{ disk: entry.disk, group, pair: null }]
          : [
              { disk: entry.old, group, pair: entry },
              { disk: entry.new, group, pair: entry },
            ],
    ),
  );
}

// ---- A disk's role (0.4) --------------------------------------------------------------------------

export type Role =
  | "working"
  | "workingErrors"
  | "rebuilding"
  | "failing"
  | "failed"
  | "missing"
  | "removed"
  | "offline"
  | "spare"
  | "standingIn"
  | "other";

export const hasErrors = (d: Pick<ReportDisk, "read" | "write" | "checksum">) =>
  d.read > 0 || d.write > 0 || d.checksum > 0;

export function roleOf(disk: ReportDisk, cls: GroupClass): Role {
  if (cls === "spares") {
    return disk.state === "AVAIL"
      ? "spare"
      : disk.state === "INUSE"
        ? "standingIn"
        : "other";
  }
  switch (disk.state) {
    case "ONLINE":
      return disk.resilvering
        ? "rebuilding"
        : hasErrors(disk)
          ? "workingErrors"
          : "working";
    case "DEGRADED":
      return "failing";
    case "FAULTED":
      return "failed";
    case "UNAVAIL":
      return "missing";
    case "REMOVED":
      return "removed";
    case "OFFLINE":
      return "offline";
    default:
      return "other";
  }
}

export const isWorking = (role: Role): boolean =>
  role === "working" || role === "workingErrors";
/** A role that warrants the Critical pill beside the disk. */
export const isBroken = (role: Role): boolean =>
  role === "failing" ||
  role === "failed" ||
  role === "missing" ||
  role === "removed";

/** A report name and a path name the same disk: the last part, without a partition suffix. */
export function sameDiskName(reportName: string, path: string): boolean {
  const last = (p: string) => p.split("/").pop() ?? "";
  const plain = (n: string) => last(partitionParent(`/dev/${last(n)}`));
  return reportName !== "" && plain(reportName) === plain(path);
}

/** One place in the pool, with what this page knows of it. */
export interface PoolDisk {
  disk: ReportDisk;
  role: Role;
  group: ReportGroup;
  /** The pair it belongs to while a disk is replaced or a spare stands in. */
  pair: Extract<ReportEntry, { kind: "replacing" | "spare" }> | null;
  /** Its full path from getPoolDevices: the one the change methods take. */
  path: string;
}

export type PoolDisks =
  { known: false } | { known: true; disks: PoolDisk[]; byId: boolean };

/** The contract's by-id form: only such a disk can be changed through it (ZfsDiskById). */
export const BY_ID = /^\/dev\/disk\/by-id\/[A-Za-z0-9][A-Za-z0-9._:+-]*$/;

/**
 * Each disk of the report with its path from getPoolDevices (0.4, D8). Fails closed: a report that
 * could not be read, no devices for a pool that has disks, a disk of the report with no path, or a
 * path the report does not name makes every role "not known". A missing disk is matched by the path
 * it was last seen at. `byId` is false when ZFS names any disk otherwise than by its by-id path: then
 * nothing about the disks can be changed here (the contract takes by-id paths only).
 */
export function matchDisks(
  report: PoolReport,
  devices: readonly ZfsPoolDevice[] | null | undefined,
): PoolDisks {
  if (!report.known || devices == null || devices.length === 0) {
    return { known: false };
  }
  const entries = reportDisks(report);
  const used = new Set<number>();
  const disks: PoolDisk[] = [];
  for (const { disk, group, pair } of entries) {
    const index = devices.findIndex(
      (d, i) =>
        !used.has(i) &&
        (sameDiskName(disk.name, d.devicefile) ||
          (disk.was !== null && d.devicefile === disk.was)),
    );
    const device = devices[index];
    if (device === undefined) {
      return { known: false };
    }
    used.add(index);
    disks.push({
      disk,
      role: roleOf(disk, group.class),
      group,
      pair: pair === null || pair.kind === "disk" ? null : pair,
      path: device.devicefile,
    });
  }
  if (used.size !== devices.length) {
    return { known: false };
  }
  return {
    known: true,
    disks,
    byId: disks.every((d) => BY_ID.test(d.path)),
  };
}

// ---- What a pool protects (0.5) ------------------------------------------------------------------

/** How many disks a group can lose with all its places filled. */
export function groupCanLose(layout: LayoutKey, places: number): number | null {
  switch (layout) {
    case "mirror":
      return Math.max(0, places - 1);
    case "raidz1":
      return 1;
    case "raidz2":
      return 2;
    case "raidz3":
      return 3;
    case "single":
    case "stripe":
      return 0;
    default:
      return null;
  }
}

/** Whether a place still holds a working copy: a working disk, or a pair whose old disk still works. */
function placeWorks(entry: ReportEntry): boolean {
  if (entry.kind === "disk") {
    return isWorking(roleOf(entry.disk, "data"));
  }
  return (
    isWorking(roleOf(entry.old, "data")) ||
    (isWorking(roleOf(entry.new, "data")) && !entry.new.resilvering)
  );
}

export interface GroupProtection {
  layout: LayoutKey;
  places: number;
  /** Places without a working copy now. */
  short: number;
  /** How many more disks it can lose now; null for a layout this page does not know. */
  left: number | null;
}

export function groupProtection(group: ReportGroup): GroupProtection {
  const places = group.entries.length;
  const short = group.entries.filter((e) => !placeWorks(e)).length;
  const base = groupCanLose(group.layout, places);
  return {
    layout: group.layout,
    places,
    short,
    left: base === null ? null : Math.max(0, base - short),
  };
}

export type Protection =
  | { key: "mirror" | "parity"; count: number }
  | { key: "groups"; count: number }
  | { key: "none" | "noMore" };

/** 0.5's sentence for the pool as it is now; null when a group's layout is not known. */
export function protectionOf(report: PoolReport): Protection | null {
  const groups = dataGroups(report).map(groupProtection);
  if (groups.length === 0 || groups.some((g) => g.left === null)) {
    return null;
  }
  const left = Math.min(...groups.map((g) => g.left ?? 0));
  const short = groups.some((g) => g.short > 0);
  const unprotected = groups.every(
    (g) => g.layout === "single" || g.layout === "stripe",
  );
  if (unprotected) {
    return { key: "none" };
  }
  if (left === 0) {
    return short ? { key: "noMore" } : { key: "none" };
  }
  if (groups.length > 1) {
    return { key: "groups", count: left };
  }
  return groups[0]?.layout === "mirror"
    ? { key: "mirror", count: left }
    : { key: "parity", count: left };
}

/** The layouts the create form offers, in the plugin's words, "basic" (no protection) last (P4). */
export const CREATE_LAYOUTS = [
  "mirror",
  "raidz1",
  "raidz2",
  "raidz3",
  "basic",
] as const;
export type CreateLayout = (typeof CREATE_LAYOUTS)[number];

export const MIN_DISKS: Readonly<Record<CreateLayout, number>> = {
  mirror: 2,
  raidz1: 3,
  raidz2: 4,
  raidz3: 5,
  basic: 1,
};

/** The layout a new pool of this many disks has, for the words. */
export const layoutOfCreate = (
  layout: CreateLayout,
  count: number,
): LayoutKey =>
  layout === "basic" ? (count === 1 ? "single" : "stripe") : layout;

/** What a new pool can lose, in 0.5's words. */
export function createProtection(
  layout: CreateLayout,
  count: number,
): Protection {
  switch (layout) {
    case "mirror":
      return { key: "mirror", count: Math.max(1, count - 1) };
    case "raidz1":
      return { key: "parity", count: 1 };
    case "raidz2":
      return { key: "parity", count: 2 };
    case "raidz3":
      return { key: "parity", count: 3 };
    case "basic":
      return { key: "none" };
  }
}

/**
 * About how much space for files a new pool gives (0.5), from the VM's pools (design section 20): its
 * own folder's used and available space, as a share of the base, was 90.8% for a mirror, a single disk
 * and a stripe of two, 94.8% for a RAID-Z1 of three and 92.4% for a RAID-Z2 of four. Other RAID-Z
 * counts take 90%, below every figure seen, so the estimate never claims more. Each disk counts as the
 * smallest, except in a stripe, which uses all of each disk. Rounded down for the words ("about").
 */
export function usableSize(
  layout: CreateLayout,
  sizes: readonly number[],
): number {
  const n = sizes.length;
  if (n === 0 || n < MIN_DISKS[layout]) {
    return 0;
  }
  const s = Math.min(...sizes);
  let bytes: number;
  switch (layout) {
    case "mirror":
      bytes = 0.908 * s;
      break;
    case "basic":
      bytes = 0.908 * sizes.reduce((sum, size) => sum + size, 0);
      break;
    case "raidz1":
      bytes = (n === 3 ? 0.948 : 0.9) * (n - 1) * s;
      break;
    case "raidz2":
      bytes = (n === 4 ? 0.924 : 0.9) * (n - 2) * s;
      break;
    case "raidz3":
      bytes = 0.9 * (n - 3) * s;
      break;
  }
  return floorForDisplay(bytes);
}

/** A size rounded down to the tenth of its unit, so "about {{size}}" never says more than it is. */
export function floorForDisplay(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 0;
  }
  let unit = 1;
  while (bytes >= unit * 1024 && unit < 1024 ** 5) {
    unit *= 1024;
  }
  return (Math.floor((bytes / unit) * 10) / 10) * unit;
}

// ---- Dates the plugin writes (0.2) ---------------------------------------------------------------

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A date as the plugin writes it in `lastscrub` ("Sat Nov 21 12:00:00 UTC 2026"), as milliseconds;
 * null when its form or time zone is not one this page can read for certain (UTC, GMT, or an offset
 * such as +0100). The date is then shown as written.
 */
export function parseZfsDate(text: string): number | null {
  const match =
    /^\w{3} (\w{3}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\S+) (\d{4})$/.exec(
      text.trim(),
    );
  if (match === null) {
    return null;
  }
  const [, mon, day, h, m, s, zone, year] = match;
  const month = MONTHS.indexOf(mon ?? "");
  if (month === -1 || zone === undefined) {
    return null;
  }
  let offset: number;
  if (zone === "UTC" || zone === "GMT" || zone === "Z") {
    offset = 0;
  } else {
    const off = /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
    if (off === null) {
      return null;
    }
    offset = (off[1] === "-" ? -1 : 1) * (Number(off[2]) * 60 + Number(off[3]));
  }
  const utc = Date.UTC(
    Number(year),
    month,
    Number(day),
    Number(h),
    Number(m),
    Number(s),
  );
  return utc - offset * 60_000;
}

/** The plugin's last-check words, read: what it says and when. */
export type LastScrub =
  | { kind: "never" }
  | {
      kind: "running" | "paused" | "stopped" | "ended";
      at: number | null;
      text: string;
    }
  | { kind: "unknown" };

export function readLastScrub(value: string): LastScrub {
  const text = value.trim();
  if (text === "" || text === "n/a") {
    return { kind: "unknown" };
  }
  if (/^never$/i.test(text)) {
    return { kind: "never" };
  }
  const forms: [RegExp, "running" | "paused" | "stopped"][] = [
    [/^in progress since (.+)$/i, "running"],
    [/^paused \(started (.+)\)$/i, "paused"],
    [/^canceled on (.+)$/i, "stopped"],
  ];
  for (const [form, kind] of forms) {
    const date = form.exec(text)?.[1];
    if (date !== undefined) {
      return { kind, at: parseZfsDate(date), text: date };
    }
  }
  return { kind: "ended", at: parseZfsDate(text), text };
}

// ---- A pool's state (0.3) ------------------------------------------------------------------------

export type StateKind =
  | "unread"
  | "unusable"
  | "suspended"
  | "dataErrors"
  | "degradedRebuilding"
  | "degraded"
  | "copying"
  | "removing"
  | "diskErrors"
  | "checking"
  | "checkPaused"
  | "ok"
  | "unrecognised";

export type Status = "ok" | "warning" | "critical" | "unknown";

export interface PoolState {
  kind: StateKind;
  status: Status;
  /** The check's or rebuild's progress, while one runs or is paused. */
  scan: Scan | null;
  /** The report name of the disk being rebuilt onto, or of the first disk with errors. */
  disk: string | null;
  /** ZFS's own word for the pool, for "Its state is …". */
  text: string;
}

const UNUSABLE = new Set(["FAULTED", "UNAVAIL", "REMOVED", "OFFLINE"]);
const KNOWN_STATES = new Set([
  "ONLINE",
  "DEGRADED",
  "FAULTED",
  "SUSPENDED",
  "UNAVAIL",
  "REMOVED",
  "OFFLINE",
]);

/**
 * A pool's state (0.3) from the list's pool row and its report, the stricter reading winning: the row
 * says ONLINE but the report shows a disk not working, and the pool is degraded. Anything not
 * recognised, a report that could not be read, or a state the plugin could not read is Unknown, and
 * every change to the pool is refused then (fail closed).
 */
export function poolState(
  row: Pick<ZfsObject, "state" | "status"> & { removalactive?: boolean },
  report: PoolReport,
): PoolState {
  const text = (row.state ?? "").trim().toUpperCase();
  const base = { scan: null, disk: null, text: row.state ?? "" };
  if (text === "" || text === "UNKNOWN" || text === "N/A" || !report.known) {
    return { ...base, kind: "unread", status: "unknown" };
  }
  if (!KNOWN_STATES.has(text)) {
    return { ...base, kind: "unrecognised", status: "unknown" };
  }
  if (UNUSABLE.has(text) || UNUSABLE.has(report.state)) {
    return { ...base, kind: "unusable", status: "critical" };
  }
  if (text === "SUSPENDED" || report.state === "SUSPENDED") {
    return { ...base, kind: "suspended", status: "critical" };
  }
  const scan = report.scan;
  const running = scan !== null && scan.status === "running" ? scan : null;
  const rebuilding = running?.kind === "rebuild" ? running : null;
  const disks = reportDisks(report);
  const replacing = disks.find((d) => d.pair?.kind === "replacing")?.pair;
  const ontoName =
    disks.find((d) => d.disk.resilvering)?.disk.name ??
    (replacing !== undefined && replacing !== null && replacing.kind !== "disk"
      ? replacing.new.name
      : null);
  if (row.status.trim().toLowerCase() === "error" || report.dataErrors > 0) {
    return { ...base, kind: "dataErrors", status: "critical", scan: running };
  }
  const short = dataGroups(report).some((g) => groupProtection(g).short > 0);
  const degraded = text === "DEGRADED" || report.state === "DEGRADED" || short;
  if (degraded && rebuilding !== null) {
    return {
      ...base,
      kind: "degradedRebuilding",
      status: "critical",
      scan: rebuilding,
      disk: ontoName,
    };
  }
  if (degraded) {
    return { ...base, kind: "degraded", status: "critical" };
  }
  if (rebuilding !== null) {
    return {
      ...base,
      kind: "copying",
      status: "warning",
      scan: rebuilding,
      disk: ontoName,
    };
  }
  if (row.removalactive === true) {
    return { ...base, kind: "removing", status: "warning" };
  }
  const withErrors = disks.find(
    (d) => d.group.class !== "spares" && hasErrors(d.disk),
  );
  if (withErrors !== undefined) {
    return {
      ...base,
      kind: "diskErrors",
      status: "warning",
      disk: withErrors.disk.name,
    };
  }
  if (running?.kind === "check") {
    return { ...base, kind: "checking", status: "ok", scan: running };
  }
  if (scan?.kind === "check" && scan.status === "paused") {
    return { ...base, kind: "checkPaused", status: "ok", scan };
  }
  return { ...base, kind: "ok", status: "ok" };
}

/** A check or a rebuild running now: the page polls (0.6, P13). A paused check is not busy. */
export const isBusy = (state: PoolState): boolean =>
  state.scan !== null && state.scan.status === "running";

export const isRebuilding = (state: PoolState): boolean =>
  state.kind === "degradedRebuilding" || state.kind === "copying";

/** A state in which the pool's files cannot be reached: nothing is added or taken from it. */
export const isUnusable = (state: PoolState): boolean =>
  state.kind === "unusable" || state.kind === "suspended";

export const isUnknown = (state: PoolState): boolean =>
  state.kind === "unread" || state.kind === "unrecognised";

/** The dashboard's reading of getPoolStatus alone (10.1): only what it says, no report. */
export type PoolHealth = "degraded" | "unusable" | "damaged" | "ok" | "unknown";

export function poolHealth(row: { state: string; status: string }): PoolHealth {
  const state = row.state.trim().toUpperCase();
  if (row.status.trim().toLowerCase() === "error") {
    return "damaged";
  }
  if (state === "DEGRADED") {
    return "degraded";
  }
  if (state === "SUSPENDED" || UNUSABLE.has(state)) {
    return "unusable";
  }
  return state === "ONLINE" ? "ok" : "unknown";
}

// ---- How full (0.3, D7) ---------------------------------------------------------------------------

export type FullLevel = "ok" | "warning" | "critical";

/** ZFS slows down past 80% and keeps a few percent back near the top: fixed levels for pools. */
export const fullLevel = (capacity: number | undefined): FullLevel =>
  capacity === undefined
    ? "ok"
    : capacity >= 95
      ? "critical"
      : capacity >= 80
        ? "warning"
        : "ok";

const RANK: Readonly<Record<Status, number>> = {
  critical: 3,
  warning: 2,
  unknown: 1,
  ok: 0,
};
export const worse = (a: Status, b: Status): Status =>
  RANK[b] > RANK[a] ? b : a;

/** A pool's place in the roll-up: the worse of its state and how full it is. */
export const poolStatus = (state: PoolState, capacity: number | undefined) =>
  worse(state.status, fullLevel(capacity));

// ---- Compression (0.2) ---------------------------------------------------------------------------

export type CompressionWord = "off" | "lz4" | "on" | "other";

export function compressionWord(value: string | undefined): CompressionWord {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "off") {
    return "off";
  }
  if (v === "lz4") {
    return "lz4";
  }
  if (v === "on") {
    return "on";
  }
  return "other";
}

/** "saves about 18%" from a ratio "1.22" (or "1.22x"); null at 1.00 or for anything unreadable. */
export function compressionSaving(ratio: string | undefined): number | null {
  const n = Number((ratio ?? "").trim().replace(/x$/i, ""));
  if (!Number.isFinite(n) || n <= 1.0) {
    return null;
  }
  return Math.round((1 - 1 / n) * 100);
}

// ---- Size limits (4.4) ---------------------------------------------------------------------------

export const GIB = 1024 ** 3;
export const TIB = 1024 ** 4;

/** The size limit to send: "none", or a whole number of GiB or TiB (the contract's form). */
export function quotaValue(
  limit: { amount: string; unit: "G" | "T" } | null,
): string | null {
  if (limit === null) {
    return "none";
  }
  const text = limit.amount.trim();
  if (!/^[1-9][0-9]{0,5}$/.test(text)) {
    return null;
  }
  return `${text}${limit.unit}`;
}

export const quotaBytes = (amount: string, unit: "G" | "T"): number =>
  Number(amount) * (unit === "G" ? GIB : TIB);

/** A limit in bytes as the field shows it: whole TiB when it is one, else GiB rounded up. */
export function limitFields(size: number | null): {
  amount: string;
  unit: "G" | "T";
} {
  if (size === null || size <= 0) {
    return { amount: "", unit: "G" };
  }
  if (size % TIB === 0) {
    return { amount: String(size / TIB), unit: "T" };
  }
  return { amount: String(Math.ceil(size / GIB)), unit: "G" };
}

// ---- Snapshots (5.1) -----------------------------------------------------------------------------

/** A file system's snapshots in the server's order (name order; a dated name is the time). */
export const snapshotsOf = (
  all: readonly ZfsSnapshot[],
  fs: string,
): ZfsSnapshot[] => all.filter((s) => s.parent === fs);

/** The file systems made from one of these snapshots (a clone's `origin`). */
export const clonesOf = (
  rows: readonly ZfsObject[],
  snapshotPaths: readonly string[],
): ZfsObject[] =>
  rows.filter((r) => {
    const origin = originOf(r);
    return origin !== null && snapshotPaths.includes(origin);
  });

// ---- What uses a file system (0.12) --------------------------------------------------------------

export type FsUsedBy =
  | { kind: "loading" }
  | { kind: "unchecked"; error: unknown }
  | {
      kind: "known";
      shares: SharedFolder[];
      /** The plugin says shared folders use it, but none was found by its folder. */
      sharedUnnamed: boolean;
      /** Its OMV mount entry is used by something that is not a shared folder. */
      other: boolean;
      inside: ZfsObject[];
      clones: { clone: ZfsObject; snapshot: string }[];
    };

/**
 * What uses a ZFS file system (0.12): shared folders on its folder (FsTab.getByFsName refuses a ZFS
 * name with HTTP 400, observed, so a shared folder is matched by the folder its mount entry names),
 * the plugin's own `hasshares` (the stricter wins), something else using its mount entry (`_used` of
 * its FileSystemMgmt.getList row), the file systems and volumes inside it, and clones of its
 * snapshots. Fails closed: a read it needs that failed makes it "unchecked".
 */
export function fsUsedBy(
  row: ZfsObject,
  rows: readonly ZfsObject[],
  inputs: {
    shares: {
      data?: readonly SharedFolder[];
      failed: boolean;
      error?: unknown;
    };
    /** `_used` of the file system's getList row; undefined while that read is missing. */
    omvUsed: { value?: boolean; failed: boolean; error?: unknown };
    snapshots: {
      data?: readonly ZfsSnapshot[];
      failed: boolean;
      error?: unknown;
    };
  },
): FsUsedBy {
  const { shares, omvUsed, snapshots } = inputs;
  for (const input of [shares, omvUsed, snapshots]) {
    if (input.failed) {
      return { kind: "unchecked", error: input.error };
    }
  }
  if (
    shares.data === undefined ||
    snapshots.data === undefined ||
    (omvUsed.value === undefined && !hasNoFolder(row))
  ) {
    return { kind: "loading" };
  }
  const folder = row.mountpoint.trim();
  const found = hasNoFolder(row)
    ? []
    : shares.data.filter(
        (s) =>
          s.mntent?.dir === folder ||
          (s.mntent?.dir !== undefined && s.mntent.dir === `${folder}/`),
      );
  const own = snapshotsOf(snapshots.data, row.path).map((s) => s.path);
  return {
    kind: "known",
    shares: found,
    sharedUnnamed: row.hasshares && found.length === 0,
    other: omvUsed.value === true && found.length === 0 && !row.hasshares,
    inside: inside(rows, row.path),
    clones: clonesOf(rows, own).map((clone) => ({
      clone,
      snapshot: (originOf(clone) ?? "").split("@")[1] ?? "",
    })),
  };
}

// ---- The interface's own refusals (0.10) ---------------------------------------------------------

/** The common reasons an action on a pool is refused. */
export type PoolBlocker =
  | { kind: "unknown" }
  | { kind: "unusable" }
  | { kind: "full" }
  | { kind: "changing" }
  | { kind: "critical" }
  | { kind: "rebuilding" }
  | { kind: "checking" };

/** 4.2: a file system can be added to a usable, known pool that is not full. */
export function addFsBlocker(
  state: PoolState,
  capacity: number | undefined,
  changing: boolean,
): PoolBlocker | null {
  if (isUnknown(state)) {
    return { kind: "unknown" };
  }
  if (isUnusable(state)) {
    return { kind: "unusable" };
  }
  if (fullLevel(capacity) === "critical") {
    return { kind: "full" };
  }
  return changing ? { kind: "changing" } : null;
}

export type CheckDecision =
  | { allowed: true; action: "start" | "stop" | "resume" }
  | { allowed: false; blocker: PoolBlocker };

/** 6.1: Check now when idle; Stop while checking; Continue (and Stop) while paused. */
export function checkDecision(
  state: PoolState,
  changing: boolean,
): CheckDecision {
  const no = (blocker: PoolBlocker): CheckDecision => ({
    allowed: false,
    blocker,
  });
  if (isUnknown(state)) {
    return no({ kind: "unknown" });
  }
  if (state.kind === "checking") {
    return { allowed: true, action: "stop" };
  }
  if (state.kind === "checkPaused") {
    return { allowed: true, action: "resume" };
  }
  if (changing) {
    return no({ kind: "changing" });
  }
  if (isRebuilding(state)) {
    return no({ kind: "rebuilding" });
  }
  if (state.status === "critical") {
    return no({ kind: "critical" });
  }
  return { allowed: true, action: "start" };
}

export type DiskBlocker =
  | PoolBlocker
  | { kind: "rolesUnknown" }
  | { kind: "notById" }
  | { kind: "noCopy" }
  | { kind: "class" }
  | { kind: "notWorking" }
  | { kind: "lastCopy" }
  | { kind: "notOffline" };

export type DiskDecision =
  { allowed: true } | { allowed: false; blocker: DiskBlocker };

const ok: DiskDecision = { allowed: true };
const refuse = (blocker: DiskBlocker): DiskDecision => ({
  allowed: false,
  blocker,
});

/** What every change to a disk needs first: a known, usable pool whose disks this page can name. */
function diskGate(
  state: PoolState,
  disks: PoolDisks,
  changing: boolean,
): DiskDecision {
  if (isUnknown(state)) {
    return refuse({ kind: "unknown" });
  }
  if (isUnusable(state)) {
    return refuse({ kind: "unusable" });
  }
  if (!disks.known) {
    return refuse({ kind: "rolesUnknown" });
  }
  if (!disks.byId) {
    return refuse({ kind: "notById" });
  }
  return changing ? refuse({ kind: "changing" }) : ok;
}

/** 7.1: whether "Replace…" is offered for this disk. */
export function replaceDecision(
  disk: PoolDisk,
  state: PoolState,
  disks: PoolDisks,
  changing: boolean,
): DiskDecision {
  const gate = diskGate(state, disks, changing);
  if (!gate.allowed) {
    return gate;
  }
  if (disk.group.class !== "data") {
    return refuse({ kind: "class" });
  }
  if (isRebuilding(state) || disk.pair !== null || disk.role === "rebuilding") {
    return refuse({ kind: "rebuilding" });
  }
  const unprotected =
    disk.group.layout === "single" || disk.group.layout === "stripe";
  if (unprotected && !isWorking(disk.role)) {
    return refuse({ kind: "noCopy" });
  }
  if (disk.role === "other") {
    return refuse({ kind: "rolesUnknown" });
  }
  return ok;
}

/** 7.7: "Take offline…" on a working disk of a group that can lose another, on an OK or Warning pool. */
export function offlineDecision(
  disk: PoolDisk,
  state: PoolState,
  disks: PoolDisks,
  changing: boolean,
): DiskDecision {
  const gate = diskGate(state, disks, changing);
  if (!gate.allowed) {
    return gate;
  }
  if (disk.group.class !== "data") {
    return refuse({ kind: "class" });
  }
  if (disk.group.layout === "single" || disk.group.layout === "stripe") {
    return refuse({ kind: "noCopy" });
  }
  if (!isWorking(disk.role) || disk.pair !== null) {
    return refuse({ kind: "notWorking" });
  }
  if (isRebuilding(state)) {
    return refuse({ kind: "rebuilding" });
  }
  if (state.status === "critical" || state.status === "unknown") {
    return refuse({ kind: "critical" });
  }
  const left = groupProtection(disk.group).left;
  if (left === null || left < 1) {
    return refuse({ kind: "lastCopy" });
  }
  return ok;
}

/** 7.7: "Bring back…" on an offline disk. */
export function onlineDecision(
  disk: PoolDisk,
  state: PoolState,
  disks: PoolDisks,
  changing: boolean,
): DiskDecision {
  const gate = diskGate(state, disks, changing);
  if (!gate.allowed) {
    return gate;
  }
  return disk.role === "offline" ? ok : refuse({ kind: "notOffline" });
}

export type DeleteBlocker =
  | { kind: "poolFolder" }
  | { kind: "shares"; names: string[] }
  | { kind: "sharedUnnamed" }
  | { kind: "other" }
  | { kind: "inside"; rows: ZfsObject[] }
  | { kind: "fileSystems"; rows: ZfsObject[] }
  | { kind: "volumes"; rows: ZfsObject[] }
  | { kind: "clone"; clone: ZfsObject }
  | { kind: "locked" }
  | { kind: "unread"; error: unknown }
  | { kind: "unknown" }
  | { kind: "changing" };

/** 9.1: why a file system cannot be deleted; null while its reads load. */
export function fsDeleteBlockers(
  row: ZfsObject,
  used: FsUsedBy,
  poolUnknown: boolean,
  changing: boolean,
): DeleteBlocker[] | null {
  if (row.poolroot === true) {
    return [{ kind: "poolFolder" }];
  }
  if (used.kind === "loading") {
    return null;
  }
  const blockers: DeleteBlocker[] = [];
  if (used.kind === "unchecked") {
    blockers.push({ kind: "unread", error: used.error });
  } else {
    if (used.shares.length > 0) {
      blockers.push({ kind: "shares", names: used.shares.map((s) => s.name) });
    }
    if (used.sharedUnnamed) {
      blockers.push({ kind: "sharedUnnamed" });
    }
    if (used.other) {
      blockers.push({ kind: "other" });
    }
    if (used.inside.length > 0) {
      blockers.push({ kind: "inside", rows: used.inside });
    }
    for (const { clone } of used.clones) {
      blockers.push({ kind: "clone", clone });
    }
  }
  if (isLocked(row)) {
    blockers.push({ kind: "locked" });
  }
  if (poolUnknown) {
    blockers.push({ kind: "unknown" });
  }
  if (changing) {
    blockers.push({ kind: "changing" });
  }
  return blockers;
}

/** 9.2: why a pool cannot be deleted; null while its reads load. A busy pool may be deleted. */
export function poolDeleteBlockers(
  pool: string,
  rows: readonly ZfsObject[],
  rootUsed: FsUsedBy | null,
  poolUnknown: boolean,
  changing: boolean,
): DeleteBlocker[] | null {
  const root = poolRoot(rows, pool);
  if (rootUsed?.kind === "loading") {
    return null;
  }
  const blockers: DeleteBlocker[] = [];
  const on = onPool(rows, pool).filter((r) => r !== root);
  const fileSystems = on.filter(isFsRow);
  const volumes = on.filter(isVolumeRow);
  if (fileSystems.length > 0) {
    blockers.push({ kind: "fileSystems", rows: fileSystems });
  }
  if (volumes.length > 0) {
    blockers.push({ kind: "volumes", rows: volumes });
  }
  if (root === undefined || rootUsed === null) {
    blockers.push({ kind: "unread", error: undefined });
  } else if (rootUsed.kind === "unchecked") {
    blockers.push({ kind: "unread", error: rootUsed.error });
  } else if (rootUsed.kind === "known") {
    if (rootUsed.shares.length > 0) {
      blockers.push({
        kind: "shares",
        names: rootUsed.shares.map((s) => s.name),
      });
    }
    if (rootUsed.sharedUnnamed) {
      blockers.push({ kind: "sharedUnnamed" });
    }
    if (rootUsed.other) {
      blockers.push({ kind: "other" });
    }
    if (isLocked(root)) {
      blockers.push({ kind: "locked" });
    }
  }
  if (poolUnknown) {
    blockers.push({ kind: "unknown" });
  }
  if (changing) {
    blockers.push({ kind: "changing" });
  }
  return blockers;
}

/** 5.3: why a snapshot cannot be taken now; null when it may. */
export function snapshotBlocker(
  row: ZfsObject,
  state: PoolState | null,
): "locked" | "unknown" | "unusable" | null {
  if (isLocked(row)) {
    return "locked";
  }
  if (state === null || isUnknown(state)) {
    return "unknown";
  }
  return isUnusable(state) ? "unusable" : null;
}

/** Whether two reads show the same pool: the same name and the same disks (2.9). */
export function samePoolDisks(
  a: readonly string[] | null,
  b: readonly string[] | null,
): boolean {
  if (a === null || b === null) {
    return true;
  }
  return a.some((p) => b.includes(p)) || (a.length === 0 && b.length === 0);
}

/** The shared folders whose mount entry is this file system's folder (0.12); undefined until read. */
export const sharesOn = (
  row: Pick<ZfsObject, "mountpoint">,
  shares: readonly SharedFolder[] | undefined,
): SharedFolder[] | undefined =>
  shares?.filter(
    (s) => !hasNoFolder(row) && s.mntent?.dir === row.mountpoint.trim(),
  );
