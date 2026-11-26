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

// ─── The waffle ───────────────────────────────────────────────────────────────────────────────
//
// Squares that each stand for a fixed share of the drive, filled a column at a time from the left
// and each column from the bottom, so the picture still reads as "more to the right". Every column
// is 5 % at every size (5 squares of 1 %, or 2 of 2.5 % in a table cell), so OMV's default mark of
// 85 % falls between two columns. A mark between columns splits its column: the gap steps round the
// squares before it.

/** How many squares across and up. */
export interface WaffleShape {
  cols: number;
  rows: number;
}

export interface Square {
  /** The column, from the left. */
  col: number;
  /** The row, from the bottom. */
  row: number;
  /** How much of it is used, 0 to 1: the last used square is filled in part, nothing is rounded. */
  fill: number;
  /** It lies past the admin's mark. */
  past: boolean;
}

export interface WaffleMark {
  /** The admin's mark, percent. */
  value: number;
  /** How many squares lie before it: the mark at the nearest square boundary. */
  at: number;
  /** The column it falls in, and how many of that column's squares (from the bottom) are before it. */
  col: number;
  j: number;
}

export interface WaffleModel {
  squares: Square[];
  /** What one square stands for, percent. */
  share: number;
  mark: WaffleMark | null;
}

export function waffleOf(
  used: number,
  mark: number | null,
  shape: WaffleShape,
): WaffleModel {
  const count = shape.cols * shape.rows;
  const share = 100 / count;
  const at =
    mark === null
      ? null
      : Math.min(count, Math.max(0, Math.round(mark / share)));
  const squares = Array.from({ length: count }, (_, i) => ({
    col: Math.floor(i / shape.rows),
    row: i % shape.rows,
    fill: Math.min(1, Math.max(0, used / share - i)),
    past: at !== null && i >= at,
  }));
  return {
    squares,
    share,
    mark:
      at === null || mark === null
        ? null
        : {
            value: mark,
            at,
            col: Math.floor(at / shape.rows),
            j: at % shape.rows,
          },
  };
}

/** A waffle's drawing size in pixels: the square, the gap, the wider gap at the mark, the overhang. */
export interface WaffleSize {
  sq: number;
  gap: number;
  /** How much wider the gap at the mark is than the others. */
  wide: number;
  /** How far the mark's rule reaches past the squares, above and below. */
  ext: number;
}

export interface WaffleDrawing {
  width: number;
  height: number;
  /** Each square's top left corner, in the order of `squares`. */
  at: { x: number; y: number }[];
  /** The rule in the gap at the mark: straight between two columns, or stepping round a split one. */
  rule: string | null;
  /** Where the rule meets the top, for the mark's value written above it. */
  ruleX: number | null;
}

/**
 * Where everything sits. The squares past the mark move right by `wide`, which opens the gap; when
 * the mark splits a column, the top of that column moves with them and the gap steps.
 */
export function waffleDrawing(
  model: WaffleModel,
  shape: WaffleShape,
  size: WaffleSize,
): WaffleDrawing {
  const { sq, gap, wide, ext } = size;
  const pitch = sq + gap;
  const shift = model.mark === null ? 0 : wide;
  const width = shape.cols * pitch - gap + shift;
  const height = shape.rows * pitch - gap + 2 * ext;
  const at = model.squares.map((s) => ({
    x: s.col * pitch + (s.past ? shift : 0),
    y: ext + (shape.rows - 1 - s.row) * pitch,
  }));
  const m = model.mark;
  if (m === null) {
    return { width, height, at, rule: null, ruleX: null };
  }
  const top = m.col * pitch + (wide - gap) / 2;
  const f = (n: number) => (Math.round(n * 100) / 100).toString();
  if (m.j === 0) {
    return {
      width,
      height,
      at,
      rule: `M${f(top)} 0V${f(height)}`,
      ruleX: top,
    };
  }
  const bottom = m.col * pitch + sq + (gap + wide) / 2;
  const step = ext + (shape.rows - m.j) * pitch - gap / 2;
  return {
    width,
    height,
    at,
    rule: `M${f(top)} 0V${f(step)}H${f(bottom)}V${f(height)}`,
    ruleX: top,
  };
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
 * tank) and an SSD past its mark. OMV's default warning mark is 85 %; tank's admin turned it off, and
 * Backup's moved it to 88 %.
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
      // The admin moved this one's mark, so it falls inside a column and the gap steps.
      usagewarnthreshold: 88,
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

/**
 * The smallest scale a half of the network chart takes, so a trickle of 0.1 MiB/s still stands
 * clear of the baseline (a tenth of the half's height) instead of lying on it.
 */
export const MIN_RATE_SCALE = 1;

/**
 * One half of the mirrored network chart: its own scale, from the readings this page holds, rounded
 * up to 1, 2 or 5 times a power of ten, and never under MIN_RATE_SCALE. In and out are scaled
 * apart, so a copy in at 90 MiB/s does not flatten the 1 MiB/s going out.
 */
export function rateScale(points: readonly Point[]): number {
  return niceMax(rangeOf(points)?.max ?? 0, MIN_RATE_SCALE);
}

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

/** A disk's kind, for its picture and its group only. */
export type DriveKind = "hdd" | "ssd" | "nvme";

export interface TempFixture {
  read: DiskRead;
  /**
   * For the picture and the group only: an NVMe SSD from DiskMgmt.getList `devicename`, an SSD or
   * a hard disk from Smart.getInformation `rotationrate` ("Solid State Device" or a speed in rpm).
   */
  kind: DriveKind;
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

/** At or past its alert limit: only then may its mark take the warning colour, with the words. */
export function overLimit(d: DiskTemp): boolean {
  return d.c !== null && d.limit !== null && d.c >= d.limit;
}

// ─── Along one scale, stacked ─────────────────────────────────────────────────────────────────
//
// SMART reports whole degrees, so several disks often share one. Disks at the same degree stack
// upward into a column, one marker each (the disk's picture at marker size), so the spread reads
// like a histogram and no marker hides another. A column of up to three names its disks above it; a
// taller one says how many and names them on pointer or focus. The hottest column always names its
// disks. Everything here is in pixels, with y measured up from the axis.

/**
 * Each kind's marker, in pixels: a 3.5" hard disk upright, a smaller 2.5" SSD upright, and an M.2
 * stick lying down. None is wider than MARKER_W or taller than the pitch leaves room for.
 */
export const MARKER_BOX: Record<DriveKind, { w: number; h: number }> = {
  hdd: { w: 12, h: 15 },
  ssd: { w: 10, h: 13 },
  nvme: { w: 16, h: 6 },
};
export const MARKER_W = 16;
/** The step between two markers in a column: 3px clear above the tallest. */
export const MARKER_PITCH = 18;

/** The drive pictures' sizes (DrivePicture.tsx): on the scale, on the Disks page, in a key. */
export type DriveSize = "marker" | "tile" | "large";

/**
 * Each picture's size in pixels. The hard disk and the SSD keep the 3.5" to 2.5" proportion; the
 * tile hard disk's height and the tile stick's length are the by-kind view's scale (56px).
 */
export const DRIVE_BOX: Record<
  DriveSize,
  Record<DriveKind, { w: number; h: number }>
> = {
  marker: MARKER_BOX,
  tile: {
    hdd: { w: 40, h: 56 },
    ssd: { w: 29, h: 40 },
    nvme: { w: 56, h: 16 },
  },
  large: {
    hdd: { w: 52, h: 72 },
    ssd: { w: 37, h: 52 },
    nvme: { w: 88, h: 24 },
  },
};

/** The disks read at one whole degree, in device order. */
export interface Stack {
  c: number;
  disks: DiskTemp[];
}

/** The read disks by whole degree, coolest first; a sleeping or unread disk is in none. */
export function stacksOf(disks: readonly DiskTemp[]): Stack[] {
  const by = new Map<number, DiskTemp[]>();
  for (const d of disks) {
    if (d.c === null) {
      continue;
    }
    const c = Math.round(d.c);
    by.set(c, [...(by.get(c) ?? []), d]);
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, list]) => ({ c, disks: list }));
}

/** A degree either side of the readings and the limit, and at least 12 degrees across. */
export function stackRange(
  stacks: readonly Stack[],
  limit: number | null,
): { lo: number; hi: number } {
  const all = [...stacks.map((s) => s.c), ...(limit === null ? [] : [limit])];
  if (all.length === 0) {
    return { lo: 20, hi: 50 };
  }
  let lo = Math.floor(Math.min(...all)) - 1;
  let hi = Math.ceil(Math.max(...all)) + 1;
  while (hi - lo < 12) {
    lo -= 1;
    if (hi - lo < 12) {
      hi += 1;
    }
  }
  return { lo, hi };
}

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

export interface StackLabel {
  /** The names, one a line; or the count, which names them on pointer or focus. */
  kind: "names" | "count";
  lines: string[];
  box: Box;
  /** Lifted clear of its neighbours, so a leader joins it to its column. */
  leader: boolean;
}

export interface PlacedStack extends Stack {
  x: number;
  /** Each marker's centre, bottom first, in the order of `disks`. */
  markers: { x: number; y: number }[];
  /** The top of the column. */
  top: number;
  label: StackLabel;
}

export interface StackLayout {
  width: number;
  /** The height above the axis that the columns and their labels need. */
  height: number;
  /**
   * The widest marker, the step between two markers in a column, and the markers' scale: 1, the
   * size they are drawn for, unless the degrees are closer than a marker is wide.
   */
  m: number;
  pitch: number;
  k: number;
  stacks: PlacedStack[];
  /** The degrees written under the axis: every column's, unless two would touch. */
  axis: { c: number; x: number }[];
  /** Where a temperature sits across the chart. */
  x0: number;
  perDegree: number;
}

/** Room at either end so a marker on the first or last degree is whole. */
const STACK_PAD = 14;
/** Roboto Mono at 12px is about this wide a character; the labels are sized from it. */
export const NAME_PX = 7.3;
const LINE_PX = 15;

function labelSize(lines: readonly string[], kind: StackLabel["kind"]) {
  const longest = Math.max(...lines.map((l) => l.length));
  return kind === "count"
    ? { w: longest * 7.2 + 18, h: 22 }
    : { w: longest * NAME_PX + 8, h: lines.length * LINE_PX + 2 };
}

/** "5 disks". */
export function diskCount(n: number): string {
  return n === 1 ? "1 disk" : `${String(n)} disks`;
}

export function stackLayout(
  stacks: readonly Stack[],
  { width, lo, hi }: { width: number; lo: number; hi: number },
): StackLayout {
  const perDegree = (width - 2 * STACK_PAD) / Math.max(1, hi - lo);
  // A pixel clear between the widest markers of two neighbouring degrees.
  const k = Math.min(1, Math.max(0.3, (perDegree - 1) / MARKER_W));
  const m = MARKER_W * k;
  const pitch = MARKER_PITCH * k;
  const xOf = (c: number) => STACK_PAD + (c - lo) * perDegree;
  const hottest = stacks.at(-1)?.c ?? null;
  const columns = stacks.map((s) => {
    const x = xOf(s.c);
    const markers = s.disks.map((_, i) => ({
      x,
      y: 2 + pitch / 2 + i * pitch,
    }));
    return { ...s, x, markers, top: 2 + s.disks.length * pitch };
  });
  // Every column's markers are in the way of every label.
  const obstacles: Box[] = columns.map((s) => ({
    x1: s.x - m / 2 - 2,
    y1: 0,
    x2: s.x + m / 2 + 2,
    y2: s.top + 2,
  }));
  const placed: Box[] = [];
  const labels = new Map<number, StackLabel>();
  const done = new Set<number>();
  // The hottest first, so it sits on its column, then left to right.
  const order = [...columns].sort((a, b) =>
    a.c === hottest ? -1 : b.c === hottest ? 1 : a.x - b.x,
  );
  for (const s of order) {
    const kind: StackLabel["kind"] =
      s.disks.length <= 3 || s.c === hottest ? "names" : "count";
    const lines =
      kind === "names"
        ? s.disks.map((d) => d.device)
        : [diskCount(s.disks.length)];
    const { w, h } = labelSize(lines, kind);
    const inside = (x: number) =>
      Math.min(Math.max(0, x), Math.max(0, width - w));
    // Centred on its column, or slid to one side while it still covers its column, so a wide
    // count can stay clear of a neighbour's column.
    const xs = [
      inside(s.x - w / 2),
      inside(s.x - w + 6),
      inside(s.x - 6),
    ].filter((x, i, all) => all.indexOf(x) === i);
    const base = s.top + 4;
    const ys = [
      base,
      ...obstacles.map((o) => o.y2 + 4),
      ...placed.map((p) => p.y1 - h - 4),
    ]
      .filter((y) => y >= base)
      .sort((a, b) => a - b);
    // The space above a column whose label is still to come, where its leader may need to run.
    const open = columns
      .filter((o) => o.c !== s.c && !done.has(o.c))
      .map((o) => ({ x1: o.x - 1, y1: o.top, x2: o.x + 1, y2: Infinity }));
    const fits = (x: number, y: number, keepOpen: boolean) => {
      const box = { x1: x, y1: y, x2: x + w, y2: y + h };
      if (obstacles.some((o) => overlaps(o, box))) {
        return false;
      }
      if (keepOpen && open.some((o) => overlaps(o, box))) {
        return false;
      }
      const leader = { x1: s.x - 0.5, y1: s.top, x2: s.x + 0.5, y2: y };
      return y <= base || !placed.some((p) => overlaps(p, leader));
    };
    const find = (keepOpen: boolean) => {
      for (const y of ys) {
        const x = xs.find((xx) => fits(xx, y, keepOpen));
        if (x !== undefined) {
          return { x, y };
        }
      }
      return undefined;
    };
    const spot = (s.c === hottest ? undefined : find(true)) ??
      find(false) ?? {
        x: xs[0] ?? 0,
        y: Math.max(...obstacles.map((o) => o.y2)) + 4,
      };
    const box = { x1: spot.x, y1: spot.y, x2: spot.x + w, y2: spot.y + h };
    placed.push(box);
    obstacles.push(box);
    if (spot.y > base) {
      obstacles.push({ x1: s.x - 1, y1: s.top, x2: s.x + 1, y2: spot.y });
    }
    done.add(s.c);
    labels.set(s.c, { kind, lines, box, leader: spot.y > base });
  }
  const placedStacks = columns.map((s) => {
    const label = labels.get(s.c);
    if (!label) {
      throw new Error(`no label for ${String(s.c)}`);
    }
    return { ...s, label };
  });
  // The degrees under the axis, the hottest first, each at least 16px from the next.
  const axis: { c: number; x: number }[] = [];
  for (const s of order) {
    if (axis.every((a) => Math.abs(a.x - s.x) >= 16)) {
      axis.push({ c: s.c, x: s.x });
    }
  }
  axis.sort((a, b) => a.x - b.x);
  const height = Math.max(
    24,
    ...placedStacks.map((s) => Math.max(s.top, s.label.box.y2)),
  );
  return {
    width,
    height: height + 4,
    m,
    pitch,
    k,
    stacks: placedStacks,
    axis,
    x0: STACK_PAD - lo * perDegree,
    perDegree,
  };
}

// ─── By kind ──────────────────────────────────────────────────────────────────────────────────
//
// DiskMgmt.getList does not say which physical slot a disk is in, and an NVMe SSD normally sits on
// the mainboard rather than in a drive bay. So the Disks page groups the disks by kind and keeps
// device order within a group, and claims nothing about where a disk sits in the case.

/** The kind's name, as the key and the page write it. */
export const KIND_NAME: Record<DriveKind, string> = {
  hdd: "Hard disk",
  ssd: "SSD",
  nvme: "NVMe SSD",
};

const KIND_PLURAL: Record<DriveKind, string> = {
  hdd: "hard disks",
  ssd: "SSDs",
  nvme: "NVMe SSDs",
};

const KIND_ORDER: readonly DriveKind[] = ["hdd", "ssd", "nvme"];

export interface KindGroup {
  kind: DriveKind;
  title: string;
  disks: DiskTemp[];
}

const byDevice = new Intl.Collator("en", { numeric: true });

/** The disks by kind, hard disks first, each group in device order; a kind with no disk is left out. */
export function kindGroups(disks: readonly DiskTemp[]): KindGroup[] {
  const titles: Record<DriveKind, string> = {
    hdd: "Hard disks",
    ssd: "SSDs",
    nvme: "NVMe SSDs, on the mainboard",
  };
  return KIND_ORDER.flatMap((kind) => {
    const list = disks
      .filter((d) => d.kind === kind)
      .sort((a, b) => byDevice.compare(a.device, b.device));
    return list.length === 0
      ? []
      : [{ kind, title: titles[kind], disks: list }];
  });
}

/**
 * The disks with their kind in words, for the text that stands in for the pictures: "the hard
 * disks sda and sdh, and the SSD sdq". Kinds in the order of the groups, devices in the given order.
 */
export function diskWords(disks: readonly DiskTemp[]): string {
  const parts = KIND_ORDER.flatMap((kind) => {
    const names = disks.filter((d) => d.kind === kind).map((d) => d.device);
    if (names.length === 0) {
      return [];
    }
    const word =
      names.length === 1
        ? KIND_NAME[kind].replace(/^Hard/u, "hard")
        : KIND_PLURAL[kind];
    return [`the ${word} ${listWords(names)}`];
  });
  if (parts.length <= 1) {
    return parts.join("");
  }
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1) ?? ""}`;
}

/** The lab's Smart.getSettings: the admin asked to hear when a disk reaches 45 °C. */
export const SMART_SETTINGS: Pick<SmartSettings, "tempmax"> = { tempmax: 45 };

/** The lab's DiskMgmt.getList, the dashboard lab's six disks; sdd is asleep, so it has no reading. */
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

function listDisk(
  devicename: string,
  temperature: string,
  kind: TempFixture["kind"] = "hdd",
): TempFixture {
  return {
    read: {
      devicename,
      temperature,
      powermode:
        temperature === ""
          ? "STANDBY"
          : kind === "nvme"
            ? "UNKNOWN"
            : "ACTIVE or IDLE",
    },
    kind,
    tempmax: 0,
  };
}

/**
 * A 24-disk DiskMgmt.getList, in device order: two NVMe sticks and 22 drives, two of them SSDs. SMART
 * reports whole degrees, so ties are common: five disks at 35 °C, four at 36 °C, three each at 34 °C
 * and 37 °C. sdi and sdu are asleep, and sdt is past the 45 °C limit.
 */
export const DISKS_24: readonly TempFixture[] = [
  listDisk("nvme0n1", "41", "nvme"),
  listDisk("nvme1n1", "43", "nvme"),
  listDisk("sda", "34"),
  listDisk("sdb", "35"),
  listDisk("sdc", "35"),
  listDisk("sdd", "36"),
  listDisk("sde", "35"),
  listDisk("sdf", "37"),
  listDisk("sdg", "36"),
  listDisk("sdh", "34"),
  listDisk("sdi", ""),
  listDisk("sdj", "38"),
  listDisk("sdk", "35"),
  listDisk("sdl", "36"),
  listDisk("sdm", "37"),
  listDisk("sdn", "39"),
  listDisk("sdo", "35"),
  listDisk("sdp", "36"),
  listDisk("sdq", "33", "ssd"),
  listDisk("sdr", "34"),
  listDisk("sds", "37"),
  listDisk("sdt", "46"),
  listDisk("sdu", ""),
  listDisk("sdv", "31", "ssd"),
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
