// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a copy job" and the changes that need a trial, as they run (phase 5 services design 5.5 to
// 5.8, section 6; UX audit R1 to R10). A run starts only from the reader's confirmation of the summary
// (R9: never on page load):
//
//   "Save and try it": 1 Check, 2 Save the job for trial runs, 3 Apply, 4 Trial run, 5 Read the trial;
//   then, on "Turn the job on…" and its confirmation, 6 Save the job, 7 Apply.
//   "Save and turn on" (no deletion): 1 Check, Save the job, 3 Apply; the job is then on.
//
// The job's page turns a trial-only job on with steps 6 and 7 alone (4.2). A failed step stops the run
// and waits for the reader: nothing retries by itself (UI-14). No undo is offered after step 2 (5.8):
// the saved job is harmless, trial-only and off its schedule, and is on the list to change or delete.
//
// Observed on the test VM: Rsync.set marks exactly `rsync`, so each checkpoint expects only it (R10);
// a job with `enable` false runs with Rsync.execute, so a trial-only job is saved off its schedule.
//
// The run lives here, in memory for the session (emptied when it ends, app.ts), not in a page. The
// password for another computer's rsync server is never in the store: it is handed to the save step,
// sent once and dropped (0.8, UI-6); turning the job on asks for it again.
import type {
  ConfiguredFilesystem,
  RsyncJob,
  RsyncJobStored,
  RsyncSetRequest,
  SharedFolder,
  SshCertificateListDataItem,
} from "@omv-webui/react-api-omv/generated";
import {
  taskRegistry,
  type TaskRegistry,
} from "@omv-webui/react-api-omv/tasks";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { otherModules } from "../filesystems/fsModel.ts";
import { isCut, startTask } from "../filesystems/fsTasks.ts";
import type { FsApi } from "../hooks/useFsApi.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import {
  choicesFromJob,
  deletes,
  jobRefusals,
  jobRequest,
  NEW_JOB_UUID,
  remoteOf,
  trialKey,
  type JobChoices,
  type JobRefusal,
} from "./jobModel.ts";
import {
  recordIntended,
  recordJobSaved,
  recordRun,
  recordTrial,
} from "./jobsSession.ts";
import {
  failureOutput,
  readTrial,
  runLines,
  type TrialReading,
} from "./trialOutput.ts";

/** The modules a copy job's save marks pending (observed: exactly `rsync`). */
export const JOB_MODULES = ["rsync"] as const;

export type JobFlowStep =
  | "check"
  | "saveTrial"
  | "save"
  | "apply"
  | "trial"
  | "read"
  | "saveOn"
  | "applyOn";

export type JobFlowKind = "try" | "on" | "turnOn";

/** The steps of 5.6 for a kind, in order; "try" gains steps 6 and 7 when it is turned on. */
export function jobFlowSteps(kind: JobFlowKind): JobFlowStep[] {
  switch (kind) {
    case "try":
      return ["check", "saveTrial", "apply", "trial", "read"];
    case "on":
      return ["check", "save", "apply"];
    case "turnOn":
      return ["saveOn", "applyOn"];
  }
}

export interface JobStepState {
  status: TaskStatus;
  /** The step's task (apply or trial) in the registry; the handle stays in the task helper (UI-5). */
  taskId?: number;
}

/** What the reader chose, fixed at the summary. */
export interface JobFlowChoices {
  choices: JobChoices;
  /** The job's name as the summary said it, for the step list and the results. */
  name: string;
  /** The changed job, from Rsync.get, for a change (section 6); absent for a new job. */
  base?: RsyncJob;
}

export type JobFlowFailure =
  /** Step 1: other changes became pending (R1). */
  | { kind: "pending"; modules: string[] }
  /** Step 1: a refusal of 0.10 holds now. */
  | { kind: "refused"; refusals: JobRefusal[] }
  /** Step 1: the chosen SSH key is no longer one of the NAS's. */
  | { kind: "keyGone" }
  /** Step 1: a read failed. */
  | { kind: "checkRead"; error: unknown }
  /** A save was refused (2 or 6): "The job was not saved." */
  | { kind: "notSaved"; error: unknown }
  /** An apply failed (3 or 7, R7). */
  | { kind: "apply"; error: unknown }
  /** Step 4 could not start the trial (Rsync.execute refused). */
  | { kind: "trialStart"; error: unknown }
  /** Step 6: the job changed since its trial (another administrator): run the trial again. */
  | { kind: "changed" }
  /** Step 6: the job is gone. */
  | { kind: "gone" }
  /** A save's request was cut: whether it took effect is not known. */
  | { kind: "unknown"; step: JobFlowStep };

/** How the trial ended (5.7). */
export interface TrialResult {
  outcome: "succeeded" | "failed";
  reading: TrialReading;
  /** Every line received, for "Show the whole trial output" and the failure's last lines. */
  lines: readonly string[];
  taskId: number;
}

export type JobFlowPhase =
  | { kind: "running" }
  | { kind: "failed"; at: JobFlowStep; failure: JobFlowFailure }
  /** R10: modules outside `rsync` are pending at a checkpoint. */
  | { kind: "alsoPending"; at: JobFlowStep; others: string[] }
  /** Step 5: the reader reads the trial and decides (5.7). */
  | { kind: "trialDone" }
  /** "Save and turn on", or the job turned on after its trial. */
  | { kind: "on" }
  /** "Leave it for trial runs": the flow ended with the job trial-only. */
  | { kind: "left" };

export interface JobFlowRun {
  id: number;
  kind: JobFlowKind;
  flow: JobFlowChoices;
  steps: JobFlowStep[];
  state: Readonly<Partial<Record<JobFlowStep, JobStepState>>>;
  phase: JobFlowPhase;
  /** The reader's last decision while it runs: that button shows it. */
  busy: string | null;
  /** The job's UUID once saved (or the changed job's). Memory only. */
  uuid: string | null;
  /** What the trial was of (jobModel.trialKey), once read. */
  tried: string | null;
  trial: TrialResult | null;
  /** On a schedule once on (the reader's When choice). */
  onSchedule: boolean;
  acceptOthers: boolean;
}

export interface JobFlowStore {
  run: JobFlowRun | null;
}

export const jobFlowStore = createMemoryStore<JobFlowStore>({ run: null });

/** The calls a run makes; it keeps them for its whole life. */
export interface JobFlowApi {
  folders(): Promise<SharedFolder[]>;
  fileSystems(): Promise<ConfiguredFilesystem[]>;
  pending(): Promise<string[]>;
  sshKeys(): Promise<SshCertificateListDataItem[]>;
  job(uuid: string): Promise<RsyncJob>;
  set(request: RsyncSetRequest): Promise<RsyncJobStored>;
  /** Rsync.execute: resolves to the handle the registry follows. */
  execute(uuid: string): () => Promise<string>;
  apply: FsApi["apply"];
}

export interface JobFlowLabels {
  apply: string;
  /** "Copy job: {{job}}". */
  trial: string;
  registry?: TaskRegistry;
}

interface Context {
  id: number;
  api: JobFlowApi;
  labels: JobFlowLabels;
}

let nextRunId = 1;
const contexts = new Map<number, Context>();

const current = (ctx: Context): JobFlowRun | null => {
  const run = jobFlowStore.getState().run;
  return run !== null && run.id === ctx.id ? run : null;
};

function update(
  ctx: Context,
  change: (run: JobFlowRun) => Partial<JobFlowRun>,
) {
  const run = current(ctx);
  if (run !== null) {
    jobFlowStore.set({ run: { ...run, ...change(run) } });
  }
}

const mark = (ctx: Context, step: JobFlowStep, state: JobStepState) =>
  update(ctx, (run) => ({ state: { ...run.state, [step]: state } }));

const fail = (ctx: Context, at: JobFlowStep, failure: JobFlowFailure) => {
  mark(ctx, at, { ...(current(ctx)?.state[at] ?? {}), status: "failed" });
  update(ctx, () => ({ phase: { kind: "failed", at, failure } }));
};

/** A shared folder side's check applies to a new job, and to a side a change moved (0.10). */
function foldersToCheck(flow: JobFlowChoices) {
  const before = flow.base === undefined ? null : choicesFromJob(flow.base);
  const same = (a: JobChoices["from"], b: JobChoices["from"] | undefined) =>
    b !== undefined &&
    a.kind === "folder" &&
    b.kind === "folder" &&
    a.uuid === b.uuid;
  return {
    from: before === null || !same(flow.choices.from, before.from),
    to: before === null || !same(flow.choices.to, before.to),
  };
}

// ---- The steps -----------------------------------------------------------------------------------

/** Step 1: nothing else pending (R1), and every refusal of 0.10 checked again, fresh (R3). */
async function stepCheck(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "check", { status: "running" });
  const { choices } = run.flow;
  const remote = remoteOf(choices);
  let reads;
  try {
    reads = await Promise.all([
      ctx.api.pending(),
      ctx.api.folders(),
      ctx.api.fileSystems(),
      remote?.via === "ssh" ? ctx.api.sshKeys() : Promise.resolve([]),
    ]);
  } catch (error) {
    fail(ctx, "check", { kind: "checkRead", error });
    return false;
  }
  const [pending, folders, fileSystems, keys] = reads;
  if (pending.length > 0) {
    fail(ctx, "check", { kind: "pending", modules: pending });
    return false;
  }
  const refusals = jobRefusals(
    choices,
    { folders, fileSystems },
    foldersToCheck(run.flow),
  );
  if (refusals.length > 0) {
    fail(ctx, "check", { kind: "refused", refusals });
    return false;
  }
  if (remote?.via === "ssh" && !keys.some((k) => k.uuid === remote.key)) {
    fail(ctx, "check", { kind: "keyGone" });
    return false;
  }
  mark(ctx, "check", { status: "succeeded" });
  return true;
}

/** Steps 2 and "Save the job": Rsync.set with every field (0.11); the password sent once. */
async function stepSave(
  ctx: Context,
  step: "saveTrial" | "save",
  password: string,
): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, step, { status: "running" });
  const trial = step === "saveTrial";
  let base = run.flow.base;
  try {
    // Read immediately before the write (R4): a change writes back what is stored now.
    if (base !== undefined) {
      base = await ctx.api.job(base.uuid);
    }
  } catch (error) {
    fail(ctx, step, { kind: "notSaved", error });
    return false;
  }
  const request = jobRequest({
    uuid: run.uuid ?? base?.uuid ?? NEW_JOB_UUID,
    choices: run.flow.choices,
    enable: trial ? false : run.onSchedule,
    dryrun: trial,
    password,
    ...(base === undefined ? {} : { base }),
  });
  if (request === null) {
    fail(ctx, step, { kind: "refused", refusals: [{ kind: "bothRemote" }] });
    return false;
  }
  try {
    const saved = await ctx.api.set(request);
    update(ctx, () => ({ uuid: saved.uuid }));
    recordJobSaved(saved.uuid);
    if (trial) {
      recordIntended(saved.uuid, run.onSchedule);
    }
  } catch (error) {
    fail(
      ctx,
      step,
      isCut(error) ? { kind: "unknown", step } : { kind: "notSaved", error },
    );
    return false;
  }
  mark(ctx, step, { status: "succeeded" });
  return true;
}

/** Steps 3 and 7, the checkpoints: what is pending now (R10), then the apply as a task. */
async function stepApply(
  ctx: Context,
  step: "apply" | "applyOn",
): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, step, { status: "running" });
  try {
    const others = otherModules(await ctx.api.pending(), JOB_MODULES);
    if (others.length > 0 && !run.acceptOthers) {
      mark(ctx, step, { status: "waiting" });
      update(ctx, () => ({ phase: { kind: "alsoPending", at: step, others } }));
      return false;
    }
  } catch {
    // Not knowing what else is pending is no reason to stop: the apply itself is the decision.
  }
  update(ctx, () => ({ phase: { kind: "running" } }));
  const task = startTask(
    ctx.labels.apply,
    ctx.api.apply({ modules: [], force: false }),
    ctx.labels.registry ?? taskRegistry,
  );
  mark(ctx, step, { status: "running", taskId: task.id });
  const done = await task.settled;
  if (current(ctx) === null) {
    return false;
  }
  if (done.state !== "done") {
    fail(ctx, step, { kind: "apply", error: done.error });
    return false;
  }
  mark(ctx, step, { status: "succeeded", taskId: task.id });
  return true;
}

/** Step 4: Rsync.execute as a task; step 5: its output read (5.7). */
async function stepTrial(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run?.uuid === null || run === null) {
    return false;
  }
  const uuid = run.uuid;
  mark(ctx, "trial", { status: "running" });
  mark(ctx, "read", { status: "waiting" });
  update(ctx, () => ({ trial: null, tried: null }));
  let tried: string | null = null;
  try {
    tried = trialKey(await ctx.api.job(uuid));
  } catch {
    // What the trial is of is read again at the turn-on; nothing here depends on it.
  }
  const task = startTask(
    ctx.labels.trial,
    ctx.api.execute(uuid),
    ctx.labels.registry ?? taskRegistry,
  );
  recordRun(uuid, task.id);
  mark(ctx, "trial", { status: "running", taskId: task.id });
  const done = await task.settled;
  if (current(ctx) === null) {
    return false;
  }
  const failed = done.state !== "done";
  const message = done.error?.message ?? "";
  const failure = failed ? failureOutput(message) : null;
  // A refusal to start (OMV's own message, no command): the trial never ran.
  if (failed && done.output === "" && failure?.exitCode === null) {
    fail(ctx, "trial", { kind: "trialStart", error: done.error });
    return false;
  }
  const lines = runLines(done.output, done.error?.message);
  const reading = readTrial(lines);
  mark(ctx, "trial", {
    status: failed ? "failed" : "succeeded",
    taskId: task.id,
  });
  mark(ctx, "read", { status: failed ? "failed" : "succeeded" });
  if (!failed && tried !== null) {
    recordTrial(uuid, { key: tried, deleteCount: reading.deleteCount });
  }
  update(ctx, () => ({
    tried,
    trial: {
      outcome: failed ? "failed" : "succeeded",
      reading,
      lines,
      taskId: task.id,
    },
    phase: { kind: "trialDone" },
  }));
  return false;
}

/**
 * Step 6: the job read again and compared with what was tried (5.7); then Rsync.set with trial runs
 * off and the schedule as chosen, from the job as stored (R4).
 */
async function stepSaveOn(ctx: Context, password: string): Promise<boolean> {
  const run = current(ctx);
  if (run?.uuid === null || run === null) {
    return false;
  }
  mark(ctx, "saveOn", { status: "running" });
  let job: RsyncJob;
  try {
    job = await ctx.api.job(run.uuid);
  } catch (error) {
    fail(ctx, "saveOn", { kind: "notSaved", error });
    return false;
  }
  if (deletes(job) && (run.tried === null || trialKey(job) !== run.tried)) {
    fail(ctx, "saveOn", { kind: "changed" });
    return false;
  }
  const choices = choicesFromJob(job);
  const request =
    choices === null
      ? null
      : jobRequest({
          uuid: job.uuid,
          choices,
          enable: run.onSchedule,
          dryrun: false,
          password,
          base: job,
        });
  if (request === null) {
    fail(ctx, "saveOn", { kind: "changed" });
    return false;
  }
  try {
    await ctx.api.set(request);
    recordJobSaved(job.uuid);
  } catch (error) {
    fail(
      ctx,
      "saveOn",
      isCut(error)
        ? { kind: "unknown", step: "saveOn" }
        : { kind: "notSaved", error },
    );
    return false;
  }
  mark(ctx, "saveOn", { status: "succeeded" });
  return true;
}

async function runStep(
  ctx: Context,
  step: JobFlowStep,
  password: { value: string },
): Promise<boolean> {
  const take = () => {
    // Taken once, then dropped: after the save returns the run holds no password (0.8).
    const typed = password.value;
    password.value = "";
    return typed;
  };
  switch (step) {
    case "check":
      return stepCheck(ctx);
    case "saveTrial":
    case "save":
      return stepSave(ctx, step, take());
    case "apply":
    case "applyOn":
      return stepApply(ctx, step);
    case "trial":
      return stepTrial(ctx);
    case "read":
      return true;
    case "saveOn":
      return stepSaveOn(ctx, take());
  }
}

/** Run from a step to the end, stopping at the first that does not succeed. */
async function runFrom(
  ctx: Context,
  from: JobFlowStep,
  password: { value: string } = { value: "" },
): Promise<void> {
  try {
    if (current(ctx) === null) {
      return;
    }
    update(ctx, () => ({ phase: { kind: "running" } }));
    const steps = current(ctx)?.steps ?? [];
    for (const step of steps.slice(Math.max(0, steps.indexOf(from)))) {
      if (!(await runStep(ctx, step, password))) {
        return;
      }
    }
    const run = current(ctx);
    if (run !== null && run.phase.kind === "running") {
      update(ctx, () => ({ phase: { kind: "on" } }));
    }
  } finally {
    password.value = "";
  }
}

// ---- What the pages call -------------------------------------------------------------------------

/** A run is under way until it is on or left; a trial waiting to be read is still under way. */
export const isActive = (run: JobFlowRun): boolean =>
  run.phase.kind !== "on" && run.phase.kind !== "left";

function begin(
  api: JobFlowApi,
  labels: JobFlowLabels,
  run: Omit<JobFlowRun, "id" | "state" | "phase" | "busy" | "acceptOthers">,
  password: string,
): boolean {
  const existing = jobFlowStore.getState().run;
  if (existing !== null && isActive(existing)) {
    return false;
  }
  const id = nextRunId++;
  const ctx: Context = { id, api, labels };
  contexts.clear();
  contexts.set(id, ctx);
  jobFlowStore.set({
    run: {
      ...run,
      id,
      state: Object.fromEntries(
        run.steps.map((s) => [s, { status: "waiting" as const }]),
      ),
      phase: { kind: "running" },
      busy: "start",
      acceptOthers: false,
    },
  });
  void runFrom(ctx, run.steps[0] ?? "check", { value: password }).finally(
    () => {
      update(ctx, () => ({ busy: null }));
    },
  );
  return true;
}

/**
 * Start from the confirmed summary: "Save and try it" (`kind` "try") or "Save and turn on" ("on",
 * only without deletion). Refused while another run is under way.
 */
export function startJobFlow(
  api: JobFlowApi,
  labels: JobFlowLabels,
  flow: JobFlowChoices,
  kind: "try" | "on",
  password = "",
): boolean {
  if (kind === "on" && flow.choices.deletes) {
    return false;
  }
  return begin(
    api,
    labels,
    {
      kind,
      flow,
      steps: jobFlowSteps(kind),
      uuid: flow.base?.uuid ?? null,
      tried: null,
      trial: null,
      onSchedule: flow.choices.schedule.mode === "schedule",
    },
    password,
  );
}

/** The job's page turns a trial-only job on (4.2): steps 6 and 7, against the trial seen here. */
export function startTurnOn(
  api: JobFlowApi,
  labels: JobFlowLabels,
  job: RsyncJob,
  input: {
    name: string;
    onSchedule: boolean;
    tried: string | null;
    password: string;
  },
): boolean {
  const choices = choicesFromJob(job);
  if (choices === null) {
    return false;
  }
  return begin(
    api,
    labels,
    {
      kind: "turnOn",
      flow: { choices, name: input.name, base: job },
      steps: jobFlowSteps("turnOn"),
      uuid: job.uuid,
      tried: input.tried,
      trial: null,
      onSchedule: input.onSchedule,
    },
    input.password,
  );
}

export type JobFlowAction =
  /** Try the failed step again; a save that sends a password needs it typed again. */
  | { kind: "retry"; password?: string }
  /** R10: apply the other pending changes too. */
  | { kind: "applyToo" }
  /** 5.7: "Run the trial again". */
  | { kind: "trialAgain" }
  /** 5.7: "Turn the job on…" confirmed, with the password typed again when it signs in with one. */
  | { kind: "turnOn"; password?: string }
  /** 5.7: "Leave it for trial runs". */
  | { kind: "leave" };

/** The reader's decision after a failure, at the pause or after the trial. Ignored while one runs. */
export function jobFlowAction(action: JobFlowAction): void {
  const run = jobFlowStore.getState().run;
  const ctx = run === null ? undefined : contexts.get(run.id);
  if (run === null || ctx === undefined || run.busy !== null) {
    return;
  }
  const go = (work: () => Promise<unknown>) => {
    update(ctx, () => ({ busy: action.kind }));
    void work().finally(() => {
      update(ctx, () => ({ busy: null }));
    });
  };
  const phase = run.phase;
  switch (action.kind) {
    case "retry": {
      const at = phase.kind === "failed" ? phase.at : null;
      if (at === null) {
        return;
      }
      if (
        at === "saveOn" &&
        phase.kind === "failed" &&
        phase.failure.kind === "changed"
      ) {
        go(() => runFrom(ctx, "trial"));
        return;
      }
      go(() => runFrom(ctx, at, { value: action.password ?? "" }));
      return;
    }
    case "applyToo":
      if (phase.kind !== "alsoPending") {
        return;
      }
      update(ctx, () => ({ acceptOthers: true }));
      go(() => runFrom(ctx, phase.at));
      return;
    case "trialAgain":
      if (run.uuid === null) {
        return;
      }
      update(ctx, (r) => ({
        steps: r.steps.filter((s) => s !== "saveOn" && s !== "applyOn"),
      }));
      go(() => runFrom(ctx, "trial"));
      return;
    case "turnOn": {
      if (phase.kind !== "trialDone" || run.uuid === null) {
        return;
      }
      update(ctx, (r) => ({
        steps: [
          ...r.steps.filter((s) => s !== "saveOn" && s !== "applyOn"),
          "saveOn",
          "applyOn",
        ],
        state: {
          ...r.state,
          saveOn: { status: "waiting" },
          applyOn: { status: "waiting" },
        },
      }));
      go(() => runFrom(ctx, "saveOn", { value: action.password ?? "" }));
      return;
    }
    case "leave":
      update(ctx, () => ({ phase: { kind: "left" } }));
      return;
  }
}

/** The reader dismissed the result, or went back to the form: the run is forgotten. */
export function clearJobFlow(): void {
  const run = jobFlowStore.getState().run;
  if (run !== null) {
    contexts.delete(run.id);
  }
  jobFlowStore.set({ run: null });
}

/** The trial's output as lines, from the registry, for a page showing it (the run keeps a copy). */
export const trialLines = (
  registry: TaskRegistry,
  taskId: number,
): string[] => {
  const task = registry.get(taskId);
  return task === undefined ? [] : runLines(task.output, task.error?.message);
};

/** Whether the confirmation must ask for the password again (0.8). */
export const turnOnAsksPassword = (run: JobFlowRun): boolean =>
  remoteOf(run.flow.choices)?.via === "rsyncd";
