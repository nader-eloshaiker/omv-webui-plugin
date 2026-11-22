// SPDX-License-Identifier: GPL-3.0-or-later
// The users scenarios of the mock (phase 5 users design 17): people, groups, home folders, and the
// access they have to shared folders. Development and test code only (UI-11).
//
// In the users* stories these answers REMEMBER what the reader did, as the shares mock does, so the
// journeys of the design's sections 1 to 12 can be walked on `pnpm dev:mock`. The shared folders, SMB
// and file systems are the shares mock's state (sharesScenarios.ts) and its answers; its lists of
// people and groups are this mock's people and groups, so an access entry for someone deleted is
// refused, as on OMV. What they do is what the test VM showed (OMV 8.6.1, the users brief's facts):
// - getUser and getGroup answer for system accounts and groups too (admin, root, nobody; _ssh and
//   openmediavault-admin); a missing name is HTTP 500 "The user '<name>' does not exist." (or group);
//   a name failing OMV's pattern is HTTP 400; getUserList and getGroupList list neither;
// - setUser makes the account when no account has the name and changes it otherwise; the groups sent
//   replace the whole list, `users` always the main group, and [] leaves them alone; a group that does
//   not exist, a colon in the description, a line break in the password (400) and an invalid email
//   address (400) are refused with the captured words; a new person with home folders off gets the
//   path /home/<name>; the reply's x-omv-omit field holds the documentation value, as the example does (docs/04);
// - setGroup replaces the members ([] empties the group) and refuses a member that does not exist;
//   deleteGroup refuses a group with members; deleteUser takes the person out of every group and leaves
//   the folders' access entries;
// - pending modules: a new person marks postfix; every change to a person, and deleteUser, mark
//   postfix and ssh; a new group marks nothing, every change to one marks samba; deleteGroup marks
//   nothing; setSettings marks samba; access marks what the shares mock marks;
// - home folders on set every person's folder to <shared folder>/<name> and make the folder in use;
//   off sets every person's to /nonexistent and keeps the shared folder chosen;
// - an apply commits OMV's records; an undo brings back OMV's records as last applied (email address,
//   SSH keys, a group's description, the home-folder and SSH settings, the shared folders), never an
//   account, its groups, its description or a password (B4, V4).
//
// The states the VM did not show (failures of the flows at each step, a 40-second home-folder setting,
// 1,000 people, hostile names, failing reads, the SSH states) are WRITTEN BY HAND from the captured
// shapes and say so in their labels. No value comes from a real system: names are documentation names,
// UUIDs documentation values, the host "nas".
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  HomeFolderSettings,
  SmbSettings,
  SmbShare,
  SshSettings,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { delay, http } from "msw";
import {
  newSharesMockState,
  SHARES_MODULES,
  SHARES_OPERATIONS,
  sharesAnswers,
  sharesApplied,
  sharesReverted,
  type MockFolder,
  type SharesMockState,
  type SharesModule,
} from "./sharesScenarios.ts";

export const USERS_SCENARIOS = [
  "usersNone",
  "usersSome",
  "usersMany",
  "usersSelf",
  "usersSelfUnknown",
  "usersSystemGroups",
  "usersSshStates",
  "usersSshOff",
  "usersSshNotRunning",
  "usersSshKeysOnly",
  "usersSshUnknown",
  "usersNoSshGroup",
  "usersHomeOn",
  "usersHomeBroken",
  "usersHomeGone",
  "usersHomeSlow",
  "usersStaleAccess",
  "usersOnlyAccess",
  "usersMainGroup",
  "usersHostile",
  "usersPending",
  "usersAddFails",
  "usersAddFailsCheck",
  "usersAddFailsNotAdded",
  "usersAddFailsPartly",
  "usersAddFailsAccess",
  "usersAddFailsApply",
  "usersAddFailsVerify",
  "usersAddFailsCut",
  "usersDeleteFails",
  "usersDeleteFailsNotEmptied",
  "usersDeleteFailsNotDeleted",
  "usersDeleteFailsAccess",
  "usersDeleteFailsApply",
  "usersDeleteFailsCut",
  "usersReadsFail",
  "usersReadsFailUserList",
  "usersReadsFailGroupList",
  "usersReadsFailUser",
  "usersReadsFailGroup",
  "usersReadsFailHome",
  "usersReadsFailFolders",
  "usersReadsFailSmbShares",
  "usersReadsFailSmbSettings",
  "usersReadsFailSsh",
  "usersReadsFailServices",
  "usersReadsFailFileSystems",
] as const;
export type UsersScenarioName = (typeof USERS_SCENARIOS)[number];

export const USERS_SCENARIO_LABELS: Record<UsersScenarioName, string> = {
  usersNone:
    "Users: nobody but the built-in admin, no group, two shared folders",
  usersSome:
    "Users: alex (administrator), robin (SSH), sam (no groups, no access); family and kids",
  usersMany: "Users: 1,000 people, 60 groups, 140 shared folders (generated)",
  usersSelf: "Users: signed in as example-admin, a listed administrator",
  usersSelfUnknown:
    "Users: the signed-in name cannot be read; starts signed in (hand-written)",
  usersSystemGroups:
    "Users: alex in sudo and docker, robin in root, sam in audio (hand-written)",
  usersSshStates:
    "Users: one person per SSH reading; SSH on and running (hand-written)",
  usersSshOff: "Users: the SSH people, SSH turned off (hand-written)",
  usersSshNotRunning:
    "Users: the SSH people, SSH on but not running (hand-written)",
  usersSshKeysOnly:
    "Users: the SSH people, SSH accepts only keys (hand-written)",
  usersSshUnknown:
    "Users: the SSH people, the SSH settings cannot be read (hand-written)",
  usersNoSshGroup: "Users: the NAS has no _ssh group (hand-written)",
  usersHomeOn: "Users: home folders on, in Homes",
  usersHomeBroken:
    "Users: home folders on in Homes, which cannot be reached (hand-written)",
  usersHomeGone:
    "Users: home folders on, their shared folder deleted (hand-written)",
  usersHomeSlow:
    "Users: 300 people; home folders on takes 40 s in Homes, is cut in People (hand-written)",
  usersStaleAccess:
    "Users: access entries for a deleted person and a deleted group (hand-written)",
  usersOnlyAccess:
    "Users: sam and kids each the only access to a folder shared over SMB (hand-written)",
  usersMainGroup:
    "Users: media is drew's main group, set outside OMV (hand-written)",
  usersHostile:
    "Users: long, right-to-left and markup-looking text; Alex beside alex; a person called add (hand-written)",
  usersPending: "Users: as usersSome, with SMB changes not applied",
  usersAddFails:
    "Add a person or group: each new one fails at the next step in turn (hand-written)",
  usersAddFailsCheck:
    "Add a person or group: someone else takes the name before the run (hand-written)",
  usersAddFailsNotAdded:
    "Add a person or group: it is not added (hand-written)",
  usersAddFailsPartly:
    "Add a person or group: made, but the password or members not set (hand-written)",
  usersAddFailsAccess:
    "Add a person or group: giving access fails once (hand-written)",
  usersAddFailsApply:
    "Add a person or group: applying the changes fails once (hand-written)",
  usersAddFailsVerify:
    "Add a person or group: made, but the groups or members not as chosen (hand-written)",
  usersAddFailsCut:
    "Add a person or group: the request is cut after it was made (hand-written)",
  usersDeleteFails:
    "Delete a person or group: each delete fails at the next step in turn (hand-written)",
  usersDeleteFailsNotEmptied:
    "Delete a group: taking everyone out fails (hand-written)",
  usersDeleteFailsNotDeleted:
    "Delete a person or group: not deleted; a group is left emptied (hand-written)",
  usersDeleteFailsAccess:
    "Delete a person or group: taking them off access lists fails once (hand-written)",
  usersDeleteFailsApply:
    "Delete a person or group: applying the changes fails once (hand-written)",
  usersDeleteFailsCut:
    "Delete a person or group: the request is cut after it was done (hand-written)",
  usersReadsFail: "Users: every read fails once, then answers (hand-written)",
  usersReadsFailUserList:
    "Users: the list of people cannot be read (hand-written)",
  usersReadsFailGroupList:
    "Users: the list of groups cannot be read (hand-written)",
  usersReadsFailUser: "Users: no person can be read (hand-written)",
  usersReadsFailGroup: "Users: no group can be read (hand-written)",
  usersReadsFailHome:
    "Users: the home-folder setting cannot be read (hand-written)",
  usersReadsFailFolders:
    "Users: the shared folders cannot be read (hand-written)",
  usersReadsFailSmbShares:
    "Users: the SMB shares cannot be read (hand-written)",
  usersReadsFailSmbSettings:
    "Users: the SMB settings cannot be read (hand-written)",
  usersReadsFailSsh: "Users: the SSH settings cannot be read (hand-written)",
  usersReadsFailServices:
    "Users: the services' status cannot be read (hand-written)",
  usersReadsFailFileSystems:
    "Users: the file systems cannot be read (hand-written)",
};

export const isUsersScenario = (name: string): name is UsersScenarioName =>
  (USERS_SCENARIOS as readonly string[]).includes(name);

// ---- Failures of the flows ------------------------------------------------------------------------

/** Where the add flows (a person, design 6.6; a group, 10) are made to fail. */
export type UsersAddFailure =
  "check" | "notAdded" | "partly" | "access" | "apply" | "verify" | "cut";

/** usersAddFails: the k-th new person or group (counted together, from 0) meets failure k, wrapping. */
export const USERS_ADD_FAILURES_IN_TURN = [
  "notAdded",
  "partly",
  "access",
  "apply",
  "verify",
  "cut",
] as const satisfies readonly UsersAddFailure[];

const FIXED_ADD_FAILURE: Partial<Record<UsersScenarioName, UsersAddFailure>> = {
  usersAddFailsNotAdded: "notAdded",
  usersAddFailsPartly: "partly",
  usersAddFailsAccess: "access",
  usersAddFailsApply: "apply",
  usersAddFailsVerify: "verify",
  usersAddFailsCut: "cut",
};

/**
 * The failure the k-th new person or group of a story meets at its setUser or setGroup: the fixed one
 * of a usersAddFails<Step> story, the k-th in turn in usersAddFails, none elsewhere. "Try again" after
 * a refusal is a new one too, so usersAddFailsNotAdded refuses only every other one. The check failure
 * is not met here: see usersAddFailsCheck in the getUser answer.
 */
export function usersAddFailureOf(
  name: UsersScenarioName,
  k: number,
): UsersAddFailure | null {
  if (name === "usersAddFails") {
    return (
      USERS_ADD_FAILURES_IN_TURN[k % USERS_ADD_FAILURES_IN_TURN.length] ?? null
    );
  }
  if (name === "usersAddFailsNotAdded" && k % 2 === 1) {
    return null;
  }
  return FIXED_ADD_FAILURE[name] ?? null;
}

/** Where the deletes (a person, design 7.4; a group, 11.3) are made to fail. */
export type UsersDeleteFailure =
  "notEmptied" | "notDeleted" | "access" | "apply" | "cut";

/** usersDeleteFails: the k-th delete of a person, or of a group (counted apart), meets failure k. */
export const USERS_DELETE_FAILURES_IN_TURN = {
  person: ["notDeleted", "access", "apply", "cut"],
  group: ["notEmptied", "notDeleted", "access", "apply", "cut"],
} as const satisfies Record<string, readonly UsersDeleteFailure[]>;

const FIXED_DELETE_FAILURE: Partial<
  Record<UsersScenarioName, UsersDeleteFailure>
> = {
  usersDeleteFailsNotEmptied: "notEmptied",
  usersDeleteFailsNotDeleted: "notDeleted",
  usersDeleteFailsAccess: "access",
  usersDeleteFailsApply: "apply",
  usersDeleteFailsCut: "cut",
};

/**
 * The failure the k-th delete of a person or a group meets. A group's delete starts at the setGroup
 * that empties it (or at deleteGroup when it has no members). A refusal's "Try again" is the next
 * delete, so the two refusing stories refuse only every other one.
 */
export function usersDeleteFailureOf(
  name: UsersScenarioName,
  kind: "person" | "group",
  k: number,
): UsersDeleteFailure | null {
  if (name === "usersDeleteFails") {
    const list = USERS_DELETE_FAILURES_IN_TURN[kind];
    return list[k % list.length] ?? null;
  }
  const fixed = FIXED_DELETE_FAILURE[name] ?? null;
  if (fixed === "notEmptied" && kind === "person") {
    return null;
  }
  if ((fixed === "notEmptied" || fixed === "notDeleted") && k % 2 === 1) {
    return null;
  }
  return fixed;
}

const DELETE_STORIES: readonly UsersScenarioName[] = [
  "usersDeleteFails",
  "usersDeleteFailsNotEmptied",
  "usersDeleteFailsNotDeleted",
  "usersDeleteFailsAccess",
  "usersDeleteFailsApply",
  "usersDeleteFailsCut",
];

// ---- Modules --------------------------------------------------------------------------------------

/**
 * OMV's descriptions of the modules the users methods mark dirty: ssh's as captured, postfix's not
 * captured (""), the rest the shares mock's.
 */
export const USERS_MODULES = {
  ...SHARES_MODULES,
  postfix: "",
  ssh: "A secure shell (SSH) server.",
} as const;
export type UsersModule = keyof typeof USERS_MODULES;

/** The modules a story starts with pending (usersPending: an SMB change not applied). */
export const usersStartsPending = (
  name: UsersScenarioName,
): readonly UsersModule[] =>
  name === "usersPending" ? ["samba", "avahi"] : [];

/**
 * Whether `pnpm dev:mock` starts the story signed in. usersSelfUnknown does, so the boot's probe reads
 * the signed-in name and fails; signing in through the form would give the name in its reply.
 */
export const usersStartsSignedIn = (name: UsersScenarioName): boolean =>
  name === "usersSelfUnknown";

// ---- Small helpers --------------------------------------------------------------------------------

const ok = (value: unknown): FixedAnswer => ({ status: 200, value });
const fail = (status: number, message: string): FixedAnswer => ({
  status,
  message,
  code: 0,
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const asDto = <T>(value: unknown): T => clone(value) as T;
const param = (params: unknown, key: string): unknown =>
  typeof params === "object" && params !== null
    ? (params as Record<string, unknown>)[key]
    : undefined;
const text = (params: unknown, key: string): string => {
  const value = param(params, key);
  return typeof value === "string" ? value : "";
};
const names = (params: unknown, key: string): string[] => {
  const value = param(params, key);
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
};
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const pad = (n: number, width: number) => String(n).padStart(width, "0");

// ---- The captured pieces -------------------------------------------------------------------------

const PERSON = asDto<UserAccount>(
  CONTRACT_EXAMPLES.userMgmtGetUser.person.value,
);
const BUILT_IN_ADMIN = asDto<UserAccount>(
  CONTRACT_EXAMPLES.userMgmtGetUser.builtInAdmin.value,
);
const EXAMPLE_ADMIN = asDto<UserAccount>(
  CONTRACT_EXAMPLES.userMgmtGetUser.administrator.value,
);
/** The documentation key of the captured examples (RFC 4716, as OMV stores it). */
export const EXAMPLE_KEY =
  CONTRACT_EXAMPLES.userMgmtGetUser.withKey.value.sshpubkeys[0];
const { members: _familyMembers, ...FAMILY } = asDto<UserGroup>(
  CONTRACT_EXAMPLES.userMgmtGetGroupList.several.value.data[0],
);
const SSH_GROUP_ROW = asDto<UserGroup>(
  CONTRACT_EXAMPLES.userMgmtGetGroup.sshGroup.value,
);
const ADMIN_GROUP_ROW = asDto<UserGroup>(
  CONTRACT_EXAMPLES.userMgmtGetGroup.adminGroup.value,
);
const SSH_ON = asDto<SshSettings>(CONTRACT_EXAMPLES.sshGet.defaults.value);
const SMB_ON = asDto<SmbSettings>(CONTRACT_EXAMPLES.smbGetSettings.on.value);
const HOME_OFF = asDto<HomeFolderSettings>(
  CONTRACT_EXAMPLES.userMgmtGetSettings.off.value,
);
const { sharedfoldername: _name, ...SHARE_ROW } =
  CONTRACT_EXAMPLES.smbGetShareList.one.value.data[0];
const SHARE_DEFAULTS = asDto<SmbShare>(SHARE_ROW);
/** The scrubber's placeholder, as the captured setUser reply carries it; the transport removes it. */
export const PASSWORD_PLACEHOLDER =
  CONTRACT_EXAMPLES.userMgmtSetUser.created.value.password;

/** The shell commands OMV runs, in the words its errors quote them with (captured). */
const SHELL_ENV =
  "export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin; export LC_ALL=C.UTF-8; export LANGUAGE=; ";
const command = (cmd: string, code: number, output: string) =>
  `Failed to execute command '${SHELL_ENV}${cmd} 2>&1' with exit code '${String(code)}': ${output}`;
const accountTool = (
  tool: "useradd" | "usermod",
  a: { name: string; shell: string; comment: string; groups: string[] },
) =>
  `${tool} --gid 'users' --shell '${a.shell}' --comment '${a.comment}' --groups '${a.groups.join(",")}' '${a.name}'`;
const CAPTURED_EMAIL = CONTRACT_EXAMPLES.userMgmtSetUser.invalidEmail.value
  .message as string;

// OMV's messages: as captured where the VM showed them, the rest written by hand in their form.
export const USERS_MSG = {
  userMissing: (name: string) => `The user '${name}' does not exist.`,
  groupMissing: (name: string) => `The group '${name}' does not exist.`,
  invalidName: (name: string) =>
    `name: The value '${name}' is not a valid user name.`,
  passwordLineBreak: CONTRACT_EXAMPLES.userMgmtSetUser.passwordLineBreak.value
    .message as string,
  invalidEmail: (email: string) =>
    CAPTURED_EMAIL.replace('"not an address"', JSON.stringify(email)),
  commentColon: (a: {
    name: string;
    shell: string;
    comment: string;
    groups: string[];
  }) =>
    command(
      accountTool("usermod", a),
      3,
      `usermod: invalid field '${a.comment}'`,
    ),
  unknownMember: (group: string, members: string[], unknown: string) =>
    command(
      `gpasswd --members '${members.join(",")}' '${group}'`,
      3,
      `gpasswd: user '${unknown}' does not exist`,
    ),
  hasMembers: (group: string) =>
    command(
      `delgroup --only-if-empty '${group}'`,
      41,
      `fatal: The group \`${group}' is not empty!`,
    ),
  // Written by hand: not seen on the VM.
  mainGroup: (group: string, person: string) =>
    command(
      `delgroup --only-if-empty '${group}'`,
      8,
      `fatal: \`${person}' still has \`${group}' as their primary group!`,
    ),
  newCommentColon: (a: {
    name: string;
    shell: string;
    comment: string;
    groups: string[];
  }) =>
    command(
      accountTool("useradd", a),
      3,
      `useradd: invalid field '${a.comment}'`,
    ),
  digitsOnly: (name: string) =>
    command(
      `useradd --gid 'users' '${name}'`,
      3,
      `useradd: invalid user name '${name}': use --badname to ignore`,
    ),
  systemAccount: (name: string) =>
    `Unauthorized attempt to modify the system user account '${name}'`,
  systemGroup: (name: string) =>
    `Unauthorized attempt to modify the system group '${name}'`,
  shellMissing: (shell: string) => `The shell '${shell}' does not exist.`,
  folderMissing: (id: string) =>
    `The configuration object 'conf.system.sharedfolder' with the identifier '${id}' does not exist.`,
  noFolder: "No shared folder was given for the home folders.",
  notAdded: (a: {
    name: string;
    shell: string;
    comment: string;
    groups: string[];
  }) =>
    command(
      accountTool("useradd", a),
      1,
      "useradd: cannot lock /etc/passwd; try again later.",
    ),
  groupNotAdded: (group: string) =>
    command(
      `groupadd '${group}'`,
      10,
      "groupadd: cannot lock /etc/group; try again later.",
    ),
  passwordNotSet: (name: string) =>
    command(
      "chpasswd",
      1,
      `chpasswd: (user ${name}) pam_chauthtok() failed, error: Authentication token manipulation error`,
    ),
  membersNotSet: (group: string, members: string[]) =>
    command(
      `gpasswd --members '${members.join(",")}' '${group}'`,
      1,
      "gpasswd: cannot lock /etc/group; try again later.",
    ),
  notDeleted: (name: string) =>
    command(
      `userdel --force '${name}'`,
      1,
      "userdel: cannot lock /etc/passwd; try again later.",
    ),
  groupNotDeleted: (group: string) =>
    command(
      `delgroup --only-if-empty '${group}'`,
      1,
      "delgroup: cannot lock /etc/group; try again later.",
    ),
  systemDelete: (name: string) =>
    `Unauthorized attempt to delete the system user account '${name}'`,
  selfUnknown: "Failed to read the user account of the current session.",
};
const CUT = fail(504, "Gateway Time-out");

/** Shells that exist on the mock NAS (setUser refuses any other, as OMV does). */
const SHELLS = [
  "/bin/sh",
  "/bin/bash",
  "/bin/dash",
  "/usr/bin/sh",
  "/usr/bin/bash",
  "/usr/bin/dash",
  "/usr/sbin/nologin",
  "/sbin/nologin",
  "/usr/bin/false",
  "/bin/false",
];
const NOLOGIN = "/usr/sbin/nologin";
const LOGIN = "/usr/bin/sh";
const NONEXISTENT = "/nonexistent";

/** OMV's `username` format (the contract's Username). */
const OMV_NAME = /^[a-zA-Z0-9_.][a-zA-Z0-9_.-]*\$?$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ---- The state -----------------------------------------------------------------------------------

/** OMV's record of a person: what an undo brings back. */
interface PersonRecord {
  email: string;
  disallowusermod: boolean;
  sshpubkeys: string[];
}

interface Records {
  people: Record<string, PersonRecord>;
  /** A group's description; a group without a record has none. */
  groups: Record<string, string>;
  home: HomeFolderSettings;
  ssh: SshSettings;
}

export interface UsersMockState {
  name: UsersScenarioName;
  /** The shared folders, SMB and file systems; its `users` are the listed people, `groups` OMV's groups. */
  shares: SharesMockState;
  /** The system accounts: never listed, answered by getUser. */
  system: UserAccount[];
  /** The system groups: never listed, answered by getGroup. Their members follow each account's groups. */
  systemGroups: UserGroup[];
  home: HomeFolderSettings;
  ssh: SshSettings;
  /** SSH is on but does not run (usersSshNotRunning). */
  sshStopped: boolean;
  /** OMV's records as last applied: what an undo brings back. */
  applied: Records;
  /** OMV's record UUIDs, by name ("user:alex", "group:family"). */
  recordUuids: Map<string, string>;
  /** The session's signed-in name; null when it cannot be read. */
  self: string | null;
  /** UUIDs handed out so far. */
  made: number;
  /** New people and groups asked for so far (the failure in turn). */
  newAccounts: number;
  /** usersAddFailsCheck: the name has been taken by someone else once. */
  checkTaken: boolean;
  /** Deletes of people, and of groups, started so far (the failure in turn). */
  personDeletes: number;
  groupDeletes: number;
  /**
   * The failure a group's delete under way will still meet at deleteGroup, once: "none" when its
   * emptying met none, null when no delete is under way.
   */
  groupDeleteArmed: UsersDeleteFailure | "none" | null;
  /** usersReadsFail: the reads that have failed once already. */
  failedOnce: string[];
}

const ENTRY = {
  sda1: uuid(1),
  sdd1: uuid(2),
  sdb1: uuid(3),
  tank: uuid(4),
} as const;

const dirKey = (f: Pick<MockFolder, "mntentref" | "reldirpath">) =>
  `${f.mntentref}|${f.reldirpath}`;

const priv = (type: "user" | "group", name: string, perms: 0 | 5 | 7) => ({
  type,
  name,
  perms,
});

function folder(
  n: number,
  name: string,
  mntentref: string,
  over: Partial<MockFolder> = {},
): MockFolder {
  return {
    uuid: uuid(0x500 + n),
    name,
    comment: "",
    mntentref,
    reldirpath: `${name}/`,
    privileges: [],
    ...over,
  };
}

function share(
  n: number,
  folderUuid: string,
  over: Partial<SmbShare> = {},
): SmbShare {
  return {
    ...clone(SHARE_DEFAULTS),
    uuid: uuid(0x600 + n),
    sharedfolderref: folderUuid,
    ...over,
  };
}

/** A person as getUser reads them, from the captured person: `users` first, then `groups`. */
function person(
  name: string,
  uid: number,
  groups: string[] = [],
  over: Partial<UserAccount> = {},
): UserAccount {
  return {
    ...clone(PERSON),
    name,
    uid,
    gid: 100,
    comment: "",
    dir: `/home/${name}`,
    shell: NOLOGIN,
    groups: ["users", ...groups],
    system: false,
    email: "",
    disallowusermod: false,
    sshpubkeys: [],
    ...over,
  };
}

/** A group made in OMV: no `members` (they follow the people), a description when OMV has a record. */
function omvGroup(name: string, gid: number, comment?: string): UserGroup {
  return {
    name,
    gid,
    system: false,
    ...(comment === undefined ? {} : { comment }),
  };
}

const sysGroup = (name: string, gid: number): UserGroup => ({
  name,
  gid,
  system: true,
});

/** The system groups of every story: the two offered as captured, and the well-known others. */
function systemGroupsOf(name: UsersScenarioName): UserGroup[] {
  const all = [
    sysGroup("root", 0),
    sysGroup("sudo", 27),
    sysGroup("audio", 29),
    sysGroup("users", 100),
    sysGroup(SSH_GROUP_ROW.name, SSH_GROUP_ROW.gid ?? 103),
    sysGroup(ADMIN_GROUP_ROW.name, ADMIN_GROUP_ROW.gid ?? 983),
    sysGroup("docker", 989),
    sysGroup("nogroup", 65534),
  ];
  return name === "usersNoSshGroup"
    ? all.filter((g) => g.name !== "_ssh")
    : all;
}

/**
 * The system accounts: admin as captured, root and nobody. Outside usersSelf and usersSelfUnknown the
 * signed-in example-admin is one too (an administrator account outside the listed numbers, as admin
 * is), so getUser answers for the reader in every story.
 */
function systemAccountsOf(name: UsersScenarioName): UserAccount[] {
  const accounts: UserAccount[] = [
    clone(BUILT_IN_ADMIN),
    {
      ...clone(BUILT_IN_ADMIN),
      name: "root",
      uid: 0,
      gid: 0,
      comment: "root",
      dir: "/root",
      shell: "/bin/bash",
      groups: ["root"],
    },
    {
      ...clone(BUILT_IN_ADMIN),
      name: "nobody",
      uid: 65534,
      gid: 65534,
      comment: "nobody",
      dir: NONEXISTENT,
      shell: NOLOGIN,
      groups: ["nogroup"],
    },
  ];
  if (name !== "usersSelf" && name !== "usersSelfUnknown") {
    accounts.push({
      ...clone(EXAMPLE_ADMIN),
      uid: 990,
      system: true,
      dir: NONEXISTENT,
      shell: NOLOGIN,
    });
  }
  return accounts;
}

interface Story {
  people: UserAccount[];
  groups: UserGroup[];
  folders: MockFolder[];
  shares: SmbShare[];
  smb?: SmbSettings;
  home?: HomeFolderSettings;
  ssh?: SshSettings;
  /** Folders whose directory is not on the disk (their status is ENOENT). */
  missing?: string[];
}

/** The people of usersSome. */
const alex = () =>
  person("alex", 1003, ["openmediavault-admin", "family"], {
    comment: PERSON.comment,
    email: PERSON.email,
  });
const robin = () =>
  person("robin", 1004, ["_ssh", "family", "kids"], {
    comment: "Robin",
    shell: LOGIN,
  });
const sam = () => person("sam", 1005);

/** The folders of usersSome: Photos and Documents shared over SMB, Backups, Homes, a whole disk. */
export const USERS_FOLDERS = {
  photos: uuid(0x501),
  documents: uuid(0x502),
  backups: uuid(0x503),
  homes: uuid(0x504),
  archive: uuid(0x505),
  people: uuid(0x506),
  private: uuid(0x507),
  kids: uuid(0x508),
  gone: uuid(0x5ff),
} as const;

function someStory(): Story {
  const photos = folder(1, "Photos", ENTRY.sdd1, {
    comment: "Family photos",
    privileges: [priv("group", "family", 7), priv("group", "kids", 5)],
  });
  const documents = folder(2, "Documents", ENTRY.sda1, {
    privileges: [priv("user", "alex", 7), priv("group", "family", 5)],
  });
  const backups = folder(3, "Backups", ENTRY.sda1, {
    privileges: [priv("user", "alex", 7)],
  });
  const homes = folder(4, "Homes", ENTRY.sdd1, {
    comment: "Everyone's home folders",
  });
  const archive = folder(5, "Archive", ENTRY.sdb1, {
    reldirpath: "/",
    comment: "The whole archive disk",
  });
  return {
    people: [alex(), robin(), sam()],
    groups: [clone(FAMILY), omvGroup("kids", 1001, "The children")],
    folders: [photos, documents, backups, homes, archive],
    shares: [share(1, photos.uuid), share(2, documents.uuid)],
  };
}

/** The people of the SSH stories: one per reading of design 0.3's table. */
function sshStory(): Story {
  const story = someStory();
  story.people = [
    alex(),
    // In _ssh with a login shell: allowed, and it works.
    robin(),
    // Not in _ssh or root.
    sam(),
    // In _ssh, but the shell opens no command line.
    person("casey", 1006, ["_ssh"], { comment: "No command line" }),
    // In root: allowed whatever else.
    person("jamie", 1007, ["root"], { shell: "/bin/bash" }),
    // In _ssh with a login shell and a key: allowed when only keys are accepted.
    person("morgan", 1008, ["_ssh"], {
      shell: "/bin/bash",
      sshpubkeys: [EXAMPLE_KEY],
    }),
  ];
  return story;
}

function manyStory(): Story {
  const many = newSharesMockState("sharesMany");
  return {
    people: many.users.map((u, i) => ({
      ...u,
      groups: [
        ...(u.groups ?? ["users"]),
        ...(i % 100 === 0 ? ["openmediavault-admin"] : []),
        ...(i % 50 === 1 ? ["_ssh"] : []),
      ],
      shell: i % 50 === 1 ? LOGIN : NOLOGIN,
    })),
    groups: many.groups.map(({ members: _members, ...g }) => g),
    folders: many.config.folders,
    shares: many.config.shares,
  };
}

/** A description of exactly 200 characters, with markup-looking text and a bidi override. */
const LONG_COMMENT =
  `<script>alert(1)</script> ‮evil ${"A long description. ".repeat(10)}`.slice(
    0,
    200,
  );

function hostileStory(): Story {
  const story = someStory();
  story.people = [
    { ...alex(), comment: '<img src=x onerror="alert(1)">' },
    { ...robin(), comment: LONG_COMMENT },
    { ...sam(), comment: "סם ‮evil" },
    // A name with capitals, made in the classic interface, beside alex.
    person("Alex", 1006, ["family"], {
      comment: "Made in the classic interface",
    }),
    // A person called add: the static route /usermgmt/users/add wins over their page.
    person("add", 1007, [], { comment: "<b>add</b>" }),
  ];
  story.groups = [
    { ...clone(FAMILY), comment: "<i>everyone</i> at home" },
    omvGroup("kids", 1001, "ילדים ‮evil"),
    omvGroup("Team.Long", 1002, LONG_COMMENT),
  ];
  story.folders.push(
    folder(9, "<b>x</b>", ENTRY.sdd1, {
      reldirpath: "markup/",
      comment: '<img src=x onerror="alert(1)">',
      privileges: [priv("user", "alex", 7), priv("user", "Alex", 5)],
    }),
  );
  return story;
}

function storyOf(name: UsersScenarioName): Story {
  switch (name) {
    case "usersNone": {
      const photos = folder(1, "Photos", ENTRY.sdd1, {
        comment: "Family photos",
      });
      const documents = folder(2, "Documents", ENTRY.sda1);
      return {
        people: [],
        groups: [],
        folders: [photos, documents],
        shares: [share(1, photos.uuid)],
      };
    }
    case "usersMany":
      return manyStory();
    case "usersSelf":
    case "usersSelfUnknown": {
      const story = someStory();
      story.people.unshift(clone(EXAMPLE_ADMIN));
      return story;
    }
    case "usersSystemGroups": {
      const story = someStory();
      story.people = [
        person("alex", 1003, ["sudo", "docker", "family"], {
          comment: PERSON.comment,
          email: PERSON.email,
        }),
        person("robin", 1004, ["root", "family", "kids"], {
          comment: "Robin",
          shell: "/bin/bash",
        }),
        person("sam", 1005, ["audio"]),
      ];
      return story;
    }
    case "usersSshStates":
    case "usersSshNotRunning":
    case "usersSshUnknown":
      return sshStory();
    case "usersSshOff":
      return { ...sshStory(), ssh: { ...clone(SSH_ON), enable: false } };
    case "usersSshKeysOnly":
      return {
        ...sshStory(),
        ssh: { ...clone(SSH_ON), passwordauthentication: false },
      };
    case "usersNoSshGroup": {
      const story = someStory();
      story.people = [
        alex(),
        person("robin", 1004, ["family", "kids"], {
          comment: "Robin",
          shell: LOGIN,
        }),
        sam(),
      ];
      return story;
    }
    case "usersHomeOn":
    case "usersHomeBroken":
      return {
        ...someStory(),
        smb: { ...clone(SMB_ON), homesenable: true },
        home: { enable: true, sharedfolderref: USERS_FOLDERS.homes },
        missing: name === "usersHomeBroken" ? [USERS_FOLDERS.homes] : [],
      };
    case "usersHomeGone": {
      const story = someStory();
      const people = story.people.map((p) => ({
        ...p,
        dir: `/srv/dev-disk-by-uuid-${uuid(8)}/Old homes/${p.name}`,
      }));
      return {
        ...story,
        people,
        home: { enable: true, sharedfolderref: USERS_FOLDERS.gone },
      };
    }
    case "usersHomeSlow": {
      const photos = folder(1, "Photos", ENTRY.sdd1);
      return {
        people: Array.from({ length: 300 }, (_, i) =>
          person(`example-user-${pad(i + 1, 4)}`, 2000 + i),
        ),
        groups: [],
        folders: [
          photos,
          folder(4, "Homes", ENTRY.sdd1),
          folder(6, "People", ENTRY.sda1),
        ],
        shares: [share(1, photos.uuid)],
      };
    }
    case "usersStaleAccess": {
      const story = someStory();
      for (const f of story.folders) {
        if (f.name === "Photos") {
          f.privileges.push(
            priv("user", "old-user", 5),
            priv("group", "old-team", 7),
          );
        }
        if (f.name === "Documents") {
          f.privileges.push(priv("user", "old-user", 7));
        }
      }
      return story;
    }
    case "usersOnlyAccess": {
      const story = someStory();
      const mine = folder(7, "Private", ENTRY.sdd1, {
        comment: "Only sam can open it",
        privileges: [priv("user", "sam", 7)],
      });
      const kids = folder(8, "Kids", ENTRY.sdd1, {
        privileges: [priv("group", "kids", 7)],
      });
      story.folders.push(mine, kids);
      story.shares.push(share(7, mine.uuid), share(8, kids.uuid));
      return story;
    }
    case "usersMainGroup": {
      const story = someStory();
      const media = omvGroup("media", 1002);
      story.groups.push(media);
      story.people.push(
        // Made outside OMV, with media as their main group: listed first in their groups.
        person("drew", 1006, [], {
          gid: 1002,
          groups: ["media", "users"],
          comment: "Made outside this interface",
        }),
      );
      const first = story.people[0];
      if (first !== undefined) {
        first.groups = [...(first.groups ?? []), "media"];
      }
      return story;
    }
    case "usersHostile":
      return hostileStory();
    default:
      return someStory();
  }
}

/** The path of a person's home folder in a shared folder, as OMV sets it. */
function homePath(
  shares: SharesMockState,
  folderUuid: string,
  name: string,
): string | null {
  const f = shares.config.folders.find((x) => x.uuid === folderUuid);
  const entry = shares.entries.find((e) => e.uuid === f?.mntentref);
  if (f === undefined || entry === undefined) {
    return null;
  }
  const rel = f.reldirpath === "/" ? "" : f.reldirpath;
  return `${entry.fs.mountpoint}/${rel}${name}`;
}

const recordOf = (u: UserAccount): PersonRecord => ({
  email: u.email ?? "",
  disallowusermod: u.disallowusermod ?? false,
  sshpubkeys: clone(u.sshpubkeys ?? []),
});

function snapshot(state: UsersMockState): Records {
  const people: Record<string, PersonRecord> = {};
  for (const u of [...state.shares.users, ...state.system]) {
    people[u.name] = recordOf(u);
  }
  const groups: Record<string, string> = {};
  for (const g of state.shares.groups) {
    if (g.comment !== undefined) {
      groups[g.name] = g.comment;
    }
  }
  return {
    people,
    groups,
    home: clone(state.home),
    ssh: clone(state.ssh),
  };
}

/** Make the folder that holds the home folders in use while they are on (OMV's `_used`). */
function markHomeFolder(state: UsersMockState): void {
  for (const f of state.shares.config.folders) {
    if (state.home.enable && f.uuid === state.home.sharedfolderref) {
      f.usedElsewhere = true;
    } else {
      delete f.usedElsewhere;
    }
  }
}

export function newUsersMockState(name: UsersScenarioName): UsersMockState {
  const story = storyOf(name);
  const base = newSharesMockState("sharesSome");
  const config = {
    folders: story.folders,
    shares: story.shares,
    settings: story.smb ?? clone(SMB_ON),
  };
  const missing = story.missing ?? [];
  const shares: SharesMockState = {
    ...base,
    host: "nas",
    config,
    applied: clone(config),
    users: story.people,
    groups: story.groups,
    dirs: config.folders
      .filter((f) => f.reldirpath !== "/" && !missing.includes(f.uuid))
      .map(dirKey),
  };
  const state: UsersMockState = {
    name,
    shares,
    system: systemAccountsOf(name),
    systemGroups: systemGroupsOf(name),
    home: story.home ?? clone(HOME_OFF),
    ssh: story.ssh ?? clone(SSH_ON),
    sshStopped: name === "usersSshNotRunning",
    applied: {
      people: {},
      groups: {},
      home: clone(HOME_OFF),
      ssh: clone(SSH_ON),
    },
    recordUuids: new Map(),
    self: name === "usersSelfUnknown" ? null : EXAMPLE_ADMIN.name,
    made: 0x700,
    newAccounts: 0,
    checkTaken: false,
    personDeletes: 0,
    groupDeletes: 0,
    groupDeleteArmed: null,
    failedOnce: [],
  };
  if (state.home.enable) {
    for (const p of state.shares.users) {
      p.dir =
        homePath(shares, state.home.sharedfolderref, p.name) ??
        p.dir ??
        NONEXISTENT;
    }
  }
  markHomeFolder(state);
  shares.applied = clone(shares.config);
  state.applied = snapshot(state);
  return state;
}

// ---- Reading the state ---------------------------------------------------------------------------

const accountsOf = (state: UsersMockState) => [
  ...state.shares.users,
  ...state.system,
];

const findAccount = (state: UsersMockState, name: string) =>
  accountsOf(state).find((u) => u.name === name);

const findGroup = (state: UsersMockState, name: string) =>
  state.shares.groups.find((g) => g.name === name) ??
  state.systemGroups.find((g) => g.name === name);

/** A group's members: every account in it, except those whose main group it is (the contract's rule). */
const membersOf = (state: UsersMockState, g: UserGroup): string[] =>
  accountsOf(state)
    .filter((u) => (u.groups ?? []).includes(g.name) && u.gid !== g.gid)
    .map((u) => u.name);

/** The people whose main group it is (made outside OMV). */
const mainGroupOf = (state: UsersMockState, g: UserGroup) =>
  accountsOf(state).filter((u) => u.gid === g.gid);

const accountRow = (u: UserAccount): UserAccount => clone(u);

const groupRow = (state: UsersMockState, g: UserGroup): UserGroup => ({
  name: g.name,
  gid: g.gid,
  members: membersOf(state, g),
  system: g.system ?? false,
  ...(g.comment === undefined ? {} : { comment: g.comment }),
});

/** OMV's getlist: search over every field, sort on a top-level field, then the page. */
function paged<T>(rows: T[], params: unknown): { total: number; data: T[] } {
  const search = text(params, "search").toLowerCase();
  let list =
    search === ""
      ? rows
      : rows.filter((r) => JSON.stringify(r).toLowerCase().includes(search));
  const field = text(params, "sortfield");
  if (field !== "") {
    const dir = text(params, "sortdir") === "desc" ? -1 : 1;
    list = [...list].sort((a, b) => {
      const x = String((a as Record<string, unknown>)[field] ?? "");
      const y = String((b as Record<string, unknown>)[field] ?? "");
      return x < y ? -dir : x > y ? dir : 0;
    });
  }
  const start = Number(param(params, "start") ?? 0) || 0;
  const limit = param(params, "limit");
  const data =
    typeof limit === "number"
      ? list.slice(start, start + limit)
      : list.slice(start);
  return { total: list.length, data };
}

/** The groups as OMV stores them after a save: `users` the main group, first, then the rest once. */
function groupsAfter(sent: readonly string[]): string[] {
  return ["users", ...new Set(sent.filter((g) => g !== "users"))];
}

/** A person's groups changed by a setGroup: in it, or out of it. */
function setMembership(
  state: UsersMockState,
  group: UserGroup,
  members: readonly string[],
): void {
  for (const u of accountsOf(state)) {
    if (u.gid === group.gid) {
      continue;
    }
    const groups = u.groups ?? [];
    const inIt = groups.includes(group.name);
    const wanted = members.includes(u.name);
    if (wanted && !inIt) {
      u.groups = [...groups, group.name];
    } else if (!wanted && inIt) {
      u.groups = groups.filter((g) => g !== group.name);
    }
  }
}

// ---- The answers ---------------------------------------------------------------------------------

interface Call {
  params: unknown;
}
export type UsersReply = (call: Call) => FixedAnswer;

export const USERS_OPERATIONS = [
  ...SHARES_OPERATIONS,
  "userMgmtGetUser",
  "userMgmtSetUser",
  "userMgmtDeleteUser",
  "userMgmtGetGroup",
  "userMgmtSetGroup",
  "userMgmtDeleteGroup",
  "userMgmtGetSettings",
  "userMgmtSetSettings",
  "userMgmtGetUserByContext",
  "sshGet",
  "sshSet",
] as const;
export type UsersOperation = (typeof USERS_OPERATIONS)[number];

/** The reads of this slice, each of which a usersReadsFail story makes fail. */
export const USERS_READS = {
  usersReadsFailUserList: "userMgmtGetUserList",
  usersReadsFailGroupList: "userMgmtGetGroupList",
  usersReadsFailUser: "userMgmtGetUser",
  usersReadsFailGroup: "userMgmtGetGroup",
  usersReadsFailHome: "userMgmtGetSettings",
  usersReadsFailFolders: "shareMgmtGetList",
  usersReadsFailSmbShares: "smbGetShareList",
  usersReadsFailSmbSettings: "smbGetSettings",
  usersReadsFailSsh: "sshGet",
  usersReadsFailServices: "servicesGetStatus",
  usersReadsFailFileSystems: "fileSystemMgmtGetList",
} as const satisfies Partial<Record<UsersScenarioName, UsersOperation>>;
type UsersRead = (typeof USERS_READS)[keyof typeof USERS_READS];

/** The failing reads' messages: written by hand, in the form of OMV's. */
export const READ_FAILURES: Record<UsersRead, string> = {
  userMgmtGetUserList: command(
    "getent passwd",
    2,
    "getent: cannot read the user database",
  ),
  userMgmtGetGroupList: command(
    "getent group",
    2,
    "getent: cannot read the group database",
  ),
  userMgmtGetUser: command(
    "getent passwd",
    2,
    "getent: cannot read the user database",
  ),
  userMgmtGetGroup: command(
    "getent group",
    2,
    "getent: cannot read the group database",
  ),
  userMgmtGetSettings:
    "Failed to execute XPath query '//system/usermanagement/homedirectory'.",
  shareMgmtGetList: "Failed to execute XPath query '//system/shares'.",
  smbGetShareList: "Failed to execute XPath query '//services/smb/shares'.",
  smbGetSettings: "Failed to execute XPath query '//services/smb'.",
  sshGet: "Failed to execute XPath query '//services/ssh'.",
  servicesGetStatus: command(
    "systemctl is-active ssh",
    1,
    "Failed to connect to bus: No such file or directory",
  ),
  fileSystemMgmtGetList: command(
    "findmnt --list --output SOURCE,TARGET",
    1,
    "findmnt: cannot read /proc/self/mountinfo",
  ),
};

const READ_OPS = Object.values(USERS_READS) as UsersRead[];

/**
 * The remembering answers of a users story. `dirty` receives the modules a write marks pending, which
 * the caller adds to what System.getInformation and Config.isDirty report.
 */
export function usersAnswers(
  state: UsersMockState,
  hooks: { dirty: (modules: readonly UsersModule[]) => void },
): Record<UsersOperation, UsersReply> {
  const newUuid = () => uuid(++state.made);
  const recordUuid = (key: string) => {
    const known = state.recordUuids.get(key);
    if (known !== undefined) {
      return known;
    }
    const made = newUuid();
    state.recordUuids.set(key, made);
    return made;
  };
  const shares = sharesAnswers(state.shares, {
    dirty: (modules: readonly SharesModule[]) => hooks.dirty(modules),
  });
  const validName = (name: string) => OMV_NAME.test(name);
  const nextUid = () =>
    Math.max(
      999,
      ...state.shares.users.map((u) => u.uid ?? 0).filter((n) => n < 60000),
    ) + 1;
  const nextGid = () =>
    Math.max(999, ...state.shares.groups.map((g) => g.gid ?? 0)) + 1;
  const homeOf = (name: string) =>
    state.home.enable
      ? (homePath(state.shares, state.home.sharedfolderref, name) ??
        `/home/${name}`)
      : `/home/${name}`;
  const deleteStory = DELETE_STORIES.includes(state.name);

  const own: Record<
    Exclude<UsersOperation, (typeof SHARES_OPERATIONS)[number]>,
    UsersReply
  > & {
    userMgmtGetUserList: UsersReply;
    userMgmtGetGroupList: UsersReply;
    servicesGetStatus: UsersReply;
  } = {
    userMgmtGetUserList: ({ params }) =>
      ok(
        paged(
          state.shares.users.filter((u) => u.system !== true).map(accountRow),
          params,
        ),
      ),

    userMgmtGetGroupList: ({ params }) =>
      ok(
        paged(
          state.shares.groups.map((g) => groupRow(state, g)),
          params,
        ),
      ),

    userMgmtGetUser: ({ params }) => {
      const name = text(params, "name");
      if (!validName(name)) {
        return fail(400, USERS_MSG.invalidName(name));
      }
      let account = findAccount(state, name);
      // usersAddFailsCheck: the first time a free name is looked up, another administrator has just
      // added a person of that name, so the run's check finds "There is now an account called ...".
      if (
        account === undefined &&
        state.name === "usersAddFailsCheck" &&
        !state.checkTaken
      ) {
        state.checkTaken = true;
        account = person(name, nextUid(), [], {
          comment: "Added elsewhere",
          dir: homeOf(name),
        });
        state.shares.users.push(account);
      }
      return account === undefined
        ? fail(500, USERS_MSG.userMissing(name))
        : ok(accountRow(account));
    },

    userMgmtSetUser: ({ params }) => {
      const name = text(params, "name");
      const sent = names(params, "groups");
      const shell = text(params, "shell");
      const password = text(params, "password");
      const email = text(params, "email");
      const comment = text(params, "comment");
      const disallowusermod = param(params, "disallowusermod") === true;
      const sshpubkeys = names(params, "sshpubkeys");
      if (!validName(name)) {
        return fail(400, USERS_MSG.invalidName(name));
      }
      if (/[\r\n]/.test(password)) {
        return fail(400, USERS_MSG.passwordLineBreak);
      }
      if (email !== "" && !EMAIL.test(email)) {
        return fail(400, USERS_MSG.invalidEmail(email));
      }
      const existing = findAccount(state, name);
      if (existing?.system === true) {
        return fail(500, USERS_MSG.systemAccount(name));
      }
      const unknown = sent.find((g) => findGroup(state, g) === undefined);
      if (unknown !== undefined) {
        return fail(500, USERS_MSG.groupMissing(unknown));
      }
      if (shell !== "" && !SHELLS.includes(shell)) {
        return fail(500, USERS_MSG.shellMissing(shell));
      }
      const groups = sent.length === 0 ? ["users"] : groupsAfter(sent);
      const tool = { name, shell, comment, groups };
      const reply = () =>
        ok({
          uuid: recordUuid(`user:${name}`),
          name,
          email,
          disallowusermod,
          sshpubkeys: clone(sshpubkeys),
          groups: clone(sent),
          shell,
          // Never what was sent: the scrubber's placeholder stands for a password that was set.
          password: password === "" ? "" : PASSWORD_PLACEHOLDER,
          comment,
        });

      if (existing === undefined) {
        if (/^\d+$/.test(name)) {
          return fail(500, USERS_MSG.digitsOnly(name));
        }
        if (comment.includes(":")) {
          return fail(500, USERS_MSG.newCommentColon(tool));
        }
        const failure = usersAddFailureOf(state.name, state.newAccounts);
        state.newAccounts += 1;
        if (failure === "notAdded") {
          return fail(500, USERS_MSG.notAdded(tool));
        }
        const made = person(name, nextUid(), [], {
          comment,
          dir: homeOf(name),
          shell: shell === "" ? NOLOGIN : shell,
          groups,
          email,
          disallowusermod,
          sshpubkeys: clone(sshpubkeys),
        });
        if (failure === "verify") {
          // The account is made, but the system did not keep the groups chosen: the run's last check
          // finds them not as chosen.
          made.groups = groups.length > 1 ? ["users"] : ["users", "audio"];
        }
        state.shares.users.push(made);
        hooks.dirty(["postfix"]);
        if (failure === "partly") {
          return fail(500, USERS_MSG.passwordNotSet(name));
        }
        if (failure === "access" || failure === "apply") {
          state.shares.armed = failure;
        }
        return failure === "cut" ? CUT : reply();
      }

      // A change: OMV writes its record first, then changes the account.
      Object.assign(existing, {
        email,
        disallowusermod,
        sshpubkeys: clone(sshpubkeys),
      });
      if (comment.includes(":")) {
        return fail(
          500,
          USERS_MSG.commentColon({
            ...tool,
            shell: shell === "" ? (existing.shell ?? NOLOGIN) : shell,
          }),
        );
      }
      if (sent.length > 0) {
        existing.groups = groups;
        // OMV sets the main group to users on every save (--gid users).
        existing.gid = 100;
      }
      if (shell !== "") {
        existing.shell = shell;
      }
      existing.comment = comment;
      hooks.dirty(["postfix", "ssh"]);
      return reply();
    },

    userMgmtDeleteUser: ({ params }) => {
      const name = text(params, "name");
      if (!validName(name)) {
        return fail(400, USERS_MSG.invalidName(name));
      }
      const account = findAccount(state, name);
      if (account === undefined) {
        return fail(500, USERS_MSG.userMissing(name));
      }
      if (account.system === true) {
        return fail(500, USERS_MSG.systemDelete(name));
      }
      const failure = deleteStory
        ? usersDeleteFailureOf(state.name, "person", state.personDeletes)
        : null;
      if (deleteStory) {
        state.personDeletes += 1;
      }
      if (failure === "notDeleted") {
        return fail(500, USERS_MSG.notDeleted(name));
      }
      const row = accountRow(account);
      // The account goes with its memberships; its files and the folders' access entries stay.
      state.shares.users = state.shares.users.filter((u) => u.name !== name);
      state.recordUuids.delete(`user:${name}`);
      hooks.dirty(["postfix", "ssh"]);
      if (failure === "access" || failure === "apply") {
        state.shares.armed = failure;
      }
      return failure === "cut" ? CUT : ok(row);
    },

    userMgmtGetGroup: ({ params }) => {
      const name = text(params, "name");
      if (!validName(name)) {
        return fail(400, USERS_MSG.invalidName(name));
      }
      const group = findGroup(state, name);
      return group === undefined
        ? fail(500, USERS_MSG.groupMissing(name))
        : ok(groupRow(state, group));
    },

    userMgmtSetGroup: ({ params }) => {
      const name = text(params, "name");
      const comment = text(params, "comment");
      const members = names(params, "members");
      if (!validName(name)) {
        return fail(400, USERS_MSG.invalidName(name));
      }
      if (state.systemGroups.some((g) => g.name === name)) {
        return fail(500, USERS_MSG.systemGroup(name));
      }
      const unknown = members.find((m) => findAccount(state, m) === undefined);
      const reply = (stored: string[]) =>
        ok({
          uuid: recordUuid(`group:${name}`),
          name,
          comment,
          members: clone(stored),
        });
      let group = state.shares.groups.find((g) => g.name === name);

      if (group === undefined) {
        const failure = usersAddFailureOf(state.name, state.newAccounts);
        state.newAccounts += 1;
        if (failure === "notAdded") {
          return fail(500, USERS_MSG.groupNotAdded(name));
        }
        // OMV writes its record and makes the group, then sets the members.
        group = omvGroup(name, nextGid(), comment);
        state.shares.groups.push(group);
        if (failure === "partly") {
          return fail(500, USERS_MSG.membersNotSet(name, members));
        }
        if (unknown !== undefined) {
          return fail(500, USERS_MSG.unknownMember(name, members, unknown));
        }
        let stored = members;
        if (failure === "verify") {
          // Made, but the members are not as chosen.
          const first = state.shares.users[0]?.name;
          stored = members.length > 0 ? [] : first === undefined ? [] : [first];
        }
        setMembership(state, group, stored);
        if (failure === "access" || failure === "apply") {
          state.shares.armed = failure;
        }
        return failure === "cut" ? CUT : reply(members);
      }

      // A change. In a delete story, emptying a group with members is a delete's first step.
      if (
        deleteStory &&
        members.length === 0 &&
        membersOf(state, group).length > 0
      ) {
        const failure = usersDeleteFailureOf(
          state.name,
          "group",
          state.groupDeletes,
        );
        state.groupDeletes += 1;
        if (failure === "notEmptied") {
          return fail(500, USERS_MSG.membersNotSet(name, []));
        }
        state.groupDeleteArmed = failure ?? "none";
        if (failure === "access" || failure === "apply") {
          state.shares.armed = failure;
        }
      }
      group.comment = comment;
      if (unknown !== undefined) {
        return fail(500, USERS_MSG.unknownMember(name, members, unknown));
      }
      setMembership(state, group, members);
      hooks.dirty(["samba"]);
      return reply(members);
    },

    userMgmtDeleteGroup: ({ params }) => {
      const name = text(params, "name");
      if (!validName(name)) {
        return fail(400, USERS_MSG.invalidName(name));
      }
      if (state.systemGroups.some((g) => g.name === name)) {
        return fail(500, USERS_MSG.systemGroup(name));
      }
      const group = state.shares.groups.find((g) => g.name === name);
      if (group === undefined) {
        return fail(500, USERS_MSG.groupMissing(name));
      }
      const main = mainGroupOf(state, group)[0];
      if (main !== undefined) {
        return fail(500, USERS_MSG.mainGroup(name, main.name));
      }
      if (membersOf(state, group).length > 0) {
        return fail(500, USERS_MSG.hasMembers(name));
      }
      let failure: UsersDeleteFailure | null = null;
      if (deleteStory) {
        if (state.groupDeleteArmed !== null) {
          failure =
            state.groupDeleteArmed === "none" ? null : state.groupDeleteArmed;
          state.groupDeleteArmed = null;
        } else {
          failure = usersDeleteFailureOf(
            state.name,
            "group",
            state.groupDeletes,
          );
          state.groupDeletes += 1;
          if (failure === "access" || failure === "apply") {
            state.shares.armed = failure;
          }
        }
      }
      if (failure === "notDeleted") {
        return fail(500, USERS_MSG.groupNotDeleted(name));
      }
      const row = groupRow(state, group);
      state.shares.groups = state.shares.groups.filter((g) => g.name !== name);
      state.recordUuids.delete(`group:${name}`);
      return failure === "cut" ? CUT : ok(row);
    },

    userMgmtGetSettings: () => ok(clone(state.home)),

    userMgmtSetSettings: ({ params }) => {
      const enable = param(params, "enable") === true;
      const ref = text(params, "sharedfolderref");
      if (enable && ref === "") {
        return fail(500, USERS_MSG.noFolder);
      }
      if (enable && !state.shares.config.folders.some((f) => f.uuid === ref)) {
        return fail(500, USERS_MSG.folderMissing(ref));
      }
      state.home = { enable, sharedfolderref: ref };
      // Inside the request, for every person in users: their home folder in the shared folder, or none.
      for (const p of state.shares.users) {
        if ((p.groups ?? []).includes("users")) {
          p.dir = enable
            ? (homePath(state.shares, ref, p.name) ?? NONEXISTENT)
            : NONEXISTENT;
        }
      }
      markHomeFolder(state);
      hooks.dirty(["samba"]);
      // usersHomeSlow: turning them on in People is done on the server, but the request is cut.
      if (
        state.name === "usersHomeSlow" &&
        enable &&
        ref === USERS_FOLDERS.people
      ) {
        return CUT;
      }
      return ok(clone(state.home));
    },

    userMgmtGetUserByContext: () => {
      if (state.self === null) {
        return fail(500, USERS_MSG.selfUnknown);
      }
      const me = findAccount(state, state.self);
      return ok({
        name: state.self,
        comment: me?.comment ?? "",
        email: me?.email ?? "",
        sshpubkeys: clone(me?.sshpubkeys ?? []),
        _readonly: me?.disallowusermod ?? false,
      });
    },

    sshGet: () => ok(clone(state.ssh)),

    sshSet: ({ params }) => {
      state.ssh = { ...state.ssh, ...(params as Partial<SshSettings>) };
      hooks.dirty(["ssh", "avahi"]);
      return ok(clone(state.ssh));
    },

    servicesGetStatus: (call) => {
      const answer = shares.servicesGetStatus(call);
      const value = answer.value as {
        total: number;
        data: { name: string; enabled: boolean; running: boolean }[];
      };
      const enabled = state.applied.ssh.enable;
      return ok({
        ...value,
        data: value.data.map((s) =>
          s.name === "ssh"
            ? { ...s, enabled, running: enabled && !state.sshStopped }
            : s,
        ),
      });
    },
  };

  const all: Record<UsersOperation, UsersReply> = { ...shares, ...own };
  // The failing reads: one for good in a usersReadsFail<Read> story, each once in usersReadsFail.
  const failing: UsersRead | undefined = (
    USERS_READS as Partial<Record<UsersScenarioName, UsersRead>>
  )[state.name];
  for (const op of READ_OPS) {
    const reply = all[op];
    all[op] = (call) => {
      if (op === failing) {
        return fail(500, READ_FAILURES[op]);
      }
      if (state.name === "usersReadsFail" && !state.failedOnce.includes(op)) {
        state.failedOnce.push(op);
        return fail(500, READ_FAILURES[op]);
      }
      return reply(call);
    };
  }
  // usersSshUnknown: SSH's settings cannot be read, so how SSH stands is not known.
  if (state.name === "usersSshUnknown") {
    all.sshGet = () => fail(500, READ_FAILURES.sshGet);
  }
  return all;
}

/** A finished apply: OMV's records are committed, with the shared folders. False when it fails (once). */
export function usersApplied(state: UsersMockState): boolean {
  if (!sharesApplied(state.shares)) {
    return false;
  }
  state.applied = snapshot(state);
  return true;
}

/**
 * A finished undo: OMV's records as last applied come back (the email addresses, the flags and SSH
 * keys, the groups' descriptions, the home-folder and SSH settings, the shared folders and SMB). The
 * accounts, their groups, descriptions and passwords, and every home folder path, stay (B4, V4).
 */
export function usersReverted(state: UsersMockState): void {
  sharesReverted(state.shares);
  for (const u of accountsOf(state)) {
    Object.assign(
      u,
      state.applied.people[u.name] ?? {
        email: "",
        disallowusermod: false,
        sshpubkeys: [],
      },
    );
  }
  for (const g of state.shares.groups) {
    const comment = state.applied.groups[g.name];
    if (comment === undefined) {
      delete g.comment;
    } else {
      g.comment = comment;
    }
  }
  state.home = clone(state.applied.home);
  state.ssh = clone(state.applied.ssh);
  state.groupDeleteArmed = null;
}

/** How long turning home folders on takes in usersHomeSlow, and how long the cut one runs first. */
export const SLOW_HOME_MS = { homes: 40_000, people: 10_000 } as const;

/**
 * The pass-through handlers of a story, for `pnpm dev:mock`: in usersHomeSlow, turning home folders
 * on in Homes is held 40 s, and in People 10 s (then the answer is the cut), before the rpc.php
 * handler answers. They answer nothing themselves. The test renderer does not add them.
 */
export function usersDelayHandlers(name: string) {
  if (name !== "usersHomeSlow") {
    return [];
  }
  return [
    http.post("*/rpc.php", async ({ request }) => {
      let body: { service?: unknown; method?: unknown; params?: unknown };
      try {
        body = (await request.clone().json()) as typeof body;
      } catch {
        return undefined;
      }
      if (
        body.service === "UserMgmt" &&
        body.method === "setSettings" &&
        param(body.params, "enable") === true
      ) {
        const ref = param(body.params, "sharedfolderref");
        const ms =
          ref === USERS_FOLDERS.homes
            ? SLOW_HOME_MS.homes
            : ref === USERS_FOLDERS.people
              ? SLOW_HOME_MS.people
              : 0;
        if (ms > 0) {
          await delay(ms);
        }
      }
      return undefined;
    }),
  ];
}
