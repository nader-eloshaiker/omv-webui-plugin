// SPDX-License-Identifier: GPL-3.0-or-later
// The chart prototype's model (owner, 2026-11-26: "the charts look boring and generic"). Pure, so
// every rule is tested without React. Development only (UI-11).
//
// Every figure names the contract read it comes from:
// - space: FileSystemMgmt.getList `size`, `available`, `percentage` and `usagewarnthreshold`;
// - live: System.getInformation `cpuUtilization`, `memUsed` and `memTotal`, and the change in
//   Network.enumerateDevicesList `stats.rx_bytes` and `stats.tx_bytes` between two readings, through
//   the app's own sample functions (src/live/liveSamples.ts);
// - temperatures: DiskMgmt.getList `temperature` and `powermode` (it never wakes a sleeping disk),
//   with the alert limit from Smart.getSettings `tempmax` and Smart.getDeviceSettings `tempmax`.
// A history is only what this page read: it starts empty and is never filled in backwards.
import type {
  ConfiguredFilesystem,
  DiskDevice,
  SmartSettings,
} from "@omv-webui/react-api-omv/generated";
import { formatBytes, parseByteCount } from "../../format/format.ts";

export const NBSP = "\u00a0";

// ─── Space used on a file system ──────────────────────────────────────────────────────────────

/** The fields of a FileSystemMgmt.getList row the meters read. */
export type FsRead = Pick<
  ConfiguredFilesystem,
  | "devicename"
  | "label"
  | "type"
  | "size"
  | "available"
  | "percentage"
  | "usagewarnthreshold"
>;

/**
 * How the file system is drawn, for the picture only, never as a figure: a mirror from
 * MdMgmt.enumerateDevices `level`, an NVMe or SSD from DiskMgmt.getList of its `devicefiles`.
 */
export type Drawing = "hdd" | "ssd" | "nvme" | "mirror";

export interface SpaceFixture {
  id: string;
  /** FileSystemMgmt.getList. */
  read: FsRead;
  drawing: Drawing;
  /** The technical term in secondary text: `type`, and MdMgmt.enumerateDevices `level` for an array. */
  tech: string;
}

export interface Space {
  id: string;
  /** `label`, or `devicename` when it has none. */
  name: string;
  tech: string;
  drawing: Drawing;
  /** Percent used, 0 to 100: `percentage`. */
  used: number;
  /** `available`, written in binary units. */
  free: string;
  /** `size`, written in binary units. */
  total: string;
  /** `usagewarnthreshold` when the admin set one; null for 0 (never warns) or absent. */
  mark: number | null;
  /** At or past the admin's mark: only then may the bar take the warning colour, with its word. */
  over: boolean;
  /** The meter's accessible name. */
  label: string;
  /** The meter's text alternative. */
  valueText: string;
}

export const OVER_WORD = "Almost full";

const TiB = 1024 ** 4;

/** The meters' reading of one row; null when it has no reading (`percentage` -1, sizes "-1"). */
export function spaceOf(f: SpaceFixture): Space | null {
  const size = parseByteCount(f.read.size);
  const available = parseByteCount(f.read.available);
  if (f.read.percentage < 0 || size === null || available === null) {
    return null;
  }
  const used = Math.min(100, Math.max(0, f.read.percentage));
  const threshold = f.read.usagewarnthreshold ?? 0;
  const mark = threshold > 0 ? threshold : null;
  const over = mark !== null && used >= mark;
  const name =
    f.read.label !== null && f.read.label !== ""
      ? f.read.label
      : f.read.devicename;
  const free = formatBytes(available);
  const total = formatBytes(size);
  const words = [`${pct(used)} used, ${free} free of ${total}`];
  if (mark !== null) {
    words.push(`the warning mark is at ${pct(mark)}`);
  }
  if (over) {
    words.push(OVER_WORD.toLowerCase());
  }
  return {
    id: f.id,
    name,
    tech: f.tech,
    drawing: f.drawing,
    used,
    free,
    total,
    mark,
    over,
    label: `${name}: space used`,
    valueText: `${words.join(", ")}.`,
  };
}

/** "62 %": a whole percent with a non-breaking space, as the dashboard writes it. */
export function pct(n: number): string {
  return `${String(Math.round(n))}${NBSP}%`;
}

/** One cell of a waffle or a segmented bar: how much of it is filled, and whether it is past the mark. */
export interface Cell {
  /** 0 to 1. */
  fill: number;
  /** The cell ends past the admin's mark. */
  zone: boolean;
}

/**
 * `count` equal cells, each a fixed share of the drive (2 % for 50). The last filled cell is filled
 * in part, so the picture is as exact as the bar: nothing is rounded up or down to a whole square.
 */
export function cellsOf(
  used: number,
  mark: number | null,
  count: number,
): Cell[] {
  const share = 100 / count;
  return Array.from({ length: count }, (_, i) => ({
    fill: Math.min(1, Math.max(0, used / share - i)),
    zone: mark !== null && (i + 1) * share > mark + 1e-9,
  }));
}

function fs(
  id: string,
  read: FsRead,
  drawing: Drawing,
  tech: string,
): SpaceFixture {
  return { id, read, drawing, tech };
}

/**
 * The lab's FileSystemMgmt.getList: the dashboard lab's drives (System drive, Data drive, Backup,
 * tank) and an SSD past its mark. OMV's default warning mark is 85 %; tank's admin turned it off.
 */
export const FILE_SYSTEMS: readonly SpaceFixture[] = [
  fs(
    "system",
    {
      devicename: "nvme0n1p2",
      label: "System drive",
      type: "ext4",
      size: "19971178496",
      available: "18146236416",
      percentage: 10,
      usagewarnthreshold: 85,
    },
    "nvme",
    "EXT4",
  ),
  fs(
    "data",
    {
      devicename: "sda1",
      label: "Data drive",
      type: "ext4",
      size: "3958168383488",
      available: "1539316006912",
      percentage: 62,
      usagewarnthreshold: 85,
    },
    "hdd",
    "EXT4",
  ),
  fs(
    "backup",
    {
      devicename: "md0",
      label: "Backup",
      type: "ext4",
      size: "3958168383488",
      available: "2308974166016",
      percentage: 41,
      usagewarnthreshold: 85,
    },
    "mirror",
    "Mirror (RAID 1), EXT4",
  ),
  fs(
    "tank",
    {
      devicename: "tank",
      label: "tank",
      type: "zfs",
      size: "3958168383488",
      available: "2858730078208",
      percentage: 28,
      usagewarnthreshold: 0,
    },
    "hdd",
    "ZFS",
  ),
  fs(
    "media",
    {
      devicename: "sde1",
      label: "Media",
      type: "ext4",
      size: "1000202273280",
      available: "89120571392",
      percentage: 91,
      usagewarnthreshold: 85,
    },
    "ssd",
    "EXT4",
  ),
];

/** The lab's cause: the next FileSystemMgmt.getList after copying 1 TiB to the Data drive. */
export function withCopy(list: readonly SpaceFixture[]): SpaceFixture[] {
  return list.map((f) => {
    if (f.id !== "data") {
      return f;
    }
    const size = Number(f.read.size);
    const available = Number(f.read.available) - TiB;
    return {
      ...f,
      read: {
        ...f.read,
        available: String(available),
        // As df counts it, the reserved blocks included, like the reading before the copy.
        percentage: f.read.percentage + Math.round((TiB / size) * 100),
      },
    };
  });
}

// ─── Live readings ────────────────────────────────────────────────────────────────────────────

/** A reading every 2 seconds, kept for at most 2 minutes. */
export const EVERY_MS = 2000;
export const WINDOW_MS = 120_000;

/** One point of a live line: when this page received the reading, and its value (null: none). */
export interface Point {
  t: number;
  v: number | null;
}

/** Only the readings of the last two minutes, counted back from the newest. */
export function trimmed<S extends { t: number }>(
  samples: readonly S[],
): { kept: S[]; dropped: boolean } {
  const last = samples.at(-1);
  if (last === undefined) {
    return { kept: [], dropped: false };
  }
  const from = last.t - WINDOW_MS;
  const kept = samples.filter((s) => s.t > from);
  return { kept, dropped: kept.length < samples.length };
}

/** "10:31", this computer's clock, as the readings are stamped with their time of receipt. */
export function clock(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours())}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * How far back the readings on screen go, said honestly: "Since 10:31" while the page has been open
 * less than two minutes, "Last 2 minutes" once older readings have been let go.
 */
export function spanWords(
  points: readonly { t: number }[],
  dropped: boolean,
): string {
  const first = points[0];
  if (first === undefined) {
    return "No reading yet";
  }
  if (points.length === 1) {
    return `One reading, at ${clock(first.t)}`;
  }
  return dropped ? "Last 2 minutes" : `Since ${clock(first.t)}`;
}

export interface Range {
  now: number | null;
  min: number;
  max: number;
}

/** The newest value and the range seen; null when nothing was read. */
export function rangeOf(points: readonly Point[]): Range | null {
  const values = points.flatMap((p) => (p.v === null ? [] : [p.v]));
  if (values.length === 0) {
    return null;
  }
  return {
    now: points.at(-1)?.v ?? null,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/**
 * A live chart's text alternative: the value now and the range this page saw, for example
 * "Processor: 12 % now, between 1 % and 41 % since 10:31."
 */
export function liveAlt(
  name: string,
  points: readonly Point[],
  dropped: boolean,
  format: (v: number) => string,
): string {
  const range = rangeOf(points);
  if (range === null) {
    return `${name}: no reading yet.`;
  }
  const now =
    range.now === null
      ? "no value in the last reading"
      : `${format(range.now)} now`;
  if (points.length === 1) {
    return `${name}: ${now}, one reading so far.`;
  }
  const span = dropped
    ? "in the last 2 minutes"
    : `since ${clock(points[0]?.t ?? 0)}`;
  return `${name}: ${now}, between ${format(range.min)} and ${format(range.max)} ${span}.`;
}

/** The smallest of 1, 2 or 5 times a power of ten at or above `v`, and never under `floor`. */
export function niceMax(v: number, floor = 1): number {
  const target = Math.max(v, floor);
  const power = 10 ** Math.floor(Math.log10(target));
  for (const step of [1, 2, 5, 10]) {
    if (step * power >= target - 1e-9) {
      return step * power;
    }
  }
  return 10 * power;
}

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;

/** A rate in MiB/s, two decimals under one: "38.6 MiB/s", "0.31 MiB/s". */
export function rateText(mibPerSecond: number): string {
  const v =
    mibPerSecond < 1 ? mibPerSecond.toFixed(2) : mibPerSecond.toFixed(1);
  return `${v}${NBSP}MiB/s`;
}

/** A scale's top: "100 MiB/s". */
export function scaleText(mibPerSecond: number): string {
  return `${String(mibPerSecond)}${NBSP}MiB/s`;
}

export const toMiB = (bytesPerSecond: number): number => bytesPerSecond / MiB;

/** Memory in GiB, two decimals under one: "0.35 GiB", "3.8 GiB". */
export function gibText(bytes: number): string {
  const v = bytes / GiB;
  return `${v < 1 ? v.toFixed(2) : v.toFixed(1)}${NBSP}GiB`;
}

// Chart geometry, in the SVG's own units: the plot is drawn at any width with a scaled x axis
// (preserveAspectRatio="none") and strokes that keep their width (vector-effect).

/** The plot's width in its own units; two minutes run across it. */
export const PLOT_W = 600;
export const PLOT_H = 100;
/** Room above and below so a stroke on the top or bottom is not cut in half. */
const PAD = 3;

/** Where a reading taken at `t` sits when the newest reading, at `last`, is at the right edge. */
export function xAt(t: number, last: number): number {
  return PLOT_W - ((last - t) / WINDOW_MS) * PLOT_W;
}

/** A value's height on a scale from 0 to `max`, from the bottom (`dir` 1) or down from the middle (-1). */
export function yAt(
  v: number,
  max: number,
  mode: "full" | "up" | "down",
): number {
  const k = Math.min(1, Math.max(0, max > 0 ? v / max : 0));
  if (mode === "full") {
    return PLOT_H - PAD - k * (PLOT_H - 2 * PAD);
  }
  const half = PLOT_H / 2;
  const reach = half - PAD;
  return mode === "up" ? half - k * reach : half + k * reach;
}

/** Readings further apart than this are not joined: a pause is a gap, never a guess. */
const JOIN_MS = EVERY_MS * 2.5;

/** The runs of joined points: a missing value or a long pause starts a new run. */
export function runsOf(points: readonly Point[]): { t: number; v: number }[][] {
  const runs: { t: number; v: number }[][] = [];
  let run: { t: number; v: number }[] = [];
  let prev: number | null = null;
  for (const p of points) {
    if (p.v === null || (prev !== null && p.t - prev > JOIN_MS)) {
      if (run.length > 0) {
        runs.push(run);
      }
      run = [];
    }
    if (p.v !== null) {
      run.push({ t: p.t, v: p.v });
    }
    prev = p.t;
  }
  if (run.length > 0) {
    runs.push(run);
  }
  return runs;
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** The line through the points, one subpath per run: a pause or a missing value is a gap. */
export function linePath(
  points: readonly Point[],
  last: number,
  max: number,
  mode: "full" | "up" | "down" = "full",
): string {
  return runsOf(points)
    .map((run) => {
      const first = run[0];
      if (first === undefined) {
        return "";
      }
      if (run.length === 1) {
        // One reading on its own (after a pause) is drawn as one interval wide, never a dot.
        const x = xAt(first.t, last);
        const y = f1(yAt(first.v, max, mode));
        return `M${f1(x - (EVERY_MS / WINDOW_MS) * PLOT_W)} ${y}H${f1(x)}`;
      }
      return run
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"}${f1(xAt(p.t, last))} ${f1(yAt(p.v, max, mode))}`,
        )
        .join("");
    })
    .join("");
}

/** The area under the line, closed to its baseline, for the `trace-area` fill. */
export function areaPath(
  points: readonly Point[],
  last: number,
  max: number,
): string {
  const base = f1(PLOT_H - PAD);
  return runsOf(points)
    .filter((run) => run.length > 1)
    .map((run) => {
      const first = run[0];
      const end = run.at(-1);
      if (first === undefined || end === undefined) {
        return "";
      }
      const line = run
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"}${f1(xAt(p.t, last))} ${f1(yAt(p.v, max, "full"))}`,
        )
        .join("");
      return `${line}L${f1(xAt(end.t, last))} ${base}L${f1(xAt(first.t, last))} ${base}Z`;
    })
    .join("");
}

/** The newest value's height as a share of the plot from its top, for a label beside the line's end. */
export function endShare(
  v: number,
  max: number,
  mode: "full" | "up" | "down" = "full",
): number {
  return yAt(v, max, mode) / PLOT_H;
}

/**
 * Two labels beside the ends of two lines, kept at least `gap` (a share of the plot's height) apart
 * and inside the plot, so they never sit on each other.
 */
export function spread(a: number, b: number, gap: number): [number, number] {
  if (Math.abs(a - b) >= gap) {
    return [a, b];
  }
  const mid = (a + b) / 2;
  const lo = Math.min(1 - gap, Math.max(0, mid - gap / 2));
  return a <= b ? [lo, lo + gap] : [lo + gap, lo];
}

// ─── Disk temperatures ────────────────────────────────────────────────────────────────────────

/** The fields of a DiskMgmt.getList row the temperature charts read. */
export type DiskRead = Pick<
  DiskDevice,
  "devicename" | "temperature" | "powermode"
>;

export interface TempFixture {
  read: DiskRead;
  /** For the marker's shape only: from DiskMgmt.getList `devicename` and Smart's device details. */
  kind: "hdd" | "ssd" | "nvme";
  /** Smart.getDeviceSettings `tempmax`; 0 uses the setting for every disk. */
  tempmax: number;
}

export interface DiskTemp {
  device: string;
  kind: TempFixture["kind"];
  /** Degrees Celsius; null when the disk reports none or is asleep. */
  c: number | null;
  asleep: boolean;
  /** The alert limit for this disk; null when none is set. */
  limit: number | null;
}

/** DiskMgmt.getList's `temperature` is text or a whole number; the empty string is unknown. */
export function celsiusOf(value: number | string): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (!/^-?\d+(\.\d+)?$/u.test(value.trim())) {
    return null;
  }
  return Number(value);
}

export function tempOf(
  f: TempFixture,
  settings: Pick<SmartSettings, "tempmax">,
): DiskTemp {
  const asleep = f.read.powermode === "STANDBY" || f.read.powermode === "SLEEP";
  const limit =
    f.tempmax > 0 ? f.tempmax : settings.tempmax > 0 ? settings.tempmax : null;
  return {
    device: f.read.devicename,
    kind: f.kind,
    c: asleep ? null : celsiusOf(f.read.temperature),
    asleep,
    limit,
  };
}

/** The one alert limit every read disk shares, or null when there is none or they differ. */
export function sharedLimit(disks: readonly DiskTemp[]): number | null {
  const limits = new Set(disks.filter((d) => d.c !== null).map((d) => d.limit));
  if (limits.size !== 1) {
    return null;
  }
  const [only] = limits;
  return only ?? null;
}

/** A scale in steps of 5 °C round the readings and the limit, with room either side. */
export function tempScale(
  disks: readonly DiskTemp[],
  limit: number | null,
): { lo: number; hi: number; ticks: number[] } {
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

/**
 * Rows for labels along a scale so none overlaps the one before it in its row: each label goes in
 * the first row where it fits. Positions and widths in pixels.
 */
export function labelRows(
  items: readonly { x: number; width: number }[],
  gap = 8,
): number[] {
  const order = items
    .map((item, i) => ({ ...item, i }))
    .sort((a, b) => a.x - b.x);
  const ends: number[] = [];
  const rows = Array.from({ length: items.length }, () => 0);
  for (const item of order) {
    const start = item.x - item.width / 2;
    let row = ends.findIndex((end) => end + gap <= start);
    if (row === -1) {
      row = ends.length;
      ends.push(0);
    }
    ends[row] = item.x + item.width / 2;
    rows[item.i] = row;
  }
  return rows;
}

/** The lab's Smart.getSettings: the admin asked to hear when a disk reaches 45 °C. */
export const SMART_SETTINGS: Pick<SmartSettings, "tempmax"> = { tempmax: 45 };

/** The lab's DiskMgmt.getList, the dashboard lab's bay; sdd is asleep, so it has no reading. */
export const DISKS: readonly TempFixture[] = [
  {
    read: { devicename: "nvme0n1", temperature: "34", powermode: "UNKNOWN" },
    kind: "nvme",
    tempmax: 0,
  },
  {
    read: { devicename: "sda", temperature: "36", powermode: "ACTIVE or IDLE" },
    kind: "hdd",
    tempmax: 0,
  },
  {
    read: { devicename: "sdb", temperature: "35", powermode: "ACTIVE or IDLE" },
    kind: "hdd",
    tempmax: 0,
  },
  {
    read: { devicename: "sdc", temperature: "37", powermode: "ACTIVE or IDLE" },
    kind: "hdd",
    tempmax: 0,
  },
  {
    read: { devicename: "sdd", temperature: "", powermode: "STANDBY" },
    kind: "hdd",
    tempmax: 0,
  },
  {
    read: { devicename: "sde", temperature: 31, powermode: "ACTIVE or IDLE" },
    kind: "ssd",
    tempmax: 0,
  },
];

/** A temperature with its unit: "36 °C". */
export function celsius(c: number): string {
  return `${String(c)}${NBSP}°C`;
}

/** "sda, sdb and sdc". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}
