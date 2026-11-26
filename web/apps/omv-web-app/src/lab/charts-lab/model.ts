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
//   with the alert limit from Smart.getSettings `tempmax` and Smart.getDeviceSettings `tempmax`;
// - the groups of disks: MdMgmt.enumerateDevices, Zfs.getPoolStatus and Zfs.getPoolDevices, matched
//   to DiskMgmt.getList `canonicaldevicefile` and `devicelinks` (see "The groups" below).
// A history is only what this page read: it starts empty and is never filled in backwards.
import type {
  ConfiguredFilesystem,
  DiskDevice,
  MdArray,
  SmartSettings,
  ZfsPoolDevice,
  ZfsPoolStatus,
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

/** The fields of a DiskMgmt.getList row the temperatures and the groups read. */
export type DiskRead = Pick<
  DiskDevice,
  | "devicename"
  | "canonicaldevicefile"
  | "devicelinks"
  | "temperature"
  | "powermode"
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
  /** DiskMgmt.getList `canonicaldevicefile` and `devicelinks`: how a member of an array or pool is found. */
  file: string;
  links: readonly string[];
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
    file: f.read.canonicaldevicefile,
    links: f.read.devicelinks,
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

/** At or past its alert limit: only then may its level take the warning colour, with the words. */
export function overLimit(d: DiskTemp): boolean {
  return d.c !== null && d.limit !== null && d.c >= d.limit;
}

/** The drive pictures' sizes (DrivePicture.tsx): small, on the Disks page, in a key. */
export type DriveSize = "marker" | "tile" | "large";

/**
 * Each picture's size in pixels. The hard disk and the SSD keep the 3.5" to 2.5" proportion; the
 * tile hard disk's height and the tile stick's length are the temperature scale's length (56px).
 */
export const DRIVE_BOX: Record<
  DriveSize,
  Record<DriveKind, { w: number; h: number }>
> = {
  marker: {
    hdd: { w: 12, h: 15 },
    ssd: { w: 10, h: 13 },
    nvme: { w: 16, h: 6 },
  },
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

/** "5 disks". */
export function diskCount(n: number): string {
  return n === 1 ? "1 disk" : `${String(n)} disks`;
}

// ─── The groups: each array and pool, then the rest by kind ───────────────────────────────────
//
// Owner, round four: "It should also group by RAID volume." Each RAID array and each ZFS pool is a
// group of its own with its member disks; then the disks in no array or pool, by kind. A disk is in
// one group only. Where each grouping comes from:
//
// - RAID arrays: MdMgmt.enumerateDevices, one read for every array: its `devicefile`, `level`,
//   `devices` (the members as device files, a whole disk such as /dev/sdb or a partition such as
//   /dev/sdb1), `state` and `syncaction`. MdMgmt.getSlaves gives the same members one array at a
//   time, and MdMgmt.getDetail is display text, so neither is needed here. When the RAID plugin is
//   not installed the read fails with 404, which means no arrays.
// - The array's name: mdadm's `name` is empty for an array made on this NAS (contract, MdArray), so
//   the name is the `label` of the file system on the array (FileSystemMgmt.getList, matched by
//   `devicename`), else the part of mdadm's `name` after the colon, else "RAID md0", as the app's
//   RAID page calls an array.
// - ZFS pools: Zfs.getPoolStatus for every pool's `name` and `state` (it reads no member disk), and
//   Zfs.getPoolDevices once for each pool, for its members' `devicefile` (the by-id path ZFS opened
//   the disk by, often a partition of it) and `vdev` (the arrangement: "mirror-0", "raidz1-0", empty
//   for a disk directly under the pool). Zfs.listPools gives the same names with every file system
//   in them, which the groups do not need.
// - A member is found in DiskMgmt.getList by `canonicaldevicefile` (an array's member) or
//   `devicelinks` (a pool's), and a partition belongs to the disk it is on by the kernel's naming
//   (sdb1 on sdb, nvme0n1p1 on nvme0n1, by-id "…-part1" on "…"). A member that matches no disk is
//   left out. A disk with partitions in two volumes is shown in the first one only.

/** The fields of an MdMgmt.enumerateDevices row the groups read. */
export type MdRead = Pick<
  MdArray,
  "devicefile" | "name" | "level" | "devices" | "state" | "syncaction"
>;

/** One pool: its Zfs.getPoolStatus row and its Zfs.getPoolDevices list. */
export interface PoolRead {
  status: Pick<ZfsPoolStatus, "name" | "state">;
  devices: readonly Pick<ZfsPoolDevice, "devicefile" | "vdev">[];
}

export interface VolumesRead {
  /** MdMgmt.enumerateDevices; empty when there is no array or no RAID plugin. */
  arrays: readonly MdRead[];
  /** Zfs.getPoolStatus, each pool with its Zfs.getPoolDevices. */
  pools: readonly PoolRead[];
  /** FileSystemMgmt.getList `devicename` and `label`: the name of the file system on an array. */
  labels: readonly Pick<ConfiguredFilesystem, "devicename" | "label">[];
}

/** Whether a member's device file is this disk, or a partition on it, by the kernel's naming. */
export function onDisk(member: string, disk: string): boolean {
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

function isMember(member: string, d: DiskTemp): boolean {
  return [d.file, ...d.links].some((path) => onDisk(member, path));
}

/** The plain words for MdMgmt.enumerateDevices `level`, as the app's RAID pages write them. */
const RAID_LEVEL: Record<string, string> = {
  raid0: "Stripe (RAID 0)",
  raid1: "Mirror (RAID 1)",
  raid4: "Parity disk (RAID 4)",
  raid5: "Parity (RAID 5)",
  raid6: "Double parity (RAID 6)",
  raid10: "Mirror and stripe (RAID 10)",
  linear: "Joined (linear)",
};

export function raidWords(level: string): string {
  return RAID_LEVEL[level] ?? `RAID (${level})`;
}

/** An array's plain name: the file system's label, else mdadm's name after the colon, else "RAID md0". */
export function arrayName(
  a: Pick<MdRead, "devicefile" | "name">,
  labels: VolumesRead["labels"],
): string {
  const device = a.devicefile.replace(/^\/dev\//u, "");
  const label = labels.find((l) => l.devicename === device)?.label;
  if (label !== undefined && label !== null && label !== "") {
    return label;
  }
  const own = a.name.split(":").at(-1) ?? "";
  return own !== "" ? own : `RAID ${device}`;
}

const ZFS_LAYOUT: Record<string, string> = {
  mirror: "mirror",
  raidz1: "RAID-Z1",
  raidz2: "RAID-Z2",
  raidz3: "RAID-Z3",
  draid: "dRAID",
};

/**
 * A pool's arrangement in words, from Zfs.getPoolDevices `vdev`: "mirror", "RAID-Z1", "single disk"
 * or "stripe" for disks directly under the pool. A disk being replaced sits in a "replacing-1" group
 * inside its mirror, so those groups are not an arrangement of their own.
 */
export function poolLayout(devices: PoolRead["devices"]): string {
  const groups = new Set(
    devices
      .map((d) => d.vdev)
      .filter((v) => v !== "" && !/^(replacing|spare)/u.test(v)),
  );
  if (groups.size === 0) {
    return devices.length === 1 ? "single disk" : "stripe";
  }
  const kinds = new Set(
    [...groups].map((g) => {
      const kind = g.replace(/-\d+$/u, "").replace(/^draid.*/u, "draid");
      return ZFS_LAYOUT[kind] ?? kind;
    }),
  );
  const words = [...kinds].join(" and ");
  return groups.size === 1 ? words : `${words}, ${String(groups.size)} groups`;
}

export interface VolumeState {
  tone: "warning" | "critical";
  words: string;
}

/**
 * What an array is doing, when it needs saying: MdMgmt.enumerateDevices `syncaction` "recover" is a
 * rebuild, and "degraded" in `state` is an array short of a disk. Otherwise nothing.
 */
export function arrayState(
  a: Pick<MdRead, "state" | "syncaction">,
): VolumeState | null {
  if (a.syncaction === "recover") {
    return { tone: "warning", words: "Rebuilding" };
  }
  if (typeof a.state === "string" && /\bdegraded\b/u.test(a.state)) {
    return { tone: "warning", words: "A disk is missing or has failed" };
  }
  return null;
}

/** A pool's state, when it needs saying: Zfs.getPoolStatus `state`, and a disk being replaced. */
export function poolState(p: PoolRead): VolumeState | null {
  if (p.status.state === "ONLINE") {
    return null;
  }
  if (p.status.state === "DEGRADED") {
    return p.devices.some((d) => d.vdev.startsWith("replacing"))
      ? { tone: "warning", words: "Rebuilding" }
      : { tone: "warning", words: "A disk is missing or has failed" };
  }
  return { tone: "critical", words: "Cannot be used now" };
}

export interface DiskGroup {
  /** "md:/dev/md0", "zfs:tank" or "kind:hdd". */
  id: string;
  /** "Backup, Mirror (RAID 1)", "tank, ZFS pool (mirror)" or "Hard disks". */
  title: string;
  /** The read the group comes from: an array, a pool, or the disks in neither, by kind. */
  from: "md" | "zfs" | "kind";
  /** What the array or pool is doing, when it needs saying. */
  state: VolumeState | null;
  /** In device order. */
  disks: DiskTemp[];
}

const byDevice = new Intl.Collator("en", { numeric: true });

const inDeviceOrder = (list: readonly DiskTemp[]) =>
  [...list].sort((a, b) => byDevice.compare(a.device, b.device));

const KIND_ORDER: readonly DriveKind[] = ["hdd", "ssd", "nvme"];

const KIND_TITLE: Record<DriveKind, string> = {
  hdd: "Hard disks",
  ssd: "SSDs",
  nvme: "NVMe SSDs, on the mainboard",
};

/** The kind's name, as the drive sheet writes it. */
export const KIND_NAME: Record<DriveKind, string> = {
  hdd: "Hard disk",
  ssd: "SSD",
  nvme: "NVMe SSD",
};

/**
 * Each array (in device order), then each pool (by name), each with the disks it is made of; then
 * the disks in no array or pool, by kind: hard disks, SSDs, NVMe SSDs. Every disk is in exactly one
 * group, in device order within it, and a group with no disk is left out.
 */
export function diskGroups(
  disks: readonly DiskTemp[],
  volumes: VolumesRead,
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
    .map((a): DiskGroup => ({
      id: `md:${a.devicefile}`,
      title: `${arrayName(a, volumes.labels)}, ${raidWords(a.level)}`,
      from: "md",
      state: arrayState(a),
      disks: take(a.devices),
    }));
  const pools = [...volumes.pools]
    .sort((a, b) => byDevice.compare(a.status.name, b.status.name))
    .map((p): DiskGroup => ({
      id: `zfs:${p.status.name}`,
      title: `${p.status.name}, ZFS pool (${poolLayout(p.devices)})`,
      from: "zfs",
      state: poolState(p),
      disks: take(p.devices.map((d) => d.devicefile)),
    }));
  const rest = KIND_ORDER.map((kind): DiskGroup => ({
    id: `kind:${kind}`,
    title: KIND_TITLE[kind],
    from: "kind",
    state: null,
    disks: inDeviceOrder(
      disks.filter((d) => d.kind === kind && !placed.has(d.device)),
    ),
  }));
  return [...arrays, ...pools, ...rest].filter((g) => g.disks.length > 0);
}

// ─── On the dashboard: the groups that need the person, and the rest behind a disclosure ──────
//
// The dashboard answers "does anything need me?", and the Disks page shows every disk. So on the
// dashboard, up to DASHBOARD_ALL disks are all shown; past that, the groups with a disk at or over
// its alert limit are shown whole, the others are summed up in one sentence (how many, and the
// range they are in), and "Show the other 16 disks" opens them in place. A disk over its limit is
// never behind the disclosure.

/** Up to this many disks, the dashboard shows them all. */
export const DASHBOARD_ALL = 8;

export interface DashboardSplit {
  shown: DiskGroup[];
  rest: DiskGroup[];
}

export function dashboardSplit(groups: readonly DiskGroup[]): DashboardSplit {
  const total = groups.reduce((n, g) => n + g.disks.length, 0);
  if (total <= DASHBOARD_ALL) {
    return { shown: [...groups], rest: [] };
  }
  return {
    shown: groups.filter((g) => g.disks.some(overLimit)),
    rest: groups.filter((g) => !g.disks.some(overLimit)),
  };
}

/**
 * The sentence for the disks behind the disclosure: "The other 16 disks are between 31 °C and 43 °C,
 * under the alert limit of 45 °C." A disk asleep or unread is not counted as being in the range.
 */
export function restWords(
  rest: readonly DiskTemp[],
  all: boolean,
  limit: number | null,
): string {
  const read = rest.flatMap((d) => (d.c === null ? [] : [d.c]));
  const n = rest.length;
  const which = all ? `the ${diskCount(n)}` : `the other ${diskCount(n)}`;
  const under =
    limit === null ? "" : `, under the alert limit of ${celsius(limit)}`;
  if (read.length === 0) {
    return `None of ${which} has a temperature reading.`;
  }
  const lo = Math.min(...read);
  const hi = Math.max(...read);
  const range =
    lo === hi
      ? `at ${celsius(lo)}`
      : `between ${celsius(lo)} and ${celsius(hi)}`;
  if (read.length === n) {
    const subject = all ? `All ${diskCount(n)}` : `The other ${diskCount(n)}`;
    return n === 1
      ? `${subject} is ${range}${under}.`
      : `${subject} are ${range}${under}.`;
  }
  return `${String(read.length)} of ${which} ${read.length === 1 ? "is" : "are"} ${range}${under}.`;
}

// ─── The lab's NAS ────────────────────────────────────────────────────────────────────────────

/** The lab's Smart.getSettings: the admin asked to hear when a disk reaches 45 °C. */
export const SMART_SETTINGS: Pick<SmartSettings, "tempmax"> = { tempmax: 45 };

const BY_ID: Record<DriveKind, string> = {
  hdd: "ata-EXAMPLE_Hard_Disk",
  ssd: "ata-EXAMPLE_SSD",
  nvme: "nvme-EXAMPLE_NVMe_SSD",
};

/** A DiskMgmt.getList row; `serial` makes its by-id link, scrubbed as the captures are. */
function listDisk(
  devicename: string,
  temperature: string | number,
  kind: DriveKind,
  serial: number,
): TempFixture {
  const asleep = temperature === "";
  return {
    read: {
      devicename,
      canonicaldevicefile: `/dev/${devicename}`,
      devicelinks: [
        `/dev/disk/by-id/${BY_ID[kind]}_EXAMPLE-SERIAL-${String(serial).padStart(4, "0")}`,
      ],
      temperature,
      powermode: asleep
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
 * The lab's DiskMgmt.getList, the dashboard lab's six disks: sdb and sdc make the Backup mirror and
 * sdd the pool tank, as on the dashboard. sdd is asleep, so it has no reading.
 */
export const DISKS: readonly TempFixture[] = [
  listDisk("nvme0n1", "34", "nvme", 1),
  listDisk("sda", "36", "hdd", 2),
  listDisk("sdb", "35", "hdd", 3),
  listDisk("sdc", "37", "hdd", 4),
  listDisk("sdd", "", "hdd", 5),
  listDisk("sde", 31, "ssd", 6),
];

/** A pool member as Zfs.getPoolDevices names it: the disk's by-id link and the partition ZFS made. */
function zfsMember(list: readonly TempFixture[], device: string, vdev: string) {
  const link = list.find((f) => f.read.devicename === device)?.read
    .devicelinks[0];
  if (link === undefined) {
    throw new Error(`no disk ${device}`);
  }
  return { devicefile: `${link}-part1`, vdev };
}

function md(
  devicefile: string,
  level: string,
  devices: string[],
  state = "clean",
  syncaction = "idle",
): MdRead {
  return { devicefile, name: "", level, devices, state, syncaction };
}

/** The labels of the file systems on the arrays, from FileSystemMgmt.getList (FILE_SYSTEMS). */
const LABELS = FILE_SYSTEMS.map((f) => ({
  devicename: f.read.devicename,
  label: f.read.label,
}));

/**
 * The six disks' arrays and pools, as the dashboard lab has them: MdMgmt.enumerateDevices lists the
 * Backup mirror md0 of sdb and sdc, and Zfs.getPoolStatus the pool tank, on sdd alone.
 */
export const VOLUMES: VolumesRead = {
  arrays: [md("/dev/md0", "raid1", ["/dev/sdb", "/dev/sdc"])],
  pools: [
    {
      status: { name: "tank", state: "ONLINE" },
      devices: [zfsMember(DISKS, "sdd", "")],
    },
  ],
  labels: LABELS,
};

/**
 * A 24-disk DiskMgmt.getList, in device order: two NVMe sticks and 22 drives, two of them SSDs. sdi
 * and sdu are asleep, and sdt is past the 45 °C limit.
 */
export const DISKS_24: readonly TempFixture[] = [
  ["nvme0n1", "41", "nvme"],
  ["nvme1n1", "43", "nvme"],
  ["sda", "34"],
  ["sdb", "35"],
  ["sdc", "35"],
  ["sdd", "36"],
  ["sde", "35"],
  ["sdf", "37"],
  ["sdg", "36"],
  ["sdh", "34"],
  ["sdi", ""],
  ["sdj", "38"],
  ["sdk", "35"],
  ["sdl", "36"],
  ["sdm", "37"],
  ["sdn", "39"],
  ["sdo", "35"],
  ["sdp", "36"],
  ["sdq", "33", "ssd"],
  ["sdr", "34"],
  ["sds", "37"],
  ["sdt", "46"],
  ["sdu", ""],
  ["sdv", "31", "ssd"],
].map(([name, temperature, kind], i) =>
  listDisk(
    name ?? "",
    temperature ?? "",
    (kind ?? "hdd") as DriveKind,
    101 + i,
  ),
);

/**
 * The 24 disks' arrays and pools: the Backup mirror md0 of sdb and sdc, as on the six-disk NAS; the
 * Apps mirror md1 of the two NVMe sticks, on a partition each; the Archive md2, a double parity
 * array of sdf to sdn without sdi, on a partition each and rebuilding, on purpose, to show how a
 * group says so; and the pool tank, a mirror of sdd and sde. The other ten disks are in none.
 */
export const VOLUMES_24: VolumesRead = {
  arrays: [
    md("/dev/md0", "raid1", ["/dev/sdb", "/dev/sdc"]),
    md("/dev/md1", "raid1", ["/dev/nvme0n1p1", "/dev/nvme1n1p1"]),
    md(
      "/dev/md2",
      "raid6",
      ["sdf", "sdg", "sdh", "sdj", "sdk", "sdl", "sdm", "sdn"].map(
        (d) => `/dev/${d}1`,
      ),
      "clean, degraded, recovering (31.2% (1219571712/3906886144) finish=312.4min speed=143290K/sec)",
      "recover",
    ),
  ],
  pools: [
    {
      status: { name: "tank", state: "ONLINE" },
      devices: [
        zfsMember(DISKS_24, "sdd", "mirror-0"),
        zfsMember(DISKS_24, "sde", "mirror-0"),
      ],
    },
  ],
  labels: [
    ...LABELS,
    { devicename: "md1", label: "Apps" },
    { devicename: "md2", label: "Archive" },
  ],
};

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
