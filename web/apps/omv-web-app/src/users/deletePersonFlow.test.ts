// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  SharedFolder,
  UserAccount,
} from "@omv-webui/react-api-omv/generated";
import { RpcError } from "@omv-webui/react-api-omv/transport";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeRegistry } from "../test/fakeRegistry.ts";
import {
  checkDelete,
  deleteBlocker,
  deleteModules,
  dismissPersonDelete,
  personDeleteDecision,
  personDeleteOf,
  personDeletes,
  startPersonDelete,
  type DeleteCheckApi,
  type DeleteFacts,
  type PersonDeleteApi,
} from "./deletePersonFlow.ts";
import {
  accountId,
  beginAccountAction,
  deletedInSession,
  usersSession,
} from "./usersSession.ts";

const err = (status: number, message: string) =>
  new RpcError({ status, code: 0, message, operationId: "userMgmtDeleteUser" });

const ALEX: UserAccount = {
  name: "alex",
  email: "alex@example.org",
  groups: ["users", "openmediavault-admin", "family", "sudo"],
  sshpubkeys: ["KEY"],
};
const folder = (uuid: string, name: string, entries: object[]) =>
  ({
    uuid,
    name,
    privileges: { privilege: entries },
  }) as unknown as SharedFolder;
const DOCS = folder("d", "Documents", [
  { type: "user", name: "alex", perms: 7 },
  { type: "group", name: "family", perms: 5 },
]);
const BACKUPS = folder("b", "Backups", [
  { type: "user", name: "alex", perms: 7 },
]);
const PHOTOS = folder("p", "Photos", [
  { type: "group", name: "family", perms: 7 },
]);

afterEach(() => {
  dismissPersonDelete("alex");
  personDeletes.reset();
  usersSession.reset();
});

describe("the button's blockers (7.1, 0.8)", () => {
  it("refuses the reader, any administrator while the reader is not known, a running action, a failed read", () => {
    const admin = { groups: ["users", "openmediavault-admin"] };
    const person = { groups: ["users"] };
    expect(
      deleteBlocker({ self: "self", person, unread: null, running: null }),
    ).toEqual({ kind: "self" });
    expect(
      deleteBlocker({
        self: "unknown",
        person: admin,
        unread: null,
        running: null,
      }),
    ).toEqual({ kind: "unknownSelf" });
    expect(
      deleteBlocker({ self: "unknown", person, unread: null, running: null }),
    ).toBeNull();
    expect(
      deleteBlocker({ self: "other", person, unread: null, running: "groups" }),
    ).toEqual({ kind: "running", action: "groups" });
    expect(
      deleteBlocker({
        self: "other",
        person,
        unread: { error: "x" },
        running: null,
      }),
    ).toEqual({ kind: "unread", error: "x" });
  });
});

function checkApi(over: Partial<DeleteCheckApi> = {}): DeleteCheckApi {
  return {
    user: vi.fn(() => Promise.resolve({ ...ALEX })),
    users: vi.fn(() => Promise.resolve([ALEX])),
    groups: vi.fn(() =>
      Promise.resolve([{ name: "family", members: ["alex"] }]),
    ),
    folders: vi.fn(() => Promise.resolve([DOCS, BACKUPS, PHOTOS])),
    shares: vi.fn(() =>
      Promise.resolve([{ sharedfolderref: "b", guest: "no" }] as never),
    ),
    homeSettings: vi.fn(() =>
      Promise.resolve({ enable: true, sharedfolderref: "p" }),
    ),
    pending: vi.fn(() => Promise.resolve([] as string[])),
    ...over,
  };
}

describe("the check before the dialog (7.2)", () => {
  it("gathers what goes and what stays", async () => {
    const check = await checkDelete(checkApi(), ALEX, "other");
    expect(check.kind).toBe("confirm");
    if (check.kind !== "confirm") {
      return;
    }
    expect(check.facts).toMatchObject({
      groups: ["family", "sudo"],
      admin: true,
      ssh: false,
      keys: 1,
      home: { name: "Photos" },
    });
    expect(check.facts.listedIn.map((l) => l.folder.name)).toEqual([
      "Backups",
      "Documents",
    ]);
    // Backups is shared with guest access off and alex is its only one: said, not refused.
    expect(check.facts.listedIn[0]?.leavesNobody).toBe(true);
  });

  it("says the person is gone, refuses on a failed read, and stops when they changed", async () => {
    await expect(
      checkDelete(
        checkApi({
          user: vi.fn(() =>
            Promise.reject(err(500, "The user 'alex' does not exist.")),
          ),
        }),
        ALEX,
        "other",
      ),
    ).resolves.toEqual({ kind: "gone" });
    await expect(
      checkDelete(
        checkApi({ folders: vi.fn(() => Promise.reject(err(500, "No."))) }),
        ALEX,
        "other",
      ),
    ).resolves.toMatchObject({ kind: "refused", blocker: { kind: "unread" } });
    await expect(
      checkDelete(
        checkApi({
          user: vi.fn(() => Promise.resolve({ ...ALEX, groups: ["users"] })),
        }),
        ALEX,
        "other",
      ),
    ).resolves.toEqual({ kind: "changed" });
    await expect(checkDelete(checkApi(), ALEX, "self")).resolves.toEqual({
      kind: "refused",
      blocker: { kind: "self" },
    });
  });

  it("asks for the pre-flight while other changes are pending (R1)", async () => {
    await expect(
      checkDelete(
        checkApi({ pending: vi.fn(() => Promise.resolve(["samba"])) }),
        ALEX,
        "other",
      ),
    ).resolves.toEqual({ kind: "preflight", modules: ["samba"] });
  });
});

describe("the run (7.4)", () => {
  const facts = async (): Promise<DeleteFacts> => {
    const check = await checkDelete(checkApi(), ALEX, "other");
    if (check.kind !== "confirm") {
      throw new Error("no confirm");
    }
    return check.facts;
  };
  const runApi = (over: Partial<PersonDeleteApi["users"]> = {}) => {
    let listed = true;
    const users: PersonDeleteApi["users"] = {
      deleteUser: vi.fn(() => {
        listed = false;
        return Promise.resolve({} as never);
      }),
      users: vi.fn(() => Promise.resolve(listed ? [ALEX] : [])),
      groups: vi.fn(() => Promise.resolve([{ name: "family", members: [] }])),
      folders: vi.fn(() => Promise.resolve([DOCS, BACKUPS, PHOTOS])),
      shares: vi.fn(() => Promise.resolve([])),
      pending: vi.fn(() =>
        Promise.resolve(["postfix", "ssh", "sharedfolders", "systemd"]),
      ),
      setPrivileges: vi.fn(() => Promise.resolve({} as never)),
      ...over,
    };
    return {
      users,
      api: { users, apply: () => () => Promise.resolve("/tmp/h") },
    };
  };
  const settle = () =>
    vi.waitFor(() => expect(personDeleteOf("alex")?.busy).toBe(false));
  const options = { apply: "Apply", registry: fakeRegistry() };

  it("deletes, takes them off each list with every other entry kept, and applies", async () => {
    const { api, users } = runApi();
    expect(startPersonDelete(api, await facts(), true, options)).toBe(true);
    await settle();
    expect(personDeleteOf("alex")?.phase).toEqual({ kind: "done" });
    expect(users.deleteUser).toHaveBeenCalledWith("alex");
    expect(users.setPrivileges).toHaveBeenCalledWith("b", []);
    expect(users.setPrivileges).toHaveBeenCalledWith("d", [
      { type: "group", name: "family", perms: 5 },
    ]);
    expect(deletedInSession(usersSession.getState(), "user", "alex")).toBe(
      true,
    );
  });

  it("leaves the lists alone when the reader unticked it", async () => {
    const { api, users } = runApi({
      pending: vi.fn(() => Promise.resolve(["postfix", "ssh"])),
    });
    startPersonDelete(api, await facts(), false, options);
    await settle();
    expect(users.setPrivileges).not.toHaveBeenCalled();
    expect(personDeleteOf("alex")?.phase).toEqual({ kind: "done" });
  });

  it("is refused while another action on them runs", async () => {
    const { api } = runApi();
    const ready = await facts();
    beginAccountAction(accountId("user", "alex"), "groups");
    expect(startPersonDelete(api, ready, true, options)).toBe(false);
  });

  it("stops at the access step and tries only the folders left", async () => {
    let n = 0;
    const { api, users } = runApi({
      setPrivileges: vi.fn(() => {
        n += 1;
        return n === 1
          ? Promise.reject(err(500, "Busy."))
          : Promise.resolve({} as never);
      }),
    });
    startPersonDelete(api, await facts(), true, options);
    await settle();
    expect(personDeleteOf("alex")?.phase).toMatchObject({
      kind: "failed",
      at: "access",
      folders: ["Backups"],
    });
    personDeleteDecision("alex", "retryAccess");
    await settle();
    expect(personDeleteOf("alex")?.phase).toEqual({ kind: "done" });
    expect(users.setPrivileges).toHaveBeenCalledTimes(3);
  });

  it("says when the request was cut, and checks the list again", async () => {
    const { api } = runApi({
      pending: vi.fn(() => Promise.resolve(["postfix", "ssh"])),
    });
    const real = api.users.deleteUser;
    api.users.deleteUser = vi.fn((name: string) =>
      real(name).then(() => Promise.reject(err(504, "Gateway Timeout"))),
    );
    startPersonDelete(api, await facts(), false, options);
    await settle();
    expect(personDeleteOf("alex")?.phase).toEqual({ kind: "unknown" });
    personDeleteDecision("alex", "checkAgain");
    await settle();
    expect(personDeleteOf("alex")?.phase).toEqual({ kind: "done" });
  });

  it("expects postfix and ssh, and the folders' modules with the access step (R10)", () => {
    expect(deleteModules({ folders: [], shared: false })).toEqual([
      "postfix",
      "ssh",
    ]);
    expect(
      deleteModules({ folders: [{ uuid: "b", name: "B" }], shared: true }),
    ).toEqual(["postfix", "ssh", "sharedfolders", "systemd", "samba", "avahi"]);
  });
});
