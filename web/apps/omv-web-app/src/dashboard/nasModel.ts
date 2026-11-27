// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's map, temperatures and live charts from the contract's rows (rethink 6.8; journal
// 2026-11-27, which decides what the dashboard may read). Pure: the page's hooks read, this maps, and
// the words come in from the catalogue, so each rule is tested by itself.
//
// What the dashboard reads, and so what it can say:
// - DiskMgmt.getList for the disks, their temperature and power state; it wakes nothing.
// - A disk's kind from Smart.getInformation, read only for the disks that list reports awake; a
//   sleeping disk has no kind (null), and an NVMe disk is known by its name (`driveKindOf`).
// - FileSystemMgmt.enumerateMountedFilesystems and FileSystemMgmt.getList for the storage. A file
//   system on a RAID array (md) is an ordinary row with no disk attached: MdMgmt is never read here,
//   and a disk that DiskMgmt.getList marks `israid` is a RAID member, never unused.
// - Zfs.getPoolStatus and, for each pool, Zfs.getPoolDevices for its disks. A pool whose disks could
//   not be read says so, and then no disk is called unused.
// - ShareMgmt.getList, the SMB and NFS share lists and Services.getStatus for the folders and the
//   ways in; the interface list for the network.
// - Smart.getListBg (disk health) only after the person pressed "Check disk health".
import type {
  ConfiguredFilesystem,
  DiskDevice,
  MdArray,
  MountedFilesystem,
  NetworkDevice,
  NfsShareRow,
  ServiceStatus,
  SharedFolder,
  SmartDevice,
  SmbShareRow,
  ZfsPoolDevice,
  ZfsPoolStatus,
} from "@omv-webui/react-api-omv/generated";
import {
  diskGroups,
  diskTemperatureOf,
  memberOnDisk,
  type DiskGroup,
  type DrivePictureKind,
  type LivePoint,
  type NasDisk,
  type NasDiskKind,
  type NasFolder,
  type NasHealth,
  type NasInterface,
  type NasMapInput,
  type NasReads,
  type NasReadState,
  type NasStorage,
  type NasWay,
  type NasWayId,
} from "@omv-webui/react-ui-components";
import { isAsleep } from "../disks/diskWords.ts";
import { formatBytes, parseByteCount } from "../format/format.ts";
import type { SystemSample, TrafficSample } from "../live/liveSamples.ts";
import {
  diskState,
  diskTemperature,
  fileSystemState,
  interfaceKind,
  visibleInterfaces,
  zfsPoolHealth,
  type FsState,
} from "./dashboard.ts";

// ─── Reads ───────────────────────────────────────────────────────────────────────────────────────

/** Where one query is, as the answer counts it: data kept through a failed poll is still read. */
export function readStateOf(query: {
  data: unknown;
  isError: boolean;
}): NasReadState {
  if (query.data !== undefined) {
    return "ok";
  }
  return query.isError ? "failed" : "loading";
}

/** The worse of several reads: one failed is failed, one still on its way is loading. */
export function worstRead(...states: readonly NasReadState[]): NasReadState {
  if (states.includes("failed")) {
    return "failed";
  }
  return states.includes("loading") ? "loading" : "ok";
}

// ─── Words ───────────────────────────────────────────────────────────────────────────────────────

/** What the mapping writes into the map's input, from the catalogue. */
export interface NasModelWords {
  /** A state of health in words: "OK", "Warning", "Not checked yet". */
  health: (state: "ok" | "warning" | "critical" | "unknown") => string;
  /** A disk that was not checked this session. */
  notChecked: string;
  /** A disk the check did not report. */
  noReading: string;
  /** "Asleep", under a disk in standby. */
  asleep: string;
  /** "36 °C". */
  celsius: (c: number) => string;
  /** "Hard disk, 3.6 TiB". */
  diskSummary: (kind: NasDiskKind, size: string | null) => string;
  /** A storage's state: "Full", "Almost full", "No reading", "Missing". */
  storageState: (state: FsState | "missing") => string;
  /** A pool's state from Zfs.getPoolStatus. */
  poolState: (state: "degraded" | "unusable" | "damaged") => string;
  /** "System drive". */
  systemDrive: string;
  /** "ZFS pool". */
  zfsPool: string;
  /** The file system type for people: "EXT4". */
  fsType: (type: string) => string;
  /** A file system on a RAID array: "Its disks are listed on the RAID page." */
  raidDisksNote: string;
  /** A pool whose Zfs.getPoolDevices failed: "Which disks it is on could not be read." */
  poolDisksUnread: string;
  /** A folder that cannot be reached: its state's word. */
  folderState: (status: string) => string;
  /** A way in's plain name and its technical term. */
  way: (id: NasWayId) => { name: string; tech: string };
  /** A link speed: "1 Gbit/s"; null when not reported. */
  speed: (mbit: number) => string | null;
}

// ─── Storage ─────────────────────────────────────────────────────────────────────────────────────

/** What the page needs to draw a storage's meter and open its page. */
export interface StorageFacts {
  /** FileSystemMgmt `percentage`; null when there is no reading. */
  percent: number | null;
  /** FileSystemMgmt `usagewarnthreshold`; null when none is set (OMV's 0, never warn). */
  mark: number | null;
  /** Bytes; null when there is no reading. */
  size: number | null;
  available: number | null;
  state: FsState | "missing";
  /** Where pressing it goes. */
  open:
    | { kind: "fs"; fs: { uuid: string | null; devicefile: string } }
    | { kind: "pool"; pool: string }
    | { kind: "list" };
}

const isMd = (fs: { canonicaldevicefile: string; devicename: string }) =>
  /^\/dev\/md/u.test(fs.canonicaldevicefile) || /^md\d/u.test(fs.devicename);

/** The pool a ZFS file system is on: the first part of its dataset name. */
export const poolOf = (fs: {
  devicefile: string;
  canonicaldevicefile: string;
}): string => (fs.devicefile || fs.canonicaldevicefile).split("/")[0] ?? "";

/** The device files a file system stands on, for finding its disks. */
function membersOf(fs: MountedFilesystem | ConfiguredFilesystem): string[] {
  return [
    fs.parentdevicefile ?? "",
    ...(fs.devicefiles ?? []),
    fs.canonicaldevicefile,
  ].filter((m) => m !== "");
}

const onDisk = (members: readonly string[], disk: DiskDevice) =>
  members.some((m) =>
    [disk.canonicaldevicefile, ...disk.devicelinks].some((path) =>
      memberOnDisk(m, path),
    ),
  );

const STATE_HEALTH: Record<FsState, NasHealth> = {
  critical: "critical",
  warning: "warning",
  unknown: "unknown",
  below: "ok",
};

const SEVERITY: Record<NasHealth, number> = {
  critical: 3,
  warning: 2,
  unknown: 1,
  ok: 0,
};

export interface StorageInput {
  mounted: readonly MountedFilesystem[];
  /** Every configured file system: the missing ones (status 3) and the figures of the rest. */
  configured: readonly ConfiguredFilesystem[];
  /** Zfs.getPoolStatus; null without the plugin, undefined until read or when failed. */
  pools: readonly ZfsPoolStatus[] | null | undefined;
}

interface BuiltStorage {
  storage: NasStorage[];
  facts: Map<string, StorageFacts>;
  /** Each storage's disks: a predicate on a DiskMgmt.getList row; none for md or an unread pool. */
  members: Map<string, (disk: DiskDevice) => boolean>;
  /** For the folders: the mount points and device names each storage is reached by. */
  places: Map<string, { dirs: string[]; fsnames: string[]; pool?: string }>;
}

const fsId = (fs: { uuid: string | null; devicefile: string }) =>
  `fs:${fs.uuid !== null && fs.uuid !== "" ? fs.uuid : fs.devicefile}`;

const sameFs = (
  a: { uuid: string | null; devicefile: string },
  b: { uuid: string | null; devicefile: string },
) =>
  (a.uuid !== null && a.uuid !== "" && a.uuid === b.uuid) ||
  (a.devicefile !== "" && a.devicefile === b.devicefile);

function factsOf(
  fs: Pick<
    MountedFilesystem,
    "percentage" | "usagewarnthreshold" | "size" | "available"
  >,
): Omit<StorageFacts, "open"> & { state: FsState } {
  const state = fileSystemState(fs);
  const threshold = fs.usagewarnthreshold;
  return {
    percent: fs.percentage < 0 ? null : fs.percentage,
    mark: threshold > 0 ? threshold : null,
    size: parseByteCount(fs.size),
    available: parseByteCount(fs.available),
    state,
  };
}

/**
 * The storage rows: each mounted file system (its figures from the polled list), each configured
 * one that is missing, and one row per ZFS pool standing for its file systems (their free space is
 * the pool's, so the fullest speaks for it).
 */
export function buildStorage(
  input: StorageInput,
  poolDevices: ReadonlyMap<string, readonly ZfsPoolDevice[] | "failed">,
  words: NasModelWords,
): BuiltStorage {
  const storage: NasStorage[] = [];
  const facts = new Map<string, StorageFacts>();
  const members = new Map<string, (disk: DiskDevice) => boolean>();
  const places = new Map<
    string,
    { dirs: string[]; fsnames: string[]; pool?: string }
  >();

  const zfs = new Map<string, MountedFilesystem[]>();
  for (const fs of input.mounted) {
    if (fs.type === "zfs") {
      const pool = poolOf(fs);
      zfs.set(pool, [...(zfs.get(pool) ?? []), fs]);
      continue;
    }
    const id = fsId(fs);
    const root = fs.mountpoint === "/";
    const md = isMd(fs);
    const own = factsOf(fs);
    const name = root
      ? words.systemDrive
      : fs.label.trim() !== ""
        ? fs.label
        : fs.canonicaldevicefile || fs.devicefile;
    storage.push({
      id,
      name,
      tech: words.fsType(fs.type),
      kind: md ? "raid" : "fs",
      used: own.percent === null ? null : own.percent / 100,
      health: STATE_HEALTH[own.state],
      healthLabel:
        own.state === "below"
          ? words.health("ok")
          : words.storageState(own.state),
      folders: [],
      system: root,
      ...(md ? { disksNote: words.raidDisksNote } : {}),
    });
    facts.set(id, {
      ...own,
      open: root
        ? { kind: "list" }
        : { kind: "fs", fs: { uuid: fs.uuid, devicefile: fs.devicefile } },
    });
    const on = md ? [] : membersOf(fs);
    members.set(id, (disk) => on.length > 0 && onDisk(on, disk));
    places.set(id, {
      dirs: fs.mountpoint === "" ? [] : [fs.mountpoint],
      fsnames: [fs.devicefile, fs.canonicaldevicefile].filter((n) => n !== ""),
    });
  }

  for (const fs of input.configured) {
    if (fs.status !== 3 || input.mounted.some((m) => sameFs(m, fs))) {
      continue;
    }
    const id = fsId(fs);
    storage.push({
      id,
      name:
        fs.label !== null && fs.label.trim() !== ""
          ? fs.label
          : fs.devicefile || fs.canonicaldevicefile,
      tech: words.fsType(fs.type),
      kind: isMd(fs) ? "raid" : "fs",
      used: null,
      health: "unknown",
      healthLabel: words.storageState("missing"),
      folders: [],
    });
    facts.set(id, {
      percent: null,
      mark: null,
      size: null,
      available: null,
      state: "missing",
      open: { kind: "fs", fs: { uuid: fs.uuid, devicefile: fs.devicefile } },
    });
    members.set(id, () => false);
    places.set(id, {
      dirs: fs.mountpoint === "" ? [] : [fs.mountpoint],
      fsnames: [fs.devicefile].filter((n) => n !== ""),
    });
  }

  const poolNames = new Set<string>([
    ...zfs.keys(),
    ...(input.pools ?? []).map((p) => p.name),
  ]);
  for (const pool of [...poolNames].sort()) {
    const rows = zfs.get(pool) ?? [];
    const fullest = rows.reduce<MountedFilesystem | undefined>(
      (a, b) => (a === undefined || b.percentage > a.percentage ? b : a),
      undefined,
    );
    const own: Omit<StorageFacts, "open"> & { state: FsState } = fullest
      ? factsOf(fullest)
      : {
          percent: null,
          mark: null,
          size: null,
          available: null,
          state: "unknown",
        };
    const status = input.pools?.find((p) => p.name === pool);
    const poolHealth = status ? zfsPoolHealth(status) : null;
    // As the attention row says it (dashboard.ts): a pool that is not OK by its state is Critical.
    const health: NasHealth =
      poolHealth !== null ? "critical" : STATE_HEALTH[own.state];
    const devices = poolDevices.get(pool);
    const id = `zfs:${pool}`;
    storage.push({
      id,
      name: pool,
      tech: words.zfsPool,
      kind: "zfs",
      used: own.percent === null ? null : own.percent / 100,
      health,
      healthLabel:
        poolHealth !== null
          ? words.poolState(poolHealth)
          : own.state === "below"
            ? words.health("ok")
            : words.storageState(own.state),
      folders: [],
      ...(devices === "failed"
        ? { disksNote: words.poolDisksUnread, disksUnread: true }
        : {}),
    });
    facts.set(id, { ...own, open: { kind: "pool", pool } });
    const on = Array.isArray(devices) ? devices.map((d) => d.devicefile) : [];
    members.set(id, (disk) => on.length > 0 && onDisk(on, disk));
    places.set(id, {
      dirs: rows.map((r) => r.mountpoint).filter((d) => d !== ""),
      fsnames: [],
      pool,
    });
  }

  storage.sort((a, b) => SEVERITY[b.health] - SEVERITY[a.health]);
  return { storage, facts, members, places };
}

// ─── Disks ───────────────────────────────────────────────────────────────────────────────────────

export interface DiskInput {
  disks: readonly DiskDevice[];
  /** Each disk's kind by `devicename`; a disk missing from here was not read (asleep, or failed). */
  kinds: ReadonlyMap<string, DrivePictureKind | null>;
  /** The session's disk-health reading, when the person asked for one. */
  health: readonly SmartDevice[] | undefined;
}

/**
 * A disk's drawing on the map: the kind the temperatures draw it as (`driveKindOf`, from its name or
 * the Smart.getInformation read made while it was awake), or the plain `disk` when that is not known.
 * Never `usb` from `hotpluggable`: OMV sets that for SAS disks and SATA disks on a hot-plug port too.
 */
export function nasDiskKind(
  kind: DrivePictureKind | null | undefined,
): NasDiskKind {
  return kind ?? "disk";
}

export function buildDisks(
  input: DiskInput,
  storage: BuiltStorage,
  words: NasModelWords,
): NasDisk[] {
  return input.disks.map((disk) => {
    const reading = input.health?.find(
      (d) => d.canonicaldevicefile === disk.canonicaldevicefile,
    );
    const state: NasHealth =
      reading === undefined
        ? "unknown"
        : diskState(reading.overallstatus).status;
    const healthLabel =
      input.health === undefined
        ? words.notChecked
        : reading === undefined
          ? words.noReading
          : words.health(state);
    const asleep = isAsleep(disk.powermode);
    const c = asleep ? null : diskTemperature(disk.temperature);
    const kind = nasDiskKind(input.kinds.get(disk.devicename));
    const size = parseByteCount(disk.size);
    return {
      id: disk.devicename,
      device: disk.devicename,
      kind,
      health: state,
      healthLabel,
      ...(asleep
        ? { detail: words.asleep }
        : c === null
          ? {}
          : { detail: words.celsius(c) }),
      summary: words.diskSummary(
        kind,
        size === null ? null : formatBytes(size),
      ),
      storage: storage.storage
        .filter((s) => storage.members.get(s.id)?.(disk) === true)
        .map((s) => s.id),
      ...(disk.israid ? { raidMember: true } : {}),
    };
  });
}

// ─── Folders, ways in and the network ────────────────────────────────────────────────────────────

const SERVICE_WAY: Record<string, NasWayId> = {
  samba: "smb",
  nfs: "nfs",
  rsyncd: "rsync",
  ssh: "ssh",
};

export function buildWays(
  services: readonly ServiceStatus[],
  words: NasModelWords,
): NasWay[] {
  return services.flatMap((s) => {
    const id = SERVICE_WAY[s.name];
    return id === undefined
      ? []
      : [{ id, ...words.way(id), enabled: s.enabled, running: s.running }];
  });
}

export interface FolderInput {
  folders: readonly SharedFolder[];
  smb: readonly SmbShareRow[];
  nfs: readonly NfsShareRow[];
  services: readonly ServiceStatus[];
}

/** The storage a shared folder lives on, by its mount entry's directory or device name. */
function storageOfFolder(
  folder: SharedFolder,
  places: BuiltStorage["places"],
): string | undefined {
  const dir = folder.mntent?.dir ?? "";
  const fsname = folder.mntent?.fsname ?? "";
  for (const [id, place] of places) {
    if (dir !== "" && place.dirs.includes(dir.replace(/\/$/u, ""))) {
      return id;
    }
    if (fsname !== "" && place.fsnames.includes(fsname)) {
      return id;
    }
    if (
      place.pool !== undefined &&
      fsname !== "" &&
      (fsname === place.pool || fsname.startsWith(`${place.pool}/`))
    ) {
      return id;
    }
  }
  return undefined;
}

export function buildFolders(
  input: FolderInput,
  places: BuiltStorage["places"],
  words: NasModelWords,
): { folders: NasFolder[]; byStorage: Map<string, string[]> } {
  const on = (name: string) =>
    input.services.some((s) => s.name === name && s.enabled);
  const folders = input.folders.map((folder): NasFolder => {
    const ways: NasWayId[] = [];
    if (
      on("samba") &&
      input.smb.some((s) => s.enable && s.sharedfolderref === folder.uuid)
    ) {
      ways.push("smb");
    }
    if (on("nfs") && input.nfs.some((s) => s.sharedfolderref === folder.uuid)) {
      ways.push("nfs");
    }
    const ok = folder.status === "OK";
    return {
      id: folder.uuid,
      name: folder.name,
      ways,
      health: ok ? "ok" : "unknown",
      healthLabel: ok ? words.health("ok") : words.folderState(folder.status),
    };
  });
  const byStorage = new Map<string, string[]>();
  for (const folder of input.folders) {
    const id = storageOfFolder(folder, places);
    if (id !== undefined) {
      byStorage.set(id, [...(byStorage.get(id) ?? []), folder.uuid]);
    }
  }
  return { folders, byStorage };
}

export function buildInterfaces(
  devices: readonly NetworkDevice[],
  words: NasModelWords,
): NasInterface[] {
  return visibleInterfaces(devices).shown.map((d) => {
    const speed = d.link ? words.speed(d.speed) : null;
    return {
      id: d.devicename,
      name: d.devicename,
      kind: interfaceKind(d.type) ?? "ethernet",
      up: d.link,
      ...(speed === null ? {} : { speed }),
      ...(d.address.trim() === "" ? {} : { address: d.address }),
    };
  });
}

// ─── The whole map ───────────────────────────────────────────────────────────────────────────────

export interface NasInput {
  disks: readonly DiskDevice[] | undefined;
  kinds: ReadonlyMap<string, DrivePictureKind | null>;
  health: readonly SmartDevice[] | undefined;
  mounted: readonly MountedFilesystem[] | undefined;
  configured: readonly ConfiguredFilesystem[] | undefined;
  pools: readonly ZfsPoolStatus[] | null | undefined;
  poolDevices: ReadonlyMap<string, readonly ZfsPoolDevice[] | "failed">;
  folders: readonly SharedFolder[] | undefined;
  smb: readonly SmbShareRow[] | undefined;
  nfs: readonly NfsShareRow[] | undefined;
  services: readonly ServiceStatus[] | undefined;
  interfaces: readonly NetworkDevice[] | undefined;
  reads: NasReads;
}

export interface NasModel {
  input: NasMapInput;
  facts: ReadonlyMap<string, StorageFacts>;
}

/** The map's input from every read, each lane from what has arrived. */
export function nasModel(input: NasInput, words: NasModelWords): NasModel {
  const built = buildStorage(
    {
      mounted: input.mounted ?? [],
      configured: input.configured ?? [],
      pools: input.pools,
    },
    input.poolDevices,
    words,
  );
  const services = input.services ?? [];
  const { folders, byStorage } = buildFolders(
    {
      folders: input.folders ?? [],
      smb: input.smb ?? [],
      nfs: input.nfs ?? [],
      services,
    },
    built.places,
    words,
  );
  const disks = buildDisks(
    { disks: input.disks ?? [], kinds: input.kinds, health: input.health },
    built,
    words,
  );
  return {
    input: {
      disks,
      storage: built.storage.map((s) => ({
        ...s,
        folders: byStorage.get(s.id) ?? [],
      })),
      folders,
      ways: buildWays(services, words),
      interfaces: buildInterfaces(input.interfaces ?? [], words),
      reads: input.reads,
    },
    facts: built.facts,
  };
}

/** Whether a disk was read awake, so Smart.getInformation may be read for its kind (journal 2026-11-27). */
export const isAwake = (disk: Pick<DiskDevice, "powermode">): boolean =>
  !isAsleep(disk.powermode);

// ─── Temperatures ────────────────────────────────────────────────────────────────────────────────

/**
 * The temperatures by kind: each pool its own group (from Zfs.getPoolDevices), every other disk in
 * its kind's group. No arrays: MdMgmt is not read on the dashboard, so a RAID member stands with its
 * kind. A pool whose disks could not be read has no group, and its disks stand with their kind.
 */
export function temperatureGroups(
  disks: readonly DiskDevice[],
  kinds: ReadonlyMap<string, DrivePictureKind | null>,
  tempmax: number,
  pools: readonly ZfsPoolStatus[] | null | undefined,
  poolDevices: ReadonlyMap<string, readonly ZfsPoolDevice[] | "failed">,
  labels: readonly { devicename: string; label: string | null }[],
  /**
   * MdMgmt.enumerateDevices, where the page reads it (the Disks page). The dashboard never does
   * (journal 2026-11-27), so its RAID members are grouped by kind.
   */
  arrays: readonly MdArray[] = [],
): DiskGroup[] {
  const readings = disks.map((disk) =>
    diskTemperatureOf(
      { disk, kind: kinds.get(disk.devicename) ?? null },
      { tempmax },
    ),
  );
  return diskGroups(readings, {
    arrays,
    pools: (pools ?? []).flatMap((p) => {
      const devices = poolDevices.get(p.name);
      return Array.isArray(devices)
        ? [{ status: { name: p.name, state: p.state }, devices }]
        : [];
    }),
    labels,
  });
}

// ─── Live ────────────────────────────────────────────────────────────────────────────────────────

const MIB = 1024 ** 2;

export interface LiveSeries {
  processor: LivePoint[];
  memory: LivePoint[];
  /** MiB/s. */
  received: LivePoint[];
  sent: LivePoint[];
  /** Older readings than the window were let go. */
  dropped: boolean;
  /** The newest memory figures, bytes. */
  memUsed: number | null;
  memTotal: number | null;
}

/**
 * The live pair's series from the samples this tab took: only those within `windowMs` of the newest
 * reading. Nothing is filled backwards: a chart starts where this tab began reading.
 */
export function liveSeries(
  system: readonly SystemSample[],
  traffic: readonly TrafficSample[],
  iface: string | null,
  windowMs: number,
): LiveSeries {
  const newest = Math.max(system.at(-1)?.t ?? 0, traffic.at(-1)?.t ?? 0);
  const from = newest - windowMs;
  const kept = system.filter((s) => s.t > from);
  const moved = traffic.filter((s) => s.t > from);
  const rate = (v: number | null | undefined): number | null =>
    v === null || v === undefined ? null : v / MIB;
  const last = kept.at(-1);
  return {
    processor: kept.map((s) => ({ t: s.t, v: s.cpu })),
    memory: kept.map((s) => ({ t: s.t, v: s.memory })),
    received:
      iface === null
        ? []
        : moved.map((s) => ({ t: s.t, v: rate(s.interfaces.get(iface)?.rx) })),
    sent:
      iface === null
        ? []
        : moved.map((s) => ({ t: s.t, v: rate(s.interfaces.get(iface)?.tx) })),
    dropped: kept.length < system.length,
    memUsed: last?.memUsed ?? null,
    memTotal: last?.memTotal ?? null,
  };
}

/**
 * The interface the network chart shows: the first connected one that is neither loopback nor
 * virtual, in the server's order; null when none is connected.
 */
export function liveInterface(
  devices: readonly NetworkDevice[],
): string | null {
  return (
    visibleInterfaces(devices).shown.find((d) => d.link)?.devicename ?? null
  );
}
