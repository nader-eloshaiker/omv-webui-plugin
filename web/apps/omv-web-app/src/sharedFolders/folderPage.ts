// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's page's own small rules (phase 5 shares design 2.1, 2.3, 2.5, 2.8): where its file
// system's page is, whether "Used by" is shown and what it says, and whether the page holds unsaved
// work (the access grid's choices, the share form's values). Pure.
import type {
  ConfiguredFilesystem,
  SharedFolderPrivileges,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { fsAddress, isZfs } from "../filesystems/fsModel.ts";
import type { ServiceUse, ServiceUses } from "../services/folderUses.ts";
import { isFsAddress as isZfsFsAddress } from "../zfs/zfsModel.ts";
import type { Access } from "./accessModel.ts";
import { shareChoicesOf, type ShareChoices } from "./smbModel.ts";

/** Where a file system's page is: its ZFS page, its file-system page, or none (2.3). */
export function fsPage(
  fs: ConfiguredFilesystem,
): { kind: "zfs"; name: string } | { kind: "fs"; address: string } | null {
  if (isZfs(fs)) {
    return isZfsFsAddress(fs.devicefile)
      ? { kind: "zfs", name: fs.devicefile }
      : null;
  }
  const address = fsAddress(fs);
  return address === null ? null : { kind: "fs", address };
}

/** What "Used by" shows (0.7, 2.5; phase 5 users design 13.1; phase 5 services design 2.7). */
export type FolderUse =
  /** "Home folders of every person", with a link to the home-folders page. */
  | { kind: "home" }
  /**
   * The rsync server folder and copy jobs that use it, each with its link, and the home folders when
   * it holds them (services design 2.7). Its NFS entries have their own section and are not repeated.
   */
  | { kind: "named"; home: boolean; uses: readonly ServiceUse[] }
  /** "Used by an add-on's setting. Look in the classic interface." */
  | { kind: "other" }
  /** The share list could not be read: the retry form. */
  | { kind: "unread"; error: unknown };

/**
 * "Used by" is shown only when something besides its own SMB share and NFS entries uses the folder,
 * or when a read it rests on could not be read. OMV's `_used` is a yes-or-no (B10): with no share, NFS
 * entry, rsync server folder, copy job or home folders found, it is an add-on's setting. Null: not
 * shown. `services` is this slice's three reads (folderUses.ts); left out, only the shares slice's.
 */
export function folderUse(input: {
  used: boolean;
  /** It holds the home folders now (UserMgmt.getSettings; homeModel.holdsHomeFolders). */
  homeFolders?: boolean;
  /** The folder has an SMB share (section 4 shows it). */
  hasShare: boolean;
  shares: { ready: boolean; failed: boolean; error?: unknown };
  services?: ServiceUses;
}): FolderUse | null {
  const services = input.services;
  const uses = services?.kind === "read" ? services.uses : [];
  if (input.homeFolders === true && uses.length === 0) {
    return { kind: "home" };
  }
  if (uses.length > 0) {
    return { kind: "named", home: input.homeFolders === true, uses };
  }
  if (input.shares.failed) {
    return { kind: "unread", error: input.shares.error };
  }
  if (services?.kind === "unread") {
    return { kind: "unread", error: services.error };
  }
  if (!input.shares.ready || services?.kind === "loading") {
    return null;
  }
  const nfs = services?.kind === "read" && services.nfs.length > 0;
  return input.used && !input.hasShare && !nfs ? { kind: "other" } : null;
}

/** The reader's unsaved access: the choices, and the stored list they were made on (3.3, 0.10). */
export interface AccessDraft {
  choices: Readonly<Record<string, Access>>;
  /** Null while nothing is changed; then the grid follows the folder's row as read. */
  base: { privileges: SharedFolderPrivileges | undefined } | null;
}

export const NO_ACCESS_DRAFT: AccessDraft = { choices: {}, base: null };

/** The share form's values while it is open; null when it is closed. */
export type ShareDraft = ShareChoices | null;

/** Whether an open share form holds values the reader changed (2.1, 2.8). */
export function shareDraftChanged(
  draft: ShareDraft,
  share: SmbShareRow | undefined,
): boolean {
  if (draft === null) {
    return false;
  }
  const first = shareChoicesOf(share);
  return (
    draft.browseable !== first.browseable ||
    draft.readonly !== first.readonly ||
    draft.guest !== first.guest ||
    (draft.recycle !== undefined &&
      (draft.recycle.on !== first.recycle?.on ||
        (draft.recycle.on && draft.recycle.days !== first.recycle?.days)))
  );
}

/** The page holds work the reader would lose on Refresh or on leaving (2.8). */
export const holdsUnsaved = (
  access: AccessDraft,
  share: ShareDraft,
  shareRow: SmbShareRow | undefined,
): boolean =>
  Object.keys(access.choices).length > 0 || shareDraftChanged(share, shareRow);
