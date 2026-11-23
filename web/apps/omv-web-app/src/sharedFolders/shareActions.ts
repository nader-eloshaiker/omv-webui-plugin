// SPDX-License-Identifier: GPL-3.0-or-later
// The shares slice's own refusals (phase 5 shares design 0.6, 0.9, 8.1), worked out from the reads,
// failing closed: when a read a rule needs has failed or not arrived, the action is unavailable
// (journal, 2026-11-21: the interface enforces its own safeguards, and a refusal offers no classic
// link round it, P15). Each refusal is a typed reason; the pages turn it into words. Pure.
//
// Observed on the test VM (journal, 2026-11-22): ShareMgmt.delete is refused while an SMB share refers
// to the folder, even one turned off; an unmounted file system is not in ShareMgmt.getCandidates, a
// ZFS file system is; a folder whose file system is unmounted (its empty mount folder still there)
// reads ENOENT.
import type {
  ConfiguredFilesystem,
  RsyncdModuleRow,
  RsyncJobRow,
  ShareCandidate,
  SharedFolder,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import {
  fsState,
  fsUsage,
  type FsMountState,
  type FsUsage,
} from "../filesystems/fsModel.ts";
import { serviceUses, type ServiceReads } from "../services/folderUses.ts";
import { anyoneHasAccess, entriesOf } from "./accessModel.ts";
import {
  isSameOrInside,
  isWholeFs,
  type NameProblem,
  type PathProblem,
} from "./nameRules.ts";
import type { SharesAction } from "./sharesSession.ts";
import { guestMode, hostRule, shareOf, type GuestMode } from "./smbModel.ts";
import { statusView, type KnownProblem } from "./table.ts";

/** What a rule needs from one read: the rows, or that the read failed (with its error). */
export interface ListRead<T> {
  data: readonly T[] | undefined;
  failed: boolean;
  error?: unknown;
}

// ---- A folder's file system (0.3, 0.6) ------------------------------------------------------------

/**
 * The FileSystemMgmt.getList row of a folder's file system: the one mounted at the folder's mount
 * entry's folder, or whose device path is the mount entry's (the file-systems slice's usedBy join).
 */
export function folderFs(
  folder: Pick<SharedFolder, "mntent">,
  rows: readonly ConfiguredFilesystem[],
): ConfiguredFilesystem | undefined {
  const dir = folder.mntent?.dir ?? "";
  const fsname = folder.mntent?.fsname ?? "";
  return rows.find(
    (fs) =>
      (dir !== "" && fs.mountpoint === dir) ||
      (fsname !== "" && fs.devicefile === fsname),
  );
}

/** The system drive: the file system mounted at "/" (the file-systems slice's rule). */
export const isSystemDrive = (
  fs: Pick<ConfiguredFilesystem, "mountpoint">,
): boolean => fs.mountpoint === "/";

/** A read-only mount (D13), from its mount options. */
export const isReadOnlyMount = (
  fs: Pick<ConfiguredFilesystem, "mountopts">,
): boolean =>
  (fs.mountopts ?? "")
    .split(",")
    .map((o) => o.trim())
    .includes("ro");

/**
 * The candidate for a file system. ShareMgmt.getCandidates gives only each mount entry's UUID and a
 * server-built description that begins with the file system's device ("/dev/sdd1 [Media]") or, for
 * ZFS, its name ("tank [...]"). The join takes, first, an existing folder on that file system (its
 * `mntentref` with its `mntent.dir`), then the description's leading device or name. Never shown.
 */
export function candidateOf(
  fs: ConfiguredFilesystem,
  candidates: readonly ShareCandidate[],
  folders: readonly Pick<SharedFolder, "mntentref" | "mntent">[] = [],
): ShareCandidate | undefined {
  const byFolder = folders.find(
    (f) => fs.mountpoint !== "" && f.mntent?.dir === fs.mountpoint,
  );
  if (byFolder !== undefined) {
    const found = candidates.find((c) => c.uuid === byFolder.mntentref);
    if (found !== undefined) {
      return found;
    }
  }
  const names = new Set(
    [fs.canonicaldevicefile, fs.devicefile, fs.devicename].filter(
      (n): n is string => typeof n === "string" && n !== "",
    ),
  );
  return candidates.find((c) => {
    const lead = c.description.split(" [")[0]?.trim() ?? "";
    return lead !== "" && names.has(lead);
  });
}

export type CannotHold =
  "notMounted" | "missing" | "system" | "notCandidate" | "readOnly";

export interface FsOffered {
  fs: ConfiguredFilesystem;
  /** The mount entry ShareMgmt.set takes as `mntentref`. */
  candidate: ShareCandidate;
  /** How full it is: "warning" and "critical" are offered with their pill (0.6's "Full"). */
  usage: FsUsage;
}

export interface FsChoices {
  offered: FsOffered[];
  cannot: { fs: ConfiguredFilesystem; reason: CannotHold }[];
}

/**
 * 0.6: which file systems can hold a new shared folder. Offered only when it is in getCandidates, its
 * getList row is mounted and not missing, it is not the system drive and not mounted read-only (the
 * stricter of OMV's list and this interface's reading wins). The caller fails closed when either read
 * failed (nothing is offered then).
 */
export function fsChoices(
  candidates: readonly ShareCandidate[],
  rows: readonly ConfiguredFilesystem[],
  folders: readonly Pick<SharedFolder, "mntentref" | "mntent">[] = [],
  pending: readonly string[] = [],
): FsChoices {
  const offered: FsOffered[] = [];
  const cannot: FsChoices["cannot"] = [];
  for (const fs of rows) {
    const state: FsMountState = fsState(fs, pending);
    let reason: CannotHold | null = null;
    if (isSystemDrive(fs)) {
      reason = "system";
    } else if (state === "missing") {
      reason = "missing";
    } else if (state !== "ok") {
      reason = "notMounted";
    } else if (isReadOnlyMount(fs)) {
      reason = "readOnly";
    }
    const candidate =
      reason === null ? candidateOf(fs, candidates, folders) : undefined;
    if (reason === null && candidate === undefined) {
      reason = "notCandidate";
    }
    if (reason !== null || candidate === undefined) {
      cannot.push({ fs, reason: reason ?? "notCandidate" });
    } else {
      offered.push({ fs, candidate, usage: fsUsage(fs) });
    }
  }
  return { offered, cannot };
}

/**
 * The file system chosen when the form opens (0.6): the one Flow A handed over (by its devicefile)
 * when it is offered; else the only one offered; else none.
 */
export function defaultFsChoice(
  offered: readonly FsOffered[],
  handedOver: string | null,
): FsOffered | undefined {
  const handed =
    handedOver === null
      ? undefined
      : offered.find((o) => o.fs.devicefile === handedOver);
  return handed ?? (offered.length === 1 ? offered[0] : undefined);
}

// ---- A folder's state (0.3, 2.2, 2.4) -------------------------------------------------------------

export type FolderState =
  | { pill: "ok" }
  | { pill: "critical"; reason: KnownProblem | "fsNotMounted" | "fsMissing" }
  | { pill: "unknown"; code: string };

/**
 * The worse of the folder's own status and its file system's (0.3): a folder whose status reads OK on
 * an unmounted or missing file system is Critical; Unknown keeps the code as text.
 */
export function folderState(
  folder: Pick<SharedFolder, "status">,
  fs: ConfiguredFilesystem | undefined,
  pending: readonly string[] = [],
): FolderState {
  const own = statusView(folder.status);
  if (own.pill !== "ok") {
    return own;
  }
  if (fs !== undefined) {
    const state = fsState(fs, pending);
    if (state === "missing") {
      return { pill: "critical", reason: "fsMissing" };
    }
    if (state !== "ok") {
      return { pill: "critical", reason: "fsNotMounted" };
    }
  }
  return { pill: "ok" };
}

/** 2.4's "What to do now": the first case that applies, or null. */
export type FolderTodo =
  | "fsGone"
  | "notMounted"
  | "missing"
  | "notDir"
  | "nobody"
  | "smbOff"
  | "smbDown";

export function folderTodo(input: {
  folder: Pick<SharedFolder, "status" | "privileges">;
  fs: ConfiguredFilesystem | undefined;
  share: SmbShareRow | undefined;
  /** Whether SMB is on for the NAS (smbOn); undefined while not known. */
  smbOn: boolean | undefined;
  /** SMB on but not running and not pending (smbState "down"). */
  smbDown: boolean;
  pending?: readonly string[];
}): FolderTodo | null {
  const { folder, fs, share } = input;
  const pending = input.pending ?? [];
  switch (folder.status) {
    case "ENOENT_DB_MNTENT":
      return "fsGone";
    case "ENOENT": {
      const state = fs === undefined ? "missing" : fsState(fs, pending);
      return state === "ok" ? "missing" : "notMounted";
    }
    case "ENOTDIR":
      return "notDir";
    default:
      break;
  }
  if (fs !== undefined && fsState(fs, pending) !== "ok") {
    return "notMounted";
  }
  if (
    share !== undefined &&
    guestMode(share.guest) === "no" &&
    !anyoneHasAccess(entriesOf(folder.privileges))
  ) {
    return "nobody";
  }
  if (share !== undefined && input.smbOn === false) {
    return "smbOff";
  }
  if (share !== undefined && input.smbDown) {
    return "smbDown";
  }
  return null;
}

// ---- Refusals before an action (0.9) --------------------------------------------------------------

export type Refusal =
  /** A read the rule needs failed: the action waits for a read that succeeds, with its message. */
  | { kind: "unread"; error: unknown }
  /** A read the rule needs has not arrived yet. */
  | { kind: "loading" }
  /** An action on this folder is already running in this session: "Wait for {{action}} to finish." */
  | { kind: "running"; action: SharesAction }
  /** No file system can hold a shared folder (0.6). */
  | { kind: "noFs" }
  | { kind: "name"; problem: NameProblem }
  | { kind: "path"; problem: PathProblem }
  /** Share with guest access off while nobody has access (0.9, 4.1). */
  | { kind: "needAccess" }
  /** Saving would leave nobody with access while shared with guest access off (3.3). */
  | { kind: "lastAccess" }
  /** Turning SMB on with a NAS name over 15 characters (4.4). */
  | { kind: "hostTooLong"; host: string; length: number }
  /** Repairing a folder that is OK (section 7 is for repair only). */
  | { kind: "okOnly" }
  /** The chosen file system is not offered by 0.6. */
  | { kind: "fsNotOffered" }
  /** The folder changed since the page read it (0.9, "Any of them"). */
  | { kind: "changed" }
  /** The folder is no longer on the list. */
  | { kind: "gone" };

/** Every read a rule rests on, in one place: the first failure, else whether any is still on its way. */
export function readsRefusal(
  reads: readonly { failed: boolean; error?: unknown; ready: boolean }[],
): Refusal | null {
  const failed = reads.find((r) => r.failed);
  if (failed !== undefined) {
    return { kind: "unread", error: failed.error };
  }
  return reads.every((r) => r.ready) ? null : { kind: "loading" };
}

/** The fields of a folder an action relies on; a change in any of them stops the action (0.9). */
export function folderChanged(
  before: Pick<SharedFolder, "uuid" | "name" | "mntentref" | "reldirpath">,
  now:
    | Pick<SharedFolder, "uuid" | "name" | "mntentref" | "reldirpath">
    | undefined,
): boolean {
  return (
    now === undefined ||
    before.uuid !== now.uuid ||
    before.name !== now.name ||
    before.mntentref !== now.mntentref ||
    before.reldirpath !== now.reldirpath
  );
}

/**
 * Share over SMB, or change a share's options (0.9, 4.1, 4.4). `guest` is the form's choice; the
 * folder's stored access counts, not unsaved changes in the grid (4.1). With SMB off the save also
 * turns it on, so the name rule applies.
 */
export function shareRefusal(input: {
  folder: Pick<SharedFolder, "privileges">;
  guest: GuestMode;
  smbOn: boolean | undefined;
  hostname: string | undefined;
  running?: SharesAction | null;
}): Refusal | null {
  if (input.running) {
    return { kind: "running", action: input.running };
  }
  if (input.smbOn === undefined || input.hostname === undefined) {
    return { kind: "loading" };
  }
  if (
    input.guest === "no" &&
    !anyoneHasAccess(entriesOf(input.folder.privileges))
  ) {
    return { kind: "needAccess" };
  }
  return input.smbOn ? null : smbOnRefusal(input.hostname);
}

/** Turn Windows and Mac sharing on (4.4, 5.2). */
export function smbOnRefusal(hostname: string): Refusal | null {
  const rule = hostRule(hostname);
  return rule.ok
    ? null
    : { kind: "hostTooLong", host: rule.host, length: rule.length };
}

/**
 * Save access (3.3): refused when the list would let nobody in while the folder has an SMB share with
 * guest access off (P8). `list` is what would be sent (privilegesToSave).
 */
export function saveAccessRefusal(input: {
  list: readonly { perms: number }[];
  share: SmbShareRow | undefined;
  running?: SharesAction | null;
}): Refusal | null {
  if (input.running) {
    return { kind: "running", action: input.running };
  }
  if (
    input.share !== undefined &&
    guestMode(input.share.guest) === "no" &&
    !anyoneHasAccess(input.list)
  ) {
    return { kind: "lastAccess" };
  }
  return null;
}

/** Point a folder somewhere else (section 7): only a folder that cannot be reached. */
export function repointRefusal(input: {
  folder: Pick<SharedFolder, "status">;
  fsOffered: boolean;
  path: PathProblem | null;
  running?: SharesAction | null;
}): Refusal | null {
  if (input.running) {
    return { kind: "running", action: input.running };
  }
  if (statusView(input.folder.status).pill === "ok") {
    return { kind: "okOnly" };
  }
  if (input.path !== null) {
    return { kind: "path", problem: input.path };
  }
  return input.fsOffered ? null : { kind: "fsNotOffered" };
}

// ---- Deleting (8.1) -------------------------------------------------------------------------------

export type DeleteBlocker =
  /** "It is shared with Windows and Mac computers." (any share, even one turned off) */
  | { kind: "smb"; share: SmbShareRow }
  /** "It is shared with Linux and Unix computers." (services design 2.7: any NFS entry) */
  | { kind: "nfs" }
  /** "It is offered to the rsync server as {{name}}." */
  | { kind: "rsyncModule"; module: RsyncdModuleRow }
  /** "The copy job {{job}} copies from it." / "…copies into it." */
  | { kind: "job"; job: RsyncJobRow; into: boolean }
  /** "Used by an add-on's setting…" (`_used` with nothing this interface knows found). */
  | { kind: "other" }
  /** "It holds every person's home folder. Turn home folders off first." (users design 13.1) */
  | { kind: "homeFolders" }
  /** "Could not check what uses this shared folder, so it cannot be removed now." + message. */
  | { kind: "unread"; error: unknown }
  /** A read has not arrived yet: nothing is offered until it has. */
  | { kind: "loading" }
  /** "Wait for {{action}} to finish." */
  | { kind: "running"; action: SharesAction }
  /** With files only: its folder cannot be found, so the page cannot tell what would be deleted. */
  | { kind: "notOk" }
  /** With files only: "Its file system {{fs}} is not mounted." (or its state); fs undefined when not found. */
  | { kind: "fsNotMounted"; fs: ConfiguredFilesystem | undefined }
  /** With files only: "It is the whole file system {{fs}}…" */
  | { kind: "whole"; fs: ConfiguredFilesystem | undefined }
  /** With files only: "{{other}} uses {{its path}}, inside this folder." */
  | { kind: "inside"; other: SharedFolder }
  /** With files only: "It is on the system drive." */
  | { kind: "system" };

export interface DeleteInput {
  folder: SharedFolder;
  /** The whole getList read (every folder). */
  folders: ListRead<SharedFolder>;
  shares: ListRead<SmbShareRow>;
  fileSystems: ListRead<ConfiguredFilesystem>;
  /** The action running on this folder in this session, if any (sharesSession). */
  running?: SharesAction | null;
  pending?: readonly string[];
  /** It holds the home folders now (UserMgmt.getSettings); unknown is false, `_used` still blocks. */
  homeFolders?: boolean;
  /**
   * The NFS entries, rsync server folders and copy jobs (services design 2.7), whole lists. Left out,
   * only `_used` speaks for them.
   */
  services?: ServiceReads;
}

export interface DeleteBlockers {
  /** "Remove, keep the files…" */
  keep: DeleteBlocker[];
  /** "Delete with all its files…": the keep blockers and the files-only ones. */
  files: DeleteBlocker[];
}

/**
 * Why each way of deleting is unavailable now (8.1), both kinds, from the reads; empty lists when it
 * may start (the dialog's pre-flight then refuses while other changes are pending, 0.8). The keep
 * blockers rest on getList and getShareList; deleting the files also needs FileSystemMgmt.getList.
 */
export function deleteBlockers(input: DeleteInput): DeleteBlockers {
  const keep: DeleteBlocker[] = [];
  if (input.running) {
    keep.push({ kind: "running", action: input.running });
  }
  const usesRead = [
    input.folders,
    input.shares,
    ...(input.services === undefined
      ? []
      : [input.services.nfs, input.services.modules, input.services.jobs]),
  ];
  const failedRead = usesRead.find((r) => r.failed);
  if (failedRead !== undefined) {
    keep.push({ kind: "unread", error: failedRead.error });
  } else if (usesRead.some((r) => r.data === undefined)) {
    keep.push({ kind: "loading" });
  } else {
    const share = shareOf(input.shares.data ?? [], input.folder.uuid);
    if (share !== undefined) {
      keep.push({ kind: "smb", share });
    }
    const services =
      input.services === undefined
        ? undefined
        : serviceUses(input.folder.uuid, input.services);
    const named = services?.kind === "read" ? services : undefined;
    if (named !== undefined && named.nfs.length > 0) {
      keep.push({ kind: "nfs" });
    }
    for (const use of named?.uses ?? []) {
      keep.push(
        use.kind === "rsyncModule"
          ? { kind: "rsyncModule", module: use.module }
          : { kind: "job", job: use.job, into: use.into },
      );
    }
    const found =
      share !== undefined ||
      (named !== undefined && (named.nfs.length > 0 || named.uses.length > 0));
    if (input.homeFolders === true) {
      keep.push({ kind: "homeFolders" });
    } else if (!found && input.folder._used) {
      keep.push({ kind: "other" });
    }
  }

  const files: DeleteBlocker[] = [...keep];
  const { folder } = input;
  if (statusView(folder.status).pill !== "ok") {
    files.push({ kind: "notOk" });
  }
  if (input.fileSystems.failed) {
    if (!files.some((b) => b.kind === "unread")) {
      files.push({ kind: "unread", error: input.fileSystems.error });
    }
    return { keep, files };
  }
  if (input.fileSystems.data === undefined) {
    if (!files.some((b) => b.kind === "loading")) {
      files.push({ kind: "loading" });
    }
    return { keep, files };
  }
  const fs = folderFs(folder, input.fileSystems.data);
  if (fs !== undefined && isSystemDrive(fs)) {
    files.push({ kind: "system" });
  } else if (
    statusView(folder.status).pill === "ok" &&
    (fs === undefined || fsState(fs, input.pending ?? []) !== "ok")
  ) {
    files.push({ kind: "fsNotMounted", fs });
  }
  if (isWholeFs(folder.reldirpath)) {
    files.push({ kind: "whole", fs });
  }
  const others = input.folders.data ?? [];
  const inside = others.find(
    (f) =>
      f.uuid !== folder.uuid &&
      f.mntentref === folder.mntentref &&
      isSameOrInside(folder.reldirpath, f.reldirpath),
  );
  if (inside !== undefined) {
    files.push({ kind: "inside", other: inside });
  }
  return { keep, files };
}

/** The modules a deletion leaves pending (observed on the test VM): R10's expected set (8.5). */
export const DELETE_MODULES = ["sharedfolders", "systemd", "task"] as const;
/** What a new folder, or a change to a folder or its access, leaves pending without an SMB share. */
export const FOLDER_MODULES = ["sharedfolders", "systemd"] as const;
/** What any SMB write leaves pending; also added to a folder change when the folder has a share. */
export const SMB_MODULES = ["samba", "avahi"] as const;

/** The modules a change to a folder (ShareMgmt.set, setPrivileges) leaves pending (observed). */
export const folderChangeModules = (hasShare: boolean): readonly string[] =>
  hasShare ? [...FOLDER_MODULES, ...SMB_MODULES] : FOLDER_MODULES;

/** The add flow's checkpoint (6.4 step 6, R10): what it expects to find pending. */
export const addFlowModules = (withShare: boolean): readonly string[] =>
  folderChangeModules(withShare);
