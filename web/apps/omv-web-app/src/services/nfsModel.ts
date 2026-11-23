// SPDX-License-Identifier: GPL-3.0-or-later
// Linux and Unix sharing (NFS) for the NFS page and a shared folder's page (phase 5 services design
// 0.3, 0.4, 0.5, 0.10, 0.11, 1, 2): the service's state, a folder's entries, who each entry lets in,
// what its options mean, the interface's own refusals, the read-modify-write bodies of NFS.setShare
// and NFS.setSettings, and the NFS address. Pure.
//
// Read from OMV's source (8.6.x) and captured on the test VM:
// - Services.getStatus names the NFS row `nfs`; the pending module is `nfs` too;
// - several entries may name one folder, one computer or network each; OMV writes them as one line;
// - NFS.setShare, new, refuses a folder whose path on the disk has a blank, ignores the `mntentref`
//   sent and uses the folder's place under /export; existing entries are replaced whole by what is
//   sent, so a change sends the object read just before with only `client` or `options` changed;
// - an empty `extraoptions` is refused, so an entry always has some; new entries get the classic
//   form's `subtree_check,insecure` (D6);
// - NFS.setSettings takes `enable` and `versions`, both required.
import type {
  NfsSetSettingsRequest,
  NfsSetShareRequest,
  NfsSettings,
  NfsShare,
  NfsShareRow,
  ServiceStatus,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import {
  checkClient,
  classifyStored,
  sameClient,
  type ClientProblem,
  type ClientValue,
  type StoredClient,
} from "./clientRules.ts";

/** The NFS row's name in Services.getStatus (observed). */
export const NFS_SERVICE = "nfs";
/** The pending module that holds NFS's settings and entries. */
export const NFS_MODULE = "nfs";
/** OMV's placeholder UUID that asks a set method to create an object (rpc datamodels). */
export const NEW_OBJECT_UUID = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
/** The classic form's other options for a new entry (0.5, D6). */
export const DEFAULT_EXTRA_OPTIONS = "subtree_check,insecure";
/** The option that hands the other computer's administrator this NAS's administrator power (0.5). */
export const ROOT_OPTION = "no_root_squash";

// ---- Linux and Unix sharing, for the whole NAS (0.3) ----------------------------------------------

export type NfsState =
  /** A read is still on its way. */
  | { kind: "loading" }
  /** NFS.getSettings or Services.getStatus failed, or the status has no NFS row: "Unknown". */
  | { kind: "unread"; error: unknown }
  /** `enable` false: the Disabled pill, "Off. No folder can be reached over NFS." */
  | { kind: "off" }
  /** `enable` true and running: OK, "On." */
  | { kind: "on" }
  /** `enable` true, not running, `nfs` not pending: Critical, with the service details link. */
  | { kind: "down" }
  /** `enable` true, not running, `nfs` pending: no pill, "Turned on. It starts when…". */
  | { kind: "pendingOn" };

export interface Read<T> {
  data: T | undefined;
  /** The read failed (and has no data to show). */
  failed: boolean;
  error?: unknown;
}

/** The NFS row of Services.getStatus, when the list has one. */
export const nfsServiceRow = (
  rows: readonly ServiceStatus[] | undefined,
): ServiceStatus | undefined => rows?.find((r) => r.name === NFS_SERVICE);

/**
 * The state of Linux and Unix sharing (0.3), from NFS.getSettings (`enable`), Services.getStatus's
 * `nfs` row (`running`) and the pending modules. A failed read says nothing either way: Unknown.
 */
export function nfsState(
  settings: Read<Pick<NfsSettings, "enable">>,
  services: Read<readonly ServiceStatus[]>,
  pending: readonly string[],
): NfsState {
  if (settings.failed) {
    return { kind: "unread", error: settings.error };
  }
  if (services.failed) {
    return { kind: "unread", error: services.error };
  }
  if (settings.data === undefined) {
    return { kind: "loading" };
  }
  if (!settings.data.enable) {
    return { kind: "off" };
  }
  if (services.data === undefined) {
    return { kind: "loading" };
  }
  const row = nfsServiceRow(services.data);
  if (row === undefined) {
    return { kind: "unread", error: undefined };
  }
  if (row.running) {
    return { kind: "on" };
  }
  return pending.includes(NFS_MODULE)
    ? { kind: "pendingOn" }
    : { kind: "down" };
}

/** Whether an NFS version is chosen: with none, NFS cannot be turned on (0.10). */
export const hasVersions = (settings: Pick<NfsSettings, "versions">): boolean =>
  settings.versions.length > 0;

/** Whether an NFSv4 version is offered, so the NFSv4 address applies too (0.2). */
export const offersV4 = (versions: readonly string[]): boolean =>
  versions.some((v) => v === "4" || v.startsWith("4."));

/** "NFSv3, NFSv4, NFSv4.1, NFSv4.2": the versions as received (1.2 item 4). */
export const versionsText = (versions: readonly string[]): string =>
  versions.map((v) => `NFSv${v}`).join(", ");

/**
 * NFS.setSettings: `enable` and `versions` exactly as NFS.getSettings returned them, with only
 * `enable` changed (0.11). The versions are sent as read; the contract allows only OMV's spellings.
 */
export function settingsRequest(
  settings: Pick<NfsSettings, "versions">,
  enable: boolean,
): NfsSetSettingsRequest {
  return {
    enable,
    versions: [...settings.versions] as NfsSetSettingsRequest["versions"],
  };
}

// ---- A folder's entries (0.3, 2.2) ----------------------------------------------------------------

/** A folder's NFS entries: the rows whose `sharedfolderref` is the folder's `uuid`, in OMV's order. */
export const entriesOf = <T extends Pick<NfsShare, "sharedfolderref">>(
  shares: readonly T[],
  folderUuid: string,
): T[] => shares.filter((s) => s.sharedfolderref === folderUuid);

/** The entries grouped by folder, in the order each folder first appears (1.2 item 5). */
export function entriesByFolder(
  shares: readonly NfsShareRow[],
): { folderUuid: string; entries: NfsShareRow[] }[] {
  const groups = new Map<string, NfsShareRow[]>();
  for (const share of shares) {
    const group = groups.get(share.sharedfolderref);
    if (group === undefined) {
      groups.set(share.sharedfolderref, [share]);
    } else {
      group.push(share);
    }
  }
  return [...groups].map(([folderUuid, entries]) => ({ folderUuid, entries }));
}

/** Who an entry lets in, as stored (0.4): an empty value is any computer, as OMV writes it. */
export const entryClient = (share: Pick<NfsShare, "client">): StoredClient =>
  classifyStored(share.client, "any");

/** An entry's access: Read only, Read and write, or what was stored in the classic interface. */
export type EntryAccess =
  { kind: "ro" } | { kind: "rw" } | { kind: "classic"; value: string };

export function entryAccess(share: Pick<NfsShare, "options">): EntryAccess {
  const value = share.options.trim();
  return value === "ro" || value === "rw"
    ? { kind: value }
    : { kind: "classic", value: share.options };
}

/** The items of an entry's other NFS options, as stored (comma-separated). */
export const optionItems = (extraoptions: string | undefined): string[] =>
  (extraoptions ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

/** The option that lets the other computer's administrator act as this NAS's (0.5), when present. */
export const givesRoot = (share: Pick<NfsShare, "extraoptions">): boolean =>
  optionItems(share.extraoptions).includes(ROOT_OPTION);

/**
 * Whether an entry's other options differ from the classic default (0.5): any item that is not one
 * of `subtree_check` and `insecure`, or one of them missing, in any order. An entry with none at all
 * shows nothing (OMV refuses to store none; nothing would be shown for it).
 */
export function otherOptionsDiffer(
  share: Pick<NfsShare, "extraoptions">,
): boolean {
  const items = optionItems(share.extraoptions);
  if (items.length === 0) {
    return false;
  }
  const defaults = optionItems(DEFAULT_EXTRA_OPTIONS);
  const unique = new Set(items);
  return (
    unique.size !== defaults.length || defaults.some((d) => !unique.has(d))
  );
}

// ---- The NFS address (0.2) -------------------------------------------------------------------------

export interface NfsAddress {
  /** "v3": the export path, for every version; "v4": the path under the NFSv4 root. */
  kind: "export" | "v4";
  text: string;
}

/**
 * A folder's NFS addresses, built from the NAS's name as the shell shows it and the folder's name:
 * `NAS_HOST:/export/{{folder}}`, and `NAS_HOST:/{{folder}}` labelled NFSv4 when an NFSv4 version is
 * offered (D9; [verify] on the VM which form each version mounts). Text to copy, never a link (UI-3).
 */
export function nfsAddresses(
  hostname: string,
  folder: string,
  versions: readonly string[],
): NfsAddress[] {
  const all: NfsAddress[] = [
    { kind: "export", text: `${hostname}:/export/${folder}` },
  ];
  if (offersV4(versions)) {
    all.push({ kind: "v4", text: `${hostname}:/${folder}` });
  }
  return all;
}

// ---- The interface's own refusals (0.10) -------------------------------------------------------------

/** Why a folder cannot be shared over NFS here (0.10, 2.1, 1.4). */
export type FolderRefusal =
  /** Its name has a space: it would be written into the server's configuration as it is. */
  | "nameSpace"
  /** Its folder on the disk has a space: OMV refuses it. */
  | "pathSpace"
  /** It is not OK (the shares slice's 0.3). */
  | "notOk";

const SPACE = /\s/u;

/** The first refusal that applies to a folder, or null. `ok` is whether the folder is OK (0.3). */
export function folderRefusal(
  folder: Pick<SharedFolder, "name" | "reldirpath">,
  ok: boolean,
): FolderRefusal | null {
  if (SPACE.test(folder.name)) {
    return "nameSpace";
  }
  if (SPACE.test(folder.reldirpath)) {
    return "pathSpace";
  }
  return ok ? null : "notOk";
}

/** Why saving an entry is refused (0.10, 2.3), checked before the call and again just before it. */
export type EntryRefusal =
  | { kind: "client"; problem: ClientProblem }
  | { kind: "folder"; refusal: FolderRefusal }
  /** That computer or network is already let in to this folder. */
  | { kind: "duplicate"; client: string }
  /** NFS is off and no version is chosen, so saving could not turn it on. */
  | { kind: "noVersions" }
  /** The folder is gone from the list. */
  | { kind: "gone" };

/**
 * The checks of 2.3 against the lists just read: the folder still there and OK, who may connect
 * valid, that computer or network not already let in by another entry of the folder (compared
 * without case, networks by start and prefix), and a version chosen when saving turns NFS on.
 * `exceptUuid` is the entry being changed. The client to send on success.
 */
export function entryRefusal(input: {
  folderUuid: string;
  folders: readonly SharedFolder[];
  /** Whether the folder is OK as its page reads it (its file system too); its status must be OK. */
  ok?: boolean;
  shares: readonly NfsShare[];
  settings: Pick<NfsSettings, "enable" | "versions">;
  value: ClientValue;
  exceptUuid?: string;
}): { refusal: EntryRefusal } | { client: string } {
  const folder = input.folders.find((f) => f.uuid === input.folderUuid);
  if (folder === undefined) {
    return { refusal: { kind: "gone" } };
  }
  const refused = folderRefusal(
    folder,
    (input.ok ?? true) && folder.status === "OK",
  );
  if (refused !== null) {
    return { refusal: { kind: "folder", refusal: refused } };
  }
  const check = checkClient(input.value);
  if (!check.ok) {
    return { refusal: { kind: "client", problem: check.problem } };
  }
  const duplicate = entriesOf(input.shares, input.folderUuid).find(
    (s) => s.uuid !== input.exceptUuid && sameClient(s.client, check.client),
  );
  if (duplicate !== undefined) {
    return { refusal: { kind: "duplicate", client: duplicate.client } };
  }
  if (!input.settings.enable && !hasVersions(input.settings)) {
    return { refusal: { kind: "noVersions" } };
  }
  return { client: check.client };
}

// ---- Writing back (0.11) -------------------------------------------------------------------------

/** Read only or Read and write: the two access choices the form offers (2.3). */
export type AccessChoice = "ro" | "rw";

/** NFS.setShare for a new entry: the new-object marker twice, the classic options, no comment. */
export function newShareRequest(
  folderUuid: string,
  client: string,
  options: AccessChoice,
): NfsSetShareRequest {
  return {
    uuid: NEW_OBJECT_UUID,
    sharedfolderref: folderUuid,
    // OMV requires it and replaces it with the folder's place under /export (read from source).
    mntentref: NEW_OBJECT_UUID,
    client,
    options,
    extraoptions: DEFAULT_EXTRA_OPTIONS,
    comment: "",
  };
}

/**
 * NFS.setShare for an existing entry: the object from NFS.getShare, with only `client` or
 * `options` changed; `mntentref`, `sharedfolderref`, `extraoptions` and `comment` as read. A row of
 * the list goes back without its computed `sharedfoldername`.
 */
export function changedShareRequest(
  share: NfsShare,
  change: { client?: string; options?: AccessChoice },
): NfsSetShareRequest {
  return {
    uuid: share.uuid,
    sharedfolderref: share.sharedfolderref,
    mntentref: share.mntentref,
    client: change.client ?? share.client,
    options: (change.options ?? share.options) as AccessChoice,
    extraoptions: share.extraoptions ?? "",
    comment: share.comment ?? "",
  };
}

// ---- The Shared folders list's Sharing column (12.1) ------------------------------------------------

/** "Linux and Unix (NFS)" for a folder with an entry; "Not known" when the read failed. */
export type NfsSharingCell = "none" | "nfs" | "unknown";

export function nfsSharingCell(
  folderUuid: string,
  shares: Read<readonly NfsShare[]>,
): NfsSharingCell {
  if (shares.failed) {
    return "unknown";
  }
  if (shares.data === undefined) {
    return "none";
  }
  return shares.data.some((s) => s.sharedfolderref === folderUuid)
    ? "nfs"
    : "none";
}

/** At most this many folders are named in the turn-off confirmation (1.3). */
export const NAMED_FOLDERS = 5;

/** The folders the turn-off confirmation names (1.3): each shared folder once, in OMV's order. */
export function sharedFolderNames(shares: readonly NfsShareRow[]): {
  names: string[];
  more: number;
  count: number;
} {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const share of shares) {
    if (!seen.has(share.sharedfolderref)) {
      seen.add(share.sharedfolderref);
      names.push(share.sharedfoldername);
    }
  }
  const shown = names.slice(0, NAMED_FOLDERS);
  return {
    names: shown,
    more: names.length - shown.length,
    count: names.length,
  };
}
