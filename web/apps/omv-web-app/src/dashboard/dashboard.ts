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
// Phase 5: the Storage, Disk health, Services and Network cards, the chart and the attention list.

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

/** One item of the Storage card: a mounted file system with its state, or one that is missing. */
export type StorageItem =
  | {
      kind: "mounted";
      key: string;
      name: FsName;
      state: FsState;
      fs: MountedFilesystem;
    }
  | { kind: "missing"; key: string; name: FsName };

/**
 * The Storage card's items, worst first (design 1.2.4): Critical (full, then missing), Warning,
 * Unknown, the rest; within a state the fullest first; ties by name in natural order.
 */
export function storageItems(
  mounted: readonly MountedFilesystem[],
  missing: readonly ConfiguredFilesystem[] = [],
): StorageItem[] {
  const items: StorageItem[] = [
    ...mounted.map((fs): StorageItem => ({
      kind: "mounted",
      key: `mounted:${fs.uuid || fs.devicefile}:${fs.mountpoint}`,
      name: fileSystemName(fs),
      state: fileSystemState(fs),
      fs,
    })),
    ...missing.map((fs): StorageItem => ({
      kind: "missing",
      key: `missing:${fs.uuid || fs.devicefile}:${fs.mountpoint}`,
      name: fileSystemName(fs),
    })),
  ];
  const rank = (item: StorageItem) =>
    item.kind === "missing" ? SEVERITY.critical : SEVERITY[item.state];
  const fullness = (item: StorageItem) =>
    item.kind === "missing" ? -1 : item.fs.percentage;
  return items.sort(
    (a, b) =>
      rank(b) - rank(a) ||
      // Full ones before missing ones, within Critical.
      (a.kind === b.kind ? 0 : a.kind === "mounted" ? -1 : 1) ||
      fullness(b) - fullness(a) ||
      naturalCompare(nameText(a.name), nameText(b.name)),
  );
}

/** Configured file systems whose disk is not detected (`FileSystemMgmt.getList` status 3). */
export const missingFileSystems = (
  configured: readonly ConfiguredFilesystem[],
): ConfiguredFilesystem[] => configured.filter((fs) => fs.status === 3);

/** How many file systems a card shows before "Show all" (D16). */
export const STORAGE_VISIBLE = 6;

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

// ---- The Usage chart (design 1.6) ----

export interface UsageSample {
  /** When the reply arrived, on this computer's clock (ms). */
  t: number;
  /** Percent; null when the reply did not carry the figure. */
  cpu: number | null;
  memory: number | null;
}

/** Ten minutes of the shell's 20 s poll, at most 30 samples. */
export const CHART_WINDOW_MS = 10 * 60_000;
export const CHART_MAX_SAMPLES = 30;
/** Two samples further apart than this are not joined: the poll paused or failed between them. */
export const CHART_MAX_GAP_MS = 50_000;

/** A sample from a System.getInformation reply: the processor figure and memory as the meter computes it. */
export function usageSample(
  info: Pick<SystemInformation, "cpuUtilization" | "memUsed" | "memTotal">,
  receivedAtMs: number,
): UsageSample {
  const cpu = info.cpuUtilization;
  return {
    t: receivedAtMs,
    cpu: typeof cpu === "number" && Number.isFinite(cpu) ? cpu : null,
    memory: memoryUsage(info)?.percent ?? null,
  };
}

/**
 * The samples with one more: kept in time order, a sample no newer than the last is ignored (the same
 * reply seen twice), and only the last ten minutes and at most 30 are kept.
 */
export function addSample(
  samples: readonly UsageSample[],
  sample: UsageSample,
): readonly UsageSample[] {
  const last = samples.at(-1);
  if (last !== undefined && sample.t <= last.t) {
    return samples;
  }
  const from = sample.t - CHART_WINDOW_MS;
  return [...samples.filter((s) => s.t >= from), sample].slice(
    -CHART_MAX_SAMPLES,
  );
}

/** The readings table, newest first, with one "No readings" row where the line breaks. */
export type ReadingRow =
  | { kind: "reading"; sample: UsageSample }
  | { kind: "gap"; after: number; before: number };

export function readingRows(samples: readonly UsageSample[]): ReadingRow[] {
  const rows: ReadingRow[] = [];
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const sample = samples[i];
    if (sample === undefined) {
      continue;
    }
    const newer = samples[i + 1];
    if (newer !== undefined && newer.t - sample.t > CHART_MAX_GAP_MS) {
      rows.push({ kind: "gap", after: sample.t, before: newer.t });
    }
    rows.push({ kind: "reading", sample });
  }
  return rows;
}

// ---- The attention list (design 1.7) ----

export type AttentionRow =
  | { kind: "fsFull"; key: string; name: FsName }
  | { kind: "fsMissing"; key: string; name: FsName }
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
      percent: number;
      threshold: number;
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
}

/**
 * The rows of the attention list, worst first, then in a fixed order of kinds so rows do not change
 * places between polls: file system full, missing, disk failing, services down, file system nearly
 * full, disk warning, restart, clock. No row for Unknown, and none for "disk health not checked".
 */
export function attentionRows(input: AttentionInput): AttentionRow[] {
  const storage = input.storage ?? [];
  const full: AttentionRow[] = [];
  const missing: AttentionRow[] = [];
  const nearlyFull: AttentionRow[] = [];
  for (const item of storage) {
    if (item.kind === "missing") {
      missing.push({ kind: "fsMissing", key: item.key, name: item.name });
    } else if (item.state === "critical") {
      full.push({ kind: "fsFull", key: item.key, name: item.name });
    } else if (item.state === "warning") {
      nearlyFull.push({
        kind: "fsWarning",
        key: item.key,
        name: item.name,
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

  const rows: AttentionRow[] = [
    ...full,
    ...missing,
    ...failing,
    ...down,
    ...nearlyFull,
    ...warned,
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
