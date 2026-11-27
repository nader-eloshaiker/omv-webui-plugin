// SPDX-License-Identifier: GPL-3.0-or-later
// Story and test fixtures only (never exported from an entry) for the hand-drawn charts: rows in the
// shapes the contract gives (FileSystemMgmt.getList, DiskMgmt.getList, Smart.getInformation,
// MdMgmt.enumerateDevices, Zfs.getPoolStatus and Zfs.getPoolDevices), the plain arrays of readings
// the live pair takes, and the English words a page would pass in, so the stories prove the
// components take the contract's rows through the same mapping the app does. Deterministic: a story
// looks the same on every visit. Every figure here agrees with the others (style guide 10, rule 17).
import type {
  DiskTemperaturesLabels,
  DiskTemperaturesRestLabels,
} from "../components/disk-temperatures/disk-temperatures";
import {
  diskGroups,
  diskTemperatureOf,
  type DiskGroup,
  type DiskRow,
  type DiskTemperature,
  type PoolLayout,
  type RestSummary,
  type VolumeRows,
  type VolumeState,
} from "../components/disk-temperatures/disk-temperatures-model";
import {
  driveKindOf,
  type DrivePictureKind,
} from "../components/drive-picture/drive-picture-model";
import type { LivePairProps } from "../components/live-pair/live-pair";
import {
  LIVE_INTERVAL_MS,
  LIVE_WINDOW_MS,
  type LivePoint,
  type LiveSpan,
  type LiveSummary,
} from "../components/live-pair/live-pair-model";
import type { SegmentBarProps } from "../components/segment-bar/segment-bar";
import { SEGMENT_SHARE } from "../components/segment-bar/segment-bar-model";

export const NBSP = " ";

/** "62 %": a whole percent with a non-breaking space, as the pages write it. */
export const pct = (n: number): string => `${String(Math.round(n))}${NBSP}%`;

/** "36 °C". */
export const celsius = (c: number): string => `${String(c)}${NBSP}°C`;

const UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

/** Bytes in binary units, one decimal: "1.4 TiB". */
export function bytes(n: number): string {
  let v = n;
  let u = 0;
  while (v >= 1024 && u < UNITS.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${u === 0 ? String(v) : v.toFixed(1)}${NBSP}${UNITS[u] ?? "B"}`;
}

/** "sda, sdb and sdc". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}

/** "10:31", the clock the readings were stamped with, in UTC so a story is the same everywhere. */
export function clock(t: number): string {
  const d = new Date(t);
  return `${String(d.getUTCHours())}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// ─── Space: FileSystemMgmt.getList ───────────────────────────────────────────────────────────────

/** The fields of a FileSystemMgmt.getList row a segment bar reads. */
export interface FileSystemRow {
  devicename: string;
  label: string | null;
  size: string;
  available: string;
  percentage: number;
  usagewarnthreshold?: number;
}

/**
 * The stories' file systems: the dashboard's drives, one past its mark, one with the mark moved
 * inside a segment, and one whose admin turned the mark off (0, never warn), as OMV allows.
 */
export const FILE_SYSTEMS = {
  data: {
    devicename: "sda1",
    label: "Data drive",
    size: "3958168383488",
    available: "1539316006912",
    percentage: 62,
    usagewarnthreshold: 85,
  },
  backup: {
    devicename: "md0",
    label: "Backup",
    size: "3958168383488",
    available: "2308974166016",
    percentage: 41,
    usagewarnthreshold: 88,
  },
  tank: {
    devicename: "tank",
    label: "tank",
    size: "3958168383488",
    available: "2858730078208",
    percentage: 28,
    usagewarnthreshold: 0,
  },
  media: {
    devicename: "sde1",
    label: "Media",
    size: "1000202273280",
    available: "89120571392",
    percentage: 91,
    usagewarnthreshold: 85,
  },
} as const satisfies Record<string, FileSystemRow>;

/** The segment bar's props for one row at one size, with the words a page would pass in. */
export function segmentBarArgs(
  row: FileSystemRow,
  size: NonNullable<SegmentBarProps["size"]>,
): SegmentBarProps {
  const used = Math.min(100, Math.max(0, row.percentage));
  const threshold = row.usagewarnthreshold ?? 0;
  const mark = threshold > 0 ? threshold : null;
  const over = mark !== null && used >= mark;
  const name =
    row.label !== null && row.label !== "" ? row.label : row.devicename;
  const free = bytes(Number(row.available));
  const total = bytes(Number(row.size));
  const words = [`${pct(used)} used, ${free} free of ${total}`];
  if (mark !== null) {
    words.push(`the warning mark is at ${pct(mark)}`);
  }
  if (over) {
    words.push("almost full");
  }
  const share = String(SEGMENT_SHARE);
  return {
    "aria-label": `${name}: space used`,
    value: used,
    mark,
    markLabel:
      mark === null
        ? undefined
        : size === "page"
          ? `Warning at ${pct(mark)}`
          : pct(mark),
    threshold: over ? { status: "warning", label: "Almost full" } : undefined,
    valueText: `${words.join(", ")}.`,
    size,
    ...(size === "page"
      ? {
          headline: `${pct(used)} used`,
          figures: `${free} free of ${total}`,
          note:
            mark === null
              ? `Each segment is ${share}${NBSP}% of the drive, and no warning mark is set.`
              : `Each segment is ${share}${NBSP}% of the drive, and the rule is the warning mark at ${pct(mark)}.`,
        }
      : {
          figures: (
            // A row says "used"; a cell under its column header does not need to.
            <>
              <strong>{`${pct(used)}${size === "row" ? " used" : ""}`}</strong>
              {`, ${free} free`}
            </>
          ),
        }),
  };
}

// ─── Live: plain arrays of readings ──────────────────────────────────────────────────────────────

/** 19 November 2026, 10:31:04 UTC: the first reading of every live fixture. */
export const LIVE_START = Date.UTC(2026, 10, 19, 10, 31, 4);

/** A seeded generator, so a seed always gives the same readings. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the network is doing in a reading: idle, a computer copying to the NAS, or reading from it. */
export type Activity = "idle" | "copy-in" | "read-out";

export interface LiveReadings {
  processor: LivePoint[];
  memory: LivePoint[];
  /** MiB/s, from the second reading on: a rate needs two counter readings. */
  received: LivePoint[];
  sent: LivePoint[];
  /** The newest System.getInformation `memUsed` and `memTotal`, bytes. */
  memUsed: number;
  memTotal: number;
  dropped: boolean;
}

const MEM_TOTAL = 4104114176;
const MEM_BASE = 354963456;
const MiB = 1024 ** 2;

/**
 * `count` readings every 2 seconds from LIVE_START, each falling in `plan(i)`; the indexes in `skip`
 * were never read (the page was paused), so the lines break there. A 3.8 GiB NAS on a 1 Gbit/s port,
 * as the mock's fixtures are.
 */
export function liveReadings(
  count: number,
  plan: (i: number) => Activity,
  { seed = 7, skip = [] as readonly number[] } = {},
): LiveReadings {
  const rand = prng(seed);
  let cpu = 2;
  let mem = MEM_BASE;
  const out: LiveReadings = {
    processor: [],
    memory: [],
    received: [],
    sent: [],
    memUsed: MEM_BASE,
    memTotal: MEM_TOTAL,
    dropped: false,
  };
  for (let i = 0; i < count; i += 1) {
    const doing = plan(i);
    const t = LIVE_START + i * LIVE_INTERVAL_MS;
    const target =
      doing === "copy-in"
        ? 22 + rand() * 18
        : doing === "read-out"
          ? 9 + rand() * 8
          : 1 + rand() * 4;
    cpu = Math.max(0, Math.min(100, cpu * 0.35 + target * 0.65));
    const memTarget = doing === "idle" ? MEM_BASE : MEM_BASE + 64 * MiB;
    mem = Math.round(mem * 0.8 + memTarget * 0.2 + (rand() - 0.5) * 2 * MiB);
    const inRate =
      doing === "copy-in"
        ? 62 + rand() * 30
        : doing === "read-out"
          ? 0.3 + rand() * 0.4
          : rand() * 0.4;
    const outRate =
      doing === "copy-in"
        ? 0.8 + rand() * 0.9
        : doing === "read-out"
          ? 14 + rand() * 12
          : rand() * 0.12;
    if (skip.includes(i)) {
      continue;
    }
    out.processor.push({ t, v: Math.round(cpu * 10) / 10 });
    out.memory.push({ t, v: Math.round((mem / MEM_TOTAL) * 1000) / 10 });
    out.memUsed = mem;
    if (i > 0 && !skip.includes(i - 1)) {
      out.received.push({ t, v: inRate });
      out.sent.push({ t, v: outRate });
    }
  }
  // Only the last two minutes are kept, counted back from the newest reading.
  const last = out.processor.at(-1)?.t ?? LIVE_START;
  const from = last - LIVE_WINDOW_MS;
  const keep = (points: LivePoint[]) => points.filter((p) => p.t > from);
  const kept = keep(out.processor);
  return {
    ...out,
    processor: kept,
    memory: keep(out.memory),
    received: keep(out.received),
    sent: keep(out.sent),
    dropped: kept.length < out.processor.length,
  };
}

/** A rate: "38.6 MiB/s", two decimals under one. */
export const rate = (v: number): string =>
  `${v < 1 ? v.toFixed(2) : v.toFixed(1)}${NBSP}MiB/s`;

/** A scale's top: "100 MiB/s". */
export const rateScaleText = (v: number): string =>
  `${String(Math.round(v * 100) / 100)}${NBSP}MiB/s`;

/** Memory in GiB, two decimals under one. */
export const gib = (n: number): string => {
  const v = n / 1024 ** 3;
  return `${v < 1 ? v.toFixed(2) : v.toFixed(1)}${NBSP}GiB`;
};

/** "Since 10:31", "Last 2 minutes", "One reading, at 10:31", "No reading yet". */
export function spanWords(span: LiveSpan): string {
  switch (span.kind) {
    case "none":
      return "No reading yet";
    case "one":
      return `One reading, at ${clock(span.at)}`;
    case "since":
      return `Since ${clock(span.from)}`;
    case "window":
      return "Last 2 minutes";
  }
}

/** "Processor: 12 % now, between 1 % and 41 % since 10:31." */
export function describeWith(format: (v: number) => string) {
  return (s: LiveSummary): string => {
    if (s.range === null) {
      return `${s.name}: no reading yet.`;
    }
    const now =
      s.range.now === null
        ? "no value in the last reading"
        : `${format(s.range.now)} now`;
    if (s.span.kind === "one") {
      return `${s.name}: ${now}, one reading so far.`;
    }
    const since =
      s.span.kind === "since"
        ? `since ${clock(s.span.from)}`
        : "in the last 2 minutes";
    return `${s.name}: ${now}, between ${format(s.range.min)} and ${format(s.range.max)} ${since}.`;
  };
}

/** The live pair's props from a set of readings, with the words a page would pass in. */
export function livePairArgs(
  r: LiveReadings,
  { paused = false }: { paused?: boolean } = {},
): LivePairProps {
  const span = spanWords(
    r.processor.length === 0
      ? { kind: "none" }
      : r.processor.length === 1
        ? { kind: "one", at: r.processor[0]?.t ?? LIVE_START }
        : r.dropped
          ? { kind: "window" }
          : { kind: "since", from: r.processor[0]?.t ?? LIVE_START },
  );
  return {
    percent: {
      title: "Processor and memory",
      aside:
        r.processor.length === 0
          ? undefined
          : `Memory: ${gib(r.memUsed)} of ${gib(r.memTotal)}`,
      series: [
        { name: "Processor", points: r.processor },
        { name: "Memory", points: r.memory },
      ],
      dropped: r.dropped,
      format: pct,
      missing: "No reading",
      describe: describeWith(pct),
    },
    mirror: {
      title: "Network, in above the line and out below",
      aside: "enp2s0",
      above: { name: "In", label: "Network in", points: r.received },
      below: { name: "Out", label: "Network out", points: r.sent },
      dropped: r.dropped,
      format: rate,
      formatScale: rateScaleText,
      missing: "No reading",
      describe: describeWith(rate),
      describeScales: (a, b) =>
        `In is drawn on a scale to ${rateScaleText(a)} and out on a scale to ${rateScaleText(b)}.`,
      note: "The two halves are scaled separately.",
    },
    caption: `${span}, a reading every 2 seconds${paused ? ", paused" : ""}.`,
  };
}

// ─── Temperatures: DiskMgmt.getList, Smart.getInformation, MdMgmt, Zfs ──────────────────────────

/** Smart.getSettings: the admin asked to hear when a disk reaches 45 °C. */
export const SMART_SETTINGS = { tempmax: 45 } as const;

const BY_ID: Record<DrivePictureKind, string> = {
  hdd: "ata-EXAMPLE_Hard_Disk",
  ssd: "ata-EXAMPLE_SSD",
  nvme: "nvme-EXAMPLE_NVMe_SSD",
};

/** What Smart.getInformation says of a disk's `rotationrate`; NVMe disks are known by their name. */
const ROTATION: Record<DrivePictureKind, string | undefined> = {
  hdd: "7200 rpm",
  ssd: "Solid State Device",
  nvme: undefined,
};

export interface DemoDisk {
  /** DiskMgmt.getList. */
  row: DiskRow;
  /** Smart.getInformation, the field the kind is read from. */
  information: { rotationrate?: string };
}

/** A DiskMgmt.getList row; the serial in its by-id link is scrubbed as the captures are. */
function listDisk(
  devicename: string,
  temperature: string | number,
  kind: DrivePictureKind,
  serial: number,
): DemoDisk {
  const asleep = temperature === "";
  return {
    row: {
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
    information: { rotationrate: ROTATION[kind] },
  };
}

/** A pool member as Zfs.getPoolDevices names it: the disk's by-id link and the partition ZFS made. */
function zfsMember(list: readonly DemoDisk[], device: string, vdev: string) {
  const link = list.find((d) => d.row.devicename === device)?.row
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
) {
  return { devicefile, name: "", level, devices, state, syncaction };
}

/** The dashboard's six disks: sdb and sdc make the Backup mirror, sdd the pool tank; sdd is asleep. */
export const DISKS_6: readonly DemoDisk[] = [
  listDisk("nvme0n1", "34", "nvme", 1),
  listDisk("sda", "36", "hdd", 2),
  listDisk("sdb", "35", "hdd", 3),
  listDisk("sdc", "37", "hdd", 4),
  listDisk("sdd", "", "hdd", 5),
  listDisk("sde", 31, "ssd", 6),
];

const LABELS = Object.values(FILE_SYSTEMS).map((f) => ({
  devicename: f.devicename,
  label: f.label,
}));

export const VOLUMES_6: VolumeRows = {
  arrays: [md("/dev/md0", "raid1", ["/dev/sdb", "/dev/sdc"])],
  pools: [
    {
      status: { name: "tank", state: "ONLINE" },
      devices: [zfsMember(DISKS_6, "sdd", "")],
    },
  ],
  labels: LABELS,
};

/**
 * 24 disks in device order: two NVMe sticks and 22 drives, two of them SSDs. sdi and sdu are asleep,
 * and sdt is past the 45 °C limit.
 */
export const DISKS_24: readonly DemoDisk[] = (
  [
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
  ] as const
).map(([name, temperature, kind], i) =>
  listDisk(name, temperature, (kind ?? "hdd") as DrivePictureKind, 101 + i),
);

/**
 * The 24 disks' arrays and pools: the Backup mirror md0 of sdb and sdc; the Apps mirror md1 of the
 * two NVMe sticks, on a partition each; the Archive md2, a double parity array of sdf to sdn without
 * sdi, on a partition each and rebuilding; and the pool tank, a mirror of sdd and sde. Ten disks are
 * in none.
 */
export const VOLUMES_24: VolumeRows = {
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

/** The rows with one disk's temperature replaced, for the "one over the limit" stories. */
export function withTemperature(
  list: readonly DemoDisk[],
  device: string,
  temperature: string,
): DemoDisk[] {
  return list.map((d) =>
    d.row.devicename === device
      ? { ...d, row: { ...d.row, temperature, powermode: "ACTIVE or IDLE" } }
      : d,
  );
}

/** The app's mapping: each row, its kind from Smart.getInformation, then the groups. */
export function temperatureGroups(
  list: readonly DemoDisk[],
  volumes: VolumeRows,
): DiskGroup[] {
  const disks = list.map((d) =>
    diskTemperatureOf(
      { disk: d.row, kind: driveKindOf(d.row, d.information) },
      SMART_SETTINGS,
    ),
  );
  return diskGroups(disks, volumes);
}

/**
 * The dashboard's mapping (owner, 2026-11-27): Smart.getInformation is read only for the disks
 * DiskMgmt.getList reports awake, so a sleeping SATA disk has no kind; an NVMe disk is still known by
 * its name. `unread` names the disks whose Smart.getInformation read failed.
 */
export function dashboardTemperatureGroups(
  list: readonly DemoDisk[],
  volumes: VolumeRows,
  unread: readonly string[] = [],
): DiskGroup[] {
  const disks = list.map((d) => {
    const asleep = d.row.powermode === "STANDBY" || d.row.powermode === "SLEEP";
    const read = !asleep && !unread.includes(d.row.devicename);
    return diskTemperatureOf(
      { disk: d.row, kind: driveKindOf(d.row, read ? d.information : null) },
      SMART_SETTINGS,
    );
  });
  return diskGroups(disks, volumes);
}

const RAID_LEVEL: Record<string, string> = {
  raid0: "Stripe (RAID 0)",
  raid1: "Mirror (RAID 1)",
  raid4: "Parity disk (RAID 4)",
  raid5: "Parity (RAID 5)",
  raid6: "Double parity (RAID 6)",
  raid10: "Mirror and stripe (RAID 10)",
  linear: "Joined (linear)",
};

const ZFS_LAYOUT: Record<string, string> = {
  mirror: "mirror",
  raidz1: "RAID-Z1",
  raidz2: "RAID-Z2",
  raidz3: "RAID-Z3",
  draid: "dRAID",
};

function layoutWords(l: PoolLayout): string {
  if (l.kinds.length === 0) {
    return l.members === 1 ? "single disk" : "stripe";
  }
  const words = l.kinds.map((k) => ZFS_LAYOUT[k] ?? k).join(" and ");
  return l.groups === 1 ? words : `${words}, ${String(l.groups)} groups`;
}

const KIND_TITLE: Record<DrivePictureKind, string> = {
  hdd: "Hard disks",
  ssd: "SSDs",
  nvme: "NVMe SSDs, on the mainboard",
};

export const KIND_NAME: Record<DrivePictureKind, string> = {
  hdd: "Hard disk",
  ssd: "SSD",
  nvme: "NVMe SSD",
};

export function groupTitle(g: DiskGroup): string {
  switch (g.from) {
    case "md":
      return `${g.name ?? `RAID ${g.device}`}, ${RAID_LEVEL[g.level] ?? `RAID (${g.level})`}`;
    case "zfs":
      return `${g.name}, ZFS pool (${layoutWords(g.layout)})`;
    case "kind":
      return g.kind === null
        ? "Disks whose kind is not known"
        : KIND_TITLE[g.kind];
  }
}

/** A disk's kind in the hint; a disk whose kind was not read says so. */
const kindName = (d: DiskTemperature) =>
  d.kind === null ? "Kind not known" : KIND_NAME[d.kind];

const STATE_WORDS: Record<VolumeState["reason"], string> = {
  rebuilding: "Rebuilding",
  degraded: "A disk is missing or has failed",
  unavailable: "Cannot be used now",
};

const diskCount = (n: number) => (n === 1 ? "1 disk" : `${String(n)} disks`);

/** The temperatures' English words, as a page would pass them, read at `readAt`. */
export function temperatureLabels(readAt: string): DiskTemperaturesLabels {
  return {
    groupTitle,
    groupState: (s) => STATE_WORDS[s.reason],
    listName: (title) => `${title}, read at ${readAt}`,
    celsius,
    asleep: "Asleep",
    notRead: "Not read",
    overLimit: ", at or over the alert limit",
    overNote: (over: readonly DiskTemperature[]) =>
      `${listWords(over.map((d) => `${d.device} is at ${celsius(d.c ?? 0)}`))}, at or over the alert limit of ${celsius(over[0]?.limit ?? 0)}.`,
    asleepNote: (devices) =>
      `${listWords(devices)} ${devices.length === 1 ? "is" : "are"} asleep, so ${devices.length === 1 ? "its temperature was" : "their temperatures were"} not read: the disk list never wakes a disk to read it.`,
    hint: (d) =>
      d.limit === null
        ? kindName(d)
        : `${kindName(d)}, alert limit ${celsius(d.limit)}`,
  };
}

/** The dashboard's words for the disks it sums up. */
export const REST_LABELS: DiskTemperaturesRestLabels = {
  summary: (s: RestSummary) => {
    const which = s.all
      ? `the ${diskCount(s.count)}`
      : `the other ${diskCount(s.count)}`;
    const under =
      s.limit === null ? "" : `, under the alert limit of ${celsius(s.limit)}`;
    if (s.lo === null || s.hi === null) {
      return `None of ${which} has a temperature reading.`;
    }
    const range =
      s.lo === s.hi
        ? `at ${celsius(s.lo)}`
        : `between ${celsius(s.lo)} and ${celsius(s.hi)}`;
    if (s.read === s.count) {
      const subject = s.all
        ? `All ${diskCount(s.count)}`
        : `The other ${diskCount(s.count)}`;
      return `${subject} ${s.count === 1 ? "is" : "are"} ${range}${under}.`;
    }
    return `${String(s.read)} of ${which} ${s.read === 1 ? "is" : "are"} ${range}${under}.`;
  },
  show: (s) =>
    s.all
      ? `Show all ${diskCount(s.count)}`
      : `Show the other ${diskCount(s.count)}`,
};
