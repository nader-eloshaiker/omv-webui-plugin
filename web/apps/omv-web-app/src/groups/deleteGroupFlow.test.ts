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
  accountId,
  deletedInSession,
  runningOnAccount,
  usersSession,
} from "../users/usersSession.ts";
import {
  dismissGroupDelete,
  groupDeleteDecision,
  groupDeleteOf,
  groupDeletes,
  groupDeleteSteps,
  startGroupDelete,
  type GroupDeleteApi,
  type GroupDeleteInput,
} from "./deleteGroupFlow.ts";

const groupRunningOn = (name: string) =>
  runningOnAccount(accountId("group", name));
const deletedThisSession = (name: string) =>
  deletedInSession(usersSession.getState(), "group", name);

const rpcError = (status: number, message: string, code: number | null = 0) =>
  new RpcError({ status, code, message, operationId: "userMgmtDeleteGroup" });
const cut = () =>
  new RpcError({
    status: 504,
    code: null,
    message: "Gateway Timeout",
    operationId: "userMgmtDeleteGroup",
  });
const missing = (name: string) =>
  rpcError(500, `The group '${name}' does not exist.`);

function fakeRegistry(outcome: () => "done" | "failed" = () => "done") {
  const tasks = new Map<number, TaskSnapshot>();
  const settled = new Set<(t: TaskSnapshot) => void>();
  let next = 1;
  const registry: TaskRegistry = {
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
  return { registry, started: () => tasks.size };
}

const PHOTOS = "00000000-0000-4000-8000-000000000301";
const MEDIA = "00000000-0000-4000-8000-000000000302";

const folder = (
  uuid: string,
  name: string,
  privileges: { type: "user" | "group"; name: string; perms: number }[],
): SharedFolder =>
  ({
    uuid,
    name,
    privileges: { privilege: privileges },
  }) as unknown as SharedFolder;

const FOLDERS = [
  folder(PHOTOS, "Photos", [
    { type: "group", name: "family", perms: 7 },
    { type: "user", name: "alex", perms: 7 },
  ]),
  folder(MEDIA, "Media", [{ type: "group", name: "family", perms: 5 }]),
];
const USERS = [{ name: "alex" }, { name: "robin" }] as UserAccount[];

function api(over: Partial<GroupDeleteApi> = {}): GroupDeleteApi {
  return {
    setGroup: vi.fn(() => Promise.resolve({})),
    deleteGroup: vi.fn(() => Promise.resolve(undefined)),
    group: vi.fn(() => Promise.reject(missing("family"))),
    folders: vi.fn(() => Promise.resolve(FOLDERS)),
    users: vi.fn(() => Promise.resolve(USERS)),
    groups: vi.fn(() => Promise.resolve([] as UserGroup[])),
    shares: vi.fn(() => Promise.resolve([] as SmbShareRow[])),
    setPrivileges: vi.fn(() => Promise.resolve({})),
    pending: vi.fn(() =>
      Promise.resolve(["samba", "sharedfolders", "systemd"]),
    ),
    apply: () => () => Promise.resolve("/tmp/handle"),
    ...over,
  };
}

const INPUT: GroupDeleteInput = {
  name: "family",
  comment: "Everyone at home",
  members: ["alex", "robin"],
  access: [PHOTOS, MEDIA],
};

const settle = () =>
  vi.waitFor(() => {
    expect(groupDeleteOf("family")?.busy).toBe(false);
  });

afterEach(() => {
  groupDeletes.reset();
  usersSession.reset();
});

describe("the steps of deleting a group (11.3)", () => {
  it("has the empty step only with members, the access step only when ticked", () => {
    expect(groupDeleteSteps(INPUT)).toEqual([
      "empty",
      "delete",
      "access",
      "save",
    ]);
    expect(groupDeleteSteps({ members: [], access: [] })).toEqual([
      "delete",
      "save",
    ]);
  });

  it("empties it, deletes it, takes it off both folders and applies what it left", async () => {
    const calls = api();
    const { registry, started } = fakeRegistry();
    expect(startGroupDelete(calls, INPUT, { apply: "Apply", registry })).toBe(
      true,
    );
    expect(groupRunningOn("family")).toBe("delete");
    await settle();
    expect(calls.setGroup).toHaveBeenCalledWith({
      name: "family",
      comment: "Everyone at home",
      members: [],
    });
    expect(calls.deleteGroup).toHaveBeenCalledWith("family");
    // Every other entry is kept; the group's goes.
    expect(calls.setPrivileges).toHaveBeenCalledWith(PHOTOS, [
      { type: "user", name: "alex", perms: 7 },
    ]);
    expect(calls.setPrivileges).toHaveBeenCalledWith(MEDIA, []);
    expect(started()).toBe(1);
    expect(groupDeleteOf("family")?.phase).toEqual({ kind: "done" });
    expect(deletedThisSession("family")).toBe(true);
    expect(groupRunningOn("family")).toBeNull();
  });

  it("with nobody in it and no folders, deletes it and applies nothing (nothing is pending)", async () => {
    const calls = api({ pending: vi.fn(() => Promise.resolve([])) });
    const { registry, started } = fakeRegistry();
    startGroupDelete(
      calls,
      { ...INPUT, members: [], access: [] },
      { apply: "Apply", registry },
    );
    await settle();
    expect(calls.setGroup).not.toHaveBeenCalled();
    expect(calls.setPrivileges).not.toHaveBeenCalled();
    expect(started()).toBe(0);
    expect(groupDeleteOf("family")?.phase).toEqual({ kind: "done" });
  });

  it("asks before applying a change it did not make (R10)", async () => {
    const calls = api({
      pending: vi.fn(() => Promise.resolve(["samba", "nfs"])),
    });
    const { registry, started } = fakeRegistry();
    startGroupDelete(
      calls,
      { ...INPUT, access: [] },
      { apply: "Apply", registry },
    );
    await settle();
    expect(groupDeleteOf("family")?.phase).toEqual({
      kind: "alsoPending",
      others: ["nfs"],
    });
    expect(started()).toBe(0);
    groupDeleteDecision("family", "applyToo");
    await settle();
    expect(started()).toBe(1);
    expect(groupDeleteOf("family")?.phase).toEqual({ kind: "done" });
  });

  it("stops at the first step with the server's words; nothing else is called", async () => {
    const error = rpcError(500, "gpasswd failed");
    const calls = api({ setGroup: vi.fn(() => Promise.reject(error)) });
    startGroupDelete(calls, INPUT, {
      apply: "Apply",
      registry: fakeRegistry().registry,
    });
    await settle();
    expect(groupDeleteOf("family")?.phase).toEqual({
      kind: "failed",
      at: "empty",
      error,
    });
    expect(calls.deleteGroup).not.toHaveBeenCalled();
  });

  it("when deleting fails after emptying, puts the members back on request", async () => {
    const error = rpcError(500, "delgroup failed");
    const deleteGroup = vi.fn(() => Promise.reject(error));
    const calls = api({ deleteGroup });
    startGroupDelete(calls, INPUT, {
      apply: "Apply",
      registry: fakeRegistry().registry,
    });
    await settle();
    expect(groupDeleteOf("family")).toMatchObject({
      emptied: true,
      phase: { kind: "failed", at: "delete", error },
    });
    expect(deletedThisSession("family")).toBe(false);
    groupDeleteDecision("family", "putBack");
    await settle();
    expect(calls.setGroup).toHaveBeenLastCalledWith({
      name: "family",
      comment: "Everyone at home",
      members: ["alex", "robin"],
    });
    expect(groupDeleteOf("family")?.phase).toEqual({ kind: "putBack" });
    // Never retried by itself (UI-14).
    expect(deleteGroup).toHaveBeenCalledTimes(1);
  });

  it("tries deleting again on request, without emptying it twice", async () => {
    const deleteGroup = vi
      .fn<GroupDeleteApi["deleteGroup"]>()
      .mockRejectedValueOnce(rpcError(500, "busy"))
      .mockResolvedValue(undefined);
    const calls = api({ deleteGroup });
    const { registry } = fakeRegistry();
    startGroupDelete(calls, INPUT, { apply: "Apply", registry });
    await settle();
    groupDeleteDecision("family", "retryDelete");
    await settle();
    expect(calls.setGroup).toHaveBeenCalledTimes(1);
    expect(groupDeleteOf("family")?.phase).toEqual({ kind: "done" });
  });

  it("says which folders still list it when taking it off fails, and tries only those again", async () => {
    const setPrivileges = vi
      .fn<GroupDeleteApi["setPrivileges"]>()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(rpcError(500, "refused"))
      .mockResolvedValue({});
    // Media sorts before Photos: Media is written, Photos is refused.
    const calls = api({ setPrivileges });
    startGroupDelete(calls, INPUT, {
      apply: "Apply",
      registry: fakeRegistry().registry,
    });
    await settle();
    expect(groupDeleteOf("family")?.phase).toMatchObject({
      kind: "failed",
      at: "access",
      folders: ["Photos"],
    });
    // The second try re-reads the lists: Media no longer lists the group.
    vi.mocked(calls.folders).mockResolvedValue([
      FOLDERS[0] as SharedFolder,
      folder(MEDIA, "Media", []),
    ]);
    groupDeleteDecision("family", "retryAccess");
    await settle();
    expect(setPrivileges).toHaveBeenCalledTimes(3);
    expect(setPrivileges).toHaveBeenLastCalledWith(PHOTOS, [
      { type: "user", name: "alex", perms: 7 },
    ]);
    expect(groupDeleteOf("family")?.phase).toEqual({ kind: "done" });
  });

  it("Stop here ends the run with the change left pending", async () => {
    const calls = api({
      setPrivileges: vi.fn(() => Promise.reject(rpcError(500, "no"))),
    });
    startGroupDelete(calls, INPUT, {
      apply: "Apply",
      registry: fakeRegistry().registry,
    });
    await settle();
    groupDeleteDecision("family", "stop");
    expect(groupDeleteOf("family")?.phase).toEqual({ kind: "stopped" });
  });

  it("offers R7's retry when applying fails", async () => {
    let outcome: "done" | "failed" = "failed";
    const { registry, started } = fakeRegistry(() => outcome);
    startGroupDelete(api(), INPUT, { apply: "Apply", registry });
    await settle();
    expect(groupDeleteOf("family")?.phase).toMatchObject({
      kind: "failed",
      at: "save",
    });
    outcome = "done";
    groupDeleteDecision("family", "retrySave");
    await settle();
    expect(started()).toBe(2);
    expect(groupDeleteOf("family")?.phase).toEqual({ kind: "done" });
  });

  it("a cut delete is not known; Check again finds it gone and carries on", async () => {
    const calls = api({ deleteGroup: vi.fn(() => Promise.reject(cut())) });
    startGroupDelete(calls, INPUT, {
      apply: "Apply",
      registry: fakeRegistry().registry,
    });
    await settle();
    expect(groupDeleteOf("family")?.phase).toEqual({
      kind: "unknown",
      at: "delete",
    });
    groupDeleteDecision("family", "checkAgain");
    await settle();
    expect(calls.group).toHaveBeenCalledWith("family");
    expect(calls.setPrivileges).toHaveBeenCalledTimes(2);
    expect(groupDeleteOf("family")?.phase).toEqual({ kind: "done" });
    expect(deletedThisSession("family")).toBe(true);
  });

  it("a cut delete with the group still there is not deleted", async () => {
    const calls = api({
      deleteGroup: vi.fn(() => Promise.reject(cut())),
      group: vi.fn(() =>
        Promise.resolve({ name: "family", members: [] } as UserGroup),
      ),
    });
    startGroupDelete(calls, INPUT, {
      apply: "Apply",
      registry: fakeRegistry().registry,
    });
    await settle();
    groupDeleteDecision("family", "checkAgain");
    await settle();
    expect(groupDeleteOf("family")?.phase).toEqual({
      kind: "failed",
      at: "delete",
      error: undefined,
    });
  });

  it("any other answer to Check again leaves it not known", async () => {
    const calls = api({
      deleteGroup: vi.fn(() => Promise.reject(cut())),
      group: vi.fn(() => Promise.reject(rpcError(500, "Something else"))),
    });
    startGroupDelete(calls, INPUT, {
      apply: "Apply",
      registry: fakeRegistry().registry,
    });
    await settle();
    groupDeleteDecision("family", "checkAgain");
    await settle();
    expect(groupDeleteOf("family")?.phase).toEqual({
      kind: "unknown",
      at: "delete",
    });
  });

  it("refuses a second start while one runs, and is forgotten when dismissed", async () => {
    const calls = api();
    const { registry } = fakeRegistry();
    startGroupDelete(calls, INPUT, { apply: "Apply", registry });
    expect(startGroupDelete(calls, INPUT, { apply: "Apply", registry })).toBe(
      false,
    );
    await settle();
    dismissGroupDelete("family");
    expect(groupDeleteOf("family")).toBeUndefined();
  });
});
