// SPDX-License-Identifier: GPL-3.0-or-later
// Who may use a shared folder (phase 5 shares design 0.4, section 3): the join of the folder's stored
// access list (ShareMgmt.getList's `privileges`) with the people and groups OMV lists
// (UserMgmt.getUserList, getGroupList), the lines that say what a group adds, and the list to send
// back (ShareMgmt.setPrivileges replaces the whole list). Pure, so every combination is tested.
//
// The mapping (design 0.4, P7, D3):
// - Read and write is 7, Read only is 5; "No access" is NO ENTRY (storing 0 for everyone not chosen
//   would refuse the members of any group given access);
// - a stored 0 is shown as Blocked, kept when saved, and offered only on a row that holds it;
// - an entry for an account the lists do not show cannot be a row: it is "stale", said under the grid
//   and dropped on save (D9, OMV refuses an account that no longer exists);
// - the web interface's administrator account is refused by OMV: if it is listed, its row cannot be
//   changed (observed on the test VM: getUserList does not list it, so this is defensive).
//
// Observed on the test VM: `privileges` is "" when a folder has no entries (also after saving []),
// else {privilege: [{type, name, perms}]} with `perms` a JSON number; a person's `groups` includes
// their primary group `users`, which getGroupList never lists, so it never names a row.
import type {
  SharedFolderPrivilege,
  SharedFolderPrivilegeEntry,
  SharedFolderPrivileges,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";

/** One row's choice: the three the grid offers, and Blocked where it is stored. */
export type Access = "rw" | "ro" | "none" | "blocked";

/** The grid's choices in the order they are drawn, and the ones offered anew on every row. */
export const ACCESS_VALUES = ["rw", "ro", "none", "blocked"] as const;
export const NORMAL_ACCESS = ["rw", "ro", "none"] as const;
/** The choices that let someone in, for the "With access" filter and the last-access rule. */
export const GIVES_ACCESS = ["rw", "ro"] as const;

export const givesAccess = (access: Access): boolean =>
  access === "rw" || access === "ro";

/** The web interface's administrator account, which OMV refuses shared-folder access (0.4). */
export const WEB_ADMIN = "admin";

export type AccessKind = "user" | "group";

export interface AccessRow {
  /** Unique across the grid: "group:family", "user:alex" (the AccessGrid's row id). */
  id: string;
  kind: AccessKind;
  /** The account name as received. */
  name: string;
  /** A person's description, or a group's when OMV holds one; "" when none. */
  description: string;
  /** What the folder stores for this row now; "none" when there is no entry. */
  stored: Access;
  /** The web administrator account: shown, never changed (3.2). */
  admin: boolean;
  /** A person's groups that are rows of the grid (from getUserList's `groups` and the groups' members). */
  groups: readonly string[];
}

export interface AccessModel {
  /** Groups first, then people, each in natural order of name (D2). */
  rows: readonly AccessRow[];
  /** Stored entries no row shows: said under the grid and dropped on save (D9). */
  stale: readonly SharedFolderPrivilege[];
}

/** The grid's choices, by row id. A row with no choice holds its stored value. */
export type Choices = Readonly<Record<string, Access>>;

export const rowId = (kind: AccessKind, name: string): string =>
  `${kind}:${name}`;

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
const byName = (a: { name: string }, b: { name: string }) =>
  collator.compare(a.name, b.name) ||
  (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** A stored `perms` as the grid shows it: 7 and 5 as read; 0, or anything OMV may add, refuses. */
export function accessOf(perms: unknown): Access {
  const value = Number(perms);
  if (value === 7) {
    return "rw";
  }
  if (value === 5) {
    return "ro";
  }
  return "blocked";
}

/** The stored entries of a folder: none for "" (observed) or a missing list. */
export function entriesOf(
  privileges: SharedFolderPrivileges | undefined,
): SharedFolderPrivilege[] {
  if (privileges === undefined || typeof privileges === "string") {
    return [];
  }
  return Array.isArray(privileges.privilege) ? privileges.privilege : [];
}

/** The join of 0.4: one row per listed group and person, and the entries no row shows. */
export function accessModel(
  users: readonly UserAccount[],
  groups: readonly UserGroup[],
  privileges: SharedFolderPrivileges | undefined,
): AccessModel {
  const entries = entriesOf(privileges);
  const stored = (kind: AccessKind, name: string): Access => {
    const entry = entries.find((e) => e.type === kind && e.name === name);
    return entry === undefined ? "none" : accessOf(entry.perms);
  };
  const groupNames = new Set(groups.map((g) => g.name));
  const groupRows: AccessRow[] = [...groups].sort(byName).map((g) => ({
    id: rowId("group", g.name),
    kind: "group",
    name: g.name,
    description: g.comment ?? "",
    stored: stored("group", g.name),
    admin: false,
    groups: [],
  }));
  const userRows: AccessRow[] = [...users].sort(byName).map((u) => {
    const member = new Set(
      (u.groups ?? []).filter((name) => groupNames.has(name)),
    );
    for (const g of groups) {
      if (g.members?.includes(u.name) === true) {
        member.add(g.name);
      }
    }
    return {
      id: rowId("user", u.name),
      kind: "user",
      name: u.name,
      description: u.comment ?? "",
      stored: stored("user", u.name),
      admin: u.name === WEB_ADMIN,
      groups: [...member].sort((a, b) => byName({ name: a }, { name: b })),
    };
  });
  const rows = [...groupRows, ...userRows];
  const shown = new Set(rows.map((r) => r.id));
  const stale = entries.filter((e) => !shown.has(rowId(e.type, e.name)));
  return { rows, stale };
}

/** A row's value now: the reader's choice, else what is stored. */
export const valueOf = (row: AccessRow, choices: Choices): Access =>
  choices[row.id] ?? row.stored;

/** The values a row offers: the three, and Blocked only on a row that holds it (3.2). */
export const allowedValues = (row: AccessRow): readonly Access[] =>
  row.stored === "blocked" ? ACCESS_VALUES : NORMAL_ACCESS;

/**
 * The grid's choices after the reader set `ids` to `value` (one row's choice, or "Set all shown to"):
 * a row set back to what it stores is no longer a change; the administrator's row and an id no row
 * has are left alone; Blocked is never chosen anew on a row that does not hold it (3.2).
 */
export function withChoice(
  model: AccessModel,
  choices: Choices,
  ids: readonly string[],
  value: Access,
): Record<string, Access> {
  const set = new Map<string, Access>(Object.entries(choices));
  for (const id of ids) {
    const row = model.rows.find((r) => r.id === id);
    if (row === undefined || row.admin) {
      continue;
    }
    if (value === "blocked" && row.stored !== "blocked") {
      continue;
    }
    if (value === row.stored) {
      set.delete(id);
    } else {
      set.set(id, value);
    }
  }
  return Object.fromEntries(set);
}

/** The rows whose value differs from what is stored: the grid's changes. */
export function changedRows(model: AccessModel, choices: Choices): AccessRow[] {
  return model.rows.filter((r) => !r.admin && valueOf(r, choices) !== r.stored);
}

const RANK: Record<Access, number> = { blocked: -1, none: 0, ro: 1, rw: 2 };

/** What a group adds to, or how a block overrides, a person's own row (0.4's group lines). */
export type GroupLine =
  /** "Also gets {{access}} as a member of {{group}}." */
  | { kind: "viaGroup"; access: "rw" | "ro"; group: string }
  /** The person is Blocked although {{group}} gives access: "Blocked: cannot open it, even through {{group}}." */
  | { kind: "blockedVia"; group: string }
  /**
   * The person's row gives access, but {{group}} is Blocked, which wins (Samba's refused list). The
   * design has no copy for this; the page decides what to say (reported to the owner).
   */
  | { kind: "groupBlocks"; group: string };

/**
 * The one line under a person's row, from the grid as it now shows (choices included), with guest
 * access off. A group's line names the group that gives the most, the first by name on a tie. Null
 * for a group's row and when no group changes anything.
 */
export function groupLine(
  row: AccessRow,
  model: AccessModel,
  choices: Choices,
): GroupLine | null {
  if (row.kind !== "user" || row.groups.length === 0) {
    return null;
  }
  const own = valueOf(row, choices);
  const memberRows = model.rows.filter(
    (r) => r.kind === "group" && row.groups.includes(r.name),
  );
  const blocking = memberRows.find((g) => valueOf(g, choices) === "blocked");
  let best: { group: string; access: Access } | null = null;
  for (const g of memberRows) {
    const access = valueOf(g, choices);
    if (
      givesAccess(access) &&
      (best === null || RANK[access] > RANK[best.access])
    ) {
      best = { group: g.name, access };
    }
  }
  if (own === "blocked") {
    return best === null ? null : { kind: "blockedVia", group: best.group };
  }
  if (blocking !== undefined && givesAccess(own)) {
    return { kind: "groupBlocks", group: blocking.name };
  }
  if (best !== null && RANK[best.access] > RANK[own]) {
    return {
      kind: "viaGroup",
      access: best.access === "rw" ? "rw" : "ro",
      group: best.group,
    };
  }
  return null;
}

/**
 * What a person can do when they open the folder over SMB, with guest access off, as 0.4 reads OMV's
 * Samba template: a 0 for them or for any of their groups refuses ("invalid users" wins); otherwise
 * the most their own row and their groups give; nobody else is let in while someone has access. For a
 * group's row, its own value. Not shown as such (Q9 needs the file permissions too); the group lines
 * and the tests rest on it.
 */
export function effectiveAccess(
  row: AccessRow,
  model: AccessModel,
  choices: Choices,
): "rw" | "ro" | "none" {
  const own = valueOf(row, choices);
  const values = [
    own,
    ...model.rows
      .filter((r) => r.kind === "group" && row.groups.includes(r.name))
      .map((g) => valueOf(g, choices)),
  ];
  if (values.includes("blocked")) {
    return "none";
  }
  if (values.includes("rw")) {
    return "rw";
  }
  return values.includes("ro") ? "ro" : "none";
}

const PERMS = { rw: 7, ro: 5, blocked: 0 } as const;

/**
 * The whole list to send to ShareMgmt.setPrivileges, as the grid now shows it: an entry for every row
 * at Read and write (7), Read only (5) or Blocked (0, kept); none for No access; never the
 * administrator's row (OMV refuses it) or a stale entry (dropped, D9). Groups first, then people.
 */
export function privilegesToSave(
  model: AccessModel,
  choices: Choices,
): SharedFolderPrivilegeEntry[] {
  const list: SharedFolderPrivilegeEntry[] = [];
  for (const row of model.rows) {
    const value = valueOf(row, choices);
    if (row.admin || value === "none") {
      continue;
    }
    list.push({ type: row.kind, name: row.name, perms: PERMS[value] });
  }
  return list;
}

/** Whether a list lets anyone in (7 or 5): the last-access rule of 0.9 and the add flow's check. */
export const anyoneHasAccess = (list: readonly { perms: number }[]): boolean =>
  list.some((e) => Number(e.perms) === 7 || Number(e.perms) === 5);

/** Whether the grid as it now shows gives anyone access (the add flow's C6 check, 4.1). */
export const gridGivesAccess = (
  model: AccessModel,
  choices: Choices,
): boolean =>
  model.rows.some((r) => !r.admin && givesAccess(valueOf(r, choices)));

const entryKey = (e: Pick<SharedFolderPrivilege, "type" | "name" | "perms">) =>
  `${e.type}\u0000${e.name}\u0000${String(Number(e.perms))}`;

/** Two stored lists that hold the same entries, in any order. */
export function samePrivileges(
  a: SharedFolderPrivileges | undefined,
  b: SharedFolderPrivileges | undefined,
): boolean {
  const left = entriesOf(a).map(entryKey).sort();
  const right = entriesOf(b).map(entryKey).sort();
  return (
    left.length === right.length && left.every((key, i) => key === right[i])
  );
}

/**
 * "Access to {{folder}} was changed elsewhere since you opened this page." (0.10): the list read just
 * before saving differs from the one the grid was opened on.
 */
export const changedElsewhere = (
  openedOn: SharedFolderPrivileges | undefined,
  readNow: SharedFolderPrivileges | undefined,
): boolean => !samePrivileges(openedOn, readNow);

/**
 * "Show the current access" (0.10): the reader's changes carried onto the current list. A row the
 * reader changed keeps their value; every other row shows what is stored now. Rows that no longer
 * exist are dropped; a kept choice equal to the new stored value is no longer a change.
 */
export function rebaseChoices(
  before: AccessModel,
  after: AccessModel,
  choices: Choices,
): Record<string, Access> {
  const was = new Map(before.rows.map((r) => [r.id, r.stored]));
  const next: Record<string, Access> = {};
  for (const row of after.rows) {
    const chosen = choices[row.id];
    if (chosen === undefined || chosen === was.get(row.id)) {
      continue;
    }
    if (chosen === "blocked" && row.stored !== "blocked") {
      // Blocked cannot be chosen anew: the row shows what is stored now.
      continue;
    }
    if (chosen !== row.stored) {
      next[row.id] = chosen;
    }
  }
  return next;
}

/** Counts for 0.2's "{{count}} people and {{groups}} groups have access" line. */
export function accessCounts(
  model: AccessModel,
  choices: Choices,
): { people: number; groups: number } {
  let people = 0;
  let groups = 0;
  for (const row of model.rows) {
    if (row.admin || !givesAccess(valueOf(row, choices))) {
      continue;
    }
    if (row.kind === "group") {
      groups += 1;
    } else {
      people += 1;
    }
  }
  return { people, groups };
}

/** The add flow's summary (6.3): who gets Read and write, and who Read only, by name in row order. */
export function accessSummary(
  model: AccessModel,
  choices: Choices,
): { rw: AccessRow[]; ro: AccessRow[] } {
  const rw: AccessRow[] = [];
  const ro: AccessRow[] = [];
  for (const row of model.rows) {
    const value = valueOf(row, choices);
    if (row.admin) {
      continue;
    }
    if (value === "rw") {
      rw.push(row);
    } else if (value === "ro") {
      ro.push(row);
    }
  }
  return { rw, ro };
}
