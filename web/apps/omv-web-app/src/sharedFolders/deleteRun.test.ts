// SPDX-License-Identifier: GPL-3.0-or-later
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import type {
  TaskRegistry,
  TaskSnapshot,
} from "@omv-webui/react-api-omv/tasks";
import { RpcError } from "@omv-webui/react-api-omv/transport";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dismissShareDelete,
  shareDeleteDecision,
  shareDeleteOf,
  shareDeletes,
  startShareDelete,
  type ShareDeleteApi,
} from "./deleteRun.ts";
import { recordSaved, runningOn, sharesSession } from "./sharesSession.ts";

const rpcError = (status: number, message: string) =>
  new RpcError({ status, code: null, message, operationId: "shareMgmtDelete" });

const UUID = "00000000-0000-4000-8000-000000000201";
const WORDS = { folder: "Photos", fs: "Media", fullPath: "/srv/x/Photos" };

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

function api(over: Partial<ShareDeleteApi> = {}): ShareDeleteApi {
  return {
    deleteFolder: vi.fn(() => Promise.resolve({})),
    folders: vi.fn(() => Promise.resolve([] as SharedFolder[])),
    pending: vi.fn(() => Promise.resolve(["sharedfolders", "systemd", "task"])),
    apply: () => () => Promise.resolve("/tmp/handle"),
    ...over,
  };
}

const settle = () =>
  vi.waitFor(() => {
    expect(shareDeleteOf(UUID)?.busy).toBe(false);
  });

afterEach(() => {
  shareDeletes.reset();
  sharesSession.reset();
});

describe("a shared folder's deletion (8.5)", () => {
  it("removes it, then applies exactly what it left pending", async () => {
    recordSaved(UUID, "access");
    const calls = api();
    const registry = fakeRegistry(() => "done");
    expect(
      startShareDelete(calls, UUID, "keep", WORDS, {
        apply: "Apply",
        registry,
      }),
    ).toBe(true);
    expect(runningOn(UUID)).toBe("remove");
    await settle();
    expect(calls.deleteFolder).toHaveBeenCalledWith(UUID, false);
    expect(shareDeleteOf(UUID)).toMatchObject({
      phase: { kind: "done" },
      steps: {
        delete: { status: "succeeded" },
        save: { status: "succeeded" },
      },
    });
    // The folder's marks are forgotten, and nothing runs on it any more.
    expect(sharesSession.getState().saved[UUID]).toBeUndefined();
    expect(runningOn(UUID)).toBeNull();
  });

  it("sends recursive for the files, and refuses a second start meanwhile", async () => {
    const calls = api();
    const registry = fakeRegistry(() => "done");
    startShareDelete(calls, UUID, "files", WORDS, { apply: "Apply", registry });
    expect(
      startShareDelete(calls, UUID, "files", WORDS, {
        apply: "Apply",
        registry,
      }),
    ).toBe(false);
    await settle();
    expect(calls.deleteFolder).toHaveBeenCalledTimes(1);
    expect(calls.deleteFolder).toHaveBeenCalledWith(UUID, true);
  });

  it("stays at the first step with the server's error, and saves nothing", async () => {
    const refused = rpcError(500, "Referenced.");
    const calls = api({ deleteFolder: vi.fn(() => Promise.reject(refused)) });
    startShareDelete(calls, UUID, "keep", WORDS, {
      apply: "Apply",
      registry: fakeRegistry(() => "done"),
    });
    await settle();
    expect(shareDeleteOf(UUID)).toMatchObject({
      phase: { kind: "failed", at: "delete", error: refused },
      steps: { delete: { status: "failed" }, save: { status: "waiting" } },
    });
    expect(calls.pending).not.toHaveBeenCalled();
  });

  it("asks before applying something else pending, and applies it too when told", async () => {
    const calls = api({
      pending: vi.fn(() =>
        Promise.resolve(["sharedfolders", "systemd", "task", "ssh"]),
      ),
    });
    const registry = fakeRegistry(() => "done");
    startShareDelete(calls, UUID, "keep", WORDS, { apply: "Apply", registry });
    await settle();
    expect(shareDeleteOf(UUID)?.phase).toEqual({
      kind: "alsoPending",
      others: ["ssh"],
    });
    shareDeleteDecision(UUID, "applyToo");
    await settle();
    expect(shareDeleteOf(UUID)?.phase.kind).toBe("done");
  });

  it("offers trying the apply again after it failed, or stopping there", async () => {
    let outcome: "done" | "failed" = "failed";
    const registry = fakeRegistry(() => outcome);
    startShareDelete(api(), UUID, "keep", WORDS, { apply: "Apply", registry });
    await settle();
    expect(shareDeleteOf(UUID)?.phase).toMatchObject({
      kind: "failed",
      at: "save",
    });
    outcome = "done";
    shareDeleteDecision(UUID, "retrySave");
    await settle();
    expect(shareDeleteOf(UUID)?.phase.kind).toBe("done");

    dismissShareDelete(UUID);
    outcome = "failed";
    startShareDelete(api(), UUID, "keep", WORDS, { apply: "Apply", registry });
    await settle();
    shareDeleteDecision(UUID, "stop");
    expect(shareDeleteOf(UUID)?.phase.kind).toBe("stopped");
  });

  it("cannot tell after a cut request, and checks the list again", async () => {
    const cut = rpcError(504, "Gateway Time-out");
    const still = { uuid: UUID } as SharedFolder;
    const folders = vi
      .fn<() => Promise<SharedFolder[]>>()
      .mockResolvedValueOnce([still])
      .mockResolvedValueOnce([]);
    const calls = api({
      deleteFolder: vi.fn(() => Promise.reject(cut)),
      folders,
    });
    startShareDelete(calls, UUID, "files", WORDS, {
      apply: "Apply",
      registry: fakeRegistry(() => "done"),
    });
    await settle();
    expect(shareDeleteOf(UUID)?.phase.kind).toBe("unknown");
    // Still listed: it was not removed.
    shareDeleteDecision(UUID, "checkAgain");
    await settle();
    expect(shareDeleteOf(UUID)?.phase).toEqual({
      kind: "failed",
      at: "delete",
      error: undefined,
    });
  });

  it("carries on to saving once a check finds the folder gone", async () => {
    const cut = rpcError(0, "Failed to fetch");
    const calls = api({ deleteFolder: vi.fn(() => Promise.reject(cut)) });
    startShareDelete(calls, UUID, "keep", WORDS, {
      apply: "Apply",
      registry: fakeRegistry(() => "done"),
    });
    await settle();
    shareDeleteDecision(UUID, "checkAgain");
    await settle();
    expect(shareDeleteOf(UUID)).toMatchObject({
      phase: { kind: "done" },
      steps: { delete: { status: "succeeded" } },
    });
  });
});
