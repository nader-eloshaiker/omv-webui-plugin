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

/** What "Used by" shows (0.7, 2.5). */
export type FolderUse =
  /** "Used by a setting this page does not show…" */
  | { kind: "other" }
  /** The share list could not be read: the retry form. */
  | { kind: "unread"; error: unknown };

/**
 * "Used by" is shown only when something besides its own SMB share uses the folder (OMV's `_used` is a
 * yes-or-no, B10: with a share it cannot say more), or when the share list could not be read. Null:
 * not shown.
 */
export function folderUse(input: {
  used: boolean;
  /** The folder has an SMB share (section 4 shows it). */
  hasShare: boolean;
  shares: { ready: boolean; failed: boolean; error?: unknown };
}): FolderUse | null {
  if (input.shares.failed) {
    return { kind: "unread", error: input.shares.error };
  }
  if (!input.shares.ready) {
    return null;
  }
  return input.used && !input.hasShare ? { kind: "other" } : null;
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
    draft.guest !== first.guest
  );
}

/** The page holds work the reader would lose on Refresh or on leaving (2.8). */
export const holdsUnsaved = (
  access: AccessDraft,
  share: ShareDraft,
  shareRow: SmbShareRow | undefined,
): boolean =>
  Object.keys(access.choices).length > 0 || shareDraftChanged(share, shareRow);
