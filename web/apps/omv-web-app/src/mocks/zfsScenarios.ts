// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS plugin's (openmediavault-zfs) answers in the mock (phase 5 ZFS design 14). Development and
// test code only (UI-11).
//
// ZFS is absent by default: in every story but the zfs* ones, each Zfs method answers OMV's 404 for a
// service it does not know, as on a NAS without the plugin, so the default stories are unchanged.
//
// In the zfs* stories these answers REMEMBER what the reader did, as the RAID mock's do, so the
// journeys of the design's sections 3 to 9 can be walked on `pnpm dev:mock` and in the browser test.
// What they do is what the test VM showed (journal, 2026-11-22): creating a pool takes its disks out
// of the candidates, registers its own folder with OMV and marks fstab, collectd, monit and quota
// pending; a pool name ZFS keeps for itself is refused and still leaves a partition table on the
// disks; adding a file system with a name that is taken answers as if it had made it and changes
// nothing; a size limit below what a file system holds is refused; a second snapshot in the same
// second, and a roll-back past a newer snapshot, are refused; a delete is a task, refused for a pool
// that still holds a file system; a deleted pool's disks, and a disk replaced out of a pool, keep
// ZFS's partition table and are not offered again until wiped; during a replace both disks are in
// "replacing-N"; the compression and deduplication ratios read "1.00". ZFS's work (a check, a
// rebuild) moves on by a tenth at every read of that pool's report, so Refresh and the poll show it
// moving and ending.
//
// The replies have the captured shapes: Zfs.listPools' rows, getPoolDevices' devices, and the pool's
// report written line by line in zpool status's format, read by the same parser as the captures. OMV's
// file-system lists report each ZFS file system with uuid null, the full name as its device file and
// the pool's disks as its devices, as captured. The states the VM cannot show (a spare, error counts,
// damaged files, a missing disk, an unusable pool, a full pool, a locked file system, a volume, a clone,
// nested file systems, several groups, twenty pools, hostile names, the plugin broken, disks named by
// their kernel names, a pool OMV does not know yet, a shared folder on a ZFS file system, 500
// snapshots) are WRITTEN BY HAND and say so in their labels. No value comes from a real system: serial
// numbers, GUIDs and UUIDs are documentation values, and the host is "nas".
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import type { ExampleName, FixedAnswer } from "@omv-webui/react-api-omv/mocks";

export const ZFS_SCENARIOS = [
  "zfsNone",
  "zfsMirror",
  "zfsChecking",
  "zfsDegraded",
  "zfsRebuilding",
  "zfsRaidz1",
  "zfsRaidz2",
  "zfsStripe",
  "zfsSingle",
  "zfsPaused",
  "zfsCheckStopped",
  "zfsReplaced",
  "zfsLeftover",
  "zfsSnapshots",
  "zfsRaidz3",
  "zfsSpare",
  "zfsErrors",
  "zfsDamaged",
  "zfsUnusable",
  "zfsMissing",
  "zfsFull",
  "zfsLocked",
  "zfsVolume",
  "zfsClone",
  "zfsNested",
  "zfsGroups",
  "zfsStateUnknown",
  "zfsReportFails",
  "zfsEmptyDevices",
  "zfsMany",
  "zfsHostile",
  "zfsNoPlugin",
  "zfsBroken",
  "zfsKernelNames",
  "zfsUnknownToOmv",
  "zfsShared",
  "zfsCreateFails",
  "zfsManySnapshots",
] as const;
export type ZfsScenarioName = (typeof ZFS_SCENARIOS)[number];

export const ZFS_SCENARIO_LABELS: Record<ZfsScenarioName, string> = {
  zfsNone: "ZFS: the plugin installed, no pool, sdb to sde empty",
  zfsMirror: "ZFS: a healthy mirror of sdb and sdc with tank/media",
  zfsChecking: "ZFS: the mirror being checked",
  zfsDegraded: "ZFS: the mirror with sdc taken offline (degraded)",
  zfsRebuilding: "ZFS: sdc being replaced by sdd, rebuilding",
  zfsRaidz1: "ZFS: a RAID-Z1 of sdb, sdc and sdd",
  zfsRaidz2: "ZFS: a RAID-Z2 of sdb to sde",
  zfsStripe: "ZFS: a stripe of sdb and sdc (no protection)",
  zfsSingle: "ZFS: a pool of the single disk sdb (no protection)",
  zfsPaused: "ZFS: the mirror's check paused",
  zfsCheckStopped: "ZFS: the mirror's last check was stopped",
  zfsReplaced:
    "ZFS: sdc replaced by sdd; sdc keeps ZFS's partition table until wiped",
  zfsLeftover:
    "ZFS: no pool; sdb and sdc keep a deleted pool's partition table (Erase and reuse)",
  zfsSnapshots: "ZFS: the mirror with two snapshots of tank/media",
  zfsRaidz3: "ZFS: a RAID-Z3 of sdb to sdf (hand-written, a fifth disk)",
  zfsSpare: "ZFS: the mirror with sdd as a spare (hand-written)",
  zfsErrors: "ZFS: a mirror disk that reported errors (hand-written)",
  zfsDamaged: "ZFS: damaged files ZFS could not repair (hand-written)",
  zfsUnusable: "ZFS: a RAID-Z1 with two disks missing, unusable (hand-written)",
  zfsMissing: "ZFS: a mirror with one disk missing (hand-written)",
  zfsFull: "ZFS: a pool 85% full and one 96% full (hand-written)",
  zfsLocked: "ZFS: an encrypted file system, locked (hand-written)",
  zfsVolume: "ZFS: the mirror with a volume tank/vm1 (hand-written)",
  zfsClone: "ZFS: tank/copy made from a snapshot of tank/media (hand-written)",
  zfsNested: "ZFS: tank/media/photos inside tank/media (hand-written)",
  zfsGroups:
    "ZFS: two mirror groups with a write log, a read cache and metadata disks (hand-written)",
  zfsStateUnknown:
    "ZFS: the plugin could not read the pool's state (hand-written)",
  zfsReportFails: "ZFS: the pool's report cannot be read (hand-written)",
  zfsEmptyDevices:
    "ZFS: the pool's disks come back as an empty list (hand-written)",
  zfsMany: "ZFS: twenty pools (hand-written)",
  zfsHostile:
    "ZFS: long names, and names outside the address patterns (hand-written)",
  zfsNoPlugin: "ZFS: the plugin is not installed (404)",
  zfsBroken:
    "ZFS: the plugin installed but ZFS not working, every read fails (hand-written)",
  zfsKernelNames:
    "ZFS: a mirror whose disks ZFS names by kernel name (hand-written)",
  zfsUnknownToOmv:
    "ZFS: a pool made by hand that OMV does not know yet (hand-written)",
  zfsShared: "ZFS: tank/media used by the shared folder media (hand-written)",
  zfsCreateFails:
    "ZFS: creating a pool fails and leaves a partition table (hand-written)",
  zfsManySnapshots: "ZFS: 500 snapshots of tank/media (hand-written)",
};

export const isZfsScenario = (name: string): name is ZfsScenarioName =>
  (ZFS_SCENARIOS as readonly string[]).includes(name);

/** OMV's reply to every method of a service it does not know: the plugin is not installed. */
export const ZFS_NOT_INSTALLED: FixedAnswer = {
  status: 404,
  message: "RPC service 'Zfs' not found.",
  code: 0,
};

/** The modules the plugin marks dirty (observed on the test VM). */
export const ZFS_DIRTY = {
  zfsAddPool: ["fstab", "collectd", "monit", "quota"],
  zfsAddObject: ["fstab", "collectd", "monit", "quota"],
  zfsDeleteObjectBg: ["fstab", "collectd", "monit", "quota"],
  zfsSetProperties: ["collectd", "monit", "quota"],
} as const;

const ZFS_OPERATIONS = [
  "zfsListCompressionTypes",
  "zfsListPools",
  "zfsGetObjectDetails",
  "zfsGetPoolDevices",
  "zfsGetPoolStatus",
  "zfsGetAllSnapshots",
  "zfsGetEmptyCandidates",
  "zfsAddPool",
  "zfsAddObject",
  "zfsSetProperties",
  "zfsQuickSnapshot",
  "zfsRollbackSnapshot",
  "zfsDeleteObjectBg",
  "zfsScrubPool",
  "zfsStopScrub",
  "zfsDeviceReplace",
  "zfsDeviceOffline",
  "zfsDeviceOnline",
  "zfsClearPool",
] as const;

interface Call {
  params: unknown;
}
type Reply<Op extends keyof typeof CONTRACT_EXAMPLES> = (
  call: Call,
) => ExampleName<Op> | FixedAnswer;

/**
 * The Zfs answers outside the zfs* stories: OMV's 404 for every method (the probe's as its example).
 * In the zfs* stories the remembering answers (zfsAnswers, merged into the file-system mock's) take
 * their place.
 */
export interface ZfsReplies {
  zfsListCompressionTypes: Reply<"zfsListCompressionTypes">;
  zfsListPools: Reply<"zfsListPools">;
  zfsGetObjectDetails: Reply<"zfsGetObjectDetails">;
  zfsGetPoolDevices: Reply<"zfsGetPoolDevices">;
  zfsGetPoolStatus: Reply<"zfsGetPoolStatus">;
  zfsGetAllSnapshots: Reply<"zfsGetAllSnapshots">;
  zfsGetEmptyCandidates: Reply<"zfsGetEmptyCandidates">;
  zfsAddPool: Reply<"zfsAddPool">;
  zfsAddObject: Reply<"zfsAddObject">;
  zfsSetProperties: Reply<"zfsSetProperties">;
  zfsQuickSnapshot: Reply<"zfsQuickSnapshot">;
  zfsRollbackSnapshot: Reply<"zfsRollbackSnapshot">;
  zfsDeleteObjectBg: Reply<"zfsDeleteObjectBg">;
  zfsScrubPool: Reply<"zfsScrubPool">;
  zfsStopScrub: Reply<"zfsStopScrub">;
  zfsDeviceReplace: Reply<"zfsDeviceReplace">;
  zfsDeviceOffline: Reply<"zfsDeviceOffline">;
  zfsDeviceOnline: Reply<"zfsDeviceOnline">;
  zfsClearPool: Reply<"zfsClearPool">;
}

export function zfsReplies(): ZfsReplies {
  const absent = () => ZFS_NOT_INSTALLED;
  return {
    zfsListCompressionTypes: () => "notInstalled",
    zfsListPools: absent,
    zfsGetObjectDetails: absent,
    zfsGetPoolDevices: absent,
    zfsGetPoolStatus: absent,
    zfsGetAllSnapshots: absent,
    zfsGetEmptyCandidates: absent,
    zfsAddPool: absent,
    zfsAddObject: absent,
    zfsSetProperties: absent,
    zfsQuickSnapshot: absent,
    zfsRollbackSnapshot: absent,
    zfsDeleteObjectBg: absent,
    zfsScrubPool: absent,
    zfsStopScrub: absent,
    zfsDeviceReplace: absent,
    zfsDeviceOffline: absent,
    zfsDeviceOnline: absent,
    zfsClearPool: absent,
  };
}

// ---- Small helpers --------------------------------------------------------------------------------

const ok = (value: unknown): FixedAnswer => ({ status: 200, value });
const fail = (status: number, message: string): FixedAnswer => ({
  status,
  message,
  code: 0,
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const param = (params: unknown, key: string): unknown =>
  typeof params === "object" && params !== null
    ? (params as Record<string, unknown>)[key]
    : undefined;
const text = (params: unknown, key: string): string => {
  const v = param(params, key);
  return typeof v === "string" ? v : "";
};

const GIB = 1024 ** 3;
const TIB = 1024 ** 4;
/** One VM scratch disk. */
const DISK = 8589934592;
/** What ZFS keeps back of each disk in a mirror or stripe (observed: 8053063680 of 8 GiB). */
const RAW_PLAIN = 0.9375;
/** A RAID-Z's raw size per disk (observed: three disks 0.97917, four 0.98437). */
const rawRaidz = (n: number) => (n === 3 ? 0.97917 : 0.98437);
/** The space for files as a share of the data disks (observed; design 0.5, as recalibrated). */
function filesShare(kind: GroupKind, n: number): number {
  switch (kind) {
    case "raidz1":
      return n === 3 ? 0.948 : 0.93;
    case "raidz2":
      return n === 4 ? 0.924 : 0.93;
    case "raidz3":
      return 0.93;
    default:
      return 0.9082;
  }
}
/** What a new file system or a pool's own folder holds by itself (observed: about 96 KiB). */
const EMPTY_FS = 98304;
const EXEC =
  "export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin; export LC_ALL=C.UTF-8; export LANGUAGE=;";
const failed = (command: string, code: number, output: string) =>
  `Failed to execute command '${EXEC} ${command}' with exit code '${String(code)}': ${output}`;

// ---- The disks ------------------------------------------------------------------------------------

const VM_DISKS = clone(
  CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value.data,
) as unknown as DiskDevice[];
const SDD_ROW = VM_DISKS.find(
  (d) => d.canonicaldevicefile === "/dev/sdd",
) as DiskDevice;

/** A scratch disk like the VM's, by kernel letter and serial number (hand-written past sdd). */
function scratchDisk(letter: string, serial: number): DiskDevice {
  const sn = `EXAMPLE-SERIAL-${String(serial).padStart(4, "0")}`;
  const id = `/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_${sn}`;
  const wwn = `EXAMPLE-WWN-${String(serial).padStart(4, "0")}`;
  return {
    ...clone(SDD_ROW),
    devicename: `sd${letter}`,
    canonicaldevicefile: `/dev/sd${letter}`,
    devicefile: id,
    devicelinks: [
      `/dev/disk/by-diskseq/${String(serial)}`,
      id,
      `/dev/disk/by-id/wwn-${wwn}`,
      `/dev/disk/by-path/pci-0000:01:02.0-ata-${String(serial + 1)}`,
      `/dev/disk/by-path/pci-0000:01:02.0-ata-${String(serial + 1)}.0`,
    ],
    description: `VMware Virtual SATA Hard Drive [/dev/sd${letter}, 8.00 GiB]`,
    serialnumber: sn,
    wwn,
  };
}

/** The disks of a story: the VM's (sde as the ZFS captures name it), and more where it needs them. */
function disksFor(name: string): DiskDevice[] {
  const disks = [...clone(VM_DISKS), scratchDisk("e", 6)];
  const extra =
    name === "zfsRaidz3"
      ? 1
      : name === "zfsGroups"
        ? 4
        : name === "zfsMany"
          ? 20
          : 0;
  for (let i = 0; i < extra; i += 1) {
    disks.push(scratchDisk(String.fromCharCode(102 + i), 7 + i));
  }
  // The VM's disk list has sr0 after sdd; keep the disks in kernel order.
  return disks;
}

const SCRATCH = /^\/dev\/sd[b-z]$/;

/** The stable by-id name of a disk. */
const idOf = (disk: DiskDevice) => disk.devicefile;
/** The last part of a path, as zpool status names a device. */
const leaf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

// ---- The remembering state -----------------------------------------------------------------------

type DevState =
  | "ONLINE"
  | "OFFLINE"
  | "UNAVAIL"
  | "FAULTED"
  | "DEGRADED"
  | "REMOVED"
  | "AVAIL"
  | "INUSE";

export interface ZDev {
  /** The path ZFS opened it by (getPoolDevices' devicefile). */
  path: string;
  /** The disk's kernel name, or "" for a disk that is not there. */
  disk: string;
  state: DevState;
  errors: [number, number, number];
  /** ZFS is copying onto it (replacing). */
  resilvering?: boolean;
  /** For a missing disk: the number zpool status prints in its place. */
  guid?: string;
}

type Slot = { dev: ZDev } | { replacing: [ZDev, ZDev] };
type GroupKind = "mirror" | "raidz1" | "raidz2" | "raidz3" | "disks";

export interface ZGroup {
  kind: GroupKind;
  slots: Slot[];
}

export interface ZPool {
  name: string;
  groups: ZGroup[];
  special: ZGroup[];
  logs: ZGroup[];
  cache: ZDev[];
  spares: ZDev[];
  /** The smallest disk of the data groups. */
  diskBytes: number;
  work: {
    kind: "scrub" | "resilver";
    percent: number;
    paused: boolean;
    since: number;
  } | null;
  last: { kind: "scrub" | "resilver" | "canceled"; at: number } | null;
  status: "OK" | "Error";
  damaged: string[];
  /** A state word the plugin reports instead of ZFS's (hand-written: "UNKNOWN"). */
  stateOverride?: string;
  capacityOverride?: number;
  /** Known to OMV: its own folder has a mount entry (false: only enumerateFilesystems lists it). */
  known: boolean;
}

export interface ZFs {
  path: string;
  pool: string;
  type: "Filesystem" | "Volume";
  /** Bytes it holds by itself (refer). */
  data: number;
  /** The size limit in bytes, or the volume's size. */
  quota: number | null;
  /** Its own compression, or null to inherit. */
  compression: string | null;
  mounted: boolean;
  encryption: "none" | "locked" | "unlocked";
  origin: string | null;
}

export interface ZSnap {
  fs: string;
  name: string;
  used: number;
  refer: number;
}

export interface ZShare {
  uuid: string;
  name: string;
  fs: string;
}

export interface ZfsMockState {
  name: string;
  disks: DiskDevice[];
  pools: ZPool[];
  fss: ZFs[];
  /** In the order they were taken (a roll-back is refused past a newer one). */
  snaps: ZSnap[];
  shares: ZShare[];
  /** Kernel names of disks that carry ZFS's partition table and are in no pool (not offered). */
  marked: string[];
  /** The mock's clock, in ms; every change moves it on. */
  clock: number;
  tasks: number;
  /** Each delete's last poll, by the handle its start answered. */
  outcomes: Record<string, { error?: string }>;
}

/** 2026-11-21 12:00:00 UTC, the captures' time. */
const START = Date.UTC(2026, 10, 21, 12, 0, 0);

const diskByKernel = (state: ZfsMockState, kernel: string) =>
  state.disks.find((d) => d.canonicaldevicefile === kernel);

/** A working disk of a pool by its kernel name: its by-id path with ZFS's partition. */
function dev(
  state: Pick<ZfsMockState, "disks">,
  kernel: string,
  over: Partial<ZDev> = {},
): ZDev {
  const disk = state.disks.find((d) => d.canonicaldevicefile === kernel);
  return {
    path: `${disk === undefined ? kernel : idOf(disk)}-part1`,
    disk: kernel,
    state: "ONLINE",
    errors: [0, 0, 0],
    ...over,
  };
}

/** A disk that is not there, last seen at a hand-written by-id path. */
function missingDev(serial: number): ZDev {
  return {
    path: `/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-${String(serial).padStart(4, "0")}-part1`,
    disk: "",
    state: "UNAVAIL",
    errors: [0, 0, 0],
    guid: `100000000000000${String(serial).padStart(4, "0")}`,
  };
}

function group(kind: GroupKind, devs: ZDev[]): ZGroup {
  return { kind, slots: devs.map((d) => ({ dev: d })) };
}

function pool(
  name: string,
  groups: ZGroup[],
  over: Partial<ZPool> = {},
): ZPool {
  return {
    name,
    groups,
    special: [],
    logs: [],
    cache: [],
    spares: [],
    diskBytes: DISK,
    work: null,
    last: null,
    status: "OK",
    damaged: [],
    known: true,
    ...over,
  };
}

function fs(path: string, over: Partial<ZFs> = {}): ZFs {
  const slash = path.indexOf("/");
  return {
    path,
    pool: slash === -1 ? path : path.slice(0, slash),
    type: "Filesystem",
    data: EMPTY_FS,
    quota: null,
    compression: slash === -1 ? "lz4" : null,
    mounted: true,
    encryption: "none",
    origin: null,
    ...over,
  };
}

/** The captured tank/media: 5 GiB of files. */
const MEDIA_DATA = 5372420096;

const devsOf = (state: ZfsMockState, kernels: string[]) =>
  kernels.map((k) => dev(state, k));

/** What a story starts with. */
export function newZfsMockState(name: string): ZfsMockState {
  const state: ZfsMockState = {
    name,
    disks: disksFor(name),
    pools: [],
    fss: [],
    snaps: [],
    shares: [],
    marked: [],
    // Past the captures' own time, so a snapshot taken here never has a captured one's name.
    clock: START + 60_000,
    tasks: 0,
    outcomes: {},
  };
  const at = START;
  const mirror = (
    over: Partial<ZPool> = {},
    kernels = ["/dev/sdb", "/dev/sdc"],
  ) => pool("tank", [group("mirror", devsOf(state, kernels))], over);
  const withMedia = (p: ZPool, over: Partial<ZFs> = {}) => {
    state.pools.push(p);
    state.fss.push(
      fs(p.name),
      fs(`${p.name}/media`, { data: MEDIA_DATA, ...over }),
    );
  };
  const alone = (p: ZPool) => {
    state.pools.push(p);
    state.fss.push(fs(p.name));
  };
  const twoSnaps = () =>
    state.snaps.push(
      {
        fs: "tank/media",
        name: "2026-11-21_12-00-00",
        used: 0,
        refer: MEDIA_DATA,
      },
      {
        fs: "tank/media",
        name: "2026-11-21_12-00-01",
        used: 0,
        refer: MEDIA_DATA,
      },
    );
  switch (name) {
    case "zfsMirror":
    case "zfsSnapshots":
      withMedia(mirror());
      twoSnaps();
      break;
    case "zfsChecking":
      withMedia(
        mirror({
          work: { kind: "scrub", percent: 1.04, paused: false, since: at },
        }),
      );
      twoSnaps();
      break;
    case "zfsPaused":
      withMedia(
        mirror({
          work: { kind: "scrub", percent: 30.41, paused: true, since: at },
        }),
      );
      break;
    case "zfsCheckStopped":
      withMedia(mirror({ last: { kind: "canceled", at } }));
      break;
    case "zfsDegraded": {
      const p = mirror({ last: { kind: "scrub", at } });
      const second = p.groups[0]?.slots[1];
      if (second !== undefined && "dev" in second) {
        second.dev.state = "OFFLINE";
      }
      withMedia(p);
      break;
    }
    case "zfsRebuilding": {
      const p = mirror({
        work: { kind: "resilver", percent: 14.4, paused: false, since: at },
      });
      const g = p.groups[0];
      if (g !== undefined) {
        g.slots[1] = {
          replacing: [
            dev(state, "/dev/sdc"),
            dev(state, "/dev/sdd", { resilvering: true }),
          ],
        };
      }
      withMedia(p);
      break;
    }
    case "zfsReplaced":
      withMedia(
        mirror({ last: { kind: "resilver", at } }, ["/dev/sdb", "/dev/sdd"]),
      );
      state.marked.push("/dev/sdc");
      break;
    case "zfsRaidz1":
      alone(
        pool("tank", [
          group("raidz1", devsOf(state, ["/dev/sdb", "/dev/sdc", "/dev/sdd"])),
        ]),
      );
      break;
    case "zfsRaidz2":
      alone(
        pool("tank", [
          group(
            "raidz2",
            devsOf(state, ["/dev/sdb", "/dev/sdc", "/dev/sdd", "/dev/sde"]),
          ),
        ]),
      );
      break;
    case "zfsRaidz3":
      alone(
        pool("tank", [
          group(
            "raidz3",
            devsOf(state, [
              "/dev/sdb",
              "/dev/sdc",
              "/dev/sdd",
              "/dev/sde",
              "/dev/sdf",
            ]),
          ),
        ]),
      );
      break;
    case "zfsStripe":
      alone(
        pool("tank", [group("disks", devsOf(state, ["/dev/sdb", "/dev/sdc"]))]),
      );
      break;
    case "zfsSingle":
      alone(pool("tank", [group("disks", devsOf(state, ["/dev/sdb"]))]));
      break;
    case "zfsLeftover":
    case "zfsCreateFails":
      if (name === "zfsLeftover") {
        state.marked.push("/dev/sdb", "/dev/sdc");
      }
      break;
    case "zfsSpare":
      withMedia(
        mirror({
          spares: [
            dev(state, "/dev/sdd", {
              state: "AVAIL",
              path: `${idOf(diskByKernel(state, "/dev/sdd") as DiskDevice)}-part1`,
            }),
          ],
        }),
      );
      break;
    case "zfsErrors": {
      const p = mirror({ last: { kind: "scrub", at } });
      const first = p.groups[0]?.slots[0];
      if (first !== undefined && "dev" in first) {
        first.dev.errors = [3, 0, 12];
      }
      withMedia(p);
      break;
    }
    case "zfsDamaged":
      withMedia(
        mirror({
          status: "Error",
          last: { kind: "scrub", at },
          damaged: [
            "/tank/media/2026/holiday.jpg",
            "/tank/media/documents/report.odt",
          ],
        }),
      );
      break;
    case "zfsUnusable":
      state.pools.push(
        pool("tank", [
          group("raidz1", [
            dev(state, "/dev/sdb"),
            missingDev(91),
            missingDev(92),
          ]),
        ]),
      );
      state.fss.push(fs("tank", { mounted: false }));
      break;
    case "zfsMissing":
      withMedia(
        pool("tank", [
          group("mirror", [dev(state, "/dev/sdb"), missingDev(92)]),
        ]),
      );
      break;
    case "zfsFull": {
      const tank = mirror();
      withMedia(tank, { data: Math.round(0.85 * DISK * RAW_PLAIN) - EMPTY_FS });
      tank.capacityOverride = 85;
      const backup = pool(
        "backup",
        [group("disks", devsOf(state, ["/dev/sdd"]))],
        {
          capacityOverride: 96,
        },
      );
      state.pools.push(backup);
      state.fss.push(
        fs("backup", { data: Math.round(0.96 * DISK * RAW_PLAIN) }),
      );
      break;
    }
    case "zfsLocked":
      withMedia(mirror());
      state.fss.push(
        fs("tank/secret", { encryption: "locked", mounted: false, data: GIB }),
      );
      break;
    case "zfsVolume":
      withMedia(mirror());
      state.fss.push(
        fs("tank/vm1", {
          type: "Volume",
          quota: 2 * GIB,
          data: 512 * 1024 ** 2,
          mounted: false,
        }),
      );
      break;
    case "zfsClone":
      withMedia(mirror());
      state.snaps.push({
        fs: "tank/media",
        name: "2026-11-21_12-00-00",
        used: 0,
        refer: MEDIA_DATA,
      });
      state.fss.push(
        fs("tank/copy", {
          origin: "tank/media@2026-11-21_12-00-00",
          data: EMPTY_FS,
        }),
      );
      break;
    case "zfsNested":
      withMedia(mirror());
      state.fss.push(fs("tank/media/photos", { data: 2 * GIB }));
      break;
    case "zfsGroups":
      state.pools.push(
        pool(
          "tank",
          [
            group("mirror", devsOf(state, ["/dev/sdb", "/dev/sdc"])),
            group("mirror", devsOf(state, ["/dev/sdd", "/dev/sde"])),
          ],
          {
            special: [group("mirror", devsOf(state, ["/dev/sdf", "/dev/sdg"]))],
            logs: [group("disks", devsOf(state, ["/dev/sdh"]))],
            cache: devsOf(state, ["/dev/sdi"]),
          },
        ),
      );
      state.fss.push(fs("tank"), fs("tank/media", { data: MEDIA_DATA }));
      break;
    case "zfsStateUnknown":
      withMedia(mirror({ stateOverride: "UNKNOWN" }));
      break;
    case "zfsReportFails":
    case "zfsEmptyDevices":
    case "zfsShared":
    case "zfsBroken":
      withMedia(mirror());
      if (name === "zfsShared") {
        state.shares.push({
          uuid: "00000000-0000-4000-8000-000000000a01",
          name: "media",
          fs: "tank/media",
        });
      }
      break;
    case "zfsKernelNames":
      withMedia(
        pool("tank", [
          group("mirror", [
            dev(state, "/dev/sdb", { path: "/dev/sdb1" }),
            dev(state, "/dev/sdc", { path: "/dev/sdc1" }),
          ]),
        ]),
      );
      break;
    case "zfsUnknownToOmv":
      withMedia(mirror());
      state.pools.push(
        pool("backup", [group("disks", devsOf(state, ["/dev/sdd"]))], {
          known: false,
        }),
      );
      state.fss.push(fs("backup"), fs("backup/old", { data: GIB }));
      break;
    case "zfsMany":
      for (let i = 0; i < 20; i += 1) {
        const p = pool(`pool${String(i + 1).padStart(2, "0")}`, [
          group(
            "disks",
            devsOf(state, [`/dev/sd${String.fromCharCode(102 + i)}`]),
          ),
        ]);
        if (i === 3) {
          p.work = { kind: "scrub", percent: 50, paused: false, since: at };
        }
        alone(p);
      }
      break;
    case "zfsHostile": {
      const long = `p${"x".repeat(63)}`;
      withMedia(mirror());
      state.fss.push(
        fs(`tank/${"m".repeat(64)}`),
        fs("tank/<img src=x onerror=alert(1)>"),
        fs("tank/תמונות-משפחה"),
      );
      alone(pool(long, [group("disks", devsOf(state, ["/dev/sdd"]))]));
      alone(pool("my pool", [group("disks", devsOf(state, ["/dev/sde"]))]));
      break;
    }
    case "zfsManySnapshots":
      withMedia(mirror());
      for (let i = 0; i < 500; i += 1) {
        const t = new Date(Date.UTC(2026, 0, 1) + i * 3600_000);
        state.snaps.push({
          fs: "tank/media",
          name: snapName(t.getTime()),
          used: (i % 7) * 1024 ** 2,
          refer: MEDIA_DATA,
        });
      }
      break;
    default:
      break;
  }
  return state;
}

// ---- What the replies say -------------------------------------------------------------------------

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
const p2 = (n: number) => String(n).padStart(2, "0");

/** zpool status's date ("Sat Nov 21 12:00:00 2026"); with `zone`, the plugin's ("… UTC 2026"). */
function zdate(ms: number, zone = false): string {
  const d = new Date(ms);
  const time = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
  return `${DAYS[d.getUTCDay()] ?? ""} ${MONTHS[d.getUTCMonth()] ?? ""} ${String(d.getUTCDate())} ${time} ${zone ? "UTC " : ""}${String(d.getUTCFullYear())}`;
}

/** quickSnapshot's name: the NAS's date and time to the second. */
function snapName(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear())}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}_${p2(d.getUTCHours())}-${p2(d.getUTCMinutes())}-${p2(d.getUTCSeconds())}`;
}

const hms = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
};

/** ZFS's short sizes: "5.00G", "738M", "53.2M", "0B". */
function zsize(bytes: number): string {
  if (bytes <= 0) {
    return "0B";
  }
  const units = ["B", "K", "M", "G", "T", "P"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  const digits = u === 0 ? 0 : v < 10 ? 2 : v < 100 ? 1 : 0;
  return `${v.toFixed(digits)}${units[u] ?? ""}`;
}

/** OMV's binary sizes in its descriptions: "528.00 KiB". */
function omvSize(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(2)} ${units[u] ?? ""}`;
}

const slotDevs = (slot: Slot): ZDev[] =>
  "dev" in slot ? [slot.dev] : [...slot.replacing];
const groupDevs = (g: ZGroup) => g.slots.flatMap(slotDevs);
const allDevs = (p: ZPool): ZDev[] => [
  ...p.groups.flatMap(groupDevs),
  ...p.special.flatMap(groupDevs),
  ...p.logs.flatMap(groupDevs),
  ...p.cache,
  ...p.spares,
];
/** The disks a pool holds, by kernel name. */
export const poolDisks = (p: ZPool): string[] =>
  allDevs(p)
    .map((d) => d.disk)
    .filter((d) => d !== "");

const works = (d: ZDev) => d.state === "ONLINE" || d.state === "DEGRADED";
/** A slot keeps its data: its disk works, or, while replaced, the old one still does. */
const slotWorks = (slot: Slot) =>
  "dev" in slot
    ? works(slot.dev)
    : works(slot.replacing[0]) && !slot.replacing[0].resilvering;
const parity = (kind: GroupKind) =>
  kind === "raidz1" ? 1 : kind === "raidz2" ? 2 : kind === "raidz3" ? 3 : 0;

function groupState(g: ZGroup): DevState {
  const missing = g.slots.filter((s) => !slotWorks(s)).length;
  if (missing === 0) {
    return "ONLINE";
  }
  if (g.kind === "mirror") {
    return missing < g.slots.length ? "DEGRADED" : "UNAVAIL";
  }
  if (g.kind === "disks") {
    return "UNAVAIL";
  }
  return missing <= parity(g.kind) ? "DEGRADED" : "UNAVAIL";
}

function poolStateOf(p: ZPool): string {
  if (p.stateOverride !== undefined) {
    return p.stateOverride;
  }
  const states = [...p.groups, ...p.special].map(groupState);
  if (states.includes("UNAVAIL")) {
    return "UNAVAIL";
  }
  return states.includes("DEGRADED") ? "DEGRADED" : "ONLINE";
}

/** The disks' raw space (the pool row's size), parity included. */
function rawSize(p: ZPool): number {
  return p.groups.reduce((sum, g) => {
    const n = g.slots.length;
    if (g.kind === "mirror") {
      return sum + Math.round(p.diskBytes * RAW_PLAIN);
    }
    if (g.kind === "disks") {
      return sum + Math.round(n * p.diskBytes * RAW_PLAIN);
    }
    return sum + Math.round(n * p.diskBytes * rawRaidz(n));
  }, 0);
}

/** The space for files (the own folder's used + available), as the VM measured it (design 0.5). */
function filesSpace(p: ZPool): number {
  return p.groups.reduce((sum, g) => {
    const n = g.slots.length;
    const data = g.kind === "mirror" ? 1 : n - parity(g.kind);
    return sum + Math.round(data * p.diskBytes * filesShare(g.kind, n));
  }, 0);
}

/** Raw bytes the data takes: a RAID-Z's parity on top (each group's share, by the first). */
function rawUsed(p: ZPool, data: number): number {
  const g = p.groups[0];
  if (g === undefined || g.kind === "mirror" || g.kind === "disks") {
    return data;
  }
  const n = g.slots.length;
  return Math.round((data * n) / (n - parity(g.kind)));
}

const childrenOf = (state: ZfsMockState, path: string) =>
  state.fss.filter((f) => f.path.startsWith(`${path}/`));
const snapsOf = (state: ZfsMockState, path: string) =>
  state.snaps.filter((s) => s.fs === path || s.fs.startsWith(`${path}/`));

/** Bytes a file system and everything inside it hold, its snapshots included. */
function usedOf(state: ZfsMockState, path: string): number {
  const own = state.fss.find((f) => f.path === path);
  const volume = own?.type === "Volume" ? (own.quota ?? 0) : 0;
  return (
    Math.max(own?.data ?? 0, volume) +
    childrenOf(state, path).reduce(
      (sum, f) => sum + (f.type === "Volume" ? (f.quota ?? f.data) : f.data),
      0,
    ) +
    snapsOf(state, path).reduce((sum, s) => sum + s.used, 0)
  );
}

function poolFree(state: ZfsMockState, p: ZPool): number {
  return Math.max(0, filesSpace(p) - usedOf(state, p.name));
}

function available(state: ZfsMockState, f: ZFs): number {
  const p = state.pools.find((x) => x.name === f.pool);
  const free = p === undefined ? 0 : poolFree(state, p);
  if (f.type === "Filesystem" && f.quota !== null) {
    return Math.max(0, Math.min(free, f.quota - usedOf(state, f.path)));
  }
  return free;
}

function capacityOf(state: ZfsMockState, p: ZPool): number {
  if (p.capacityOverride !== undefined) {
    return p.capacityOverride;
  }
  const raw = rawSize(p);
  return raw === 0
    ? 0
    : Math.floor((rawUsed(p, usedOf(state, p.name)) / raw) * 100);
}

/** The compression in effect: its own, or its parent's. */
function compressionOf(state: ZfsMockState, path: string): string {
  const f = state.fss.find((x) => x.path === path);
  if (f?.compression != null) {
    return f.compression;
  }
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "off" : compressionOf(state, path.slice(0, slash));
}

const isShared = (state: ZfsMockState, path: string) =>
  state.shares.some((s) => s.fs === path);

// ---- zpool status ---------------------------------------------------------------------------------

interface TreeLine {
  indent: number;
  name: string;
  state?: string;
  errors?: [number, number, number];
  suffix?: string;
}

/** zpool status's name for a device: its path's last part, without ZFS's partition on a by-id path. */
const devName = (d: ZDev) =>
  d.guid !== undefined && d.state === "UNAVAIL"
    ? d.guid
    : d.path.startsWith("/dev/disk/by-id/")
      ? leaf(d.path).replace(/-part1$/, "")
      : leaf(d.path);

function devLine(d: ZDev, indent: number): TreeLine {
  const suffix =
    d.guid !== undefined && d.state === "UNAVAIL"
      ? `was ${d.path}`
      : d.resilvering === true
        ? "(resilvering)"
        : undefined;
  return d.state === "AVAIL" || d.state === "INUSE"
    ? { indent, name: devName(d), state: d.state }
    : { indent, name: devName(d), state: d.state, errors: d.errors, suffix };
}

/** The top-level vdevs' names, numbered across classes as ZFS does. */
function groupLines(
  groups: ZGroup[],
  indent: number,
  first: number,
): TreeLine[] {
  const lines: TreeLine[] = [];
  groups.forEach((g, gi) => {
    const inner = g.kind === "disks" ? indent : indent + 2;
    if (g.kind !== "disks") {
      lines.push({
        indent,
        name: `${g.kind}-${String(first + gi)}`,
        state: groupState(g),
        errors: [0, 0, 0],
      });
    }
    g.slots.forEach((slot, si) => {
      if ("dev" in slot) {
        lines.push(devLine(slot.dev, inner));
        return;
      }
      const [old] = slot.replacing;
      lines.push({
        indent: inner,
        name: `replacing-${String(si)}`,
        state: works(old) ? "ONLINE" : "DEGRADED",
        errors: [0, 0, 0],
      });
      for (const d of slot.replacing) {
        lines.push(devLine(d, inner + 2));
      }
    });
  });
  return lines;
}

function treeLines(p: ZPool): TreeLine[] {
  const lines: TreeLine[] = [
    {
      indent: 0,
      name: p.name,
      state: poolStateOf(p) === "UNKNOWN" ? "ONLINE" : poolStateOf(p),
      errors: [0, 0, 0],
    },
    ...groupLines(p.groups, 2, 0),
  ];
  let next = p.groups.length;
  if (p.special.length > 0) {
    lines.push(
      { indent: 0, name: "special" },
      ...groupLines(p.special, 2, next),
    );
    next += p.special.length;
  }
  if (p.logs.length > 0) {
    lines.push({ indent: 0, name: "logs" }, ...groupLines(p.logs, 2, next));
  }
  if (p.cache.length > 0) {
    lines.push(
      { indent: 0, name: "cache" },
      ...p.cache.map((d) => devLine(d, 2)),
    );
  }
  if (p.spares.length > 0) {
    lines.push(
      { indent: 0, name: "spares" },
      ...p.spares.map((d) => devLine(d, 2)),
    );
  }
  return lines;
}

function formatTree(lines: TreeLine[]): string[] {
  const width = Math.max(10, ...lines.map((l) => l.indent + l.name.length));
  const row = (l: TreeLine) => {
    const name = `${" ".repeat(l.indent)}${l.name}`;
    if (l.state === undefined) {
      return `\t${name}`;
    }
    const counts =
      l.errors === undefined
        ? ""
        : l.errors.map((n) => ` ${String(n).padStart(5)}`).join("");
    const head = `\t${name.padEnd(width)}  ${l.errors === undefined ? l.state : l.state.padEnd(8)}${counts}`;
    return l.suffix === undefined ? head : `${head}  ${l.suffix}`;
  };
  return [
    `\t${"NAME".padEnd(width)}  STATE     READ WRITE CKSUM`,
    ...lines.map(row),
  ];
}

const SCRUB_SECONDS = 96;
const RESILVER_SECONDS = 6;

function scanLines(state: ZfsMockState, p: ZPool): string[] {
  const data = usedOf(state, p.name);
  const w = p.work;
  if (w !== null) {
    const issued = zsize(Math.round((data * w.percent) / 100));
    if (w.kind === "scrub" && w.paused) {
      return [
        `  scan: scrub paused since ${zdate(w.since)}`,
        `\tscrub started on ${zdate(w.since)}`,
        `\t${zsize(data)} / ${zsize(data)} scanned, ${issued} / ${zsize(data)} issued`,
        `\t0B repaired, ${w.percent.toFixed(2)}% done`,
      ];
    }
    const left = hms(
      ((100 - w.percent) / 100) *
        (w.kind === "scrub" ? SCRUB_SECONDS : RESILVER_SECONDS),
    );
    return [
      `  scan: ${w.kind} in progress since ${zdate(w.since)}`,
      `\t${zsize(data)} / ${zsize(data)} scanned, ${issued} / ${zsize(data)} issued at ${issued}/s`,
      `\t${w.kind === "scrub" ? "0B repaired" : `${issued} resilvered`}, ${w.percent.toFixed(2)}% done, ${left} to go`,
    ];
  }
  const last = p.last;
  if (last === null) {
    return [];
  }
  if (last.kind === "canceled") {
    return [`  scan: scrub canceled on ${zdate(last.at)}`];
  }
  if (last.kind === "resilver") {
    return [
      `  scan: resilvered ${zsize(data + 9_000_000)} in ${hms(RESILVER_SECONDS + 1)} with 0 errors on ${zdate(last.at)}`,
    ];
  }
  return [
    `  scan: scrub repaired 0B in ${hms(3)} with 0 errors on ${zdate(last.at)}`,
  ];
}

/** The status: and action: paragraphs ZFS writes for a pool that is not plainly fine. */
function adviceLines(p: ZPool): string[] {
  const devs = allDevs(p);
  if (p.work?.kind === "resilver") {
    return [
      "status: One or more devices is currently being resilvered.  The pool will",
      "\tcontinue to function, possibly in a degraded state.",
      "action: Wait for the resilver to complete.",
    ];
  }
  if (poolStateOf(p) === "UNAVAIL") {
    return [
      "status: One or more devices could not be opened.  There are insufficient",
      "\treplicas for the pool to continue functioning.",
      "action: Attach the missing device and online it using 'zpool online'.",
      "   see: https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-3C",
    ];
  }
  if (devs.some((d) => d.state === "UNAVAIL")) {
    return [
      "status: One or more devices could not be used because the label is missing or",
      "\tinvalid.  Sufficient replicas exist for the pool to continue",
      "\tfunctioning in a degraded state.",
      "action: Replace the device using 'zpool replace'.",
      "   see: https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-4J",
    ];
  }
  if (devs.some((d) => d.state === "OFFLINE")) {
    return [
      "status: One or more devices has been taken offline by the administrator.",
      "\tSufficient replicas exist for the pool to continue functioning in a",
      "\tdegraded state.",
      "action: Online the device using 'zpool online' or replace the device with",
      "\t'zpool replace'.",
    ];
  }
  if (p.status === "Error") {
    return [
      "status: One or more devices has experienced an error resulting in data",
      "\tcorruption.  Applications may be affected.",
      "action: Restore the file in question if possible.  Otherwise restore the",
      "\tentire pool from backup.",
      "   see: https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-8A",
    ];
  }
  if (devs.some((d) => d.errors.some((n) => n > 0))) {
    return [
      "status: One or more devices has experienced an unrecoverable error.  An",
      "\tattempt was made to correct the error.  Applications are unaffected.",
      "action: Determine if the device needs to be replaced, and clear the errors",
      "\tusing 'zpool clear' or replace the device with 'zpool replace'.",
      "   see: https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-9P",
    ];
  }
  return [];
}

/** The plugin's report of a pool (getObjectDetails, type Pool), lines joined as it joins them. */
export function poolReport(state: ZfsMockState, p: ZPool): string {
  const errors =
    p.damaged.length === 0
      ? ["errors: No known data errors"]
      : [
          "errors: Permanent errors have been detected in the following files:",
          "",
          ...p.damaged.map((file) => `        ${file}`),
        ];
  return [
    "Pool status (zpool status -v):",
    "",
    `  pool: ${p.name}`,
    ` state: ${poolStateOf(p) === "UNKNOWN" ? "ONLINE" : poolStateOf(p)}`,
    ...adviceLines(p),
    ...scanLines(state, p),
    "config:",
    "",
    ...formatTree(treeLines(p)),
    "",
    ...errors,
  ].join("\n\r");
}

const FS_REPORT = String(
  CONTRACT_EXAMPLES.zfsGetObjectDetails.filesystem.value,
);

/** A file system's report (getObjectDetails, type Filesystem): the captured one, renamed and set. */
function fsReport(state: ZfsMockState, f: ZFs): string {
  const used = usedOf(state, f.path);
  return FS_REPORT.split("\n\r")
    .map((line) =>
      line
        .replace(
          /^tank\/media(\s+)quota(\s+)\S+(\s+)\S+$/,
          `tank/media$1quota$2${f.quota === null ? "none" : zsize(f.quota)}$3${f.quota === null ? "default" : "local"}`,
        )
        .replace(
          /^tank\/media(\s+)compression(\s+)\S+/,
          `tank/media$1compression$2${compressionOf(state, f.path)}`,
        )
        .replace(
          /^tank\/media(\s+)used(\s+)\S+/,
          `tank/media$1used$2${zsize(used)}`,
        ),
    )
    .map((line) => line.replaceAll("tank/media", f.path))
    .join("\n\r");
}

// ---- Zfs.listPools --------------------------------------------------------------------------------

const idPath = (path: string) => {
  const slash = path.indexOf("/");
  return slash === -1 ? `root/poolfs-${path}` : `root/pool-${path}`;
};
const parentIdOf = (path: string) => {
  const slash = path.lastIndexOf("/");
  if (slash === -1) {
    return "root";
  }
  const parent = path.slice(0, slash);
  return parent.includes("/") ? `root/pool-${parent}` : `root/pool-${parent}`;
};

function lastScrub(p: ZPool): {
  lastscrub: string;
  scrubstate: string;
  scrubactive: boolean;
} {
  const w = p.work;
  if (w !== null) {
    return w.paused
      ? {
          lastscrub: `paused (started ${zdate(w.since, true)})`,
          scrubstate: "paused",
          scrubactive: true,
        }
      : {
          lastscrub: `in progress since ${zdate(w.since, true)}`,
          scrubstate: "running",
          scrubactive: true,
        };
  }
  if (p.last === null) {
    return { lastscrub: "Never", scrubstate: "none", scrubactive: false };
  }
  return p.last.kind === "canceled"
    ? {
        lastscrub: `canceled on ${zdate(p.last.at, true)}`,
        scrubstate: "stopped",
        scrubactive: false,
      }
    : {
        lastscrub: zdate(p.last.at, true),
        scrubstate: "completed",
        scrubactive: false,
      };
}

function poolRow(state: ZfsMockState, p: ZPool): Record<string, unknown> {
  const raw = rawSize(p);
  const used = rawUsed(p, usedOf(state, p.name));
  return {
    id: `root/pool-${p.name}`,
    parentid: "root",
    name: p.name,
    type: "Pool",
    icon: "images/raid.png",
    expanded: true,
    path: p.name,
    origin: "n/a",
    size: raw,
    used,
    usedpercent: raw === 0 ? 0 : (used / raw) * 100,
    available: Math.max(0, raw - used),
    mountpoint: `/${p.name}`,
    ...lastScrub(p),
    state: poolStateOf(p),
    status: p.status,
    removalstate: "none",
    removalactive: false,
    encryption: "OFF",
    keystatus: "-",
    autounlock: false,
    hasshares: isShared(state, p.name),
    fragmentation: 1,
    dedup: "1.00",
    capacity: capacityOf(state, p),
    devices: allDevs(p)
      .map((d) => d.path)
      .join("<br/>"),
    haschildren: true,
  };
}

function objectRow(state: ZfsMockState, f: ZFs): Record<string, unknown> {
  const root = !f.path.includes("/");
  const used = usedOf(state, f.path);
  const avail = available(state, f);
  const encrypted = f.encryption !== "none";
  const volume = f.type === "Volume";
  return {
    id: idPath(f.path),
    parentid: root ? "root" : parentIdOf(f.path),
    name: root ? f.path : leaf(f.path),
    type: f.type,
    icon: volume ? "images/zfs_disk.png" : "images/filesystem.png",
    path: f.path,
    pool: f.pool,
    expanded: true,
    origin: f.origin ?? "n/a",
    size: f.quota,
    used,
    usedpercent: used + avail === 0 ? 0 : (used / (used + avail)) * 100,
    available: avail,
    mountpoint: volume ? "n/a" : `/${f.path}`,
    lastscrub: "n/a",
    state: "n/a",
    status: "n/a",
    scrubstate: "n/a",
    scrubactive: false,
    encryption: encrypted ? "AES-256-GCM" : "OFF",
    keystatus: encrypted
      ? f.encryption === "locked"
        ? "unavailable"
        : "available"
      : "-",
    autounlock: false,
    isencryptionroot: encrypted,
    hasshares: isShared(state, f.path),
    compression: compressionOf(state, f.path),
    compressratio: "1.00",
    refer: f.data,
    mounted: f.mounted,
    poolroot: root,
    haschildren:
      childrenOf(state, f.path).length > 0 || snapsOf(state, f.path).length > 0,
  };
}

/** listPools' flat list: each pool, its own folder, then what is inside it, in tree order. */
function listRows(state: ZfsMockState): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const p of state.pools) {
    rows.push(poolRow(state, p));
    const inPool = state.fss
      .filter((f) => f.pool === p.name)
      .sort((a, b) =>
        a.path === p.name
          ? -1
          : b.path === p.name
            ? 1
            : a.path.localeCompare(b.path),
      );
    for (const f of inPool) {
      rows.push(objectRow(state, f));
    }
  }
  return rows;
}

// ---- OMV's file-system lists ----------------------------------------------------------------------

/** The captured row of the pool's own folder, from each list: the shape every ZFS row takes. */
const zfsRowOf = (rows: readonly unknown[]): Record<string, unknown> =>
  clone(
    rows.find((r) => (r as { type?: unknown }).type === "zfs") as Record<
      string,
      unknown
    >,
  );
const ZFS_CONFIGURED_ROW = zfsRowOf(
  CONTRACT_EXAMPLES.fileSystemMgmtGetList.zfs.value.data,
);
const ZFS_DETECTED_ROW = zfsRowOf(
  CONTRACT_EXAMPLES.fileSystemMgmtEnumerateFilesystems.zfs.value,
);
const ZFS_MOUNTED_ROW = zfsRowOf(
  CONTRACT_EXAMPLES.fileSystemMgmtEnumerateMountedFilesystems.zfs.value,
);

export type FsList = "configured" | "detected" | "mounted";

/**
 * The ZFS rows of OMV's file-system lists (observed): the pool's own folder and each file system,
 * uuid null, the full name as device file and label, the pool's disks as devices. A pool OMV does
 * not know yet is only in enumerateFilesystems; a file system that is not mounted is not in the
 * mounted list; a volume is in none.
 */
export function zfsFsRows(
  state: ZfsMockState | undefined,
  list: FsList,
): Record<string, unknown>[] {
  if (state === undefined) {
    return [];
  }
  const template =
    list === "configured"
      ? ZFS_CONFIGURED_ROW
      : list === "detected"
        ? ZFS_DETECTED_ROW
        : ZFS_MOUNTED_ROW;
  return state.fss.flatMap((f) => {
    const p = state.pools.find((x) => x.name === f.pool);
    if (p === undefined || f.type === "Volume") {
      return [];
    }
    if (list !== "detected" && !p.known) {
      return [];
    }
    if (list === "mounted" && !f.mounted) {
      return [];
    }
    const disks = poolDisks(p);
    const used = usedOf(state, f.path);
    const avail = available(state, f);
    const size = used + avail;
    const percent = size === 0 ? 0 : Math.round((used / size) * 100);
    return [
      {
        ...clone(template),
        devicename: f.path,
        devicefile: f.path,
        predictabledevicefile: f.path,
        canonicaldevicefile: f.path,
        parentdevicefile: disks[0] ?? "",
        label: f.path,
        blocks: Math.floor(size / 1024),
        mounted: f.mounted,
        mountpoint: f.mounted ? `/${f.path}` : "",
        used: omvSize(used),
        available: avail,
        size,
        percentage: percent,
        description: `${f.path} [${omvSize(used)} (${String(percent)}%) used, ${omvSize(avail)} available]`,
        devicefiles: disks,
      },
    ];
  });
}

// ---- The answers ---------------------------------------------------------------------------------

export interface ZfsHooks {
  /** Mark these modules pending, as OMV does for the call. */
  dirty: (modules: readonly string[]) => void;
  /** These disks are in a pool now, or carry ZFS's partition table: no file system is offered on them. */
  taken: (disks: readonly string[]) => void;
  /** FsTab.getByFsName as the file-system mock answers it, for any other name. */
  mountEntry: (params: unknown) => FixedAnswer;
}

const MOUNT_MODULES = ["fstab", "collectd", "monit", "quota"];
const PROPERTY_MODULES = ["collectd", "monit", "quota"];
const RESERVED = /^(mirror|raidz|draid|spare)|^log$/i;
const BROKEN =
  "Failed to execute command 'export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin; export LC_ALL=C.UTF-8; export LANGUAGE=; zpool list -H -p' with exit code '1': The ZFS modules cannot be auto-loaded.\nTry running 'modprobe zfs' as root to manually load them.";
/** A handle of the mock's own deletes; opaque like the server's. */
export const ZFS_DELETE_HANDLE = "/tmp/bgstatuszfsmock";

/** The candidates' rows: every scratch disk in no pool and without ZFS's partition table. */
function candidates(state: ZfsMockState): Record<string, unknown>[] {
  const inPools = new Set(state.pools.flatMap(poolDisks));
  return state.disks
    .filter(
      (d) =>
        SCRATCH.test(d.canonicaldevicefile) &&
        !inPools.has(d.canonicaldevicefile) &&
        !state.marked.includes(d.canonicaldevicefile),
    )
    .map((d) => ({
      devicefile: idOf(d),
      size: d.size,
      vendor: d.vendor,
      serialnumber: d.serialnumber,
      description: `${d.model} [${d.canonicaldevicefile}, ${omvSize(Number(d.size))}]`,
      label: `${d.model} [${d.canonicaldevicefile}, ${omvSize(Number(d.size))}], S/N: ${d.serialnumber}`,
    }));
}

/** The kernel name of a disk named by its by-id path (whole disk), if it is one of the story's. */
const kernelOfId = (state: ZfsMockState, id: string) =>
  state.disks.find((d) => idOf(d) === id)?.canonicaldevicefile;

interface Found {
  p: ZPool;
  slots: Slot[];
  index: number;
  dev: ZDev;
  group: ZGroup | null;
}

/** A device of a pool by the path getPoolDevices gave for it. */
function findDev(p: ZPool, path: string): Found | null {
  for (const g of [...p.groups, ...p.special, ...p.logs]) {
    for (let i = 0; i < g.slots.length; i += 1) {
      const slot = g.slots[i];
      if (slot !== undefined && slotDevs(slot).some((d) => d.path === path)) {
        const d = slotDevs(slot).find((x) => x.path === path) as ZDev;
        return { p, slots: g.slots, index: i, dev: d, group: g };
      }
    }
  }
  for (const list of [p.cache, p.spares]) {
    const d = list.find((x) => x.path === path);
    if (d !== undefined) {
      return { p, slots: [], index: -1, dev: d, group: null };
    }
  }
  return null;
}

/** getPoolDevices: every disk with its group's name, as the plugin lists them. */
export function poolDevices(p: ZPool): Record<string, unknown>[] {
  const rows: { path: string; state: string; vdev: string }[] = [];
  const push = (groups: ZGroup[], first: number, plain: string) =>
    groups.forEach((g, gi) => {
      g.slots.forEach((slot, si) => {
        const vdev =
          "replacing" in slot
            ? `replacing-${String(si)}`
            : g.kind === "disks"
              ? plain
              : `${g.kind}-${String(first + gi)}`;
        for (const d of slotDevs(slot)) {
          rows.push({ path: d.path, state: d.state, vdev });
        }
      });
    });
  push(p.groups, 0, "");
  push(p.special, p.groups.length, "special");
  push(p.logs, p.groups.length + p.special.length, "logs");
  for (const d of p.cache) {
    rows.push({ path: d.path, state: d.state, vdev: "cache" });
  }
  for (const d of p.spares) {
    rows.push({ path: d.path, state: d.state, vdev: "spares" });
  }
  return rows.map((r) => ({
    devicefile: r.path,
    state: r.state,
    vdev: r.vdev,
    label: `${r.path}  [${r.vdev === "" ? "stripe" : r.vdev}] [${r.state}]`,
  }));
}

/** Move a pool's check or rebuild on by a tenth; a finished one ends (a rebuild lets go of the old disk). */
function advance(state: ZfsMockState, p: ZPool): void {
  const w = p.work;
  if (w === null || w.paused) {
    return;
  }
  w.percent = Math.min(100, w.percent + 10);
  if (w.percent < 100) {
    return;
  }
  state.clock += 60_000;
  if (w.kind === "resilver") {
    for (const g of [...p.groups, ...p.special]) {
      g.slots = g.slots.map((slot) => {
        if (!("replacing" in slot)) {
          return slot;
        }
        const [old, fresh] = slot.replacing;
        // The old disk keeps ZFS's partition table: not offered until it is wiped (observed).
        if (old.disk !== "" && !state.marked.includes(old.disk)) {
          state.marked.push(old.disk);
        }
        return { dev: { ...fresh, resilvering: false } };
      });
    }
  }
  p.last = { kind: w.kind, at: state.clock };
  p.work = null;
}

/** Whether taking `found`'s disk out of use leaves its group a copy (ZFS's own refusal). */
function leavesCopy(found: Found): boolean {
  const g = found.group;
  if (g === null || g.kind === "disks") {
    return false;
  }
  const missing = g.slots.filter(
    (s, i) => i === found.index || !slotWorks(s),
  ).length;
  return g.kind === "mirror"
    ? missing < g.slots.length
    : missing <= parity(g.kind);
}

export function zfsAnswers(
  name: string,
  state: ZfsMockState,
  hooks: ZfsHooks,
): Record<string, (call: { params: unknown }) => FixedAnswer> {
  if (!isZfsScenario(name)) {
    return {};
  }
  if (name === "zfsNoPlugin") {
    return Object.fromEntries(
      ZFS_OPERATIONS.map((op) => [op, () => ZFS_NOT_INSTALLED]),
    );
  }
  const findPool = (n: string) => state.pools.find((p) => p.name === n);
  const findFs = (path: string) => state.fss.find((f) => f.path === path);
  const read = (answer: () => FixedAnswer) => () =>
    name === "zfsBroken" ? fail(500, BROKEN) : answer();
  const tick = () => {
    state.clock += 1000;
  };
  const task = (error?: string): FixedAnswer => {
    state.tasks += 1;
    const handle = `${ZFS_DELETE_HANDLE}${String(state.tasks)}`;
    state.outcomes[handle] = error === undefined ? {} : { error };
    return ok(handle);
  };

  return {
    zfsListCompressionTypes: () =>
      ok(clone(CONTRACT_EXAMPLES.zfsListCompressionTypes.list.value)),
    zfsListPools: read(() => {
      const data = listRows(state);
      return ok({ total: data.length, data });
    }),
    zfsGetPoolStatus: read(() =>
      ok(
        state.pools.map((p) => ({
          name: p.name,
          state: poolStateOf(p),
          status: p.status,
          capacity: capacityOf(state, p),
        })),
      ),
    ),
    zfsGetEmptyCandidates: read(() => ok(candidates(state))),
    zfsGetPoolDevices: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const p = findPool(text(params, "name"));
      // The plugin answers an empty list for a pool it cannot ask about (observed).
      return ok(
        p === undefined || name === "zfsEmptyDevices" ? [] : poolDevices(p),
      );
    },
    zfsGetObjectDetails: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const object = text(params, "name");
      if (param(params, "type") === "Filesystem") {
        const f = findFs(object);
        return f === undefined || f.type !== "Filesystem"
          ? fail(
              500,
              failed(
                `zfs list -H '${object}'`,
                1,
                `cannot open '${object}': dataset does not exist`,
              ),
            )
          : ok(fsReport(state, f));
      }
      const p = findPool(object);
      if (p === undefined) {
        return fail(500, failed(`zpool status -v '${object}'`, 1, ""));
      }
      if (name === "zfsReportFails") {
        return fail(
          500,
          failed(
            `zpool status -v '${object}'`,
            1,
            "internal error: Input/output error",
          ),
        );
      }
      advance(state, p);
      return ok(poolReport(state, p));
    },
    zfsGetAllSnapshots: read(() => {
      const data = [...state.snaps]
        .sort((a, b) => `${a.fs}@${a.name}`.localeCompare(`${b.fs}@${b.name}`))
        .map((s) => ({
          id: `${idPath(s.fs)}@${s.name}`,
          parent: s.fs,
          name: s.name,
          type: "Snapshot",
          icon: "images/zfs_snap.png",
          path: `${s.fs}@${s.name}`,
          used: s.used,
          refer: s.refer,
          encryption:
            findFs(s.fs)?.encryption === "none" ? "OFF" : "AES-256-GCM",
        }));
      return ok({ total: data.length, data });
    }),

    zfsAddPool: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const poolName = text(params, "name");
      const type = text(params, "pooltype");
      const ids =
        (param(params, "devices") as unknown[] | undefined)?.filter(
          (d): d is string => typeof d === "string",
        ) ?? [];
      const free = new Set(candidates(state).map((c) => String(c.devicefile)));
      const command = `zpool create -o ashift=12 -o failmode=continue -o autoexpand=on -O atime=off -O acltype=posix -O xattr=sa -O casesensitivity='sensitive' '${poolName}' ${type === "basic" ? "" : `${type} `}${ids.map((d) => `'${d}'`).join(" ")} 2>&1`;
      const busy = ids.find((d) => !free.has(d));
      if (busy !== undefined) {
        return fail(
          500,
          failed(
            command,
            1,
            `${busy} is in use and contains a unknown filesystem.`,
          ),
        );
      }
      const kernels = ids.map((d) => kernelOfId(state, d) ?? d);
      const need =
        { mirror: 2, raidz1: 3, raidz2: 4, raidz3: 5, basic: 1 }[type] ?? 1;
      if (ids.length < need) {
        return fail(
          500,
          failed(
            command,
            1,
            `invalid vdev specification: ${type} requires at least ${String(need)} devices`,
          ),
        );
      }
      // A refused create may still leave a partition table on the disks (observed for a reserved name).
      const leaveMarks = () => {
        for (const k of kernels) {
          if (!state.marked.includes(k)) {
            state.marked.push(k);
          }
        }
        hooks.taken(kernels);
      };
      if (RESERVED.test(poolName)) {
        leaveMarks();
        return fail(
          500,
          failed(
            command,
            1,
            `cannot create '${poolName}': name is reserved\npool name may have been omitted`,
          ),
        );
      }
      if (name === "zfsCreateFails") {
        leaveMarks();
        return fail(
          500,
          failed(command, 1, `cannot create '${poolName}': I/O error`),
        );
      }
      if (findPool(poolName) !== undefined) {
        return fail(
          500,
          failed(
            command,
            1,
            `cannot create '${poolName}': pool already exists`,
          ),
        );
      }
      tick();
      const devs = kernels.map((k) => dev(state, k));
      state.pools.push(
        pool(
          poolName,
          [group(type === "basic" ? "disks" : (type as GroupKind), devs)],
          {
            diskBytes: Math.min(
              ...kernels.map((k) =>
                Number(diskByKernel(state, k)?.size ?? DISK),
              ),
            ),
          },
        ),
      );
      state.fss.push(fs(poolName));
      state.marked = state.marked.filter((k) => !kernels.includes(k));
      hooks.taken(kernels);
      hooks.dirty(MOUNT_MODULES);
      return ok(null);
    },

    zfsAddObject: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const poolName = text(params, "path");
      const path = `${poolName}/${text(params, "name")}`;
      const p = findPool(poolName);
      if (p === undefined) {
        return fail(
          500,
          failed(
            `zfs create -p '${path}' 2>&1`,
            1,
            `cannot create '${path}': no such pool '${poolName}'`,
          ),
        );
      }
      // A name that is taken: "zfs create -p" does nothing and the plugin answers as if it made it
      // (observed). Nothing is marked pending either.
      if (findFs(path) !== undefined) {
        return ok(null);
      }
      tick();
      state.fss.push(fs(path));
      hooks.dirty(MOUNT_MODULES);
      return ok(null);
    },

    zfsSetProperties: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const path = text(params, "name");
      const f = findFs(path);
      if (f === undefined) {
        return fail(
          500,
          failed(
            `zfs set '${path}' 2>&1`,
            1,
            `cannot open '${path}': dataset does not exist`,
          ),
        );
      }
      const properties =
        (param(params, "properties") as unknown[] | undefined) ?? [];
      const changes: (() => void)[] = [];
      for (const item of properties) {
        const property = text(item, "property");
        const value = text(item, "value");
        if (param(item, "modified") !== true) {
          continue;
        }
        if (property === "quota") {
          const match = /^(\d+)([GT])$/.exec(value);
          const bytes =
            value === "none"
              ? null
              : match === null
                ? NaN
                : Number(match[1]) * (match[2] === "T" ? TIB : GIB);
          if (
            bytes !== null &&
            (Number.isNaN(bytes) || bytes < usedOf(state, path))
          ) {
            return fail(
              500,
              failed(
                `zfs set 'quota'='${value}' '${path}' 2>&1`,
                255,
                `cannot set property for '${path}': size is less than current used or reserved space`,
              ),
            );
          }
          changes.push(() => {
            f.quota = bytes;
          });
        } else if (property === "compression") {
          changes.push(() => {
            f.compression = value;
          });
        }
      }
      for (const change of changes) {
        change();
      }
      if (changes.length > 0) {
        hooks.dirty(PROPERTY_MODULES);
      }
      return ok(null);
    },

    zfsQuickSnapshot: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const path = text(params, "name");
      const f = findFs(path);
      tick();
      const snap = snapName(state.clock);
      if (f === undefined) {
        return fail(
          500,
          failed(
            `zfs snapshot '${path}@${snap}' 2>&1`,
            1,
            `cannot open '${path}': dataset does not exist`,
          ),
        );
      }
      if (state.snaps.some((s) => s.fs === path && s.name === snap)) {
        return fail(
          500,
          failed(
            `zfs snapshot '${path}@${snap}' 2>&1`,
            1,
            `cannot create snapshot '${path}@${snap}': dataset already exists`,
          ),
        );
      }
      const targets =
        param(params, "recursive") === true
          ? [f, ...childrenOf(state, path)]
          : [f];
      for (const t of targets) {
        state.snaps.push({ fs: t.path, name: snap, used: 0, refer: t.data });
      }
      return ok(null);
    },

    zfsRollbackSnapshot: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const full = text(params, "name");
      const [path = "", snap = ""] = full.split("@");
      const index = state.snaps.findIndex(
        (s) => s.fs === path && s.name === snap,
      );
      const command = `zfs rollback '${full}' 2>&1`;
      if (index === -1) {
        return fail(
          500,
          failed(command, 1, `cannot open '${full}': dataset does not exist`),
        );
      }
      const newer = state.snaps.slice(index + 1).filter((s) => s.fs === path);
      if (newer.length > 0) {
        return fail(
          500,
          failed(
            command,
            1,
            `cannot rollback to '${full}': more recent snapshots or bookmarks exist\nuse '-r' to force deletion of the following snapshots and bookmarks:\n${newer.map((s) => `${s.fs}@${s.name}`).join("\n")}`,
          ),
        );
      }
      const f = findFs(path);
      const s = state.snaps[index];
      if (f !== undefined && s !== undefined) {
        f.data = s.refer;
      }
      tick();
      return ok(null);
    },

    zfsDeleteObjectBg: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const type = param(params, "type");
      const object = text(params, "name");
      const mp = text(params, "mp");
      if (type === "Snapshot") {
        const [path = "", snap = ""] = object.split("@");
        const index = state.snaps.findIndex(
          (s) => s.fs === path && s.name === snap,
        );
        if (mp !== "") {
          return fail(
            500,
            `The mount point '${mp}' does not belong to '${object}'.`,
          );
        }
        if (index === -1) {
          return task(`cannot open '${object}': dataset does not exist`);
        }
        const clones = state.fss.filter((f) => f.origin === object);
        if (clones.length > 0) {
          return task(
            failed(
              `zfs destroy '${object}' 2>&1`,
              1,
              `cannot destroy '${object}': snapshot has dependent clones\nuse '-R' to destroy the following datasets:\n${clones.map((c) => c.path).join("\n")}`,
            ),
          );
        }
        state.snaps.splice(index, 1);
        hooks.dirty(MOUNT_MODULES);
        return task();
      }
      if (type === "Filesystem") {
        const f = findFs(object);
        if (f === undefined || f.path === f.pool) {
          return task(`cannot open '${object}': dataset does not exist`);
        }
        if (mp !== `/${f.path}`) {
          return fail(
            500,
            `The mount point '${mp}' does not belong to '${object}'.`,
          );
        }
        if (childrenOf(state, object).length > 0) {
          return task(
            `Cannot delete filesystem "${object}": it has child datasets. Delete them first.`,
          );
        }
        if (isShared(state, object)) {
          return task(
            `Cannot delete filesystem "${object}": it is used by a shared folder.`,
          );
        }
        const clones = state.fss.filter(
          (c) => c.origin?.startsWith(`${object}@`) === true,
        );
        if (clones.length > 0) {
          return task(
            failed(
              `zfs destroy -r '${object}' 2>&1`,
              1,
              `cannot destroy '${object}': filesystem has dependent clones\nuse '-R' to destroy the following datasets:\n${clones.map((c) => c.path).join("\n")}`,
            ),
          );
        }
        state.fss = state.fss.filter((x) => x !== f);
        state.snaps = state.snaps.filter((s) => s.fs !== object);
        hooks.dirty(MOUNT_MODULES);
        return task();
      }
      if (type === "Pool") {
        const p = findPool(object);
        if (p === undefined) {
          return task(`cannot open '${object}': no such pool`);
        }
        if (mp !== `/${p.name}`) {
          return fail(
            500,
            `The mount point '${mp}' does not belong to '${object}'.`,
          );
        }
        if (state.fss.some((f) => f.pool === p.name && f.path !== p.name)) {
          return task(
            `Cannot delete pool "${object}": it has datasets. Delete them first.`,
          );
        }
        if (isShared(state, p.name)) {
          return task(
            `Cannot delete pool "${object}": it is used by a shared folder.`,
          );
        }
        const disks = poolDisks(p);
        state.pools = state.pools.filter((x) => x !== p);
        state.fss = state.fss.filter((f) => f.pool !== p.name);
        state.snaps = state.snaps.filter((s) => s.fs !== p.name);
        // The disks keep ZFS's partition table and are not offered until wiped (observed).
        for (const k of disks) {
          if (!state.marked.includes(k)) {
            state.marked.push(k);
          }
        }
        hooks.dirty(MOUNT_MODULES);
        return task();
      }
      return fail(500, "Invalid RPC parameters.");
    },

    zfsScrubPool: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const n = text(params, "name");
      const p = findPool(n);
      const command = `zpool scrub '${n}' 2>&1`;
      if (p === undefined) {
        return fail(
          500,
          failed(command, 1, `cannot open '${n}': no such pool`),
        );
      }
      if (p.work?.kind === "resilver") {
        return fail(
          500,
          failed(command, 1, `cannot scrub ${n}: currently resilvering`),
        );
      }
      if (p.work?.kind === "scrub" && p.work.paused) {
        p.work.paused = false;
        return ok(null);
      }
      if (p.work?.kind === "scrub") {
        return fail(
          500,
          failed(
            command,
            1,
            `cannot scrub ${n}: currently scrubbing; use 'zpool scrub -s' to cancel the current scrub`,
          ),
        );
      }
      tick();
      p.work = { kind: "scrub", percent: 0, paused: false, since: state.clock };
      return ok(null);
    },

    zfsStopScrub: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const n = text(params, "name");
      const p = findPool(n);
      if (p === undefined || p.work?.kind !== "scrub") {
        return fail(
          500,
          failed(
            `zpool scrub -s '${n}' 2>&1`,
            1,
            `cannot cancel scrubbing ${n}: there is no active scrub`,
          ),
        );
      }
      tick();
      p.work = null;
      p.last = { kind: "canceled", at: state.clock };
      return ok(null);
    },

    zfsDeviceReplace: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const n = text(params, "pool");
      const oldPath = text(params, "olddevice");
      const newId = text(params, "newdevice");
      const p = findPool(n);
      const command = `zpool replace '${n}' '${oldPath}' '${newId}' 2>&1`;
      const found = p === undefined ? null : findDev(p, oldPath);
      if (p === undefined || found === null || found.group === null) {
        return fail(
          500,
          failed(
            command,
            1,
            `cannot replace ${oldPath} with ${newId}: no such device in pool`,
          ),
        );
      }
      if (!candidates(state).some((c) => c.devicefile === newId)) {
        return fail(
          500,
          failed(
            command,
            1,
            `${newId} is in use and contains a unknown filesystem.`,
          ),
        );
      }
      const slot = found.slots[found.index];
      if (slot === undefined || "replacing" in slot) {
        return fail(
          500,
          failed(
            command,
            1,
            `cannot replace ${oldPath} with ${newId}: already in replacing/spare config; wait for completion or use 'zpool detach'`,
          ),
        );
      }
      const kernel = kernelOfId(state, newId) ?? newId;
      found.slots[found.index] = {
        replacing: [slot.dev, { ...dev(state, kernel), resilvering: true }],
      };
      tick();
      p.work = {
        kind: "resilver",
        percent: 0,
        paused: false,
        since: state.clock,
      };
      state.marked = state.marked.filter((k) => k !== kernel);
      hooks.taken([kernel]);
      return ok(null);
    },

    zfsDeviceOffline: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const n = text(params, "pool");
      const path = text(params, "device");
      const p = findPool(n);
      const found = p === undefined ? null : findDev(p, path);
      const command = `zpool offline '${n}' '${path}' 2>&1`;
      if (found === null) {
        return fail(
          500,
          failed(command, 1, `cannot offline ${path}: no such device in pool`),
        );
      }
      if (!leavesCopy(found)) {
        return fail(
          500,
          failed(command, 1, `cannot offline ${path}: no valid replicas`),
        );
      }
      found.dev.state = "OFFLINE";
      return ok(null);
    },

    zfsDeviceOnline: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const n = text(params, "pool");
      const path = text(params, "device");
      const p = findPool(n);
      const found = p === undefined ? null : findDev(p, path);
      if (found === null) {
        return fail(
          500,
          failed(
            `zpool online -e '${n}' '${path}' 2>&1`,
            1,
            `cannot online ${path}: no such device in pool`,
          ),
        );
      }
      if (found.dev.disk === "") {
        return fail(
          500,
          failed(
            `zpool online -e '${n}' '${path}' 2>&1`,
            1,
            `cannot online ${path}: no such device in pool`,
          ),
        );
      }
      found.dev.state = "ONLINE";
      return ok(null);
    },

    zfsClearPool: ({ params }) => {
      if (name === "zfsBroken") {
        return fail(500, BROKEN);
      }
      const n = text(params, "name");
      const p = findPool(n);
      if (p === undefined) {
        return fail(
          500,
          failed(
            `zpool clear '${n}' 2>&1`,
            1,
            `cannot open '${n}': no such pool`,
          ),
        );
      }
      for (const d of allDevs(p)) {
        d.errors = [0, 0, 0];
        if (d.state === "FAULTED" && d.disk !== "") {
          d.state = "ONLINE";
        }
      }
      return ok(null);
    },

    // OMV's lists and Disks, as they look with these pools.
    diskMgmtGetList: () =>
      ok({ total: state.disks.length, data: clone(state.disks) }),
    fileSystemMgmtEnumerateMountedFilesystems: () =>
      ok([
        ...clone(
          CONTRACT_EXAMPLES.fileSystemMgmtEnumerateMountedFilesystems.withRoot
            .value,
        ),
        ...zfsFsRows(state, "mounted"),
      ]),
    // OMV's datamodel takes only a UUID or a device file, so it refuses a ZFS name (observed: 400).
    fsTabGetByFsName: ({ params }) =>
      zfsMountEntryRefusal(state, text(params, "fsname")) ??
      hooks.mountEntry(params),
    ...(state.shares.length > 0
      ? {
          shareMgmtGetList: () => {
            const base = clone(
              CONTRACT_EXAMPLES.shareMgmtGetList.populated.value.data,
            );
            const folder = base[0] as Record<string, unknown>;
            const data = [
              ...base,
              ...state.shares.map((s) => ({
                ...folder,
                uuid: s.uuid,
                name: s.name,
                comment: "",
                mntentref: "00000000-0000-4000-8000-000000000a90",
                reldirpath: `${s.name}/`,
                device: s.fs,
                description: `${s.name} [on ${s.fs}]`,
                mntent: {
                  devicefile: s.fs,
                  fsname: s.fs,
                  dir: `/${s.fs}`,
                  type: "zfs",
                  posixacl: true,
                },
                absdirpath: `/${s.fs}/${s.name}/`,
              })),
            ];
            return ok({ total: data.length, data });
          },
        }
      : {}),
  };
}

/** FsTab.getByFsName for a ZFS name: OMV's datamodel refuses it (observed: HTTP 400). */
export function zfsMountEntryRefusal(
  state: ZfsMockState | undefined,
  fsname: string,
): FixedAnswer | undefined {
  if (state === undefined || !state.fss.some((f) => f.path === fsname)) {
    return undefined;
  }
  return fail(
    400,
    `Invalid RPC parameters: The value '${fsname}' of the property 'fsname' does not match the format 'fsuuid' or 'devicefile'.`,
  );
}

/** A delete's last poll, by the handle its start answered; undefined for any other handle. */
export function zfsTaskOutput(
  state: ZfsMockState | undefined,
  handle: unknown,
): FixedAnswer | undefined {
  if (state === undefined || typeof handle !== "string") {
    return undefined;
  }
  const outcome = state.outcomes[handle];
  if (outcome === undefined) {
    return undefined;
  }
  if (outcome.error !== undefined) {
    return fail(500, outcome.error);
  }
  return ok({
    ...clone(CONTRACT_EXAMPLES.execGetOutput.zfsDeleteFilesystemFinished.value),
    filename: handle,
  });
}

/** A disk was wiped: one that carried ZFS's partition table, and is in no pool, is offered again. */
export function zfsWiped(
  state: ZfsMockState | undefined,
  device: string,
): void {
  if (state === undefined) {
    return;
  }
  const kernel =
    state.disks.find(
      (d) =>
        d.canonicaldevicefile === device ||
        d.devicefile === device ||
        d.devicelinks.includes(device),
    )?.canonicaldevicefile ?? device;
  state.marked = state.marked.filter((k) => k !== kernel);
}

/** The disks a story's pools hold, and the ones with ZFS's partition table: not offered for a file system. */
export const zfsTakenDisks = (state: ZfsMockState): string[] => [
  ...state.pools.flatMap(poolDisks),
  ...state.marked,
];
