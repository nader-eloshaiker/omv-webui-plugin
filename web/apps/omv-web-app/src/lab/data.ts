// SPDX-License-Identifier: GPL-3.0-or-later
// The design lab's data: development only, never in the production bundle (UI-11). Names, models
// and sizes follow the mock scenarios (src/mocks): the Example disks, the file systems media,
// backups, pool and usb-disk, the five shared folders, alex, robin and sam, family and kids. Two
// states: everything fine, and the same NAS with a wearing disk and a nearly full file system.

export type Status = "ok" | "warning" | "critical" | "unknown";
export type Scenario = "healthy" | "attention";

export const STATUS_WORD: Record<Status, string> = {
  ok: "OK",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

export interface Disk {
  id: string;
  device: string;
  model: string;
  size: string;
  kind: "hdd" | "ssd" | "usb";
  temp: number | null;
  status: Status;
  note: string;
  role: string;
  fs: string;
}

export interface FileSystem {
  id: string;
  label: string;
  type: string;
  layout: string;
  usedTiB: number;
  sizeTiB: number;
  status: Status;
  disks: string[];
  folders: string[];
}

export interface Folder {
  id: string;
  name: string;
  description: string;
  fs: string;
  smb: boolean;
  nfs: boolean;
}

export interface Service {
  id: string;
  name: string;
  plain: string;
  state: "running" | "off";
  detail: string;
}

export interface Attention {
  id: string;
  status: Status | "setup";
  title: string;
  body: string;
  action: string;
  target: "storage" | "folder" | "classic";
}

export interface Person {
  id: string;
  name: string;
  initials: string;
  kind: "person" | "group";
  access: "rw" | "ro" | "none";
  via?: string;
}

export interface NasState {
  host: string;
  version: string;
  uptime: string;
  cores: number;
  memTotalGiB: number;
  disks: Disk[];
  fileSystems: FileSystem[];
  folders: Folder[];
  services: Service[];
  attention: Attention[];
  pendingSeed: string[];
}

const NBSP = "\u00a0";

/** Binary size with one decimal and a non-breaking space before the unit. */
export function size(tib: number): string {
  if (tib < 1) {
    return `${(tib * 1024).toFixed(1)}${NBSP}GiB`;
  }
  return `${tib.toFixed(1)}${NBSP}TiB`;
}

export function percent(used: number, total: number): number {
  return Math.round((used / total) * 100);
}

export function worst(statuses: Status[]): Status {
  const order: Status[] = ["critical", "warning", "unknown", "ok"];
  return order.find((s) => statuses.includes(s)) ?? "ok";
}

export function nas(scenario: Scenario): NasState {
  const wearing = scenario === "attention";
  const poolUsed = wearing ? 3.3 : 2.3;
  return {
    host: "nas",
    version: "8.6.1-1 (Synchrony)",
    uptime: "5 days, 3 hours",
    cores: 4,
    memTotalGiB: 7.6,
    disks: [
      {
        id: "nvme0n1",
        device: "nvme0n1",
        model: "Example NVMe SSD 500GB",
        size: `465.8${NBSP}GiB`,
        kind: "ssd",
        temp: 41,
        status: "ok",
        note: "Healthy",
        role: "System",
        fs: "system",
      },
      {
        id: "sda",
        device: "sda",
        model: "Example HDD 4TB",
        size: `3.6${NBSP}TiB`,
        kind: "hdd",
        temp: 35,
        status: "ok",
        note: "Healthy",
        role: "media",
        fs: "media",
      },
      {
        id: "sdb",
        device: "sdb",
        model: "Example HDD 8TB",
        size: `7.3${NBSP}TiB`,
        kind: "hdd",
        temp: wearing ? 47 : 39,
        status: wearing ? "warning" : "ok",
        note: wearing ? "8 bad sectors moved" : "Healthy",
        role: "backups",
        fs: "backups",
      },
      {
        id: "sdc",
        device: "sdc",
        model: "Example HDD 4TB",
        size: `3.6${NBSP}TiB`,
        kind: "hdd",
        temp: 36,
        status: "ok",
        note: "Healthy",
        role: "pool · mirror",
        fs: "pool",
      },
      {
        id: "sdd",
        device: "sdd",
        model: "Example HDD 4TB",
        size: `3.6${NBSP}TiB`,
        kind: "hdd",
        temp: 37,
        status: "ok",
        note: "Healthy",
        role: "pool · mirror",
        fs: "pool",
      },
      {
        id: "sde",
        device: "sde",
        model: "Example USB Drive",
        size: `931.5${NBSP}GiB`,
        kind: "usb",
        temp: null,
        status: "unknown",
        note: "No health readings over USB",
        role: "usb-disk",
        fs: "usb-disk",
      },
    ],
    fileSystems: [
      {
        id: "pool",
        label: "pool",
        type: "BTRFS",
        layout: "Mirror of 2 disks",
        usedTiB: poolUsed,
        sizeTiB: 3.6,
        status: wearing ? "warning" : "ok",
        disks: ["sdc", "sdd"],
        folders: ["photos", "documents", "homes"],
      },
      {
        id: "media",
        label: "media",
        type: "EXT4",
        layout: "1 disk",
        usedTiB: 2.9,
        sizeTiB: 3.6,
        status: "ok",
        disks: ["sda"],
        folders: ["archive"],
      },
      {
        id: "backups",
        label: "backups",
        type: "EXT4",
        layout: "1 disk",
        usedTiB: 3.1,
        sizeTiB: 7.3,
        status: wearing ? "warning" : "ok",
        disks: ["sdb"],
        folders: ["backups"],
      },
      {
        id: "usb-disk",
        label: "usb-disk",
        type: "EXFAT",
        layout: "1 disk",
        usedTiB: 0.11,
        sizeTiB: 0.91,
        status: "ok",
        disks: ["sde"],
        folders: [],
      },
      {
        id: "system",
        label: "System",
        type: "EXT4",
        layout: "1 disk",
        usedTiB: 0.021,
        sizeTiB: 0.446,
        status: "ok",
        disks: ["nvme0n1"],
        folders: [],
      },
    ],
    folders: [
      {
        id: "photos",
        name: "Photos",
        description: "Family photos",
        fs: "pool",
        smb: true,
        nfs: false,
      },
      {
        id: "documents",
        name: "Documents",
        description: "Letters, bills and school work",
        fs: "pool",
        smb: true,
        nfs: false,
      },
      {
        id: "homes",
        name: "Homes",
        description: "Everyone's home folders",
        fs: "pool",
        smb: false,
        nfs: false,
      },
      {
        id: "archive",
        name: "Archive",
        description: "The whole archive disk",
        fs: "media",
        smb: false,
        nfs: false,
      },
      {
        id: "backups",
        name: "Backups",
        description: "Copies of the other folders",
        fs: "backups",
        smb: false,
        nfs: true,
      },
    ],
    services: [
      {
        id: "smb",
        name: "SMB",
        plain: "Windows and Mac sharing",
        state: "running",
        detail: "2 folders shared",
      },
      {
        id: "nfs",
        name: "NFS",
        plain: "Linux and Unix sharing",
        state: "running",
        detail: "1 folder shared",
      },
      {
        id: "rsync",
        name: "Rsync",
        plain: "Copy jobs",
        state: "running",
        detail: "Last ran 02:00, finished",
      },
      {
        id: "ssh",
        name: "SSH",
        plain: "Remote command line",
        state: "running",
        detail: "Port 22",
      },
      {
        id: "rsyncd",
        name: "Rsync server",
        plain: "Receive copies",
        state: "off",
        detail: "Off",
      },
    ],
    attention: wearing
      ? [
          {
            id: "disk",
            status: "warning",
            title: "Disk sdb is wearing out",
            body: "8 bad sectors have been moved. The disk still works; plan to replace it, and keep Backups copied elsewhere until then.",
            action: "View disk sdb",
            target: "storage",
          },
          {
            id: "full",
            status: "warning",
            title: "pool is 91% full",
            body: `3.3${NBSP}TiB of 3.6${NBSP}TiB used. Photos, Documents and Homes are on it.`,
            action: "Open Photos",
            target: "folder",
          },
          {
            id: "https",
            status: "setup",
            title: "Passwords travel unencrypted",
            body: "HTTPS is off, so anyone on your network could read what you type here.",
            action: "Turn on HTTPS in the classic interface",
            target: "classic",
          },
        ]
      : [
          {
            id: "https",
            status: "setup",
            title: "Passwords travel unencrypted",
            body: "HTTPS is off, so anyone on your network could read what you type here.",
            action: "Turn on HTTPS in the classic interface",
            target: "classic",
          },
        ],
    pendingSeed: wearing ? ["SSH"] : [],
  };
}

export const PEOPLE: Person[] = [
  { id: "family", name: "family", initials: "fa", kind: "group", access: "rw" },
  { id: "alex", name: "alex", initials: "al", kind: "person", access: "rw" },
  {
    id: "robin",
    name: "robin",
    initials: "ro",
    kind: "person",
    access: "ro",
  },
  {
    id: "sam",
    name: "sam",
    initials: "sa",
    kind: "person",
    access: "rw",
    via: "family",
  },
  { id: "kids", name: "kids", initials: "ki", kind: "group", access: "none" },
];

export interface NavItem {
  id: string;
  label: string;
  screen?: "dashboard" | "storage" | "folder" | "activity";
  classic?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
}

/** The groups and pages of the real navigation (src/navigation), with what is still classic-only. */
export const NAV: NavGroup[] = [
  {
    id: "system",
    label: "System",
    icon: "system",
    items: [
      { id: "workbench", label: "Web interface", classic: true },
      { id: "date-time", label: "Date and time", classic: true },
      { id: "notification", label: "Notifications", classic: true },
      { id: "powermgmt", label: "Power", classic: true },
      { id: "monitoring", label: "Monitoring", classic: true },
      { id: "cron", label: "Scheduled tasks", classic: true },
      { id: "certificate", label: "Certificates", classic: true },
      { id: "updatemgmt", label: "Updates", classic: true },
      { id: "plugins", label: "Plugins", classic: true },
    ],
  },
  {
    id: "network",
    label: "Network",
    icon: "network",
    items: [
      { id: "general", label: "Name and domain" },
      { id: "interfaces", label: "Interfaces" },
      { id: "proxy", label: "Proxy" },
      { id: "firewall", label: "Firewall" },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    icon: "storage",
    items: [
      { id: "overview", label: "Disks and file systems", screen: "storage" },
      { id: "smart", label: "Disk health" },
      { id: "md", label: "RAID" },
      { id: "zfs", label: "ZFS" },
      { id: "shared-folders", label: "Shared folders", screen: "folder" },
    ],
  },
  {
    id: "services",
    label: "Services",
    icon: "services",
    items: [
      { id: "smb", label: "Windows and Mac (SMB)" },
      { id: "nfs", label: "Linux and Unix (NFS)" },
      { id: "rsync", label: "Copy jobs (Rsync)" },
      { id: "ssh", label: "Remote command line (SSH)" },
    ],
  },
  {
    id: "users",
    label: "Users",
    icon: "users",
    items: [
      { id: "users", label: "People" },
      { id: "groups", label: "Groups" },
      { id: "settings", label: "Home folders" },
    ],
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    icon: "diagnostics",
    items: [
      { id: "system-logs", label: "System logs" },
      { id: "processes", label: "Processes" },
      { id: "services", label: "Services" },
      { id: "system-information", label: "System information", classic: true },
      { id: "performance", label: "Performance", screen: "activity" },
      { id: "report", label: "Report", classic: true },
    ],
  },
];
