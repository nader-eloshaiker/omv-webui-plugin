// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  SharedFolder,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { RpcError } from "@omv-webui/react-api-omv/transport";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeRegistry } from "../test/fakeRegistry.ts";
import {
  addPersonAction,
  addPersonSteps,
  addPersonStore,
  clearAddPerson,
  expectedModules,
  needsPassword,
  newPersonGroups,
  notAsChosen,
  passwordProblem,
  startAddPerson,
  type AddPersonApi,
  type AddPersonChoices,
} from "./addPersonFlow.ts";
import { accountId, runningOnAccount, usersSession } from "./usersSession.ts";

const PASSWORD = "Correct horse 7";
const err = (status: number, message: string) =>
  new RpcError({ status, code: 0, message, operationId: "userMgmtGetUser" });
const missing = (kind: "user" | "group", name: string) =>
  err(500, `The ${kind} '${name}' does not exist.`);

const BACKUPS = "00000000-0000-4000-8000-000000000503";
const GROUPS: UserGroup[] = [{ name: "family", members: [] }];
const CHOICES: AddPersonChoices = {
  name: "casey",
  email: "casey@example.org",
  comment: "",
  groups: ["family"],
  admin: false,
  ssh: true,
  access: { [BACKUPS]: "ro" },
  folderNames: { [BACKUPS]: "Backups" },
  homeFolder: null,
};

/** A NAS where casey does not exist until setUser makes them. */
function fakeApi(over: Partial<AddPersonApi["users"]> = {}) {
  let made = false;
  const backups = (): SharedFolder =>
    ({
      uuid: BACKUPS,
      name: "Backups",
      privileges: {
        privilege: [
          { type: "user", name: "alex", perms: 7 },
          ...(made && writes.length > 0
            ? [{ type: "user", name: "casey", perms: 5 }]
            : []),
        ],
      },
    }) as unknown as SharedFolder;
  const writes: unknown[] = [];
  const casey = (): UserAccount => ({
    name: "casey",
    groups: newPersonGroups(CHOICES, GROUPS),
    shell: "/usr/bin/sh",
  });
  const users: AddPersonApi["users"] = {
    user: vi.fn((name: string) =>
      made && name === "casey"
        ? Promise.resolve(casey())
        : Promise.reject(missing("user", name)),
    ),
    group: vi.fn((name: string) =>
      name === "_ssh" || name === "openmediavault-admin"
        ? Promise.resolve({ name })
        : Promise.reject(missing("group", name)),
    ),
    users: vi.fn(() =>
      Promise.resolve(made ? [{ name: "alex" }, casey()] : [{ name: "alex" }]),
    ),
    groups: vi.fn(() => Promise.resolve(GROUPS)),
    folders: vi.fn(() => Promise.resolve([backups()])),
    shares: vi.fn(() => Promise.resolve([])),
    pending: vi.fn(() =>
      Promise.resolve(
        made ? ["postfix", "sharedfolders", "systemd"] : ([] as string[]),
      ),
    ),
    setUser: vi.fn(() => {
      made = true;
      return Promise.resolve({} as never);
    }),
    deleteUser: vi.fn(() => {
      made = false;
      return Promise.resolve({} as never);
    }),
    setPrivileges: vi.fn((_uuid: string, list: unknown) => {
      writes.push(list);
      return Promise.resolve({} as never);
    }),
    ...over,
  };
  const api: AddPersonApi = {
    users,
    apply: () => () => Promise.resolve("/tmp/handle"),
  };
  return {
    api,
    users,
    writes,
    setMade: (v: boolean) => (made = v),
    isMade: () => made,
  };
}

const labels = { apply: "Apply", registry: fakeRegistry() };
const settle = () =>
  vi.waitFor(() => {
    expect(addPersonStore.getState().run?.busy).toBeNull();
  });
const phase = () => addPersonStore.getState().run?.phase;

afterEach(() => {
  clearAddPerson();
  addPersonStore.reset();
  usersSession.reset();
});

describe("the form's rules", () => {
  it.each([
    ["", "", "empty"],
    ["a\nb", "a\nb", "lineBreak"],
    ["abc", "abd", "mismatch"],
    [" abc ", " abc ", null],
  ] as const)("%j / %j: %s", (password, again, problem) => {
    expect(passwordProblem(password, again)).toBe(problem);
  });

  it("runs the access step only when access was chosen", () => {
    expect(addPersonSteps({ access: {} })).toEqual([
      "check",
      "add",
      "apply",
      "verify",
    ]);
    expect(addPersonSteps(CHOICES)).toContain("access");
  });

  it("makes a new person with users first, never an empty list", () => {
    expect(
      newPersonGroups({ groups: [], admin: false, ssh: false }, GROUPS),
    ).toEqual(["users"]);
    expect(newPersonGroups(CHOICES, GROUPS)).toEqual([
      "users",
      "_ssh",
      "family",
    ]);
  });

  it("expects postfix, and the folders' modules with access (R10)", () => {
    expect(expectedModules({ access: {} }, [])).toEqual(["postfix"]);
    expect(expectedModules(CHOICES, [])).toEqual([
      "postfix",
      "sharedfolders",
      "systemd",
    ]);
    expect(expectedModules(CHOICES, [{ sharedfolderref: BACKUPS }])).toEqual([
      "postfix",
      "sharedfolders",
      "systemd",
      "samba",
      "avahi",
    ]);
  });

  it("tells what is not as chosen at the last step", () => {
    const folder = {
      uuid: BACKUPS,
      name: "Backups",
      privileges: { privilege: [{ type: "user", name: "casey", perms: 5 }] },
    } as unknown as SharedFolder;
    expect(
      notAsChosen(
        CHOICES,
        { name: "casey", groups: ["users", "_ssh", "family"] },
        GROUPS,
        [folder],
      ),
    ).toBeNull();
    expect(
      notAsChosen(CHOICES, { name: "casey", groups: ["users"] }, GROUPS, [
        folder,
      ]),
    ).toEqual({ what: "groups" });
    expect(
      notAsChosen(
        CHOICES,
        { name: "casey", groups: ["users", "_ssh", "family"] },
        GROUPS,
        [],
      ),
    ).toEqual({ what: "access", folder: "Backups" });
  });
});

describe("the run (6.4, 6.5)", () => {
  it("checks the name, adds the person, gives access, applies and checks; no password is kept", async () => {
    const { api, users } = fakeApi();
    expect(startAddPerson(api, labels, CHOICES, PASSWORD)).toBe(true);
    expect(runningOnAccount(accountId("user", "casey"))).toBe("add");
    await settle();
    expect(phase()).toEqual({ kind: "done" });
    expect(users.user).toHaveBeenNthCalledWith(1, "casey");
    expect(users.group).toHaveBeenCalledWith("casey");
    expect(users.group).toHaveBeenCalledWith("_ssh");
    expect(users.setUser).toHaveBeenCalledWith({
      name: "casey",
      password: PASSWORD,
      email: "casey@example.org",
      comment: "",
      groups: ["users", "_ssh", "family"],
      shell: "/usr/bin/sh",
      disallowusermod: false,
      sshpubkeys: [],
    });
    expect(users.setPrivileges).toHaveBeenCalledWith(BACKUPS, [
      { type: "user", name: "alex", perms: 7 },
      { type: "user", name: "casey", perms: 5 },
    ]);
    expect(JSON.stringify(addPersonStore.getState())).not.toContain(PASSWORD);
    expect(JSON.stringify(usersSession.getState())).not.toContain(PASSWORD);
    expect(runningOnAccount(accountId("user", "casey"))).toBeNull();
  });

  it("never writes over an account that exists, or when getUser says something else", async () => {
    const taken = fakeApi();
    taken.setMade(true);
    startAddPerson(taken.api, labels, CHOICES, PASSWORD);
    await settle();
    expect(phase()).toMatchObject({
      kind: "failed",
      at: "check",
      failure: { kind: "takenAccount" },
    });
    expect(taken.users.setUser).not.toHaveBeenCalled();
    clearAddPerson();

    const odd = fakeApi({
      user: vi.fn(() => Promise.reject(err(500, "Something went wrong."))),
    });
    startAddPerson(odd.api, labels, CHOICES, PASSWORD);
    await settle();
    expect(phase()).toMatchObject({
      failure: { kind: "nameUnknown" },
    });
    expect(odd.users.setUser).not.toHaveBeenCalled();
  });

  it("stops when the name is a group, or other changes became pending", async () => {
    const group = fakeApi({
      group: vi.fn(() => Promise.resolve({ name: "casey" })),
    });
    startAddPerson(group.api, labels, CHOICES, PASSWORD);
    await settle();
    expect(phase()).toMatchObject({ failure: { kind: "takenGroup" } });
    clearAddPerson();

    const pending = fakeApi({
      pending: vi.fn(() => Promise.resolve(["samba"])),
    });
    startAddPerson(pending.api, labels, CHOICES, PASSWORD);
    await settle();
    expect(phase()).toMatchObject({
      failure: { kind: "pending", modules: ["samba"] },
    });
  });

  it("tells not added from made-but-not-set-up, and asks for the password again", async () => {
    const refused = fakeApi({
      setUser: vi.fn(() => Promise.reject(err(500, "No."))),
    });
    startAddPerson(refused.api, labels, CHOICES, PASSWORD);
    await settle();
    expect(phase()).toMatchObject({ failure: { kind: "notAdded" } });
    const run = addPersonStore.getState().run;
    expect(run !== null && needsPassword(run)).toBe(true);
    // Without the password the run does not send an empty one.
    addPersonAction("retry");
    await settle();
    expect(refused.users.setUser).toHaveBeenCalledTimes(1);
    clearAddPerson();

    const partly = fakeApi();
    partly.users.setUser = vi.fn(() => {
      partly.setMade(true);
      return Promise.reject(err(500, "chpasswd failed."));
    });
    startAddPerson(partly.api, labels, CHOICES, PASSWORD);
    await settle();
    expect(phase()).toMatchObject({ failure: { kind: "partlyAdded" } });
    addPersonAction("deleteAgain");
    await settle();
    expect(partly.users.deleteUser).toHaveBeenCalledWith("casey");
    expect(phase()).toEqual({ kind: "deleted" });
  });

  it("tries only the folders not saved, and pauses for other pending changes (R10)", async () => {
    let n = 0;
    const flaky = fakeApi();
    const ok = flaky.users.setPrivileges;
    flaky.users.setPrivileges = vi.fn((uuid: string, list: never) => {
      n += 1;
      return n === 1 ? Promise.reject(err(500, "Busy.")) : ok(uuid, list);
    });
    flaky.users.pending = vi.fn(() =>
      Promise.resolve(
        flaky.isMade() ? ["postfix", "sharedfolders", "systemd", "nfs"] : [],
      ),
    );
    startAddPerson(flaky.api, labels, CHOICES, PASSWORD);
    await settle();
    expect(phase()).toMatchObject({
      at: "access",
      failure: { kind: "access", folders: ["Backups"] },
    });
    addPersonAction("retry");
    await settle();
    expect(phase()).toEqual({ kind: "alsoPending", others: ["nfs"] });
    addPersonAction("applyToo");
    await settle();
    expect(phase()).toEqual({ kind: "done" });
  });

  it("says when a request was cut, and checks again from what it sees", async () => {
    const cut = fakeApi();
    const real = cut.users.setUser;
    cut.users.setUser = vi.fn((r: never) =>
      real(r).then(() => Promise.reject(err(504, "Gateway Timeout"))),
    );
    startAddPerson(cut.api, labels, CHOICES, PASSWORD);
    await settle();
    expect(phase()).toMatchObject({
      failure: { kind: "unknown", step: "add" },
    });
    addPersonAction("checkAgain");
    await settle();
    expect(phase()).toEqual({ kind: "done" });
    expect(cut.users.setUser).toHaveBeenCalledTimes(1);
  });
});
