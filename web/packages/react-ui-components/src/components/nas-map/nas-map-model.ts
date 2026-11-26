// SPDX-License-Identifier: GPL-3.0-or-later
// What the NAS map shows, apart from how it is drawn (rethink 6.8): the rows built from the NAS's
// reads, their order and caps, the problem that flows along a row, what pointing at a thing lights,
// and where the arrow keys move. Free of React, the DOM and words: every sentence comes from the
// caller's words (nas-map-words.ts), and every figure from the input.
//
// The input types are the least the map needs, named after the contract fields they come from, so
// the app maps each read in a line or two (the mapping is in each field's comment). The library does
// not import the generated types (it is app-agnostic), as with `DriveSlot` and `HealthListItem`.

/** A thing's state of health. `unknown` is "not checked" or "no reading", never fine. */
export type NasHealth = "ok" | "warning" | "critical" | "unknown";

/** The map's columns and band, left to right in the direction things feed one another. */
export type NasLane = "disks" | "storage" | "folders" | "ways" | "network";

/**
 * Every read the dashboard rests on: the map's five, the disks' health (Smart.getListBg) and the
 * system's facts (System.getInformation).
 */
export type NasRead = NasLane | "health" | "system";

/** Where one read is: arrived, still on its way, or failed. A read not listed has not arrived. */
export type NasReadState = "ok" | "loading" | "failed";
export type NasReads = Partial<Record<NasRead, NasReadState>>;

export const NAS_LANES: readonly NasLane[] = [
  "disks",
  "storage",
  "folders",
  "ways",
  "network",
];
export const NAS_READS: readonly NasRead[] = [...NAS_LANES, "health", "system"];

/** The drawing of a disk; `disk` claims no kind (never guess). */
export type NasDiskKind = "hdd" | "ssd" | "nvme" | "usb" | "disk";

export interface NasDisk {
  /** Stable and unique among the disks: DiskMgmt.getList `devicename`. */
  id: string;
  /** DiskMgmt.getList `devicename`: "sda". */
  device: string;
  /** From DiskMgmt.getList (`devicename` nvme*, `hotpluggable`) and the S.M.A.R.T. device details. */
  kind: NasDiskKind;
  /** Smart.getListBg `overallstatus` (GOOD ok, BAD_* warning or critical), `unknown` with no reading. */
  health: NasHealth;
  /** The health in words, from the app's catalogue: "OK", "Warning", "Not checked yet". */
  healthLabel: string;
  /**
   * The one fact under a healthy disk, formatted by the app: DiskMgmt.getList `temperature`
   * ("36 °C"), or "Asleep" for `powermode` STANDBY or SLEEP. None while there is no reading.
   */
  detail?: string;
  /** What it is, for its name: "Hard disk, 3.6 TiB" (DiskMgmt.getList `size`). */
  summary?: string;
  /**
   * The storage it is part of, by `NasStorage.id`; empty for a disk in none. From
   * FileSystemMgmt.getList `devicefiles` (matched by `canonicaldevicefile`), MdMgmt member devices,
   * Zfs.getPoolDevices.
   */
  storage: readonly string[];
}

export type NasStorageKind = "fs" | "raid" | "zfs";

export interface NasStorage {
  /** Stable and unique among the storage: the file system's `uuid`, the array's or pool's name. */
  id: string;
  /** The plain name: FileSystemMgmt.getList `label` (else `devicename`), MdMgmt `name`, the pool's. */
  name: string;
  /** The technical term, secondary: FileSystemMgmt.getList `type` ("EXT4"), the RAID level, "ZFS pool". */
  tech: string;
  kind: NasStorageKind;
  /** Used, 0 to 1: FileSystemMgmt.getList `percentage` / 100; null when it is -1 (no reading). */
  used: number | null;
  /** Past `usagewarnthreshold` warning; an array's from its state; `unknown` for status 3 (missing). */
  health: NasHealth;
  /** "Almost full", "Degraded", from the app's catalogue. */
  healthLabel: string;
  /** Its shared folders, by `NasFolder.id`: ShareMgmt.getList rows whose `mntentref` is its mount. */
  folders: readonly string[];
  /** It holds the operating system (FileSystemMgmt.getList mount point "/"): its row goes last. */
  system?: boolean;
}

/** A way computers reach the shared folders. */
export type NasWayId = "smb" | "nfs" | "rsync" | "ssh";

export interface NasFolder {
  /** ShareMgmt.getList `uuid`. */
  id: string;
  /** ShareMgmt.getList `name`. */
  name: string;
  /**
   * The ways in that reach it and are on: SMB.getShareList and NFS.getShareList rows whose
   * `sharedfolderref` is this folder and that are enabled, with the service on (Services.getStatus).
   */
  ways: readonly NasWayId[];
  /** ShareMgmt.getList `status`: OK, or `unknown` when the folder cannot be reached. */
  health: NasHealth;
  healthLabel: string;
}

export interface NasWay {
  id: NasWayId;
  /** The plain name first: "Windows and Mac". */
  name: string;
  /** The technical term second: "SMB". */
  tech: string;
  /** Services.getStatus `enabled`. */
  enabled: boolean;
  /** Services.getStatus `running`. */
  running: boolean;
}

export type NasInterfaceKind = "ethernet" | "wifi" | "bond" | "vlan" | "bridge";

export interface NasInterface {
  /** Network.enumerateDevicesList `devicename`. */
  id: string;
  /** `devicename`, shown in mono: "enp2s0". */
  name: string;
  /** Network `type`. */
  kind: NasInterfaceKind;
  /** Network `state` and `link`: connected. */
  up: boolean;
  /** The link's speed, formatted by the app ("1 Gbit/s"): Network `speed`. */
  speed?: string;
  /** The IPv4 address: Network `address`. */
  address?: string;
}

/** Everything the map is drawn from. */
export interface NasMapInput {
  disks: readonly NasDisk[];
  storage: readonly NasStorage[];
  folders: readonly NasFolder[];
  ways: readonly NasWay[];
  interfaces: readonly NasInterface[];
  reads: NasReads;
}

export interface NasMapLimits {
  /** Storage rows before the rest fold into "N more" (6.8 item 9). 6 by default. */
  rows?: number;
  /** Disks on a row before the healthy ones fold into a strip. 6 by default. */
  disks?: number;
  /** Folders on a row before the rest fold into "N more". 6 by default. */
  folders?: number;
  /** Interfaces shown in the band. 3 by default. */
  interfaces?: number;
}

// ─── Rows ─────────────────────────────────────────────────────────────────────────────────────

/** The problem on a row, which flows right along it and nowhere else (6.8 item 2). */
export type NasRowTone = "warning" | "critical";

/** A disk on a row, and the names of the other storage it is also part of (a partition in each). */
export interface NasRowDisk extends NasDisk {
  alsoIn: readonly string[];
}

export interface NasBay {
  /** Disks at full size: all of them up to the cap, otherwise only those in trouble. */
  full: NasRowDisk[];
  /** Beyond the cap, the healthy and unchecked disks as a strip of ticks. */
  strip: NasRowDisk[];
}

export interface NasStorageRow {
  kind: "storage";
  id: string;
  storage: NasStorage;
  disks: NasRowDisk[];
  bay: NasBay;
  folders: { shown: NasFolder[]; hidden: NasFolder[] };
  /** The worst of its disks and the storage, when either is in trouble. */
  tone: NasRowTone | null;
  /** A disk on the row is in trouble: the connector from the disks takes the tone. */
  diskTrouble: boolean;
}

/** The disks in no storage yet, ending where new storage will go (item 3). */
export interface NasUnusedRow {
  kind: "unused";
  id: string;
  disks: NasRowDisk[];
  bay: NasBay;
}

/** The storage rows beyond the cap, as one row (item 9). */
export interface NasMoreRow {
  kind: "more";
  id: string;
  hidden: NasStorageRow[];
}

export type NasRow = NasStorageRow | NasUnusedRow | NasMoreRow;

/** What a key on the map stands for. */
export type NasMapItem =
  | { kind: "disk"; rowId: string; id: string }
  | { kind: "strip"; rowId: string }
  | { kind: "storage"; rowId: string; id: string }
  | { kind: "folder"; rowId: string; id: string }
  | { kind: "more-folders"; rowId: string }
  | { kind: "more-rows"; rowId: string }
  | { kind: "add-storage"; rowId: string }
  | { kind: "way"; id: NasWayId }
  | { kind: "interface"; id: string };

export interface NasMapView {
  rows: NasRow[];
  /** The ways in that are on (as items) and those that are off (one line). */
  ways: { on: NasWay[]; off: NasWay[] };
  interfaces: NasInterface[];
  reads: NasReads;
  /** Every key on the map and what it stands for. */
  items: ReadonlyMap<string, NasMapItem>;
}

export const UNUSED_ROW = "row:unused";
export const MORE_ROW = "row:more";

const SEVERITY: Record<NasHealth, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  ok: 3,
};

/** Worst first: critical, warning, unknown, OK. */
export function byHealth(a: NasHealth, b: NasHealth): number {
  return SEVERITY[a] - SEVERITY[b];
}

const isProblem = (h: NasHealth): h is NasRowTone =>
  h === "warning" || h === "critical";

function toneOf(healths: readonly NasHealth[]): NasRowTone | null {
  return healths.includes("critical")
    ? "critical"
    : healths.includes("warning")
      ? "warning"
      : null;
}

/** Up to `max` disks at full size; beyond that the strip, and every disk in trouble stays full size. */
export function bayLayout(disks: readonly NasRowDisk[], max = 6): NasBay {
  if (disks.length <= max) {
    return { full: [...disks], strip: [] };
  }
  return {
    full: disks.filter((d) => isProblem(d.health)),
    strip: disks.filter((d) => !isProblem(d.health)),
  };
}

/**
 * The state a row's full-size disks share, said once beside them instead of under each: the label
 * at least two non-OK disks share (the most common, the first met on a tie). Null when none does.
 */
export function sharedDiskState(
  disks: readonly NasDisk[],
): { label: string; health: NasHealth; ids: ReadonlySet<string> } | null {
  const groups = new Map<string, NasDisk[]>();
  for (const d of disks) {
    if (d.health !== "ok") {
      groups.set(d.healthLabel, [...(groups.get(d.healthLabel) ?? []), d]);
    }
  }
  let best: NasDisk[] | null = null;
  for (const group of groups.values()) {
    if (group.length >= 2 && group.length > (best?.length ?? 0)) {
      best = group;
    }
  }
  const first = best?.[0];
  return best && first
    ? {
        label: first.healthLabel,
        health: first.health,
        ids: new Set(best.map((d) => d.id)),
      }
    : null;
}

/** Up to `max` folders; beyond that `max - 1` (those in trouble first) and the rest hidden. */
export function capFolders(
  list: readonly NasFolder[],
  max = 6,
): { shown: NasFolder[]; hidden: NasFolder[] } {
  if (list.length <= max) {
    return { shown: [...list], hidden: [] };
  }
  const order = list
    .map((f, i) => ({ f, i }))
    .sort((x, y) => byHealth(x.f.health, y.f.health) || x.i - y.i)
    .map(({ f }) => f);
  return { shown: order.slice(0, max - 1), hidden: order.slice(max - 1) };
}

const TONE_RANK: Record<NasRowTone, number> = { critical: 0, warning: 1 };

/**
 * Row order (item 7): rows with a problem first, worst first; then the fullest; the system drive
 * last of the rows without a problem.
 */
export function byRow(a: NasStorageRow, b: NasStorageRow): number {
  const ta = a.tone ? TONE_RANK[a.tone] : 2;
  const tb = b.tone ? TONE_RANK[b.tone] : 2;
  if (ta !== tb) {
    return ta - tb;
  }
  const sa = Boolean(a.storage.system);
  const sb = Boolean(b.storage.system);
  if (a.tone === null && sa !== sb) {
    return sa ? 1 : -1;
  }
  return (b.storage.used ?? 0) - (a.storage.used ?? 0);
}

/** The map's rows (6.8): storage rows in order, capped, then the unused disks. */
export function nasMapRows(
  input: NasMapInput,
  limits: NasMapLimits = {},
): NasRow[] {
  const {
    rows: maxRows = 6,
    disks: maxDisks = 6,
    folders: maxFolders = 6,
  } = limits;
  const names = new Map(input.storage.map((s) => [s.id, s.name]));
  const folders = new Map(input.folders.map((f) => [f.id, f]));
  const rowDisk = (d: NasDisk, here: string | null): NasRowDisk => ({
    ...d,
    alsoIn: d.storage
      .filter((id) => id !== here)
      .map((id) => names.get(id) ?? id),
  });
  const rows: NasStorageRow[] = input.storage.map((storage) => {
    const disks = input.disks
      .filter((d) => d.storage.includes(storage.id))
      .map((d) => rowDisk(d, storage.id));
    return {
      kind: "storage",
      id: `row:${storage.id}`,
      storage,
      disks,
      bay: bayLayout(disks, maxDisks),
      folders: capFolders(
        storage.folders.flatMap((id) => folders.get(id) ?? []),
        maxFolders,
      ),
      tone: toneOf([storage.health, ...disks.map((d) => d.health)]),
      diskTrouble: toneOf(disks.map((d) => d.health)) !== null,
    };
  });
  rows.sort(byRow);
  const out: NasRow[] =
    rows.length > maxRows
      ? [
          ...rows.slice(0, maxRows - 1),
          { kind: "more", id: MORE_ROW, hidden: rows.slice(maxRows - 1) },
        ]
      : rows;
  // Which disks are unused is known only when both the disks and the storage were read.
  const known = input.reads.disks === "ok" && input.reads.storage === "ok";
  const unused = input.disks
    .filter((d) => d.storage.length === 0)
    .map((d) => rowDisk(d, null));
  if (known && unused.length > 0) {
    out.push({
      kind: "unused",
      id: UNUSED_ROW,
      disks: unused,
      bay: bayLayout(unused, maxDisks),
    });
  }
  return out;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────────────────────

/** A disk can stand on two rows (a partition in each), so its key carries its row. */
export const diskKey = (rowId: string, id: string) => `disk ${rowId} ${id}`;
export const stripKey = (rowId: string) => `strip ${rowId}`;
export const storageKey = (id: string) => `storage ${id}`;
export const folderKey = (id: string) => `folder ${id}`;
export const moreFoldersKey = (rowId: string) => `more-folders ${rowId}`;
export const MORE_ROWS_KEY = "more-rows";
export const ADD_STORAGE_KEY = "add-storage";
export const wayKey = (id: NasWayId) => `way ${id}`;
export const interfaceKey = (id: string) => `interface ${id}`;

function bayKeys(rowId: string, bay: NasBay): string[] {
  return [
    ...bay.full.map((d) => diskKey(rowId, d.id)),
    ...(bay.strip.length > 0 ? [stripKey(rowId)] : []),
  ];
}

/**
 * The keys on a row in reading order, grouped by column (disks, storage, folders). `addable`: the
 * unused row's ghost is a button.
 */
export function rowKeys(row: NasRow, addable: boolean): string[][] {
  switch (row.kind) {
    case "storage":
      return [
        bayKeys(row.id, row.bay),
        [storageKey(row.storage.id)],
        [
          ...row.folders.shown.map((f) => folderKey(f.id)),
          ...(row.folders.hidden.length > 0 ? [moreFoldersKey(row.id)] : []),
        ],
      ];
    case "unused":
      return [bayKeys(row.id, row.bay), addable ? [ADD_STORAGE_KEY] : [], []];
    case "more":
      return [[], [MORE_ROWS_KEY], []];
  }
}

/** What the map shows: its rows, and the band of ways in and the network under them. */
export function nasMapView(
  input: NasMapInput,
  limits: NasMapLimits = {},
): NasMapView {
  const rows = nasMapRows(input, limits);
  const items = new Map<string, NasMapItem>();
  for (const row of rows) {
    switch (row.kind) {
      case "storage":
        for (const d of row.bay.full) {
          items.set(diskKey(row.id, d.id), {
            kind: "disk",
            rowId: row.id,
            id: d.id,
          });
        }
        items.set(stripKey(row.id), { kind: "strip", rowId: row.id });
        items.set(storageKey(row.storage.id), {
          kind: "storage",
          rowId: row.id,
          id: row.storage.id,
        });
        for (const f of row.folders.shown) {
          items.set(folderKey(f.id), {
            kind: "folder",
            rowId: row.id,
            id: f.id,
          });
        }
        items.set(moreFoldersKey(row.id), {
          kind: "more-folders",
          rowId: row.id,
        });
        break;
      case "unused":
        for (const d of row.bay.full) {
          items.set(diskKey(row.id, d.id), {
            kind: "disk",
            rowId: row.id,
            id: d.id,
          });
        }
        items.set(stripKey(row.id), { kind: "strip", rowId: row.id });
        items.set(ADD_STORAGE_KEY, { kind: "add-storage", rowId: row.id });
        break;
      case "more":
        items.set(MORE_ROWS_KEY, { kind: "more-rows", rowId: row.id });
        break;
    }
  }
  const on = input.ways.filter((w) => w.enabled);
  for (const w of on) {
    items.set(wayKey(w.id), { kind: "way", id: w.id });
  }
  const interfaces = input.interfaces.slice(0, limits.interfaces ?? 3);
  for (const n of interfaces) {
    items.set(interfaceKey(n.id), { kind: "interface", id: n.id });
  }
  return {
    rows,
    ways: { on, off: input.ways.filter((w) => !w.enabled) },
    interfaces,
    reads: input.reads,
    items,
  };
}

/**
 * Where an arrow key moves on the rows: left and right along the row, up and down to the same column
 * of the next row that has one (the nearest column otherwise), Home and End to the first and last
 * thing. `null` when there is nowhere to go.
 */
export function moveInRows(
  grid: readonly (readonly (readonly string[])[])[],
  current: string,
  key: string,
): string | null {
  let r = -1;
  let c = -1;
  let i = -1;
  grid.forEach((row, ri) => {
    row.forEach((col, ci) => {
      const at = col.indexOf(current);
      if (at >= 0) {
        r = ri;
        c = ci;
        i = at;
      }
    });
  });
  if (r < 0) {
    return null;
  }
  const flat = (ri: number) => grid[ri]?.flat() ?? [];
  const pick = (ri: number): string | null => {
    const best = (grid[ri] ?? [])
      .map((col, ci) => ({ col, ci }))
      .filter(({ col }) => col.length > 0)
      .sort(
        (x, y) => Math.abs(x.ci - c) - Math.abs(y.ci - c) || x.ci - y.ci,
      )[0];
    return best ? (best.col[Math.min(i, best.col.length - 1)] ?? null) : null;
  };
  switch (key) {
    case "ArrowRight":
    case "ArrowLeft": {
      const row = flat(r);
      return (
        row[row.indexOf(current) + (key === "ArrowRight" ? 1 : -1)] ?? null
      );
    }
    case "ArrowDown":
    case "ArrowUp": {
      const step = key === "ArrowDown" ? 1 : -1;
      for (let ri = r + step; ri >= 0 && ri < grid.length; ri += step) {
        const target = pick(ri);
        if (target !== null) {
          return target;
        }
      }
      return null;
    }
    case "Home":
      return grid.flatMap((_, ri) => flat(ri))[0] ?? null;
    case "End":
      return grid.flatMap((_, ri) => flat(ri)).at(-1) ?? null;
    default:
      return null;
  }
}

// ─── Tracing by highlighting (item 5) ─────────────────────────────────────────────────────────

export interface NasTrace {
  /** Rows lit whole. */
  rows: ReadonlySet<string>;
  /** Things lit one by one, wherever they are. */
  keys: ReadonlySet<string>;
  /** Ways in lit, with their connector into the network. */
  ways: ReadonlySet<NasWayId>;
}

/**
 * What pointing at or focusing a thing lights: a folder lights its row and the ways in it is reached
 * by; a way in lights every folder it reaches, wherever it is; a disk, a storage or a row's "more"
 * lights its row (a disk on two rows lights both); an interface lights every way in and every
 * folder reached at all. Null for a key the map does not know.
 */
export function traceOf(view: NasMapView, key: string): NasTrace | null {
  const item = view.items.get(key);
  if (!item) {
    return null;
  }
  const storageRows = view.rows.filter(
    (r): r is NasStorageRow => r.kind === "storage",
  );
  const reached = (ways: readonly NasWayId[]) => {
    const keys: string[] = [];
    const reaches = (f: NasFolder) => f.ways.some((w) => ways.includes(w));
    for (const row of storageRows) {
      keys.push(
        ...row.folders.shown.filter(reaches).map((f) => folderKey(f.id)),
      );
      if (row.folders.hidden.some(reaches)) {
        keys.push(moreFoldersKey(row.id));
      }
    }
    return keys;
  };
  switch (item.kind) {
    case "way":
      return {
        rows: new Set(),
        keys: new Set([key, ...reached([item.id])]),
        ways: new Set([item.id]),
      };
    case "interface": {
      const on = view.ways.on.map((w) => w.id);
      return {
        rows: new Set(),
        keys: new Set([key, ...on.map(wayKey), ...reached(on)]),
        ways: new Set(on),
      };
    }
    case "folder": {
      const row = storageRows.find((r) => r.id === item.rowId);
      const folder = row?.folders.shown.find((f) => f.id === item.id);
      const via = (folder?.ways ?? []).filter((w) =>
        view.ways.on.some((on) => on.id === w),
      );
      return {
        rows: new Set([item.rowId]),
        keys: new Set([key, ...via.map(wayKey)]),
        ways: new Set(via),
      };
    }
    case "disk": {
      // The same disk on another row (a partition in each) lights that row too.
      const rows = new Set([item.rowId]);
      for (const row of view.rows) {
        if (row.kind !== "more" && row.disks.some((d) => d.id === item.id)) {
          rows.add(row.id);
        }
      }
      return { rows, keys: new Set([key]), ways: new Set() };
    }
    default:
      return {
        rows: new Set([item.rowId]),
        keys: new Set([key]),
        ways: new Set(),
      };
  }
}

/** How a thing on the map is shown while something is traced: lit, as it is, or dimmed. */
export function traceState(
  trace: NasTrace | null,
  key: string,
  rowId: string | null,
): "lit" | "dim" | undefined {
  if (!trace) {
    return undefined;
  }
  if (trace.keys.has(key)) {
    return "lit";
  }
  return rowId !== null && trace.rows.has(rowId) ? undefined : "dim";
}

// ─── States said on the map ───────────────────────────────────────────────────────────────────

/** A folder's state on its row: its own problem, else the row's ("At risk"), else none. */
export function folderState(
  folder: NasFolder,
  tone: NasRowTone | null,
): { health: NasRowTone; own: boolean } | null {
  if (isProblem(folder.health)) {
    return { health: folder.health, own: true };
  }
  return tone ? { health: tone, own: false } : null;
}

/** How many of the ways in that are on run: said once for the band when two or more run. */
export function waysRunning(
  on: readonly NasWay[],
): { running: number; total: number } | null {
  const running = on.filter((w) => w.running).length;
  return running < 2 ? null : { running, total: on.length };
}

/** The strip's counts: how many, how many OK, how many not checked. */
export function stripCounts(strip: readonly NasDisk[]): {
  count: number;
  ok: number;
  unchecked: number;
} {
  const ok = strip.filter((d) => d.health === "ok").length;
  return { count: strip.length, ok, unchecked: strip.length - ok };
}

/** Whether every one of `things` is fine, for "N more, all OK". */
export function allOk(things: readonly { health: NasHealth }[]): boolean {
  return things.every((t) => t.health === "ok");
}

// ─── The map's actions, each once on the screen (6.8 item 8) ──────────────────────────────────

/** The map's actions, in reading order. The words are the app's. */
export const NAS_MAP_ACTIONS = [
  "check-health",
  "add-storage",
  "add-folder",
  "sharing",
  "interfaces",
] as const;
export type NasMapAction = (typeof NAS_MAP_ACTIONS)[number];

/**
 * Each action once per screen: the map's footer leaves out what the screen already offers elsewhere
 * (a first step's button, the unused row's "Add storage"). The unused row's ghost is that button
 * unless a first step offers it; then the ghost is a picture of where new storage will go.
 */
export function nasMapActions(
  view: NasMapView,
  elsewhere: readonly NasMapAction[],
): { footer: NasMapAction[]; ghostAdds: boolean } {
  const hasUnused = view.rows.some((r) => r.kind === "unused");
  const ghostAdds = hasUnused && !elsewhere.includes("add-storage");
  const offered = new Set<NasMapAction>([
    ...elsewhere,
    ...(ghostAdds ? (["add-storage"] as const) : []),
  ]);
  return {
    footer: NAS_MAP_ACTIONS.filter((a) => !offered.has(a)),
    ghostAdds,
  };
}

/**
 * A NAS with nothing on it yet (P.2): no storage but the system's and no shared folders. Only known
 * when the storage and the folders were read; a read that failed or has not arrived is not "new".
 */
export function isNewNas(input: NasMapInput): boolean {
  return (
    input.reads.storage === "ok" &&
    input.reads.folders === "ok" &&
    input.storage.every((s) => s.system) &&
    input.folders.length === 0
  );
}
