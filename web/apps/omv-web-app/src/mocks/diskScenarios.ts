// SPDX-License-Identifier: GPL-3.0-or-later
// The disks and disk-health scenarios of the mock (phase 5 disks design 13). Development and test code
// only (UI-11). The test VM has five virtual disks that never sleep, report no health readings and
// hold one data file system, which the captured examples show; every other state here is WRITTEN BY
// HAND from the captured shapes and OMV's source (a NAS with a RAID mirror, a sleeping disk, swap,
// storage the interface cannot trace, failing reads, hostile text), and says so where it is built. No
// value comes from a real system: serial numbers, WWNs and UUIDs are documentation values.
//
// The answers hold no state between calls beyond what a scenario needs to tell a story: the last wipe
// started (quick or secure, and how far its output has got) and how many polls a self-test start
// has had.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ConfiguredFilesystem,
  DetectedFilesystem,
  DiskDevice,
  SmartScheduleEntry,
} from "@omv-webui/react-api-omv/generated";
import type { ExampleName, FixedAnswer } from "@omv-webui/react-api-omv/mocks";

/** The disk scenarios, registered in scenarios.ts. */
export const DISK_SCENARIOS = [
  "disksNas",
  "disksAsleep",
  "disksMany",
  "disksHostile",
  "disksReadFails",
  "disksUseFails",
  "disksRaidFails",
  "disksNoRaidPlugin",
  "disksSwap",
  "smartOddInterval",
  "smartDetailsFail",
  "smartAlsoPending",
  "wipeFails",
  "testUnclear",
  "testFails",
] as const;
export type DiskScenarioName = (typeof DISK_SCENARIOS)[number];

export const DISK_SCENARIO_LABELS: Record<DiskScenarioName, string> = {
  disksNas:
    "Disks: a NAS with data disks, an empty disk, a USB disk, a RAID mirror",
  disksAsleep:
    "Disks: one asleep, power settings saved, monitoring wakes disks",
  disksMany: "Disks: twenty disks",
  disksHostile: "Disks: twins, long, right-to-left and markup-looking models",
  disksReadFails: "Disks: the list cannot be read",
  disksUseFails: "Disks: what the disks hold cannot be checked",
  disksRaidFails: "Disks: the RAID plugin's read fails",
  disksNoRaidPlugin:
    "Disks: the RAID plugin is not installed (OMV answers 404, as on the test VM)",
  disksSwap: "Disks: swap, a file system being created, encrypted storage",
  smartOddInterval: "Disk health: checked every 45 seconds, set elsewhere",
  smartDetailsFail: "Disk health: a disk's details cannot be read",
  smartAlsoPending: "Disk health: other changes become pending during set-up",
  wipeFails: "Wipe: the wipe fails part-way",
  testUnclear: "Self-test: the disk's reply does not say it started",
  testFails: "Self-test: starting it fails",
};

export const isDiskScenario = (name: string): name is DiskScenarioName =>
  (DISK_SCENARIOS as readonly string[]).includes(name);

type Reply = string | FixedAnswer;
/** A last poll of a task: one of Exec.getOutput's examples, or a written reply. */
type TaskReply = ExampleName<"execGetOutput"> | FixedAnswer;
/** The examples are typed as read-only literals; the scenarios build on them in the contract's shapes. */
const asDto = <T>(example: unknown): T => example as T;
const ok = (value: unknown): FixedAnswer => ({ status: 200, value });
const fail = (status: number, message: string): FixedAnswer => ({
  status,
  message,
  code: 0,
});
const list = (rows: readonly unknown[]): FixedAnswer =>
  ok({ total: rows.length, data: rows });

const deviceOf = (params: unknown): string => {
  const value = (params as { devicefile?: unknown } | null)?.devicefile;
  return typeof value === "string" ? value : "";
};

// ---- Disks ---------------------------------------------------------------------------------------

type Disk = DiskDevice;
const VM_DISKS = asDto<Disk[]>(
  CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value.data,
);

const TB4 = "4000787030016";

/** A hard disk of the hand-written NAS: serial EXAMPLE-SERIAL-01nn, its by-id and by-path links. */
function hdd(name: string, serialNo: number, over: Partial<Disk> = {}): Disk {
  const serial = `EXAMPLE-SERIAL-${String(serialNo).padStart(4, "0")}`;
  const model = over.model ?? "Example HDD 4TB";
  const byId = `/dev/disk/by-id/ata-${model.replace(/[^A-Za-z0-9]+/g, "_")}_${serial}`;
  return {
    devicename: name,
    canonicaldevicefile: `/dev/${name}`,
    devicefile: byId,
    devicelinks: [
      byId,
      `/dev/disk/by-id/wwn-EXAMPLE-WWN-${String(serialNo).padStart(4, "0")}`,
      `/dev/disk/by-path/pci-0000:00:17.0-ata-${String(serialNo % 100)}`,
    ],
    model,
    size: TB4,
    description: `${model} [/dev/${name}]`,
    vendor: "ATA",
    serialnumber: serial,
    wwn: `EXAMPLE-WWN-${String(serialNo).padStart(4, "0")}`,
    israid: false,
    isroot: false,
    isreadonly: false,
    powermode: "ACTIVE or IDLE",
    temperature: "34",
    hotpluggable: false,
    ...over,
  };
}

// The hand-written NAS: an NVMe system disk, two data disks in use, an empty disk, a USB disk with a
// file system from another computer, and two disks in a RAID mirror.
const NAS_DISKS: Disk[] = [
  hdd("nvme0n1", 100, {
    model: "Example NVMe SSD 500GB",
    size: "500107862016",
    vendor: "",
    isroot: true,
    powermode: "UNKNOWN",
    temperature: "38",
    devicefile:
      "/dev/disk/by-id/nvme-Example_NVMe_SSD_500GB_EXAMPLE-SERIAL-0100",
    devicelinks: [
      "/dev/disk/by-id/nvme-Example_NVMe_SSD_500GB_EXAMPLE-SERIAL-0100",
      "/dev/disk/by-path/pci-0000:01:00.0-nvme-1",
    ],
  }),
  hdd("sda", 101),
  hdd("sdb", 102, { temperature: "41" }),
  hdd("sdc", 103, {
    model: "Example HDD 8TB",
    size: "8001563222016",
    temperature: "31",
  }),
  hdd("sdd", 104, {
    model: "Example USB Drive",
    size: "1000204886016",
    vendor: "Example",
    hotpluggable: true,
    powermode: "UNKNOWN",
    temperature: "",
    devicefile: "/dev/disk/by-id/usb-Example_USB_Drive_EXAMPLE-SERIAL-0104-0:0",
    devicelinks: [
      "/dev/disk/by-id/usb-Example_USB_Drive_EXAMPLE-SERIAL-0104-0:0",
      "/dev/disk/by-path/pci-0000:00:14.0-usb-0:2:1.0-scsi-0:0:0:0",
    ],
  }),
  hdd("sde", 105, { temperature: "35" }),
  hdd("sdf", 106, { temperature: "36" }),
];

// The test VM's disks with sdb asleep and power settings saved on three disks (hand-written from the
// standby and withHdparm examples): one in the list, one at a value the list has, one set elsewhere.
const hdparm = (disk: Disk, over: Record<string, unknown>) => ({
  uuid: `00000000-0000-4000-8000-0000000004${disk.devicename.slice(-1) === "b" ? "01" : disk.devicename.slice(-1) === "c" ? "02" : "03"}`,
  devicefile: disk.devicefile,
  apm: 127,
  aam: 0,
  spindowntime: 241,
  writecache: true,
  ...over,
});
const ASLEEP_DISKS: Disk[] = VM_DISKS.map((disk) => {
  switch (disk.devicename) {
    case "sdb":
      return {
        ...disk,
        powermode: "STANDBY",
        temperature: "",
        hdparm: hdparm(disk, {}),
      };
    case "sdc":
      return { ...disk, hdparm: hdparm(disk, { spindowntime: 120, apm: 254 }) };
    case "sdd":
      return {
        ...disk,
        hdparm: hdparm(disk, {
          spindowntime: 100,
          apm: 200,
          writecache: false,
        }),
      };
    default:
      return disk;
  }
});

const MANY_DISKS: Disk[] = [
  NAS_DISKS[0] as Disk,
  ...Array.from({ length: 19 }, (_, i) =>
    hdd(`sd${String.fromCharCode(97 + i)}`, 120 + i, {
      temperature: String(30 + (i % 9)),
    }),
  ),
];

// Hand-written to test layout and UI-2: identical twins, a 200-character model, a right-to-left one,
// one that looks like markup, and a disk that reports neither model nor serial number.
const HOSTILE_DISKS: Disk[] = [
  NAS_DISKS[0] as Disk,
  hdd("sda", 141),
  hdd("sdb", 142),
  hdd("sdc", 143, {
    model: `Example ${"Very Long Model Name ".repeat(10)}`.slice(0, 200),
  }),
  hdd("sdd", 144, { model: "قرص تخزين خارجي" }),
  hdd("sde", 145, { model: '<img src=x onerror="alert(1)">' }),
  hdd("sdf", 146, { model: "", serialnumber: "", vendor: "" }),
];

// ---- File systems --------------------------------------------------------------------------------

type Detected = DetectedFilesystem;
const DETECTED_BASE = asDto<Detected>(
  CONTRACT_EXAMPLES.fileSystemMgmtEnumerateFilesystems.vmFilesystems.value[0],
);
type Configured = ConfiguredFilesystem;
const CONFIGURED_BASE = asDto<Configured>(
  CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value.data[0],
);

/** A detected file system on `device` (a partition, or a whole device such as /dev/md0). */
function detected(
  device: string,
  parent: string,
  n: number,
  over: Partial<Detected> = {},
): Detected {
  const uuid = `00000000-0000-4000-8000-0000000005${String(n).padStart(2, "0")}`;
  return {
    ...DETECTED_BASE,
    devicename: device.replace("/dev/", ""),
    devicefile: `/dev/disk/by-uuid/${uuid}`,
    predictabledevicefile: `/dev/disk/by-uuid/${uuid}`,
    canonicaldevicefile: device,
    parentdevicefile: parent,
    devlinks: [`/dev/disk/by-uuid/${uuid}`],
    uuid,
    label: "",
    type: "ext4",
    mounted: false,
    mountpoint: "",
    blocks: "-1",
    size: "-1",
    available: "-1",
    used: "-1",
    percentage: -1,
    description: device,
    devicefiles: [device],
    comment: "",
    _readonly: false,
    _used: false,
    ...over,
  };
}

const mountedAt = (uuid: string) => ({
  mounted: true,
  mountpoint: `/srv/dev-disk-by-uuid-${uuid}`,
  blocks: "3906250000",
  size: "4000000000000",
  available: "2500000000000",
  used: "1.36 TiB",
  percentage: 38,
});

/** The configured row of a detected file system: OMV's mount entry, status 1. */
const configured = (
  fs: Detected,
  over: Partial<Configured> = {},
): Configured => ({
  ...CONFIGURED_BASE,
  ...fs,
  hasmultipledevices: false,
  usagewarnthreshold: 85,
  mountopts: "defaults,nofail,user_xattr,usrquota,grpquota,acl",
  status: 1,
  ...over,
});

const NAS_ROOT = detected("/dev/nvme0n1p2", "/dev/nvme0n1", 1, {
  mounted: true,
  mountpoint: "/",
  size: "490000000000",
  _readonly: true,
  _used: true,
});
const NAS_EFI = detected("/dev/nvme0n1p1", "/dev/nvme0n1", 2, {
  type: "vfat",
  mounted: true,
  mountpoint: "/boot/efi",
  size: "535805952",
});
const NAS_DATA = detected("/dev/sda1", "/dev/sda", 3, {
  label: "data",
  ...mountedAt("00000000-0000-4000-8000-000000000503"),
  _used: true,
});
const NAS_MEDIA = detected("/dev/sdb1", "/dev/sdb", 4, {
  label: "media",
  ...mountedAt("00000000-0000-4000-8000-000000000504"),
});
const NAS_OLD = detected("/dev/sdd1", "/dev/sdd", 5, {
  label: "old-pc",
  type: "ntfs",
});
const NAS_BACKUP = detected("/dev/md0", "/dev/md0", 6, {
  label: "backup",
  type: "btrfs",
  ...mountedAt("00000000-0000-4000-8000-000000000506"),
  _used: true,
});

const NAS_DETECTED = [
  NAS_ROOT,
  NAS_EFI,
  NAS_DATA,
  NAS_MEDIA,
  NAS_OLD,
  NAS_BACKUP,
];
const NAS_CONFIGURED = [
  configured(NAS_DATA),
  configured(NAS_MEDIA),
  configured(NAS_BACKUP),
];

// The VM with swap on sdb, a file system being created on sdc, a second file system on sda that is
// set up but not mounted, and on sdd an encrypted container (crypto_LUKS) whose opened device holds a
// mounted file system the interface cannot trace to a disk (hand-written).
const VM_DETECTED = [
  ...CONTRACT_EXAMPLES.fileSystemMgmtEnumerateFilesystems.vmFilesystems.value,
];
const VM_CONFIGURED = [
  ...CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value.data,
];
const SWAP = detected("/dev/sdb1", "/dev/sdb", 11, { type: "swap" });
const CRYPT = detected("/dev/dm-0", "/dev/dm-0", 12, {
  label: "vault",
  devicefile: "/dev/mapper/sdd-crypt",
  ...mountedAt("00000000-0000-4000-8000-000000000512"),
});
const CREATING = configured(detected("", "/dev/sdc", 13), {
  status: 2,
  devicename: "",
  canonicaldevicefile: "",
  devicefile: "",
  devicefiles: [],
  mounted: false,
  mountpoint: "",
});
const { usagewarnthreshold: _a, mountopts: _b, ...CREATING_ROW } = CREATING;
const LUKS = detected("/dev/sdd1", "/dev/sdd", 14, { type: "crypto_LUKS" });
const ARCHIVE = detected("/dev/sda2", "/dev/sda", 15, { label: "archive" });
const ARCHIVE_SET_UP = configured(ARCHIVE, {
  mountpoint: "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000515",
});

// ---- RAID ----------------------------------------------------------------------------------------

const NAS_ARRAYS = [
  {
    ...CONTRACT_EXAMPLES.mdMgmtEnumerateDevices.mirrors.value[0],
    devices: ["/dev/sde", "/dev/sdf"],
  },
];

// ---- Disk health ---------------------------------------------------------------------------------

const SMART_FINISHED =
  CONTRACT_EXAMPLES.execGetOutput.smartDevicesFinished.value;

/** The disk-health check's row of a disk. */
function smartRow(
  disk: Disk,
  overallstatus: string,
  monitor: boolean,
  uuid: string,
) {
  return {
    devicename: disk.devicename,
    canonicaldevicefile: disk.canonicaldevicefile,
    devicefile: disk.devicefile,
    devicelinks: disk.devicelinks,
    model: disk.model,
    size: disk.size,
    temperature: disk.temperature,
    description: disk.description,
    vendor: disk.vendor,
    serialnumber: disk.serialnumber,
    wwn: disk.wwn,
    overallstatus,
    uuid,
    monitor,
    _used: false,
  };
}
const NEW_UUID = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
const settingsUuid = (n: number) =>
  `00000000-0000-4000-8000-0000000006${String(n).padStart(2, "0")}`;

function smartFinished(rows: readonly unknown[]): FixedAnswer {
  const output = JSON.stringify({ total: rows.length, data: rows });
  return ok({ ...SMART_FINISHED, output, pos: output.length });
}

const nas = (name: string): Disk =>
  NAS_DISKS.find((d) => d.devicename === name) as Disk;

// The USB disk is not in the check: its enclosure passes no health readings through.
const NAS_CHECK = smartFinished([
  smartRow(nas("nvme0n1"), "GOOD", false, NEW_UUID),
  { ...smartRow(nas("sda"), "GOOD", true, settingsUuid(1)), _used: true },
  { ...smartRow(nas("sdb"), "BAD_SECTOR", true, settingsUuid(2)), _used: true },
  smartRow(nas("sdc"), "GOOD", false, settingsUuid(3)),
  { ...smartRow(nas("sde"), "GOOD", true, settingsUuid(5)), _used: true },
  { ...smartRow(nas("sdf"), "GOOD", true, settingsUuid(6)), _used: true },
]);
const ASLEEP_CHECK = smartFinished(
  VM_DISKS.filter((d) => d.devicename !== "sr0").map((d) =>
    smartRow(
      d,
      d.devicename === "nvme0n1" ? "GOOD" : "BAD_STATUS",
      d.devicename === "sdb",
      d.devicename === "sdb" ? settingsUuid(12) : NEW_UUID,
    ),
  ),
);

const watched = (disk: Disk, n: number, used = false) =>
  ok({
    uuid: settingsUuid(n),
    enable: true,
    devicefile: disk.devicefile,
    devicetype: "",
    tempdiff: 0,
    tempmax: 0,
    _used: used,
  });
const NO_SETTINGS = "notConfigured";

function nasDeviceSettings(params: unknown): Reply {
  const device = deviceOf(params);
  const disk = NAS_DISKS.find(
    (d) => d.devicefile === device || d.canonicaldevicefile === device,
  );
  switch (disk?.devicename) {
    case "sda":
      return watched(disk, 1, true);
    case "sdb":
      return watched(disk, 2, true);
    case "sdc":
      return ok({
        uuid: settingsUuid(3),
        enable: false,
        devicefile: disk.devicefile,
        devicetype: "",
        tempdiff: 0,
        tempmax: 0,
        _used: true,
      });
    case "sde":
      return watched(disk, 5, true);
    case "sdf":
      return watched(disk, 6, true);
    default:
      return NO_SETTINGS;
  }
}

const SETTINGS_ON = ok({
  enable: true,
  interval: 1800,
  powermode: "standby",
  tempdiff: 0,
  tempmax: 50,
});

// Scheduled self-tests of the NAS (hand-written from the several example): a weekly short test, a
// monthly long test, a custom schedule, a test of a disk that is not connected, a test of a disk
// that is not watched, and one turned off.
type Entry = SmartScheduleEntry;
const ENTRY_BASE = asDto<Entry>(
  CONTRACT_EXAMPLES.smartGetScheduleList.several.value.data[0],
);
const testOf = (
  disk: Disk | null,
  n: number,
  schedule: Pick<Entry, "type" | "hour" | "month" | "dayofmonth" | "dayofweek">,
  over: Partial<Entry> = {},
): Entry => ({
  ...ENTRY_BASE,
  uuid: `00000000-0000-4000-8000-0000000007${String(n).padStart(2, "0")}`,
  enable: true,
  devicefile: disk?.canonicaldevicefile ?? "",
  comment: "",
  devicelinks: disk?.devicelinks ?? [],
  model: disk?.model ?? "",
  serialnumber: disk?.serialnumber ?? "",
  size: disk?.size ?? "-1",
  ...schedule,
  ...over,
});
const NAS_TESTS = list([
  testOf(nas("sda"), 1, {
    type: "S",
    hour: "03",
    month: "*",
    dayofmonth: "*",
    dayofweek: "7",
  }),
  testOf(
    nas("sdb"),
    2,
    { type: "L", hour: "03", month: "*", dayofmonth: "01", dayofweek: "*" },
    { comment: "Monthly long test" },
  ),
  testOf(nas("sdc"), 3, {
    type: "S",
    hour: "02",
    month: "*",
    dayofmonth: "*",
    dayofweek: "*",
  }),
  testOf(
    nas("sde"),
    4,
    { type: "C", hour: "05", month: "03", dayofmonth: "15", dayofweek: "1" },
    { comment: "Custom schedule" },
  ),
  testOf(
    nas("sdf"),
    5,
    { type: "S", hour: "04", month: "*", dayofmonth: "*", dayofweek: "*" },
    { enable: false, comment: "Turned off for now" },
  ),
  testOf(
    null,
    6,
    { type: "S", hour: "01", month: "*", dayofmonth: "*", dayofweek: "6" },
    { comment: "The disk that was replaced" },
  ),
]);

// Health details (hand-written): a healthy hard disk, the failing one of the contract, and the NVMe
// disk as captured. The USB disk does not pass readings through.
const INFO_FAILING = CONTRACT_EXAMPLES.smartGetInformation.ataFailing.value;
const healthyInfo = (disk: Disk) =>
  ok({
    ...INFO_FAILING,
    devicefile: disk.canonicaldevicefile,
    devicemodel: disk.model,
    serialnumber: disk.serialnumber,
    wwn: disk.wwn,
    smartoverallhealthselfassessmenttestresult: "PASSED",
    temperature: disk.temperature,
    powercycles: "84",
    poweronhours: "26280",
  });
const PASSED_LOG = ok([
  {
    num: "1",
    description: "Short offline",
    status: "Completed without error      ",
    remaining: "00",
    lifetime: "26270",
    lbaoffirsterror: "-",
  },
  {
    num: "2",
    description: "Short offline",
    status: "Completed without error      ",
    remaining: "00",
    lifetime: "26102",
    lbaoffirsterror: "-",
  },
  {
    num: "3",
    description: "Extended offline",
    status: "Self-test routine in progress",
    remaining: "40",
    lifetime: "26279",
    lbaoffirsterror: "-",
  },
  {
    num: "4",
    description: "Extended offline",
    status: "Aborted by host              ",
    remaining: "70",
    lifetime: "25900",
    lbaoffirsterror: "-",
  },
]);
// A long report (2,000 lines), with a line that looks like markup.
const LONG_REPORT = ok(
  [
    CONTRACT_EXAMPLES.smartGetExtendedInformation.nvme.value,
    '<script>alert("not markup")</script> <b>bold?</b>',
    ...Array.from(
      { length: 2000 },
      (_, i) =>
        `Line ${String(i + 1).padStart(4, "0")}: ${"x".repeat(40 + (i % 80))}`,
    ),
  ].join("\n"),
);
const NO_SMART = fail(
  500,
  "Device '/dev/sdd' does not support S.M.A.R.T. or it is not enabled.",
);

function nasDetail(
  params: unknown,
  healthy: (disk: Disk) => Reply,
  failing: Reply,
  nvme: Reply,
): Reply {
  const device = deviceOf(params);
  const disk = NAS_DISKS.find(
    (d) => d.devicefile === device || d.canonicaldevicefile === device,
  );
  switch (disk?.devicename) {
    case "nvme0n1":
      return nvme;
    case "sdb":
      return failing;
    case "sdd":
      return NO_SMART;
    case undefined:
      return fail(500, `Device '${device}' not found.`);
    default:
      return disk === undefined ? NO_SMART : healthy(disk);
  }
}

// ---- Tasks ---------------------------------------------------------------------------------------

const WIPE_FINISHED = CONTRACT_EXAMPLES.execGetOutput.wipeFinished.value;
const SECURE_LINES = [
  "shred: /dev/disk/by-id/ata-Example: pass 1/1 (random)...",
  "shred: /dev/disk/by-id/ata-Example: pass 1/1 (random)...1.2GiB/3.7TiB 32%",
  "shred: /dev/disk/by-id/ata-Example: pass 1/1 (random)...2.4GiB/3.7TiB 64%",
  "shred: /dev/disk/by-id/ata-Example: pass 1/1 (random)...3.7TiB/3.7TiB 100%",
];
const TEST_FINISHED = CONTRACT_EXAMPLES.execGetOutput.selfTestFinished.value;
const TEST_UNCLEAR = ok({
  ...TEST_FINISHED,
  output:
    "smartctl 7.4 2023-08-01 r5530 [x86_64-linux-6.12.57+deb13-amd64] (local build)\nRead Device Identity failed: scsi error unsupported field in scsi command\n\nA mandatory SMART command failed: exiting. To continue, add one or more '-T permissive' options.\n",
});
const TEST_FAILED = fail(
  500,
  "Failed to execute command 'export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin; export LANG=C.UTF-8; export LANGUAGE=; smartctl --test=short '/dev/sdb' 2>&1' with exit code '4': Device open failed",
);

export interface DiskMockState {
  /** The last wipe started: whether secure, and how many polls of its output have been answered. */
  wipe: { secure: boolean; polls: number };
}
export const newDiskMockState = (): DiskMockState => ({
  wipe: { secure: false, polls: 0 },
});

/** The last poll of a wipe: a quick one ends at once; a secure one prints shred's progress first. */
export function wipeOutput(name: string, state: DiskMockState): TaskReply {
  if (name === "wipeFails") {
    return "wipeFailed";
  }
  if (!state.wipe.secure) {
    return "wipeFinished";
  }
  const poll = state.wipe.polls++;
  const output =
    SECURE_LINES.slice(0, Math.min(poll + 1, SECURE_LINES.length)).join("\n") +
    "\n";
  const running = poll < SECURE_LINES.length - 1;
  return ok({
    ...WIPE_FINISHED,
    output: running
      ? `${SECURE_LINES[poll] ?? ""}\n`
      : `${SECURE_LINES.at(-1) ?? ""}\n`,
    pos: output.length,
    running,
    pendingOutput: false,
  });
}

export function selfTestOutput(name: string): TaskReply {
  if (name === "testUnclear") {
    return TEST_UNCLEAR;
  }
  if (name === "testFails") {
    return TEST_FAILED;
  }
  return "selfTestFinished";
}

/** The disk-health check's last poll in a disk scenario, when it differs from the dashboard's. */
export function diskCheckOutput(name: string): TaskReply | undefined {
  switch (name) {
    case "disksNas":
    case "disksHostile":
    case "disksMany":
    case "wipeFails":
    case "testUnclear":
    case "testFails":
    case "smartDetailsFail":
      return NAS_CHECK;
    case "disksAsleep":
      return ASLEEP_CHECK;
    default:
      return undefined;
  }
}

/** The scenarios built on the hand-written NAS. */
const ON_NAS = new Set<string>([
  "disksNas",
  "wipeFails",
  "testUnclear",
  "testFails",
  "smartDetailsFail",
  "disksUseFails",
  "disksRaidFails",
]);

interface Params {
  params: unknown;
}
type DiskAnswer = Reply | ((call: Params) => Reply);

/**
 * The disk operations' answers in a scenario. scenarios.ts wraps each in the sign-in guard, and the
 * writes in the pending-changes mark.
 */
export function diskAnswers(
  name: string,
  state: DiskMockState,
): Record<string, DiskAnswer> {
  const onNas = ON_NAS.has(name);
  const disks = onNas
    ? list(NAS_DISKS)
    : name === "disksAsleep"
      ? list(ASLEEP_DISKS)
      : name === "disksMany"
        ? list(MANY_DISKS)
        : name === "disksHostile"
          ? list(HOSTILE_DISKS)
          : name === "disksReadFails"
            ? fail(
                500,
                "Failed to read the list of disks: lsblk exited with code 1.",
              )
            : "vmDisks";
  const configuredFs =
    name === "disksUseFails"
      ? // OMV throws when a file system has a type it has no backend for (a known quirk).
        fail(500, "No file system backend exists for the type 'zfs_member'.")
      : onNas || name === "disksHostile" || name === "disksMany"
        ? list(NAS_CONFIGURED)
        : name === "disksSwap"
          ? list([
              ...VM_CONFIGURED,
              ARCHIVE_SET_UP,
              configured(CRYPT),
              CREATING_ROW,
            ])
          : "configured";
  const detectedFs =
    onNas || name === "disksHostile" || name === "disksMany"
      ? ok(NAS_DETECTED)
      : name === "disksSwap"
        ? ok([...VM_DETECTED, SWAP, ARCHIVE, LUKS, CRYPT])
        : "vmFilesystems";
  const arrays =
    name === "disksRaidFails"
      ? fail(
          500,
          "Failed to execute command 'mdadm --detail --scan': exit code '1'.",
        )
      : onNas || name === "disksHostile" || name === "disksMany"
        ? ok(NAS_ARRAYS)
        : // The plugin is optional. The other stories have it with no array, so a mock session does
          // not log a failed request on every storage page; disksNoRaidPlugin keeps the test VM's 404.
          name === "disksNoRaidPlugin"
          ? "notInstalled"
          : "none";
  const settings =
    name === "smartOddInterval"
      ? ok({
          enable: true,
          interval: 45,
          powermode: "never",
          tempdiff: 0,
          tempmax: 0,
        })
      : name === "disksAsleep"
        ? ok({
            enable: true,
            interval: 1800,
            powermode: "never",
            tempdiff: 0,
            tempmax: 0,
          })
        : onNas
          ? SETTINGS_ON
          : "defaults";
  const deviceSettings = (call: Params): Reply => {
    if (onNas || name === "disksHostile" || name === "disksMany") {
      return nasDeviceSettings(call.params);
    }
    const device = deviceOf(call.params);
    if (name === "disksAsleep" && device.includes("SERIAL-0003")) {
      return watched(VM_DISKS[2] as Disk, 12);
    }
    return device.includes("nvme") ? "monitored" : NO_SETTINGS;
  };
  const detail =
    (healthy: (disk: Disk) => Reply, failing: Reply, nvme: Reply) =>
    (call: Params): Reply => {
      if (name === "smartDetailsFail") {
        return NO_SMART;
      }
      if (onNas || name === "disksHostile" || name === "disksMany") {
        return nasDetail(call.params, healthy, failing, nvme);
      }
      return nvme;
    };
  return {
    diskMgmtGetList: disks,
    fileSystemMgmtGetList: configuredFs,
    fileSystemMgmtEnumerateFilesystems: detectedFs,
    mdMgmtEnumerateDevices: arrays,
    smartGetSettings: settings,
    smartGetDeviceSettings: deviceSettings,
    smartGetScheduleList: onNas ? NAS_TESTS : "none",
    smartGetInformation: detail(healthyInfo, "ataFailing", "nvme"),
    smartGetAttributes: detail(() => "ataHealthy", "ataFailing", "nvme"),
    smartGetSelfTestLogs: detail(() => PASSED_LOG, "withFailure", "nvme"),
    smartGetExtendedInformation: detail(() => "nvme", LONG_REPORT, "nvme"),
    diskMgmtWipe: (call: Params) => {
      const secure = (call.params as { secure?: unknown } | null)?.secure;
      state.wipe = { secure: secure === true, polls: 0 };
      return "started";
    },
  };
}
