// SPDX-License-Identifier: GPL-3.0-or-later
// Windows and Mac sharing (SMB) for the shares pages (phase 5 shares design 0.3, 0.10, 4.2): the
// service's state, one folder's share, the read-modify-write bodies of SMB.setShare and
// SMB.setSettings, the network addresses, and the 15-character name rule. Pure.
//
// Read from OMV's source and observed on the test VM (journal, 2026-11-22):
// - Services.getStatus names the SMB row `samba`;
// - SMB.setShare builds a fresh object from what is sent, so a share read from getShareList goes back
//   whole, without `sharedfoldername` (OMV refuses the body with it, HTTP 500), with only the fields
//   this interface changes; a new share gets the classic form's defaults (D5);
// - SMB.setSettings with the whole getSettings reply keeps every field; only `enable` changes;
// - turning SMB on is refused while the NAS's name is longer than 15 characters. OMV checks the DNS
//   setting's host name, which is the short name; System.getInformation's `hostname` is
//   `hostname --fqdn`, so the rule here measures the part before the first dot.
// The address shows the name exactly as the shell shows it (System.getInformation's `hostname`), so
// with a domain set it is the full name, which a computer finds through DNS; the page's hint covers a
// computer that cannot find it (2.3).
import type {
  ServiceStatus,
  SmbSetSettingsRequest,
  SmbSetShareRequest,
  SmbSettings,
  SmbShare,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";

/** The SMB row's name in Services.getStatus (observed). */
export const SMB_SERVICE = "samba";
/** The pending module that holds SMB's settings and shares. */
export const SMB_MODULE = "samba";
/** OMV's placeholder UUID that asks a set method to create an object (rpc datamodels). */
export const NEW_OBJECT_UUID = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
/** OMV's limit on the NAS's name with SMB on. */
export const SMB_HOST_MAX = 15;

// ---- Windows and Mac sharing, for the whole NAS (0.3) ---------------------------------------------

export type SmbState =
  /** A read is still on its way. */
  | { kind: "loading" }
  /** SMB.getSettings or Services.getStatus failed, or the status has no SMB row: "Unknown". */
  | { kind: "unread"; error: unknown }
  /** `enable` false: the Disabled pill, "Off. No folder can be reached…". */
  | { kind: "off" }
  /** `enable` true and running: OK, "On." */
  | { kind: "on" }
  /** `enable` true, not running, `samba` not pending: Critical, with the service details link. */
  | { kind: "down" }
  /** `enable` true, not running, `samba` pending: no pill, "Turned on. It starts when…". */
  | { kind: "pendingOn" };

export interface Read<T> {
  data: T | undefined;
  /** The read failed (and has no data to show). */
  failed: boolean;
  error?: unknown;
}

/** The SMB row of Services.getStatus, when the list has one. */
export const smbServiceRow = (
  rows: readonly ServiceStatus[] | undefined,
): ServiceStatus | undefined => rows?.find((r) => r.name === SMB_SERVICE);

/**
 * The state of Windows and Mac sharing (0.3), from SMB.getSettings (`enable`), Services.getStatus's
 * `samba` row (`running`) and the pending modules. A failed read says nothing either way: Unknown.
 */
export function smbState(
  settings: Read<Pick<SmbSettings, "enable">>,
  services: Read<readonly ServiceStatus[]>,
  pending: readonly string[],
): SmbState {
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
  const row = smbServiceRow(services.data);
  if (row === undefined) {
    return { kind: "unread", error: undefined };
  }
  if (row.running) {
    return { kind: "on" };
  }
  return pending.includes(SMB_MODULE)
    ? { kind: "pendingOn" }
    : { kind: "down" };
}

/** Whether SMB is on for the NAS as far as the settings say (the share's words, 0.3). */
export const smbOn = (state: SmbState): boolean | undefined =>
  state.kind === "loading" || state.kind === "unread"
    ? undefined
    : state.kind !== "off";

// ---- One folder's share (0.3, 4.2) ----------------------------------------------------------------

/** A folder's SMB share: the row whose `sharedfolderref` is the folder's `uuid` (OMV allows one). */
export const shareOf = (
  shares: readonly SmbShareRow[],
  folderUuid: string,
): SmbShareRow | undefined =>
  shares.find((s) => s.sharedfolderref === folderUuid);

export type FolderShareState =
  /** "Not shared with Windows and Mac computers." */
  | { kind: "notShared" }
  /** "Shared with Windows and Mac computers as {{address}}." */
  | { kind: "shared"; share: SmbShareRow }
  /** "Set up for Windows and Mac computers, but Windows and Mac sharing is off." */
  | { kind: "smbOff"; share: SmbShareRow }
  /** "Set up for Windows and Mac computers, but turned off for this folder." */
  | { kind: "disabled"; share: SmbShareRow };

/**
 * One folder's share as 0.3 says it. `on` is whether SMB is on for the NAS (smbOn); while that is
 * not known, an enabled share reads as shared, and the page shows the service's own state beside it.
 * The pending mark ("Not applied yet.") is the session's, beside this (sharesSession).
 */
export function folderShareState(
  share: SmbShareRow | undefined,
  on: boolean | undefined,
): FolderShareState {
  if (share === undefined) {
    return { kind: "notShared" };
  }
  if (!share.enable) {
    return { kind: "disabled", share };
  }
  return on === false ? { kind: "smbOff", share } : { kind: "shared", share };
}

/** The guest choice as stored: "no", "allow", or "only" (set in the classic interface). */
export type GuestMode = "no" | "allow" | "only";

/** A stored `guest` as one of the three; anything a later OMV may add reads as "only" (most open). */
export const guestMode = (guest: string): GuestMode =>
  guest === "no" ? "no" : guest === "allow" ? "allow" : "only";

/** The list's Sharing column (1.3): its words, and "Guests too" when guest access is on. */
export type SharingCell =
  | { kind: "none" }
  | { kind: "unknown" }
  | { kind: "smb"; guests: boolean }
  | { kind: "smbOff"; guests: boolean };

/**
 * One row's Sharing cell: "Windows and Mac" when its share is enabled and SMB is on; "Windows and Mac
 * (off)" when the share or SMB is off; nothing when not shared; "Not known" when getShareList failed
 * (design 18 #7: it fails outright when a share names a folder whose record is gone). While SMB's own
 * state is not known, an enabled share reads as on.
 */
export function sharingCell(
  folderUuid: string,
  shares: Read<readonly SmbShareRow[]>,
  on: boolean | undefined,
): SharingCell {
  if (shares.failed) {
    return { kind: "unknown" };
  }
  if (shares.data === undefined) {
    return { kind: "none" };
  }
  const share = shareOf(shares.data, folderUuid);
  if (share === undefined) {
    return { kind: "none" };
  }
  const guests = guestMode(share.guest) !== "no";
  return share.enable && on !== false
    ? { kind: "smb", guests }
    : { kind: "smbOff", guests };
}

// ---- Writing settings back (0.10) ---------------------------------------------------------------

/** The three choices the share form offers (4.3), and whether the share is on for this folder. */
export interface ShareChoices {
  browseable: boolean;
  readonly: boolean;
  /** "allow" when ticked. "only" is kept only while the reader leaves the box as it was (P9). */
  guest: GuestMode;
  /**
   * The recycle bin (services design 11.3), on the folder's share form; left out where it is not
   * asked (the add flow), so the share keeps what it holds, or a new one gets none.
   */
  recycle?: RecycleChoice;
}

/** The share form's recycle bin: on or off, and the days as typed (11.3). */
export interface RecycleChoice {
  on: boolean;
  /** The days to keep files, as typed in the number field; checked by recycleDaysOf. */
  days: string;
}

/** A recycle bin turned on where it was off keeps files 30 days (D13). */
export const NEW_RECYCLE_DAYS = 30;
/** The days the form accepts (11.3). */
export const RECYCLE_DAYS_MAX = 3650;

/** The form's first values: a new share's defaults, or what the share holds now. */
export function shareChoicesOf(share: SmbShareRow | undefined): ShareChoices {
  if (share === undefined) {
    return {
      browseable: true,
      readonly: false,
      guest: "no",
      recycle: { on: false, days: String(NEW_RECYCLE_DAYS) },
    };
  }
  return {
    browseable: share.browseable,
    readonly: share.readonly,
    guest: guestMode(share.guest),
    recycle: recycleChoiceOf(share),
  };
}

/** A stored share's recycle bin as the form opens it: the stored days, or 30 for a bin that was off. */
export function recycleChoiceOf(
  share: Pick<SmbShare, "recyclebin" | "recyclemaxage">,
): RecycleChoice {
  return share.recyclebin === true
    ? { on: true, days: String(share.recyclemaxage ?? 0) }
    : { on: false, days: String(NEW_RECYCLE_DAYS) };
}

/** The days typed, as a whole number from 0 to 3650; null when it is not one (11.3's error). */
export function recycleDaysOf(days: string): number | null {
  const text = days.trim();
  if (!/^[0-9]{1,4}$/u.test(text)) {
    return null;
  }
  const value = Number(text);
  return value <= RECYCLE_DAYS_MAX ? value : null;
}

/** Whether the form's recycle bin is ready to save: off, or on with valid days. */
export const recycleValid = (recycle: RecycleChoice | undefined): boolean =>
  recycle === undefined || !recycle.on || recycleDaysOf(recycle.days) !== null;

/** The recycle bin as 0.3 says it on the folder's facts. */
export type RecycleView =
  { kind: "off" } | { kind: "days"; days: number } | { kind: "forever" };

export function recycleView(
  share: Pick<SmbShare, "recyclebin" | "recyclemaxage">,
): RecycleView {
  if (share.recyclebin !== true) {
    return { kind: "off" };
  }
  const days = share.recyclemaxage ?? 0;
  return days === 0 ? { kind: "forever" } : { kind: "days", days };
}

/** The request fields for the recycle bin: only what the form changes (11.3, 0.11). */
function recycleFields(
  recycle: RecycleChoice | undefined,
  stored: Pick<SmbShare, "recyclemaxage"> | undefined,
): Partial<SmbSetShareRequest> {
  if (recycle === undefined) {
    return {};
  }
  if (!recycle.on) {
    // Off: the stored days are kept for when it is turned on again.
    return { recyclebin: false };
  }
  const days = recycleDaysOf(recycle.days);
  return {
    recyclebin: true,
    recyclemaxage: days ?? stored?.recyclemaxage ?? NEW_RECYCLE_DAYS,
  };
}

/**
 * The classic form's defaults for every option this interface does not ask (D5, 0.10): enabled, not
 * read only, shown in the network list, guest access off, no recycle bin, hide dot files on, inherit
 * ACLs and permissions off, extended attributes on, DOS attributes off, no hosts allow or deny, no
 * audit, no Time Machine, no extra options, follow symbolic links on, wide links off, macOS
 * compatibility and transport encryption off.
 */
export const NEW_SHARE_DEFAULTS = {
  enable: true,
  comment: "",
  guest: "no",
  readonly: false,
  browseable: true,
  recyclebin: false,
  recyclemaxsize: 0,
  recyclemaxage: 0,
  hidedotfiles: true,
  inheritacls: false,
  inheritpermissions: false,
  easupport: true,
  storedosattributes: false,
  hostsallow: "",
  hostsdeny: "",
  audit: false,
  timemachine: false,
  extraoptions: "",
  followsymlinks: true,
  widelinks: false,
  macoscompat: false,
  transportencryption: false,
} as const satisfies Omit<SmbSetShareRequest, "uuid" | "sharedfolderref">;

/** SMB.setShare for a folder that has no share: the new-object marker, the defaults, the choices. */
export function newShareRequest(
  folderUuid: string,
  choices: ShareChoices,
): SmbSetShareRequest {
  return {
    ...NEW_SHARE_DEFAULTS,
    uuid: NEW_OBJECT_UUID,
    sharedfolderref: folderUuid,
    browseable: choices.browseable,
    readonly: choices.readonly,
    guest: choices.guest,
    ...recycleFields(choices.recycle, undefined),
  };
}

/**
 * SMB.setShare for an existing share: the share as just read with SMB.getShare (services design 0.11,
 * D12), or a row of getShareList without `sharedfoldername` (refused by OMV), with only `enable`,
 * `browseable`, `readonly`, `guest` and the recycle bin changed; every other option keeps its value
 * (D6), the recycle bin's size limit too. The share's fields the contract does not name are dropped by
 * nothing here: the share is sent as read.
 */
export function changedShareRequest(
  row: SmbShare | SmbShareRow,
  change: Partial<ShareChoices> & { enable?: boolean },
): SmbSetShareRequest {
  const { sharedfoldername: _computed, ...stored } = row as SmbShareRow;
  return {
    ...NEW_SHARE_DEFAULTS,
    ...stored,
    comment: stored.comment ?? "",
    guest: change.guest ?? guestMode(stored.guest),
    ...(change.enable === undefined ? {} : { enable: change.enable }),
    ...(change.browseable === undefined
      ? {}
      : { browseable: change.browseable }),
    ...(change.readonly === undefined ? {} : { readonly: change.readonly }),
    ...recycleFields(change.recycle, stored),
  } as SmbSetShareRequest;
}

/**
 * The options this page does not offer, compared with D5's defaults (4.2's "Other options"): true when
 * any of them was set in the classic interface. A field the share does not hold is taken as default.
 */
export function otherOptionsDiffer(share: SmbShareRow): boolean {
  const fields = [
    "comment",
    // The recycle bin and its days are this page's (services design 11.3); its size limit is not.
    "recyclemaxsize",
    "hidedotfiles",
    "inheritacls",
    "inheritpermissions",
    "easupport",
    "storedosattributes",
    "hostsallow",
    "hostsdeny",
    "audit",
    "timemachine",
    "extraoptions",
    "followsymlinks",
    "widelinks",
    "macoscompat",
    "transportencryption",
  ] as const;
  const held = share as Partial<Record<(typeof fields)[number], unknown>>;
  if (
    fields.some(
      (f) => held[f] !== undefined && held[f] !== NEW_SHARE_DEFAULTS[f],
    )
  ) {
    return true;
  }
  // Not in D5's list, and empty unless Time Machine has a limit.
  return (share.timemachinemaxsize ?? "") !== "";
}

/**
 * SMB.setSettings: the whole getSettings reply as just read, with only `enable` changed (0.10). The
 * reply's fields are sent as read; OMV keeps the stored ones the method's datamodel does not name.
 */
export function settingsRequest(
  settings: SmbSettings,
  enable: boolean,
): SmbSetSettingsRequest {
  return { ...settings, enable } as SmbSetSettingsRequest;
}

// ---- The workgroup (services design 11.2) --------------------------------------------------------

/**
 * OMV's NetBIOS-name rule for the workgroup (read from source, observed refused on the test VM): 1 to
 * 15 of letters, digits, spaces and ! # $ % & ' ( ) - . @ ^ _ { } ~.
 */
export const WORKGROUP = /^[A-Za-z0-9 !#$%&'()\-.@^_{}~]{1,15}$/u;

export const workgroupValid = (workgroup: string): boolean =>
  WORKGROUP.test(workgroup);

/** SMB.setSettings: the whole getSettings reply as just read, with only `workgroup` changed (0.11). */
export function workgroupRequest(
  settings: SmbSettings,
  workgroup: string,
): SmbSetSettingsRequest {
  return { ...settings, workgroup } as SmbSetSettingsRequest;
}

// ---- The NAS's name and the addresses (0.2, 4.4) ---------------------------------------------------

/** The short host name, as OMV's DNS setting holds it: the part before the first dot. */
export const shortHostName = (hostname: string): string =>
  hostname.split(".")[0] ?? hostname;

/**
 * Whether SMB can be turned on with this name (4.4): OMV refuses a short name longer than 15
 * characters (it measures bytes; host names are plain ASCII). `length` is what the message says.
 */
export function hostRule(hostname: string): {
  ok: boolean;
  length: number;
  host: string;
} {
  const host = shortHostName(hostname);
  const length = new TextEncoder().encode(host).length;
  return { ok: length <= SMB_HOST_MAX, length, host };
}

export interface ShareAddresses {
  /** `\\host\name`, for Windows. */
  windows: string;
  /** `smb://host/name` with the name percent-encoded, for a Mac. */
  mac: string;
}

/**
 * A share's network addresses (0.2, D4), built from the NAS's name as the shell shows it and the
 * shared folder's name (which is the share's name on the network). Text to copy, never a link (UI-3).
 */
export function shareAddresses(
  hostname: string,
  folder: string,
): ShareAddresses {
  return {
    windows: `\\\\${hostname}\\${folder}`,
    mac: `smb://${hostname}/${encodeURIComponent(folder)}`,
  };
}

// ---- Emptying a recycle bin (services design 11.4) -----------------------------------------------

/** Why "Empty the recycle bin…" is unavailable now, the first that applies; null when it may start. */
export type EmptyBlocker =
  /** "Apply the pending changes first." (OMV refuses while `samba` is pending.) */
  | "pending"
  /** The recycle bin this session saved is not applied yet. */
  | "notApplied"
  /** "Windows and Mac sharing is off, so the NAS cannot empty it now." */
  | "smbOff"
  /** An emptying of it runs in this session. */
  | "running"
  /** A read the rule needs failed or has not arrived. */
  | "unread";

export function emptyBlocker(input: {
  /** The pending modules; undefined while not read. */
  pending: readonly string[] | undefined;
  /** Windows and Mac sharing is on for the NAS; undefined while not known. */
  smbOn: boolean | undefined;
  /** This session saved the folder's sharing since the last apply. */
  savedHere: boolean;
  /** An emptying of this share runs in this session. */
  running: boolean;
}): EmptyBlocker | null {
  if (input.running) {
    return "running";
  }
  if (input.pending === undefined || input.smbOn === undefined) {
    return "unread";
  }
  if (input.pending.includes(SMB_MODULE)) {
    return input.savedHere ? "notApplied" : "pending";
  }
  return input.smbOn ? null : "smbOff";
}

/**
 * Whether an emptying deleted anything: its output lists each file and folder removed ("removed '…'",
 * "removed directory '…'", observed on the test VM). An empty bin, or one the NAS was emptying already,
 * prints only the script's own "Please wait…" line, or nothing.
 */
export const recycleRemovedSomething = (output: string): boolean =>
  /^removed /mu.test(output);
