// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's own scenarios of the mock (rethink 6.5; the states the owner sees as screenshots):
// a new NAS, all OK, needs you, 24 disks and loading. Development and test code only (UI-11).
//
// WRITTEN BY HAND from the captured shapes (the contract's examples) and OMV's source, for the reads
// the dashboard may make (journal 2026-11-27): DiskMgmt.getList, Smart.getInformation for the disks
// awake, Smart.getSettings, the mounted and configured file systems, the shared folders and the SMB
// and NFS share lists, the services, and the ZFS plugin's pool status and pool devices. The NAS is
// the library's fixture NAS (react-ui-components fixtures/nas-fixtures.ts, chart-fixtures.tsx), so the
// figures agree with one another. No value comes from a running NAS: the host is the examples'
// `nas`, serial numbers, WWNs and UUIDs are documentation values. scenarios.ts wraps every answer
// here in the sign-in guard.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ConfiguredFilesystem,
  DiskDevice,
  MountedFilesystem,
  NfsShareRow,
  ServiceStatus,
  SharedFolder,
  SmartDevice,
  SmbShareRow,
  ZfsPoolDevice,
  ZfsPoolStatus,
} from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { delay, http } from "msw";

export const DASHBOARD_SCENARIOS = [
  "dashboardNewNas",
  "dashboardAllOk",
  "dashboardNeedsYou",
  "dashboard24Disks",
  "dashboardLoading",
] as const;
export type DashboardScenarioName = (typeof DASHBOARD_SCENARIOS)[number];

export const DASHBOARD_SCENARIO_LABELS: Record<DashboardScenarioName, string> =
  {
    dashboardNewNas: "Dashboard: a new NAS, nothing set up yet",
    dashboardAllOk: "Dashboard: all OK (press Check disk health)",
    dashboardNeedsYou:
      "Dashboard: needs you (press Check disk health for the disk)",
    dashboard24Disks:
      "Dashboard: 24 disks, some hot, some asleep, a RAID array and a ZFS pool",
    dashboardLoading: "Dashboard: the reads never arrive",
  };

export const isDashboardScenario = (
  name: string,
): name is DashboardScenarioName =>
  (DASHBOARD_SCENARIOS as readonly string[]).includes(name);

/** The scenarios whose System.getInformation says the first steps were hidden. */
export const DASHBOARD_WELCOME_DISMISSED: ReadonlySet<string> = new Set([
  "dashboardAllOk",
  "dashboard24Disks",
]);
/** The scenarios whose NAS needs a restart and whose clock is behind. */
export const DASHBOARD_ATTENTION: ReadonlySet<string> = new Set([
  "dashboardNeedsYou",
]);

const asDto = <T>(example: unknown): T => example as T;
const ok = (value: unknown): FixedAnswer => ({ status: 200, value });
const list = (rows: readonly unknown[]): FixedAnswer =>
  ok({ total: rows.length, data: rows });

const TIB4 = "4000787030016";
const GIB = 1024 ** 3;
const uuidOf = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ─── Disks ──────────────────────────────────────────────────────────────────────────────────────

type Kind = "hdd" | "ssd" | "nvme" | "unknown";

interface DiskPlan {
  name: string;
  kind: Kind;
  /** "" for a disk asleep. */
  temperature: string;
  raid?: boolean;
  root?: boolean;
  size?: string;
}

const MODEL: Record<Kind, string> = {
  hdd: "Example HDD 4TB",
  ssd: "Example SSD 1TB",
  nvme: "Example NVMe SSD 250GB",
  unknown: "Example Disk",
};

function disk(plan: DiskPlan, n: number): DiskDevice {
  const serial = `EXAMPLE-SERIAL-${String(n).padStart(4, "0")}`;
  const model = MODEL[plan.kind];
  const prefix = plan.kind === "nvme" ? "nvme" : "ata";
  const byId = `/dev/disk/by-id/${prefix}-${model.replace(/[^A-Za-z0-9]+/g, "_")}_${serial}`;
  const asleep = plan.temperature === "";
  return {
    devicename: plan.name,
    canonicaldevicefile: `/dev/${plan.name}`,
    devicefile: byId,
    devicelinks: [
      byId,
      `/dev/disk/by-id/wwn-EXAMPLE-WWN-${String(n).padStart(4, "0")}`,
    ],
    model,
    size:
      plan.size ??
      (plan.kind === "nvme"
        ? "256060514304"
        : plan.kind === "ssd"
          ? "1000204886016"
          : TIB4),
    description: `${model} [/dev/${plan.name}]`,
    vendor: plan.kind === "nvme" ? "" : "ATA",
    serialnumber: serial,
    wwn: `EXAMPLE-WWN-${String(n).padStart(4, "0")}`,
    israid: plan.raid === true,
    isroot: plan.root === true,
    isreadonly: false,
    powermode: asleep
      ? "STANDBY"
      : plan.kind === "nvme"
        ? "UNKNOWN"
        : "ACTIVE or IDLE",
    temperature: plan.temperature,
    hotpluggable: false,
  };
}

/** What Smart.getInformation says of each kind's `rotationrate`; a disk of no known kind says none. */
const ROTATION: Record<Kind, string | undefined> = {
  hdd: "7200 rpm",
  ssd: "Solid State Device",
  nvme: undefined,
  unknown: undefined,
};

const SATA_INFO = asDto<Record<string, unknown>>(
  CONTRACT_EXAMPLES.smartGetInformation.sata.value,
);

// ─── File systems ───────────────────────────────────────────────────────────────────────────────

const MOUNTED_BASE = asDto<MountedFilesystem>(
  CONTRACT_EXAMPLES.fileSystemMgmtEnumerateMountedFilesystems.withRoot.value[0],
);
const CONFIGURED_BASE = asDto<ConfiguredFilesystem>(
  CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value.data[0],
);

interface FsPlan {
  /** The partition or device it is on: "sda1", "md0"; the dataset for ZFS: "tank/archive". */
  device: string;
  /** The disks it stands on, for `parentdevicefile` and `devicefiles`. */
  parent?: string;
  label: string;
  type: string;
  /** Bytes. */
  size: number;
  percentage: number;
  threshold: number;
  root?: boolean;
  n: number;
}

function mountedOf(p: FsPlan): MountedFilesystem {
  const zfs = p.type === "zfs";
  const uuid = zfs ? null : uuidOf(p.n);
  const available = Math.round(p.size * (1 - p.percentage / 100));
  const mountpoint = p.root
    ? "/"
    : zfs
      ? `/${p.device}`
      : `/srv/dev-disk-by-uuid-${uuid ?? ""}`;
  return {
    ...MOUNTED_BASE,
    devicename: zfs ? p.device : p.device,
    devicefile: zfs ? p.device : `/dev/disk/by-uuid/${uuid ?? ""}`,
    predictabledevicefile: zfs ? p.device : `/dev/disk/by-uuid/${uuid ?? ""}`,
    canonicaldevicefile: zfs ? p.device : `/dev/${p.device}`,
    parentdevicefile: zfs ? "" : `/dev/${p.parent ?? p.device}`,
    devlinks: zfs ? [] : [`/dev/disk/by-uuid/${uuid ?? ""}`],
    uuid,
    label: p.label,
    type: p.type,
    blocks: String(Math.round(p.size / 1024)),
    mounted: true,
    mountpoint,
    used: `${(((p.size - available) / GIB) | 0).toString()}.00 GiB`,
    available: String(available),
    size: String(p.size),
    percentage: p.percentage,
    description: `/dev/${p.device}`,
    hasmultipledevices: false,
    devicefiles: zfs ? [] : [`/dev/${p.device}`],
    comment: "",
    _readonly: p.root === true,
    _used: true,
    usagewarnthreshold: p.threshold,
  };
}

const configuredOf = (m: MountedFilesystem): ConfiguredFilesystem => ({
  ...CONFIGURED_BASE,
  ...m,
  parentdevicefile: m.parentdevicefile ?? "",
  predictabledevicefile: m.predictabledevicefile ?? m.devicefile,
  devicefiles: m.devicefiles ?? [],
  hasmultipledevices: false,
  status: 1,
});

// ─── Shared folders and how they are reached ────────────────────────────────────────────────────

const FOLDER_BASE = asDto<SharedFolder>(
  CONTRACT_EXAMPLES.shareMgmtGetList.populated.value.data[0],
);
const SMB_BASE = asDto<SmbShareRow>(
  CONTRACT_EXAMPLES.smbGetShareList.one.value.data[0],
);
const NFS_BASE = asDto<NfsShareRow>(
  CONTRACT_EXAMPLES.nfsGetShareList.several.value.data[0],
);

interface FolderPlan {
  name: string;
  on: MountedFilesystem;
  smb?: boolean;
  nfs?: boolean;
}

function folderOf(p: FolderPlan, n: number): SharedFolder {
  const dir = p.on.mountpoint;
  return {
    ...FOLDER_BASE,
    uuid: uuidOf(700 + n),
    name: p.name,
    comment: "",
    mntentref: uuidOf(600 + n),
    reldirpath: `${p.name}/`,
    device: p.on.label,
    description: `${p.name} [on ${p.on.label}]`,
    mntent: {
      devicefile: p.on.devicefile,
      fsname: p.on.type === "zfs" ? p.on.devicename : p.on.devicefile,
      dir,
      type: p.on.type,
      posixacl: true,
    },
    absdirpath: `${dir}/${p.name}/`,
    status: "OK",
    _used: p.smb === true || p.nfs === true,
  };
}

const smbOf = (f: SharedFolder, n: number): SmbShareRow => ({
  ...SMB_BASE,
  uuid: uuidOf(800 + n),
  enable: true,
  sharedfolderref: f.uuid,
  sharedfoldername: f.name,
});

const nfsOf = (f: SharedFolder, n: number): NfsShareRow => ({
  ...NFS_BASE,
  uuid: uuidOf(900 + n),
  sharedfolderref: f.uuid,
  mntentref: uuidOf(950 + n),
  client: "192.0.2.0/24",
  options: "rw",
  sharedfoldername: f.name,
});

// ─── The NAS of each scenario ───────────────────────────────────────────────────────────────────

interface NasPlan {
  disks: DiskPlan[];
  fs: FsPlan[];
  folders: (mounted: readonly MountedFilesystem[]) => FolderPlan[];
  services: ServiceStatus[];
  /** ZFS pools and their member disks; null without the plugin. */
  pools:
    | { status: ZfsPoolStatus; members: { disk: string; vdev: string }[] }[]
    | null;
  /** Each disk's health once checked, by name: GOOD unless listed. */
  health: Record<string, string>;
  tempmax: number;
}

const SERVICES_ON: ServiceStatus[] = [
  { name: "nfs", title: "NFS", enabled: true, running: true },
  { name: "rsyncd", title: "RSync server", enabled: false, running: false },
  { name: "samba", title: "SMB/CIFS", enabled: true, running: true },
  { name: "ssh", title: "SSH", enabled: true, running: true },
];

const SIX_DISKS: DiskPlan[] = [
  { name: "nvme0n1", kind: "nvme", temperature: "34", root: true },
  { name: "sda", kind: "hdd", temperature: "36" },
  { name: "sdb", kind: "hdd", temperature: "35", raid: true },
  { name: "sdc", kind: "hdd", temperature: "37", raid: true },
  { name: "sdd", kind: "hdd", temperature: "" },
  { name: "sde", kind: "ssd", temperature: "31" },
];

const TIB = 1024 ** 4;
const SYSTEM: FsPlan = {
  device: "nvme0n1p2",
  parent: "nvme0n1",
  label: "",
  type: "ext4",
  size: 20 * GIB,
  percentage: 10,
  threshold: 85,
  root: true,
  n: 501,
};

function sixDiskNas(dataPercent: number): NasPlan {
  return {
    disks: SIX_DISKS,
    fs: [
      SYSTEM,
      {
        device: "sda1",
        parent: "sda",
        label: "Data drive",
        type: "ext4",
        size: 3.6 * TIB,
        percentage: dataPercent,
        threshold: 85,
        n: 502,
      },
      {
        device: "md0",
        label: "Backup",
        type: "ext4",
        size: 3.6 * TIB,
        percentage: 41,
        threshold: 88,
        n: 503,
      },
      {
        device: "tank",
        label: "tank",
        type: "zfs",
        size: 3.6 * TIB,
        percentage: 28,
        threshold: 0,
        n: 504,
      },
    ],
    folders: (m) => {
      const [, data, backup, tank] = m as [
        MountedFilesystem,
        MountedFilesystem,
        MountedFilesystem,
        MountedFilesystem,
      ];
      return [
        { name: "Photos", on: data, smb: true },
        { name: "Music", on: data, smb: true, nfs: true },
        { name: "Documents", on: data, smb: true },
        { name: "Time Machine", on: backup, smb: true },
        { name: "a4share", on: backup },
        { name: "Archive", on: tank, nfs: true },
      ];
    },
    services: SERVICES_ON,
    pools: [
      {
        status: { name: "tank", state: "ONLINE", status: "OK", capacity: 28 },
        members: [{ disk: "sdd", vdev: "" }],
      },
    ],
    health: {},
    tempmax: 45,
  };
}

function newNas(): NasPlan {
  return {
    disks: SIX_DISKS.map((d) => ({ ...d, raid: false })),
    fs: [SYSTEM],
    folders: () => [],
    services: CONTRACT_EXAMPLES.servicesGetStatus.sshOnly.value
      .data as unknown as ServiceStatus[],
    pools: null,
    health: {},
    tempmax: 45,
  };
}

/**
 * 24 disks: two NVMe sticks and 22 drives. sdb and sdc hold the Backup mirror (md0) and sdf to sdn
 * the Archive's double parity array (md2): RAID members, which DiskMgmt.getList marks. sdd and sde
 * are the pool tank. sdi and sdu are asleep; sdr reports no kind; nvme1n1, sdk and sdt are past the
 * 45 °C limit.
 */
function twentyFourNas(): NasPlan {
  const plans: [string, Kind, string, boolean?][] = [
    ["nvme0n1", "nvme", "41"],
    ["nvme1n1", "nvme", "47"],
    ["sda", "hdd", "34"],
    ["sdb", "hdd", "35", true],
    ["sdc", "hdd", "35", true],
    ["sdd", "hdd", "36"],
    ["sde", "hdd", "35"],
    ["sdf", "hdd", "37", true],
    ["sdg", "hdd", "36", true],
    ["sdh", "hdd", "34", true],
    ["sdi", "hdd", "", true],
    ["sdj", "hdd", "38", true],
    ["sdk", "hdd", "46", true],
    ["sdl", "hdd", "36", true],
    ["sdm", "hdd", "37", true],
    ["sdn", "hdd", "39", true],
    ["sdo", "hdd", "35"],
    ["sdp", "hdd", "36"],
    ["sdq", "ssd", "33"],
    ["sdr", "unknown", "34"],
    ["sds", "hdd", "37"],
    ["sdt", "hdd", "46"],
    ["sdu", "hdd", ""],
    ["sdv", "ssd", "31"],
  ];
  const fs = (
    device: string,
    parent: string | undefined,
    label: string,
    type: string,
    size: number,
    percentage: number,
    n: number,
    threshold = 85,
  ): FsPlan => ({
    device,
    parent,
    label,
    type,
    size,
    percentage,
    threshold,
    n,
  });
  return {
    disks: plans.map(([name, kind, temperature, raid]) => ({
      name,
      kind,
      temperature,
      raid,
      root: name === "nvme0n1",
    })),
    fs: [
      SYSTEM,
      fs("nvme1n1p1", "nvme1n1", "Apps", "ext4", 232 * GIB, 37, 511),
      fs("sda1", "sda", "Data drive", "ext4", 3.6 * TIB, 62, 512),
      fs("md0", undefined, "Backup", "ext4", 3.6 * TIB, 41, 513, 88),
      fs("md2", undefined, "Archive", "ext4", 21.8 * TIB, 77, 514),
      fs("tank", undefined, "tank", "zfs", 3.6 * TIB, 52, 515, 0),
      fs("sdo1", "sdo", "Media", "xfs", 3.6 * TIB, 84, 516),
      fs("sdp1", "sdp", "Films", "xfs", 3.6 * TIB, 66, 517),
      fs("sdq1", "sdq", "Scratch", "ext4", 0.9 * TIB, 12, 518),
      fs("sdr1", "sdr", "Photos drive", "ext4", 3.6 * TIB, 71, 519),
    ],
    folders: (m) => {
      const on = (label: string) =>
        m.find((f) => f.label === label) ?? (m[0] as MountedFilesystem);
      return [
        { name: "Photos", on: on("Photos drive"), smb: true },
        { name: "Camera roll", on: on("Photos drive"), smb: true },
        { name: "Music", on: on("Data drive"), smb: true, nfs: true },
        { name: "Documents", on: on("Data drive"), smb: true },
        { name: "Time Machine", on: on("Backup"), smb: true },
        { name: "Archive", on: on("Archive"), nfs: true },
        { name: "Old projects", on: on("Archive") },
        { name: "Series", on: on("Media"), smb: true },
        { name: "Films", on: on("Films"), smb: true, nfs: true },
        { name: "Containers", on: on("Apps") },
        { name: "Downloads", on: on("Scratch"), smb: true },
        { name: "Backups", on: on("tank"), nfs: true },
      ];
    },
    services: SERVICES_ON,
    pools: [
      {
        status: { name: "tank", state: "ONLINE", status: "OK", capacity: 52 },
        members: [
          { disk: "sdd", vdev: "mirror-0" },
          { disk: "sde", vdev: "mirror-0" },
        ],
      },
    ],
    health: {},
    tempmax: 45,
  };
}

function planOf(name: DashboardScenarioName): NasPlan {
  switch (name) {
    case "dashboardNewNas":
      return newNas();
    case "dashboardNeedsYou":
      return { ...sixDiskNas(92), health: { sdb: "BAD_SECTOR" } };
    case "dashboard24Disks":
      return twentyFourNas();
    case "dashboardAllOk":
    case "dashboardLoading":
      return sixDiskNas(62);
  }
}

// ─── The answers ────────────────────────────────────────────────────────────────────────────────

const SMART_FINISHED =
  CONTRACT_EXAMPLES.execGetOutput.smartDevicesFinished.value;
const SMART_BASE = asDto<SmartDevice>(
  (JSON.parse(SMART_FINISHED.output) as { data: unknown[] }).data[1],
);

type Reply = FixedAnswer | ((call: { params: unknown }) => FixedAnswer);

/** The dashboard's reads in a dashboard scenario, before the sign-in guard. */
export function dashboardAnswers(
  name: DashboardScenarioName,
): Record<string, Reply> {
  const plan = planOf(name);
  const disks = plan.disks.map((d, i) => disk(d, 101 + i));
  const mounted = plan.fs.map(mountedOf);
  const folderPlans = plan.folders(mounted);
  const folders = folderPlans.map(folderOf);
  const smb = folders.flatMap((f, i) =>
    folderPlans[i]?.smb === true ? [smbOf(f, i)] : [],
  );
  const nfs = folders.flatMap((f, i) =>
    folderPlans[i]?.nfs === true ? [nfsOf(f, i)] : [],
  );
  const notInstalled: FixedAnswer = {
    status: 404,
    message: "The service 'Zfs' does not exist.",
    code: 0,
  };
  const information = ({ params }: { params: unknown }): FixedAnswer => {
    const devicefile = (params as { devicefile?: unknown } | null)?.devicefile;
    const i = disks.findIndex((d) => d.devicefile === devicefile);
    const d = disks[i];
    const p = plan.disks[i];
    if (d === undefined || p === undefined) {
      return { status: 500, message: "No such device.", code: 0 };
    }
    const rotation = ROTATION[p.kind];
    const info: Record<string, unknown> = {
      ...SATA_INFO,
      devicefile: d.devicefile,
      devicemodel: d.model,
      serialnumber: d.serialnumber,
      wwn: d.wwn,
      temperature: d.temperature,
    };
    delete info.rotationrate;
    return ok(
      rotation === undefined ? info : { ...info, rotationrate: rotation },
    );
  };
  const devicesOf = ({ params }: { params: unknown }): FixedAnswer => {
    const pool = (params as { name?: unknown } | null)?.name;
    const found = plan.pools?.find((p) => p.status.name === pool);
    if (found === undefined) {
      return { status: 500, message: "No such pool.", code: 0 };
    }
    return ok(
      found.members.map((m): ZfsPoolDevice => {
        const d = disks.find((x) => x.devicename === m.disk);
        const devicefile = `${d?.devicefile ?? `/dev/${m.disk}`}-part1`;
        return {
          devicefile,
          state: "ONLINE",
          vdev: m.vdev,
          label: `${devicefile}  [${m.vdev}] [ONLINE]`,
        };
      }),
    );
  };
  return {
    diskMgmtGetList: list(disks),
    smartGetInformation: information,
    smartGetSettings: ok({
      enable: true,
      interval: 1800,
      powermode: "standby",
      tempdiff: 0,
      tempmax: plan.tempmax,
    }),
    fileSystemMgmtEnumerateMountedFilesystems: ok(mounted),
    fileSystemMgmtGetList: list(
      mounted.filter((m) => m.mountpoint !== "/").map(configuredOf),
    ),
    shareMgmtGetList: list(folders),
    smbGetShareList: list(smb),
    nfsGetShareList: list(nfs),
    servicesGetStatus: list(plan.services),
    zfsListCompressionTypes:
      plan.pools === null ? notInstalled : ok(["gzip", "lz4", "zstd"]),
    zfsGetPoolStatus:
      plan.pools === null ? notInstalled : ok(plan.pools.map((p) => p.status)),
    zfsGetPoolDevices: plan.pools === null ? notInstalled : devicesOf,
    mdMgmtEnumerateDevices: {
      status: 500,
      message: "The dashboard never reads the arrays.",
      code: 0,
    },
  };
}

/** The disk-health check's last poll in a dashboard scenario: every disk listed, with its health. */
export function dashboardCheckOutput(name: string): FixedAnswer | undefined {
  if (!isDashboardScenario(name)) {
    return undefined;
  }
  const plan = planOf(name);
  const devices = plan.disks.map((p, i) => {
    const d = disk(p, 101 + i);
    return {
      ...SMART_BASE,
      devicename: d.devicename,
      canonicaldevicefile: d.canonicaldevicefile,
      devicefile: d.devicefile,
      devicelinks: d.devicelinks,
      model: d.model,
      size: d.size,
      temperature: d.temperature,
      description: d.description,
      vendor: d.vendor,
      serialnumber: d.serialnumber,
      wwn: d.wwn,
      overallstatus: plan.health[p.name] ?? "GOOD",
      monitor: true,
    };
  });
  const output = JSON.stringify({ total: devices.length, data: devices });
  return {
    status: 200,
    value: { ...SMART_FINISHED, output, pos: output.length },
  };
}

/** The reads that never arrive in the loading scenario: every dashboard read but the shell's own. */
const HELD = new Set([
  "DiskMgmt.getList",
  "FileSystemMgmt.enumerateMountedFilesystems",
  "FileSystemMgmt.getList",
  "ShareMgmt.getList",
  "SMB.getShareList",
  "NFS.getShareList",
  "Services.getStatus",
  "Smart.getSettings",
  "Zfs.listCompressionTypes",
]);

/** The loading scenario's hold: the dashboard's reads wait for ever, so the page stays as it loads. */
export function dashboardDelayHandlers(name: string) {
  if (name !== "dashboardLoading") {
    return [];
  }
  return [
    http.post("*/rpc.php", async ({ request }) => {
      let body: { service?: unknown; method?: unknown };
      try {
        body = (await request.clone().json()) as typeof body;
      } catch {
        return undefined;
      }
      if (
        typeof body.service === "string" &&
        typeof body.method === "string" &&
        HELD.has(`${body.service}.${body.method}`)
      ) {
        await delay("infinite");
      }
      return undefined;
    }),
  ];
}
