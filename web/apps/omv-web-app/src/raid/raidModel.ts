// SPDX-License-Identifier: GPL-3.0-or-later
// The RAID slice's rules (phase 5 RAID design 0.1 to 0.6, 0.9, 0.11): how an array is addressed and
// named, its level in words, what it protects, its state from mdadm's words, each member's role from
// mdadm's report, and the interface's own refusals. The plugin checks almost nothing for these methods
// (read from source), so every refusal is decided here, and each fails closed: a state or a report this
// page cannot read makes the actions that depend on it unavailable. Pure, so each rule is tested by
// itself on the captured examples; the components render the result.
//
// What the test VM showed and the design first assumed otherwise (journal, 2026-11-21):
// - an array made on this NAS has an empty `name`; a name is never shown with its host part;
// - `devices` lists failed members and spares too, so counts and roles come from getDetail only;
// - `state` carries progress for a resync or rebuild only; a reshape's and a check's percentage is
//   only in getDetail ("Reshape Status : 6% complete", "Check Status : 7% complete");
// - in getDetail's member table a failed member appears twice, as a "removed" slot line and as a
//   "faulty /dev/sdX" line, and is one failed disk, not a missing one and a failed one.
import type {
  ConfiguredFilesystem,
  DetectedFilesystem,
  MdArray,
} from "@omv-webui/react-api-omv/generated";
import { partitionParent } from "../disks/diskUse.ts";
import { sameUuid } from "../filesystems/fsModel.ts";

// ---- Addresses (0.6) ------------------------------------------------------------------------------

/** An array's page address: its kernel name, "md" and up to three digits. */
export const ARRAY_ADDRESS = /^md[0-9]{1,3}$/;

export const isArrayAddress = (value: unknown): value is string =>
  typeof value === "string" && ARRAY_ADDRESS.test(value);

/** The address of an array's page, or null for an array whose device file has another form. */
export function arrayAddress(row: Pick<MdArray, "devicefile">): string | null {
  const match = /^\/dev\/(md[0-9]{1,3})$/.exec(row.devicefile);
  return match?.[1] ?? null;
}

/** The row an address names: the device file is "/dev/" and the address. Every later call uses the row. */
export function findArray(
  rows: readonly MdArray[],
  address: string,
): MdArray | undefined {
  return isArrayAddress(address)
    ? rows.find((row) => row.devicefile === `/dev/${address}`)
    : undefined;
}

// ---- Names (0.1) ----------------------------------------------------------------------------------

/**
 * An array's own name, as people may be shown it: the part after the first colon of mdadm's
 * "host:name", and only when it is not just the array's number (mdadm's default). The host part is a
 * host name and is never shown (D3). Empty for an array made on this NAS (observed).
 */
export function ownName(name: string): string {
  const trimmed = name.trim();
  const colon = trimmed.indexOf(":");
  const own = (colon === -1 ? trimmed : trimmed.slice(colon + 1)).trim();
  return /^\d*$/.test(own) ? "" : own;
}

/**
 * mdadm's report with the host part of every name taken out, for the technical details: the "Name"
 * line keeps only the array's own name, and "(local to host …)" goes. Nothing else is changed.
 */
export function withoutHost(report: string): string {
  return report
    .split("\n")
    .map((line) => {
      const match = /^(\s*Name\s*:\s*)(.*)$/.exec(line);
      if (match === null) {
        return line;
      }
      const value = (match[2] ?? "").replace(/\s*\(local to host [^)]*\)/, "");
      const first = value.trim().split(/\s+/)[0] ?? "";
      const colon = first.indexOf(":");
      return `${match[1] ?? ""}${colon === -1 ? first : first.slice(colon + 1)}`;
    })
    .join("\n");
}

// ---- Levels (0.1, 0.4) ----------------------------------------------------------------------------

export const LEVEL_KEYS = [
  "raid1",
  "raid0",
  "raid10",
  "raid5",
  "raid6",
  "raid4",
  "linear",
] as const;
export type KnownLevel = (typeof LEVEL_KEYS)[number];
/** A level the catalogue has a word for, "unknown" (an array that is not running), or "other". */
export type LevelKey = KnownLevel | "unknown" | "other";

/** mdadm's and the plugin's words for a level: "raid1" and "mirror" are one, "raid0" and "stripe". */
export function levelKey(level: string | null | undefined): LevelKey {
  const word = (level ?? "").trim().toLowerCase();
  if (word === "") {
    return "unknown";
  }
  if (word === "mirror") {
    return "raid1";
  }
  if (word === "stripe") {
    return "raid0";
  }
  return (LEVEL_KEYS as readonly string[]).includes(word)
    ? (word as KnownLevel)
    : "other";
}

/** Whether a level keeps a copy or parity, so a disk can be taken out, added as a spare, or checked. */
export const keepsCopies = (key: LevelKey): boolean =>
  key === "raid1" ||
  key === "raid5" ||
  key === "raid6" ||
  key === "raid10" ||
  key === "raid4";

/** How many disks a level can lose with all its disks (raid10: 1, and sometimes more). */
export function canLose(key: LevelKey, numdevices: number): number {
  switch (key) {
    case "raid1":
      return Math.max(0, numdevices - 1);
    case "raid5":
    case "raid4":
    case "raid10":
      return 1;
    case "raid6":
      return 2;
    default:
      return 0;
  }
}

/** What an array protects, in words (0.4): the catalogue key and its count. */
export type Protection =
  | { key: "mirror"; count: number }
  | { key: "one" | "two" | "raid10" | "none" | "noMore" };

/**
 * 0.4's sentence for an array of `numdevices` disks with `short` of them missing or failed. With
 * disks missing, "It can lose" is reduced by that many, down to "It cannot lose another disk." Null
 * for a level this page does not know (nothing is claimed).
 */
export function protection(
  key: LevelKey,
  numdevices: number,
  short = 0,
): Protection | null {
  if (key === "unknown" || key === "other") {
    return null;
  }
  if (key === "raid0" || key === "linear") {
    return { key: "none" };
  }
  const left = canLose(key, numdevices) - Math.max(0, short);
  if (short > 0) {
    if (left <= 0) {
      return { key: "noMore" };
    }
    return key === "raid1"
      ? { key: "mirror", count: left }
      : left >= 2
        ? { key: "two" }
        : { key: "one" };
  }
  switch (key) {
    case "raid1":
      return { key: "mirror", count: left };
    case "raid6":
      return { key: "two" };
    case "raid10":
      return { key: "raid10" };
    default:
      return { key: "one" };
  }
}

/** The levels the create form offers, in the plugin's words, Stripe last (P3, D24). */
export const CREATE_LEVELS = [
  "mirror",
  "raid5",
  "raid6",
  "raid10",
  "stripe",
] as const;
export type CreateLevel = (typeof CREATE_LEVELS)[number];

/** The least number of disks each level is made of (the plugin's own form). */
export const MIN_DISKS: Readonly<Record<CreateLevel, number>> = {
  mirror: 2,
  raid5: 3,
  raid6: 4,
  raid10: 4,
  stripe: 2,
};

/**
 * About how much a level offers to a file system on disks of these sizes (0.4): each disk counts as
 * the smallest. The small amount mdadm keeps for its own records is not subtracted ("about").
 */
export function usableSize(key: LevelKey, sizes: readonly number[]): number {
  const n = sizes.length;
  if (n === 0) {
    return 0;
  }
  const smallest = Math.min(...sizes);
  switch (key) {
    case "raid1":
      return smallest;
    case "raid5":
    case "raid4":
      return (n - 1) * smallest;
    case "raid6":
      return Math.max(0, n - 2) * smallest;
    case "raid10":
      return (n * smallest) / 2;
    case "raid0":
      return n * smallest;
    case "linear":
      return sizes.reduce((sum, s) => sum + s, 0);
    default:
      return 0;
  }
}

// ---- Progress (0.1) -------------------------------------------------------------------------------

export interface Progress {
  /** Percent done, one decimal. */
  percent: number;
  /** Minutes left from the kernel's `finish=`, when it says. */
  minutesLeft: number | null;
}

/** The kernel's progress appended to `state` by the server: "(4.7% (…) finish=0.3min …)". */
export function stateProgress(state: unknown): Progress | null {
  if (typeof state !== "string") {
    return null;
  }
  const percent = /(\d+(?:\.\d+)?)%/.exec(state);
  if (percent?.[1] === undefined) {
    return null;
  }
  const finish = /finish=(\d+(?:\.\d+)?)min/.exec(state);
  return {
    percent: Math.min(100, Number(percent[1])),
    minutesLeft: finish?.[1] === undefined ? null : Number(finish[1]),
  };
}

export type WorkKind = "resync" | "rebuild" | "reshape" | "check" | "repair";

/** The progress line of mdadm's report: "Reshape Status : 6% complete", "Check Status : 7% complete". */
export function reportProgress(
  report: string,
): { kind: WorkKind; percent: number } | null {
  const match =
    /^\s*(Resync|Rebuild|Recovery|Reshape|Check|Repair) Status\s*:\s*(\d+(?:\.\d+)?)%/im.exec(
      report,
    );
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  const word = match[1].toLowerCase();
  const kind: WorkKind = word === "recovery" ? "rebuild" : (word as WorkKind);
  return { kind, percent: Math.min(100, Number(match[2])) };
}

// ---- Members (0.3) --------------------------------------------------------------------------------

export type Role = "working" | "rebuilding" | "spare" | "failed" | "other";

export interface Member {
  /** The member's device file as mdadm lists it ("/dev/sdb"). */
  device: string;
  role: Role;
  /** mdadm's own words for it, for a role this page does not know. */
  words: string;
}

export type Report =
  | { known: false }
  | {
      known: true;
      members: Member[];
      working: number;
      rebuilding: number;
      spares: number;
      failed: number;
      /** Slots with no disk that are not a failed disk still listed ("Missing"). */
      missing: number;
    };

const TABLE_HEAD = /^\s*Number\s+Major\s+Minor\s+RaidDevice\s+State\s*$/;
const MEMBER_LINE = /^\s*(\d+|-)\s+(\d+)\s+(\d+)\s+(\d+|-)\s+(.+?)\s*$/;

function roleOf(words: string): Role {
  const w = words.toLowerCase();
  if (/\bfaulty\b/.test(w)) {
    return "failed";
  }
  if (/\brebuilding\b/.test(w)) {
    return "rebuilding";
  }
  if (/\bactive sync\b/.test(w)) {
    return "working";
  }
  if (/^spare$/.test(w.trim())) {
    return "spare";
  }
  return "other";
}

/**
 * Each member's role from mdadm's report, and the counts (0.3). A failed disk still listed appears
 * twice, as a "removed" slot line and a "faulty" line (observed): it is one failed disk. So the
 * missing disks are the "removed" lines beyond the failed ones. Fails closed: a report without the
 * member table, a line of it this page cannot read, or a member of `devices` the table does not list
 * makes the roles "not known".
 */
export function readReport(
  report: unknown,
  devices?: readonly string[],
): Report {
  if (typeof report !== "string") {
    return { known: false };
  }
  const lines = report.split("\n");
  const head = lines.findIndex((line) => TABLE_HEAD.test(line));
  if (head === -1) {
    return { known: false };
  }
  const members: Member[] = [];
  let removed = 0;
  for (const line of lines.slice(head + 1)) {
    if (line.trim() === "") {
      continue;
    }
    const match = MEMBER_LINE.exec(line);
    const rest = match?.[5];
    if (rest === undefined) {
      return { known: false };
    }
    const device = /(\/dev\/\S+)$/.exec(rest)?.[1];
    if (device === undefined) {
      if (rest.trim().toLowerCase() === "removed") {
        removed += 1;
        continue;
      }
      return { known: false };
    }
    const words = rest.slice(0, rest.length - device.length).trim();
    members.push({ device, role: roleOf(words), words });
  }
  if (members.length === 0) {
    return { known: false };
  }
  if (devices !== undefined) {
    const listed = new Set(members.map((m) => m.device));
    if (devices.some((d) => !listed.has(d))) {
      return { known: false };
    }
  }
  const count = (role: Role) => members.filter((m) => m.role === role).length;
  const failed = count("failed");
  return {
    known: true,
    members,
    working: count("working"),
    rebuilding: count("rebuilding"),
    spares: count("spare"),
    failed,
    missing: Math.max(0, removed - failed),
  };
}

// ---- State (0.2) ----------------------------------------------------------------------------------

export type StateKind =
  | "unread"
  | "inactive"
  | "failed"
  | "rebuilding"
  | "degraded"
  | "reshaping"
  | "resyncPending"
  | "resyncDelayed"
  | "resyncing"
  | "checking"
  | "repairing"
  | "ok"
  | "unrecognised";

export type StateStatus = "ok" | "warning" | "critical" | "unknown";

export interface ArrayState {
  kind: StateKind;
  status: StateStatus;
  /** The progress of the work under way, from `state` or the report; null when neither says. */
  progress: Progress | null;
  /** Disks missing or failed: `numdevices` less the working ones, when the report was read. */
  short: number | null;
  /** The disk being rebuilt onto, from the report. */
  rebuildingOnto: string | null;
  /** `state` as received, for "Its state is …, which this page does not recognise." */
  text: string;
}

const RECOGNISED = new Set([
  "clean",
  "active",
  "degraded",
  "recovering",
  "resyncing",
  "reshaping",
  "checking",
  "inactive",
  "not started",
  "failed",
]);

/** `state`'s words, before the kernel's progress in brackets, lower case. */
function stateWords(state: string): string[] {
  const head = state.split("(")[0] ?? "";
  return head
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w !== "");
}

/**
 * An array's state (0.2) from `state`, `syncaction` and, when it was read, the report's counts. The
 * stricter reading wins: fewer working disks than `numdevices` is degraded whatever `state` says.
 * Anything this page does not recognise is Unknown, and every change to the array is then refused.
 */
export function arrayState(
  row: Pick<MdArray, "state" | "syncaction" | "numdevices">,
  report: Report | null = null,
  detail: string | null = null,
): ArrayState {
  const text = typeof row.state === "string" ? row.state : "";
  const known = report !== null && report.known ? report : null;
  const short =
    known === null ? null : Math.max(0, row.numdevices - known.working);
  const rebuildingOnto =
    known?.members.find((m) => m.role === "rebuilding")?.device ?? null;
  const fromReport = detail === null ? null : reportProgress(detail);
  const progress =
    stateProgress(row.state) ??
    (fromReport === null
      ? null
      : { percent: fromReport.percent, minutesLeft: null });
  const base = { progress, short, rebuildingOnto, text };
  if (row.state === false || text.trim() === "") {
    return { ...base, kind: "unread", status: "unknown", progress: null };
  }
  const words = stateWords(text);
  const lower = text.toLowerCase();
  const sync = (row.syncaction ?? "").toLowerCase();
  const has = (w: string) => words.includes(w);
  if (has("inactive") || has("not started")) {
    return { ...base, kind: "inactive", status: "critical" };
  }
  if (has("failed")) {
    return { ...base, kind: "failed", status: "critical" };
  }
  if (words.some((w) => !RECOGNISED.has(w))) {
    return { ...base, kind: "unrecognised", status: "unknown" };
  }
  const degraded = has("degraded") || (short !== null && short > 0);
  if (degraded && (has("recovering") || sync === "recover")) {
    return { ...base, kind: "rebuilding", status: "critical" };
  }
  if (degraded) {
    return { ...base, kind: "degraded", status: "critical" };
  }
  if (has("reshaping") || sync === "reshape") {
    return { ...base, kind: "reshaping", status: "warning" };
  }
  if (has("resyncing") || sync === "resync") {
    if (/pending/.test(lower)) {
      return { ...base, kind: "resyncPending", status: "warning" };
    }
    if (/delayed/.test(lower)) {
      return { ...base, kind: "resyncDelayed", status: "warning" };
    }
    return { ...base, kind: "resyncing", status: "warning" };
  }
  if (has("checking") || sync === "check") {
    return { ...base, kind: "checking", status: "ok" };
  }
  if (sync === "repair") {
    return { ...base, kind: "repairing", status: "ok" };
  }
  if (has("clean") || has("active")) {
    return { ...base, kind: "ok", status: "ok", progress: null };
  }
  return { ...base, kind: "unrecognised", status: "unknown" };
}

/** Long work the kernel does by itself: while it runs, the page polls (0.5, P9). */
export const isBusy = (kind: StateKind): boolean =>
  kind === "rebuilding" ||
  kind === "reshaping" ||
  kind === "resyncing" ||
  kind === "resyncPending" ||
  kind === "resyncDelayed" ||
  kind === "checking" ||
  kind === "repairing";

/** What an array is busy with, for "It is busy now ({{what}})". */
export type BusyWhat = "resync" | "reshape" | "check" | "rebuild";

export function busyWhat(kind: StateKind): BusyWhat | null {
  switch (kind) {
    case "resyncing":
    case "resyncPending":
    case "resyncDelayed":
      return "resync";
    case "reshaping":
      return "reshape";
    case "checking":
    case "repairing":
      return "check";
    case "rebuilding":
      return "rebuild";
    default:
      return null;
  }
}

/** The roll-up's worst-first order (1.4). */
const WORSE: Readonly<Record<StateStatus, number>> = {
  critical: 3,
  warning: 2,
  unknown: 1,
  ok: 0,
};
export const worse = (a: StateStatus, b: StateStatus): StateStatus =>
  WORSE[b] > WORSE[a] ? b : a;

// ---- What uses an array (0.11) --------------------------------------------------------------------

export type ArrayUsedBy =
  | { kind: "loading" }
  | { kind: "unchecked"; error: unknown }
  | {
      kind: "known";
      /** File systems OMV has set up on it (any status but being created). */
      configured: ConfiguredFilesystem[];
      /** A file system is being created on it now. */
      creating: boolean;
      /** File systems found on it that are not set up on this NAS. */
      found: DetectedFilesystem[];
      /** `_used` with no file system found: other storage, such as LVM. */
      other: boolean;
    };

type FsPlace = Pick<
  DetectedFilesystem,
  "canonicaldevicefile" | "parentdevicefile" | "devicefiles" | "devicefile"
>;

/** Whether a file system is on the array: on it, on a partition of it, or with it among its devices. */
export function isOnArray(fs: FsPlace, array: string): boolean {
  const places = [
    fs.canonicaldevicefile,
    fs.parentdevicefile,
    ...fs.devicefiles,
  ].filter((d) => d !== "");
  return places.some((d) => d === array || partitionParent(d) === array);
}

export interface UsedByInputs {
  configured: {
    data?: readonly ConfiguredFilesystem[];
    failed: boolean;
    error?: unknown;
  };
  detected: {
    data?: readonly DetectedFilesystem[];
    failed: boolean;
    error?: unknown;
  };
}

export function arrayUsedBy(
  row: Pick<MdArray, "devicefile" | "_used">,
  inputs: UsedByInputs,
): ArrayUsedBy {
  const { configured, detected } = inputs;
  if (configured.failed || detected.failed) {
    return {
      kind: "unchecked",
      error: configured.failed ? configured.error : detected.error,
    };
  }
  if (configured.data === undefined || detected.data === undefined) {
    return { kind: "loading" };
  }
  const on = configured.data.filter(
    (fs) => fs.mountpoint !== "/" && isOnArray(fs, row.devicefile),
  );
  const creating =
    on.some((fs) => fs.status === 2) ||
    configured.data.some(
      (fs) => fs.status === 2 && fs.parentdevicefile === row.devicefile,
    );
  const set = on.filter((fs) => fs.status !== 2);
  const found = detected.data.filter(
    (fs) =>
      fs.type !== "swap" &&
      isOnArray(fs, row.devicefile) &&
      !set.some(
        (c) =>
          sameUuid(c.uuid, fs.uuid) ||
          (c.canonicaldevicefile !== "" &&
            c.canonicaldevicefile === fs.canonicaldevicefile),
      ),
  );
  return {
    kind: "known",
    configured: set,
    creating,
    found,
    other: row._used && set.length === 0 && !creating,
  };
}

// ---- The interface's own refusals (0.9) -----------------------------------------------------------

/** What adding a disk does to this array (4.1), when it may take one. */
export type AddMode = "replace" | "spare" | "either";

export type AddBlocker =
  | { kind: "level" }
  | { kind: "notRunning" }
  | { kind: "unknown" }
  | { kind: "rolesUnknown" }
  | { kind: "rebuilding"; disk: string | null }
  | { kind: "busy"; what: BusyWhat }
  | { kind: "changing" };

export type AddDecision =
  { allowed: true; mode: AddMode } | { allowed: false; blocker: AddBlocker };

/**
 * 4.1: whether a disk can be added, and what for. A degraded array takes a replacement; an OK, idle
 * mirror or RAID10 a spare; an OK, idle RAID5 or RAID6 a spare or more space (D17). Refused for a
 * level without copies, an array not running, failed, Unknown or busy, and while this session is
 * changing the array. Replacing needs the roles (0.3), so an unread report refuses.
 */
export function addDecision(
  key: LevelKey,
  state: ArrayState,
  report: Report | null,
  changing: boolean,
): AddDecision {
  const no = (blocker: AddBlocker): AddDecision => ({
    allowed: false,
    blocker,
  });
  if (!keepsCopies(key)) {
    return no({ kind: "level" });
  }
  if (state.kind === "unread" || state.kind === "unrecognised") {
    return no({ kind: "unknown" });
  }
  if (state.kind === "inactive" || state.kind === "failed") {
    return no({ kind: "notRunning" });
  }
  if (changing) {
    return no({ kind: "changing" });
  }
  if (state.kind === "rebuilding") {
    return no({ kind: "rebuilding", disk: state.rebuildingOnto });
  }
  const what = busyWhat(state.kind);
  if (what !== null) {
    return no({ kind: "busy", what });
  }
  if (report === null || !report.known) {
    return no({ kind: "rolesUnknown" });
  }
  if (state.kind === "degraded") {
    return { allowed: true, mode: "replace" };
  }
  return {
    allowed: true,
    mode: key === "raid5" || key === "raid6" ? "either" : "spare",
  };
}

export type RemoveBlocker =
  | { kind: "level" }
  | { kind: "notRunning" }
  | { kind: "unknown" }
  | { kind: "rolesUnknown" }
  | { kind: "rebuilding" }
  | { kind: "degraded" }
  | { kind: "busy"; what: BusyWhat }
  | { kind: "changing" }
  | { kind: "role" };

export type RemoveDecision =
  | { allowed: true; confirm: "plain" | "typed" }
  | { allowed: false; blocker: RemoveBlocker };

/**
 * 5.1: whether a member may be taken out, and how it is confirmed. A failed disk or a spare loses
 * nothing (plain); a working disk only from an OK, idle array that keeps copies (typed, P6); never a
 * rebuilding disk, never from a stripe, never when the roles or the state are not known.
 */
export function removeDecision(
  key: LevelKey,
  state: ArrayState,
  member: Member,
  changing: boolean,
): RemoveDecision {
  const no = (blocker: RemoveBlocker): RemoveDecision => ({
    allowed: false,
    blocker,
  });
  if (!keepsCopies(key)) {
    return no({ kind: "level" });
  }
  if (state.kind === "unread" || state.kind === "unrecognised") {
    return no({ kind: "unknown" });
  }
  if (state.kind === "inactive" || state.kind === "failed") {
    return no({ kind: "notRunning" });
  }
  if (changing) {
    return no({ kind: "changing" });
  }
  switch (member.role) {
    case "failed":
    case "spare":
      return { allowed: true, confirm: "plain" };
    case "rebuilding":
      return no({ kind: "rebuilding" });
    case "other":
      return no({ kind: "role" });
    case "working": {
      if (state.kind === "degraded" || state.kind === "rebuilding") {
        return no({ kind: "degraded" });
      }
      const what = busyWhat(state.kind);
      if (what !== null) {
        return no({ kind: "busy", what });
      }
      return state.kind === "ok"
        ? { allowed: true, confirm: "typed" }
        : no({ kind: "unknown" });
    }
  }
}

export type CheckDecision =
  | { allowed: true; action: "check" | "idle" }
  | {
      allowed: false;
      blocker:
        | { kind: "busy"; what: BusyWhat }
        | { kind: "degraded" }
        | { kind: "notRunning" }
        | { kind: "unknown" }
        | { kind: "changing" };
    };

/** 6.1: Check now on an OK, idle array that keeps copies; Stop checking while it is checked. */
export function checkDecision(
  state: ArrayState,
  changing: boolean,
): CheckDecision {
  if (state.kind === "unread" || state.kind === "unrecognised") {
    return { allowed: false, blocker: { kind: "unknown" } };
  }
  if (state.kind === "inactive" || state.kind === "failed") {
    return { allowed: false, blocker: { kind: "notRunning" } };
  }
  if (state.kind === "checking" || state.kind === "repairing") {
    return { allowed: true, action: "idle" };
  }
  if (changing) {
    return { allowed: false, blocker: { kind: "changing" } };
  }
  if (state.kind === "degraded" || state.kind === "rebuilding") {
    return { allowed: false, blocker: { kind: "degraded" } };
  }
  const what = busyWhat(state.kind);
  if (what !== null) {
    return { allowed: false, blocker: { kind: "busy", what } };
  }
  return { allowed: true, action: "check" };
}

export type DeleteBlocker =
  | { kind: "fs"; fs: ConfiguredFilesystem }
  | { kind: "creating" }
  | { kind: "other" }
  | { kind: "unread"; error: unknown }
  | { kind: "changing" }
  | { kind: "unknown" };

/**
 * 7.1: why the array cannot be deleted; empty when it may be. Every file system OMV has set up on it
 * (mounted, used, or only set up, a mount not yet applied included) refuses, as does one being
 * created, other storage on it, and reads that failed. A synchronising, rebuilding or not-running
 * array may be deleted. An array whose state cannot be read (`state` false) may be too: it may need to
 * go so its disks can be reused; but an unrecognised state refuses (fail closed).
 */
export function deleteBlockers(
  state: ArrayState,
  used: ArrayUsedBy,
  changing: boolean,
): DeleteBlocker[] | null {
  if (used.kind === "loading") {
    return null;
  }
  const blockers: DeleteBlocker[] = [];
  if (used.kind === "unchecked") {
    blockers.push({ kind: "unread", error: used.error });
  } else {
    for (const fs of used.configured) {
      blockers.push({ kind: "fs", fs });
    }
    if (used.creating) {
      blockers.push({ kind: "creating" });
    }
    if (used.other) {
      blockers.push({ kind: "other" });
    }
  }
  if (changing) {
    blockers.push({ kind: "changing" });
  }
  if (state.kind === "unrecognised") {
    blockers.push({ kind: "unknown" });
  }
  return blockers;
}

/** The disks an array's report lists, with the roles; the missing slots as extra rows (2.5). */
export function memberRows(
  report: Report,
): { member: Member | null; key: string }[] {
  if (!report.known) {
    return [];
  }
  return [
    ...report.members.map((member) => ({ member, key: member.device })),
    ...Array.from({ length: report.missing }, (_, i) => ({
      member: null,
      key: `missing-${String(i)}`,
    })),
  ];
}

/** Whether two reads show the same array: the same UUID (0.6, D2). */
export const sameArray = (
  a: Pick<MdArray, "uuid">,
  b: Pick<MdArray, "uuid">,
): boolean => a.uuid.toLowerCase() === b.uuid.toLowerCase();
