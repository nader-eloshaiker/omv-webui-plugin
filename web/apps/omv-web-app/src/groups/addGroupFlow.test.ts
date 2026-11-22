// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  SharedFolder,
  SmbShareRow,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import type {
  TaskRegistry,
  TaskSnapshot,
} from "@omv-webui/react-api-omv/tasks";
import { RpcError } from "@omv-webui/react-api-omv/transport";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addGroupAction,
  addGroupSteps,
  addGroupStore,
  clearAddGroup,
  startAddGroup,
  type AddGroupApi,
  type AddGroupChoices,
} from "./addGroupFlow.ts";

const rpcError = (status: number, message: string, code: number | null = 0) =>
  new RpcError({ status, code, message, operationId: "userMgmtSetGroup" });
const missingGroup = (name: string) =>
  rpcError(500, `The group '${name}' does not exist.`);
const missingUser = (name: string) =>
  rpcError(500, `The user '${name}' does not exist.`);
const cut = () =>
  new RpcError({
    status: 0,
    code: null,
    message: "Failed to fetch",
    operationId: "userMgmtSetGroup",
  });

const PHOTOS = "00000000-0000-4000-8000-000000000101";
const MEDIA = "00000000-0000-4000-8000-000000000102";

function folder(uuid: string, name: string, entries: object[] = []) {
  return {
    uuid,
    name,
    comment: "",
    mntentref: "00000000-0000-4000-8000-000000000001",
    reldirpath: `${name}/`,
    privileges: { privilege: entries },
    status: "OK",
  } as unknown as SharedFolder;
}

const USERS: UserAccount[] = [
  { name: "alex", groups: ["users"] },
  { name: "robin", groups: ["users"] },
];

/** A registry whose tasks end as `outcome` says, as soon as their start resolves. */
function fakeRegistry(outcome: () => "done" | "failed"): TaskRegistry {
  const tasks = new Map<number, TaskSnapshot>();
  const settled = new Set<(t: TaskSnapshot) => void>();
  let next = 1;
  return {
    start(label, begin) {
      const id = next++;
      tasks.set(id, { id, label, state: "running", output: "", startedAt: 0 });
      void begin().then(() => {
        const state = outcome();
        const snap: TaskSnapshot = {
          id,
          label,
          state,
          output: "",
          startedAt: 0,
          endedAt: 1,
          ...(state === "failed"
            ? { error: rpcError(500, "Apply failed.") }
            : {}),
        };
        tasks.set(id, snap);
        for (const l of [...settled]) {
          l(snap);
        }
      });
      return id;
    },
    stop: () => Promise.resolve(),
    get: (id) => tasks.get(id),
    list: () => [...tasks.values()],
    subscribe: () => () => undefined,
    onSettled(listener) {
      settled.add(listener);
      return () => settled.delete(listener);
    },
    dismiss: () => undefined,
    clear: () => undefined,
  };
}

/**
 * A NAS that remembers: setGroup makes or changes the group, setPrivileges stores the list, and
 * pending holds what the writes marked (a new group nothing, a change `samba`).
 */
function nas(over: Partial<AddGroupApi> = {}, shares: SmbShareRow[] = []) {
  const groups = new Map<string, UserGroup>();
  const folders = new Map<string, SharedFolder>([
    [PHOTOS, folder(PHOTOS, "Photos")],
    [MEDIA, folder(MEDIA, "Media")],
  ]);
  let pending: string[] = [];
  const api: AddGroupApi = {
    group: vi.fn((name: string) => {
      const g = groups.get(name);
      return g === undefined
        ? Promise.reject(missingGroup(name))
        : Promise.resolve(g);
    }),
    user: vi.fn((name: string) => Promise.reject(missingUser(name))),
    users: vi.fn(() => Promise.resolve(USERS)),
    groups: vi.fn(() => Promise.resolve([...groups.values()])),
    folders: vi.fn(() => Promise.resolve([...folders.values()])),
    shares: vi.fn(() => Promise.resolve(shares)),
    pending: vi.fn(() => Promise.resolve(pending)),
    setGroup: vi.fn((request) => {
      if (groups.has(request.name)) {
        pending = [...new Set([...pending, "samba"])];
      }
      groups.set(request.name, {
        name: request.name,
        comment: request.comment,
        members: request.members,
      });
      return Promise.resolve({});
    }),
    deleteGroup: vi.fn((name: string) => {
      groups.delete(name);
      return Promise.resolve();
    }),
    setPrivileges: vi.fn((uuid: string, privilege) => {
      const f = folders.get(uuid);
      if (f !== undefined) {
        folders.set(uuid, { ...f, privileges: { privilege } });
      }
      pending = [
        ...new Set([
          ...pending,
          "sharedfolders",
          "systemd",
          ...(shares.length > 0 ? ["samba", "avahi"] : []),
        ]),
      ];
      return Promise.resolve({});
    }),
    apply: () => () => {
      pending = [];
      return Promise.resolve("/tmp/handle");
    },
    ...over,
  };
  return { api, groups, folders, setPending: (p: string[]) => (pending = p) };
}

const CHOICES: AddGroupChoices = {
  name: "family",
  comment: "Everyone at home",
  members: ["alex", "robin"],
  access: {},
};

const registry = (outcome: () => "done" | "failed" = () => "done") => ({
  apply: "Apply",
  registry: fakeRegistry(outcome),
});

const settle = () =>
  vi.waitFor(() => {
    const run = addGroupStore.getState().run;
    expect(run?.busy).toBeNull();
  });

const run = () => {
  const r = addGroupStore.getState().run;
  if (r === null) {
    throw new Error("no run");
  }
  return r;
};

afterEach(() => {
  clearAddGroup();
  addGroupStore.reset();
});

describe("the steps (10)", () => {
  it("leaves out access and its checkpoint when no access was chosen", () => {
    expect(addGroupSteps({ access: {} })).toEqual(["check", "add", "verify"]);
    expect(addGroupSteps({ access: { [PHOTOS]: "rw" } })).toEqual([
      "check",
      "add",
      "access",
      "apply",
      "verify",
    ]);
  });
});

describe("adding a group", () => {
  it("adds it with its members and applies nothing when no access was chosen", async () => {
    const { api } = nas();
    const apply = vi.fn(api.apply);
    expect(startAddGroup({ ...api, apply }, registry(), CHOICES)).toBe(true);
    await settle();
    expect(run().phase).toEqual({ kind: "done", folders: [] });
    expect(api.setGroup).toHaveBeenCalledWith({
      name: "family",
      comment: "Everyone at home",
      members: ["alex", "robin"],
    });
    expect(apply).not.toHaveBeenCalled();
    expect(api.setPrivileges).not.toHaveBeenCalled();
  });

  it("gives access with the whole list, then applies the access modules", async () => {
    const { api, folders } = nas();
    folders.set(
      PHOTOS,
      folder(PHOTOS, "Photos", [{ type: "user", name: "alex", perms: 5 }]),
    );
    startAddGroup(api, registry(), {
      ...CHOICES,
      access: { [PHOTOS]: "rw", [MEDIA]: "ro" },
    });
    await settle();
    expect(run().phase).toEqual({ kind: "done", folders: ["Media", "Photos"] });
    expect(api.setPrivileges).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(api.setPrivileges).mock.calls;
    const firstUuid = calls[0]?.[0];
    const secondUuid = calls[1]?.[0];
    const photos = calls[1]?.[1];
    // Natural order of name: Media, then Photos.
    expect(firstUuid).toBe(MEDIA);
    expect(secondUuid).toBe(PHOTOS);
    expect(photos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "user", name: "alex", perms: 5 }),
        expect.objectContaining({ type: "group", name: "family", perms: 7 }),
      ]),
    );
    expect(run().state.apply?.status).toBe("succeeded");
  });

  it("expects samba and avahi too when a folder given access is shared", async () => {
    const share = {
      uuid: "00000000-0000-4000-8000-000000000201",
      sharedfolderref: PHOTOS,
      guest: "no",
    } as unknown as SmbShareRow;
    const { api } = nas({}, [share]);
    startAddGroup(api, registry(), { ...CHOICES, access: { [PHOTOS]: "rw" } });
    await settle();
    expect(run().shared).toBe(true);
    expect(run().phase.kind).toBe("done");
  });

  it("lists anything else pending at the checkpoint, and applies it only when asked", async () => {
    const one = nas({
      setPrivileges: vi.fn(() => {
        one.setPending(["sharedfolders", "systemd", "postfix"]);
        return Promise.resolve({});
      }),
    });
    startAddGroup(one.api, registry(), {
      ...CHOICES,
      access: { [PHOTOS]: "rw" },
    });
    await settle();
    expect(run().phase).toEqual({ kind: "alsoPending", others: ["postfix"] });
    addGroupAction("applyToo");
    await settle();
    expect(run().phase.kind).not.toBe("alsoPending");
  });
});

describe("step 1 stops before anything is written", () => {
  it("when a group has the name now", async () => {
    const { api, groups } = nas();
    groups.set("family", { name: "family", members: [] });
    startAddGroup(api, registry(), CHOICES);
    await settle();
    expect(run().phase).toEqual({
      kind: "failed",
      at: "check",
      failure: { kind: "takenGroup" },
    });
    expect(api.setGroup).not.toHaveBeenCalled();
  });

  it("when an account has the name, a system one included", async () => {
    const { api } = nas({
      user: vi.fn(() => Promise.resolve({ name: "family", system: true })),
    });
    startAddGroup(api, registry(), CHOICES);
    await settle();
    expect(run().phase).toMatchObject({ failure: { kind: "takenAccount" } });
    expect(api.setGroup).not.toHaveBeenCalled();
  });

  it("when a name read answers anything but that name's 'does not exist'", async () => {
    for (const error of [
      rpcError(500, "The group 'other' does not exist."),
      rpcError(400, "Invalid name."),
      rpcError(500, "The group 'family' does not exist.", 1),
      cut(),
    ]) {
      clearAddGroup();
      const { api } = nas({ group: vi.fn(() => Promise.reject(error)) });
      startAddGroup(api, registry(), CHOICES);
      await settle();
      expect(run().phase).toMatchObject({
        at: "check",
        failure: { kind: "checkRead", error },
      });
      expect(api.setGroup).not.toHaveBeenCalled();
    }
  });

  it("when other changes are pending (R1)", async () => {
    const { api, setPending } = nas();
    setPending(["postfix"]);
    startAddGroup(api, registry(), CHOICES);
    await settle();
    expect(run().phase).toMatchObject({
      failure: { kind: "pending", modules: ["postfix"] },
    });
  });

  it("when a chosen person is no longer listed", async () => {
    const { api } = nas({ users: vi.fn(() => Promise.resolve([USERS[0]!])) });
    startAddGroup(api, registry(), CHOICES);
    await settle();
    expect(run().phase).toMatchObject({
      failure: { kind: "personGone", person: "robin" },
    });
  });
});

describe("step 2's failures (6.6)", () => {
  it("not added: the group is not there, and Try again runs the step again", async () => {
    const one = nas();
    const real = one.api.setGroup;
    let first = true;
    one.api.setGroup = vi.fn((request) => {
      if (first) {
        first = false;
        return Promise.reject(rpcError(500, "Refused."));
      }
      return real(request);
    });
    startAddGroup(one.api, registry(), CHOICES);
    await settle();
    expect(run().phase).toMatchObject({
      at: "add",
      failure: { kind: "notAdded" },
    });
    expect(run().made).toBe(false);
    addGroupAction("deleteAgain");
    expect(one.api.deleteGroup).not.toHaveBeenCalled();
    addGroupAction("retry");
    await settle();
    expect(run().phase.kind).toBe("done");
  });

  it("partly added: Finish setting up sends the same choices again", async () => {
    const one = nas();
    let first = true;
    one.api.setGroup = vi.fn((request) => {
      one.groups.set(request.name, {
        name: request.name,
        comment: request.comment,
        members: first ? [] : request.members,
      });
      if (first) {
        first = false;
        return Promise.reject(
          rpcError(500, "gpasswd: user 'robin' does not exist"),
        );
      }
      return Promise.resolve({});
    });
    startAddGroup(one.api, registry(), CHOICES);
    await settle();
    expect(run().phase).toMatchObject({
      at: "add",
      failure: { kind: "partlyAdded" },
    });
    addGroupAction("finish");
    await settle();
    expect(one.api.setGroup).toHaveBeenCalledTimes(2);
    expect(run().phase.kind).toBe("done");
  });

  it("partly added: Delete it again empties the group, then deletes it", async () => {
    const one = nas();
    let first = true;
    const real = one.api.setGroup;
    one.api.setGroup = vi.fn((request) => {
      if (first) {
        first = false;
        one.groups.set(request.name, { name: request.name, members: [] });
        return Promise.reject(rpcError(500, "Refused."));
      }
      return real(request);
    });
    startAddGroup(one.api, registry(), CHOICES);
    await settle();
    addGroupAction("deleteAgain");
    await settle();
    expect(one.api.setGroup).toHaveBeenLastCalledWith({
      name: "family",
      comment: "Everyone at home",
      members: [],
    });
    expect(one.api.deleteGroup).toHaveBeenCalledWith("family");
    expect(run().phase).toEqual({ kind: "removed" });
  });

  it("a refused delete again says so and keeps the decision", async () => {
    const one = nas({
      deleteGroup: vi.fn(() => Promise.reject(rpcError(500, "Not empty."))),
    });
    let first = true;
    const real = one.api.setGroup;
    one.api.setGroup = vi.fn((request) => {
      if (first) {
        first = false;
        one.groups.set(request.name, { name: request.name, members: [] });
        return Promise.reject(rpcError(500, "Refused."));
      }
      return real(request);
    });
    startAddGroup(one.api, registry(), CHOICES);
    await settle();
    addGroupAction("deleteAgain");
    await settle();
    expect(run().phase).toMatchObject({ failure: { kind: "deleteFailed" } });
  });

  it("a cut request is not known; Check again goes on when the group is there", async () => {
    const one = nas();
    one.api.setGroup = vi.fn((request) => {
      one.groups.set(request.name, {
        name: request.name,
        comment: request.comment,
        members: request.members,
      });
      return Promise.reject(cut());
    });
    startAddGroup(one.api, registry(), CHOICES);
    await settle();
    expect(run().phase).toMatchObject({
      at: "add",
      failure: { kind: "unknown", step: "add" },
    });
    addGroupAction("checkAgain");
    await settle();
    expect(one.api.setGroup).toHaveBeenCalledTimes(1);
    expect(run().phase.kind).toBe("done");
  });

  it("a cut request whose group is not there runs step 2 again on Check again", async () => {
    const one = nas();
    const real = one.api.setGroup;
    let first = true;
    one.api.setGroup = vi.fn((request) => {
      if (first) {
        first = false;
        return Promise.reject(cut());
      }
      return real(request);
    });
    startAddGroup(one.api, registry(), CHOICES);
    await settle();
    addGroupAction("checkAgain");
    await settle();
    expect(one.api.setGroup).toHaveBeenCalledTimes(2);
    expect(run().phase.kind).toBe("done");
  });
});

describe("steps 3 to 5", () => {
  it("access: names the folders not saved, and Try this step again writes only those", async () => {
    const one = nas();
    const real = one.api.setPrivileges;
    let refuse = true;
    one.api.setPrivileges = vi.fn((uuid, list) =>
      uuid === PHOTOS && refuse
        ? Promise.reject(rpcError(500, "Refused."))
        : real(uuid, list),
    );
    startAddGroup(one.api, registry(), {
      ...CHOICES,
      access: { [PHOTOS]: "rw", [MEDIA]: "ro" },
    });
    await settle();
    expect(run().phase).toMatchObject({
      at: "access",
      failure: { kind: "access", failed: ["Photos"] },
    });
    refuse = false;
    vi.mocked(one.api.setPrivileges).mockClear();
    addGroupAction("retry");
    await settle();
    expect(one.api.setPrivileges).toHaveBeenCalledTimes(1);
    expect(vi.mocked(one.api.setPrivileges).mock.calls[0]?.[0]).toBe(PHOTOS);
    expect(run().phase.kind).toBe("done");
  });

  it("access: Stop here ends the run with the group kept", async () => {
    const one = nas({
      setPrivileges: vi.fn(() => Promise.reject(rpcError(500, "Refused."))),
    });
    startAddGroup(one.api, registry(), {
      ...CHOICES,
      access: { [PHOTOS]: "rw" },
    });
    await settle();
    addGroupAction("stop");
    expect(run().phase).toMatchObject({ kind: "stopped", at: "access" });
    expect(one.groups.has("family")).toBe(true);
  });

  it("apply: a failed apply offers Try applying again (R7)", async () => {
    const one = nas();
    let outcome: "done" | "failed" = "failed";
    startAddGroup(
      one.api,
      registry(() => outcome),
      {
        ...CHOICES,
        access: { [PHOTOS]: "rw" },
      },
    );
    await settle();
    expect(run().phase).toMatchObject({
      at: "apply",
      failure: { kind: "apply" },
    });
    outcome = "done";
    addGroupAction("retry");
    await settle();
    expect(run().phase.kind).toBe("done");
  });

  it("verify: members not as chosen", async () => {
    const one = nas({
      group: vi.fn((name: string) =>
        one.groups.has(name)
          ? Promise.resolve({ name, members: ["alex"] })
          : Promise.reject(missingGroup(name)),
      ),
    });
    startAddGroup(one.api, registry(), CHOICES);
    await settle();
    expect(run().phase).toMatchObject({
      at: "verify",
      failure: { kind: "notAsChosen", what: { kind: "members" } },
    });
  });

  it("verify: a folder's access not as chosen", async () => {
    const one = nas();
    one.api.folders = vi.fn(() =>
      Promise.resolve([folder(PHOTOS, "Photos"), folder(MEDIA, "Media")]),
    );
    startAddGroup(one.api, registry(), {
      ...CHOICES,
      access: { [PHOTOS]: "rw" },
    });
    await settle();
    expect(run().phase).toMatchObject({
      at: "verify",
      failure: {
        kind: "notAsChosen",
        what: { kind: "access", folder: "Photos" },
      },
    });
  });

  it("refuses a second run while one is under way", async () => {
    const { api } = nas({
      setPrivileges: vi.fn(() => Promise.reject(rpcError(500, "Refused."))),
    });
    startAddGroup(api, registry(), { ...CHOICES, access: { [PHOTOS]: "rw" } });
    await settle();
    expect(startAddGroup(api, registry(), CHOICES)).toBe(false);
  });
});
