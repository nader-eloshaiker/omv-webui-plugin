// SPDX-License-Identifier: GPL-3.0-or-later
// The shares slice's access model turned round (phase 5 users design 4.2, 9.5, 7.3, 11.2): for one
// person or group, one row per shared folder, with that account's entry in each folder's list, the
// group lines of the shares slice's 0.4, the whole list each changed folder sends back (every other
// entry kept, entries for accounts that no longer exist dropped, as the folder's own page does), the
// last-access refusal, and the folders a delete takes the account off. Pure.
import type {
  SharedFolder,
  SharedFolderPrivilegeEntry,
  SmbShareRow,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import {
  accessModel,
  allowedValues,
  anyoneHasAccess,
  entriesOf,
  groupLine,
  privilegesToSave,
  rowId,
  valueOf,
  type Access,
  type AccessKind,
  type AccessModel,
  type AccessRow,
  type GroupLine,
} from "../sharedFolders/accessModel.ts";
import { guestMode, shareOf } from "../sharedFolders/smbModel.ts";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export interface FolderRow {
  /** The folder's UUID: the grid's row id. */
  id: string;
  folder: SharedFolder;
  /** The folder's own access model, with the account as a row. */
  model: AccessModel;
  /** The account's row in that model. */
  row: AccessRow;
  /** Its SMB share, when it has one. */
  share: SmbShareRow | undefined;
}

/** Choices by folder UUID. */
export type FolderChoices = Readonly<Record<string, Access>>;

/**
 * One row per shared folder, in natural order of name. `users` and `groups` are the whole lists; for
 * the add flows, the account not yet made is added to them by the caller (with the groups chosen).
 */
export function accessByAccount(
  kind: AccessKind,
  name: string,
  folders: readonly SharedFolder[],
  users: readonly UserAccount[],
  groups: readonly UserGroup[],
  shares: readonly SmbShareRow[] = [],
): FolderRow[] {
  const id = rowId(kind, name);
  return [...folders]
    .sort((a, b) => collator.compare(a.name, b.name))
    .flatMap((folder) => {
      const model = accessModel(users, groups, folder.privileges);
      const row = model.rows.find((r) => r.id === id);
      return row === undefined
        ? []
        : [
            {
              id: folder.uuid,
              folder,
              model,
              row,
              share: shareOf(shares, folder.uuid),
            },
          ];
    });
}

const choicesFor = (
  r: FolderRow,
  choices: FolderChoices,
): Readonly<Record<string, Access>> => {
  const chosen = choices[r.id];
  return chosen === undefined ? {} : { [r.row.id]: chosen };
};

/** The row's value now: the reader's choice, else what the folder stores. */
export const folderValue = (r: FolderRow, choices: FolderChoices): Access =>
  valueOf(r.row, choicesFor(r, choices));

export const folderAllowed = (r: FolderRow): readonly Access[] =>
  allowedValues(r.row);

/** The person's group line in this folder (the shares slice's 0.4), with the grid's choice. */
export const personLine = (
  r: FolderRow,
  choices: FolderChoices,
): GroupLine | null => groupLine(r.row, r.model, choicesFor(r, choices));

/** For a group's row: how many of its members have an entry of their own in this folder (9.5). */
export function membersWithOwnEntry(r: FolderRow): number {
  if (r.row.kind !== "group") {
    return 0;
  }
  return r.model.rows.filter(
    (u) =>
      u.kind === "user" && u.groups.includes(r.row.name) && u.stored !== "none",
  ).length;
}

/** Whether guests can open the folder (its SMB share's guest access is on). */
export const guestsToo = (r: FolderRow): boolean =>
  r.share !== undefined && guestMode(r.share.guest) !== "no";

/** The folders whose value differs from what they store. */
export const changedFolders = (
  rows: readonly FolderRow[],
  choices: FolderChoices,
): FolderRow[] => rows.filter((r) => folderValue(r, choices) !== r.row.stored);

/** The whole list one folder sends back with the account's new value (0.11, D9). */
export const listToSave = (
  r: FolderRow,
  value: Access,
): SharedFolderPrivilegeEntry[] =>
  privilegesToSave(r.model, { [r.row.id]: value });

/**
 * The last-access refusal (0.10): the list would let nobody in while the folder is shared over SMB
 * with guest access off.
 */
export const leavesNobody = (
  share: SmbShareRow | undefined,
  list: readonly { perms: number }[],
): boolean =>
  share !== undefined &&
  guestMode(share.guest) === "no" &&
  !anyoneHasAccess(list);

/** A folder that lists the account, with the access it stores there (7.3, 11.2). */
export interface ListedIn {
  folder: SharedFolder;
  access: Access;
  share: SmbShareRow | undefined;
  /** The list without the account (and without stale entries, as the folder's page drops them). */
  without: SharedFolderPrivilegeEntry[];
  /** Taking the account off leaves nobody who can open it over SMB (said, not refused). */
  leavesNobody: boolean;
}

/**
 * The folders whose stored list names the account, in natural order, for the delete dialogs. It
 * reads the raw entries, so it also finds an account the lists no longer show (a person just deleted).
 */
export function foldersListing(
  kind: AccessKind,
  name: string,
  folders: readonly SharedFolder[],
  users: readonly UserAccount[],
  groups: readonly UserGroup[],
  shares: readonly SmbShareRow[] = [],
): ListedIn[] {
  return [...folders]
    .sort((a, b) => collator.compare(a.name, b.name))
    .flatMap((folder) => {
      const entry = entriesOf(folder.privileges).find(
        (e) => e.type === kind && e.name === name,
      );
      if (entry === undefined) {
        return [];
      }
      const others = {
        users: users.filter((u) => !(kind === "user" && u.name === name)),
        groups: groups.filter((g) => !(kind === "group" && g.name === name)),
      };
      const without = privilegesToSave(
        accessModel(others.users, others.groups, folder.privileges),
        {},
      );
      const share = shareOf(shares, folder.uuid);
      const perms = Number(entry.perms);
      return [
        {
          folder,
          access: perms === 7 ? "rw" : perms === 5 ? "ro" : "blocked",
          share,
          without,
          leavesNobody:
            anyoneHasAccess([entry]) && leavesNobody(share, without),
        } satisfies ListedIn,
      ];
    });
}
