// SPDX-License-Identifier: GPL-3.0-or-later
// Flow A's run, "Add storage" and "Combine disks (BTRFS)" (phase 5 file-systems design 6.6, 6.7, 7.3;
// UX audit R3 to R10). It starts only from the reader's typed confirmation (R9: never on page load) and
// runs the steps in order: check the devices again (serial number and model included), erase the ones
// that hold something, create, find the new file system, set up its mount, the checkpoint "Mount the
// new file system" (R10, then the apply as a task), and the check that it is mounted. A failed step
// stops the run and waits for the reader: nothing retries by itself (UI-14).
//
// The run lives here, in memory for the session, not in a page: leaving the page does not stop it, and
// coming back shows the step list again. One run at a time blocks a second flow in the same session
// (7.3). Every write checks that its run is still the current one, so a run that was dismissed, or a
// session that ended, is never brought back by a late reply.
import type {
  ConfiguredFilesystem,
  DetectedFilesystem,
  DiskDevice,
  FileSystemMgmtCreateRequestType,
  FilesystemCandidate,
  MdArray,
} from "@omv-webui/react-api-omv/generated";
import { taskRegistry } from "@omv-webui/react-api-omv/tasks";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { diskSession } from "../disks/diskSession.ts";
import type { FsRef, SessionMarks, WipeBlocker } from "../disks/diskUse.ts";
import { startWipe } from "../disks/wipeTask.ts";
import type { FsApi } from "../hooks/useFsApi.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import { MOUNT_MODULES, otherModules } from "./fsModel.ts";
import { recordCreated, recordCreatedOn } from "./fsSession.ts";
import { startTask } from "./fsTasks.ts";
import {
  findNewFilesystem,
  findOnArray,
  storageChoices,
  type BtrfsProfile,
} from "./storageChoices.ts";

export type FlowKind = "single" | "multi";
export type Format = FileSystemMgmtCreateRequestType;

export type Target =
  | { kind: "disk"; group: "empty" | "reuse"; disk: DiskDevice; holds: FsRef[] }
  | { kind: "raid"; array: MdArray };

/** The reader's choices, fixed when the summary is confirmed. */
export interface FlowChoices {
  kind: FlowKind;
  /** One for "Add storage"; two or more disks for "Combine disks". */
  targets: Target[];
  format: Format;
  profile: BtrfsProfile | null;
  /** The tags as they are saved ("Media,Photos"). */
  tags: string;
  level: number;
}

export type StepKind =
  "check" | "erase" | "create" | "find" | "setUp" | "mount" | "verify";

export interface PlanStep {
  id: string;
  kind: StepKind;
  /** The device an erase step erases ("/dev/sdb"). */
  device?: string;
}

/** The device a target is named and confirmed by. */
export const targetDevice = (target: Target): string =>
  target.kind === "disk"
    ? target.disk.canonicaldevicefile
    : target.array.devicefile;

/** 6.6, 7.3: reads and checks first, then what cannot be undone, then configuration and the checkpoint. */
export function flowSteps(choices: FlowChoices): PlanStep[] {
  const erase = choices.targets
    .filter((t) => t.kind === "disk" && t.group === "reuse")
    .map((t): PlanStep => ({
      id: `erase:${targetDevice(t)}`,
      kind: "erase",
      device: targetDevice(t),
    }));
  return [
    { id: "check", kind: "check" },
    ...erase,
    { id: "create", kind: "create" },
    { id: "find", kind: "find" },
    { id: "setUp", kind: "setUp" },
    { id: "mount", kind: "mount" },
    { id: "verify", kind: "verify" },
  ];
}

export interface StepState {
  status: TaskStatus;
  /** The registry's id of the step's task, for its output and how long it has run. */
  taskId?: number;
}

/** Why the run stopped at a step (6.7). */
export type Failure =
  | { kind: "blocked"; device: string; blockers: WipeBlocker[] }
  | { kind: "changed"; device: string }
  | { kind: "checkRead"; device: string; error: unknown }
  | { kind: "erase"; device: string; error: unknown; erased: string[] }
  | { kind: "notCandidate"; device: string; erased: string[] }
  | { kind: "create"; device: string; error: unknown; erased: string[] }
  | { kind: "notFound" }
  | { kind: "ambiguous"; device: string }
  | { kind: "setUp"; error: unknown }
  | { kind: "mount"; error: unknown }
  | { kind: "notMounted" }
  | { kind: "otherModules"; modules: string[]; error: unknown };

export type FlowPhase =
  | { kind: "running" }
  | { kind: "failed"; at: string; failure: Failure }
  | { kind: "alsoPending"; others: string[] }
  | { kind: "done"; row: ConfiguredFilesystem }
  | { kind: "stopped"; at: string; failure?: Failure }
  | { kind: "undone" };

/** The words of the tasks in the Tasks menu, in the reader's language. */
export interface TaskLabels {
  candidates: string;
  erase: (device: string) => string;
  create: (device: string) => string;
  apply: string;
  undo: string;
}

export interface FlowRun {
  id: number;
  choices: FlowChoices;
  steps: PlanStep[];
  state: Readonly<Record<string, StepState>>;
  phase: FlowPhase;
  /** The action under way, so a second press is ignored. */
  busy: string | null;
  /** Step 1's fresh rows, by the target's device. */
  fresh: Readonly<Record<string, DiskDevice>>;
  /** The devices erased by this run. */
  erased: readonly string[];
  /** The new file system, once found. */
  found: DetectedFilesystem | null;
  /** The reader chose "Apply them too" at the checkpoint. */
  acceptOthers: boolean;
}

/** The form's values, kept while the run lasts so "Choose again" returns to them. */
export interface FlowDraft {
  /** The chosen devices' keys (a disk's stable device file, an array's device file). */
  chosen: readonly string[];
  format: Format;
  profile: BtrfsProfile;
  tags: string;
  level: number;
}

export interface FlowStore {
  run: FlowRun | null;
  /** Kept per flow kind: what the form shows again after "Change choices" or "Choose again". */
  draft: Partial<Record<FlowKind, FlowDraft>>;
}

export const flowStore = createMemoryStore<FlowStore>({ run: null, draft: {} });

let nextRunId = 1;

/** The run's session marks for the disk-use model: a wipe of the disk running now, or one that ended. */
function marksFor(disk: DiskDevice): SessionMarks {
  const session = diskSession.getState();
  const wipe = session.wipes[disk.devicefile];
  return {
    wiping:
      wipe !== undefined && taskRegistry.get(wipe.taskId)?.state === "running",
    wipedAt: session.wipedAt[disk.devicefile],
  };
}

interface Context {
  id: number;
  api: FsApi;
  labels: TaskLabels;
}

const current = (ctx: Context): FlowRun | null => {
  const run = flowStore.getState().run;
  return run !== null && run.id === ctx.id ? run : null;
};

function update(ctx: Context, change: (run: FlowRun) => Partial<FlowRun>) {
  const run = current(ctx);
  if (run !== null) {
    flowStore.set({ run: { ...run, ...change(run) } });
  }
}

const mark = (ctx: Context, step: string, state: StepState) =>
  update(ctx, (run) => ({ state: { ...run.state, [step]: state } }));

const fail = (ctx: Context, at: string, failure: Failure) => {
  mark(ctx, at, {
    ...(current(ctx)?.state[at] ?? { status: "failed" }),
    status: "failed",
  });
  update(ctx, () => ({ phase: { kind: "failed", at, failure } }));
};

/** Run the candidates task and return its list; throws the task's error when it failed. */
async function readCandidates(ctx: Context): Promise<FilesystemCandidate[]> {
  const task = startTask(ctx.labels.candidates, ctx.api.candidates());
  const done = await task.settled;
  taskRegistry.dismiss(task.id);
  if (done.state !== "done" || !Array.isArray(done.result)) {
    throw done.error ?? new Error("no result");
  }
  return done.result as FilesystemCandidate[];
}

const firstDevice = (run: FlowRun): string =>
  run.choices.targets[0] === undefined
    ? ""
    : targetDevice(run.choices.targets[0]);

// ---- The steps -----------------------------------------------------------------------------------

/** Step 1 (6.6, 6.7): every device still offered, in the same group, and the same device. */
async function stepCheck(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "check", { status: "running" });
  let reads;
  try {
    // The task first: when it ends every read is refreshed, so the four reads follow it.
    const candidates = await readCandidates(ctx);
    reads = [
      candidates,
      ...(await Promise.all([
        ctx.api.disks(),
        ctx.api.configured(),
        ctx.api.detected(),
        ctx.api.arrays(),
      ])),
    ] as const;
  } catch (error) {
    fail(ctx, "check", { kind: "checkRead", device: firstDevice(run), error });
    return false;
  }
  const [candidates, disks, configured, detected, arrays] = reads;
  const choices = storageChoices(
    { candidates, disks, configured, detected, arrays },
    marksFor,
  );
  if (choices.state !== "known") {
    fail(ctx, "check", {
      kind: "checkRead",
      device: firstDevice(run),
      error: undefined,
    });
    return false;
  }
  const fresh: Record<string, DiskDevice> = {};
  for (const target of run.choices.targets) {
    const device = targetDevice(target);
    if (target.kind === "raid") {
      const offered = choices.raid.find(
        (c) => c.array.devicefile === target.array.devicefile,
      );
      if (offered === undefined) {
        fail(ctx, "check", { kind: "blocked", device, blockers: [] });
        return false;
      }
      const same =
        offered.array.uuid === target.array.uuid &&
        offered.array.devices.join(",") === target.array.devices.join(",");
      if (!same) {
        fail(ctx, "check", { kind: "changed", device });
        return false;
      }
      continue;
    }
    const now = disks.find((d) => d.canonicaldevicefile === device);
    if (now === undefined) {
      fail(ctx, "check", { kind: "blocked", device, blockers: [] });
      return false;
    }
    if (
      now.serialnumber !== target.disk.serialnumber ||
      now.model !== target.disk.model ||
      now.devicefile !== target.disk.devicefile
    ) {
      fail(ctx, "check", { kind: "changed", device });
      return false;
    }
    const offered = [...choices.empty, ...choices.reuse].find(
      (c) => c.disk.canonicaldevicefile === device,
    );
    if (offered === undefined || offered.group !== target.group) {
      const unusable = choices.unusable.find(
        (u) => u.kind === "disk" && u.disk.canonicaldevicefile === device,
      );
      fail(ctx, "check", {
        kind: "blocked",
        device,
        blockers: unusable?.kind === "disk" ? unusable.blockers : [],
      });
      return false;
    }
    fresh[device] = offered.disk;
  }
  update(ctx, () => ({ fresh }));
  mark(ctx, "check", { status: "succeeded" });
  return true;
}

/** Step 2 (6.6): the quick wipe of a disk that holds something, then the server must offer it. */
async function stepErase(ctx: Context, step: PlanStep): Promise<boolean> {
  const run = current(ctx);
  const device = step.device ?? "";
  const disk = run?.fresh[device];
  if (run === null || disk === undefined) {
    return false;
  }
  if (!run.erased.includes(device)) {
    mark(ctx, step.id, { status: "running" });
    let taskId: number;
    try {
      taskId = await startWipe({
        devicefile: disk.devicefile,
        device,
        serial: disk.serialnumber,
        secure: false,
        label: ctx.labels.erase(device),
        begin: ctx.api.wipe(disk.devicefile),
      });
    } catch (error) {
      fail(ctx, step.id, {
        kind: "erase",
        device,
        error,
        erased: [...run.erased],
      });
      return false;
    }
    mark(ctx, step.id, { status: "running", taskId });
    const task = await waitFor(taskId);
    if (task?.state !== "done") {
      fail(ctx, step.id, {
        kind: "erase",
        device,
        error: task?.error,
        erased: [...(current(ctx)?.erased ?? [])],
      });
      return false;
    }
    update(ctx, (r) => ({ erased: [...r.erased, device] }));
  } else {
    mark(ctx, step.id, {
      ...(run.state[step.id] ?? {}),
      status: "running",
    });
  }
  let candidates: FilesystemCandidate[];
  try {
    candidates = await readCandidates(ctx);
  } catch {
    candidates = [];
  }
  if (!candidates.some((c) => c.devicefile === device)) {
    fail(ctx, step.id, {
      kind: "notCandidate",
      device,
      erased: [...(current(ctx)?.erased ?? [])],
    });
    return false;
  }
  mark(ctx, step.id, {
    ...(current(ctx)?.state[step.id] ?? {}),
    status: "succeeded",
  });
  return true;
}

/** Wait for a task the registry follows; undefined if it was forgotten (the session ended). */
function waitFor(id: number) {
  return new Promise<ReturnType<typeof taskRegistry.get>>((resolve) => {
    const now = taskRegistry.get(id);
    if (now === undefined || now.state !== "running") {
      resolve(now);
      return;
    }
    const off = taskRegistry.onSettled((task) => {
      if (task.id === id) {
        off();
        resolve(task);
      }
    });
  });
}

/** Step 3: create the file system, with the stable paths step 1 read. */
async function stepCreate(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const { choices } = run;
  const device =
    choices.kind === "multi"
      ? choices.targets.map(targetDevice).join(", ")
      : firstDevice(run);
  mark(ctx, "create", { status: "running" });
  let begin: () => Promise<string>;
  let devicefiles: string[];
  if (choices.kind === "multi") {
    devicefiles = choices.targets.map(
      (t) => run.fresh[targetDevice(t)]?.devicefile ?? "",
    );
    begin = ctx.api.createBtrfs({
      profile: choices.profile ?? "raid1",
      devicefiles: devicefiles.join(","),
    });
  } else {
    const target = choices.targets[0];
    const devicefile =
      target === undefined
        ? ""
        : target.kind === "raid"
          ? target.array.devicefile
          : (run.fresh[targetDevice(target)]?.devicefile ?? "");
    devicefiles = [devicefile];
    begin = ctx.api.create({ devicefile, type: choices.format });
  }
  recordCreatedOn([...devicefiles, ...choices.targets.map(targetDevice)]);
  const task = startTask(ctx.labels.create(device), begin);
  mark(ctx, "create", { status: "running", taskId: task.id });
  const done = await task.settled;
  if (done.state !== "done") {
    fail(ctx, "create", {
      kind: "create",
      device,
      error: done.error,
      erased: [...(current(ctx)?.erased ?? [])],
    });
    return false;
  }
  mark(ctx, "create", { status: "succeeded", taskId: task.id });
  return true;
}

/** Step 4: the new file system among the mount candidates, exactly one. */
async function stepFind(ctx: Context, rescan = false): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "find", { status: "running" });
  let candidates: DetectedFilesystem[];
  try {
    if (rescan) {
      await ctx.api.rescan();
    }
    candidates = await ctx.api.mountCandidates();
  } catch {
    fail(ctx, "find", { kind: "notFound" });
    return false;
  }
  const { choices } = run;
  const target = choices.targets[0];
  const found =
    target?.kind === "raid"
      ? findOnArray(candidates, target.array.devicefile)
      : findNewFilesystem(
          candidates,
          choices.targets.flatMap((t) =>
            t.kind === "disk" ? [run.fresh[targetDevice(t)] ?? t.disk] : [],
          ),
        );
  if (found.kind === "notFound") {
    fail(ctx, "find", { kind: "notFound" });
    return false;
  }
  if (found.kind === "ambiguous") {
    fail(ctx, "find", { kind: "ambiguous", device: firstDevice(run) });
    return false;
  }
  update(ctx, () => ({ found: found.fs }));
  mark(ctx, "find", { status: "succeeded" });
  return true;
}

/** Step 5: set up its mount, with the warning level and the tags. */
async function stepSetUp(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run?.found == null) {
    return false;
  }
  mark(ctx, "setUp", { status: "running" });
  try {
    await ctx.api.setMountPoint({
      id: run.found.devicefile,
      usagewarnthreshold: run.choices.level,
      comment: run.choices.tags,
    });
  } catch (error) {
    fail(ctx, "setUp", { kind: "setUp", error });
    return false;
  }
  if (run.found.uuid !== "") {
    recordCreated(run.found.uuid);
  }
  mark(ctx, "setUp", { status: "succeeded" });
  return true;
}

/** The configured row of the new file system, from a fresh read. */
async function newRow(ctx: Context): Promise<ConfiguredFilesystem | undefined> {
  const run = current(ctx);
  const found = run?.found;
  if (found == null) {
    return undefined;
  }
  const rows = await ctx.api.configured();
  return rows.find(
    (row) =>
      (found.uuid !== "" &&
        row.uuid.toLowerCase() === found.uuid.toLowerCase()) ||
      row.devicefile === found.devicefile,
  );
}

/** Step 6, the checkpoint (Q1): what is pending now (R10), then the apply as a task. */
async function stepMount(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "mount", { status: "running" });
  try {
    const others = otherModules(await ctx.api.pending(), MOUNT_MODULES);
    if (others.length > 0 && !run.acceptOthers) {
      mark(ctx, "mount", { status: "waiting" });
      update(ctx, () => ({ phase: { kind: "alsoPending", others } }));
      return false;
    }
  } catch {
    // Not knowing what else is pending is no reason to stop: the apply itself is the decision.
  }
  return applyAndVerify(ctx);
}

async function applyAndVerify(ctx: Context): Promise<boolean> {
  update(ctx, () => ({ phase: { kind: "running" } }));
  const task = startTask(
    ctx.labels.apply,
    ctx.api.apply({ modules: [], force: false }),
  );
  mark(ctx, "mount", { status: "running", taskId: task.id });
  const done = await task.settled;
  if (done.state === "done") {
    mark(ctx, "mount", { status: "succeeded", taskId: task.id });
    return stepVerify(ctx);
  }
  // The apply failed (B3): read the real mount state, so "mounted, but another module failed" is told
  // apart from "not mounted" (6.7).
  try {
    const row = await newRow(ctx);
    if (row?.status === 1 && row.mounted) {
      const still = await ctx.api.pending().catch(() => []);
      mark(ctx, "mount", { status: "failed", taskId: task.id });
      mark(ctx, "verify", { status: "succeeded" });
      update(ctx, () => ({
        phase: {
          kind: "failed",
          at: "mount",
          failure: { kind: "otherModules", modules: still, error: done.error },
        },
      }));
      return false;
    }
  } catch {
    // The read failed too: the failure stays the mount's.
  }
  fail(ctx, "mount", { kind: "mount", error: done.error });
  return false;
}

/** Step 7: the row is available and mounted, and its mount entry exists (B8, V1). */
async function stepVerify(ctx: Context): Promise<boolean> {
  mark(ctx, "verify", { status: "running" });
  try {
    const row = await newRow(ctx);
    if (row?.status === 1 && row.mounted) {
      const entry = await ctx.api.mountEntry(row.devicefile);
      if (entry !== false) {
        mark(ctx, "verify", { status: "succeeded" });
        update(ctx, () => ({ phase: { kind: "done", row } }));
        return true;
      }
    }
  } catch {
    // Not known to be mounted is not mounted: the flow never goes on to sharing (B8).
  }
  fail(ctx, "verify", { kind: "notMounted" });
  return false;
}

async function runStep(ctx: Context, step: PlanStep): Promise<boolean> {
  switch (step.kind) {
    case "check":
      return stepCheck(ctx);
    case "erase":
      return stepErase(ctx, step);
    case "create":
      return stepCreate(ctx);
    case "find":
      return stepFind(ctx);
    case "setUp":
      return stepSetUp(ctx);
    case "mount":
      return stepMount(ctx);
    case "verify":
      return stepVerify(ctx);
  }
}

/** Run from a step to the end, stopping at the first that does not succeed. */
async function runFrom(ctx: Context, from: string): Promise<void> {
  const run = current(ctx);
  if (run === null) {
    return;
  }
  update(ctx, () => ({ phase: { kind: "running" } }));
  const start = run.steps.findIndex((s) => s.id === from);
  for (const step of run.steps.slice(Math.max(0, start))) {
    if (!(await runStep(ctx, step))) {
      return;
    }
  }
}

// ---- What the page calls -------------------------------------------------------------------------

const contexts = new Map<number, Context>();

/** Start a run from the confirmed summary. Refused while another run is under way (7.3). */
export function startFlow(
  api: FsApi,
  labels: TaskLabels,
  choices: FlowChoices,
): boolean {
  const existing = flowStore.getState().run;
  if (existing !== null && isActive(existing)) {
    return false;
  }
  const id = nextRunId++;
  const steps = flowSteps(choices);
  const ctx: Context = { id, api, labels };
  contexts.clear();
  contexts.set(id, ctx);
  flowStore.set({
    run: {
      id,
      choices,
      steps,
      state: Object.fromEntries(
        steps.map((s) => [s.id, { status: "waiting" }]),
      ),
      phase: { kind: "running" },
      busy: "start",
      fresh: {},
      erased: [],
      found: null,
      acceptOthers: false,
    },
  });
  void runFrom(ctx, "check").finally(() => update(ctx, () => ({ busy: null })));
  return true;
}

/** A run is active until it is done, stopped or undone: it then only shows its result. */
export const isActive = (run: FlowRun): boolean =>
  run.phase.kind === "running" ||
  run.phase.kind === "failed" ||
  run.phase.kind === "alsoPending";

export type FlowAction =
  | "retry"
  | "lookAgain"
  | "rescan"
  | "applyToo"
  | "retryApply"
  | "undoMount"
  | "continue"
  | "stop";

/** The reader's decision after a failure or at the pause (6.7). Ignored while another is under way. */
export function flowAction(action: FlowAction): void {
  const run = flowStore.getState().run;
  const ctx = run === null ? undefined : contexts.get(run.id);
  if (run === null || ctx === undefined || run.busy !== null) {
    return;
  }
  const phase = run.phase;
  const at = phase.kind === "failed" ? phase.at : "mount";
  const go = (work: () => Promise<unknown>) => {
    update(ctx, () => ({ busy: action }));
    void work().finally(() => update(ctx, () => ({ busy: null })));
  };
  switch (action) {
    case "retry":
      go(() => runFrom(ctx, at));
      return;
    case "lookAgain":
      go(async () => {
        if (await stepFind(ctx)) {
          await runFrom(ctx, "setUp");
        }
      });
      return;
    case "rescan":
      go(async () => {
        update(ctx, () => ({ phase: { kind: "running" } }));
        if (await stepFind(ctx, true)) {
          await runFrom(ctx, "setUp");
        }
      });
      return;
    case "applyToo":
      update(ctx, () => ({ acceptOthers: true }));
      go(() => runFrom(ctx, "mount"));
      return;
    case "retryApply":
      go(async () => {
        await applyAndVerify(ctx);
      });
      return;
    case "undoMount":
      go(async () => {
        update(ctx, () => ({ phase: { kind: "running" } }));
        const revert = startTask(ctx.labels.undo, ctx.api.revert());
        const reverted = await revert.settled;
        if (reverted.state !== "done") {
          update(ctx, () => ({ phase: { kind: "stopped", at: "mount" } }));
          return;
        }
        // R7: after a partly failed apply and the undo, the modules are deployed again by force, so
        // the files on the NAS match the settings again (V5). Which of them the failed apply had
        // deployed is not known, so all four of the mount's are.
        const again = startTask(
          ctx.labels.apply,
          ctx.api.apply({ modules: [...MOUNT_MODULES], force: true }),
        );
        await again.settled;
        update(ctx, () => ({ phase: { kind: "undone" } }));
      });
      return;
    case "continue": {
      go(async () => {
        const row = await newRow(ctx).catch(() => undefined);
        if (row !== undefined) {
          update(ctx, () => ({ phase: { kind: "done", row } }));
        }
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
      return;
  }
}

/** The reader dismissed the result, or chose to go back to the form: the run is forgotten. */
export function clearFlow(): void {
  const run = flowStore.getState().run;
  if (run !== null) {
    contexts.delete(run.id);
  }
  flowStore.set({ run: null });
}

export function saveDraft(kind: FlowKind, draft: FlowDraft): void {
  flowStore.set((s) => ({ draft: { ...s.draft, [kind]: draft } }));
}
