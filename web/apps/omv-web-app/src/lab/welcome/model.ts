// SPDX-License-Identifier: GPL-3.0-or-later
// The welcome prototype's NAS: the mock's own (src/mocks/dashboardScenarios.ts, "dashboardAllOk" and
// "dashboardNewNas"), as the dashboard reads it (journal 2026-11-27). Development only (UI-11). The
// lab boots no mock, so the raw values are copied here with the contract field each comes from, and
// formatted by the app's own rules (format.ts). Every figure the welcome says is counted or taken
// from these rows; nothing is invented (style guide 10, rule 17).
import type {
  NasDisk,
  NasDiskKind,
  NasFolder,
  NasMapInput,
  NasReads,
  NasStorage,
  NasWay,
} from "@omv-webui/react-ui-components";
import { formatBytes } from "../../format/format.ts";
import type { CaseId, CheckState } from "./states.ts";

const NBSP = " ";
const GIB = 1024 ** 3;
const TIB = 1024 ** 4;

/** System.getInformation: `hostname`. */
export const HOST = "nas";

interface DiskRow {
  /** DiskMgmt.getList `devicename`. */
  device: string;
  /** DiskMgmt.getList `size`, in bytes. */
  size: number;
  /**
   * The drawing: nvme from `devicename`; hdd or ssd from Smart.getInformation `rotationrate`, read
   * only for a disk that is awake; `disk` (no kind claimed) for one asleep.
   */
  kind: NasDiskKind;
  /** DiskMgmt.getList `temperature`, "" when the disk is asleep (`powermode` STANDBY). */
  temperature: string;
  /** DiskMgmt.getList `israid`. */
  raid: boolean;
}

/** DiskMgmt.getList on the mock (SIX_DISKS). */
const DISKS: readonly DiskRow[] = [
  {
    device: "nvme0n1",
    size: 256060514304,
    kind: "nvme",
    temperature: "34",
    raid: false,
  },
  {
    device: "sda",
    size: 4000787030016,
    kind: "hdd",
    temperature: "36",
    raid: false,
  },
  {
    device: "sdb",
    size: 4000787030016,
    kind: "hdd",
    temperature: "35",
    raid: true,
  },
  {
    device: "sdc",
    size: 4000787030016,
    kind: "hdd",
    temperature: "37",
    raid: true,
  },
  {
    device: "sdd",
    size: 4000787030016,
    kind: "disk",
    temperature: "",
    raid: false,
  },
  {
    device: "sde",
    size: 1000204886016,
    kind: "ssd",
    temperature: "31",
    raid: false,
  },
];

interface StorageRow {
  id: string;
  /** FileSystemMgmt.getList `label`; the pool's name for ZFS. */
  name: string;
  /** FileSystemMgmt.getList `type`, as the app names it; "ZFS pool" for Zfs.listPools. */
  tech: string;
  kind: NasStorage["kind"];
  /** FileSystemMgmt.getList `size`, bytes. */
  size: number;
  /** FileSystemMgmt.getList `percentage`. */
  percent: number;
  /** FileSystemMgmt.getList `usagewarnthreshold`; null for 0 ("never warn"). */
  mark: number | null;
  /** The disks it stands on: `devicefiles`, Zfs.getPoolDevices. None for md0 (MdMgmt is not read). */
  disks: readonly string[];
  folders: readonly string[];
  system?: boolean;
  disksNote?: string;
}

/** FileSystemMgmt.getList and Zfs.getPoolStatus on the mock (sixDiskNas(62)). */
const STORAGE: readonly StorageRow[] = [
  {
    id: "data",
    name: "Data drive",
    tech: "EXT4",
    kind: "fs",
    size: 3.6 * TIB,
    percent: 62,
    mark: 85,
    disks: ["sda"],
    folders: ["photos", "music", "documents"],
  },
  {
    id: "backup",
    name: "Backup",
    tech: "EXT4",
    kind: "fs",
    size: 3.6 * TIB,
    percent: 41,
    mark: 88,
    disks: [],
    folders: ["timemachine", "a4share"],
    disksNote: "Its disks are listed on the RAID page.",
  },
  {
    id: "tank",
    name: "tank",
    tech: "ZFS pool",
    kind: "zfs",
    size: 3.6 * TIB,
    percent: 28,
    mark: null,
    disks: ["sdd"],
    folders: ["archive"],
  },
  {
    id: "system",
    name: "System drive",
    tech: "EXT4",
    kind: "fs",
    size: 20 * GIB,
    percent: 10,
    mark: 85,
    disks: ["nvme0n1"],
    folders: [],
    system: true,
  },
];

/** ShareMgmt.getList, with SMB.getShareList and NFS.getShareList for the ways each is reached by. */
const FOLDERS: readonly NasFolder[] = [
  folder("photos", "Photos", ["smb"]),
  folder("music", "Music", ["smb", "nfs"]),
  folder("documents", "Documents", ["smb"]),
  folder("timemachine", "Time Machine", ["smb"]),
  folder("a4share", "a4share", []),
  folder("archive", "Archive", ["nfs"]),
];

function folder(id: string, name: string, ways: NasFolder["ways"]): NasFolder {
  return { id, name, ways, health: "ok", healthLabel: "OK" };
}

/** Services.getStatus: nfs, samba and ssh running, rsyncd off. A new NAS has SSH alone. */
function ways(newNas: boolean): NasWay[] {
  const on = (id: NasWay["id"]) => (newNas ? id === "ssh" : id !== "rsync");
  return [
    {
      id: "smb",
      name: "Windows and Mac",
      tech: "SMB",
      enabled: on("smb"),
      running: on("smb"),
    },
    {
      id: "nfs",
      name: "Linux and Unix",
      tech: "NFS",
      enabled: on("nfs"),
      running: on("nfs"),
    },
    {
      id: "rsync",
      name: "Copies to other NAS",
      tech: "rsync",
      enabled: false,
      running: false,
    },
    {
      id: "ssh",
      name: "Remote sign-in",
      tech: "SSH",
      enabled: true,
      running: true,
    },
  ];
}

export interface WelcomeWordsIn {
  kind: (kind: NasDiskKind) => string;
  notChecked: string;
  ok: string;
  asleep: string;
  celsius: (value: string) => string;
  speed: (mbit: number) => string;
}

/** A disk as the welcome and the map show it. */
export interface LabDisk extends NasDisk {
  /** "Hard disk, 3.6 TiB". */
  summary: string;
  /** DiskMgmt.getList `size`, formatted. */
  sizeText: string;
  asleep: boolean;
  /** "36 °C", "Asleep". */
  detail: string;
}

export interface LabStorage extends NasStorage {
  percent: number;
  mark: number | null;
  sizeText: string;
  freeText: string;
  disks: readonly string[];
}

export interface LabNas {
  input: NasMapInput;
  disks: LabDisk[];
  storage: LabStorage[];
  folders: readonly NasFolder[];
  /** The facts the welcome counts, all from the rows above. */
  facts: {
    host: string;
    disks: number;
    /** Storage that is not the system drive's own, and the system drive: every row. */
    drives: number;
    folders: number;
    /** Disks in no storage and in no array: the unused row. */
    unused: LabDisk[];
    /** Disks asleep (DiskMgmt.getList `powermode` STANDBY). */
    asleep: LabDisk[];
    /** Shared folders no way in reaches. */
    unreached: NasFolder[];
    /** The first shared folder reached by a way in, for "Point at Photos". */
    example: NasFolder | null;
  };
}

/**
 * The mock's NAS for a case and a point in the disk health check. Before the check, Smart.getListBg
 * has not been read: every disk is "Not checked yet" and `reads.health` is missing, so the answer can
 * only say "No problems found so far." After it, every disk reported GOOD.
 */
export function labNas(
  which: CaseId,
  check: CheckState,
  words: WelcomeWordsIn,
): LabNas {
  const newNas = which === "new";
  const checked = check === "after";
  const storageRows = newNas ? STORAGE.filter((s) => s.system) : STORAGE;
  const folders = newNas ? [] : FOLDERS;

  const disks: LabDisk[] = DISKS.map((d) => {
    const asleep = d.temperature === "";
    const sizeText = formatBytes(d.size);
    const holds = storageRows
      .filter((s) => s.disks.includes(d.device))
      .map((s) => s.id);
    return {
      id: d.device,
      device: d.device,
      kind: d.kind,
      health: checked ? "ok" : "unknown",
      healthLabel: checked ? words.ok : words.notChecked,
      detail: asleep ? words.asleep : words.celsius(d.temperature),
      summary: `${words.kind(d.kind)}, ${sizeText}`,
      sizeText,
      asleep,
      storage: holds,
      raidMember: !newNas && d.raid ? true : undefined,
    };
  });

  const storage: LabStorage[] = storageRows.map((s) => {
    const free = s.size * (1 - s.percent / 100);
    return {
      id: s.id,
      name: s.name,
      tech: s.tech,
      kind: s.kind,
      used: s.percent / 100,
      health: "ok",
      healthLabel: words.ok,
      folders: s.folders,
      system: s.system,
      disksNote: s.disksNote,
      percent: s.percent,
      mark: s.mark,
      sizeText: formatBytes(s.size),
      freeText: formatBytes(free),
      disks: s.disks,
    };
  });

  const reads: NasReads = {
    disks: "ok",
    storage: "ok",
    folders: "ok",
    ways: "ok",
    network: "ok",
    system: "ok",
    ...(checked ? { health: "ok" as const } : {}),
  };

  const input: NasMapInput = {
    disks,
    storage,
    folders,
    ways: ways(newNas),
    interfaces: [
      {
        id: "enp2s0",
        name: "enp2s0",
        kind: "ethernet",
        up: true,
        speed: words.speed(1000),
        address: "192.0.2.10",
      },
    ],
    reads,
  };

  const unused = disks.filter(
    (d) => d.storage.length === 0 && d.raidMember !== true,
  );
  return {
    input,
    disks,
    storage,
    folders,
    facts: {
      host: HOST,
      disks: disks.length,
      drives: storage.length,
      folders: folders.length,
      unused,
      asleep: disks.filter((d) => d.asleep),
      unreached: folders.filter((f) => f.ways.length === 0),
      example: folders.find((f) => f.ways.length > 0) ?? null,
    },
  };
}

/** The time Smart.getListBg's reply arrived, as the app shows it; fixed for screenshots. */
export const CHECKED_AT = "10:31";

export { NBSP };
