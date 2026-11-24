// SPDX-License-Identifier: GPL-3.0-or-later
// What the users and groups pages keep in memory for the session (phase 5 users design 0.4, 0.10, 1.5,
// 13.1): the action running on each person or group (one at a time, 0.10), the sections of their pages
// saved since the last apply (the pending mark: a person's email address and shared folders, a group's
// members and shared folders), the people this session added with the access their flow chose, and the
// accounts this session deleted (or set out to delete), for the Users list's unfinished-work lines and
// the shared folders' stale-entry line. In memory only (UI-13); emptied when the session ends (app.ts).
// No password is ever held here (0.7, UI-6).
//
// Accounts are kept by the access model's row id ("user:alex", "group:family"): the name as the server
// listed it, never text taken from the address.
import type {
  SharedFolder,
  UserAccount,
} from "@omv-webui/react-api-omv/generated";
import { savedMarks } from "../pending/savedMarks.ts";
import {
  accessOf,
  entriesOf,
  rowId,
  type Access,
  type AccessKind,
} from "../sharedFolders/accessModel.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";

/** "user:alex" or "group:family" (accessModel's rowId). */
export type AccountId = string;

export const accountId = (kind: AccessKind, name: string): AccountId =>
  rowId(kind, name);

/** What this session may be doing to a person or a group (0.10: one action at a time). */
export type AccountAction =
  | "details"
  | "powers"
  | "groups"
  | "access"
  | "password"
  | "add"
  | "delete"
  | "members"
  | "description";

/** The sections of a person's or group's page that carry a pending mark (0.4). */
export type AccountSection = "email" | "access" | "members" | "description";

/** A person this session added (6.4 step 2), with the access its flow chose, by folder `uuid`. */
export interface AddedPerson {
  name: string;
  access: Readonly<Record<string, Access>>;
}

/** An account this session set out to delete (7.4, 11.3). */
export interface DeletedAccount {
  id: AccountId;
  kind: AccessKind;
  name: string;
  /** deleteUser (or deleteGroup) answered: the account is gone. */
  finished: boolean;
}

export interface UsersSessionState {
  running: Readonly<Record<AccountId, AccountAction>>;
  saved: Readonly<Record<AccountId, readonly AccountSection[]>>;
  added: readonly AddedPerson[];
  deleted: readonly DeletedAccount[];
}

const INITIAL: UsersSessionState = {
  running: {},
  saved: {},
  added: [],
  deleted: [],
};

export const usersSession = createMemoryStore<UsersSessionState>(INITIAL);

/** Mark an account as being changed by this session; false when an action on it already runs. */
export function beginAccountAction(
  id: AccountId,
  action: AccountAction,
): boolean {
  if (usersSession.getState().running[id] !== undefined) {
    return false;
  }
  usersSession.set((s) => ({ running: { ...s.running, [id]: action } }));
  return true;
}

export const endAccountAction = (id: AccountId): void =>
  usersSession.set((s) => {
    if (s.running[id] === undefined) {
      return {};
    }
    const { [id]: _done, ...running } = s.running;
    return { running };
  });

/** The action running on an account in this session, or null. */
export const runningOnAccount = (id: AccountId): AccountAction | null =>
  usersSession.getState().running[id] ?? null;

/** The modules each section's save waits for (0.9). */
const SECTION_MODULES: Record<AccountSection, readonly string[]> = {
  email: ["postfix"],
  access: ["sharedfolders", "samba"],
  members: ["samba"],
  description: ["samba"],
};

/** Every module the marks follow. */
export const USERS_MODULES = ["postfix", "sharedfolders", "samba"] as const;

/** Once none of the modules is pending any more (applied or undone), the marks are forgotten (savedMarks.ts). */
const marks = savedMarks.track(USERS_MODULES, () =>
  usersSession.set((s) =>
    Object.keys(s.saved).length === 0 ? {} : { saved: {} },
  ),
);

/** A section was saved; its mark shows while its module is pending. */
export const recordAccountSaved = (
  id: AccountId,
  section: AccountSection,
): void => {
  marks.saved();
  usersSession.set((s) => {
    const now = s.saved[id] ?? [];
    return now.includes(section)
      ? {}
      : { saved: { ...s.saved, [id]: [...now, section] } };
  });
};

/** The pending mark beside a section (0.4): this session saved it and its module is still pending. */
export function accountSectionPending(
  state: Pick<UsersSessionState, "saved">,
  id: AccountId,
  section: AccountSection,
  pending: readonly string[],
): boolean {
  return (
    (state.saved[id] ?? []).includes(section) &&
    SECTION_MODULES[section].some((m) => pending.includes(m))
  );
}

/** The add flow made a person (6.4 step 2), and chose this access for them. */
export const recordAdded = (person: AddedPerson): void =>
  usersSession.set((s) => ({
    added: [...s.added.filter((p) => p.name !== person.name), person],
    // Added again after a deletion in this session: the old journal line no longer applies.
    deleted: s.deleted.filter((d) => d.id !== accountId("user", person.name)),
  }));

/** The access a flow chose was saved, or the reader gave up on it: the line goes. */
export const forgetAdded = (name: string): void =>
  usersSession.set((s) =>
    s.added.some((p) => p.name === name)
      ? { added: s.added.filter((p) => p.name !== name) }
      : {},
  );

/** A delete is about to run (finished false), or has removed the account (finished true). */
export const recordDeleted = (
  kind: AccessKind,
  name: string,
  finished: boolean,
): void =>
  usersSession.set((s) => {
    const id = accountId(kind, name);
    return {
      deleted: [
        ...s.deleted.filter((d) => d.id !== id),
        { id, kind, name, finished },
      ],
      added:
        kind === "user" && finished
          ? s.added.filter((p) => p.name !== name)
          : s.added,
    };
  });

/** Whether this session deleted the account (13.1's stale-entry line). */
export const deletedInSession = (
  state: Pick<UsersSessionState, "deleted">,
  kind: AccessKind,
  name: string,
): boolean =>
  state.deleted.some((d) => d.finished && d.id === accountId(kind, name));

// ---- The Users list's unfinished work (1.5, R8) -----------------------------------------------------

export type UnfinishedPerson =
  /** "{{name}} was added, but their access to shared folders was not saved." → "Open {{name}}" */
  | { kind: "access"; name: string }
  /** "{{name}} is still on this NAS. Deleting them did not finish." → "Open {{name}}" */
  | { kind: "notDeleted"; name: string }
  /** "Shared folders still list {{name}}, who was deleted: {{folders}}." → each folder's page */
  | { kind: "staleAccess"; name: string; folders: readonly SharedFolder[] };

/** What a folder stores for a person now ("none" without an entry). */
export function storedFor(folder: SharedFolder, name: string): Access {
  const entry = entriesOf(folder.privileges).find(
    (e) => e.type === "user" && e.name === name,
  );
  return entry === undefined ? "none" : accessOf(entry.perms);
}

/**
 * What the list recognises from server state about the people this session added or deleted. A person
 * an action of this session is still working on is left out (its run shows it). `folders` undefined
 * (not read, or failed) leaves out the lines that need them: nothing is claimed without the read.
 */
export function unfinishedPeople(
  state: Pick<UsersSessionState, "added" | "deleted" | "running">,
  users: readonly Pick<UserAccount, "name">[],
  folders: readonly SharedFolder[] | undefined,
): UnfinishedPerson[] {
  const listed = new Set(users.map((u) => u.name));
  const lines: UnfinishedPerson[] = [];
  for (const person of state.added) {
    const id = accountId("user", person.name);
    if (
      state.running[id] !== undefined ||
      !listed.has(person.name) ||
      folders === undefined
    ) {
      continue;
    }
    const missing = Object.entries(person.access).some(([uuid, access]) => {
      const folder = folders.find((f) => f.uuid === uuid);
      return folder !== undefined && storedFor(folder, person.name) !== access;
    });
    if (missing) {
      lines.push({ kind: "access", name: person.name });
    }
  }
  for (const gone of state.deleted) {
    if (gone.kind !== "user" || state.running[gone.id] !== undefined) {
      continue;
    }
    if (listed.has(gone.name)) {
      lines.push({ kind: "notDeleted", name: gone.name });
      continue;
    }
    if (folders === undefined) {
      continue;
    }
    const still = folders.filter((f) => storedFor(f, gone.name) !== "none");
    if (still.length > 0) {
      lines.push({ kind: "staleAccess", name: gone.name, folders: still });
    }
  }
  return lines;
}
