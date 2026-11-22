// SPDX-License-Identifier: GPL-3.0-or-later
// What a person may do, and what a save sends (phase 5 users design 0.3, 0.5, 0.8, 0.11): who is an
// administrator, how SSH stands for them, the groups list every save sends (OMV replaces the whole
// list, and leaves it alone when it is empty), the login shell that follows the SSH choice (Q5, D6,
// D7), and the rules about the signed-in person, which fail closed. Pure, so every row is tested.
import type {
  SshSettings,
  UserAccount,
  UserGroup,
  UserMgmtSetUserRequest,
} from "@omv-webui/react-api-omv/generated";
import {
  ADMIN_GROUP,
  DEFAULT_GROUP,
  MANAGED_SYSTEM_GROUPS,
  ROOT_GROUP,
  SSH_GROUP,
  systemGroupInfo,
  type SystemGroupInfo,
} from "./systemGroups.ts";

/** The shell of a new person, and of one whose SSH is taken away (Q5, D6). */
export const NOLOGIN_SHELL = "/usr/sbin/nologin";
/** The shell set when SSH is allowed and the person has no login shell (D7, the classic default). */
export const LOGIN_SHELL = "/usr/bin/sh";
/** Shells that open no command line (0.3). */
export const NOLOGIN_SHELLS: readonly string[] = [
  "/usr/sbin/nologin",
  "/sbin/nologin",
  "/usr/bin/false",
  "/bin/false",
];

export const isNoLoginShell = (shell: string | undefined): boolean =>
  shell === undefined || shell === "" || NOLOGIN_SHELLS.includes(shell);

const groupsOf = (user: Pick<UserAccount, "groups">): readonly string[] =>
  user.groups ?? [];

export const isAdministrator = (user: Pick<UserAccount, "groups">): boolean =>
  groupsOf(user).includes(ADMIN_GROUP);

export const mayUseSsh = (user: Pick<UserAccount, "groups">): boolean =>
  groupsOf(user).includes(SSH_GROUP);

export const inRootGroup = (user: Pick<UserAccount, "groups">): boolean =>
  groupsOf(user).includes(ROOT_GROUP);

/** The Users list's SSH column (0.3): a fact about the account only. */
export const sshAllowed = (user: Pick<UserAccount, "groups">): boolean =>
  mayUseSsh(user) || inRootGroup(user);

/** The system groups a person is in other than the main group and the two offered (3.4). */
export function otherSystemGroups(
  user: Pick<UserAccount, "groups">,
  omvGroups: readonly Pick<UserGroup, "name">[],
): SystemGroupInfo[] {
  const listed = new Set(omvGroups.map((g) => g.name));
  return groupsOf(user)
    .filter((g) => !listed.has(g) && !MANAGED_SYSTEM_GROUPS.includes(g))
    .map(systemGroupInfo);
}

/** The groups made in OMV that a person is in, by name, from their `groups` and the groups' members. */
export function omvGroupsOf(
  user: Pick<UserAccount, "name" | "groups">,
  omvGroups: readonly Pick<UserGroup, "name" | "members">[],
): string[] {
  const own = new Set(groupsOf(user));
  return omvGroups
    .filter((g) => own.has(g.name) || g.members?.includes(user.name) === true)
    .map((g) => g.name);
}

/** What the SSH part of a person's page says (0.3's table, in order). */
export type SshReading =
  | { kind: "no" }
  | { kind: "root" }
  | { kind: "unread" }
  | { kind: "noLoginShell" }
  | { kind: "sshOff" }
  | { kind: "notRunning" }
  | { kind: "keysOnly" }
  | { kind: "yes" };

export interface SshState {
  /** SSH.get, or undefined when it failed. */
  settings: Pick<
    SshSettings,
    "enable" | "passwordauthentication" | "pubkeyauthentication"
  > | null;
  /** Whether the `ssh` service is running (Services.getStatus), or undefined when unknown. */
  running: boolean | undefined;
  /** Whether `ssh` is among the pending modules. */
  pending: boolean;
}

export function sshReading(
  user: Pick<UserAccount, "groups" | "shell" | "sshpubkeys">,
  ssh: SshState,
): SshReading {
  if (inRootGroup(user)) {
    return { kind: "root" };
  }
  if (!mayUseSsh(user)) {
    return { kind: "no" };
  }
  if (ssh.settings === null) {
    return { kind: "unread" };
  }
  if (isNoLoginShell(user.shell)) {
    return { kind: "noLoginShell" };
  }
  if (!ssh.settings.enable) {
    return { kind: "sshOff" };
  }
  if (ssh.running === false && !ssh.pending) {
    return { kind: "notRunning" };
  }
  const keys = (user.sshpubkeys ?? []).length > 0;
  if (
    !ssh.settings.passwordauthentication &&
    (!keys || !ssh.settings.pubkeyauthentication)
  ) {
    return { kind: "keysOnly" };
  }
  return { kind: "yes" };
}

/** Whether a reading means "allowed but it cannot work" (0.3 rows 3 to 6), for What to do now. */
export const sshBlocked = (reading: SshReading): boolean =>
  reading.kind === "noLoginShell" ||
  reading.kind === "sshOff" ||
  reading.kind === "notRunning" ||
  reading.kind === "keysOnly";

/** The choices a save of a person's groups or powers makes. */
export interface GroupChoices {
  admin: boolean;
  ssh: boolean;
  /** The groups made in OMV that the person is to be in. */
  omvGroups: readonly string[];
}

/**
 * The whole groups list to send (0.5): `users` first; every system group the person is in, as read;
 * the two offered, as chosen; the OMV groups as chosen. Never empty. Groups the lists no longer show
 * are left out only if they were OMV groups (a system group read is always kept).
 */
export function groupsToSend(
  read: Pick<UserAccount, "groups">,
  omvGroups: readonly Pick<UserGroup, "name">[],
  choices: GroupChoices,
): string[] {
  const listed = new Set(omvGroups.map((g) => g.name));
  const out: string[] = [DEFAULT_GROUP];
  const add = (g: string) => {
    if (!out.includes(g)) {
      out.push(g);
    }
  };
  for (const g of groupsOf(read)) {
    if (!listed.has(g) && !MANAGED_SYSTEM_GROUPS.includes(g)) {
      add(g);
    }
  }
  if (choices.admin) {
    add(ADMIN_GROUP);
  }
  if (choices.ssh) {
    add(SSH_GROUP);
  }
  for (const g of choices.omvGroups) {
    add(g);
  }
  return out;
}

/**
 * The shell to send (3.3, D6, D7): allowing SSH gives a no-login account `/usr/bin/sh` and keeps a
 * login shell set elsewhere; taking SSH away sets `/usr/sbin/nologin`; no change keeps what was read.
 */
export function shellToSend(
  readShell: string | undefined,
  sshBefore: boolean,
  sshAfter: boolean,
): string {
  const read = readShell ?? "";
  if (sshAfter && !sshBefore) {
    return isNoLoginShell(read) ? LOGIN_SHELL : read;
  }
  if (!sshAfter && sshBefore) {
    return NOLOGIN_SHELL;
  }
  return read === "" ? NOLOGIN_SHELL : read;
}

/** Whether this person is the reader (0.8): yes, no, or not known (the session's name was not read). */
export type SelfReading = "self" | "other" | "unknown";

export function selfReading(
  sessionUsername: string | null | undefined,
  name: string,
): SelfReading {
  if (
    sessionUsername === null ||
    sessionUsername === undefined ||
    sessionUsername === ""
  ) {
    return "unknown";
  }
  return sessionUsername === name ? "self" : "other";
}

/** Whether a person's administrator rights may be taken away here (0.8, fail closed). */
export const mayRemoveAdmin = (self: SelfReading): boolean => self === "other";

/**
 * Whether a person may be deleted here (0.8, 7.1): never oneself; when the reader is not known, never
 * an administrator (who could be the reader).
 */
export const mayDelete = (
  self: SelfReading,
  user: Pick<UserAccount, "groups">,
): boolean =>
  self === "other" || (self === "unknown" && !isAdministrator(user));

/**
 * A save of an existing person (0.11): every field as read from getUser just now, with the change.
 * `uid` is never sent; the password is empty unless a new one is set.
 */
export function userSetParams(
  read: UserAccount,
  change: Partial<
    Pick<
      UserMgmtSetUserRequest,
      "groups" | "shell" | "password" | "email" | "comment"
    >
  > = {},
): UserMgmtSetUserRequest {
  return {
    name: read.name,
    groups: change.groups ?? [
      DEFAULT_GROUP,
      ...groupsOf(read).filter((g) => g !== DEFAULT_GROUP),
    ],
    shell:
      change.shell ??
      (read.shell === undefined || read.shell === ""
        ? NOLOGIN_SHELL
        : read.shell),
    password: change.password ?? "",
    email: change.email ?? read.email ?? "",
    comment: change.comment ?? read.comment ?? "",
    disallowusermod: read.disallowusermod ?? false,
    sshpubkeys: [...(read.sshpubkeys ?? [])],
  };
}

/** A new person (0.11): no-login shell unless SSH is chosen, nothing OMV does not need. */
export function newUserParams(input: {
  name: string;
  password: string;
  email: string;
  comment: string;
  groups: readonly string[];
  ssh: boolean;
}): UserMgmtSetUserRequest {
  return {
    name: input.name,
    password: input.password,
    email: input.email,
    comment: input.comment,
    groups: [...input.groups],
    shell: input.ssh ? LOGIN_SHELL : NOLOGIN_SHELL,
    disallowusermod: false,
    sshpubkeys: [],
  };
}

/**
 * The fields that changed between what a page showed and what getUser reads just before a save
 * (0.11): a save stops when this is not empty. The groups and the shell are always compared, so a
 * page whose list changed since it was opened says so instead of overwriting it (0.5); the email
 * address and the description are compared unless this save writes them.
 */
export function changedSince(
  shown: UserAccount,
  now: UserAccount,
  saving: readonly ("email" | "comment")[] = [],
): string[] {
  const out: string[] = [];
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const sorted = (list: readonly string[] | undefined) =>
    [...(list ?? [])].sort();
  if (!same(sorted(shown.groups), sorted(now.groups))) {
    out.push("groups");
  }
  if (!same(shown.shell ?? "", now.shell ?? "")) {
    out.push("shell");
  }
  if (!saving.includes("email") && !same(shown.email ?? "", now.email ?? "")) {
    out.push("email");
  }
  if (
    !saving.includes("comment") &&
    !same(shown.comment ?? "", now.comment ?? "")
  ) {
    out.push("comment");
  }
  if (!same(shown.sshpubkeys ?? [], now.sshpubkeys ?? [])) {
    out.push("sshpubkeys");
  }
  if (!same(shown.disallowusermod ?? false, now.disallowusermod ?? false)) {
    out.push("disallowusermod");
  }
  return out;
}
