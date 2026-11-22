// SPDX-License-Identifier: GPL-3.0-or-later
// The users stories of the mock (phase 5 users design 17): every reply has the contract's shape, every
// request sent here passes the contract's form schema, and the answers remember what the pages and
// flows do, with the pending modules, refusals and messages the test VM showed (the users brief's
// facts 1 to 13).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import * as F from "@omv-webui/react-api-omv/forms";
import {
  userMgmtSetUser,
  type HomeFolderSettings,
  type SharedFolder,
  type SshSettings,
  type UserAccount,
  type UserGroup,
} from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { describe, expect, it } from "vitest";
// Test code only: the contract's tables, to check every reply.
import {
  OPERATIONS,
  SCHEMAS,
} from "../../../../packages/react-api-omv/src/contract/generated/operations.ts";
import {
  normalise,
  validate,
} from "../../../../packages/react-api-omv/src/transport/schema.ts";
import { answer } from "../test/server.ts";
import {
  isScenarioName,
  newMockSession,
  SCENARIO_GROUPS,
  SCENARIO_LABELS,
  scenarioAnswers,
  SCENARIOS,
  startsSignedIn,
  type ScenarioName,
} from "./scenarios.ts";
import {
  EXAMPLE_KEY,
  isUsersScenario,
  PASSWORD_PLACEHOLDER,
  READ_FAILURES,
  USERS_ADD_FAILURES_IN_TURN,
  USERS_DELETE_FAILURES_IN_TURN,
  USERS_FOLDERS,
  USERS_MSG,
  USERS_OPERATIONS,
  USERS_READS,
  USERS_SCENARIOS,
  usersAddFailureOf,
  usersDelayHandlers,
  usersDeleteFailureOf,
} from "./usersScenarios.ts";

type AnyAnswer =
  | string
  | FixedAnswer
  | ((call: { params: unknown; options: unknown }) => string | FixedAnswer);

const entryOf = (operationId: string) =>
  Object.values(OPERATIONS).find((e) => e.operationId === operationId);

function checked(
  operationId: string,
  answer: string | FixedAnswer | undefined,
) {
  expect(answer, operationId).toBeDefined();
  if (typeof answer === "string" || answer === undefined) {
    return answer;
  }
  if (answer.status === 200) {
    const schema = entryOf(operationId)?.response;
    if (schema === null || schema === undefined) {
      expect(answer.value ?? null, operationId).toBeNull();
    } else {
      expect(
        validate(normalise(answer.value, schema, SCHEMAS), schema, SCHEMAS),
        operationId,
      ).toEqual([]);
    }
  } else {
    expect(answer.message, operationId).toEqual(expect.any(String));
  }
  return answer;
}

/** A request held first to the contract's form schema of its operation. */
function sent<T extends object>(
  schema: { "~standard": { validate: (value: unknown) => unknown } },
  params: T,
): T {
  const result = schema["~standard"].validate(params) as {
    issues?: readonly { message: string }[];
  };
  expect(
    result.issues?.map((i) => i.message),
    JSON.stringify(params),
  ).toBeUndefined();
  return params;
}

const ALL = {
  start: 0,
  limit: null,
  sortfield: null,
  sortdir: null,
  search: null,
};
const APPLY = CONTRACT_EXAMPLES.execGetOutput.appliedFinished.value.filename;
const REVERT = CONTRACT_EXAMPLES.configRevertChangesBg.reverted.value;
const NOLOGIN = "/usr/sbin/nologin";

/** What a new person's setUser sends (design 0.11). */
const newPerson = (
  name: string,
  groups: string[] = ["users"],
  over: Record<string, unknown> = {},
) => ({
  name,
  groups,
  shell: NOLOGIN,
  password: "a test password",
  email: "",
  comment: "",
  disallowusermod: false,
  sshpubkeys: [] as string[],
  ...over,
});

function story(scenario: ScenarioName) {
  const session = newMockSession(true);
  const answers: Readonly<Partial<Record<string, AnyAnswer>>> = scenarioAnswers(
    scenario,
    session,
  );
  const ask = (operationId: string, params: unknown = {}) => {
    const reply = answers[operationId];
    const result =
      typeof reply === "function"
        ? reply({ params, options: undefined })
        : reply;
    return checked(operationId, result);
  };
  const value = <T>(operationId: string, params: unknown = {}): T => {
    const reply = ask(operationId, params);
    expect(reply, operationId).toMatchObject({ status: 200 });
    return (reply as FixedAnswer).value as T;
  };
  const failure = (operationId: string, params: unknown = {}) => {
    const reply = ask(operationId, params) as FixedAnswer;
    expect(reply.status, operationId).not.toBe(200);
    return reply;
  };
  const pending = () =>
    Object.keys(
      value<{ dirtyModules: object }>("systemGetInformation").dirtyModules,
    ).sort();
  const people = () =>
    value<{ data: UserAccount[] }>("userMgmtGetUserList", ALL).data;
  const groups = () =>
    value<{ data: UserGroup[] }>("userMgmtGetGroupList", ALL).data;
  const user = (name: string) =>
    value<UserAccount>(
      "userMgmtGetUser",
      sent(F.UserMgmtDeleteUserRequestSchema, { name }),
    );
  const group = (name: string) =>
    value<UserGroup>(
      "userMgmtGetGroup",
      sent(F.UserMgmtDeleteGroupRequestSchema, { name }),
    );
  const folders = () =>
    value<{ data: SharedFolder[] }>("shareMgmtGetList", ALL).data;
  const folder = (name: string) => {
    const found = folders().find((f) => f.name === name);
    expect(found, name).toBeDefined();
    return found as SharedFolder;
  };
  const entries = (name: string) => {
    const p = folder(name).privileges;
    return typeof p === "string" ? [] : (p?.privilege ?? []);
  };
  const setUser = (params: ReturnType<typeof newPerson>) =>
    ask(
      "userMgmtSetUser",
      sent(F.UserMgmtSetUserRequestSchema, params),
    ) as FixedAnswer;
  /** A change as the person's page sends it: read, change, write (0.11). */
  const change = (
    name: string,
    edit: Partial<ReturnType<typeof newPerson>>,
  ) => {
    const read = user(name);
    return setUser({
      name,
      groups: read.groups ?? [],
      shell: read.shell ?? NOLOGIN,
      password: "",
      email: read.email ?? "",
      comment: read.comment ?? "",
      disallowusermod: read.disallowusermod ?? false,
      sshpubkeys: read.sshpubkeys ?? [],
      ...edit,
    });
  };
  const setGroup = (name: string, members: string[], comment = "") =>
    ask(
      "userMgmtSetGroup",
      sent(F.UserMgmtSetGroupRequestSchema, { name, comment, members }),
    ) as FixedAnswer;
  const deleteUser = (name: string) =>
    ask(
      "userMgmtDeleteUser",
      sent(F.UserMgmtDeleteUserRequestSchema, { name }),
    ) as FixedAnswer;
  const deleteGroup = (name: string) =>
    ask(
      "userMgmtDeleteGroup",
      sent(F.UserMgmtDeleteGroupRequestSchema, { name }),
    ) as FixedAnswer;
  const setPrivileges = (
    name: string,
    privileges: { type: "user" | "group"; name: string; perms: number }[],
  ) =>
    ask(
      "shareMgmtSetPrivileges",
      sent(F.ShareMgmtSetPrivilegesRequestSchema, {
        uuid: folder(name).uuid,
        privileges,
      }),
    ) as FixedAnswer;
  const home = () => value<HomeFolderSettings>("userMgmtGetSettings");
  const setHome = (enable: boolean, sharedfolderref: string) =>
    ask(
      "userMgmtSetSettings",
      sent(F.UserMgmtSetSettingsRequestSchema, { enable, sharedfolderref }),
    ) as FixedAnswer;
  const ssh = () =>
    value<{ data: { name: string; enabled: boolean; running: boolean }[] }>(
      "servicesGetStatus",
    ).data.find((s) => s.name === "ssh");
  const apply = () =>
    ask("execGetOutput", { filename: APPLY, pos: 0 }) as string | FixedAnswer;
  const undo = () => ask("execGetOutput", { filename: REVERT, pos: 0 });
  return {
    session,
    ask,
    value,
    failure,
    pending,
    people,
    groups,
    user,
    group,
    folders,
    folder,
    entries,
    setUser,
    change,
    setGroup,
    deleteUser,
    deleteGroup,
    setPrivileges,
    home,
    setHome,
    ssh,
    apply,
    undo,
  };
}

const namesOf = (rows: readonly { name: string }[]) => rows.map((r) => r.name);

describe("the users stories of the mock", () => {
  it("every users story is a scenario with a label", () => {
    for (const name of USERS_SCENARIOS) {
      expect(isScenarioName(name), name).toBe(true);
      expect(isUsersScenario(name)).toBe(true);
      expect(SCENARIO_LABELS[name]).toEqual(expect.any(String));
    }
    expect(isUsersScenario("sharesSome")).toBe(false);
  });

  it("the picker shows every scenario once, the users stories in their own group", () => {
    const grouped = SCENARIO_GROUPS.flatMap((g) => g.names);
    expect([...grouped].sort()).toEqual([...SCENARIOS].sort());
    expect(
      SCENARIO_GROUPS.find((g) => g.label === "Users and groups")?.names,
    ).toEqual(USERS_SCENARIOS);
  });

  it.each(USERS_SCENARIOS.filter((n) => !n.startsWith("usersReadsFail")))(
    "%s: every read has the contract's shape",
    (scenario) => {
      const s = story(scenario);
      for (const operationId of [
        "userMgmtGetUserList",
        "userMgmtGetGroupList",
        "userMgmtGetSettings",
        "shareMgmtGetList",
        "smbGetShareList",
        "smbGetSettings",
        "servicesGetStatus",
        "fileSystemMgmtGetList",
        "systemGetInformation",
      ]) {
        expect(s.ask(operationId, ALL), operationId).toMatchObject({
          status: 200,
        });
      }
      s.ask("sshGet");
      s.ask("userMgmtGetUserByContext");
      for (const p of s.people().slice(0, 20)) {
        s.user(p.name);
      }
      for (const g of s.groups().slice(0, 20)) {
        s.group(g.name);
      }
    },
  );

  it.each(USERS_SCENARIOS)("%s: answers 401 before sign-in", (scenario) => {
    const answers: Readonly<Partial<Record<string, AnyAnswer>>> =
      scenarioAnswers(scenario, newMockSession(false));
    for (const operationId of USERS_OPERATIONS) {
      const reply = answers[operationId];
      expect(
        typeof reply === "function"
          ? reply({ params: { name: "alex" }, options: undefined })
          : reply,
        operationId,
      ).toMatchObject({ status: 401 });
    }
  });

  it("the default story answers the new operations with captured examples, and marks writes", () => {
    const s = story("admin");
    expect(s.user("alex").name).toBe("alex");
    expect(s.user("admin").system).toBe(true);
    expect(s.failure("userMgmtGetUser", { name: "nobody-here" })).toMatchObject(
      { status: 500, message: "The user 'nobody-here' does not exist." },
    );
    expect(s.group("_ssh").system).toBe(true);
    expect(s.group("family").name).toBe("family");
    expect(s.failure("userMgmtGetGroup", { name: "kids" }).message).toBe(
      "The group 'kids' does not exist.",
    );
    expect(s.ask("userMgmtGetSettings")).toBe("off");
    expect(s.pending()).toEqual([]);
    expect(s.ask("userMgmtSetUser", newPerson("pat"))).toBe("created");
    expect(s.pending()).toEqual(["postfix"]);
    expect(s.ask("userMgmtSetUser", newPerson("alex"))).toBe("changed");
    expect(s.pending()).toEqual(["postfix", "ssh"]);
    expect(s.ask("userMgmtSetGroup", { name: "family" })).toBe("changed");
    expect(s.pending()).toEqual(["postfix", "samba", "ssh"]);
    s.apply();
    expect(s.pending()).toEqual([]);
  });

  it("usersSome: alex, robin and sam; family and kids; no system account or group listed", () => {
    const s = story("usersSome");
    expect(namesOf(s.people())).toEqual(["alex", "robin", "sam"]);
    expect(s.user("alex").groups).toEqual([
      "users",
      "openmediavault-admin",
      "family",
    ]);
    expect(s.user("robin")).toMatchObject({
      groups: ["users", "_ssh", "family", "kids"],
      shell: "/usr/bin/sh",
    });
    expect(s.user("sam").groups).toEqual(["users"]);
    expect(s.groups()).toEqual([
      {
        name: "family",
        gid: 1000,
        members: ["alex", "robin"],
        system: false,
        comment: "Everyone at home",
      },
      {
        name: "kids",
        gid: 1001,
        members: ["robin"],
        system: false,
        comment: "The children",
      },
    ]);
    expect(namesOf(s.folders())).toEqual([
      "Photos",
      "Documents",
      "Backups",
      "Homes",
      "Archive",
    ]);
    expect(s.folder("Archive").reldirpath).toBe("/");
    expect(s.entries("Photos")).toEqual([
      { type: "group", name: "family", perms: 7 },
      { type: "group", name: "kids", perms: 5 },
    ]);
    expect(
      s.value<{ data: unknown[] }>("smbGetShareList", ALL).data,
    ).toHaveLength(2);
    expect(s.ssh()).toMatchObject({ enabled: true, running: true });
    expect(s.value<SshSettings>("sshGet")).toEqual(
      CONTRACT_EXAMPLES.sshGet.defaults.value,
    );
    expect(s.pending()).toEqual([]);
  });

  it("system accounts and groups are answered, never listed (facts 1 and 2)", () => {
    const s = story("usersSome");
    for (const name of ["admin", "root", "nobody", "example-admin"]) {
      expect(s.user(name).system, name).toBe(true);
      expect(namesOf(s.people())).not.toContain(name);
    }
    expect(s.user("admin")).toEqual(
      CONTRACT_EXAMPLES.userMgmtGetUser.builtInAdmin.value,
    );
    expect(s.group("_ssh")).toEqual({
      name: "_ssh",
      gid: 103,
      members: ["robin"],
      system: true,
    });
    expect(s.group("openmediavault-admin")).toEqual({
      name: "openmediavault-admin",
      gid: 983,
      members: ["alex", "admin", "example-admin"],
      system: true,
    });
    expect(namesOf(s.groups())).not.toContain("users");
    expect(namesOf(s.groups())).not.toContain("_ssh");
  });

  it("a missing name is 500 with OMV's exact words; a name failing the pattern is 400 (fact 1)", () => {
    const s = story("usersSome");
    expect(s.failure("userMgmtGetUser", { name: "pat" })).toMatchObject({
      status: 500,
      code: 0,
      message: CONTRACT_EXAMPLES.userMgmtGetUser.missing.value.message.replace(
        "alex",
        "pat",
      ),
    });
    expect(
      s.failure("userMgmtGetGroup", { name: "example-team" }),
    ).toMatchObject({
      status: 500,
      message: CONTRACT_EXAMPLES.userMgmtGetGroup.missing.value.message,
    });
    expect(s.failure("userMgmtGetUser", { name: "-alex" })).toMatchObject({
      status: 400,
      message: CONTRACT_EXAMPLES.userMgmtGetUser.invalidName.value.message,
    });
    expect(s.failure("userMgmtGetGroup", { name: "-alex" }).status).toBe(400);
  });

  it("getUserByContext names the signed-in person; usersSelf lists them; usersSelfUnknown fails", () => {
    const some = story("usersSome");
    expect(some.value<{ name: string }>("userMgmtGetUserByContext").name).toBe(
      "example-admin",
    );
    const self = story("usersSelf");
    expect(self.value<{ name: string }>("userMgmtGetUserByContext").name).toBe(
      "example-admin",
    );
    expect(namesOf(self.people())).toEqual([
      "example-admin",
      "alex",
      "robin",
      "sam",
    ]);
    expect(self.user("example-admin")).toEqual(
      CONTRACT_EXAMPLES.userMgmtGetUser.administrator.value,
    );
    const unknown = story("usersSelfUnknown");
    expect(unknown.failure("userMgmtGetUserByContext").status).toBe(500);
    expect(namesOf(unknown.people())).toContain("example-admin");
    expect(startsSignedIn("usersSelfUnknown")).toBe(true);
    expect(startsSignedIn("usersSome")).toBe(false);
    expect(startsSignedIn("sessionExpired")).toBe(true);
  });

  it("making a person: the account at once, users their main group, /home/<name> with home folders off, postfix pending (facts 3, 4)", () => {
    const s = story("usersSome");
    const reply = s.setUser(
      newPerson("pat", ["users", "family", "_ssh"], {
        shell: "/usr/bin/sh",
        email: "pat@example.org",
        comment: "Pat",
      }),
    );
    expect(reply.status).toBe(200);
    expect(reply.value).toMatchObject({
      name: "pat",
      email: "pat@example.org",
      groups: ["users", "family", "_ssh"],
      shell: "/usr/bin/sh",
      comment: "Pat",
      password: PASSWORD_PLACEHOLDER,
    });
    expect(JSON.stringify(reply.value)).not.toContain("a test password");
    expect(s.user("pat")).toMatchObject({
      name: "pat",
      uid: 1006,
      gid: 100,
      dir: "/home/pat",
      shell: "/usr/bin/sh",
      groups: ["users", "family", "_ssh"],
      system: false,
      email: "pat@example.org",
    });
    expect(namesOf(s.people())).toContain("pat");
    expect(s.group("family").members).toEqual(["alex", "robin", "pat"]);
    expect(s.pending()).toEqual(["postfix"]);
  });

  it("every change to a person marks postfix and ssh; the groups sent replace the whole list; [] leaves them (facts 4, 5)", () => {
    const s = story("usersSome");
    expect(s.change("alex", { comment: "Alex, at home" }).status).toBe(200);
    expect(s.pending()).toEqual(["postfix", "ssh"]);
    expect(s.user("alex").comment).toBe("Alex, at home");
    s.apply();
    expect(s.pending()).toEqual([]);
    // ["users"] takes robin out of every other group, system groups included.
    expect(s.change("robin", { groups: ["users"] }).status).toBe(200);
    expect(s.user("robin").groups).toEqual(["users"]);
    expect(s.group("family").members).toEqual(["alex"]);
    expect(s.group("_ssh").members).toEqual([]);
    // [] changes nothing (the contract never sends it; OMV skips the groups).
    expect(
      s.ask("userMgmtSetUser", {
        ...newPerson("alex", []),
        password: "",
        email: "alex@example.org",
        comment: "Alex, at home",
      }),
    ).toMatchObject({ status: 200 });
    expect(s.user("alex").groups).toEqual([
      "users",
      "openmediavault-admin",
      "family",
    ]);
    // A password: in effect at once; the reply's x-omv-omit field holds the documentation value.
    const reply = s.change("sam", { password: " spaces at the ends " });
    expect((reply.value as { password: string }).password).toBe(
      PASSWORD_PLACEHOLDER,
    );
    expect(JSON.stringify(reply.value)).not.toContain("spaces at the ends");
    // SSH keys sent back as read are stored unchanged.
    expect(s.change("sam", { sshpubkeys: [EXAMPLE_KEY] }).status).toBe(200);
    expect(s.change("sam", { comment: "Sam" }).status).toBe(200);
    expect(s.user("sam").sshpubkeys).toEqual([EXAMPLE_KEY]);
    expect(s.pending()).toEqual(["postfix", "ssh"]);
  });

  it("setUser refusals: unknown group, colon, line break, email, system account (facts 1, 6, 12)", () => {
    const s = story("usersSome");
    expect(
      s.ask("userMgmtSetUser", newPerson("pat", ["users", "example-nogroup"])),
    ).toMatchObject({
      status: 500,
      message: CONTRACT_EXAMPLES.userMgmtSetUser.groupMissing.value.message,
    });
    expect(
      s.ask(
        "userMgmtSetUser",
        newPerson("pat", ["users"], { password: "a\nb" }),
      ),
    ).toMatchObject({
      status: 400,
      message:
        CONTRACT_EXAMPLES.userMgmtSetUser.passwordLineBreak.value.message,
    });
    expect(
      s.ask(
        "userMgmtSetUser",
        newPerson("pat", ["users"], { email: "not an address" }),
      ),
    ).toMatchObject({
      status: 400,
      message: CONTRACT_EXAMPLES.userMgmtSetUser.invalidEmail.value.message,
    });
    // A colon: the captured words, from the account tool.
    const read = s.user("alex");
    expect(
      s.ask("userMgmtSetUser", {
        ...newPerson("alex", ["users"]),
        password: "",
        email: read.email,
        comment: "Alex: at home",
      }),
    ).toMatchObject({
      status: 500,
      message: CONTRACT_EXAMPLES.userMgmtSetUser.commentColon.value.message,
    });
    expect(s.user("alex").comment).toBe("Alex at home");
    for (const name of ["admin", "root", "example-admin"]) {
      expect(s.ask("userMgmtSetUser", newPerson(name))).toMatchObject({
        status: 500,
        message: USERS_MSG.systemAccount(name),
      });
    }
    expect(namesOf(s.people())).toEqual(["alex", "robin", "sam"]);
    expect(s.pending()).toEqual([]);
  });

  it("deleting a person: gone with their memberships, access entries stay, postfix and ssh (facts 4, 9)", () => {
    const s = story("usersSome");
    const reply = s.deleteUser("alex");
    expect(reply.status).toBe(200);
    expect((reply.value as UserAccount).name).toBe("alex");
    expect(namesOf(s.people())).toEqual(["robin", "sam"]);
    expect(s.failure("userMgmtGetUser", { name: "alex" }).message).toBe(
      USERS_MSG.userMissing("alex"),
    );
    expect(s.group("family").members).toEqual(["robin"]);
    expect(s.group("openmediavault-admin").members).not.toContain("alex");
    expect(s.entries("Documents")).toContainEqual({
      type: "user",
      name: "alex",
      perms: 7,
    });
    expect(s.pending()).toEqual(["postfix", "ssh"]);
    // The stale entry cannot be saved back (the shares slice's D9 drops it first).
    expect(
      s.setPrivileges("Documents", [{ type: "user", name: "alex", perms: 7 }])
        .message,
    ).toBe(USERS_MSG.userMissing("alex"));
    expect(
      s.setPrivileges("Documents", [
        { type: "group", name: "family", perms: 5 },
      ]).status,
    ).toBe(200);
    expect(s.entries("Documents")).toEqual([
      { type: "group", name: "family", perms: 5 },
    ]);
    expect(s.pending()).toEqual([
      "avahi",
      "postfix",
      "samba",
      "sharedfolders",
      "ssh",
      "systemd",
    ]);
    expect(s.deleteUser("alex")).toMatchObject({
      status: 500,
      message:
        CONTRACT_EXAMPLES.userMgmtDeleteUser.missing.value.message.replace(
          "robin",
          "alex",
        ),
    });
    expect(s.deleteUser("admin").status).toBe(500);
  });

  it("groups: a new one marks nothing; a change marks samba; members replace the list; [] empties it (facts 4, 5)", () => {
    const s = story("usersSome");
    const made = s.setGroup("example-team", ["alex", "sam"], "The team");
    expect(made.value).toMatchObject({
      name: "example-team",
      comment: "The team",
      members: ["alex", "sam"],
    });
    expect(s.pending()).toEqual([]);
    expect(s.group("example-team")).toEqual({
      name: "example-team",
      gid: 1002,
      members: ["alex", "sam"],
      system: false,
      comment: "The team",
    });
    expect(s.user("sam").groups).toEqual(["users", "example-team"]);
    expect(s.setGroup("example-team", ["robin"], "The team").status).toBe(200);
    expect(s.group("example-team").members).toEqual(["robin"]);
    expect(s.user("sam").groups).toEqual(["users"]);
    expect(s.pending()).toEqual(["samba"]);
    expect(s.setGroup("example-team", [], "The team, again").status).toBe(200);
    expect(s.group("example-team")).toMatchObject({
      members: [],
      comment: "The team, again",
    });
    // A member who does not exist: the captured words, and nothing changes.
    expect(s.setGroup("family", ["example-nobody"])).toMatchObject({
      status: 500,
      message: USERS_MSG.unknownMember(
        "family",
        ["example-nobody"],
        "example-nobody",
      ),
    });
    expect(
      USERS_MSG.unknownMember(
        "example-kids",
        ["example-nobody"],
        "example-nobody",
      ),
    ).toBe(CONTRACT_EXAMPLES.userMgmtSetGroup.unknownMember.value.message);
    expect(s.group("family").members).toEqual(["alex", "robin"]);
    // A system group cannot be changed here.
    expect(s.setGroup("_ssh", ["sam"]).status).toBe(500);
    expect(s.group("_ssh").members).toEqual(["robin"]);
  });

  it("deleting a group: refused with members, then emptied and deleted; nothing pending from the delete (facts 4, 5)", () => {
    const s = story("usersSome");
    expect(s.deleteGroup("family")).toMatchObject({
      status: 500,
      message: USERS_MSG.hasMembers("family"),
    });
    expect(USERS_MSG.hasMembers("example-team")).toBe(
      CONTRACT_EXAMPLES.userMgmtDeleteGroup.hasMembers.value.message,
    );
    expect(s.setGroup("family", [], "Everyone at home").status).toBe(200);
    s.apply();
    const reply = s.deleteGroup("family");
    expect(reply.value).toEqual({
      name: "family",
      gid: 1000,
      members: [],
      system: false,
      comment: "Everyone at home",
    });
    expect(s.pending()).toEqual([]);
    expect(namesOf(s.groups())).toEqual(["kids"]);
    expect(s.user("alex").groups).toEqual(["users", "openmediavault-admin"]);
    // Its access entries stay in the folders' lists.
    expect(s.entries("Photos")).toContainEqual({
      type: "group",
      name: "family",
      perms: 7,
    });
    expect(s.deleteGroup("family").message).toBe(
      USERS_MSG.groupMissing("family"),
    );
  });

  it("usersMainGroup: drew's main group is not among the members and cannot be deleted; saving drew makes users his main group", () => {
    const s = story("usersMainGroup");
    expect(s.group("media").members).toEqual(["alex"]);
    expect(s.group("media").comment).toBeUndefined();
    expect(s.user("drew")).toMatchObject({
      gid: 1002,
      groups: ["media", "users"],
    });
    expect(s.setGroup("media", []).status).toBe(200);
    expect(s.deleteGroup("media")).toMatchObject({
      status: 500,
      message: USERS_MSG.mainGroup("media", "drew"),
    });
    expect(s.change("drew", { groups: ["users"] }).status).toBe(200);
    expect(s.user("drew")).toMatchObject({ gid: 100, groups: ["users"] });
    expect(s.deleteGroup("media").status).toBe(200);
  });

  it("access from a person's or group's page reads back what it wrote, with the shares modules", () => {
    const s = story("usersSome");
    expect(
      s.setPrivileges("Backups", [
        { type: "user", name: "alex", perms: 7 },
        { type: "user", name: "sam", perms: 5 },
      ]).status,
    ).toBe(200);
    expect(s.entries("Backups")).toEqual([
      { type: "user", name: "alex", perms: 7 },
      { type: "user", name: "sam", perms: 5 },
    ]);
    expect(s.pending()).toEqual(["sharedfolders", "systemd"]);
    expect(
      s.setPrivileges("Photos", [{ type: "group", name: "kids", perms: 7 }])
        .status,
    ).toBe(200);
    expect(s.pending()).toEqual(["avahi", "samba", "sharedfolders", "systemd"]);
    // A person made since can be given access.
    s.setUser(newPerson("pat"));
    expect(
      s.setPrivileges("Homes", [{ type: "user", name: "pat", perms: 7 }])
        .status,
    ).toBe(200);
  });

  it("apply commits OMV's records; undo brings back only them, never an account, groups or a description (B4, V4)", () => {
    const s = story("usersSome");
    s.change("alex", { email: "", comment: "Changed", groups: ["users"] });
    s.setGroup("family", ["sam"], "Changed too");
    s.setUser(newPerson("pat", ["users"], { email: "pat@example.org" }));
    s.setPrivileges("Backups", []);
    expect(s.undo()).toBe("revertedFinished");
    expect(s.pending()).toEqual([]);
    // OMV's records came back.
    expect(s.user("alex").email).toBe("alex@example.org");
    expect(s.group("family").comment).toBe("Everyone at home");
    expect(s.entries("Backups")).toEqual([
      { type: "user", name: "alex", perms: 7 },
    ]);
    // The accounts, groups and descriptions did not.
    expect(s.user("alex")).toMatchObject({
      comment: "Changed",
      groups: ["users"],
    });
    expect(s.group("family").members).toEqual(["sam"]);
    expect(s.user("pat")).toMatchObject({ name: "pat", email: "" });
    // After an apply, an undo keeps what was applied.
    s.change("sam", { email: "sam@example.org" });
    expect(s.apply()).toBe("appliedFinished");
    s.change("sam", { email: "" });
    s.undo();
    expect(s.user("sam").email).toBe("sam@example.org");
  });

  it("usersPending starts with SMB changes pending; an apply clears them", () => {
    const s = story("usersPending");
    expect(s.pending()).toEqual(["avahi", "samba"]);
    s.apply();
    expect(s.pending()).toEqual([]);
  });

  it("home folders on: every person's folder in the shared folder, which is in use; off: /nonexistent, the folder kept (fact 10)", () => {
    const s = story("usersSome");
    const homes = s.folder("Homes");
    expect(s.setHome(true, homes.uuid).value).toEqual({
      enable: true,
      sharedfolderref: homes.uuid,
    });
    expect(s.pending()).toEqual(["samba"]);
    expect(s.home()).toEqual({ enable: true, sharedfolderref: homes.uuid });
    expect(s.user("alex").dir).toBe(`${homes.absdirpath}alex`);
    expect(s.folder("Homes")._used).toBe(true);
    // A new person while they are on gets theirs.
    s.setUser(newPerson("pat"));
    expect(s.user("pat").dir).toBe(`${homes.absdirpath}pat`);
    // Deleting the shared folder is refused while it holds them.
    expect(
      s.ask("shareMgmtDelete", { uuid: homes.uuid, recursive: false }),
    ).toMatchObject({ status: 500 });
    expect(s.setHome(false, homes.uuid).status).toBe(200);
    expect(s.home()).toEqual({ enable: false, sharedfolderref: homes.uuid });
    expect(namesOf(s.people()).map((n) => s.user(n).dir)).toEqual([
      "/nonexistent",
      "/nonexistent",
      "/nonexistent",
      "/nonexistent",
    ]);
    expect(s.folder("Homes")._used).toBe(false);
    // A shared folder that does not exist.
    expect(s.setHome(true, USERS_FOLDERS.gone).status).toBe(500);
  });

  it("usersHomeOn, usersHomeBroken and usersHomeGone", () => {
    const on = story("usersHomeOn");
    const homes = on.folder("Homes");
    expect(on.home()).toEqual({ enable: true, sharedfolderref: homes.uuid });
    expect(homes).toMatchObject({ status: "OK", _used: true });
    expect(on.user("robin").dir).toBe(`${homes.absdirpath}robin`);
    expect(
      on.value<{ homesenable: boolean }>("smbGetSettings").homesenable,
    ).toBe(true);
    expect(story("usersHomeBroken").folder("Homes").status).toBe("ENOENT");
    const gone = story("usersHomeGone");
    expect(gone.home()).toEqual({
      enable: true,
      sharedfolderref: USERS_FOLDERS.gone,
    });
    expect(gone.folders().some((f) => f.uuid === USERS_FOLDERS.gone)).toBe(
      false,
    );
  });

  it("usersHomeSlow: 300 people; turning on in People is done but cut; dev:mock delays both", () => {
    const s = story("usersHomeSlow");
    expect(s.people()).toHaveLength(300);
    expect(s.setHome(true, USERS_FOLDERS.people).status).toBe(504);
    expect(s.home()).toEqual({
      enable: true,
      sharedfolderref: USERS_FOLDERS.people,
    });
    expect(s.setHome(true, USERS_FOLDERS.homes).status).toBe(200);
    expect(usersDelayHandlers("usersHomeSlow")).toHaveLength(1);
    expect(usersDelayHandlers("usersSome")).toEqual([]);
  });

  it("SSH: the services' row follows SSH as applied; SSH.set remembers and marks ssh and avahi", () => {
    const s = story("usersSome");
    const settings = s.value<SshSettings>("sshGet");
    s.value(
      "sshSet",
      sent(F.SshSetRequestSchema, { ...settings, enable: false }),
    );
    expect(s.value<SshSettings>("sshGet").enable).toBe(false);
    expect(s.pending()).toEqual(["avahi", "ssh"]);
    expect(s.ssh()).toMatchObject({ enabled: true, running: true });
    s.apply();
    expect(s.ssh()).toMatchObject({ enabled: false, running: false });
  });

  it("the SSH stories: one person per reading, and the SSH settings of each", () => {
    const s = story("usersSshStates");
    expect(namesOf(s.people())).toEqual([
      "alex",
      "robin",
      "sam",
      "casey",
      "jamie",
      "morgan",
    ]);
    expect(s.user("casey")).toMatchObject({
      groups: ["users", "_ssh"],
      shell: NOLOGIN,
    });
    expect(s.user("jamie").groups).toEqual(["users", "root"]);
    expect(s.user("morgan").sshpubkeys).toEqual([EXAMPLE_KEY]);
    expect(story("usersSshOff").value<SshSettings>("sshGet").enable).toBe(
      false,
    );
    expect(story("usersSshOff").ssh()).toMatchObject({
      enabled: false,
      running: false,
    });
    expect(story("usersSshNotRunning").ssh()).toMatchObject({
      enabled: true,
      running: false,
    });
    expect(
      story("usersSshKeysOnly").value<SshSettings>("sshGet"),
    ).toMatchObject({
      passwordauthentication: false,
      pubkeyauthentication: true,
    });
    expect(story("usersSshUnknown").failure("sshGet").status).toBe(500);
  });

  it("usersNoSshGroup: no _ssh group, and allowing SSH is refused", () => {
    const s = story("usersNoSshGroup");
    expect(s.failure("userMgmtGetGroup", { name: "_ssh" }).message).toBe(
      USERS_MSG.groupMissing("_ssh"),
    );
    expect(s.group("openmediavault-admin").system).toBe(true);
    expect(s.change("robin", { groups: ["users", "_ssh"] })).toMatchObject({
      status: 500,
      message: USERS_MSG.groupMissing("_ssh"),
    });
  });

  it("usersSystemGroups: sudo and docker, root, audio", () => {
    const s = story("usersSystemGroups");
    expect(s.user("alex").groups).toEqual([
      "users",
      "sudo",
      "docker",
      "family",
    ]);
    expect(s.user("robin").groups).toContain("root");
    expect(s.user("sam").groups).toEqual(["users", "audio"]);
    expect(s.group("docker").members).toEqual(["alex"]);
  });

  it("usersStaleAccess and usersOnlyAccess", () => {
    const stale = story("usersStaleAccess");
    expect(stale.entries("Photos")).toEqual(
      expect.arrayContaining([
        { type: "user", name: "old-user", perms: 5 },
        { type: "group", name: "old-team", perms: 7 },
      ]),
    );
    expect(namesOf(stale.people())).not.toContain("old-user");
    const only = story("usersOnlyAccess");
    expect(only.entries("Private")).toEqual([
      { type: "user", name: "sam", perms: 7 },
    ]);
    expect(only.entries("Kids")).toEqual([
      { type: "group", name: "kids", perms: 7 },
    ]);
    const shared = only
      .value<{ data: { sharedfolderref: string; guest: string }[] }>(
        "smbGetShareList",
        ALL,
      )
      .data.filter((sh) =>
        [USERS_FOLDERS.private, USERS_FOLDERS.kids].includes(
          sh.sharedfolderref,
        ),
      );
    expect(shared.map((sh) => sh.guest)).toEqual(["no", "no"]);
  });

  it("usersMany: 1,000 people paged on the server, 60 groups, 140 folders", () => {
    const s = story("usersMany");
    expect(s.value<{ total: number }>("userMgmtGetUserList", ALL).total).toBe(
      1000,
    );
    expect(
      s.value<{ total: number; data: unknown[] }>("userMgmtGetUserList", {
        ...ALL,
        start: 50,
        limit: 25,
      }).data,
    ).toHaveLength(25);
    expect(s.groups()).toHaveLength(60);
    expect(s.folders()).toHaveLength(140);
    expect(s.group("example-group-01").members?.length).toBeGreaterThan(10);
    expect(s.user("example-user-0001").groups).toContain(
      "openmediavault-admin",
    );
  });

  it("usersHostile: the text comes back as stored; Alex beside alex; a person called add", () => {
    const s = story("usersHostile");
    expect(namesOf(s.people())).toEqual([
      "alex",
      "robin",
      "sam",
      "Alex",
      "add",
    ]);
    expect(s.user("robin").comment).toHaveLength(200);
    expect(s.user("alex").comment).toBe('<img src=x onerror="alert(1)">');
    expect(s.user("add").name).toBe("add");
    expect(s.group("family").comment).toBe("<i>everyone</i> at home");
    expect(s.folder("<b>x</b>").name).toBe("<b>x</b>");
  });

  it("usersNone: nobody listed, no group, two shared folders", () => {
    const s = story("usersNone");
    expect(s.people()).toEqual([]);
    expect(s.groups()).toEqual([]);
    expect(s.folders()).toHaveLength(2);
    expect(s.user("admin").system).toBe(true);
  });

  describe("the add flows failing", () => {
    it("the failures in turn, and the refusing story refusing every other one", () => {
      expect(
        Array.from({ length: 7 }, (_, k) =>
          usersAddFailureOf("usersAddFails", k),
        ),
      ).toEqual([...USERS_ADD_FAILURES_IN_TURN, "notAdded"]);
      expect(
        [0, 1, 2].map((k) => usersAddFailureOf("usersAddFailsNotAdded", k)),
      ).toEqual(["notAdded", null, "notAdded"]);
      expect(usersAddFailureOf("usersSome", 0)).toBeNull();
    });

    it("check: someone else takes the name, once", () => {
      const s = story("usersAddFailsCheck");
      expect(s.user("pat").comment).toBe("Added elsewhere");
      expect(namesOf(s.people())).toContain("pat");
      expect(s.failure("userMgmtGetUser", { name: "lee" }).message).toBe(
        USERS_MSG.userMissing("lee"),
      );
    });

    it("not added: nothing made, nothing pending; the next try works", () => {
      const s = story("usersAddFailsNotAdded");
      expect(s.setUser(newPerson("pat")).status).toBe(500);
      expect(s.failure("userMgmtGetUser", { name: "pat" }).message).toBe(
        USERS_MSG.userMissing("pat"),
      );
      expect(s.pending()).toEqual([]);
      expect(s.setUser(newPerson("pat")).status).toBe(200);
      expect(s.setGroup("example-team", []).status).toBe(500);
      expect(namesOf(s.groups())).not.toContain("example-team");
    });

    it("partly: the account made with its groups, the password not set; the group made without members", () => {
      const s = story("usersAddFailsPartly");
      expect(s.setUser(newPerson("pat", ["users", "family"]))).toMatchObject({
        status: 500,
        message: USERS_MSG.passwordNotSet("pat"),
      });
      expect(s.user("pat").groups).toEqual(["users", "family"]);
      expect(s.pending()).toEqual(["postfix"]);
      // "Finish setting up": a change with the password asked for again.
      expect(s.change("pat", { password: "again" }).status).toBe(200);
      expect(s.setGroup("example-team", ["alex"]).status).toBe(500);
      expect(s.group("example-team").members).toEqual([]);
    });

    it("access fails once, then works", () => {
      const s = story("usersAddFailsAccess");
      s.setUser(newPerson("pat"));
      expect(
        s.setPrivileges("Homes", [{ type: "user", name: "pat", perms: 7 }])
          .status,
      ).toBe(500);
      expect(
        s.setPrivileges("Homes", [{ type: "user", name: "pat", perms: 7 }])
          .status,
      ).toBe(200);
    });

    it("apply fails once, then works", () => {
      const s = story("usersAddFailsApply");
      s.setUser(newPerson("pat"));
      expect(s.apply()).toBe("applyFailed");
      expect(s.pending()).toEqual(["postfix"]);
      expect(s.apply()).toBe("appliedFinished");
      expect(s.pending()).toEqual([]);
    });

    it("verify: made, but the groups or members are not as chosen", () => {
      const s = story("usersAddFailsVerify");
      expect(s.setUser(newPerson("pat", ["users", "family"])).status).toBe(200);
      expect(s.user("pat").groups).toEqual(["users"]);
      expect(s.setUser(newPerson("lee")).status).toBe(200);
      expect(s.user("lee").groups).toEqual(["users", "audio"]);
      expect(s.setGroup("example-team", ["sam"]).status).toBe(200);
      expect(s.group("example-team").members).toEqual([]);
    });

    it("cut: made in full, the reply cut", () => {
      const s = story("usersAddFailsCut");
      expect(s.setUser(newPerson("pat", ["users", "kids"])).status).toBe(504);
      expect(s.user("pat").groups).toEqual(["users", "kids"]);
      expect(s.setGroup("example-team", ["sam"]).status).toBe(504);
      expect(s.group("example-team").members).toEqual(["sam"]);
    });
  });

  describe("the deletes failing", () => {
    it("the failures in turn, counted apart for people and groups", () => {
      expect(
        [0, 1, 2, 3, 4].map((k) =>
          usersDeleteFailureOf("usersDeleteFails", "person", k),
        ),
      ).toEqual([...USERS_DELETE_FAILURES_IN_TURN.person, "notDeleted"]);
      expect(
        [0, 1, 2, 3, 4].map((k) =>
          usersDeleteFailureOf("usersDeleteFails", "group", k),
        ),
      ).toEqual([...USERS_DELETE_FAILURES_IN_TURN.group]);
      expect(
        usersDeleteFailureOf("usersDeleteFailsNotEmptied", "person", 0),
      ).toBeNull();
      expect(
        [0, 1].map((k) =>
          usersDeleteFailureOf("usersDeleteFailsNotDeleted", "group", k),
        ),
      ).toEqual(["notDeleted", null]);
    });

    it("not deleted: the person stays; the group is left emptied, and its members can be put back", () => {
      const s = story("usersDeleteFailsNotDeleted");
      expect(s.deleteUser("sam")).toMatchObject({
        status: 500,
        message: USERS_MSG.notDeleted("sam"),
      });
      expect(namesOf(s.people())).toContain("sam");
      expect(s.deleteUser("sam").status).toBe(200);
      expect(s.setGroup("family", [], "Everyone at home").status).toBe(200);
      expect(s.deleteGroup("family")).toMatchObject({
        status: 500,
        message: USERS_MSG.groupNotDeleted("family"),
      });
      expect(s.group("family").members).toEqual([]);
      // "Put the members back".
      expect(
        s.setGroup("family", ["alex", "robin"], "Everyone at home").status,
      ).toBe(200);
      expect(s.group("family").members).toEqual(["alex", "robin"]);
    });

    it("not emptied: the group keeps its members; the next try empties it", () => {
      const s = story("usersDeleteFailsNotEmptied");
      expect(s.setGroup("family", [], "Everyone at home").status).toBe(500);
      expect(s.group("family").members).toEqual(["alex", "robin"]);
      expect(s.pending()).toEqual([]);
      expect(s.setGroup("family", [], "Everyone at home").status).toBe(200);
      expect(s.deleteGroup("family").status).toBe(200);
    });

    it("access and apply fail once after the delete", () => {
      const access = story("usersDeleteFailsAccess");
      expect(access.deleteUser("alex").status).toBe(200);
      expect(access.setPrivileges("Backups", []).status).toBe(500);
      expect(access.setPrivileges("Backups", []).status).toBe(200);
      const apply = story("usersDeleteFailsApply");
      expect(apply.deleteGroup("kids").status).toBe(500);
      apply.setGroup("kids", [], "The children");
      expect(apply.deleteGroup("kids").status).toBe(200);
      expect(apply.apply()).toBe("applyFailed");
      expect(apply.apply()).toBe("appliedFinished");
    });

    it("cut: done on the server, the reply cut", () => {
      const s = story("usersDeleteFailsCut");
      expect(s.deleteUser("sam").status).toBe(504);
      expect(namesOf(s.people())).not.toContain("sam");
      s.setGroup("kids", [], "The children");
      expect(s.deleteGroup("kids").status).toBe(504);
      expect(namesOf(s.groups())).not.toContain("kids");
    });
  });

  describe("the reads failing", () => {
    it.each(Object.entries(USERS_READS))(
      "%s: %s fails every time, with a message",
      (scenario, operationId) => {
        const s = story(scenario as ScenarioName);
        for (let i = 0; i < 2; i += 1) {
          expect(s.ask(operationId, { ...ALL, name: "alex" })).toMatchObject({
            status: 500,
            message: READ_FAILURES[operationId as keyof typeof READ_FAILURES],
          });
        }
      },
    );

    it("usersReadsFail: each read fails once, then answers", () => {
      const s = story("usersReadsFail");
      for (const operationId of Object.values(USERS_READS)) {
        const params = {
          ...ALL,
          name: operationId === "userMgmtGetGroup" ? "family" : "alex",
        };
        expect(s.ask(operationId, params), operationId).toMatchObject({
          status: 500,
        });
        expect(s.ask(operationId, params), operationId).toMatchObject({
          status: 200,
        });
      }
    });
  });

  it("the transport removes the password from setUser's reply (UI-6)", async () => {
    answer(scenarioAnswers("usersSome", newMockSession(true)));
    const saved = await userMgmtSetUser(
      sent(F.UserMgmtSetUserRequestSchema, newPerson("pat")),
    );
    expect(saved.name).toBe("pat");
    expect(saved).not.toHaveProperty("password");
    expect(JSON.stringify(saved)).not.toContain(PASSWORD_PLACEHOLDER);
  });
});
