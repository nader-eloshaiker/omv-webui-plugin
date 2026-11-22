// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a shared folder": the run (phase 5 shares design 6.4 to 6.6; UX audit R3 to R10). A run starts
// only from the reader's confirmation of the summary (R9: never on page load) and runs its steps in
// order: check the choices again, make the shared folder (which makes its folder on the disk at once,
// B5), give access, turn on Windows and Mac sharing, share the folder, the one checkpoint that applies
// the changes (R10, then the apply as a task), and the check that it is ready. A failed step stops the
// run and waits for the reader: nothing retries by itself (UI-14). Undo is offered only through the
// band, never as a step (R6: the folder on the disk would be orphaned).
//
// What the test VM showed (design section 19):
// - ShareMgmt.set writes the record first, then makes the folder; its reply carries the new `uuid` and
//   the stored `reldirpath` with a trailing "/". A refused set may therefore have left a record whose
//   folder is missing, which the run tells apart by reading the list again;
// - the checkpoint expects `sharedfolders` and `systemd`, and with sharing `samba` and `avahi`;
// - SMB ran about 5 seconds after the apply started, so the last step reads up to five times, two
//   seconds apart.
//
// The run lives here, in memory for the session (emptied when it ends, app.ts), not in a page: leaving
// the page does not stop it, and coming back shows the step list again. One add run at a time; every
// write checks that its run is still the current one, so a dismissed run or an ended session is never
// brought back by a late reply. The folder it made is recorded in sharesSession, so the list's
// unfinished-work lines recognise it after a reload (R8).
import type {
  ConfiguredFilesystem,
  SharedFolder,
  SharedFolderPrivilegeEntry,
} from "@omv-webui/react-api-omv/generated";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { otherModules } from "../filesystems/fsModel.ts";
import { isCut, startTask } from "../filesystems/fsTasks.ts";
import type { FsApi } from "../hooks/useFsApi.ts";
import type { SharesApi } from "../hooks/useSharesApi.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import type { Access } from "./accessModel.ts";
import { samePrivileges } from "./accessModel.ts";
import {
  displayPath,
  nameProblem,
  pathProblem,
  type NameProblem,
  type PathProblem,
} from "./nameRules.ts";
import {
  addFlowModules,
  fsChoices,
  smbOnRefusal,
  type CannotHold,
} from "./shareActions.ts";
import {
  beginAction,
  clearHandover,
  endAction,
  forgetFolder,
  recordCreated,
} from "./sharesSession.ts";
import {
  NEW_OBJECT_UUID,
  newShareRequest,
  settingsRequest,
  shareOf,
  smbServiceRow,
  type ShareChoices,
} from "./smbModel.ts";

/** What the reader chose, fixed at the summary (6.2, 6.3). */
export interface AddChoices {
  /** The file system's row as the form read it; the run finds it again by its `devicefile`. */
  fs: ConfiguredFilesystem;
  /** Its mount entry, from ShareMgmt.getCandidates: what ShareMgmt.set takes. */
  mntentref: string;
  name: string;
  /** What is sent: "/" for the whole file system, else the path without its slashes (0.5). */
  reldirpath: string;
  comment: string;
  /** The whole access list (no entry for No access, 0.4); empty when nobody was given access. */
  privileges: SharedFolderPrivilegeEntry[];
  /** Shared over SMB with these choices, or null. */
  smb: ShareChoices | null;
  /** SMB was off when the summary was made: step 4 turns it on. Step 1 reads it again. */
  turnOn: boolean;
  /** The NAS's name as the shell reads it, for the addresses (0.2). */
  hostname: string;
}

export type AddStep =
  "check" | "make" | "access" | "smbOn" | "share" | "apply" | "verify";

/** The steps of 6.4, those that apply to these choices, in order. */
export function addSteps(
  choices: Pick<AddChoices, "privileges" | "smb" | "turnOn">,
): AddStep[] {
  return [
    "check",
    "make",
    ...(choices.privileges.length > 0 ? (["access"] as const) : []),
    ...(choices.smb !== null && choices.turnOn ? (["smbOn"] as const) : []),
    ...(choices.smb !== null ? (["share"] as const) : []),
    "apply",
    "verify",
  ];
}

export interface StepState {
  status: TaskStatus;
  /** The apply's task, in the registry (the handle stays in the task helper, UI-5). */
  taskId?: number;
}

/** Why the run stopped at a step (6.6). */
export type AddFlowFailure =
  /** Step 1: the file system is no longer offered (0.6). */
  | { kind: "fsGone"; reason: CannotHold | "gone" }
  /** Step 1: "There is now a shared folder called {{other}}." */
  | { kind: "nameTaken"; other: string }
  | { kind: "name"; problem: NameProblem }
  | { kind: "path"; problem: PathProblem }
  /** Step 1: other changes became pending (R1). */
  | { kind: "pending"; modules: string[] }
  /** Step 1: SMB must be turned on and the NAS's name is too long (4.4). */
  | { kind: "hostTooLong"; host: string; length: number }
  /** Step 1: a read failed. */
  | { kind: "checkRead"; error: unknown }
  /** Step 2: OMV refused, and the list has no such folder. */
  | { kind: "notMade"; error: unknown }
  /** Step 2: the record is there, its folder on the disk is not. */
  | { kind: "noDir"; error: unknown }
  /** Steps 3 to 5: the folder is made; this setting was not saved. */
  | { kind: "partial"; what: "access" | "smbOn" | "share"; error: unknown }
  /** Step 6: the apply failed (R7). */
  | { kind: "apply"; error: unknown }
  /** Step 7: applied, but not ready after five reads. */
  | { kind: "notReady"; what: "folder" | "smb" }
  /** A write's request was cut: whether it took effect is not known. */
  | { kind: "unknown"; step: AddStep }
  /** "Remove it again" was refused. */
  | { kind: "removeFailed"; error: unknown };

export type AddPhase =
  | { kind: "running" }
  | { kind: "failed"; at: AddStep; failure: AddFlowFailure }
  /** R10: modules outside the expected set are pending at the checkpoint. */
  | { kind: "alsoPending"; others: string[] }
  | { kind: "done"; folder: SharedFolder }
  | { kind: "stopped"; at: AddStep; failure?: AddFlowFailure }
  /** "Remove it again" removed the record of a folder that could not be made on the disk. */
  | { kind: "removed" };

export interface TaskLabels {
  apply: string;
}

export interface AddRun {
  id: number;
  choices: AddChoices;
  steps: AddStep[];
  state: Readonly<Partial<Record<AddStep, StepState>>>;
  phase: AddPhase;
  /** The reader's last decision while it runs: that button shows it, the others wait. */
  busy: string | null;
  /** The new folder's UUID, from ShareMgmt.set's reply (or the list), once known. Memory only. */
  uuid: string | null;
  /** "Apply them too" at the checkpoint (R10). */
  acceptOthers: boolean;
}

/** The form as the reader left it, for "Change choices" (6.3: every choice kept). */
export interface AddDraft {
  /** The chosen file system's `devicefile`, or null. */
  fs: string | null;
  name: string;
  /** "Use another folder" is open. */
  custom: boolean;
  path: string;
  whole: boolean;
  comment: string;
  access: Readonly<Record<string, Access>>;
  smb: boolean;
  browseable: boolean;
  readonly: boolean;
  guest: boolean;
}

export interface AddFlowStore {
  run: AddRun | null;
  draft: AddDraft | null;
}

export const addFlowStore = createMemoryStore<AddFlowStore>({
  run: null,
  draft: null,
});

/** The APIs a run keeps for its whole life (a mutation started after its page went still runs). */
export interface AddFlowApi {
  shares: SharesApi;
  apply: FsApi["apply"];
}

/** Step 7: how many reads, and how far apart (observed: SMB ran about 5 s after the apply began). */
export const VERIFY_TRIES = 5;
export const VERIFY_GAP_MS = 2000;

interface Context {
  id: number;
  api: AddFlowApi;
  labels: TaskLabels;
}

let nextRunId = 1;
const contexts = new Map<number, Context>();

const current = (ctx: Context): AddRun | null => {
  const run = addFlowStore.getState().run;
  return run !== null && run.id === ctx.id ? run : null;
};

function update(ctx: Context, change: (run: AddRun) => Partial<AddRun>) {
  const run = current(ctx);
  if (run !== null) {
    addFlowStore.set({ run: { ...run, ...change(run) } });
  }
}

const mark = (ctx: Context, step: AddStep, state: StepState) =>
  update(ctx, (run) => ({ state: { ...run.state, [step]: state } }));

const fail = (ctx: Context, at: AddStep, failure: AddFlowFailure) => {
  mark(ctx, at, { ...(current(ctx)?.state[at] ?? {}), status: "failed" });
  update(ctx, () => ({ phase: { kind: "failed", at, failure } }));
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** The folder this run made: by its UUID once known, else by name, mount entry and path. */
export function findMade(
  folders: readonly SharedFolder[],
  choices: Pick<AddChoices, "name" | "mntentref" | "reldirpath">,
  uuid: string | null,
): SharedFolder | undefined {
  if (uuid !== null) {
    return folders.find((f) => f.uuid === uuid);
  }
  return folders.find(
    (f) =>
      f.name === choices.name &&
      f.mntentref === choices.mntentref &&
      displayPath(f.reldirpath) === displayPath(choices.reldirpath),
  );
}

/** The run made a folder: keep its UUID, and tell the session (the list's lines, one action at a time). */
function adopt(ctx: Context, uuid: string) {
  const run = current(ctx);
  if (run === null) {
    return;
  }
  if (run.uuid !== uuid) {
    update(ctx, () => ({ uuid }));
  }
  recordCreated({
    uuid,
    name: run.choices.name,
    smb: run.choices.smb !== null,
  });
  beginAction(uuid, "add");
}

// ---- The steps -----------------------------------------------------------------------------------

/** Step 1: everything again, fresh (R3): the file system still offered, the name and path still free. */
async function stepCheck(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const { choices } = run;
  mark(ctx, "check", { status: "running" });
  let reads;
  try {
    reads = await Promise.all([
      ctx.api.shares.candidates(),
      ctx.api.shares.fileSystems(),
      ctx.api.shares.folders(),
      ctx.api.shares.pending(),
      ctx.api.shares.shares(),
      ctx.api.shares.settings(),
      ctx.api.shares.hostname(),
    ]);
  } catch (error) {
    fail(ctx, "check", { kind: "checkRead", error });
    return false;
  }
  const [candidates, rows, folders, pending, , settings, hostname] = reads;
  if (pending.length > 0) {
    fail(ctx, "check", { kind: "pending", modules: pending });
    return false;
  }
  const { offered, cannot } = fsChoices(candidates, rows, folders, pending);
  const still = offered.find((o) => o.fs.devicefile === choices.fs.devicefile);
  if (still === undefined || still.candidate.uuid !== choices.mntentref) {
    const reason =
      cannot.find((c) => c.fs.devicefile === choices.fs.devicefile)?.reason ??
      (still === undefined ? "gone" : "notCandidate");
    fail(ctx, "check", { kind: "fsGone", reason });
    return false;
  }
  const name = nameProblem(choices.name, folders);
  if (name !== null) {
    fail(
      ctx,
      "check",
      name.key === "addShare.name.taken"
        ? { kind: "nameTaken", other: name.other }
        : { kind: "name", problem: name },
    );
    return false;
  }
  const path = pathProblem(choices.reldirpath, choices.mntentref, folders);
  if (path !== null) {
    fail(ctx, "check", { kind: "path", problem: path });
    return false;
  }
  if (choices.smb !== null) {
    const turnOn = !settings.enable;
    const refusal = turnOn ? smbOnRefusal(hostname) : null;
    if (refusal?.kind === "hostTooLong") {
      fail(ctx, "check", {
        kind: "hostTooLong",
        host: refusal.host,
        length: refusal.length,
      });
      return false;
    }
    if (turnOn !== choices.turnOn) {
      // SMB was turned on or off elsewhere since the summary: step 4 comes or goes with it.
      update(ctx, (r) => {
        const next = { ...r.choices, turnOn };
        return { choices: next, steps: addSteps(next) };
      });
    }
  }
  mark(ctx, "check", { status: "succeeded" });
  return true;
}

/** Step 2: ShareMgmt.set, new (or, after "noDir", the same call with the new UUID). */
async function stepMake(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const { choices } = run;
  mark(ctx, "make", { status: "running" });
  try {
    const saved = await ctx.api.shares.setFolder({
      uuid: run.uuid ?? NEW_OBJECT_UUID,
      name: choices.name,
      comment: choices.comment,
      mntentref: choices.mntentref,
      reldirpath: choices.reldirpath,
      mode: "770",
    });
    adopt(ctx, saved.uuid);
  } catch (error) {
    if (isCut(error)) {
      fail(ctx, "make", { kind: "unknown", step: "make" });
      return false;
    }
    // OMV writes the record first, then makes the folder: read the list to tell which failed.
    let row: SharedFolder | undefined;
    try {
      row = findMade(await ctx.api.shares.folders(), choices, run.uuid);
    } catch {
      fail(ctx, "make", { kind: "unknown", step: "make" });
      return false;
    }
    if (row === undefined) {
      fail(ctx, "make", { kind: "notMade", error });
    } else {
      adopt(ctx, row.uuid);
      fail(ctx, "make", { kind: "noDir", error });
    }
    return false;
  }
  mark(ctx, "make", { status: "succeeded" });
  return true;
}

/** Steps 3 to 5: one write each, with the folder's UUID. A cut request is "not known". */
async function stepWrite(
  ctx: Context,
  step: "access" | "smbOn" | "share",
  write: (run: AddRun, uuid: string) => Promise<unknown>,
): Promise<boolean> {
  const run = current(ctx);
  if (run?.uuid === null || run === null) {
    return false;
  }
  mark(ctx, step, { status: "running" });
  try {
    await write(run, run.uuid);
  } catch (error) {
    fail(
      ctx,
      step,
      isCut(error)
        ? { kind: "unknown", step }
        : { kind: "partial", what: step, error },
    );
    return false;
  }
  mark(ctx, step, { status: "succeeded" });
  return true;
}

const stepAccess = (ctx: Context) =>
  stepWrite(ctx, "access", (run, uuid) =>
    ctx.api.shares.setPrivileges(uuid, run.choices.privileges),
  );

/** Step 4: read the settings just before (R4), and write them back with only `enable` changed. */
const stepSmbOn = (ctx: Context) =>
  stepWrite(ctx, "smbOn", async () => {
    const settings = await ctx.api.shares.settings();
    if (!settings.enable) {
      await ctx.api.shares.setSmbSettings(settingsRequest(settings, true));
    }
  });

/** Step 5: a new share with the classic form's defaults and the three choices (0.10, D5). */
const stepShare = (ctx: Context) =>
  stepWrite(ctx, "share", async (run, uuid) => {
    const choices = run.choices.smb;
    if (choices === null) {
      return;
    }
    // After a cut request the share may be there already: OMV refuses a second one.
    if (shareOf(await ctx.api.shares.shares(), uuid) === undefined) {
      await ctx.api.shares.setShare(newShareRequest(uuid, choices));
    }
  });

/** Step 6, the checkpoint: what is pending now (R10), then the apply as a task. */
async function stepApply(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "apply", { status: "running" });
  try {
    const others = otherModules(
      await ctx.api.shares.pending(),
      addFlowModules(run.choices.smb !== null),
    );
    if (others.length > 0 && !run.acceptOthers) {
      mark(ctx, "apply", { status: "waiting" });
      update(ctx, () => ({ phase: { kind: "alsoPending", others } }));
      return false;
    }
  } catch {
    // Not knowing what else is pending is no reason to stop: the apply itself is the decision.
  }
  update(ctx, () => ({ phase: { kind: "running" } }));
  const task = startTask(
    ctx.labels.apply,
    ctx.api.apply({ modules: [], force: false }),
  );
  mark(ctx, "apply", { status: "running", taskId: task.id });
  const done = await task.settled;
  if (current(ctx) === null) {
    return false;
  }
  if (done.state !== "done") {
    fail(ctx, "apply", { kind: "apply", error: done.error });
    return false;
  }
  mark(ctx, "apply", { status: "succeeded", taskId: task.id });
  return true;
}

/** Step 7: the folder reads OK, and with sharing its share is there and SMB runs; five reads at most. */
async function stepVerify(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "verify", { status: "running" });
  let what: "folder" | "smb" = "folder";
  for (let attempt = 0; attempt < VERIFY_TRIES; attempt += 1) {
    if (attempt > 0) {
      await wait(VERIFY_GAP_MS);
    }
    const now = current(ctx);
    if (now === null) {
      return false;
    }
    try {
      const row = findMade(
        await ctx.api.shares.folders(),
        now.choices,
        now.uuid,
      );
      if (row?.status !== "OK") {
        what = "folder";
        continue;
      }
      if (now.choices.smb !== null) {
        const [shares, services] = await Promise.all([
          ctx.api.shares.shares(),
          ctx.api.shares.services(),
        ]);
        if (
          shareOf(shares, row.uuid) === undefined ||
          smbServiceRow(services)?.running !== true
        ) {
          what = "smb";
          continue;
        }
      }
      mark(ctx, "verify", { status: "succeeded" });
      clearHandover();
      update(ctx, () => ({ phase: { kind: "done", folder: row } }));
      return true;
    } catch {
      // A read that failed says nothing about the folder: read again, up to the last try.
    }
  }
  fail(ctx, "verify", { kind: "notReady", what });
  return false;
}

async function runStep(ctx: Context, step: AddStep): Promise<boolean> {
  switch (step) {
    case "check":
      return stepCheck(ctx);
    case "make":
      return stepMake(ctx);
    case "access":
      return stepAccess(ctx);
    case "smbOn":
      return stepSmbOn(ctx);
    case "share":
      return stepShare(ctx);
    case "apply":
      return stepApply(ctx);
    case "verify":
      return stepVerify(ctx);
  }
}

/** Run from a step to the end, stopping at the first that does not succeed. */
async function runFrom(ctx: Context, from: AddStep): Promise<void> {
  if (current(ctx) === null) {
    return;
  }
  update(ctx, () => ({ phase: { kind: "running" } }));
  let index = current(ctx)?.steps.indexOf(from) ?? -1;
  while (index >= 0) {
    const run = current(ctx);
    const step = run?.steps[index];
    if (step === undefined || !(await runStep(ctx, step))) {
      return;
    }
    // Step 1 may add or drop step 4, so the next step is looked up in the list as it is now.
    const after = current(ctx)?.steps.indexOf(step) ?? -1;
    index = after < 0 ? -1 : after + 1;
  }
}

/**
 * "Check again" after a cut request (6.6): the reads of step 1, then the run goes on from the first
 * step whose effect is not seen. A folder that is listed but not OK is the "noDir" case.
 */
async function observe(ctx: Context): Promise<void> {
  const run = current(ctx);
  if (run === null) {
    return;
  }
  const { choices } = run;
  let folders;
  let shares;
  let settings;
  try {
    [folders, shares, settings] = await Promise.all([
      ctx.api.shares.folders(),
      ctx.api.shares.shares(),
      ctx.api.shares.settings(),
    ]);
  } catch {
    const phase = current(ctx)?.phase;
    if (phase?.kind === "failed") {
      update(ctx, () => ({ phase }));
    }
    return;
  }
  const row = findMade(folders, choices, run.uuid);
  if (row === undefined) {
    update(ctx, () => ({ uuid: null }));
    await runFrom(ctx, "make");
    return;
  }
  adopt(ctx, row.uuid);
  if (row.status !== "OK") {
    fail(ctx, "make", { kind: "noDir", error: undefined });
    return;
  }
  mark(ctx, "make", { status: "succeeded" });
  const steps = current(ctx)?.steps ?? [];
  const seen: Partial<Record<AddStep, boolean>> = {
    access: samePrivileges(row.privileges, {
      privilege: choices.privileges.map((p) => ({ ...p })),
    }),
    smbOn: settings.enable,
    share: shareOf(shares, row.uuid) !== undefined,
  };
  const from = steps.findIndex(
    (s) => s !== "check" && s !== "make" && seen[s] !== true,
  );
  for (const step of steps.slice(2, from < 0 ? steps.length : from)) {
    mark(ctx, step, { status: "succeeded" });
  }
  await runFrom(ctx, steps[from] ?? "apply");
}

// ---- What the pages call -------------------------------------------------------------------------

/** A run is active until it is done, stopped or removed: it then only shows its result. */
export const isActive = (run: AddRun): boolean =>
  run.phase.kind === "running" ||
  run.phase.kind === "failed" ||
  run.phase.kind === "alsoPending";

function settle(ctx: Context) {
  const run = current(ctx);
  if (run !== null && !isActive(run) && run.uuid !== null) {
    endAction(run.uuid);
  }
}

/** Start a run from the confirmed summary. Refused while another add run is under way. */
export function startAddFlow(
  api: AddFlowApi,
  labels: TaskLabels,
  choices: AddChoices,
): boolean {
  const existing = addFlowStore.getState().run;
  if (existing !== null && isActive(existing)) {
    return false;
  }
  const id = nextRunId++;
  const steps = addSteps(choices);
  const ctx: Context = { id, api, labels };
  contexts.clear();
  contexts.set(id, ctx);
  addFlowStore.set({
    run: {
      id,
      choices,
      steps,
      state: Object.fromEntries(
        steps.map((s) => [s, { status: "waiting" as const }]),
      ),
      phase: { kind: "running" },
      busy: "start",
      uuid: null,
      acceptOthers: false,
    },
  });
  void runFrom(ctx, "check").finally(() => {
    update(ctx, () => ({ busy: null }));
    settle(ctx);
  });
  return true;
}

export type AddFlowAction =
  "retry" | "checkAgain" | "applyToo" | "removeAgain" | "stop";

/** The reader's decision after a failure or at the pause. Ignored while another is under way. */
export function addFlowAction(action: AddFlowAction): void {
  const run = addFlowStore.getState().run;
  const ctx = run === null ? undefined : contexts.get(run.id);
  if (run === null || ctx === undefined || run.busy !== null) {
    return;
  }
  const phase = run.phase;
  const at: AddStep = phase.kind === "failed" ? phase.at : "apply";
  const go = (work: () => Promise<unknown>) => {
    update(ctx, () => ({ busy: action }));
    void work().finally(() => {
      update(ctx, () => ({ busy: null }));
      settle(ctx);
    });
  };
  switch (action) {
    case "retry":
      go(() => runFrom(ctx, at));
      return;
    case "checkAgain":
      go(() =>
        phase.kind === "failed" && phase.failure.kind === "unknown"
          ? observe(ctx)
          : runFrom(ctx, at),
      );
      return;
    case "applyToo":
      update(ctx, () => ({ acceptOthers: true }));
      go(() => runFrom(ctx, "apply"));
      return;
    case "removeAgain": {
      const uuid = run.uuid;
      if (uuid === null) {
        return;
      }
      // Remove the record only (recursive false): nothing on the disk is touched (6.6).
      go(async () => {
        try {
          await ctx.api.shares.deleteFolder(uuid, false);
        } catch (error) {
          update(ctx, () => ({
            phase: {
              kind: "failed",
              at: "make",
              failure: { kind: "removeFailed", error },
            },
          }));
          return;
        }
        endAction(uuid);
        forgetFolder(uuid);
        update(ctx, () => ({ phase: { kind: "removed" } }));
      });
      return;
    }
    case "stop":
      update(ctx, () => ({
        phase: {
          kind: "stopped",
          at,
          ...(phase.kind === "failed" ? { failure: phase.failure } : {}),
        },
      }));
      settle(ctx);
      return;
  }
}

/** The reader dismissed the result, or went back to the form: the run is forgotten. */
export function clearAddFlow(): void {
  const run = addFlowStore.getState().run;
  if (run !== null) {
    contexts.delete(run.id);
    if (isActive(run) && run.uuid !== null) {
      endAction(run.uuid);
    }
  }
  addFlowStore.set({ run: null });
}

export const saveAddDraft = (draft: AddDraft): void =>
  addFlowStore.set({ draft });

export const clearAddDraft = (): void => addFlowStore.set({ draft: null });
