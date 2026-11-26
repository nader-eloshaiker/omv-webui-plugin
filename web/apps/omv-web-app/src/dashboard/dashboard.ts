// SPDX-License-Identifier: GPL-3.0-or-later
// What the dashboard and the set-up checklist conclude from the server's settings (phase 3 design 1
// and 2). Pure, so each rule is tested by itself; the components only render the result.
import type {
  ConfiguredFilesystem,
  EmailNotificationSettings,
  MountedFilesystem,
  NetworkDevice,
  ServiceStatus,
  SmartDevice,
  SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import {
  diskOverLimit,
  rollUp,
  type DiskTemperature,
} from "@omv-webui/react-ui-components";
import {
  naturalCompare,
  parseByteCount,
  parseDecimal,
  percentOf,
} from "../format/format.ts";

/** Memory in use, from `memUsed` and `memTotal`, so the three figures shown always agree. */
export function memoryUsage(
  info: Pick<SystemInformation, "memUsed" | "memTotal">,
): { used: number; total: number; percent: number } | null {
  const used = parseByteCount(info.memUsed);
  const total = parseByteCount(info.memTotal);
  if (used === null || total === null) {
    return null;
  }
  const percent = percentOf(used, total);
  return percent === null ? null : { used, total, percent };
}

/** A difference between the NAS clock and this computer's that is worth a row (design 1.4). */
export const CLOCK_TOLERANCE_SECONDS = 5 * 60;

/**
 * How far the NAS clock is from this computer's, in seconds: the server's epoch time `ts` against the
 * moment its reply arrived here. Epoch seconds on both sides, so time zones do not matter.
 */
export function clockDifferenceSeconds(
  ts: number,
  receivedAtMs: number,
): number {
  return Math.abs(receivedAtMs / 1000 - ts);
}

/**
 * Email alerts: `done` when the server's own test would pass (enabled, and server, port, sender and
 * primary address set), `incomplete` when enabled without them, `off` otherwise.
 */
export function emailAlerts(
  settings: Pick<
    EmailNotificationSettings,
    "enable" | "server" | "port" | "sender" | "primaryemail"
  >,
): "done" | "incomplete" | "off" {
  if (!settings.enable) {
    return "off";
  }
  const complete =
    settings.server.trim() !== "" &&
    Number.isInteger(settings.port) &&
    settings.port > 0 &&
    settings.sender.trim() !== "" &&
    settings.primaryemail.trim() !== "";
  return complete ? "done" : "incomplete";
}

/**
 * HTTPS: whether the setting is on, and whether this page arrived without it. The checklist then says
 * to use an https:// address and names the port as text; it builds no link from a reply (UI-3; owner,
 * 2026-11-20).
 */
export function httpsState(
  enablessl: boolean,
  protocol: string,
): "off" | "on" | "onButNotUsed" {
  if (!enablessl) {
    return "off";
  }
  return protocol === "https:" ? "on" : "onButNotUsed";
}

/**
 * The built-in administrator account, the one the factory password belongs to. Only it gets the
 * "Change your password" link: another administrator would change their own password, not admin's.
 */
export const FACTORY_ACCOUNT = "admin";

// ---------------------------------------------------------------------------------------------------
// Phase 5: the Storage, Disk health, Services and Network cards and the attention list; the redesign's
// health areas and the answer the page opens with (dashboard spec 4.2).

/** Severity of a card state, for "worst first" (the roll-up's own order: Critical, Warning, Unknown). */
const SEVERITY = {
  critical: 3,
  warning: 2,
  unknown: 1,
  ok: 0,
  below: 0,
} as const;

// ---- Storage (design 1.2) ----

/** How a file system is named: the system drive, a label, or a device path (shown as an identifier). */
export type FsName =
  | { kind: "systemDrive" }
  | { kind: "label"; text: string }
  | { kind: "device"; text: string };

// A configured file system still being created reports a null label (FileSystemMgmt.getList).
type Named = Pick<
  MountedFilesystem,
  "canonicaldevicefile" | "devicefile" | "mountpoint"
> & { label: string | null };

/** `label`, else `canonicaldevicefile`, else `devicefile`; the root row is "System drive" whatever its label. */
export function fileSystemName(fs: Named): FsName {
  if (fs.mountpoint === "/") {
    return { kind: "systemDrive" };
  }
  if (fs.label !== null && fs.label.trim() !== "") {
    return { kind: "label", text: fs.label };
  }
  return {
    kind: "device",
    text:
      fs.canonicaldevicefile !== "" ? fs.canonicaldevicefile : fs.devicefile,
  };
}

const nameText = (name: FsName): string =>
  name.kind === "systemDrive" ? "" : name.text;

/**
 * The state of one mounted file system (design 1.2.3). Unknown when there is no reading; Critical when
 * full whatever the level (nothing more can be written); Warning at or over the administrator's own
 * level; otherwise below its level, which is not claimed as OK.
 */
export type FsState = "critical" | "warning" | "unknown" | "below";

export function fileSystemState(
  fs: Pick<
    MountedFilesystem,
    "percentage" | "usagewarnthreshold" | "available" | "size"
  >,
): FsState {
  const available = parseByteCount(fs.available);
  if (
    fs.percentage < 0 ||
    available === null ||
    parseByteCount(fs.size) === null
  ) {
    return "unknown";
  }
  if (fs.percentage >= 100 || available === 0) {
    return "critical";
  }
  if (fs.usagewarnthreshold > 0 && fs.percentage >= fs.usagewarnthreshold) {
    return "warning";
  }
  return "below";
}

/**
 * One item of the Storage card: a mounted file system with its state, one that is missing, or a ZFS
 * pool standing for all its file systems, which each report the pool's free space as their own (the
 * ZFS design 10.1, D22).
 */
export type StorageItem =
  | {
      kind: "mounted";
      key: string;
      name: FsName;
      state: FsState;
      fs: MountedFilesystem;
      /** The file system's page in this interface, when it has one (file-systems design 9). */
      address: string | null;
    }
  | { kind: "missing"; key: string; name: FsName; address: string | null }
  | {
      kind: "zfsPool";
      key: string;
      pool: string;
      /** The fullest of its file systems: its figures are the item's. */
      fs: MountedFilesystem;
      state: FsState;
      /** How many of its file systems share the space. */
      count: number;
      /** The pool's page is linked when the ZFS plugin is known to be installed. */
      linked: boolean;
    };

/**
 * The Storage card's items, worst first (design 1.2.4): Critical (full, then missing), Warning,
 * Unknown, the rest; within a state the fullest first; ties by name in natural order.
 */
export function storageItems(
  mounted: readonly MountedFilesystem[],
  missing: readonly ConfiguredFilesystem[] = [],
  /** The page of a file system, when it has one; none by default. */
  addressOf: (fs: {
    uuid: string | null;
    devicefile: string;
  }) => string | null = () => null,
  /** Whether a ZFS pool's item links to its page (the plugin is known to be installed). */
  zfsLinked = false,
): StorageItem[] {
  const zfs = new Map<string, MountedFilesystem[]>();
  for (const fs of mounted) {
    if (fs.type === "zfs") {
      const pool =
        (fs.devicefile || fs.canonicaldevicefile).split("/")[0] ?? "";
      zfs.set(pool, [...(zfs.get(pool) ?? []), fs]);
    }
  }
  const pools: StorageItem[] = [...zfs.entries()].map(([pool, rows]) => {
    const fullest = rows.reduce((a, b) =>
      b.percentage > a.percentage ? b : a,
    );
    return {
      kind: "zfsPool",
      key: `zfs:${pool}`,
      pool,
      fs: fullest,
      state: fileSystemState(fullest),
      count: rows.length,
      linked: zfsLinked,
    };
  });
  const items: StorageItem[] = [
    ...pools,
    ...mounted
      .filter((fs) => fs.type !== "zfs")
      .map((fs): StorageItem => ({
        kind: "mounted",
        key: `mounted:${fs.uuid || fs.devicefile}:${fs.mountpoint}`,
        name: fileSystemName(fs),
        state: fileSystemState(fs),
        fs,
        address: fs.mountpoint === "/" ? null : addressOf(fs),
      })),
    ...missing.map((fs): StorageItem => ({
      kind: "missing",
      key: `missing:${fs.uuid || fs.devicefile}:${fs.mountpoint}`,
      name: fileSystemName(fs),
      address: addressOf(fs),
    })),
  ];
  const rank = (item: StorageItem) =>
    item.kind === "missing" ? SEVERITY.critical : SEVERITY[item.state];
  const fullness = (item: StorageItem) =>
    item.kind === "missing" ? -1 : item.fs.percentage;
  const sortName = (item: StorageItem) =>
    item.kind === "zfsPool" ? item.pool : nameText(item.name);
  return items.sort(
    (a, b) =>
      rank(b) - rank(a) ||
      // Full ones before missing ones, within Critical.
      (a.kind === b.kind
        ? 0
        : a.kind === "missing"
          ? 1
          : b.kind === "missing"
            ? -1
            : 0) ||
      fullness(b) - fullness(a) ||
      naturalCompare(sortName(a), sortName(b)),
  );
}

/** Configured file systems whose disk is not detected (`FileSystemMgmt.getList` status 3). */
export const missingFileSystems = (
  configured: readonly ConfiguredFilesystem[],
): ConfiguredFilesystem[] => configured.filter((fs) => fs.status === 3);

/**
 * How many file systems the Storage card draws as rings before "Show all" (dashboard spec 7, 3.5):
 * four in comfortable density, six in compact. Problems sort first, so none is ever behind it.
 */
export const STORAGE_RINGS = { comfortable: 4, compact: 6 } as const;

// ---- Disk health (design 1.3) ----

export type DiskReason =
  | "BAD_SECTOR"
  | "BAD_ATTRIBUTE_IN_THE_PAST"
  | "BAD_SECTOR_MANY"
  | "BAD_ATTRIBUTE_NOW"
  | "BAD_STATUS"
  | "other";

export interface DiskState {
  status: "ok" | "warning" | "critical" | "unknown";
  /** The reason sentence's key; none for OK. */
  reason: DiskReason | null;
}

/** The state a disk's `overallstatus` stands for (1.3.4; D4: a past problem is a Warning). */
export function diskState(overallstatus: string): DiskState {
  switch (overallstatus) {
    case "GOOD":
      return { status: "ok", reason: null };
    case "BAD_SECTOR":
    case "BAD_ATTRIBUTE_IN_THE_PAST":
      return { status: "warning", reason: overallstatus };
    case "BAD_SECTOR_MANY":
    case "BAD_ATTRIBUTE_NOW":
      return { status: "critical", reason: overallstatus };
    case "BAD_STATUS":
      return { status: "unknown", reason: "BAD_STATUS" };
    default:
      return { status: "unknown", reason: "other" };
  }
}

/** The disks of a check, worst first, then by device name in natural order. */
export function sortDisks(devices: readonly SmartDevice[]): SmartDevice[] {
  return [...devices].sort(
    (a, b) =>
      SEVERITY[diskState(b.overallstatus).status] -
        SEVERITY[diskState(a.overallstatus).status] ||
      naturalCompare(a.canonicaldevicefile, b.canonicaldevicefile),
  );
}

/** A disk's temperature in whole degrees, or null when it reports none ("" or not a number). */
export function diskTemperature(temperature: number | string): number | null {
  const value = parseDecimal(temperature);
  return value === null ? null : Math.round(value);
}

// ---- Services (design 1.4) ----

/**
 * A service's state on the card. Pending first: `enabled` is the saved setting, which changes on Save,
 * before Apply. Then OK (on and running), Critical (on, not running), or off (summarised in one line,
 * with "still running" when it has not stopped yet).
 */
export type ServiceState = "pending" | "ok" | "critical" | "off" | "offRunning";

export function serviceState(
  service: Pick<ServiceStatus, "name" | "enabled" | "running">,
  pending: readonly string[],
): ServiceState {
  if (!service.enabled) {
    return service.running ? "offRunning" : "off";
  }
  if (pending.includes(service.name)) {
    return "pending";
  }
  return service.running ? "ok" : "critical";
}

export interface ServiceSummary {
  /** The services that are on, worst first, then by title. */
  on: { service: ServiceStatus; state: "pending" | "ok" | "critical" }[];
  /** The services that are off, by title. */
  off: { service: ServiceStatus; running: boolean; pending: boolean }[];
}

const SERVICE_RANK = { critical: 2, pending: 1, ok: 0 } as const;

export function serviceSummary(
  services: readonly ServiceStatus[],
  pending: readonly string[],
): ServiceSummary {
  const on: ServiceSummary["on"] = [];
  const off: ServiceSummary["off"] = [];
  for (const service of services) {
    const state = serviceState(service, pending);
    if (state === "off" || state === "offRunning") {
      off.push({
        service,
        running: state === "offRunning",
        pending: pending.includes(service.name),
      });
    } else {
      on.push({ service, state });
    }
  }
  on.sort(
    (a, b) =>
      SERVICE_RANK[b.state] - SERVICE_RANK[a.state] ||
      naturalCompare(a.service.title, b.service.title),
  );
  off.sort((a, b) => naturalCompare(a.service.title, b.service.title));
  return { on, off };
}

/** The core services whose settings have a fixed page (the link is chosen from `name`, never built). */
export const CORE_SERVICES = ["samba", "nfs", "rsyncd", "ssh"] as const;
export type CoreService = (typeof CORE_SERVICES)[number];
export const isCoreService = (name: string): name is CoreService =>
  (CORE_SERVICES as readonly string[]).includes(name);

// ---- Network (design 1.5) ----

/** The kinds of interface the card names; anything else (absent, unknown, new) is not named. */
export const INTERFACE_KINDS = [
  "ethernet",
  "wifi",
  "bond",
  "vlan",
  "bridge",
] as const;
export type InterfaceKind = (typeof INTERFACE_KINDS)[number];
export const interfaceKind = (
  type: string | undefined,
): InterfaceKind | null =>
  (INTERFACE_KINDS as readonly (string | undefined)[]).includes(type)
    ? (type as InterfaceKind)
    : null;

/** The interfaces the card lists (the server's order), and how many virtual ones it only counts. */
export function visibleInterfaces(devices: readonly NetworkDevice[]): {
  shown: NetworkDevice[];
  virtualCount: number;
} {
  let virtualCount = 0;
  const shown: NetworkDevice[] = [];
  for (const device of devices) {
    if (device.type === "loopback" || device.devicename === "lo") {
      continue;
    }
    if (device.type === "virtual") {
      virtualCount += 1;
      continue;
    }
    shown.push(device);
  }
  return { shown, virtualCount };
}

/** An address with its prefix, or null when the interface has none. */
export function addressWithPrefix(
  address: string,
  prefix: number,
): string | null {
  if (address.trim() === "") {
    return null;
  }
  return prefix >= 0 ? `${address}/${String(prefix)}` : address;
}

// ---- The attention list (design 1.7) ----

/**
 * A pool's row from Zfs.getPoolStatus alone (the ZFS design 10.1): damaged files, short of a disk, or
 * not usable at all; null for a pool that is fine or whose state is not known (no row for Unknown).
 */
export function zfsPoolHealth(pool: {
  state: string;
  status: string;
}): "degraded" | "unusable" | "damaged" | null {
  const state = pool.state.trim().toUpperCase();
  if (pool.status.trim().toLowerCase() === "error") {
    return "damaged";
  }
  if (state === "DEGRADED") {
    return "degraded";
  }
  return ["FAULTED", "UNAVAIL", "SUSPENDED", "REMOVED", "OFFLINE"].includes(
    state,
  )
    ? "unusable"
    : null;
}

export type AttentionRow =
  | { kind: "fsFull"; key: string; name: FsName; address: string | null }
  | { kind: "fsMissing"; key: string; name: FsName; address: string | null }
  | {
      kind: "diskCritical" | "diskWarning";
      key: string;
      device: string;
      /** The disk's kernel name, for the link to its page (used only if it passes the pattern). */
      devicename: string;
      model: string;
      /** Only a failing or warned disk gets a row, so only those reasons. */
      reason: Exclude<DiskReason, "BAD_STATUS" | "other">;
      monitored: boolean;
      readAt: number;
    }
  | {
      kind: "servicesDown";
      key: string;
      services: { name: string; title: string }[];
    }
  | {
      kind: "fsWarning";
      key: string;
      name: FsName;
      address: string | null;
      percent: number;
      threshold: number;
    }
  | {
      kind: "zfsPool";
      key: string;
      pool: string;
      health: "degraded" | "unusable" | "damaged";
    }
  | {
      kind: "disksHot";
      key: string;
      /** Each disk at or over its alert limit, as the temperatures read it, in their order. */
      disks: DiskTemperature[];
    }
  | { kind: "restart"; key: string }
  | { kind: "clock"; key: string; seconds: number };

export interface AttentionInput {
  /** System.getInformation, when read: the restart and clock rows. */
  info: Pick<SystemInformation, "ts" | "rebootRequired"> | undefined;
  /** When the System.getInformation reply arrived (ms), for the clock check. */
  receivedAtMs: number;
  /** The Storage card's items, when read. */
  storage?: readonly StorageItem[];
  /** The session's last disk-health result, when there is one. */
  disks?: { devices: readonly SmartDevice[]; readAt: number };
  /** Services.getStatus, when read. */
  services?: readonly ServiceStatus[];
  /** The pending module ids, so a service waiting to be applied is not reported as down. */
  pending?: readonly string[];
  /** Zfs.getPoolStatus, read once per visit when the ZFS plugin is installed (ZFS design 10.1). */
  pools?: readonly { name: string; state: string; status: string }[];
  /**
   * Every disk's temperature reading, as the temperatures draw it (`diskTemperatureOf` on
   * DiskMgmt.getList with Smart.getSettings `tempmax`), in their order: the hot disks' row.
   */
  temperatures?: readonly DiskTemperature[];
}

/**
 * The rows of the attention list, worst first, then in a fixed order of kinds so rows do not change
 * places between polls: file system full, missing, disk failing, services down, file system nearly
 * full, disk warning, disks at or over their temperature alert limit, restart, clock. No row for
 * Unknown, and none for "disk health not checked".
 *
 * The hot disks are one Warning row naming them all, from the same readings and the same rule
 * (`diskOverLimit`, at or over the limit) as the temperatures, so the two never disagree. A disk
 * asleep, or with no reading, has no figure and so is never in it.
 */
export function attentionRows(input: AttentionInput): AttentionRow[] {
  const storage = input.storage ?? [];
  const full: AttentionRow[] = [];
  const missing: AttentionRow[] = [];
  const nearlyFull: AttentionRow[] = [];
  for (const item of storage) {
    if (item.kind === "zfsPool") {
      // A pool's rows come from getPoolStatus below; how full it is gets no row (ZFS design 10.1).
      continue;
    }
    if (item.kind === "missing") {
      missing.push({
        kind: "fsMissing",
        key: item.key,
        name: item.name,
        address: item.address,
      });
    } else if (item.state === "critical") {
      full.push({
        kind: "fsFull",
        key: item.key,
        name: item.name,
        address: item.address,
      });
    } else if (item.state === "warning") {
      nearlyFull.push({
        kind: "fsWarning",
        key: item.key,
        name: item.name,
        address: item.address,
        percent: item.fs.percentage,
        threshold: item.fs.usagewarnthreshold,
      });
    }
  }

  const failing: AttentionRow[] = [];
  const warned: AttentionRow[] = [];
  if (input.disks) {
    for (const disk of sortDisks(input.disks.devices)) {
      const state = diskState(disk.overallstatus);
      const reason = state.reason;
      if (
        reason === null ||
        reason === "BAD_STATUS" ||
        reason === "other" ||
        (state.status !== "critical" && state.status !== "warning")
      ) {
        continue;
      }
      const row = {
        key: `disk:${disk.canonicaldevicefile}`,
        device: disk.canonicaldevicefile,
        devicename: disk.devicename,
        model: disk.model,
        reason,
        monitored: disk.monitor,
        readAt: input.disks.readAt,
      };
      if (state.status === "critical") {
        failing.push({ kind: "diskCritical", ...row });
      } else {
        warned.push({ kind: "diskWarning", ...row });
      }
    }
  }

  const down: AttentionRow[] = [];
  if (input.services) {
    const { on } = serviceSummary(input.services, input.pending ?? []);
    const services = on
      .filter((s) => s.state === "critical")
      .map((s) => ({ name: s.service.name, title: s.service.title }));
    if (services.length > 0) {
      down.push({ kind: "servicesDown", key: "services", services });
    }
  }

  // One row per pool that is not OK by state, placed with the disk rows (ZFS design 10.1). None for a
  // pool whose state is not known, nor for how full it is (the pool row is not read here).
  const pools: AttentionRow[] = [];
  for (const pool of input.pools ?? []) {
    const health = zfsPoolHealth(pool);
    if (health !== null) {
      pools.push({
        kind: "zfsPool",
        key: `zfs:${pool.name}`,
        pool: pool.name,
        health,
      });
    }
  }

  const hot = (input.temperatures ?? []).filter(diskOverLimit);

  const rows: AttentionRow[] = [
    ...full,
    ...missing,
    ...pools,
    ...failing,
    ...down,
    ...nearlyFull,
    ...warned,
    ...(hot.length > 0
      ? [{ kind: "disksHot" as const, key: "disks-hot", disks: hot }]
      : []),
  ];
  if (input.info === undefined) {
    return rows;
  }
  if (input.info.rebootRequired === true) {
    rows.push({ kind: "restart", key: "restart" });
  }
  const seconds = clockDifferenceSeconds(input.info.ts, input.receivedAtMs);
  if (seconds > CLOCK_TOLERANCE_SECONDS) {
    rows.push({ kind: "clock", key: "clock", seconds });
  }
  return rows;
}

/** How many attention cards show before "Show N more" (dashboard spec 5.1). Worst first, so none hidden is worse. */
export const ATTENTION_VISIBLE = 6;

/** Whether an attention row carries a status: every kind but the clock advice. */
export const hasStatus = (row: AttentionRow): boolean => row.kind !== "clock";

// ---- The answer: health areas and the headline (dashboard spec 4.2) ----

export const AREA_IDS = ["storage", "disks", "services", "system"] as const;
export type AreaId = (typeof AREA_IDS)[number];

/** An area's state. Disabled is a choice (no service on), drawn dashed and left out of the roll-up. */
export type AreaStatus = "ok" | "warning" | "critical" | "unknown" | "disabled";

/**
 * The area's word. The four health words are the fixed status words (`health.*`); the rest are the
 * area's own precise words (`dashboard.area.*`).
 */
export type AreaWord =
  | "ok"
  | "warning"
  | "critical"
  | "unknown"
  | "nothingFull"
  | "notChecked"
  | "checking"
  | "noReading"
  | "allRunning"
  | "noneOn"
  | "noneYet"
  | "restartNeeded"
  | "readFailed"
  | "reading";

export const isHealthWord = (
  word: AreaWord,
): word is "ok" | "warning" | "critical" | "unknown" =>
  word === "ok" ||
  word === "warning" ||
  word === "critical" ||
  word === "unknown";

export interface AreaState {
  id: AreaId;
  status: AreaStatus;
  word: AreaWord;
}

/** A read as an area sees it: its data once there, and whether it failed with nothing to show. */
export interface AreaRead<T> {
  data: T | undefined;
  failed: boolean;
}

export interface AreaInput {
  /** The Storage card's items (FileSystemMgmt.enumerateMountedFilesystems). */
  storage: AreaRead<readonly StorageItem[]>;
  /** FileSystemMgmt.getList, the missing file systems: still in flight, or failed with nothing. */
  configured: { pending: boolean; failed: boolean };
  /**
   * ZFS pools (Zfs.getPoolStatus): "none" when the plugin is not installed, "checking" until that
   * is known or the pools are read, "failed" when they could not be read.
   */
  pools: {
    state: "none" | "checking" | "failed" | "read";
    list: readonly { name: string; state: string; status: string }[];
  };
  /** The session's disk-health check: running, failed with no result, and its disks once read. */
  disks: {
    checking: boolean;
    failed: boolean;
    devices: readonly SmartDevice[] | undefined;
  };
  services: AreaRead<readonly ServiceStatus[]> & { pending: readonly string[] };
  system: AreaRead<Pick<SystemInformation, "rebootRequired">>;
}

const area = (id: AreaId, status: AreaStatus, word: AreaWord): AreaState => ({
  id,
  status,
  word,
});

/**
 * Storage (spec 4.2): what is known to be bad first, from whatever was read, so a failed read can
 * only make the area worse, never better. "Nothing full" needs every input read: the mounted list,
 * the configured list (for a missing file system) and, where the plugin is installed, the pools.
 */
function storageArea(input: AreaInput): AreaState {
  const items = input.storage.data;
  const poolBad = input.pools.list.some((p) => zfsPoolHealth(p) !== null);
  if (
    poolBad ||
    items?.some((i) => i.kind === "missing" || i.state === "critical")
  ) {
    return area("storage", "critical", "critical");
  }
  if (items?.some((i) => i.kind !== "missing" && i.state === "warning")) {
    return area("storage", "warning", "warning");
  }
  if (items === undefined) {
    return input.storage.failed
      ? area("storage", "unknown", "readFailed")
      : area("storage", "unknown", "reading");
  }
  if (input.configured.failed || input.pools.state === "failed") {
    return area("storage", "unknown", "readFailed");
  }
  if (input.configured.pending || input.pools.state === "checking") {
    return area("storage", "unknown", "reading");
  }
  if (items.length === 0) {
    return area("storage", "unknown", "noneYet");
  }
  if (items.some((i) => i.kind !== "missing" && i.state === "unknown")) {
    return area("storage", "unknown", "unknown");
  }
  return area("storage", "ok", "nothingFull");
}

/** Disks: only from a check in this session (it wakes disks, so it runs only when asked). */
function disksArea(input: AreaInput): AreaState {
  const { devices, checking, failed } = input.disks;
  if (devices === undefined) {
    if (checking) {
      return area("disks", "unknown", "checking");
    }
    return failed
      ? area("disks", "unknown", "readFailed")
      : area("disks", "unknown", "notChecked");
  }
  if (devices.length === 0) {
    return area("disks", "unknown", "noReading");
  }
  const worst = rollUp(
    devices.map((d) => diskState(d.overallstatus).status),
  ).status;
  const status =
    worst === "ok" || worst === "warning" || worst === "critical"
      ? worst
      : "unknown";
  return area("disks", status, status);
}

/** Services: a service that is on but stopped is Critical; one waiting to be applied counts as running. */
function servicesArea(input: AreaInput): AreaState {
  const list = input.services.data;
  if (list === undefined) {
    return input.services.failed
      ? area("services", "unknown", "readFailed")
      : area("services", "unknown", "reading");
  }
  const { on } = serviceSummary(list, input.services.pending);
  if (on.some((s) => s.state === "critical")) {
    return area("services", "critical", "critical");
  }
  return on.length === 0
    ? area("services", "disabled", "noneOn")
    : area("services", "ok", "allRunning");
}

function systemArea(input: AreaInput): AreaState {
  const info = input.system.data;
  if (info === undefined) {
    return input.system.failed
      ? area("system", "unknown", "readFailed")
      : area("system", "unknown", "reading");
  }
  return info.rebootRequired === true
    ? area("system", "warning", "restartNeeded")
    : area("system", "ok", "ok");
}

/** The four areas of the health ring, in its order: Storage, Disks, Services, System (D3). */
export function healthAreas(input: AreaInput): AreaState[] {
  return [
    storageArea(input),
    disksArea(input),
    servicesArea(input),
    systemArea(input),
  ];
}

export type OverallStatus = "ok" | "warning" | "critical" | "unknown";

/** The worst area, Disabled left out (a choice, not an unknown). No area to count is Unknown. */
export function overallStatus(areas: readonly AreaState[]): OverallStatus {
  const status = rollUp(
    areas.filter((a) => a.status !== "disabled").map((a) => a.status),
  ).status;
  return status === "ok" || status === "warning" || status === "critical"
    ? status
    : "unknown";
}

/** How many areas the ring counts, and how many of them have a known state ("3/4 checked"). */
export function knownAreas(areas: readonly AreaState[]): {
  known: number;
  total: number;
} {
  const counted = areas.filter((a) => a.status !== "disabled");
  return {
    known: counted.filter((a) => a.status !== "unknown").length,
    total: counted.length,
  };
}

/** Why an area is not known, in the order the answer names it. */
export type UnknownLine =
  | { kind: "readFailed"; areas: AreaId[] }
  | { kind: "noStorage" }
  | { kind: "disksChecking" }
  | { kind: "disksNotChecked" }
  | { kind: "reading"; areas: AreaId[] }
  | { kind: "unknown"; areas: AreaId[] };

/** The first reason an area is not known, or null when every area has a known state. */
export function unknownLine(areas: readonly AreaState[]): UnknownLine | null {
  const ids = (match: (a: AreaState) => boolean) =>
    areas.filter(match).map((a) => a.id);
  const failed = ids((a) => a.word === "readFailed");
  if (failed.length > 0) {
    return { kind: "readFailed", areas: failed };
  }
  if (areas.some((a) => a.id === "storage" && a.word === "noneYet")) {
    return { kind: "noStorage" };
  }
  const disks = areas.find((a) => a.id === "disks");
  if (disks?.word === "checking") {
    return { kind: "disksChecking" };
  }
  if (disks?.word === "notChecked") {
    return { kind: "disksNotChecked" };
  }
  const reading = ids((a) => a.word === "reading");
  if (reading.length > 0) {
    return { kind: "reading", areas: reading };
  }
  const unknown = ids((a) => a.status === "unknown");
  return unknown.length > 0 ? { kind: "unknown", areas: unknown } : null;
}

/**
 * The answer the page opens with (spec 4.2), first match wins:
 * - the first reads are in flight: skeletons;
 * - something is Critical or a Warning: the cards that need the reader, counted (the clock advice
 *   carries no status and is not counted), with the first reason an area is not known beside it;
 * - an area is not known: why, in the order of `unknownLine`;
 * - otherwise every area was read and is fine, disk health included, from a check this session.
 * Fail closed: "Everything is OK" is reached only when all four areas are known and OK.
 */
export type DashboardAnswer =
  | { kind: "loading" }
  | {
      kind: "problems";
      status: "warning" | "critical";
      /** The attention cards that carry a status. */
      count: number;
      /** The worst of them, whose title is the headline when it is the only one. */
      first: AttentionRow | undefined;
      unknown: UnknownLine | null;
    }
  | { kind: "unknown"; line: UnknownLine }
  | { kind: "ok"; checkedAt: number };

export function dashboardAnswer(input: {
  loading: boolean;
  areas: readonly AreaState[];
  rows: readonly AttentionRow[];
  /** When the session's disk-health check was read, for "Everything is OK". */
  disksReadAt: number | undefined;
}): DashboardAnswer {
  if (input.loading) {
    return { kind: "loading" };
  }
  const overall = overallStatus(input.areas);
  const line = unknownLine(input.areas);
  if (overall === "critical" || overall === "warning") {
    const counted = input.rows.filter(hasStatus);
    return {
      kind: "problems",
      status: overall,
      count: counted.length,
      first: counted[0],
      unknown: line,
    };
  }
  if (line !== null || input.disksReadAt === undefined || overall !== "ok") {
    return {
      kind: "unknown",
      line: line ?? { kind: "disksNotChecked" },
    };
  }
  return { kind: "ok", checkedAt: input.disksReadAt };
}
