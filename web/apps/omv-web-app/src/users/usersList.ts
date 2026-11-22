// SPDX-License-Identifier: GPL-3.0-or-later
// The Users list (phase 5 users design 1): read whole (OMV builds every row on every call, D2), then
// searched, filtered, sorted and paged in the browser; the "Who can control this NAS" lines; the
// Groups column; 0.2's rule for names in a sentence. Pure, so every rule is tested by itself.
import type {
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import {
  isAdministrator,
  omvGroupsOf,
  otherSystemGroups,
  sshAllowed,
} from "./userModel.ts";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
/** Natural order of name; names equal but for case keep a fixed order. */
export const byName = (a: string, b: string): number =>
  collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

/** The "Show" filter (1.2). */
export type UsersShow = "all" | "admins" | "ssh" | "systemGroups";
export const USERS_SHOW: readonly UsersShow[] = [
  "all",
  "admins",
  "ssh",
  "systemGroups",
];

/** The sortable columns (1.3). Groups is not sortable. */
export type UsersSortField = "name" | "description" | "email" | "admin" | "ssh";
export interface UsersSort {
  field: UsersSortField;
  direction: "asc" | "desc";
}
export const DEFAULT_USERS_SORT: UsersSort = {
  field: "name",
  direction: "asc",
};

/** Above this many rows the list pages; the page size it opens with (1.2). */
export const USERS_PAGE_SIZE = 50;
export const USERS_PAGE_SIZES = [25, 50, 100] as const;

/** The warned system groups a person is in (0.5), by name: the ones that amount to control of the NAS. */
export const warnedGroupsOf = (
  user: Pick<UserAccount, "groups">,
  omvGroups: readonly Pick<UserGroup, "name">[],
): string[] =>
  otherSystemGroups(user, omvGroups)
    .filter((g) => g.warned)
    .map((g) => g.name);

/** The search (1.2): the name, the description and the email address, ignoring case. */
export function matchesSearch(user: UserAccount, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase();
  if (needle === "") {
    return true;
  }
  return [user.name, user.comment ?? "", user.email ?? ""].some((field) =>
    field.toLocaleLowerCase().includes(needle),
  );
}

export function matchesShow(
  user: UserAccount,
  show: UsersShow,
  omvGroups: readonly Pick<UserGroup, "name">[],
): boolean {
  switch (show) {
    case "all":
      return true;
    case "admins":
      return isAdministrator(user);
    case "ssh":
      return sshAllowed(user);
    case "systemGroups":
      return otherSystemGroups(user, omvGroups).length > 0;
  }
}

const sortValue = (
  user: UserAccount,
  field: UsersSortField,
): string | boolean => {
  switch (field) {
    case "name":
      return user.name;
    case "description":
      return user.comment ?? "";
    case "email":
      return user.email ?? "";
    case "admin":
      return isAdministrator(user);
    case "ssh":
      return sshAllowed(user);
  }
};

/** The rows in the order asked for; ties, and empty values, by name (natural order). */
export function sortUsers(
  users: readonly UserAccount[],
  sort: UsersSort,
): UserAccount[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...users].sort((a, b) => {
    const left = sortValue(a, sort.field);
    const right = sortValue(b, sort.field);
    let order: number;
    if (typeof left === "boolean" || typeof right === "boolean") {
      order = Number(left) - Number(right);
    } else if (left === "" && right !== "") {
      // "None" goes last either way.
      return 1;
    } else if (right === "" && left !== "") {
      return -1;
    } else {
      order = byName(left, right);
    }
    return order === 0 ? byName(a.name, b.name) : sign * order;
  });
}

/** Pressing a header: that column ascending, or the sorted column reversed. */
export function nextUsersSort(
  current: UsersSort,
  field: UsersSortField,
): UsersSort {
  return current.field === field
    ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
    : { field, direction: "asc" };
}

/** The rows shown: searched, filtered and sorted. */
export function visibleUsers(
  users: readonly UserAccount[],
  omvGroups: readonly Pick<UserGroup, "name">[],
  view: { search: string; show: UsersShow; sort: UsersSort },
): UserAccount[] {
  return sortUsers(
    users.filter(
      (u) =>
        matchesSearch(u, view.search) && matchesShow(u, view.show, omvGroups),
    ),
    view.sort,
  );
}

/** One page of rows, counted from 0, clamped to the last page that exists. */
export function pageOf<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): { rows: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const at = Math.min(Math.max(0, page), pageCount - 1);
  return {
    rows: rows.slice(at * pageSize, at * pageSize + pageSize),
    page: at,
    pageCount,
  };
}

/** 0.2: at most `max` names in natural order, then "and {{count}} more". */
export function fewNames(
  names: readonly string[],
  max = 5,
): { shown: string[]; more: number } {
  const sorted = [...names].sort(byName);
  return {
    shown: sorted.slice(0, max),
    more: Math.max(0, sorted.length - max),
  };
}

/** "Who can control this NAS" (1.2): the administrators, who may sign in over SSH, and who is in warned groups. */
export interface ControlSummary {
  admins: string[];
  ssh: string[];
  powers: { name: string; groups: string[] }[];
}

export function controlSummary(
  users: readonly UserAccount[],
  omvGroups: readonly Pick<UserGroup, "name">[],
): ControlSummary {
  const sorted = [...users].sort((a, b) => byName(a.name, b.name));
  return {
    admins: sorted.filter(isAdministrator).map((u) => u.name),
    ssh: sorted.filter(sshAllowed).map((u) => u.name),
    powers: sorted
      .map((u) => ({ name: u.name, groups: warnedGroupsOf(u, omvGroups) }))
      .filter((p) => p.groups.length > 0),
  };
}

/** The Groups column (1.3): the OMV groups a person is in, at most three, then "and {{count}} more". */
export const groupsColumn = (
  user: Pick<UserAccount, "name" | "groups">,
  omvGroups: readonly Pick<UserGroup, "name" | "members">[],
): { shown: string[]; more: number } =>
  fewNames(omvGroupsOf(user, omvGroups), 3);
