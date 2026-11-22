// SPDX-License-Identifier: GPL-3.0-or-later
// Deleting a shared folder, either way, once the reader has confirmed (phase 5 shares design 8.5, 0.8;
// owner, P13, P14). ShareMgmt.delete runs inside the request (not a background task): with `recursive`
// false it removes the record and keeps every file; with true it deletes the folder and everything in
// it first. Either way it leaves `sharedfolders`, `systemd` and `task` pending (observed on the test
// VM), which this run then applies itself: R10 re-reads what is pending first and asks when something
// else appeared; then Config.applyChangesBg, through the one task registry.
//
// A request that was cut (no reply, or a gateway that gave up) leaves the outcome unknown: "Could not
// tell whether {{folder}} was removed." with "Check again", which re-reads the list. A folder no
// longer listed was removed, and the run carries on to saving the change; one still listed was not.
//
// Each run lives here, in memory for the session and by the folder's `uuid`, not in a page: leaving
// the page does not stop it, and coming back shows it. While a step runs the folder is marked as being
// changed by this session (sharesSession), which every other action on it refuses (0.9). Nothing
// retries by itself (UI-14).
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import type { TaskRegistry } from "@omv-webui/react-api-omv/tasks";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { otherModules } from "../filesystems/fsModel.ts";
import { isCut, startTask } from "../filesystems/fsTasks.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import { DELETE_MODULES } from "./shareActions.ts";
import { beginAction, endAction, forgetFolder } from "./sharesSession.ts";

/** "Remove, keep the files" or "Delete with all its files". */
export type DeleteWay = "keep" | "files";

export type ShareDeletePhase =
  | { kind: "running" }
  | { kind: "alsoPending"; others: string[] }
  /** `error` undefined: "Check again" found the folder still listed. */
  | { kind: "failed"; at: "delete" | "save"; error: unknown }
  | { kind: "unknown" }
  | { kind: "done" }
  | { kind: "stopped" };

/** What the run's dialog and its result say, captured when it started (the row goes meanwhile). */
export interface ShareDeleteWords {
  folder: string;
  /** The file system's name, as text. */
  fs: string;
  fullPath: string;
}

export interface ShareDeleteRun {
  uuid: string;
  way: DeleteWay;
  words: ShareDeleteWords;
  steps: Readonly<
    Record<"delete" | "save", { status: TaskStatus; taskId?: number }>
  >;
  phase: ShareDeletePhase;
  busy: boolean;
}

/** The calls a run makes (useSharesApi and useFsApi, taken when it starts). */
export interface ShareDeleteApi {
  deleteFolder(uuid: string, recursive: boolean): Promise<unknown>;
  folders(): Promise<SharedFolder[]>;
  pending(): Promise<string[]>;
  /** Config.applyChangesBg, as a task start. */
  apply(): () => Promise<string>;
}

export const shareDeletes = createMemoryStore<{
  byUuid: Readonly<Record<string, ShareDeleteRun>>;
}>({ byUuid: {} });

export const shareDeleteOf = (uuid: string): ShareDeleteRun | undefined =>
  shareDeletes.getState().byUuid[uuid];

/** A run that has not come to an end the reader must act on or dismiss. */
export const isShareDeleting = (run: ShareDeleteRun | undefined): boolean =>
  run !== undefined &&
  (run.busy ||
    run.phase.kind === "running" ||
    run.phase.kind === "alsoPending");

function put(uuid: string, run: ShareDeleteRun | null) {
  shareDeletes.set((s) => {
    const { [uuid]: _gone, ...rest } = s.byUuid;
    return { byUuid: run === null ? rest : { ...rest, [uuid]: run } };
  });
}

function change(
  uuid: string,
  edit: (run: ShareDeleteRun) => Partial<ShareDeleteRun>,
) {
  const now = shareDeleteOf(uuid);
  if (now !== undefined) {
    put(uuid, { ...now, ...edit(now) });
  }
}

const step = (
  uuid: string,
  id: "delete" | "save",
  state: { status: TaskStatus; taskId?: number },
) => change(uuid, (r) => ({ steps: { ...r.steps, [id]: state } }));

export interface ShareDeleteOptions {
  /** The apply task's label in the tasks menu. */
  apply: string;
  /** The task registry to follow the apply in; the application's one unless a test gives its own. */
  registry?: TaskRegistry;
}

interface Context {
  api: ShareDeleteApi;
  options: ShareDeleteOptions;
}

const contexts = new Map<string, Context>();

const actionOf = (way: DeleteWay) => (way === "keep" ? "remove" : "delete");

/** The reader dismissed the result, or closed a failure. */
export function dismissShareDelete(uuid: string): void {
  contexts.delete(uuid);
  put(uuid, null);
}

/**
 * Start a deletion: the request, then the checkpoint. Refused (false) while another action of this
 * session runs on the folder, or a deletion of it is still under way.
 */
export function startShareDelete(
  api: ShareDeleteApi,
  uuid: string,
  way: DeleteWay,
  words: ShareDeleteWords,
  options: ShareDeleteOptions,
): boolean {
  if (
    isShareDeleting(shareDeleteOf(uuid)) ||
    !beginAction(uuid, actionOf(way))
  ) {
    return false;
  }
  contexts.set(uuid, { api, options });
  put(uuid, {
    uuid,
    way,
    words,
    steps: { delete: { status: "running" }, save: { status: "waiting" } },
    phase: { kind: "running" },
    busy: true,
  });
  void runDelete(uuid).finally(() => {
    change(uuid, () => ({ busy: false }));
    endAction(uuid);
  });
  return true;
}

async function runDelete(uuid: string): Promise<void> {
  const ctx = contexts.get(uuid);
  const run = shareDeleteOf(uuid);
  if (ctx === undefined || run === undefined) {
    return;
  }
  step(uuid, "delete", { status: "running" });
  try {
    await ctx.api.deleteFolder(uuid, run.way === "files");
  } catch (error) {
    step(uuid, "delete", { status: "failed" });
    change(uuid, () => ({
      phase: isCut(error)
        ? { kind: "unknown" }
        : { kind: "failed", at: "delete", error },
    }));
    return;
  }
  await removed(uuid);
}

/** The folder is gone: forget this session's marks for it, then save the change. */
async function removed(uuid: string): Promise<void> {
  step(uuid, "delete", { status: "succeeded" });
  forgetFolder(uuid);
  await toSave(uuid, false);
}

async function toSave(uuid: string, acceptOthers: boolean): Promise<void> {
  const ctx = contexts.get(uuid);
  if (ctx === undefined) {
    return;
  }
  change(uuid, () => ({ phase: { kind: "running" } }));
  step(uuid, "save", { status: "running" });
  try {
    const others = otherModules(await ctx.api.pending(), DELETE_MODULES);
    if (others.length > 0 && !acceptOthers) {
      step(uuid, "save", { status: "waiting" });
      change(uuid, () => ({ phase: { kind: "alsoPending", others } }));
      return;
    }
  } catch {
    // Not knowing what else is pending is no reason to stop: the apply lists what it applies.
  }
  const task = startTask(
    ctx.options.apply,
    ctx.api.apply(),
    ctx.options.registry,
  );
  step(uuid, "save", { status: "running", taskId: task.id });
  const done = await task.settled;
  if (done.state !== "done") {
    step(uuid, "save", { status: "failed", taskId: task.id });
    change(uuid, () => ({
      phase: { kind: "failed", at: "save", error: done.error },
    }));
    return;
  }
  step(uuid, "save", { status: "succeeded", taskId: task.id });
  change(uuid, () => ({ phase: { kind: "done" } }));
}

/** "Check again" after a cut request: the list says whether the folder was removed. */
async function checkAgain(uuid: string): Promise<void> {
  const ctx = contexts.get(uuid);
  if (ctx === undefined) {
    return;
  }
  let folders: SharedFolder[];
  try {
    folders = await ctx.api.folders();
  } catch {
    // Still not known: the reader may check again.
    return;
  }
  if (folders.some((f) => f.uuid === uuid)) {
    change(uuid, () => ({
      phase: { kind: "failed", at: "delete", error: undefined },
    }));
    return;
  }
  await removed(uuid);
}

export type ShareDeleteDecision =
  "applyToo" | "retrySave" | "checkAgain" | "stop";

/** The reader's decision during the steps; ignored while a step runs. */
export function shareDeleteDecision(
  uuid: string,
  decision: ShareDeleteDecision,
): void {
  const run = shareDeleteOf(uuid);
  if (run === undefined || run.busy) {
    return;
  }
  if (decision === "stop") {
    change(uuid, () => ({ phase: { kind: "stopped" } }));
    return;
  }
  if (!beginAction(uuid, actionOf(run.way))) {
    return;
  }
  change(uuid, () => ({ busy: true }));
  const work =
    decision === "applyToo"
      ? () => toSave(uuid, true)
      : decision === "retrySave"
        ? () => toSave(uuid, false)
        : () => checkAgain(uuid);
  void work().finally(() => {
    change(uuid, () => ({ busy: false }));
    endAction(uuid);
  });
}
