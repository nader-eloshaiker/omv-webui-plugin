// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard prototype's data and pure logic (rethink spec 6): lab fixtures shaped like the
// mock's default NAS, the answer and its area states, the "needs you" order, the map's rows (6.8:
// their order, caps and the problem flowing along each), what pointing at a thing lights, the names
// assistive technology reads, the map's actions once per screen, and where the one filled accent goes.
// Development only (UI-11). The lab does not boot the mock, a session or a query client, so every
// figure here is a fixture; the live strip alone runs through the app's own sample store
// (liveFeed.ts).
import type { Health } from "../tables/model.ts";
import { byHealth, worst } from "../tables/model.ts";
import type { DashState } from "./states.ts";

export { worst };
export type { Health };

const NBSP = " ";

// ─── Types ────────────────────────────────────────────────────────────────────────────────────

/** The areas region A names, each a chip that moves focus to its lane. */
export type AreaId =
  "disks" | "storage" | "folders" | "sharing" | "network" | "system";
/** The map's lanes, left to right in the direction things feed one another. */
export type LaneId = "disks" | "storage" | "folders" | "ways" | "network";
export type DiskKind = "hdd" | "ssd" | "nvme" | "usb";
export type Power = "awake" | "asleep" | "none";
export type WayId = "smb" | "nfs" | "rsync" | "ssh";

export interface MapDisk {
  id: string;
  device: string;
  kind: DiskKind;
  size: string;
  health: Health;
  /** The state in words: "OK", "Not checked", "Failing". */
  word: string;
  temp: number | null;
  power: Power;
  /** The storage it is part of; none for an empty disk. */
  feeds: readonly string[];
}

export interface MapStorage {
  id: string;
  /** The plain name: "Data drive", "tank". */
  name: string;
  /** The technical term, quieter: "EXT4", "Mirror (RAID 1)", "ZFS pool". */
  tech: string;
  kind: "fs" | "raid" | "zfs";
  /** Used, 0 to 1. */
  used: number;
  free: string;
  total: string;
  health: Health;
  word: string;
  /** The shared folders on it. */
  feeds: readonly string[];
}

export interface MapFolder {
  id: string;
  name: string;
  /** The ways in it is reached by (only ways that are on). Empty: "Not shared". */
  via: readonly WayId[];
  health: Health;
  word: string;
}

export interface MapWay {
  id: WayId;
  /** The plain name first: "Windows and Mac". */
  name: string;
  /** The technical term second: "SMB". */
  tech: string;
  on: boolean;
  running: boolean;
  /** Computers connected now, where the service says. */
  connections: number | null;
}

export interface MapIface {
  id: string;
  name: string;
  kind: "net-ethernet" | "net-wifi" | "net-bond";
  speed: string;
  address: string;
  up: boolean;
}

/**
 * An installed plugin (owner decision 8). `zfs` and `raid` are plugins this interface knows and
 * draws natively; `unknown` is any other, shown by its package name with a way to the classic
 * interface. No method a classic widget names is ever called, and its file is never read.
 */
export interface AddOn {
  id: string;
  kind: "zfs" | "raid" | "unknown";
  /** The Debian package: "openmediavault-zfs". */
  pkg: string;
}

/** One thing that needs the person (region B). */
export interface Attention {
  id: string;
  area: AreaId;
  health: Health;
  title: string;
  line: string;
  /** The answer's reason when this is the worst one (region A). */
  answer: string;
  /** The next step, a verb and an object. */
  action: string;
  /** The map node it is about, whose lineage lights. */
  node?: string;
}

export interface Step {
  id: string;
  title: string;
  line: string;
  action: string;
  done: boolean;
}

export interface Facts {
  name: string;
  version: string;
  uptime: string;
  time: string;
  updates: number;
}

export interface Nas {
  facts: Facts;
  /** When the disks were last checked, "10:31"; null when never. */
  checkedAt: string | null;
  disks: readonly MapDisk[];
  storage: readonly MapStorage[];
  folders: readonly MapFolder[];
  ways: readonly MapWay[];
  ifaces: readonly MapIface[];
  addOns: readonly AddOn[];
  attention: readonly Attention[];
  steps: readonly Step[];
  /** No data file systems and no shared folders: the new-NAS welcome (P.2). */
  newNas: boolean;
  /** Lanes whose read failed (6.5): each shows its error in place, the others stand. */
  failed: readonly LaneId[];
}

// ─── Words ────────────────────────────────────────────────────────────────────────────────────

export const HEALTH_WORD: Record<Health, string> = {
  ok: "OK",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

export const AREAS: readonly {
  id: AreaId;
  name: string;
  lane: LaneId | null;
}[] = [
  { id: "disks", name: "Disks", lane: "disks" },
  { id: "storage", name: "Storage", lane: "storage" },
  { id: "folders", name: "Shared folders", lane: "folders" },
  { id: "sharing", name: "Sharing", lane: "ways" },
  { id: "network", name: "Network", lane: "network" },
  { id: "system", name: "System", lane: null },
];

export const LANES: readonly {
  id: LaneId;
  title: string;
  action: string;
  caption: string;
}[] = [
  {
    id: "disks",
    title: "Disks",
    action: "Check disk health",
    caption: "The drives the NAS found inside it.",
  },
  {
    id: "storage",
    title: "Storage",
    action: "Add storage",
    caption: "A disk made ready to keep files.",
  },
  {
    id: "folders",
    title: "Shared folders",
    action: "Add a shared folder",
    caption: "What your computers open, like Photos.",
  },
  {
    id: "ways",
    title: "Ways in",
    action: "Sharing settings",
    caption: "How computers reach your shared folders.",
  },
  {
    id: "network",
    title: "Network",
    action: "Interfaces",
    caption: "How the NAS is connected to your network.",
  },
];

export function plural(count: number, one: string, other: string): string {
  return `${String(count)}${NBSP}${count === 1 ? one : other}`;
}

/** "Photos", "Photos and Music", "Photos, Music and Documents". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}

export function percent(used: number): string {
  return `${String(Math.round(used * 100))}${NBSP}%`;
}

// ─── The answer (A) and the areas ─────────────────────────────────────────────────────────────

export interface AreaState {
  id: AreaId;
  name: string;
  lane: LaneId | null;
  health: Health;
  word: string;
  /** Nothing there yet (a new NAS's storage and folders): "None yet", without a state mark. */
  empty?: boolean;
}

/** Each area's state: the worst of its things and of what needs the person there. */
export function areaStates(nas: Nas): AreaState[] {
  const fromAttention = (area: AreaId) =>
    nas.attention.filter((a) => a.area === area).map((a) => a.health);
  const of = (area: AreaId): Health[] => {
    switch (area) {
      case "disks":
        return nas.disks.map((d) => d.health);
      case "storage":
        return nas.storage.map((s) => s.health);
      case "folders":
        return nas.folders.map((f) => f.health);
      case "sharing":
        return nas.ways
          .filter((w) => w.on)
          .map((w) => (w.running ? "ok" : "warning"));
      case "network":
        return nas.ifaces.map((i) => (i.up ? "ok" : "critical"));
      case "system":
        return [];
    }
  };
  return AREAS.map((area) => {
    if (area.lane && nas.failed.includes(area.lane)) {
      return { ...area, health: "unknown", word: "Could not read" };
    }
    const empty =
      (area.id === "folders" && nas.folders.length === 0) ||
      (area.id === "storage" && !nas.storage.some((s) => s.id !== "s:system"));
    const health = worst([...of(area.id), ...fromAttention(area.id)]);
    if (empty && health === "ok") {
      return { ...area, health, word: "None yet", empty: true };
    }
    const word =
      health === "unknown" && area.id === "disks"
        ? "Not checked"
        : HEALTH_WORD[health];
    return { ...area, health, word };
  });
}

/** What needs the person, worst first; equal ones keep the order they were found in. */
export function needsYou(nas: Nas): Attention[] {
  return nas.attention
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.health !== "ok")
    .sort((x, y) => byHealth(x.a.health, y.a.health) || x.i - y.i)
    .map(({ a }) => a);
}

/** At most three rows, then "N more" (6.2 B). */
export function attentionRows(
  list: readonly Attention[],
  max = 3,
): { shown: Attention[]; more: number } {
  return { shown: list.slice(0, max), more: Math.max(0, list.length - max) };
}

export interface Answer {
  /** The sentence at 28px. */
  title: string;
  reason: string;
  tone: Health;
}

/** Region A's one sentence and its reason. */
export function answerOf(nas: Nas): Answer {
  const needs = needsYou(nas);
  if (nas.newNas) {
    return {
      title: "Welcome to your NAS",
      reason: "It is running. Here is what is in it, and what to set up first.",
      tone: "ok",
    };
  }
  const first = needs[0];
  if (first) {
    return {
      title:
        needs.length === 1
          ? "1 thing needs you"
          : `${String(needs.length)} things need you`,
      reason: first.answer,
      tone: first.health,
    };
  }
  if (nas.failed.length > 0) {
    const names = nas.failed.map(
      (id) => LANES.find((l) => l.id === id)?.title.toLowerCase() ?? id,
    );
    return {
      title: "Could not read everything",
      reason: `The ${listWords(names)} could not be read. Everything else is OK.`,
      tone: "unknown",
    };
  }
  const drives = nas.storage.length;
  const roomy = nas.storage.filter((s) => s.health === "ok").length;
  const disks = nas.checkedAt
    ? `Disks checked at ${nas.checkedAt}.`
    : "Disks not checked yet.";
  return {
    title: "All OK",
    reason: `${disks} ${roomy === drives ? `All ${String(drives)} drives have space.` : `${String(roomy)} of ${String(drives)} drives have space.`}`,
    tone: "ok",
  };
}

// ─── Caps (6.8 item 9) ────────────────────────────────────────────────────────────────────────

const isProblem = (h: Health) => h === "warning" || h === "critical";

/**
 * A row's bay (6.8 item 9): up to `max` slots at full size; beyond that the healthy and unchecked
 * disks fold into a strip of ticks, and every disk in trouble keeps its full slot.
 */
export function bayLayout<D extends MapDisk>(
  disks: readonly D[],
  max = 6,
): { full: D[]; strip: D[] } {
  if (disks.length <= max) {
    return { full: [...disks], strip: [] };
  }
  return {
    full: disks.filter((d) => isProblem(d.health)),
    strip: disks.filter((d) => !isProblem(d.health)),
  };
}

/** The strip's words: "22 more, all OK", or "22 more: 20 OK, 2 not checked". */
export function stripWords(
  strip: readonly MapDisk[],
  hasFull: boolean,
): string {
  const ok = strip.filter((d) => d.health === "ok").length;
  const unread = strip.length - ok;
  const lead = hasFull
    ? `${String(strip.length)} more`
    : plural(strip.length, "disk", "disks");
  if (unread === 0) {
    return `${lead}, all OK`;
  }
  if (ok === 0) {
    return `${lead}, not checked`;
  }
  return `${lead}: ${String(ok)} OK, ${String(unread)} not checked`;
}

/** A capped list: what is shown, and what is left out. */
export interface Capped<T> {
  shown: T[];
  hidden: T[];
}

/** "+3 more, all OK" or "+3 more". */
export function moreWords(hidden: readonly { health: Health }[]): string {
  const n = String(hidden.length);
  return hidden.every((h) => h.health === "ok")
    ? `${n} more, all OK`
    : `${n} more`;
}

/** Ways in (6.8 item 4): only those that are on as tiles, the rest as one "Off:" line. */
export function waysLayout(ways: readonly MapWay[]): {
  on: MapWay[];
  off: string;
} {
  const off = ways.filter((w) => !w.on).map((w) => w.name);
  return {
    on: ways.filter((w) => w.on),
    off: off.length > 0 ? `Off: ${listWords(off)}` : "",
  };
}

// ─── The map, by rows (6.8) ───────────────────────────────────────────────────────────────────

/** The problem on a row, which flows right along it and nowhere else (6.8 item 2). */
export type RowTone = "warning" | "critical";

/** A disk on a row, and the other storage it is also part of (a partition in each, item 10). */
export interface RowDisk extends MapDisk {
  alsoIn: readonly string[];
}

export interface StorageRow {
  kind: "storage";
  /** `row:` and the storage's id. */
  id: string;
  storage: MapStorage;
  disks: RowDisk[];
  /** More than six disks: the healthy ones fold into a strip of ticks (item 9). */
  bay: { full: RowDisk[]; strip: RowDisk[] };
  /** More than six folders: five, then "+N more" (item 9). */
  folders: Capped<MapFolder>;
  /** The worst of its disks and the storage, when either is in trouble. */
  tone: RowTone | null;
  /** A disk on the row is in trouble: the connector from the disks takes the tone. */
  diskTrouble: boolean;
  system: boolean;
}

/** The disks that are in no storage yet, ending in "Add storage" (item 3). */
export interface UnusedRow {
  kind: "unused";
  id: "row:unused";
  disks: RowDisk[];
  bay: { full: RowDisk[]; strip: RowDisk[] };
}

/** "+3 more, all OK": the storage rows beyond six (item 9). */
export interface MoreRow {
  kind: "more";
  id: "row:more";
  hidden: StorageRow[];
}

export type MapRow = StorageRow | UnusedRow | MoreRow;

export interface MapView {
  rows: MapRow[];
  ways: { on: MapWay[]; off: string };
  ifaces: MapIface[];
}

export const UNUSED_ROW = "row:unused";
export const MORE_ROW = "row:more";
export const SYSTEM_ID = "s:system";

const TONE_RANK: Record<RowTone, number> = { critical: 0, warning: 1 };

function toneOf(healths: readonly Health[]): RowTone | null {
  const w = worst(healths.filter(isProblem));
  return w === "warning" || w === "critical" ? w : null;
}

/** Up to `max` folders; beyond that, `max - 1` (those in trouble first) and "+N more". */
export function capRowFolders(
  list: readonly MapFolder[],
  max = 6,
): Capped<MapFolder> {
  if (list.length <= max) {
    return { shown: [...list], hidden: [] };
  }
  const order = [...list]
    .map((f, i) => ({ f, i }))
    .sort((x, y) => byHealth(x.f.health, y.f.health) || x.i - y.i)
    .map(({ f }) => f);
  return { shown: order.slice(0, max - 1), hidden: order.slice(max - 1) };
}

/**
 * Row order (item 7): rows with a problem first, worst first; then by how much the row holds (the
 * fullest first); the system drive last, since it rarely matters to the person.
 */
export function byRow(a: StorageRow, b: StorageRow): number {
  const ta = a.tone ? TONE_RANK[a.tone] : 2;
  const tb = b.tone ? TONE_RANK[b.tone] : 2;
  if (ta !== tb) {
    return ta - tb;
  }
  if (a.tone === null && a.system !== b.system) {
    return a.system ? 1 : -1;
  }
  return b.storage.used - a.storage.used;
}

/** The map's rows (6.8): storage rows in order, capped at six, then the unused disks. */
export function mapRows(nas: Nas, maxRows = 6, maxDisks = 6): MapRow[] {
  const names = new Map(nas.storage.map((s) => [s.id, s.name]));
  const folders = new Map(nas.folders.map((f) => [f.id, f]));
  const rowDisk = (d: MapDisk, here: string | null): RowDisk => ({
    ...d,
    alsoIn: d.feeds
      .filter((id) => id !== here)
      .map((id) => names.get(id) ?? id),
  });
  const rows: StorageRow[] = nas.storage.map((storage) => {
    const disks = nas.disks
      .filter((d) => d.feeds.includes(storage.id))
      .map((d) => rowDisk(d, storage.id));
    return {
      kind: "storage",
      id: `row:${storage.id}`,
      storage,
      disks,
      bay: bayLayout(disks, maxDisks),
      folders: capRowFolders(
        storage.feeds.flatMap((id) => folders.get(id) ?? []),
      ),
      tone: toneOf([storage.health, ...disks.map((d) => d.health)]),
      diskTrouble: toneOf(disks.map((d) => d.health)) !== null,
      system: storage.id === SYSTEM_ID,
    };
  });
  rows.sort(byRow);
  const out: MapRow[] =
    rows.length > maxRows
      ? [
          ...rows.slice(0, maxRows - 1),
          { kind: "more", id: MORE_ROW, hidden: rows.slice(maxRows - 1) },
        ]
      : rows;
  const unused = nas.disks
    .filter((d) => d.feeds.length === 0)
    .map((d) => rowDisk(d, null));
  // Disks that could not be read say nothing about which are unused.
  if (unused.length > 0 && !nas.failed.includes("disks")) {
    out.push({
      kind: "unused",
      id: UNUSED_ROW,
      disks: unused,
      bay: bayLayout(unused, maxDisks),
    });
  }
  return out;
}

/** What the map shows: its rows, and the band of ways in and the network under them. */
export function mapView(nas: Nas): MapView {
  return {
    rows: mapRows(nas),
    ways: waysLayout(nas.ways),
    ifaces: nas.ifaces.slice(0, 3),
  };
}

/** A folder's state on its row: its own problem, else the row's ("At risk"), else none. */
export function folderState(
  folder: MapFolder,
  tone: RowTone | null,
): { health: RowTone; word: string } | null {
  if (folder.health === "warning" || folder.health === "critical") {
    return { health: folder.health, word: folder.word };
  }
  return tone ? { health: tone, word: "At risk" } : null;
}

// ─── Keys of the things on the map ────────────────────────────────────────────────────────────

/** A disk can stand on two rows (a partition in each), so its key carries its row. */
export const diskKey = (rowId: string, diskId: string) => `${rowId}/${diskId}`;
export const stripKey = (rowId: string) => `${rowId}/strip`;
export const moreKey = (rowId: string) => `${rowId}/more`;
export const ADD_KEY = `${UNUSED_ROW}/add`;
export const wayKey = (id: WayId) => `w:${id}`;

/** The keys on a row, in reading order, grouped by column: disks, storage, folders. */
export function rowKeys(row: MapRow, addable: boolean): string[][] {
  const bayKeys = (bay: { full: RowDisk[]; strip: RowDisk[] }) => [
    ...bay.full.map((d) => diskKey(row.id, d.id)),
    ...(bay.strip.length > 0 ? [stripKey(row.id)] : []),
  ];
  switch (row.kind) {
    case "storage":
      return [
        bayKeys(row.bay),
        [row.storage.id],
        [
          ...row.folders.shown.map((f) => f.id),
          ...(row.folders.hidden.length > 0 ? [moreKey(row.id)] : []),
        ],
      ];
    case "unused":
      return [bayKeys(row.bay), addable ? [ADD_KEY] : [], []];
    case "more":
      return [[], [MORE_ROW], []];
  }
}

/**
 * Where an arrow key moves on the rows: left and right along the row, up and down to the same
 * column of the next row that has one (the nearest column otherwise), Home and End to the first and
 * last thing on the map. `null` when there is nowhere to go.
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

export interface Trace {
  /** Rows lit whole. */
  rows: ReadonlySet<string>;
  /** Things lit one by one, wherever they are (the folder chips a way in reaches). */
  keys: ReadonlySet<string>;
  /** Ways in lit, with their connector into the network. */
  ways: ReadonlySet<WayId>;
}

/**
 * What pointing at or focusing a thing lights: a folder lights its row and the ways in it is reached
 * by; a way in lights every folder it reaches, wherever it is; a disk, a storage or a row's "more"
 * lights its row (a disk on two rows lights both); an interface lights every way in and every folder
 * reached at all. The rest is shown at reduced emphasis.
 */
export function traceOf(view: MapView, key: string): Trace {
  const storageRows = view.rows.filter(
    (r): r is StorageRow => r.kind === "storage",
  );
  const reached = (ways: readonly WayId[]) => {
    const keys: string[] = [];
    const reaches = (f: MapFolder) => f.via.some((w) => ways.includes(w));
    for (const row of storageRows) {
      keys.push(...row.folders.shown.filter(reaches).map((f) => f.id));
      if (row.folders.hidden.some(reaches)) {
        keys.push(moreKey(row.id));
      }
    }
    return keys;
  };
  if (key.startsWith("w:")) {
    const id = key.slice(2) as WayId;
    return {
      rows: new Set(),
      keys: new Set([key, ...reached([id])]),
      ways: new Set([id]),
    };
  }
  if (key.startsWith("n:")) {
    const on = view.ways.on.map((w) => w.id);
    return {
      rows: new Set(),
      keys: new Set([key, ...on.map(wayKey), ...reached(on)]),
      ways: new Set(on),
    };
  }
  if (key.startsWith("f:")) {
    const row = storageRows.find((r) =>
      r.folders.shown.some((f) => f.id === key),
    );
    const folder = row?.folders.shown.find((f) => f.id === key);
    const via = (folder?.via ?? []).filter((w) =>
      view.ways.on.some((on) => on.id === w),
    );
    return {
      rows: new Set(row ? [row.id] : []),
      keys: new Set([key, ...via.map(wayKey)]),
      ways: new Set(via),
    };
  }
  if (key.startsWith("s:")) {
    return {
      rows: new Set([`row:${key}`]),
      keys: new Set([key]),
      ways: new Set(),
    };
  }
  const slash = key.indexOf("/");
  const rowId = slash < 0 ? key : key.slice(0, slash);
  const rest = slash < 0 ? "" : key.slice(slash + 1);
  const rows = new Set([rowId]);
  if (rest.startsWith("d:")) {
    // The same disk on another row (a partition in each) lights that row too.
    for (const row of view.rows) {
      if (row.kind !== "more" && row.disks.some((d) => d.id === rest)) {
        rows.add(row.id);
      }
    }
  }
  return { rows, keys: new Set([key]), ways: new Set() };
}

// ─── Names for assistive technology (item 13) ─────────────────────────────────────────────────

/**
 * A row's name: "Data drive, on disk sda: 92 percent used, almost full. Shared folders: Photos,
 * Music and Documents, at risk."
 */
export function rowName(row: MapRow): string {
  switch (row.kind) {
    case "more":
      return `${moreWords(row.hidden.map((r) => ({ health: r.tone ?? "ok" })))}: more storage`;
    case "unused": {
      const one = row.disks.length === 1;
      return `Not in use: ${one ? "disk" : "disks"} ${listWords(row.disks.map((d) => d.device))}. Add storage to keep files on ${one ? "it" : "them"}.`;
    }
    case "storage": {
      const s = row.storage;
      const on =
        row.disks.length === 0
          ? ""
          : `, on ${row.disks.length === 1 ? "disk" : "disks"} ${listWords(row.disks.map((d) => d.device))}`;
      const own = isProblem(s.health) ? `, ${s.word.toLowerCase()}` : "";
      const sick = row.disks
        .filter((d) => isProblem(d.health))
        .map((d) => `, disk ${d.device} ${d.word.toLowerCase()}`)
        .join("");
      const folders = [...row.folders.shown, ...row.folders.hidden];
      const held =
        folders.length > 0
          ? `Shared folders: ${listWords(folders.map((f) => f.name))}${row.tone ? ", at risk" : ""}.`
          : row.system
            ? "Holds the system."
            : "No shared folders.";
      return `${s.name}${on}: ${String(Math.round(s.used * 100))} percent used${own}${sick}. ${held}`;
    }
  }
}

/** A way in's name: "Windows and Mac (SMB): on, 2 computers connected, over enp2s0". */
export function wayName(w: MapWay, ifaces: readonly MapIface[]): string {
  const state = !w.running
    ? "on, not running"
    : w.connections
      ? `on, ${String(w.connections)} ${w.connections === 1 ? "computer" : "computers"} connected`
      : "on, running";
  const over = ifaces.filter((i) => i.up).map((i) => i.name);
  return `${w.name} (${w.tech}): ${state}${over.length > 0 ? `, over ${listWords(over)}` : ""}`;
}

// ─── The map's actions, each once on the screen (6.8 item 8) ──────────────────────────────────

/** Where each area chip of region A moves focus (6.2 A): the rows, or the band's two halves. */
export const LANE_TARGET: Record<LaneId, string> = {
  disks: "dm-rows",
  storage: "dm-rows",
  folders: "dm-rows",
  ways: "dm-band-ways",
  network: "dm-band-net",
};

/** The actions of the first steps that are on the screen, so nothing else offers them again. */
export function stepActionsShown(
  steps: readonly Step[],
  shown: boolean,
): string[] {
  return shown ? steps.filter((s) => !s.done).map((s) => s.action) : [];
}

/** The map's footer, in reading order. */
export const MAP_ACTIONS = [
  "Check disk health",
  "Add storage",
  "Add a shared folder",
  "Sharing settings",
  "Interfaces",
] as const;
export type MapAction = (typeof MAP_ACTIONS)[number];

/**
 * Each action once per screen: the footer leaves out what the screen already offers elsewhere (a
 * first step's button, the unused row's "Add storage"). The ghost on the unused row is that button
 * unless a first step already offers it; then it is a picture of where new storage will go.
 */
export function mapActions(
  view: MapView,
  stepActions: readonly string[],
): { footer: MapAction[]; ghostAdds: boolean } {
  const hasUnused = view.rows.some((r) => r.kind === "unused");
  const ghostAdds = hasUnused && !stepActions.includes("Add storage");
  const elsewhere = new Set([
    ...stepActions,
    ...(ghostAdds ? ["Add storage"] : []),
  ]);
  return {
    footer: MAP_ACTIONS.filter((a) => !elsewhere.has(a)),
    ghostAdds,
  };
}

// ─── The accent (A2, 1.2) ─────────────────────────────────────────────────────────────────────

/**
 * Where the one filled accent goes: B's worst row, else the map's "Add a shared folder" when there
 * are none, else the current first step, else (a new NAS with the steps hidden) the unused row's
 * "Add storage".
 */
export type AccentAt =
  "needs-you" | "folders-lane" | "step" | "add-storage" | "none";

export function accentAt(nas: Nas, stepsShown: boolean): AccentAt {
  if (needsYou(nas).length > 0) {
    return "needs-you";
  }
  if (
    !nas.newNas &&
    nas.folders.length === 0 &&
    !nas.failed.includes("folders")
  ) {
    return "folders-lane";
  }
  if (stepsShown && nas.steps.some((s) => !s.done)) {
    return "step";
  }
  return nas.newNas && nas.disks.some((d) => d.feeds.length === 0)
    ? "add-storage"
    : "none";
}

/** The step to do now: the first not done. */
export function currentStep(steps: readonly Step[]): Step | undefined {
  return steps.find((s) => !s.done);
}

/** The plugin tiles in full rows (owner decision 8): as many columns as fit, rows balanced, no holes. */
export function tileColumns(count: number, fit: number): number {
  if (count <= 0) {
    return 1;
  }
  const max = Math.max(1, Math.min(fit, count));
  const rows = Math.ceil(count / max);
  return Math.ceil(count / rows);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────────────────────

const STEPS_EXISTING: Step[] = [
  {
    id: "name",
    title: "Name the NAS",
    line: "It is called nas on your network.",
    action: "Rename",
    done: true,
  },
  {
    id: "password",
    title: "Change the factory password",
    line: "The factory password may still work.",
    action: "Change",
    done: false,
  },
  {
    id: "https",
    title: "Turn on secure sign-in",
    line: "So your password never crosses the network in the clear (HTTPS).",
    action: "Turn on",
    done: false,
  },
  {
    id: "alerts",
    title: "Get alerts by email",
    line: "Hear about a failing disk before you lose files.",
    action: "Set up",
    done: false,
  },
];

const STEPS_NEW: Step[] = [
  {
    id: "storage",
    title: "Add storage",
    line: "Make a disk ready to keep files.",
    action: "Add storage",
    done: false,
  },
  {
    id: "folder",
    title: "Add a shared folder",
    line: "A folder your computers open, like Photos.",
    action: "Add a shared folder",
    done: false,
  },
  {
    id: "person",
    title: "Add the people who use it",
    line: "Each with their own password.",
    action: "Add a person",
    done: false,
  },
  {
    id: "password",
    title: "Change the factory password",
    line: "The factory password may still work.",
    action: "Change",
    done: false,
  },
];

const FACTS: Facts = {
  name: "nas",
  version: "8.6.1-1",
  uptime: `5${NBSP}h 25${NBSP}min`,
  time: "Thu 19 Nov, 11:50",
  updates: 33,
};

const t = (n: string) => `${n}${NBSP}TiB`;
const g = (n: string) => `${n}${NBSP}GiB`;

function disk(
  device: string,
  kind: DiskKind,
  size: string,
  feeds: string[],
  temp: number | null,
): MapDisk {
  return {
    id: `d:${device}`,
    device,
    kind,
    size,
    health: "ok",
    word: "OK",
    temp,
    power: kind === "hdd" ? "awake" : "none",
    feeds,
  };
}

const WAYS: MapWay[] = [
  {
    id: "smb",
    name: "Windows and Mac",
    tech: "SMB",
    on: true,
    running: true,
    connections: 2,
  },
  {
    id: "nfs",
    name: "Linux and Unix",
    tech: "NFS",
    on: true,
    running: true,
    connections: null,
  },
  {
    id: "rsync",
    name: "Copies to other NAS",
    tech: "rsync",
    on: false,
    running: false,
    connections: null,
  },
  {
    id: "ssh",
    name: "Remote sign-in",
    tech: "SSH",
    on: true,
    running: true,
    connections: 0,
  },
];

const IFACES: MapIface[] = [
  {
    id: "n:enp2s0",
    name: "enp2s0",
    kind: "net-ethernet",
    speed: `1${NBSP}Gbit/s`,
    address: "192.0.2.10",
    up: true,
  },
];

const ADD_ONS: AddOn[] = [
  { id: "zfs", kind: "zfs", pkg: "openmediavault-zfs" },
  { id: "raid", kind: "raid", pkg: "openmediavault-md" },
  { id: "compose", kind: "unknown", pkg: "openmediavault-compose" },
];

function storageNode(
  id: string,
  name: string,
  tech: string,
  kind: MapStorage["kind"],
  used: number,
  free: string,
  total: string,
  feeds: string[],
): MapStorage {
  return {
    id: `s:${id}`,
    name,
    tech,
    kind,
    used,
    free,
    total,
    health: "ok",
    word: "OK",
    feeds,
  };
}

function folder(id: string, name: string, via: WayId[]): MapFolder {
  return { id: `f:${id}`, name, via, health: "ok", word: "OK" };
}

/** The mock's NAS, all fine: six disks, four drives (one a mirror, one a ZFS pool), six folders. */
function baseNas(): Nas {
  return {
    facts: FACTS,
    checkedAt: "10:31",
    disks: [
      disk("nvme0n1", "nvme", g("238.5"), ["s:system"], 34),
      disk("sda", "hdd", t("3.6"), ["s:data"], 36),
      disk("sdb", "hdd", t("3.6"), ["s:backup"], 35),
      disk("sdc", "hdd", t("3.6"), ["s:backup"], 37),
      disk("sdd", "hdd", t("3.6"), ["s:tank"], 33),
      { ...disk("sde", "ssd", g("931.5"), [], 31), word: "OK" },
    ],
    storage: [
      storageNode(
        "system",
        "System drive",
        "EXT4",
        "fs",
        0.1,
        g("16.9"),
        g("18.6"),
        [],
      ),
      storageNode(
        "data",
        "Data drive",
        "EXT4",
        "fs",
        0.62,
        t("1.4"),
        t("3.6"),
        ["f:photos", "f:music", "f:documents"],
      ),
      storageNode(
        "backup",
        "Backup",
        "Mirror (RAID 1)",
        "raid",
        0.41,
        t("2.1"),
        t("3.6"),
        ["f:timemachine", "f:a4share"],
      ),
      storageNode("tank", "tank", "ZFS pool", "zfs", 0.28, t("2.6"), t("3.6"), [
        "f:archive",
      ]),
    ],
    folders: [
      folder("photos", "Photos", ["smb"]),
      folder("music", "Music", ["smb", "nfs"]),
      folder("documents", "Documents", ["smb"]),
      folder("timemachine", "Time Machine", ["smb"]),
      folder("a4share", "a4share", []),
      folder("archive", "Archive", ["nfs"]),
    ],
    ways: WAYS,
    ifaces: IFACES,
    addOns: ADD_ONS,
    attention: [],
    steps: STEPS_EXISTING,
    newNas: false,
    failed: [],
  };
}

const RESTART: Attention = {
  id: "a:restart",
  area: "system",
  health: "warning",
  title: "The NAS needs a restart",
  line: "Updates finish installing when it restarts.",
  answer: "The NAS needs a restart to finish installing updates.",
  action: "Restart",
};

/** The problem the lab's "A problem arrives" brings: sdb reports a problem. */
export function withSdbWarning(nas: Nas): Nas {
  return {
    ...nas,
    disks: nas.disks.map((d) =>
      d.id === "d:sdb" ? { ...d, health: "warning", word: "Warning" } : d,
    ),
    attention: [
      {
        id: "a:sdb",
        area: "disks",
        health: "warning",
        title: "Disk sdb reports a problem",
        line: "Backup keeps working on its other disk, sdc. Plan to replace sdb.",
        answer:
          "Disk sdb reports a problem. Backup keeps working on its other disk.",
        action: "See what to do",
        node: "d:sdb",
      },
      ...nas.attention.filter((a) => a.id !== "a:sdb"),
    ],
  };
}

/** The lab's "Resolve it": sdb is fine again. */
export function withoutSdbWarning(nas: Nas): Nas {
  return {
    ...nas,
    disks: nas.disks.map((d) =>
      d.id === "d:sdb" ? { ...d, health: "ok", word: "OK" } : d,
    ),
    attention: nas.attention.filter((a) => a.id !== "a:sdb"),
  };
}

/** The lab's "A ghost becomes real": the new NAS's first storage, on sda. */
export function withFirstStorage(nas: Nas): Nas {
  return {
    ...nas,
    disks: nas.disks.map((d) =>
      d.id === "d:sda" ? { ...d, feeds: ["s:data"] } : d,
    ),
    storage: [
      ...nas.storage,
      storageNode(
        "data",
        "Data drive",
        "EXT4",
        "fs",
        0,
        t("3.6"),
        t("3.6"),
        [],
      ),
    ],
    steps: nas.steps.map((s) =>
      s.id === "storage" ? { ...s, done: true } : s,
    ),
  };
}

/** The lab's "A disk goes to sleep" and "wakes". */
export function withPower(nas: Nas, id: string, power: Power): Nas {
  return {
    ...nas,
    disks: nas.disks.map((d) => (d.id === id ? { ...d, power } : d)),
  };
}

const MANY_FOLDERS = [
  "Photos",
  "Music",
  "Documents",
  "Films",
  "Series",
  "Projects",
  "Scans",
  "Recipes",
  "Games",
  "Downloads",
  "Kids",
  "Work",
  "Taxes",
  "Camera roll",
  "Phone backups",
  "Home videos",
  "Podcasts",
  "Books",
  "Comics",
  "Software",
  "Old projects",
  "Wedding",
  "Holidays 2025",
  "Holidays 2026",
  "Garden plans",
  "Invoices",
  "Lab results",
  "Archive",
  "Time Machine",
  "a4share",
];

function manyNas(): Nas {
  const base = baseNas();
  const letters = "abcdefghijklmnopqrstuvw".split("");
  const drives = [
    ["system", "System drive", "EXT4", "fs", 0.1],
    ["photos", "Photos drive", "EXT4", "fs", 0.71],
    ["media1", "Media 1", "XFS", "fs", 0.84],
    ["media2", "Media 2", "XFS", "fs", 0.66],
    ["backup", "Backup", "Mirror (RAID 1)", "raid", 0.41],
    ["tank", "tank", "ZFS pool", "zfs", 0.52],
    ["scratch", "Scratch", "EXT4", "fs", 0.12],
    ["archive", "Archive drive", "Parity (RAID 6)", "raid", 0.77],
  ] as const;
  const dataDrives = drives.slice(1);
  // How many disks each data drive is made of, in letter order: the RAID 6 has eight, so its row
  // folds them into a strip (6.8 item 9).
  const diskCount: Record<string, number> = {
    photos: 2,
    media1: 3,
    media2: 5,
    backup: 2,
    tank: 2,
    scratch: 1,
    archive: 8,
  };
  const diskTargets = dataDrives.flatMap(([id]) =>
    Array.from({ length: diskCount[id] ?? 0 }, () => id),
  );
  const disks: MapDisk[] = [
    disk("nvme0n1", "nvme", g("238.5"), ["s:system"], 34),
    ...letters.map((l, i) =>
      disk(
        `sd${l}`,
        "hdd",
        t("7.3"),
        [`s:${diskTargets[i] ?? "photos"}`],
        33 + (i % 6),
      ),
    ),
  ];
  const folders = MANY_FOLDERS.map((name, i) =>
    folder(
      name.toLowerCase().replace(/\W+/gu, "-"),
      name,
      i % 5 === 4 ? ["nfs"] : i % 7 === 6 ? [] : ["smb"],
    ),
  );
  // The first nine folders are on Photos drive (more than six: five and "+4 more"), the rest
  // round the other data drives.
  const others = dataDrives.slice(1);
  const folderDrive = (i: number) =>
    i < 9 ? "photos" : (others[(i - 9) % others.length]?.[0] ?? "photos");
  const storage = drives.map(([id, name, tech, kind, used]) =>
    storageNode(
      id,
      name,
      tech,
      kind,
      used,
      t((7.3 * (1 - used)).toFixed(1)),
      t("7.3"),
      folders.filter((_, i) => folderDrive(i) === id).map((f) => f.id),
    ),
  );
  const nas: Nas = {
    ...base,
    disks,
    storage,
    folders,
    ifaces: [
      ...IFACES,
      {
        id: "n:enp3s0",
        name: "enp3s0",
        kind: "net-ethernet",
        speed: `10${NBSP}Gbit/s`,
        address: "192.0.2.11",
        up: true,
      },
    ],
    addOns: [
      ...ADD_ONS,
      { id: "wol", kind: "unknown", pkg: "openmediavault-wol" },
    ],
  };
  const withWarning = {
    ...nas,
    disks: nas.disks.map((d) =>
      d.id === "d:sdj"
        ? { ...d, health: "warning" as const, word: "Warning" }
        : d,
    ),
  };
  return {
    ...withWarning,
    attention: [
      {
        id: "a:sdj",
        area: "disks",
        health: "warning",
        title: "Disk sdj reports a problem",
        line: "Media 2 keeps working on its other disks. Plan to replace sdj.",
        answer: "Disk sdj reports a problem. Media 2 keeps working.",
        action: "See what to do",
        node: "d:sdj",
      },
    ],
  };
}

/** The NAS each lab state shows. */
export function nasFor(state: DashState): Nas {
  const base = baseNas();
  switch (state) {
    case "all-ok":
    case "loading":
      return base;
    case "new-interface":
      return { ...base, steps: base.steps.map((s) => ({ ...s, done: true })) };
    case "needs-you": {
      const nas = withSdbWarning(base);
      return {
        ...nas,
        checkedAt: "10:31",
        storage: nas.storage.map((s) =>
          s.id === "s:data"
            ? {
                ...s,
                used: 0.92,
                free: g("290"),
                health: "warning",
                word: "Almost full",
              }
            : s,
        ),
        attention: [
          ...nas.attention,
          {
            id: "a:data",
            area: "storage",
            health: "warning",
            title: "Data drive is almost full",
            line: "92 % used, 290 GiB left. Photos, Music and Documents are on it.",
            answer: "Data drive is almost full.",
            action: "See what uses space",
            node: "s:data",
          },
          RESTART,
          {
            id: "a:clock",
            area: "system",
            health: "unknown",
            title: "The clocks differ by 4 days",
            line: "Schedules and logs will show the wrong time.",
            answer: "The NAS's clock is 4 days behind this computer's.",
            action: "Check the time",
          },
        ],
      };
    }
    case "disk-critical":
      return {
        ...base,
        disks: base.disks.map((d) =>
          d.id === "d:sda" ? { ...d, health: "critical", word: "Failing" } : d,
        ),
        attention: [
          {
            id: "a:sda",
            area: "disks",
            health: "critical",
            title: "Disk sda is failing",
            line: "Data drive and the 3 shared folders on it are at risk. Copy what matters to another drive now.",
            answer:
              "Disk sda is failing. Copy what matters off Data drive now.",
            action: "See what to do",
            node: "d:sda",
          },
          RESTART,
        ],
      };
    case "new-nas":
      return {
        ...base,
        checkedAt: null,
        disks: base.disks.map((d) => ({
          ...d,
          feeds: d.id === "d:nvme0n1" ? d.feeds : [],
          health: d.id === "d:nvme0n1" ? "ok" : "unknown",
          word: d.id === "d:nvme0n1" ? "OK" : "Not checked",
        })),
        storage: base.storage.filter((s) => s.id === "s:system"),
        folders: [],
        ways: WAYS.map((w) => ({
          ...w,
          on: w.id === "ssh",
          running: w.id === "ssh",
          connections: w.id === "ssh" ? 0 : null,
        })),
        addOns: [],
        steps: STEPS_NEW,
        newNas: true,
      };
    case "many":
      return manyNas();
    case "no-folders":
      return {
        ...base,
        storage: base.storage.map((s) => ({ ...s, feeds: [] })),
        folders: [],
        ways: WAYS.map((w) => (w.id === "smb" ? { ...w, connections: 0 } : w)),
      };
    case "lane-failed":
      return { ...base, failed: ["disks"] };
  }
}

// ─── Layout ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The page's layout by content width: wide (1440), mid (900: rows keep their three columns, the
 * band and the footer blocks stack) or narrow (390: each row a card, connectors vertical).
 */
export type Layout = "wide" | "mid" | "narrow";

/** The layout the content width allows. */
export function layoutFor(width: number): Layout {
  return width >= 960 ? "wide" : width >= 600 ? "mid" : "narrow";
}

/** A temperature with its unit: "36 °C". */
export function celsius(t: number): string {
  return `${String(t)}${NBSP}°C`;
}
