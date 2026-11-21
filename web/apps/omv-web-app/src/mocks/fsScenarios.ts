// SPDX-License-Identifier: GPL-3.0-or-later
// The file-systems scenarios of the mock (phase 5 file-systems design 14). Development and test code
// only (UI-11). The default story is the test VM as captured: the system disk, a mounted EXT4 data file
// system on sda, three empty scratch disks (sdb, sdc, sdd) and the VM's cloud-init CD. Unlike the other
// scenarios these answers REMEMBER what the reader did, so Flow A can be walked end to end on the mock:
// creating a file system on a scratch disk makes it a mount candidate, setting up its mount adds the
// row and the mount entry and marks the four modules pending (observed), applying mounts it, an undo
// forgets the entry, and unmounting returns it to the candidates.
//
// Every row is built from a captured example; the states the VM cannot show (an apply that fails, a
// mount that does not happen, a busy unmount, other changes pending meanwhile, twenty file systems,
// hostile labels, a grow that grows, a 40,000-line report and so on) are WRITTEN BY HAND from the
// captured shapes and OMV's source, and say so in their labels. No value comes from a real system:
// UUIDs, serial numbers and devices are documentation values.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ConfiguredFilesystem,
  DetectedFilesystem,
  DiskDevice,
  FilesystemCandidate,
  MountEntry,
} from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import {
  isRaidScenario,
  newRaidMockState,
  raidAnswers,
  raidWiped,
  type RaidMockState,
} from "./raidScenarios.ts";

export const FS_SCENARIOS = [
  "fsReuse",
  "fsRaid",
  "fsVariety",
  "fsMany",
  "fsMountPending",
  "fsShared",
  "fsApplyFails",
  "fsNotMounted",
  "fsAlsoPending",
  "fsNotFound",
  "fsCreateFails",
  "fsCandidatesFail",
  "fsFoundFail",
  "fsBusy",
  "fsGrowBigger",
  "fsGrowFails",
  "fsGrowCut",
  "fsDetailsLong",
  "fsDetailsFail",
  "fsSmbOn",
] as const;
export type FsScenarioName = (typeof FS_SCENARIOS)[number];

export const FS_SCENARIO_LABELS: Record<FsScenarioName, string> = {
  fsReuse: "File systems: sdd holds an old NTFS file system (Erase and reuse)",
  fsRaid: "File systems: a RAID array offered for new storage (hand-written)",
  fsVariety:
    "File systems: every state, BTRFS on two disks, RAID, hostile labels (hand-written)",
  fsMany: "File systems: twenty file systems (hand-written)",
  fsMountPending: "File systems: one set up, its mount not applied yet",
  fsShared: "File systems: scratch on sdd is used by two shared folders",
  fsApplyFails: "Flow A: mounting fails once (R7)",
  fsNotMounted: "Flow A: applied, but the file system is not mounted",
  fsAlsoPending: "Flow A: other changes become pending meanwhile (R10)",
  fsNotFound: "Flow A: the new file system does not appear",
  fsCreateFails: "Flow A: creating the file system fails part-way",
  fsCandidatesFail: "Flow A: looking for disks fails",
  fsFoundFail: "File systems: looking for unmounted ones fails",
  fsBusy: "Unmount: something is still using the files",
  fsGrowBigger: "Grow: the file system gets bigger (hand-written)",
  fsGrowFails: "Grow: the type cannot grow while mounted",
  fsGrowCut: "Grow: the request is cut (hand-written)",
  fsDetailsLong: "Technical details: a 40,000-line report (hand-written)",
  fsDetailsFail: "Technical details: the report cannot be read",
  fsSmbOn: "Sharing handover: SMB/CIFS already on",
};

export const isFsScenario = (name: string): name is FsScenarioName =>
  (FS_SCENARIOS as readonly string[]).includes(name);

/**
 * Whether the remembering file-system answers apply: the default story, every fs scenario and every
 * RAID scenario (the RAID mock shares their disks and file systems).
 */
export const usesFsMock = (name: string): boolean =>
  name === "admin" || isFsScenario(name) || isRaidScenario(name);

const ok = (value: unknown): FixedAnswer => ({ status: 200, value });
const fail = (status: number, message: string): FixedAnswer => ({
  status,
  message,
  code: 0,
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const asDto = <T>(value: unknown): T => clone(value) as T;

// ---- The captured pieces -------------------------------------------------------------------------

const VM_DISKS = asDto<DiskDevice[]>(
  CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value.data,
);
const SDA1 = asDto<ConfiguredFilesystem>(
  CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value.data[0],
);
const VM_DETECTED = asDto<DetectedFilesystem[]>(
  CONTRACT_EXAMPLES.fileSystemMgmtEnumerateFilesystems.vmFilesystems.value,
);
const CREATED = asDto<DetectedFilesystem[]>(
  CONTRACT_EXAMPLES.fileSystemMgmtGetMountCandidates.created.value,
);
const NEW_FS = CREATED[0] as DetectedFilesystem;
const CD = CREATED[1] as DetectedFilesystem;
const ENTRY = asDto<MountEntry>(CONTRACT_EXAMPLES.fsTabGetByFsName.entry.value);
const FREE = asDto<FilesystemCandidate[]>(
  JSON.parse(CONTRACT_EXAMPLES.execGetOutput.fsCandidatesFinished.value.output),
);
const CANDIDATES_FINISHED =
  CONTRACT_EXAMPLES.execGetOutput.fsCandidatesFinished.value;
const CREATE_FINISHED =
  CONTRACT_EXAMPLES.execGetOutput.createExt4Finished.value;

/** The handles of the file-system tasks, from the contract's examples; each call adds a number. */
export const FS_HANDLES = {
  candidates: CONTRACT_EXAMPLES.fileSystemMgmtGetCandidatesBg.started.value,
  create: CONTRACT_EXAMPLES.fileSystemMgmtCreate.started.value,
  createBtrfs: CONTRACT_EXAMPLES.fileSystemMgmtCreateBtrfs.started.value,
} as const;

const GIB = 1024 ** 3;
const pad2 = (n: number) => String(n).padStart(2, "0");
const uuidFor = (n: number) => `00000000-0000-4000-8000-0000000007${pad2(n)}`;
/**
 * The file systems this mock creates: their own numbers (…0761 onwards), so a new one never shares a
 * UUID with one a scenario starts with, and "Open the file system" opens the one just made.
 */
const madeUuid = (made: number) => uuidFor(60 + made);
/** The mount entries the hand-written lists start with (…0410 onwards). */
const listEntryUuid = (n: number) =>
  `00000000-0000-4000-8000-0000000004${pad2(10 + n)}`;
/** The size the mock gives a file system made on one 8 GiB scratch disk, as the VM's df reported it. */
const ONE_DISK_FS = 8349229056;
/** About what df reports for EXT4 on the VM's mirror (written by hand from ONE_DISK_FS). */
const UNIT_FS = 8338000000;

/** A file system on `disk`'s first partition (or the device itself), as getMountCandidates lists it. */
function detectedOn(
  device: string,
  id: number | string,
  over: Partial<DetectedFilesystem> = {},
): DetectedFilesystem {
  const uuid = typeof id === "string" ? id : uuidFor(id);
  const part = /\d$/.test(device) ? `${device}p1` : `${device}1`;
  const partition = device.startsWith("/dev/md") ? device : part;
  return {
    ...clone(NEW_FS),
    devicename: partition.replace("/dev/", ""),
    devicefile: `/dev/disk/by-uuid/${uuid}`,
    predictabledevicefile: `/dev/disk/by-uuid/${uuid}`,
    canonicaldevicefile: partition,
    parentdevicefile: device,
    devlinks: [`/dev/disk/by-uuid/${uuid}`],
    uuid,
    description: `${partition} [EXT4, 7.99 GiB]`,
    devicefiles: [partition],
    ...over,
  };
}

/** The configured row of a file system once its mount is set up (status 1). */
function configuredOf(
  fs: DetectedFilesystem,
  over: Partial<ConfiguredFilesystem> = {},
): ConfiguredFilesystem {
  return {
    ...clone(SDA1),
    ...clone(fs),
    hasmultipledevices: fs.hasmultipledevices,
    mounted: false,
    mountpoint: `/srv/dev-disk-by-uuid-${fs.uuid}`,
    blocks: "-1",
    size: "-1",
    available: "-1",
    used: "-1",
    percentage: -1,
    usagewarnthreshold: 0,
    comment: "",
    mountopts: "defaults,nofail,user_xattr,usrquota,grpquota,acl",
    _used: false,
    _readonly: false,
    status: 1,
    ...over,
  };
}

const mountedFigures = (sizeBytes: number, usedPercent: number) => ({
  mounted: true,
  blocks: String(Math.round(sizeBytes / 1024)),
  size: String(sizeBytes),
  available: String(Math.round(sizeBytes * (1 - usedPercent / 100))),
  used: `${(sizeBytes * usedPercent) / 100 / GIB} GiB`,
  percentage: usedPercent,
});

const entryOf = (row: ConfiguredFilesystem, uuid: string): MountEntry => ({
  ...clone(ENTRY),
  uuid,
  fsname: row.devicefile,
  dir: row.mountpoint,
  type: row.type,
  usagewarnthreshold: row.usagewarnthreshold ?? 0,
  comment: row.comment,
});

// The captured shared folder points at mount entry …0002; here that is sda1's entry, so the VM's
// data file system is used by it, as on the VM (_used true).
const SDA1_ENTRY = entryOf(SDA1, "00000000-0000-4000-8000-000000000002");

// ---- Hand-written lists --------------------------------------------------------------------------

/**
 * The mount entries of a hand-written list, so each row's page finds the entry its warning level and
 * tags come from, as on OMV, where every configured file system (missing ones too) has one. The system
 * drive has none: it has no page here.
 */
function listEntries(
  rows: readonly ConfiguredFilesystem[],
  entries: Record<string, MountEntry>,
): Record<string, MountEntry> {
  const all = { ...entries };
  rows.forEach((row, i) => {
    if (
      row.mountpoint !== "/" &&
      row.status !== 2 &&
      !(row.devicefile in all)
    ) {
      all[row.devicefile] = entryOf(row, listEntryUuid(i));
    }
  });
  return all;
}

function varietyRows(): ConfiguredFilesystem[] {
  const n = (i: number, device: string, over: Partial<ConfiguredFilesystem>) =>
    configuredOf(detectedOn(device, i), over);
  const missingById: ConfiguredFilesystem = {
    ...configuredOf(detectedOn("/dev/sdx", 19)),
    status: 3,
    devicename: "",
    uuid: "",
    devicefile: "/dev/disk/by-id/ata-Example_HDD_4TB_EXAMPLE-SERIAL-0199-part1",
    canonicaldevicefile: "",
    parentdevicefile: "",
    devlinks: [],
    devicefiles: [],
    label: "",
    mountpoint:
      "/srv/dev-disk-by-id-ata-Example_HDD_4TB_EXAMPLE-SERIAL-0199-part1",
  };
  const missing: ConfiguredFilesystem = {
    ...n(18, "/dev/sdw", { label: "old-backups" }),
    status: 3,
    devicename: "",
    canonicaldevicefile: "",
    parentdevicefile: "",
    devlinks: [],
    devicefiles: [],
  };
  return [
    clone(SDA1),
    n(10, "/dev/sdb", {
      label: "media",
      comment: "Media,Photos",
      usagewarnthreshold: 85,
      ...mountedFigures(4000 * GIB, 91),
    }),
    n(11, "/dev/sdc", {
      label: "backups",
      usagewarnthreshold: 0,
      ...mountedFigures(2000 * GIB, 100),
      available: "0",
    }),
    n(12, "/dev/sdd", {
      label: "usb-disk",
      ...mountedFigures(1000 * GIB, 10),
      size: "-1",
      available: "-1",
      percentage: -1,
    }),
    n(13, "/dev/sde", {
      label: "pool",
      type: "btrfs",
      hasmultipledevices: true,
      devicefiles: ["/dev/sde", "/dev/sdf"],
      canonicaldevicefile: "/dev/sde",
      parentdevicefile: "/dev/sde",
      propresize: true,
      ...mountedFigures(8000 * GIB, 40),
    }),
    n(14, "/dev/md0", {
      label: "array",
      type: "xfs",
      ...mountedFigures(4000 * GIB, 20),
    }),
    n(15, "/dev/sdg", {
      label: "x".repeat(200),
      ...mountedFigures(500 * GIB, 30),
    }),
    n(16, "/dev/sdh", {
      label: "תמונות-משפחה",
      comment: "גיבוי",
      ...mountedFigures(500 * GIB, 30),
    }),
    n(17, "/dev/sdi", {
      label: '<img src=x onerror="alert(1)">',
      comment: "<b>tag</b>,javascript:alert(2)",
      ...mountedFigures(500 * GIB, 30),
    }),
    n(20, "/dev/sdj", { label: "not-mounted" }),
    missing,
    missingById,
    // An add-on that shares the system drive lists "/" too: the list shows it as the system drive.
    {
      ...configuredOf(detectedOn("/dev/nvme0n1", 21)),
      mountpoint: "/",
      ...mountedFigures(20 * GIB, 10),
    },
  ];
}

function manyRows(): ConfiguredFilesystem[] {
  return [
    clone(SDA1),
    ...Array.from({ length: 19 }, (_, i) =>
      configuredOf(
        detectedOn(`/dev/sd${String.fromCharCode(98 + i)}`, 30 + i),
        {
          label: `disk${String(i + 1)}`,
          usagewarnthreshold: i % 2 === 0 ? 85 : 0,
          ...mountedFigures(1000 * GIB, 5 + i * 5),
        },
      ),
    ),
  ];
}

/** A dumpe2fs report of 40,000 lines, one of them markup-looking (hand-written). */
function longReport(): string {
  const head = String(CONTRACT_EXAMPLES.fileSystemMgmtGetDetails.ext4.value);
  const lines = head.split("\n");
  for (let i = lines.length; i < 40_000; i += 1) {
    lines.push(
      i === 1234
        ? '<script>alert("not markup")</script>'
        : `Group ${String(i)}: (Blocks ${String(i * 32768)}-${String(i * 32768 + 32767)})`,
    );
  }
  return lines.join("\n");
}

// ---- The remembering state -----------------------------------------------------------------------

export interface FsMockState {
  configured: ConfiguredFilesystem[];
  detected: DetectedFilesystem[];
  candidates: DetectedFilesystem[];
  /** The disks getCandidatesBg offers. */
  free: FilesystemCandidate[];
  /** Mount entries, by the stable path OMV stores. */
  entries: Record<string, MountEntry>;
  /** The UUIDs of file systems whose mount is set up and not applied yet. */
  pending: string[];
  /** The last create asked for, finished on its last poll; `polls` counts its Exec.getOutput polls. */
  creating: {
    devices: string[];
    type: string;
    /** The BTRFS profile, for Combine disks. */
    profile: string | null;
    polls: number;
  } | null;
  /** How many file systems this mock has made. */
  made: number;
  /** The size of each file system this mock made, by UUID, which the apply mounts it with. */
  madeSizes: Record<string, number>;
  /** An apply that is still to fail (fsApplyFails fails once). */
  applyFailures: number;
  /** The disk a wipe was asked for, cleaned on the wipe's last poll. */
  wiping: string | null;
  /** How many tasks this mock has started: each gets its own handle, as the server's do. */
  tasks: number;
  /** What the RAID answers remember (raidScenarios.ts). */
  md: RaidMockState;
}

export function newFsMockState(name: string): FsMockState {
  const state: FsMockState = {
    configured: [clone(SDA1)],
    detected: clone(VM_DETECTED),
    candidates: [clone(CD)],
    free: clone(FREE),
    entries: { [SDA1.devicefile]: clone(SDA1_ENTRY) },
    pending: [],
    creating: null,
    made: 0,
    madeSizes: {},
    applyFailures: name === "fsApplyFails" ? 1 : 0,
    wiping: null,
    tasks: 0,
    md: newRaidMockState(name),
  };
  switch (name) {
    case "fsReuse": {
      // sdd holds an NTFS file system from another computer: not offered by the server, offered by
      // the interface as "Erase and reuse".
      const old = detectedOn("/dev/sdd", 90, {
        label: "old-pc",
        type: "ntfs",
        uuid: "0000000000000090",
        devicefile: "/dev/disk/by-uuid/0000000000000090",
      });
      state.detected.push(old);
      state.candidates.push(old);
      state.free = state.free.filter((c) => c.devicefile !== "/dev/sdd");
      break;
    }
    case "raidInUse": {
      // An EXT4 file system on the mirror, mounted (the RAID mock's md0).
      const fs = detectedOn("/dev/md0", 3, {
        mounted: true,
        mountpoint: `/srv/dev-disk-by-uuid-${uuidFor(3)}`,
      });
      const row = configuredOf(fs, {
        label: "array",
        ...mountedFigures(UNIT_FS, 5),
      });
      fs.label = "array";
      state.configured.push(row);
      state.detected.push(fs);
      state.entries[row.devicefile] = entryOf(row, uuidFor(93));
      state.free = state.free.filter(
        (c) => c.devicefile !== "/dev/sdb" && c.devicefile !== "/dev/sdc",
      );
      break;
    }
    case "fsRaid":
      // A RAID mirror of sdb and sdc made with the plugin, empty: the server offers the array.
      state.free = [
        ...state.free.filter(
          (c) => c.devicefile !== "/dev/sdb" && c.devicefile !== "/dev/sdc",
        ),
        {
          devicefile: "/dev/md0",
          size: "8580497408",
          description: "Software RAID nas:0 [/dev/md0, raid1, 7.99 GiB]",
        },
      ];
      break;
    case "fsVariety":
      state.configured = varietyRows();
      state.entries = listEntries(state.configured, state.entries);
      break;
    case "fsBusy":
    case "fsShared": {
      // A file system made on sdd earlier, mounted, with nothing set up on it but its mount.
      const fs = detectedOn("/dev/sdd", 2, {
        mounted: true,
        mountpoint: `/srv/dev-disk-by-uuid-${uuidFor(2)}`,
      });
      const row = configuredOf(fs, {
        label: "scratch",
        usagewarnthreshold: 85,
        ...mountedFigures(ONE_DISK_FS, 1),
        _used: name === "fsShared",
      });
      fs.label = "scratch";
      state.configured.push(row);
      state.detected.push(fs);
      state.entries[row.devicefile] = entryOf(row, uuidFor(92));
      state.free = state.free.filter((c) => c.devicefile !== "/dev/sdd");
      break;
    }
    case "fsMany":
      state.configured = manyRows();
      state.entries = listEntries(state.configured, state.entries);
      break;
    case "fsMountPending": {
      const fs = detectedOn("/dev/sdd", 1);
      const row = configuredOf(fs, { usagewarnthreshold: 85 });
      state.configured.push(row);
      state.detected.push(fs);
      state.entries[row.devicefile] = entryOf(row, uuidFor(91));
      state.pending.push(fs.uuid);
      state.free = state.free.filter((c) => c.devicefile !== "/dev/sdd");
      break;
    }
    default:
      break;
  }
  // An array with nothing on it is a file-system candidate (observed: at once, while it synchronises).
  for (const array of state.md.arrays) {
    const holds = state.configured.some(
      (row) =>
        row.canonicaldevicefile === array.devicefile ||
        row.parentdevicefile === array.devicefile,
    );
    if (
      !holds &&
      !array.used &&
      /^\/dev\/md\d+$/.test(array.devicefile) &&
      !state.free.some((c) => c.devicefile === array.devicefile)
    ) {
      state.free.push({
        devicefile: array.devicefile,
        size: String(array.size),
        description: `Software RAID  [${array.devicefile}, ${(array.size / GIB).toFixed(2)} GiB]`,
      });
    }
  }
  return state;
}

/** The modules a scenario starts with pending (the session's fsDirty). */
export const fsStartsPending = (name: string): readonly string[] =>
  name === "fsMountPending" ? ["fstab", "collectd", "monit", "quota"] : [];

function dropEntry(state: FsMockState, fsname: string): void {
  const { [fsname]: _gone, ...rest } = state.entries;
  state.entries = rest;
}

const byUuid = (uuid: string) => (row: { uuid: string }) =>
  row.uuid.toLowerCase() === uuid.toLowerCase();

const deviceOf = (devicefile: string): string =>
  VM_DISKS.find(
    (d) => d.devicefile === devicefile || d.canonicaldevicefile === devicefile,
  )?.canonicaldevicefile ?? devicefile;

const param = (params: unknown, key: string): unknown =>
  typeof params === "object" && params !== null
    ? (params as Record<string, unknown>)[key]
    : undefined;

// ---- What a create writes -------------------------------------------------------------------------

const diskBytesOf = (device: string): number =>
  Number(
    VM_DISKS.find((d) => d.canonicaldevicefile === device)?.size ?? 8589934592,
  );
const rawBytes = (devices: readonly string[]): number =>
  devices.reduce((sum, d) => sum + diskBytesOf(d), 0);

/**
 * What `sgdisk --new=1:0:0 --typecode=1:8300 --print` writes for an empty disk, the first thing the
 * create task writes to its output (FileSystemMgmt::create, OMV 8.6.1). Written by hand from sgdisk's
 * format; the disk identifier is a documentation value.
 */
function partitionOutput(device: string): string {
  const disk = VM_DISKS.find((d) => d.canonicaldevicefile === device);
  const sectors = Math.floor(diskBytesOf(device) / 512);
  const gib = (diskBytesOf(device) / GIB).toFixed(1);
  return [
    "Creating new GPT entries in memory.",
    `Disk ${device}: ${String(sectors)} sectors, ${gib} GiB`,
    `Model: ${disk?.model.trim() ?? "Disk"}`,
    "Sector size (logical/physical): 512/512 bytes",
    "Disk identifier (GUID): 00000000-0000-4000-8000-0000000000AA",
    "Partition table holds up to 128 entries",
    "Main partition table begins at sector 2 and ends at sector 33",
    `First usable sector is 34, last usable sector is ${String(sectors - 34)}`,
    "Partitions will be aligned on 2048-sector boundaries",
    "Total free space is 2014 sectors (1007.0 KiB)",
    "",
    "Number  Start (sector)    End (sector)  Size       Code  Name",
    `   1            2048        ${String(sectors - 34)}   ${gib} GiB     8300  `,
    "The operation has completed successfully.",
    "",
  ].join("\n");
}

const BTRFS_HEAD =
  "btrfs-progs v6.14\nSee https://btrfs.readthedocs.io for more information.\n\n";

/** mkfs.btrfs refusing because the last disk is still in use, in the createBtrfsFailed example's form. */
function btrfsFailure(devices: readonly string[], profile: string): string {
  const busy = devices.at(-1) ?? "/dev/sdx";
  return `Failed to execute command 'export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin; export LC_ALL=C.UTF-8; export LANGUAGE=; mkfs.btrfs --force --data '${profile}' --metadata '${profile}' ${devices.join(" ")} 2>&1' with exit code '1': ${BTRFS_HEAD}ERROR: unable to open ${busy}: Device or resource busy`;
}

/**
 * The size df reports for a BTRFS file system across `devices` with `profile`: what the profile can
 * store, less about 2% for BTRFS's own records. Hand-written; the VM showed only a RAID1 of two equal
 * disks.
 */
function btrfsSize(devices: readonly string[], profile: string): number {
  const sizes = devices.map(diskBytesOf);
  const total = sizes.reduce((a, b) => a + b, 0);
  const largest = Math.max(...sizes);
  const usable =
    profile === "raid1" || profile === "raid10"
      ? Math.min(total / 2, total - largest)
      : profile === "raid0"
        ? total - Math.max(0, largest - (total - largest))
        : total;
  return Math.round(usable * 0.98);
}

// ---- The answers ---------------------------------------------------------------------------------

export interface FsHooks {
  /** Mark these modules pending, as OMV does for the call (fsPending in scenarios.ts). */
  dirty: (modules: readonly string[]) => void;
}

/** The answers of the remembering file-system mock, by operation. */
export function fsAnswers(
  name: string,
  state: FsMockState,
  hooks: FsHooks,
): Record<string, (call: { params: unknown }) => FixedAnswer> {
  return {
    fileSystemMgmtGetList: () =>
      ok({ total: state.configured.length, data: state.configured }),
    fileSystemMgmtEnumerateFilesystems: () => ok(state.detected),
    fileSystemMgmtGetMountCandidates: () =>
      name === "fsFoundFail"
        ? fail(500, "Failed to execute command 'blkid': exit code '2'.")
        : ok(state.candidates),
    fileSystemMgmtGetCandidatesBg: () =>
      ok(`${FS_HANDLES.candidates}${String(++state.tasks)}`),
    fileSystemMgmtCreate: ({ params }) => {
      const devicefile = String(param(params, "devicefile") ?? "");
      state.creating = {
        devices: [deviceOf(devicefile)],
        type: String(param(params, "type") ?? "ext4"),
        profile: null,
        polls: 0,
      };
      // While it runs, getList shows it as being created (status 2), as OMV writes it.
      const device = deviceOf(devicefile);
      state.configured.push({
        ...configuredOf(detectedOn(device, 99)),
        status: 2,
        label: null,
        devicename: "",
        devicefile: "",
        canonicaldevicefile: "",
        parentdevicefile: device,
        devicefiles: [],
        mountpoint: "",
        uuid: "",
      });
      state.free = state.free.filter((c) => c.devicefile !== device);
      return ok(`${FS_HANDLES.create}${String(++state.tasks)}`);
    },
    fileSystemMgmtCreateBtrfs: ({ params }) => {
      const files = String(param(params, "devicefiles") ?? "").split(",");
      state.creating = {
        devices: files.map(deviceOf),
        type: "btrfs",
        profile: String(param(params, "profile") ?? "raid1"),
        polls: 0,
      };
      state.free = state.free.filter(
        (c) => !state.creating?.devices.includes(c.devicefile),
      );
      return ok(`${FS_HANDLES.createBtrfs}${String(++state.tasks)}`);
    },
    fileSystemMgmtSetMountPoint: ({ params }) => {
      const id = String(param(params, "id") ?? "");
      const fs = state.candidates.find((c) => c.devicefile === id);
      if (fs === undefined) {
        return fail(
          500,
          "A mount point already exists for the given filesystem.",
        );
      }
      const row = configuredOf(fs, {
        usagewarnthreshold: Number(param(params, "usagewarnthreshold") ?? 0),
        comment: String(param(params, "comment") ?? ""),
      });
      state.candidates = state.candidates.filter((c) => c !== fs);
      state.configured.push(row);
      const entry = entryOf(row, uuidFor(80 + state.made));
      state.entries[row.devicefile] = entry;
      state.pending.push(fs.uuid);
      hooks.dirty(
        name === "fsAlsoPending"
          ? ["fstab", "collectd", "monit", "quota", "nfs"]
          : ["fstab", "collectd", "monit", "quota"],
      );
      return ok(entry);
    },
    fileSystemMgmtUmountByDir: ({ params }) => {
      const dir = String(param(params, "dir") ?? "");
      const row = state.configured.find((r) => r.mountpoint === dir);
      if (row === undefined) {
        return fail(500, `No mount point found for '${dir}'.`);
      }
      if (name === "fsBusy" && row.mounted) {
        return {
          status: 500,
          code: 0,
          message:
            CONTRACT_EXAMPLES.fileSystemMgmtUmountByDir.busy.value.message,
        };
      }
      state.configured = state.configured.filter((r) => r !== row);
      dropEntry(state, row.devicefile);
      state.pending = state.pending.filter((u) => u !== row.uuid);
      if (row.status === 1) {
        const back = state.detected.find(byUuid(row.uuid));
        if (back !== undefined) {
          state.candidates.push({ ...back, mounted: false, mountpoint: "" });
        }
      }
      hooks.dirty(["collectd", "monit", "quota"]);
      return ok(null);
    },
    fileSystemMgmtGrow: ({ params }) => {
      if (name === "fsGrowFails") {
        return fail(
          500,
          `The file system '${String(param(params, "id"))}' (type=ext4) does not support online resizing.`,
        );
      }
      if (name === "fsGrowCut") {
        return fail(504, "Gateway Time-out");
      }
      if (name === "fsGrowBigger") {
        const row = state.configured.find(byUuid(String(param(params, "id"))));
        if (row !== undefined) {
          row.size = String(Number(row.size) * 2);
          row.available = String(
            Number(row.size) - (Number(row.size) / 2 - Number(row.available)),
          );
        }
      }
      return ok(null);
    },
    fileSystemMgmtGetDetails: () =>
      name === "fsDetailsFail"
        ? fail(500, "Failed to get mountpoint of '/dev/sda1'.")
        : name === "fsDetailsLong"
          ? ok(longReport())
          : ok(CONTRACT_EXAMPLES.fileSystemMgmtGetDetails.ext4.value),
    fsTabGetByFsName: ({ params }) => {
      const fsname = String(param(params, "fsname") ?? "");
      const entry =
        state.entries[fsname] ??
        Object.values(state.entries).find((e) => e.dir.endsWith(fsname));
      return ok(entry ?? false);
    },
    fsTabSet: ({ params }) => {
      const entry = params as MountEntry;
      const key = Object.keys(state.entries).find(
        (k) => state.entries[k]?.uuid === entry.uuid,
      );
      if (key === undefined) {
        return fail(500, "Object not found.");
      }
      state.entries[key] = { ...entry };
      const row = state.configured.find((r) => r.devicefile === key);
      if (row !== undefined) {
        row.usagewarnthreshold = entry.usagewarnthreshold;
        row.comment = entry.comment;
      }
      hooks.dirty(["monit"]);
      return ok(entry);
    },
    // The RAID plugin's answers, remembering creates, adds, removals, checks and deletes.
    ...raidAnswers(name, state.md, {
      dirty: hooks.dirty,
      offerForFs: (devicefile, size, on) => {
        state.free = state.free.filter((c) => c.devicefile !== devicefile);
        if (on) {
          state.free.push({
            devicefile,
            size: String(size),
            description: `Software RAID  [${devicefile}, ${(size / GIB).toFixed(2)} GiB]`,
          });
        }
      },
      mounted: (devicefile) =>
        state.configured.some(
          (row) =>
            row.mounted &&
            (row.canonicaldevicefile === devicefile ||
              row.parentdevicefile === devicefile),
        ),
    }),
    ...(name === "fsShared"
      ? {
          shareMgmtGetList: () => {
            const folder = clone(
              CONTRACT_EXAMPLES.shareMgmtGetList.populated.value.data[0],
            );
            const data = ["photos", "music"].map((n, i) => ({
              ...folder,
              uuid: `00000000-0000-4000-8000-00000000080${String(i)}`,
              name: n,
              reldirpath: `${n}/`,
              mntentref: uuidFor(92),
            }));
            return ok({ total: data.length, data });
          },
        }
      : {}),
    servicesGetStatus: () => {
      const value = asDto<{
        total: number;
        data: { name: string; enabled: boolean; running: boolean }[];
      }>(CONTRACT_EXAMPLES.servicesGetStatus.sshOnly.value);
      if (name === "fsSmbOn") {
        for (const s of value.data) {
          if (s.name === "samba") {
            s.enabled = true;
            s.running = true;
          }
        }
      }
      return ok(value);
    },
  };
}

/** The last poll of a file-system task, by its handle; undefined for any other handle. */
export function fsTaskOutput(
  name: string,
  state: FsMockState,
  handle: unknown,
): FixedAnswer | undefined {
  // A handle this mock issued: the example's, with the task's number after it.
  const of = (base: string) =>
    typeof handle === "string" &&
    handle.startsWith(base) &&
    /^\d*$/.test(handle.slice(base.length));
  const filename = of(FS_HANDLES.candidates)
    ? FS_HANDLES.candidates
    : of(FS_HANDLES.createBtrfs)
      ? FS_HANDLES.createBtrfs
      : of(FS_HANDLES.create)
        ? FS_HANDLES.create
        : undefined;
  if (filename === FS_HANDLES.candidates) {
    if (name === "fsCandidatesFail") {
      return fail(
        500,
        "Failed to execute command 'wipefs -n /dev/sdb': exit code '1'.",
      );
    }
    const output = JSON.stringify(state.free);
    return ok({
      ...CANDIDATES_FINISHED,
      filename: handle,
      output,
      pos: output.length,
    });
  }
  if (filename === FS_HANDLES.create || filename === FS_HANDLES.createBtrfs) {
    const btrfs = filename === FS_HANDLES.createBtrfs;
    const creating = state.creating;
    if (creating === null) {
      state.configured = state.configured.filter((r) => r.status !== 2);
      return ok({ ...CREATE_FINISHED, filename: handle });
    }
    creating.polls += 1;
    // The first poll finds the task still running, with what it has written so far: sgdisk's
    // partition table for one disk (the mke2fs lines come with the last poll), or mkfs.btrfs's first
    // lines when it is about to fail. While it runs, getList still shows the row being created.
    if (creating.polls === 1 && (!btrfs || name === "fsCreateFails")) {
      const output = btrfs
        ? BTRFS_HEAD
        : partitionOutput(creating.devices[0] ?? "/dev/sdx");
      return ok({
        filename: handle,
        pos: output.length,
        output,
        pendingOutput: false,
        running: true,
      });
    }
    state.configured = state.configured.filter((r) => r.status !== 2);
    state.creating = null;
    if (name === "fsCreateFails") {
      // Once the task has failed, OMV answers getOutput with the task's error (HTTP 500) and no more
      // output: for one disk, the partition that did not appear (the createFailed example); for
      // BTRFS, mkfs.btrfs's refusal with its whole output (the createBtrfsFailed example's form).
      return btrfs
        ? fail(500, btrfsFailure(creating.devices, creating.profile ?? "raid1"))
        : fail(
            500,
            `Device '${creating.devices[0] ?? ""}1' is not available after a waiting period of 10 seconds.`,
          );
    }
    if (name !== "fsNotFound") {
      state.made += 1;
      const first = creating.devices[0] ?? "/dev/sdx";
      const uuid = madeUuid(state.made);
      const fs =
        creating.devices.length > 1
          ? detectedOn(first, uuid, {
              type: "btrfs",
              devicename: first.replace("/dev/", ""),
              canonicaldevicefile: first,
              devicefiles: [...creating.devices],
              hasmultipledevices: true,
              description: `${first} [BTRFS, ${(rawBytes(creating.devices) / GIB).toFixed(2)} GiB]`,
            })
          : detectedOn(first, uuid, { type: creating.type });
      state.madeSizes[uuid] =
        creating.devices.length > 1
          ? btrfsSize(creating.devices, creating.profile ?? "raid1")
          : ONE_DISK_FS;
      state.detected.push(fs);
      state.candidates.push(fs);
    }
    return btrfs
      ? ok({
          ...CONTRACT_EXAMPLES.execGetOutput.createBtrfsRaid1Finished.value,
          filename: handle,
        })
      : ok({ ...CREATE_FINISHED, filename: handle });
  }
  return undefined;
}

/** A finished apply: every mount set up is mounted, unless the scenario says it is not. */
export function fsApplied(name: string, state: FsMockState): boolean {
  if (state.applyFailures > 0) {
    state.applyFailures -= 1;
    return false;
  }
  for (const uuid of state.pending) {
    const row = state.configured.find(byUuid(uuid));
    if (row !== undefined && name !== "fsNotMounted") {
      Object.assign(
        row,
        mountedFigures(state.madeSizes[row.uuid] ?? ONE_DISK_FS, 1),
      );
      const fs = state.detected.find(byUuid(uuid));
      if (fs !== undefined) {
        fs.mounted = true;
        fs.mountpoint = row.mountpoint;
      }
    }
  }
  if (name !== "fsNotMounted") {
    state.pending = [];
  }
  return true;
}

/** A finished undo: the mounts set up and not applied are forgotten, and found on the disks again. */
export function fsReverted(state: FsMockState): void {
  for (const uuid of state.pending) {
    const row = state.configured.find(byUuid(uuid));
    if (row !== undefined) {
      state.configured = state.configured.filter((r) => r !== row);
      dropEntry(state, row.devicefile);
      const fs = state.detected.find(byUuid(uuid));
      if (fs !== undefined) {
        state.candidates.push(fs);
      }
    }
  }
  state.pending = [];
}

/** A wipe asked for: remember the disk, cleaned when the wipe's last poll is answered. */
export function fsWipeAsked(state: FsMockState, devicefile: string): void {
  state.wiping = deviceOf(devicefile);
}

/** The wipe's last poll: nothing is left on the disk, and the server offers it again. */
export function fsWiped(state: FsMockState): void {
  const device = state.wiping;
  if (device === null) {
    return;
  }
  state.wiping = null;
  raidWiped(state.md, device);
  const on = (fs: DetectedFilesystem) =>
    fs.parentdevicefile === device || fs.canonicaldevicefile.startsWith(device);
  state.detected = state.detected.filter((fs) => !on(fs));
  state.candidates = state.candidates.filter((fs) => !on(fs));
  if (!state.free.some((c) => c.devicefile === device)) {
    const disk = VM_DISKS.find((d) => d.canonicaldevicefile === device);
    state.free.push({
      devicefile: device,
      size: disk?.size ?? "8589934592",
      description: `${disk?.model ?? "Disk"} [${device}]`,
    });
  }
}
