// SPDX-License-Identifier: GPL-3.0-or-later
// Deleting a snapshot, a file system or a pool (phase 5 ZFS design 5.5, 9; owner, P15), once the reader
// has confirmed. Zfs.deleteObjectBg is a background task, and each deletion marks fstab, collectd,
// monit and quota pending (observed), which an undo could not bring back: so a deletion refuses to
// start while anything else is pending (the dialog's pre-flight), then applies exactly what it left
// pending (R10 re-reads first, and asks when something else appeared). The folder sent is the one
// Zfs.listPools reported for the object (`mountpoint`), never a value typed or made up here (item 10).
//
// Each run lives here, in memory for the session and by the object's full name, not in a page: leaving
// the page does not stop it, and coming back shows it. Nothing retries by itself (UI-14).
import type { ZfsDeleteObjectRequest } from "@omv-webui/react-api-omv/generated";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { otherModules } from "../filesystems/fsModel.ts";
import { isCut, startTask } from "../filesystems/fsTasks.ts";
import type { FsApi } from "../hooks/useFsApi.ts";
import type { ZfsApi } from "../hooks/useZfsApi.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import { ZFS_MODULES } from "./zfsRun.ts";
import { beginChanging, endChanging, recordTouched } from "./zfsSession.ts";

/** What a deletion may leave pending: the four, and the plugin's schedules when it removed a job. */
export const DELETE_MODULES = [...ZFS_MODULES, "zfscron"] as const;

export type DeleteKind = "snapshot" | "fs" | "pool";

export type DeletePhase =
  | { kind: "running" }
  | { kind: "alsoPending"; others: string[] }
  | { kind: "failed"; at: "delete" | "save"; error: unknown }
  | { kind: "unknown" }
  | { kind: "done" }
  | { kind: "stopped" };

export interface DeleteRun {
  kind: DeleteKind;
  /** The object's full name, which the run is kept by. */
  name: string;
  pool: string;
  steps: Readonly<
    Record<"delete" | "save", { status: TaskStatus; taskId?: number }>
  >;
  phase: DeletePhase;
  busy: boolean;
}

export const zfsActions = createMemoryStore<{
  byName: Readonly<Record<string, DeleteRun>>;
}>({ byName: {} });

export const deleteRunOf = (name: string): DeleteRun | undefined =>
  zfsActions.getState().byName[name];

export const isDeleting = (run: DeleteRun | undefined): boolean =>
  run !== undefined &&
  (run.busy ||
    run.phase.kind === "running" ||
    run.phase.kind === "alsoPending");

function put(name: string, run: DeleteRun | null) {
  zfsActions.set((s) => {
    const { [name]: _gone, ...rest } = s.byName;
    return { byName: run === null ? rest : { ...rest, [name]: run } };
  });
}

function change(name: string, edit: (run: DeleteRun) => Partial<DeleteRun>) {
  const now = deleteRunOf(name);
  if (now !== undefined) {
    put(name, { ...now, ...edit(now) });
  }
}

const step = (
  name: string,
  id: "delete" | "save",
  state: { status: TaskStatus; taskId?: number },
) => change(name, (r) => ({ steps: { ...r.steps, [id]: state } }));

interface Context {
  fs: FsApi;
  zfs: ZfsApi;
  request: ZfsDeleteObjectRequest;
  labels: { task: string; apply: string };
}

const contexts = new Map<string, Context>();

/** The reader dismissed the result. */
export const dismissDelete = (name: string): void => {
  contexts.delete(name);
  put(name, null);
};

/** Start a deletion: the task, then the checkpoint. Refused while this pool is being changed. */
export function startDelete(
  fs: FsApi,
  zfs: ZfsApi,
  kind: DeleteKind,
  pool: string,
  request: ZfsDeleteObjectRequest,
  labels: { task: string; apply: string },
): boolean {
  const name = request.name;
  if (isDeleting(deleteRunOf(name)) || !beginChanging(pool)) {
    return false;
  }
  contexts.set(name, { fs, zfs, request, labels });
  put(name, {
    kind,
    name,
    pool,
    steps: { delete: { status: "running" }, save: { status: "waiting" } },
    phase: { kind: "running" },
    busy: true,
  });
  void runDelete(name).finally(() => {
    change(name, () => ({ busy: false }));
    endChanging(pool);
  });
  return true;
}

async function runDelete(name: string): Promise<void> {
  const ctx = contexts.get(name);
  if (ctx === undefined) {
    return;
  }
  const task = startTask(ctx.labels.task, ctx.zfs.delete(ctx.request));
  step(name, "delete", { status: "running", taskId: task.id });
  const done = await task.settled;
  if (done.state !== "done") {
    step(name, "delete", { status: "failed", taskId: task.id });
    change(name, () => ({
      phase: isCut(done.error)
        ? { kind: "unknown" }
        : { kind: "failed", at: "delete", error: done.error },
    }));
    return;
  }
  step(name, "delete", { status: "succeeded", taskId: task.id });
  recordTouched(deleteRunOf(name)?.pool ?? "");
  await toSave(name, false);
}

async function toSave(name: string, acceptOthers: boolean): Promise<void> {
  const ctx = contexts.get(name);
  if (ctx === undefined) {
    return;
  }
  change(name, () => ({ phase: { kind: "running" } }));
  step(name, "save", { status: "running" });
  try {
    const others = otherModules(await ctx.fs.pending(), DELETE_MODULES);
    if (others.length > 0 && !acceptOthers) {
      step(name, "save", { status: "waiting" });
      change(name, () => ({ phase: { kind: "alsoPending", others } }));
      return;
    }
  } catch {
    // Not knowing what else is pending is no reason to stop.
  }
  const task = startTask(
    ctx.labels.apply,
    ctx.fs.apply({ modules: [], force: false }),
  );
  step(name, "save", { status: "running", taskId: task.id });
  const done = await task.settled;
  if (done.state !== "done") {
    step(name, "save", { status: "failed", taskId: task.id });
    change(name, () => ({
      phase: { kind: "failed", at: "save", error: done.error },
    }));
    return;
  }
  step(name, "save", { status: "succeeded", taskId: task.id });
  change(name, () => ({ phase: { kind: "done" } }));
}

export type DeleteDecision = "applyToo" | "retrySave" | "retryDelete" | "stop";

/** The reader's decision during the steps; ignored while a step runs. */
export function deleteDecision(name: string, decision: DeleteDecision): void {
  const run = deleteRunOf(name);
  if (run === undefined || run.busy) {
    return;
  }
  if (decision === "stop") {
    change(name, () => ({ phase: { kind: "stopped" } }));
    return;
  }
  if (!beginChanging(run.pool)) {
    return;
  }
  change(name, () => ({ busy: true }));
  const work =
    decision === "applyToo"
      ? () => toSave(name, true)
      : decision === "retrySave"
        ? () => toSave(name, false)
        : () => runDelete(name);
  void work().finally(() => {
    change(name, () => ({ busy: false }));
    endChanging(run.pool);
  });
}
