// SPDX-License-Identifier: GPL-3.0-or-later
// A person's page, the parts that are decisions rather than drawing (phase 5 users design 2.4, 2.5,
// 3.5, 0.8, 0.10, 0.11): "What to do now", the changes "What {{name}} can do" confirms, whether taking
// administrator rights away leaves only the built-in admin, the email address's check, the
// read-change-write of every save (getUser immediately before setUser, stopping when the person changed
// elsewhere), and how a "does not exist" reply is told from every other failure. Pure, or with the
// calls passed in, so each rule is tested by itself.
import type {
  UserAccount,
  UserMgmtSetUserRequest,
  UserSaved,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import type { HomeState } from "../homeFolders/homeModel.ts";
import {
  folderValue,
  personLine,
  type FolderChoices,
  type FolderRow,
} from "./accessByAccount.ts";
import {
  changedSince,
  isAdministrator,
  sshBlocked,
  userSetParams,
  type SshReading,
} from "./userModel.ts";

// ---- "Does not exist" (0.11; the VM's change 1) -----------------------------------------------------

/** OMV's exact words for a name no account or group has (observed on the test VM, 8.6.1). */
export const missingMessage = (kind: "user" | "group", name: string): string =>
  `The ${kind} '${name}' does not exist.`;

/**
 * Whether a failed getUser or getGroup said exactly that no such account or group exists: HTTP 500
 * with OMV's words for that very name. Any other failure (a cut request, another message, another
 * name) is not "free": the add flows stop on it (0.11, 22 #1).
 */
export const isMissing = (
  error: unknown,
  kind: "user" | "group",
  name: string,
): boolean =>
  isRpcError(error) &&
  error.status === 500 &&
  error.message === missingMessage(kind, name);

// ---- What to do now (2.4) ---------------------------------------------------------------------------

export type PersonTodo =
  | { kind: "power"; groups: string[] }
  | { kind: "ssh"; reading: SshReading }
  | { kind: "noAccess" }
  | { kind: "home"; state: Extract<HomeState, { kind: "on" }> };

/** Whether a person can open a folder, directly or through a group, as the grid now shows it. */
export function opensAny(
  rows: readonly FolderRow[],
  choices: FolderChoices,
): boolean {
  return rows.some((r) => {
    const value = folderValue(r, choices);
    if (value === "blocked") {
      return false;
    }
    if (value === "rw" || value === "ro") {
      return true;
    }
    return personLine(r, choices)?.kind === "viaGroup";
  });
}

/** The first case of 2.4 that applies, or null. A case whose reads failed is left out. */
export function personTodo(input: {
  warnedGroups: readonly string[];
  ssh: SshReading;
  /** The access rows, when the folders and lists were read. */
  rows: readonly FolderRow[] | undefined;
  home: HomeState | undefined;
}): PersonTodo | null {
  if (input.warnedGroups.length > 0) {
    return { kind: "power", groups: [...input.warnedGroups] };
  }
  if (sshBlocked(input.ssh)) {
    return { kind: "ssh", reading: input.ssh };
  }
  if (
    input.rows !== undefined &&
    input.rows.length > 0 &&
    !opensAny(input.rows, {})
  ) {
    return { kind: "noAccess" };
  }
  if (input.home?.kind === "on" && input.home.state.pill !== "ok") {
    return { kind: "home", state: input.home };
  }
  return null;
}

// ---- What they can do (3.5) -------------------------------------------------------------------------

/** How the read of one privilege group stands (3.6). */
export type GroupCheck =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "missing" }
  | { kind: "failed"; error: unknown; retry: () => void; retrying: boolean };

/** How SSH stands on the NAS, for the line under the SSH box (3.3). */
export type SshLine = "unread" | "off" | "keysOnly" | null;

export interface Powers {
  admin: boolean;
  ssh: boolean;
}

export type PowerChange =
  "makeAdmin" | "removeAdmin" | "allowSsh" | "removeSsh";

/** The changes in the order of the form, for the confirmation's items and the toasts. */
export function powerChanges(before: Powers, after: Powers): PowerChange[] {
  const out: PowerChange[] = [];
  if (after.admin !== before.admin) {
    out.push(after.admin ? "makeAdmin" : "removeAdmin");
  }
  if (after.ssh !== before.ssh) {
    out.push(after.ssh ? "allowSsh" : "removeSsh");
  }
  return out;
}

/** Taking `name`'s administrator rights away leaves no listed administrator (3.5's last line). */
export const leavesNoAdmin = (
  users: readonly Pick<UserAccount, "name" | "groups">[],
  name: string,
): boolean => !users.some((u) => u.name !== name && isAdministrator(u));

// ---- The details (2.5) ------------------------------------------------------------------------------

/**
 * One email address, or empty (OMV's own check is the server's, which still has the last word): no
 * space, one "@", something on both sides, a dot in the part after it.
 */
export const emailProblem = (email: string): boolean =>
  email !== "" && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/u.test(email);

// ---- Read, change, write (0.11) ---------------------------------------------------------------------

export type SaveOutcome =
  | { kind: "saved"; saved: UserSaved; now: UserAccount }
  /** The re-read differs from what the page showed in a field this save does not write. */
  | { kind: "changed"; now: UserAccount; fields: string[] }
  /** getUser said the person no longer exists. */
  | { kind: "gone" }
  /** The re-read found the reader's own account where it must not be changed (0.8). */
  | { kind: "refused" };

export interface SavePersonApi {
  user(name: string): Promise<UserAccount>;
  setUser(request: UserMgmtSetUserRequest): Promise<UserSaved>;
}

/**
 * One save of an existing person: getUser immediately before (R4), the changed-elsewhere check, an
 * optional last check on what was read (`refuse`, 0.8's self rule), then setUser with every field as
 * read and only this save's change. A failed write is thrown, with the server's error.
 */
export async function savePerson(
  api: SavePersonApi,
  shown: UserAccount,
  change: (
    now: UserAccount,
  ) => Partial<
    Pick<
      UserMgmtSetUserRequest,
      "groups" | "shell" | "password" | "email" | "comment"
    >
  >,
  options: {
    saving?: readonly ("email" | "comment")[];
    refuse?: (now: UserAccount) => boolean;
  } = {},
): Promise<SaveOutcome> {
  let now: UserAccount;
  try {
    now = await api.user(shown.name);
  } catch (error) {
    if (isMissing(error, "user", shown.name)) {
      return { kind: "gone" };
    }
    throw error;
  }
  const fields = changedSince(shown, now, options.saving ?? []);
  if (fields.length > 0) {
    return { kind: "changed", now, fields };
  }
  if (options.refuse?.(now) === true) {
    return { kind: "refused" };
  }
  const saved = await api.setUser(userSetParams(now, change(now)));
  return { kind: "saved", saved, now };
}

/** The line under the SSH box (3.3): when SSH's settings would stop the choice from working. */
export function sshLineOf(
  settings:
    | {
        enable: boolean;
        passwordauthentication: boolean;
        pubkeyauthentication: boolean;
      }
    | undefined,
  unread: boolean,
  keys: number,
): SshLine {
  if (unread || settings === undefined) {
    return unread ? "unread" : null;
  }
  if (!settings.enable) {
    return "off";
  }
  if (
    !settings.passwordauthentication &&
    (keys === 0 || !settings.pubkeyauthentication)
  ) {
    return "keysOnly";
  }
  return null;
}
