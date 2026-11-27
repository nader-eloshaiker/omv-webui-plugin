// SPDX-License-Identifier: GPL-3.0-or-later
// Stories and tests only: the dashboard lab's NAS (the mock's default), as the map's inputs. Figures
// agree with one another and stand for what the contract's reads would give; the components show
// only what comes in here.
import type {
  NasDisk,
  NasFolder,
  NasMapInput,
  NasReads,
  NasStorage,
  NasWay,
} from "../components/nas-map/nas-map-model";

const NBSP = "\u00a0";
const tib = (n: string) => `${n}${NBSP}TiB`;
const gib = (n: string) => `${n}${NBSP}GiB`;
const celsius = (n: number) => `${String(n)}${NBSP}°C`;

export const ALL_READ: NasReads = {
  disks: "ok",
  health: "ok",
  storage: "ok",
  folders: "ok",
  ways: "ok",
  network: "ok",
  system: "ok",
};

function disk(
  device: string,
  kind: NasDisk["kind"],
  size: string,
  storage: string[],
  temp: number,
): NasDisk {
  return {
    id: device,
    device,
    kind,
    health: "ok",
    healthLabel: "OK",
    detail: celsius(temp),
    summary: `${kind === "hdd" ? "Hard disk" : kind === "nvme" ? "NVMe SSD" : "SSD"} ${size}`,
    storage,
  };
}

function store(
  id: string,
  name: string,
  tech: string,
  kind: NasStorage["kind"],
  used: number,
  folders: string[],
  system = false,
): NasStorage {
  return {
    id,
    name,
    tech,
    kind,
    used,
    health: "ok",
    healthLabel: "OK",
    folders,
    system,
  };
}

const folder = (
  id: string,
  name: string,
  ways: NasFolder["ways"],
): NasFolder => ({
  id,
  name,
  ways,
  health: "ok",
  healthLabel: "OK",
});

const WAYS: NasWay[] = [
  {
    id: "smb",
    name: "Windows and Mac",
    tech: "SMB",
    enabled: true,
    running: true,
  },
  {
    id: "nfs",
    name: "Linux and Unix",
    tech: "NFS",
    enabled: true,
    running: true,
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

/** Space figures for each storage, as the page formats them for its meter. */
export const SPACE: Record<string, { free: string; total: string }> = {
  system: { free: gib("16.9"), total: gib("18.6") },
  data: { free: tib("1.4"), total: tib("3.6") },
  backup: { free: tib("2.1"), total: tib("3.6") },
  tank: { free: tib("2.6"), total: tib("3.6") },
};

/** The mock's NAS, all fine: six disks, four storage (a mirror and a ZFS pool), six folders. */
export function baseNas(): NasMapInput {
  return {
    disks: [
      disk("nvme0n1", "nvme", gib("238.5"), ["system"], 34),
      disk("sda", "hdd", tib("3.6"), ["data"], 36),
      disk("sdb", "hdd", tib("3.6"), ["backup"], 35),
      disk("sdc", "hdd", tib("3.6"), ["backup"], 37),
      disk("sdd", "hdd", tib("3.6"), ["tank"], 33),
      disk("sde", "ssd", gib("931.5"), [], 31),
    ],
    storage: [
      store("system", "System drive", "EXT4", "fs", 0.1, [], true),
      store("data", "Data drive", "EXT4", "fs", 0.62, [
        "photos",
        "music",
        "documents",
      ]),
      store("backup", "Backup", "Mirror (RAID 1)", "raid", 0.41, [
        "timemachine",
        "a4share",
      ]),
      store("tank", "tank", "ZFS pool", "zfs", 0.28, ["archive"]),
    ],
    folders: [
      folder("photos", "Photos", ["smb"]),
      folder("music", "Music", ["smb", "nfs"]),
      folder("documents", "Documents", ["smb"]),
      folder("timemachine", "Time Machine", ["smb"]),
      folder("a4share", "a4share", []),
      folder("archive", "Archive", ["nfs"]),
    ],
    ways: WAYS,
    interfaces: [
      {
        id: "enp2s0",
        name: "enp2s0",
        kind: "ethernet",
        up: true,
        speed: `1${NBSP}Gbit/s`,
        address: "192.0.2.10",
      },
    ],
    reads: ALL_READ,
  };
}

/**
 * The mock's NAS as the dashboard reads it (owner, 2026-11-27): MdMgmt.enumerateDevices is never
 * read, so the Backup mirror is only its file system from FileSystemMgmt.getList (on md0, EXT4), with
 * no disk attached, and sdb and sdc, which DiskMgmt.getList marks `israid`, stand on a row of their
 * own.
 */
export function dashboardReadsNas(): NasMapInput {
  const nas = baseNas();
  return {
    ...nas,
    disks: nas.disks.map((d) =>
      d.storage.includes("backup")
        ? { ...d, storage: [], raidMember: true }
        : d,
    ),
    storage: nas.storage.map((s) =>
      s.id === "backup"
        ? {
            ...s,
            tech: "EXT4",
            disksNote: "Its disks are listed on the RAID page.",
          }
        : s,
    ),
  };
}

/**
 * The same, with Zfs.getPoolDevices failed for tank: the pool comes with no disk, so sdd is in no
 * storage the map knows of, and no disk is called unused.
 */
export function poolDisksUnreadNas(): NasMapInput {
  const nas = dashboardReadsNas();
  return {
    ...nas,
    disks: nas.disks.map((d) =>
      d.storage.includes("tank") ? { ...d, storage: [] } : d,
    ),
    storage: nas.storage.map((s) =>
      s.id === "tank"
        ? {
            ...s,
            disksNote: "Which disks it is on could not be read.",
            disksUnread: true,
          }
        : s,
    ),
  };
}

/** sdb reports a problem (the lab's "a problem arrives"). */
export function withSdbWarning(nas: NasMapInput): NasMapInput {
  return {
    ...nas,
    disks: nas.disks.map((d) =>
      d.id === "sdb" ? { ...d, health: "warning", healthLabel: "Warning" } : d,
    ),
  };
}

/** Four things need you: sdb, Data drive almost full (92 %), a restart and the clock. */
export function needsYouNas(): NasMapInput {
  const nas = withSdbWarning(baseNas());
  return {
    ...nas,
    storage: nas.storage.map((s) =>
      s.id === "data"
        ? { ...s, used: 0.92, health: "warning", healthLabel: "Almost full" }
        : s,
    ),
  };
}

/** sda is failing. */
export function diskCriticalNas(): NasMapInput {
  const nas = baseNas();
  return {
    ...nas,
    disks: nas.disks.map((d) =>
      d.id === "sda" ? { ...d, health: "critical", healthLabel: "Failing" } : d,
    ),
  };
}

/** A new NAS: the system drive and five disks not in use, not checked yet; only SSH on. */
export function newNas(): NasMapInput {
  const nas = baseNas();
  return {
    ...nas,
    disks: nas.disks.map((d) =>
      d.id === "nvme0n1"
        ? d
        : {
            ...d,
            storage: [],
            health: "unknown",
            healthLabel: "Not checked yet",
          },
    ),
    storage: nas.storage.filter((s) => s.system),
    folders: [],
    ways: WAYS.map((w) => ({
      ...w,
      enabled: w.id === "ssh",
      running: w.id === "ssh",
    })),
  };
}

/** The new NAS after its first storage was added on sda (a ghost becoming real). */
export function withFirstStorage(nas: NasMapInput): NasMapInput {
  return {
    ...nas,
    disks: nas.disks.map((d) =>
      d.id === "sda" ? { ...d, storage: ["data"] } : d,
    ),
    storage: [...nas.storage, store("data", "Data drive", "EXT4", "fs", 0, [])],
  };
}

/** Existing storage, no shared folders. */
export function noFoldersNas(): NasMapInput {
  const nas = baseNas();
  return {
    ...nas,
    storage: nas.storage.map((s) => ({ ...s, folders: [] })),
    folders: [],
  };
}

/** The disks could not be read. */
export function laneFailedNas(): NasMapInput {
  return { ...baseNas(), reads: { ...ALL_READ, disks: "failed" } };
}

/** Nothing has arrived yet. */
export function loadingNas(): NasMapInput {
  return { ...baseNas(), reads: {} };
}

const MANY_FOLDERS = [
  "Photos",
  "Music",
  "Documents",
  "Films",
  "Series",
  "Projects",
  "Scans",
  "Recipes",
  "Games",
  "Downloads",
  "Kids",
  "Work",
  "Taxes",
  "Camera roll",
  "Phone backups",
  "Home videos",
  "Podcasts",
  "Books",
  "Comics",
  "Software",
  "Old projects",
  "Wedding",
  "Holidays 2025",
  "Holidays 2026",
  "Garden plans",
  "Invoices",
  "Lab results",
  "Archive",
  "Time Machine",
  "a4share",
];

/** Eight file systems, each on its own disk, every data drive holding a shared folder. */
export function eightNas(): NasMapInput {
  const base = baseNas();
  const names = [
    "System drive",
    "Photos drive",
    "Music",
    "Films",
    "Backups",
    "Projects",
    "Scratch",
    "Archive drive",
  ];
  const used = [0.1, 0.71, 0.55, 0.84, 0.47, 0.33, 0.12, 0.62];
  const devices = ["nvme0n1", "sda", "sdb", "sdc", "sdd", "sde", "sdf", "sdg"];
  return {
    ...base,
    disks: devices.map((device, i) =>
      disk(
        device,
        i === 0 ? "nvme" : "hdd",
        i === 0 ? gib("238.5") : tib("3.6"),
        [`fs${String(i)}`],
        31 + i,
      ),
    ),
    storage: names.map((name, i) =>
      store(
        `fs${String(i)}`,
        name,
        i === 3 ? "XFS" : i === 4 ? "Btrfs" : "EXT4",
        "fs",
        used[i] ?? 0,
        i === 0 ? [] : [`f${String(i)}`],
        i === 0,
      ),
    ),
    folders: names
      .slice(1)
      .map((name, i) =>
        folder(
          `f${String(i + 1)}`,
          name.replace(" drive", ""),
          i % 3 === 2 ? ["smb", "nfs"] : ["smb"],
        ),
      ),
  };
}

/** 24 disks, 8 file systems (an eight-disk RAID 6 among them), 30 folders, two interfaces. */
export function manyNas(): NasMapInput {
  const base = baseNas();
  const drives = [
    ["system", "System drive", "EXT4", "fs", 0.1],
    ["photos", "Photos drive", "EXT4", "fs", 0.71],
    ["media1", "Media 1", "XFS", "fs", 0.84],
    ["media2", "Media 2", "XFS", "fs", 0.66],
    ["backup", "Backup", "Mirror (RAID 1)", "raid", 0.41],
    ["tank", "tank", "ZFS pool", "zfs", 0.52],
    ["scratch", "Scratch", "EXT4", "fs", 0.12],
    ["archive", "Archive drive", "Parity (RAID 6)", "raid", 0.77],
  ] as const;
  const counts: Record<string, number> = {
    photos: 2,
    media1: 3,
    media2: 5,
    backup: 2,
    tank: 2,
    scratch: 1,
    archive: 8,
  };
  const targets = drives
    .slice(1)
    .flatMap(([id]) => Array.from({ length: counts[id] ?? 0 }, () => id));
  const letters = "abcdefghijklmnopqrstuvw".split("");
  const disks: NasDisk[] = [
    disk("nvme0n1", "nvme", gib("238.5"), ["system"], 34),
    ...letters.map((l, i) =>
      disk(`sd${l}`, "hdd", tib("7.3"), [targets[i] ?? "photos"], 33 + (i % 6)),
    ),
  ].map((d) =>
    d.id === "sdj" ? { ...d, health: "warning", healthLabel: "Warning" } : d,
  );
  const folders = MANY_FOLDERS.map((name, i) =>
    folder(
      name.toLowerCase().replace(/\W+/gu, "-"),
      name,
      i % 5 === 4 ? ["nfs"] : i % 7 === 6 ? [] : ["smb"],
    ),
  );
  const others = drives.slice(2);
  const folderDrive = (i: number) =>
    i < 9 ? "photos" : (others[(i - 9) % others.length]?.[0] ?? "photos");
  return {
    ...base,
    disks,
    storage: drives.map(([id, name, tech, kind, used]) =>
      store(
        id,
        name,
        tech,
        kind,
        used,
        folders.filter((_, i) => folderDrive(i) === id).map((f) => f.id),
        id === "system",
      ),
    ),
    folders,
    interfaces: [
      ...base.interfaces,
      {
        id: "enp3s0",
        name: "enp3s0",
        kind: "ethernet",
        up: true,
        speed: `10${NBSP}Gbit/s`,
        address: "192.0.2.11",
      },
    ],
  };
}
