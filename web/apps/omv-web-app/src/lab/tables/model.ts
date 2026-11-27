// SPDX-License-Identifier: GPL-3.0-or-later
// The table prototypes' data and pure logic (rethink spec 4): lab fixtures shaped like the mock's
// examples, the summary sentences, worst-first sorting, grouping, filtering and the number and path
// formats. Development only (UI-11). No server data is read here: the lab does not boot the mock,
// and "who can open it" has no per-row read yet (open owner decision 4), so every row is a fixture.

// ─── Shared ───────────────────────────────────────────────────────────────────────────────────

/** A monitored state of health, as the table shows it (4.4). Unknown is "Not checked yet" here. */
export type Health = "ok" | "warning" | "critical" | "unknown";

/** Worst first (4.4): Critical, Warning, Unknown, OK. A set with one unread member is never fine. */
const SEVERITY: Record<Health, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  ok: 3,
};

export function byHealth(a: Health, b: Health): number {
  return SEVERITY[a] - SEVERITY[b];
}

export function worst(states: readonly Health[]): Health {
  return [...states].sort(byHealth)[0] ?? "ok";
}

const NBSP = " ";
const UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

/** Binary units, one decimal, the number and unit apart so the unit can be secondary text (4.5). */
export function bytes(n: number): { value: string; unit: string } {
  let unit = 0;
  let v = n;
  while (v >= 1024 && unit < UNITS.length - 1) {
    v /= 1024;
    unit += 1;
  }
  return {
    value: unit === 0 ? String(v) : v.toFixed(1),
    unit: UNITS[unit] ?? "B",
  };
}

/** The same as one string, with a non-breaking space before the unit: "412.0 GiB". */
export function bytesText(n: number): string {
  const { value, unit } = bytes(n);
  return `${value}${NBSP}${unit}`;
}

/** A path too long for its cell keeps its start and its end (4.8): "/srv/dev-disk…/Photos/". */
export function middleTruncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

export type SortDir = "ascending" | "descending";

export function plural(count: number, one: string, other: string): string {
  return `${String(count)} ${count === 1 ? one : other}`;
}

/** "Photos", "Photos and Music", "Photos, Music and Documents". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}

/**
 * The state a group says once instead of under every item: the word most of its items share, when
 * at least two share it, with those items in their order. An item whose word is null has nothing to
 * say (a healthy disk on the map shows its temperature instead). Equal counts go to the word met
 * first. Every item whose word differs keeps its own.
 */
export function sharedState<T>(
  items: readonly T[],
  wordOf: (item: T) => string | null,
): { word: string; items: T[] } | null {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const word = wordOf(item);
    if (word !== null) {
      groups.set(word, [...(groups.get(word) ?? []), item]);
    }
  }
  let best: { word: string; items: T[] } | null = null;
  for (const [word, group] of groups) {
    if (group.length >= 2 && group.length > (best?.items.length ?? 0)) {
      best = { word, items: group };
    }
  }
  return best;
}

const GiB = 1024 ** 3;
const TiB = 1024 ** 4;

// ─── Shared folders ───────────────────────────────────────────────────────────────────────────

export interface Drive {
  id: string;
  /** The file system's label, as people named it: "Data drive". */
  name: string;
  type: string;
  /** The partition it lives on, technical: "sda1". */
  device: string;
  size: number;
  /** Free space; null while it is not mounted (no reading, never "empty"). */
  free: number | null;
  mounted: boolean;
}

export type Service = "smb" | "nfs";

export type Access =
  { kind: "people"; count: number } | { kind: "everyone" } | { kind: "nobody" };

export interface Folder {
  id: string;
  name: string;
  /** What it is, in the owner's words; empty when none was given. */
  description: string;
  drive: string;
  services: readonly Service[];
  access: Access;
  /** The folder on the drive, technical: "Photos/". */
  relPath: string;
  /** Something else refers to it (a share, a copy job): the technical "In use" column. */
  inUse: boolean;
}

export const DRIVES: readonly Drive[] = [
  {
    id: "data",
    name: "Data drive",
    type: "EXT4",
    device: "sda1",
    size: 3.6 * TiB,
    free: 1.4 * TiB,
    mounted: true,
  },
  {
    id: "media",
    name: "Media drive",
    type: "EXT4",
    device: "sdc1",
    size: 3.6 * TiB,
    free: null,
    mounted: false,
  },
];

export const FOLDERS: readonly Folder[] = [
  {
    id: "photos",
    name: "Photos",
    description: "Family pictures",
    drive: "data",
    services: ["smb"],
    access: { kind: "people", count: 6 },
    relPath: "Photos/",
    inUse: true,
  },
  {
    id: "music",
    name: "Music",
    description: "Everyone's music",
    drive: "data",
    services: ["smb", "nfs"],
    access: { kind: "everyone" },
    relPath: "Music/",
    inUse: true,
  },
  {
    id: "documents",
    name: "Documents",
    description: "",
    drive: "data",
    services: [],
    access: { kind: "nobody" },
    relPath: "Documents/",
    inUse: false,
  },
  {
    id: "films",
    name: "Films",
    description: "Films for the living room",
    drive: "media",
    services: ["smb"],
    access: { kind: "people", count: 3 },
    relPath: "Films/",
    inUse: true,
  },
];

/** The folder a "Return from creating Videos" brings back (7.5, "A new row arrives"). */
export const NEW_FOLDER: Folder = {
  id: "videos",
  name: "Videos",
  description: "Home videos",
  drive: "data",
  services: ["smb"],
  access: { kind: "people", count: 6 },
  relPath: "Videos/",
  inUse: true,
};

// A documentation UUID, as in the mock's examples; never one from a real system.
const UUID = "00000000-0000-4000-8000-00000000000";

export function fullPath(folder: Folder, drives: readonly Drive[]): string {
  const n = drives.findIndex((d) => d.id === folder.drive) + 3;
  return `/srv/dev-disk-by-uuid-${UUID}${String(n)}/${folder.relPath}`;
}

export function driveOf(folder: Folder, drives: readonly Drive[]): Drive {
  const drive = drives.find((d) => d.id === folder.drive);
  if (!drive) {
    throw new Error(`No drive ${folder.drive}`);
  }
  return drive;
}

/** A folder's status is its file system's (4.9): not mounted means not reachable. */
export function folderHealth(folder: Folder, drives: readonly Drive[]): Health {
  return driveOf(folder, drives).mounted ? "ok" : "warning";
}

export type FolderFilter = "all" | "unreachable" | "shared" | "unshared";

export function matchesFilter(
  folder: Folder,
  drives: readonly Drive[],
  filter: FolderFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unreachable":
      return folderHealth(folder, drives) !== "ok";
    case "shared":
      return folder.services.length > 0;
    case "unshared":
      return folder.services.length === 0;
  }
}

/** Search looks at what is shown: the name, the description, the drive and the path on the drive. */
export function matchesSearch(
  folder: Folder,
  drives: readonly Drive[],
  query: string,
): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === "") {
    return true;
  }
  return [
    folder.name,
    folder.description,
    driveOf(folder, drives).name,
    folder.relPath,
  ].some((s) => s.toLocaleLowerCase().includes(q));
}

export function filterCounts(
  folders: readonly Folder[],
  drives: readonly Drive[],
): Record<FolderFilter, number> {
  const count = (f: FolderFilter) =>
    folders.filter((x) => matchesFilter(x, drives, f)).length;
  return {
    all: folders.length,
    unreachable: count("unreachable"),
    shared: count("shared"),
    unshared: count("unshared"),
  };
}

/**
 * "4 shared folders, 1 not reachable, 3 shared with Windows and Mac": counts, worst first (4.1). The
 * summary line joins the parts with commas and ends the sentence.
 */
export function folderSummary(
  folders: readonly Folder[],
  drives: readonly Drive[],
): string[] {
  if (folders.length === 0) {
    return ["There are no shared folders yet"];
  }
  const bad = folders.filter((f) => folderHealth(f, drives) !== "ok").length;
  const smb = folders.filter((f) => f.services.includes("smb")).length;
  const parts = [plural(folders.length, "shared folder", "shared folders")];
  if (bad > 0) {
    parts.push(`${String(bad)} not reachable`);
  }
  parts.push(
    smb === 0
      ? "none shared with Windows and Mac"
      : `${String(smb)} shared with Windows and Mac`,
  );
  return parts;
}

export type FolderSortKey = "status" | "name" | "free";

export function sortFolders(
  folders: readonly Folder[],
  drives: readonly Drive[],
  key: FolderSortKey,
  dir: SortDir,
): Folder[] {
  const sign = dir === "ascending" ? 1 : -1;
  const byName = (a: Folder, b: Folder) => a.name.localeCompare(b.name);
  return [...folders].sort((a, b) => {
    if (key === "name") {
      return sign * byName(a, b);
    }
    if (key === "free") {
      const fa = driveOf(a, drives).free ?? -1;
      const fb = driveOf(b, drives).free ?? -1;
      return sign * (fa - fb) || byName(a, b);
    }
    return (
      sign * byHealth(folderHealth(a, drives), folderHealth(b, drives)) ||
      byName(a, b)
    );
  });
}

export interface FolderGroup {
  drive: Drive | null;
  folders: Folder[];
  health: Health;
}

/**
 * By drive when the folders sit on two or more (4.9); one group without a heading otherwise. Groups
 * go worst first, then by name, so a drive that stops moves its folders to the top.
 */
export function groupFolders(
  sorted: readonly Folder[],
  drives: readonly Drive[],
): FolderGroup[] {
  const used = drives.filter((d) => sorted.some((f) => f.drive === d.id));
  if (used.length < 2) {
    return [
      {
        drive: null,
        folders: [...sorted],
        health: worst(sorted.map((f) => folderHealth(f, drives))),
      },
    ];
  }
  return used
    .map((drive) => {
      const folders = sorted.filter((f) => f.drive === drive.id);
      return {
        drive,
        folders,
        health: worst(folders.map((f) => folderHealth(f, drives))),
      };
    })
    .sort(
      (a, b) =>
        byHealth(a.health, b.health) ||
        (a.drive?.name ?? "").localeCompare(b.drive?.name ?? ""),
    );
}

export function accessWords(access: Access): string {
  switch (access.kind) {
    case "people":
      return plural(access.count, "person", "people");
    case "everyone":
      return "Everyone";
    case "nobody":
      return "Nobody";
  }
}

// ─── Disks ────────────────────────────────────────────────────────────────────────────────────

export type DiskKind = "hdd" | "ssd" | "nvme" | "usb" | "optical" | "disk";

export type Holds =
  | { kind: "system" }
  | { kind: "fs"; name: string; type: string }
  | { kind: "empty" }
  | { kind: "removable"; what: string };

export type Power = "awake" | "asleep" | "none";

export interface Disk {
  id: string;
  device: string;
  kind: DiskKind;
  size: number;
  model: string;
  serial: string;
  health: Health;
  /** Why the health is what it is, in plain words ("8 damaged areas were set aside"). */
  reason: string;
  /** Celsius; null when not read (asleep, or a drive that reports none). */
  temperature: number | null;
  holds: Holds;
  power: Power;
}

export const KIND_WORDS: Record<DiskKind, string> = {
  hdd: "hard disk",
  ssd: "SSD",
  nvme: "NVMe SSD",
  usb: "USB disk",
  optical: "CD and DVD drive",
  disk: "disk",
};

/** The temperature from which a disk's figure takes a warning word (4.9: only when crossed). */
export const HOT = 50;

export const NOT_CHECKED = "Not checked yet";

export const DISKS: readonly Disk[] = [
  {
    id: "nvme0n1",
    device: "nvme0n1",
    kind: "nvme",
    size: 238.5 * GiB,
    model: "Example NVMe SSD 256",
    serial: "EXAMPLE-SERIAL-0001",
    health: "unknown",
    reason: NOT_CHECKED,
    temperature: 38,
    holds: { kind: "system" },
    power: "none",
  },
  {
    id: "sda",
    device: "sda",
    kind: "hdd",
    size: 3.6 * TiB,
    model: "Example NAS HDD 4TB",
    serial: "EXAMPLE-SERIAL-0002",
    health: "unknown",
    reason: NOT_CHECKED,
    temperature: 34,
    holds: { kind: "fs", name: "Data drive", type: "EXT4" },
    power: "awake",
  },
  {
    id: "sdb",
    device: "sdb",
    kind: "hdd",
    size: 3.6 * TiB,
    model: "Example NAS HDD 4TB",
    serial: "EXAMPLE-SERIAL-0003",
    health: "unknown",
    reason: NOT_CHECKED,
    temperature: 31,
    holds: { kind: "empty" },
    power: "awake",
  },
  {
    id: "sdc",
    device: "sdc",
    kind: "hdd",
    size: 3.6 * TiB,
    model: "Example NAS HDD 4TB",
    serial: "EXAMPLE-SERIAL-0004",
    health: "unknown",
    reason: NOT_CHECKED,
    temperature: 33,
    holds: { kind: "fs", name: "Media drive", type: "EXT4" },
    power: "awake",
  },
  {
    id: "sdd",
    device: "sdd",
    kind: "ssd",
    size: 931.5 * GiB,
    model: "Example SATA SSD 1TB",
    serial: "EXAMPLE-SERIAL-0005",
    health: "unknown",
    reason: NOT_CHECKED,
    temperature: null,
    holds: { kind: "empty" },
    power: "asleep",
  },
  {
    id: "sde",
    device: "sde",
    kind: "usb",
    size: 29.3 * GiB,
    model: "Example USB stick",
    serial: "EXAMPLE-SERIAL-0006",
    health: "unknown",
    reason: "USB sticks do not report their health",
    temperature: null,
    holds: { kind: "removable", what: "Camera card copy (FAT)" },
    power: "none",
  },
  {
    id: "sr0",
    device: "sr0",
    kind: "optical",
    size: 900 * 1024,
    model: "Example CD/DVD drive",
    serial: "EXAMPLE-SERIAL-0007",
    health: "unknown",
    reason: "CD and DVD drives do not report their health",
    temperature: null,
    holds: { kind: "removable", what: "A disc is in it" },
    power: "none",
  },
];

/** What a health check finds, per disk: the lab's fixed answer. */
export const CHECK_RESULT: Readonly<
  Record<string, Pick<Disk, "health" | "reason" | "temperature">>
> = {
  nvme0n1: { health: "ok", reason: "No problems found", temperature: 38 },
  sda: { health: "ok", reason: "No problems found", temperature: 34 },
  sdb: { health: "ok", reason: "No problems found", temperature: 31 },
  sdc: { health: "ok", reason: "No problems found", temperature: 33 },
  sdd: {
    health: "warning",
    reason:
      "It has used most of its spare space for worn-out parts. Plan to replace it.",
    temperature: 41,
  },
};

/** Whether a check can read this disk's health at all. */
export function checkable(disk: Disk): boolean {
  return disk.id in CHECK_RESULT;
}

export type DiskGroupId = "system" | "inUse" | "empty" | "removable";

export const DISK_GROUPS: readonly { id: DiskGroupId; name: string }[] = [
  { id: "system", name: "System disk" },
  { id: "inUse", name: "In use" },
  { id: "empty", name: "Empty, ready to use" },
  { id: "removable", name: "Removable and optical" },
];

export function diskGroup(disk: Disk): DiskGroupId {
  switch (disk.holds.kind) {
    case "system":
      return "system";
    case "fs":
      return "inUse";
    case "empty":
      return "empty";
    case "removable":
      return "removable";
  }
}

export type DiskSortKey = "health" | "device" | "size" | "temperature";

/** Within each group: health worst first, then device (4.9); or the column the person chose. */
export function sortDisks(
  disks: readonly Disk[],
  key: DiskSortKey,
  dir: SortDir,
): Disk[] {
  const sign = dir === "ascending" ? 1 : -1;
  const byDevice = (a: Disk, b: Disk) => a.device.localeCompare(b.device);
  return [...disks].sort((a, b) => {
    switch (key) {
      case "device":
        return sign * byDevice(a, b);
      case "size":
        return sign * (a.size - b.size) || byDevice(a, b);
      case "temperature":
        return (
          sign * ((a.temperature ?? -999) - (b.temperature ?? -999)) ||
          byDevice(a, b)
        );
      case "health":
        return sign * byHealth(a.health, b.health) || byDevice(a, b);
    }
  });
}

export function groupDisks(
  sorted: readonly Disk[],
): { id: DiskGroupId; name: string; disks: Disk[]; health: Health }[] {
  return DISK_GROUPS.map((g) => {
    const disks = sorted.filter((d) => diskGroup(d) === g.id);
    return { ...g, disks, health: worst(disks.map((d) => d.health)) };
  }).filter((g) => g.disks.length > 0);
}

/** "7 disks, health not checked since you signed in", or the counts worst first once checked. */
export function diskSummary(disks: readonly Disk[]): {
  parts: string[];
  checked: boolean;
  worst: Health;
} {
  const readable = disks.filter(checkable);
  const checked = readable.every((d) => d.health !== "unknown");
  const parts = [plural(disks.length, "disk", "disks")];
  const critical = readable.filter((d) => d.health === "critical").length;
  const warning = readable.filter((d) => d.health === "warning").length;
  if (critical > 0) {
    parts.push(`${String(critical)} critical`);
  }
  if (warning > 0) {
    parts.push(plural(warning, "warning", "warnings"));
  }
  parts.push(
    checked
      ? "health checked just now"
      : "health not checked since you signed in",
  );
  return {
    parts,
    checked,
    worst: worst(readable.map((d) => d.health)),
  };
}

/** "3.6 TiB hard disk": how people know a disk (4.3), never the device path. */
export function diskTitle(disk: Disk): string {
  return `${bytesText(disk.size)} ${KIND_WORDS[disk.kind]}`;
}

export function holdsWords(holds: Holds): string {
  switch (holds.kind) {
    case "system":
      return "System";
    case "fs":
      return holds.name;
    case "empty":
      return "Empty";
    case "removable":
      return holds.what;
  }
}
