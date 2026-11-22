// SPDX-License-Identifier: GPL-3.0-or-later
// The Groups list (phase 5 users design 8): the whole getGroupList read joined with the shared folders'
// lists, then searched (name, description, member names), sorted (name, description, the two counts)
// and paged at 50 in the browser (D2). Pure, so every rule is tested by itself.
import type {
  SharedFolder,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { entriesOf } from "../sharedFolders/accessModel.ts";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export const naturalCompare = (a: string, b: string): number =>
  collator.compare(a, b);

export interface GroupListRow {
  name: string;
  comment: string;
  /** Its members, in natural order. */
  members: string[];
  /** Folders whose list gives the group Read and write or Read only; null when not known. */
  folders: number | null;
}

/** How many folders give the group access (an entry of Read and write or Read only). */
export function foldersOfGroup(
  name: string,
  folders: readonly SharedFolder[],
): number {
  return folders.filter((folder) =>
    entriesOf(folder.privileges).some(
      (e) =>
        e.type === "group" &&
        e.name === name &&
        (Number(e.perms) === 7 || Number(e.perms) === 5),
    ),
  ).length;
}

export function groupListRows(
  groups: readonly UserGroup[],
  folders: readonly SharedFolder[] | undefined,
): GroupListRow[] {
  return groups.map((g) => ({
    name: g.name,
    comment: g.comment ?? "",
    members: [...(g.members ?? [])].sort(naturalCompare),
    folders: folders === undefined ? null : foldersOfGroup(g.name, folders),
  }));
}

/** Matches the name, the description or a member's name, ignoring case. */
export function searchGroups(
  rows: readonly GroupListRow[],
  search: string,
): GroupListRow[] {
  const q = search.trim().toLocaleLowerCase();
  if (q === "") {
    return [...rows];
  }
  return rows.filter(
    (r) =>
      r.name.toLocaleLowerCase().includes(q) ||
      r.comment.toLocaleLowerCase().includes(q) ||
      r.members.some((m) => m.toLocaleLowerCase().includes(q)),
  );
}

export type GroupSortField = "name" | "comment" | "members" | "folders";
export interface GroupSort {
  field: GroupSortField;
  direction: "asc" | "desc";
}

export const INITIAL_GROUP_SORT: GroupSort = {
  field: "name",
  direction: "asc",
};

/** Sorted; ties (and unknown counts, last) fall back to the name. */
export function sortGroups(
  rows: readonly GroupListRow[],
  sort: GroupSort,
): GroupListRow[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const by = (a: GroupListRow, b: GroupListRow): number => {
    switch (sort.field) {
      case "name":
        return sign * naturalCompare(a.name, b.name);
      case "comment":
        return sign * naturalCompare(a.comment, b.comment);
      case "members":
        return sign * (a.members.length - b.members.length);
      case "folders":
        if (a.folders === null || b.folders === null) {
          return a.folders === b.folders ? 0 : a.folders === null ? 1 : -1;
        }
        return sign * (a.folders - b.folders);
    }
  };
  return [...rows].sort((a, b) => by(a, b) || naturalCompare(a.name, b.name));
}

export const nextGroupSort = (
  current: GroupSort,
  field: GroupSortField,
): GroupSort =>
  current.field === field
    ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
    : { field, direction: "asc" };

export const GROUP_PAGE_SIZES = [25, 50, 100] as const;
export const GROUP_PAGE_SIZE = 50;

/** The rows of one page, the page clamped to the last that exists. */
export function pageOfGroups<T>(
  rows: readonly T[],
  page: number,
  size: number,
): { rows: T[]; page: number; pageCount: number; from: number; to: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const shown = Math.min(Math.max(0, page), pageCount - 1);
  const start = shown * size;
  const slice = rows.slice(start, start + size);
  return {
    rows: slice,
    page: shown,
    pageCount,
    from: slice.length === 0 ? 0 : start + 1,
    to: start + slice.length,
  };
}

/** At most `max` names, and how many more (design 0.2, 8.2). */
export function namesUpTo(
  names: readonly string[],
  max: number,
): { shown: string[]; more: number } {
  return {
    shown: names.slice(0, max),
    more: Math.max(0, names.length - max),
  };
}
