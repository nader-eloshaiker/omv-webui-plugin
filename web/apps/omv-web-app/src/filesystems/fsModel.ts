// SPDX-License-Identifier: GPL-3.0-or-later
// The file systems slice's rules (phase 5 file-systems design 0.1, 0.2, 0.5 to 0.8): how a file system
// is named and addressed, its state and usage, what uses it, and the interface's own refusals of grow,
// unmount and remove. The server checks almost none of these (UX audit B14), so every refusal is
// decided here. Pure, so each rule is tested by itself; the components render the result.
import type {
  ConfiguredFilesystem,
  MountEntry,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { fileSystemState, type FsState } from "../dashboard/dashboard.ts";

// ---- Addresses (0.5) -----------------------------------------------------------------------------

/** A file system's UUID as its page's address: standard UUIDs and the short FAT form ABCD-1234. */
const FS_ADDRESS = /^[0-9A-Fa-f]{4,16}(-[0-9A-Fa-f]{2,16}){0,4}$/;
const MAX_ADDRESS = 36;

export const isFsAddress = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= MAX_ADDRESS &&
  FS_ADDRESS.test(value);

const BY_UUID = "/dev/disk/by-uuid/";

/**
 * A row's own UUID, or "" when it has none. A ZFS file system reports `null` (the ZFS design 10.3): no
 * UUID is no UUID everywhere, so it never matches another row and never forms an address.
 */
export const ownUuid = (row: { uuid: string | null }): string => row.uuid ?? "";

/** Whether two UUIDs name the same file system: never when either is missing, else ignoring case. */
export function sameUuid(a: string | null, b: string | null): boolean {
  return (
    a !== null &&
    b !== null &&
    a !== "" &&
    b !== "" &&
    a.toLowerCase() === b.toLowerCase()
  );
}

/** The file-system type OMV's ZFS plugin reports for a pool's own folder and each of its datasets. */
export const ZFS_TYPE = "zfs";

export const isZfs = (row: { type: string }): boolean => row.type === ZFS_TYPE;

/** The pool a ZFS file system belongs to: the first part of its full name ("tank/media" is in "tank"). */
export function zfsPool(row: {
  devicefile: string;
  devicename?: string;
}): string {
  const name = row.devicefile !== "" ? row.devicefile : (row.devicename ?? "");
  return name.split("/")[0] ?? "";
}

/** The UUID a row is recorded by: its own, or the one in a missing file system's stable path. */
function recordedUuid(row: Pick<ConfiguredFilesystem, "uuid" | "devicefile">) {
  const own = ownUuid(row);
  if (own !== "") {
    return own;
  }
  return row.devicefile.startsWith(BY_UUID)
    ? row.devicefile.slice(BY_UUID.length)
    : "";
}

/**
 * The address of a file system's page, or null when it has none: one being created, the system drive,
 * a ZFS file system (managed with its pool, and FsTab knows none of them), and a row with no UUID this
 * page can use (0.5).
 */
export function fsAddress(
  row: Pick<
    ConfiguredFilesystem,
    "status" | "uuid" | "devicefile" | "mountpoint" | "type"
  >,
): string | null {
  if (row.status === 2 || row.mountpoint === "/" || isZfs(row)) {
    return null;
  }
  const id = recordedUuid(row);
  return isFsAddress(id) ? id : null;
}

/** The page of a file system another read names, when getList has it (design 9). */
export function addressIn(
  configured: readonly ConfiguredFilesystem[],
  fs: { uuid: string | null; devicefile: string },
): string | null {
  const row = configured.find(
    (r) =>
      sameUuid(r.uuid, fs.uuid) ||
      (fs.devicefile !== "" && r.devicefile === fs.devicefile),
  );
  return row === undefined ? null : fsAddress(row);
}

/**
 * The row an address names (0.5): the UUID, ignoring case, or a missing row recorded by that UUID's
 * stable path. Every later call uses the row's fields, never the address (UI-4).
 */
export function findFsRow(
  rows: readonly ConfiguredFilesystem[],
  address: string,
): ConfiguredFilesystem | undefined {
  if (!isFsAddress(address)) {
    return undefined;
  }
  return rows.find(
    (row) => fsAddress(row) !== null && sameUuid(recordedUuid(row), address),
  );
}

// ---- Names and words (0.1) -----------------------------------------------------------------------

/** The file-system types with a word of their own in the catalogue (`fsType.*`). */
export const FS_TYPE_KEYS = [
  "ext4",
  "xfs",
  "btrfs",
  "f2fs",
  "jfs",
  "vfat",
  "exfat",
  "ntfs",
  "iso9660",
  "zfs",
] as const;
export type FsTypeKey = (typeof FS_TYPE_KEYS)[number];

export const fsTypeKey = (type: string): FsTypeKey | null =>
  (FS_TYPE_KEYS as readonly string[]).includes(type)
    ? (type as FsTypeKey)
    : null;

/** A file system's name for people: its label, else its type on its device (0.1, D11). */
export type FsName =
  | { kind: "label"; text: string }
  | { kind: "onDevice"; type: string; device: string };

export function fsName(row: {
  label: string | null;
  type: string;
  canonicaldevicefile: string;
  devicefile: string;
}): FsName {
  const label = (row.label ?? "").trim();
  if (label !== "") {
    return { kind: "label", text: label };
  }
  return {
    kind: "onDevice",
    type: row.type,
    device: row.canonicaldevicefile || row.devicefile,
  };
}

/** Tags as OMV stores them, one string joined with "," (observed): each, trimmed, in order. */
export const splitTags = (comment: string): string[] =>
  comment
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");

/** What a tags field saves: as the classic interface writes them, sorted, without repeats, "," between. */
export const tagsToSave = (text: string): string =>
  [...new Set(splitTags(text))].sort().join(",");

/** At most this many characters in the tags (the contract's limit, 2.6). */
export const TAGS_MAX = 200;

/** The tags field's text is too long to save. */
export const tagsTooLong = (text: string): boolean =>
  tagsToSave(text).length > TAGS_MAX || text.trim().length > TAGS_MAX;

/** The warning levels the classic interface offers, 0 meaning Off (2.6). */
export const LEVELS = [0, 50, 75, 80, 85, 90, 95] as const;

/** The level a new mount starts with: the classic mount form's default and Flow A's (A7). */
export const DEFAULT_LEVEL = 85;

/** A saved level outside the list stays a choice of its own until changed ("set elsewhere"). */
export const levelChoices = (saved: number): number[] =>
  (LEVELS as readonly number[]).includes(saved)
    ? [...LEVELS]
    : [...LEVELS, saved].sort((a, b) => a - b);

// ---- State and usage (0.2) -----------------------------------------------------------------------

/** The modules a mount saved with setMountPoint marks pending (observed on the VM, OMV 8.6.1). */
export const MOUNT_MODULES = ["collectd", "fstab", "monit", "quota"] as const;
/** What umountByDir leaves pending once it has applied fstab itself (observed). */
export const UNMOUNT_MODULES = ["collectd", "monit", "quota"] as const;
/** What FsTab.set on an existing entry marks pending (observed). */
export const SETTINGS_MODULE = "monit";

export type FsMountState =
  "ok" | "setUpPending" | "notMounted" | "creating" | "missing";

export function fsState(
  row: Pick<ConfiguredFilesystem, "status" | "mounted">,
  pending: readonly string[],
): FsMountState {
  if (row.status === 2) {
    return "creating";
  }
  if (row.status === 3) {
    return "missing";
  }
  if (row.mounted) {
    return "ok";
  }
  return pending.includes("fstab") ? "setUpPending" : "notMounted";
}

/** How full it is: the dashboard's rule (its 1.2.3), or "none" when there is no reading to show. */
export type FsUsage = FsState | "none";

export function fsUsage(
  row: Pick<
    ConfiguredFilesystem,
    | "status"
    | "mounted"
    | "percentage"
    | "available"
    | "size"
    | "usagewarnthreshold"
  >,
): FsUsage {
  if (row.status !== 1 || !row.mounted) {
    return "none";
  }
  return fileSystemState({
    percentage: row.percentage,
    available: row.available,
    size: row.size,
    usagewarnthreshold: row.usagewarnthreshold ?? 0,
  });
}

export type RowStatus = "ok" | "warning" | "critical" | "unknown";

const WORSE: Record<RowStatus, number> = {
  critical: 3,
  warning: 2,
  unknown: 1,
  ok: 0,
};

/**
 * One file system's place in the roll-up (1.4): the worse of its state and its usage. A pending mount
 * and one being created count as fine here: the band and the Running pill say those.
 */
export function rowStatus(state: FsMountState, usage: FsUsage): RowStatus {
  const fromState: RowStatus =
    state === "notMounted" || state === "missing" ? "critical" : "ok";
  const fromUsage: RowStatus =
    usage === "critical" || usage === "warning" || usage === "unknown"
      ? usage
      : "ok";
  return WORSE[fromUsage] > WORSE[fromState] ? fromUsage : fromState;
}

// ---- What uses it (0.6) --------------------------------------------------------------------------

export type UsedBy =
  | { kind: "loading" }
  | { kind: "unchecked"; error: unknown }
  | { kind: "shares"; folders: SharedFolder[] }
  | { kind: "other" }
  | { kind: "none" };

/**
 * The shared folders on a file system: by the mount entry's UUID when it was read, else by the folder
 * their mount entry names. `_used` with no folder found is "something else" (Pattern G).
 */
export function usedBy(
  row: Pick<ConfiguredFilesystem, "_used" | "mountpoint" | "devicefile">,
  entry: MountEntry | false | undefined,
  shares: { data?: readonly SharedFolder[]; error?: unknown; failed: boolean },
): UsedBy {
  if (shares.data === undefined) {
    return shares.failed
      ? { kind: "unchecked", error: shares.error }
      : { kind: "loading" };
  }
  const folders = shares.data.filter((folder) =>
    entry
      ? folder.mntentref === entry.uuid
      : (row.mountpoint !== "" && folder.mntent?.dir === row.mountpoint) ||
        (row.devicefile !== "" && folder.mntent?.fsname === row.devicefile),
  );
  if (folders.length > 0) {
    return { kind: "shares", folders };
  }
  return row._used ? { kind: "other" } : { kind: "none" };
}

// ---- The interface's own refusals (0.8, 4.1, 5.1) ------------------------------------------------

export type GrowBlocker = "notMounted" | "readOnly" | "multi" | "busy";

/** Why "Grow file system…" is unavailable, in 4.1's order; empty when it may be grown. */
export function growBlockers(
  row: Pick<
    ConfiguredFilesystem,
    "status" | "mounted" | "_readonly" | "propreadonly" | "hasmultipledevices"
  >,
  busy: boolean,
): GrowBlocker[] {
  const blockers: GrowBlocker[] = [];
  if (row.status !== 1 || !row.mounted) {
    blockers.push("notMounted");
  }
  if (row._readonly || row.propreadonly === true) {
    blockers.push("readOnly");
  }
  if (row.hasmultipledevices === true) {
    blockers.push("multi");
  }
  if (busy) {
    blockers.push("busy");
  }
  return blockers;
}

/** A shared folder named by a refusal: its name, and its UUID for the link to its page. */
export interface BlockingFolder {
  uuid: string;
  name: string;
}

export type UnmountBlocker =
  | { kind: "shared"; names: string[]; folders: BlockingFolder[] }
  | { kind: "used" }
  | { kind: "other" }
  | { kind: "readOnly" }
  | { kind: "creating" }
  | { kind: "noFstab" }
  | { kind: "busy" };

/**
 * Why unmounting (or removing) is unavailable (5.1). It rests on `_used`, which comes with the row: the
 * shared folders only name what uses it ("used" when they could not be read). Removing a missing file
 * system is refused only while it is used or being changed.
 */
export function unmountBlockers(
  row: Pick<
    ConfiguredFilesystem,
    "status" | "_used" | "_readonly" | "mountpoint" | "propfstab"
  >,
  used: UsedBy,
  busy: boolean,
  action: "unmount" | "remove",
): UnmountBlocker[] {
  const blockers: UnmountBlocker[] = [];
  if (row._used || used.kind === "shares") {
    blockers.push(
      used.kind === "shares"
        ? {
            kind: "shared",
            names: used.folders.map((f) => f.name),
            folders: used.folders.map((f) => ({ uuid: f.uuid, name: f.name })),
          }
        : used.kind === "other" || used.kind === "none"
          ? { kind: "other" }
          : { kind: "used" },
    );
  }
  if (action === "unmount") {
    if (row._readonly || row.mountpoint === "/") {
      blockers.push({ kind: "readOnly" });
    }
    if (row.status === 2) {
      blockers.push({ kind: "creating" });
    }
    if (row.propfstab === false) {
      blockers.push({ kind: "noFstab" });
    }
  }
  if (busy) {
    blockers.push({ kind: "busy" });
  }
  return blockers;
}

/** Which closing section a file system's page has (2.2 item 9, 5.1). */
export type EndSection = "unmount" | "remove" | "pendingOnly" | null;

export function endSection(
  row: Pick<ConfiguredFilesystem, "status" | "mounted">,
  pending: readonly string[],
): EndSection {
  if (row.status === 2) {
    return null;
  }
  if (row.status === 3) {
    return "remove";
  }
  if (row.mounted) {
    return "unmount";
  }
  if (!pending.includes("fstab")) {
    return "remove";
  }
  // D16: a mount that is only pending is cancelled with the band's Undo, unless other changes are
  // pending too (then Unmount's pre-flight asks to apply or undo them first).
  const onlyMount = pending.every((m) =>
    (MOUNT_MODULES as readonly string[]).includes(m),
  );
  return onlyMount ? "pendingOnly" : "unmount";
}

/** The other pending modules, beyond what an action itself expects (R10). */
export const otherModules = (
  pending: readonly string[],
  expected: readonly string[],
): string[] => pending.filter((m) => !expected.includes(m));

// ---- The list and the sharing handover (1.3.2, 6.8) ----------------------------------------------

/** The rows as the list shows them: the system drive's reading is the dashboard's. */
export function listRows(
  configured: readonly ConfiguredFilesystem[],
): ConfiguredFilesystem[] {
  // A file system that also lists "/" (an add-on sharing the system drive) is the system drive's row.
  return configured.filter((fs) => fs.mountpoint !== "/");
}

/** How the classic shared-folder picker names it: its tags in brackets, else its device (6.8). */
export function choiceText(
  fs: Pick<
    ConfiguredFilesystem,
    "comment" | "canonicaldevicefile" | "devicefile"
  >,
): string {
  const tags = splitTags(fs.comment);
  return tags.length > 0
    ? `[${tags.join(",")}]`
    : fs.canonicaldevicefile || fs.devicefile;
}
