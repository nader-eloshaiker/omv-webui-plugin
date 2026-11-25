// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard prototype's data and pure logic (rethink spec 6): lab fixtures shaped like the
// mock's default NAS, the answer and its area states, the "needs you" order, the lanes' caps, the
// map's graph and which nodes a problem puts at risk, and where the one filled accent goes.
// Development only (UI-11). The lab does not boot the mock, a session or a query client, so every
// figure here is a fixture; the live strip alone runs through the app's own sample store
// (liveFeed.ts).
import type { MapNodeShape } from "@omv-webui/react-ui-components";
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
    caption: "These are the disks the NAS found.",
  },
  {
    id: "storage",
    title: "Storage",
    action: "Add storage",
    caption: "Storage is a disk made ready to keep files.",
  },
  {
    id: "folders",
    title: "Shared folders",
    action: "Add a shared folder",
    caption: "A shared folder is what your computers open.",
  },
  {
    id: "ways",
    title: "Ways in",
    action: "Sharing settings",
    caption: "How your computers reach the shared folders.",
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

/** What a node feeds, in words, for the narrow map without lines: "Feeds Photos, Music and 4 more". */
export function feedsWords(names: readonly string[]): string {
  if (names.length === 0) {
    return "";
  }
  if (names.length <= 3) {
    return `Feeds ${listWords(names)}`;
  }
  return `Feeds ${names.slice(0, 2).join(", ")} and ${String(names.length - 2)} more`;
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

// ─── Lanes: caps (6.4) ────────────────────────────────────────────────────────────────────────

const isProblem = (h: Health) => h === "warning" || h === "critical";

/**
 * The bay (6.4): up to `max` slots at full size; beyond that the healthy and unchecked disks fold
 * into a strip of ticks, and every disk in trouble keeps its full slot.
 */
export function bayLayout(
  disks: readonly MapDisk[],
  max = 12,
): { full: MapDisk[]; strip: MapDisk[] } {
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

/** A capped lane: what is shown, and how many are left out and whether they are all fine. */
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

/** Storage (6.4): every one in trouble, then the fullest, up to `max`. Uncapped, in its own order. */
export function capStorage(
  list: readonly MapStorage[],
  disks: readonly MapDisk[] = [],
  max = 5,
): Capped<MapStorage> {
  if (list.length <= max) {
    return { shown: [...list], hidden: [] };
  }
  // A drive on a disk in trouble counts as in trouble: it is what the problem puts at risk.
  const trouble = (s: MapStorage) =>
    worst([
      s.health,
      ...disks.filter((d) => d.feeds.includes(s.id)).map((d) => d.health),
    ]);
  const order = [...list].sort(
    (a, b) => byHealth(trouble(a), trouble(b)) || b.used - a.used,
  );
  return { shown: order.slice(0, max), hidden: order.slice(max) };
}

/** Shared folders (6.4): those in trouble first, then the backend's order, up to `max`. */
export function capFolders(
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
  return { shown: order.slice(0, max), hidden: order.slice(max) };
}

/** Ways in (6.4): only those that are on as tiles, the rest as one "Off:" line. */
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

// ─── The map's graph ──────────────────────────────────────────────────────────────────────────

export const MORE_ID: Record<"storage" | "folders", string> = {
  storage: "more:storage",
  folders: "more:folders",
};
export const STRIP_ID = "strip:disks";

export interface MapView {
  bay: { full: MapDisk[]; strip: MapDisk[] };
  storage: Capped<MapStorage>;
  folders: Capped<MapFolder>;
  ways: { on: MapWay[]; off: string };
  ifaces: Capped<MapIface>;
  /** The visible graph, every hidden node folded into its lane's "more" node or the strip. */
  nodes: MapNodeShape[];
}

/** The lane a map node id belongs to, by its prefix. */
export function laneOfId(id: string): LaneId {
  if (id.startsWith("d:") || id === STRIP_ID) {
    return "disks";
  }
  if (id.startsWith("s:") || id === MORE_ID.storage) {
    return "storage";
  }
  if (id.startsWith("f:") || id === MORE_ID.folders) {
    return "folders";
  }
  return id.startsWith("w:") ? "ways" : "network";
}

export const wayNode = (id: WayId) => `w:${id}`;

/** The full graph, nothing capped: disks feed storage, storage feeds folders, and so on. */
export function fullGraph(nas: Nas): MapNodeShape[] {
  const up = nas.ifaces.filter((i) => i.up).map((i) => i.id);
  return [
    ...nas.disks.map((d) => ({ id: d.id, feeds: d.feeds, status: d.health })),
    ...nas.storage.map((s) => ({ id: s.id, feeds: s.feeds, status: s.health })),
    ...nas.folders.map((f) => ({
      id: f.id,
      feeds: f.via.map(wayNode),
      status: f.health,
    })),
    ...nas.ways
      .filter((w) => w.on)
      .map((w) => ({
        id: wayNode(w.id),
        feeds: up,
        status: (w.running ? "ok" : "warning") as Health,
      })),
    ...nas.ifaces.map((i) => ({
      id: i.id,
      status: (i.up ? "ok" : "critical") as Health,
    })),
  ];
}

/** What the map shows: each lane capped, and the graph between what is shown. */
export function mapView(nas: Nas): MapView {
  const bay = bayLayout(nas.disks);
  const storage = capStorage(nas.storage, nas.disks);
  const folders = capFolders(nas.folders);
  const ifaces: Capped<MapIface> = {
    shown: nas.ifaces.slice(0, 3),
    hidden: nas.ifaces.slice(3),
  };
  const ways = waysLayout(nas.ways);
  const alias = new Map<string, string>();
  for (const d of bay.strip) {
    alias.set(d.id, STRIP_ID);
  }
  for (const s of storage.hidden) {
    alias.set(s.id, MORE_ID.storage);
  }
  for (const f of folders.hidden) {
    alias.set(f.id, MORE_ID.folders);
  }
  const visible = (id: string) => alias.get(id) ?? id;
  const merged = new Map<string, { feeds: Set<string>; status: Health[] }>();
  for (const node of fullGraph(nas)) {
    const id = visible(node.id);
    const entry = merged.get(id) ?? { feeds: new Set(), status: [] };
    for (const to of node.feeds ?? []) {
      entry.feeds.add(visible(to));
    }
    entry.status.push((node.status ?? "ok") as Health);
    merged.set(id, entry);
  }
  const nodes = [...merged].map(([id, { feeds, status }]) => ({
    id,
    feeds: [...feeds],
    // A strip or "more" node is drawn plain: the trouble it folds in is never there (6.4).
    status: id === STRIP_ID || id.startsWith("more:") ? "ok" : worst(status),
  })) as MapNodeShape[];
  return { bay, storage, folders, ways, ifaces, nodes };
}

/**
 * What a problem puts at risk (6.2, 7.6): from a disk or a storage, what it holds, down to the
 * shared folders (a disk failing does not endanger the network); from a way in or an interface, the
 * shared folders it is the way to. The node itself is always part of it.
 */
export function atRisk(
  nodes: readonly MapNodeShape[],
  id: string,
): Set<string> {
  const down = new Map<string, readonly string[]>();
  const up = new Map<string, string[]>();
  for (const node of nodes) {
    down.set(node.id, node.feeds ?? []);
    for (const to of node.feeds ?? []) {
      up.set(to, [...(up.get(to) ?? []), node.id]);
    }
  }
  const lane = laneOfId(id);
  const out = new Set<string>([id]);
  if (lane === "folders") {
    return out;
  }
  const next = lane === "disks" || lane === "storage" ? down : up;
  const queue = [id];
  while (queue.length > 0) {
    const at = queue.shift() as string;
    if (at !== id && laneOfId(at) === "folders") {
      continue;
    }
    for (const n of next.get(at) ?? []) {
      if (!out.has(n)) {
        out.add(n);
        queue.push(n);
      }
    }
  }
  return out;
}

/** Every node at risk from a problem on the map, with the worst problem's tone. */
export function riskTones(
  nodes: readonly MapNodeShape[],
): Map<string, "warning" | "critical"> {
  const tones = new Map<string, "warning" | "critical">();
  for (const node of nodes) {
    const status = node.status ?? "ok";
    if (status !== "warning" && status !== "critical") {
      continue;
    }
    for (const id of atRisk(nodes, node.id)) {
      if (tones.get(id) !== "critical") {
        tones.set(id, status);
      }
    }
  }
  return tones;
}

/** How far each node at risk is from where the trouble starts, for the lineage's travel (7.6). */
export function riskDepth(
  nodes: readonly MapNodeShape[],
  from: string,
): Map<string, number> {
  const set = atRisk(nodes, from);
  const depth = new Map<string, number>([[from, 0]]);
  const links = new Map<string, string[]>();
  for (const node of nodes) {
    for (const to of node.feeds ?? []) {
      links.set(node.id, [...(links.get(node.id) ?? []), to]);
      links.set(to, [...(links.get(to) ?? []), node.id]);
    }
  }
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift() as string;
    for (const n of links.get(at) ?? []) {
      if (set.has(n) && !depth.has(n)) {
        depth.set(n, (depth.get(at) ?? 0) + 1);
        queue.push(n);
      }
    }
  }
  return depth;
}

// ─── The accent (A2, 1.2) ─────────────────────────────────────────────────────────────────────

/** Where the one filled accent goes: B's worst row, else an empty lane's action, else the step. */
export type AccentAt = "needs-you" | "folders-lane" | "step" | "none";

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
  return stepsShown && nas.steps.some((s) => !s.done) ? "step" : "none";
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
  const disks: MapDisk[] = [
    disk("nvme0n1", "nvme", g("238.5"), ["s:system"], 34),
    ...letters.map((l, i) => {
      const target = dataDrives[i % dataDrives.length]?.[0] ?? "photos";
      return disk(`sd${l}`, "hdd", t("7.3"), [`s:${target}`], 33 + (i % 6));
    }),
  ];
  const folders = MANY_FOLDERS.map((name, i) =>
    folder(
      name.toLowerCase().replace(/\W+/gu, "-"),
      name,
      i % 5 === 4 ? ["nfs"] : i % 7 === 6 ? [] : ["smb"],
    ),
  );
  const storage = drives.map(([id, name, tech, kind, used]) =>
    storageNode(
      id,
      name,
      tech,
      kind,
      used,
      t((7.3 * (1 - used)).toFixed(1)),
      t("7.3"),
      id === "system"
        ? []
        : folders
            .filter((_, i) => dataDrives[i % dataDrives.length]?.[0] === id)
            .map((f) => f.id),
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

/** The map's layout: five lanes, three lanes with Ways in below (900), or disclosure rows (390). */
export type Layout = "wide" | "mid" | "narrow";

/** The layout the content width allows. */
export function layoutFor(width: number): Layout {
  return width >= 960 ? "wide" : width >= 600 ? "mid" : "narrow";
}

/** The lane's count and state for its header: "6 · Not checked", "4 · OK". */
export function laneSummary(
  nas: Nas,
  lane: LaneId,
  areas: readonly AreaState[],
): { count: string; health: Health; word: string } {
  const area = areas.find((a) => a.lane === lane);
  const counts: Record<LaneId, number> = {
    disks: nas.disks.length,
    storage: nas.storage.length,
    folders: nas.folders.length,
    ways: nas.ways.filter((w) => w.on).length,
    network: nas.ifaces.length,
  };
  const count =
    lane === "ways"
      ? `${String(counts.ways)} on`
      : lane === "network"
        ? (nas.ifaces[0]?.name ?? "")
        : String(counts[lane]);
  return {
    count,
    health: area?.health ?? "ok",
    word: area?.word ?? "OK",
  };
}

/** A temperature with its unit: "36 °C". */
export function celsius(t: number): string {
  return `${String(t)}${NBSP}°C`;
}
