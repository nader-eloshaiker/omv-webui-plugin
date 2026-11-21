// SPDX-License-Identifier: GPL-3.0-or-later
// Growing a file system, and unmounting or removing one (phase 5 file-systems design 4, 5; owner, P5 to
// P8), once the reader has confirmed. Each runs here, in memory for the session and by the file
// system's UUID, not in its page: leaving the page does not stop it, coming back shows it, and a second
// action on the same file system is refused while one runs (16.1). Both calls are synchronous and slow;
// nothing retries them (UI-14).
import type { ConfiguredFilesystem } from "@omv-webui/react-api-omv/generated";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { parseByteCount } from "../format/format.ts";
import type { FsApi } from "../hooks/useFsApi.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import { otherModules, ownUuid, sameUuid, UNMOUNT_MODULES } from "./fsModel.ts";
import { isCut, startTask } from "./fsTasks.ts";

export type GrowPhase =
  | { kind: "running" }
  | { kind: "bigger"; size: number; before: number }
  | { kind: "same" }
  | { kind: "failed"; error: unknown }
  | { kind: "unknown" };

export interface GrowRun {
  kind: "grow";
  uuid: string;
  /** The file system's name for the words, fixed when it started. */
  name: string;
  phase: GrowPhase;
}

export type UnmountPhase =
  | { kind: "running" }
  | { kind: "alsoPending"; others: string[] }
  | { kind: "failed"; at: "unmount" | "apply"; error: unknown }
  | { kind: "stillThere" }
  | { kind: "done" }
  | { kind: "stopped" };

export interface UnmountRun {
  kind: "unmount" | "remove";
  uuid: string;
  name: string;
  steps: Readonly<Record<"unmount" | "apply" | "verify", TaskStatus>>;
  phase: UnmountPhase;
  busy: boolean;
}

export type FsAction = GrowRun | UnmountRun;

export const fsActions = createMemoryStore<{
  byUuid: Readonly<Record<string, FsAction>>;
}>({ byUuid: {} });

const key = (uuid: string) => uuid.toLowerCase();

export const actionOf = (uuid: string): FsAction | undefined =>
  fsActions.getState().byUuid[key(uuid)];

/** Whether a grow or an unmount of this file system is under way now (4.1, 5.1 "being changed"). */
export function isBusy(action: FsAction | undefined): boolean {
  if (action === undefined) {
    return false;
  }
  return action.kind === "grow"
    ? action.phase.kind === "running"
    : action.phase.kind === "running" || action.busy;
}

function put(uuid: string, action: FsAction | null) {
  fsActions.set((s) => {
    const { [key(uuid)]: _gone, ...rest } = s.byUuid;
    return {
      byUuid: action === null ? rest : { ...rest, [key(uuid)]: action },
    };
  });
}

function change<T extends FsAction>(uuid: string, edit: (action: T) => T) {
  const now = actionOf(uuid) as T | undefined;
  if (now !== undefined) {
    put(uuid, edit(now));
  }
}

/** The reader dismissed the result. */
export const dismissAction = (uuid: string): void => put(uuid, null);

// ---- Grow (4.2, 4.3) -----------------------------------------------------------------------------

/** Grow `row` (re-checked by the caller a moment before), then compare its size with the one before. */
export function startGrow(
  api: FsApi,
  row: ConfiguredFilesystem,
  name: string,
  /** The page's address, which the action is kept by. */
  address: string,
): boolean {
  // Grow names the file system by its own UUID: a row without one is never grown (a ZFS file system).
  const id = ownUuid(row);
  if (id === "" || isBusy(actionOf(address))) {
    return false;
  }
  const before = parseByteCount(row.size);
  const uuid = address;
  put(uuid, { kind: "grow", uuid, name, phase: { kind: "running" } });
  const end = (phase: GrowPhase) =>
    change<GrowRun>(uuid, (a) => ({ ...a, phase }));
  void (async () => {
    try {
      await api.grow(id);
    } catch (error) {
      end(isCut(error) ? { kind: "unknown" } : { kind: "failed", error });
      return;
    }
    try {
      const rows = await api.configured();
      const fresh = rows.find((r) => sameUuid(r.uuid, id));
      const size = parseByteCount(fresh?.size);
      end(
        size !== null && before !== null && size > before
          ? { kind: "bigger", size, before }
          : { kind: "same" },
      );
    } catch {
      end({ kind: "unknown" });
    }
  })();
  return true;
}

// ---- Unmount and remove (5.3, 5.4) ---------------------------------------------------------------

export interface UnmountLabels {
  apply: string;
}

const contexts = new Map<
  string,
  { api: FsApi; labels: UnmountLabels; dir: string; uuid: string }
>();

/** Start the step list: unmount (or remove), apply what it leaves pending (R10), check it is gone. */
export function startUnmount(
  api: FsApi,
  labels: UnmountLabels,
  row: ConfiguredFilesystem,
  name: string,
  kind: "unmount" | "remove",
  /** The page's address, which the action is kept by. */
  address: string,
): boolean {
  const uuid = address;
  if (isBusy(actionOf(uuid))) {
    return false;
  }
  contexts.set(key(uuid), {
    api,
    labels,
    dir: row.mountpoint,
    uuid: ownUuid(row),
  });
  put(uuid, {
    kind,
    uuid,
    name,
    steps: { unmount: "running", apply: "waiting", verify: "waiting" },
    phase: { kind: "running" },
    busy: true,
  });
  void runUnmount(uuid).finally(() =>
    change<UnmountRun>(uuid, (a) => ({ ...a, busy: false })),
  );
  return true;
}

const setStep = (
  uuid: string,
  step: "unmount" | "apply" | "verify",
  status: TaskStatus,
) =>
  change<UnmountRun>(uuid, (a) => ({
    ...a,
    steps: { ...a.steps, [step]: status },
  }));
const setPhase = (uuid: string, phase: UnmountPhase) =>
  change<UnmountRun>(uuid, (a) => ({ ...a, phase }));

async function runUnmount(uuid: string): Promise<void> {
  const ctx = contexts.get(key(uuid));
  if (ctx === undefined) {
    return;
  }
  setStep(uuid, "unmount", "running");
  setPhase(uuid, { kind: "running" });
  try {
    await ctx.api.umount(ctx.dir);
  } catch (error) {
    setStep(uuid, "unmount", "failed");
    setPhase(uuid, { kind: "failed", at: "unmount", error });
    return;
  }
  setStep(uuid, "unmount", "succeeded");
  await toApply(uuid, false);
}

async function toApply(uuid: string, acceptOthers: boolean): Promise<void> {
  const ctx = contexts.get(key(uuid));
  if (ctx === undefined) {
    return;
  }
  setPhase(uuid, { kind: "running" });
  setStep(uuid, "apply", "running");
  try {
    const others = otherModules(await ctx.api.pending(), UNMOUNT_MODULES);
    if (others.length > 0 && !acceptOthers) {
      setStep(uuid, "apply", "waiting");
      setPhase(uuid, { kind: "alsoPending", others });
      return;
    }
  } catch {
    // Not knowing what else is pending is no reason to stop.
  }
  await runApply(uuid);
}

async function runApply(uuid: string): Promise<void> {
  const ctx = contexts.get(key(uuid));
  if (ctx === undefined) {
    return;
  }
  setPhase(uuid, { kind: "running" });
  setStep(uuid, "apply", "running");
  const task = startTask(
    ctx.labels.apply,
    ctx.api.apply({ modules: [], force: false }),
  );
  const done = await task.settled;
  if (done.state !== "done") {
    setStep(uuid, "apply", "failed");
    setPhase(uuid, { kind: "failed", at: "apply", error: done.error });
    return;
  }
  setStep(uuid, "apply", "succeeded");
  await runVerify(uuid);
}

async function runVerify(uuid: string): Promise<void> {
  const ctx = contexts.get(key(uuid));
  if (ctx === undefined) {
    return;
  }
  setPhase(uuid, { kind: "running" });
  setStep(uuid, "verify", "running");
  try {
    const [rows] = await Promise.all([
      ctx.api.configured(),
      ctx.api.mountCandidates(),
    ]);
    const still = rows.some(
      (r) =>
        sameUuid(r.uuid, ctx.uuid) ||
        (r.mountpoint !== "" && r.mountpoint === ctx.dir),
    );
    if (still) {
      setStep(uuid, "verify", "failed");
      setPhase(uuid, { kind: "stillThere" });
      return;
    }
  } catch {
    setStep(uuid, "verify", "failed");
    setPhase(uuid, { kind: "stillThere" });
    return;
  }
  setStep(uuid, "verify", "succeeded");
  setPhase(uuid, { kind: "done" });
}

export type UnmountDecision = "applyToo" | "stop" | "retryApply" | "checkAgain";

/** The reader's decision during the steps; ignored while a step runs. */
export function unmountDecision(uuid: string, decision: UnmountDecision): void {
  const action = actionOf(uuid);
  if (action === undefined || action.kind === "grow" || action.busy) {
    return;
  }
  const work =
    decision === "applyToo"
      ? () => toApply(uuid, true)
      : decision === "retryApply"
        ? () => runApply(uuid)
        : decision === "checkAgain"
          ? () => runVerify(uuid)
          : null;
  if (work === null) {
    setPhase(uuid, { kind: "stopped" });
    return;
  }
  change<UnmountRun>(uuid, (a) => ({ ...a, busy: true }));
  void work().finally(() =>
    change<UnmountRun>(uuid, (a) => ({ ...a, busy: false })),
  );
}
