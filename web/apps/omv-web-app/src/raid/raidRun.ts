// SPDX-License-Identifier: GPL-3.0-or-later
// The RAID flows' runs (phase 5 RAID design 3.4 to 3.7, 4.5 to 4.7; UX audit R3 to R10): creating an
// array, with "Use it for files" going on into Flow A's file-system steps on the array, and adding a
// disk to replace a missing one, keep a spare, or make the array bigger. A run starts only from the
// reader's typed confirmation (R9: never on page load) and runs its steps in order: check the disks
// and the array again (serial number, model, UUID, level, roles), erase the disks that hold something,
// then the change to the array, then the checkpoint that saves the array's settings (R10, then the
// apply as a task), and the check of the result. A failed step stops the run and waits for the reader:
// nothing retries by itself (UI-14).
//
// The run lives here, in memory for the session, not in a page: leaving the page does not stop it, and
// coming back shows the step list again. One RAID run at a time; every write checks that its run is
// still the current one, so a dismissed run or an ended session is never brought back by a late reply.
import type {
  ConfiguredFilesystem,
  DetectedFilesystem,
  DiskDevice,
  FilesystemCandidate,
  MdArray,
  MdDisk,
} from "@omv-webui/react-api-omv/generated";
import { taskRegistry } from "@omv-webui/react-api-omv/tasks";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { diskSession } from "../disks/diskSession.ts";
import { diskNames, type FsRef, type SessionMarks } from "../disks/diskUse.ts";
import { startWipe } from "../disks/wipeTask.ts";
import {
  MOUNT_MODULES,
  otherModules,
  ownUuid,
  sameUuid,
} from "../filesystems/fsModel.ts";
import { recordCreated, recordCreatedOn } from "../filesystems/fsSession.ts";
import { startTask } from "../filesystems/fsTasks.ts";
import { findOnArray } from "../filesystems/storageChoices.ts";
import type { FsApi } from "../hooks/useFsApi.ts";
import type { RaidApi } from "../hooks/useRaidApi.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import {
  isCandidate,
  raidChoices,
  sameDisks,
  type RaidUnusable,
} from "./raidChoices.ts";
import {
  addDecision,
  arrayState,
  isOnArray,
  levelKey,
  readReport,
  sameArray,
  type CreateLevel,
  type Member,
} from "./raidModel.ts";
import {
  beginChanging,
  endChanging,
  recordChanged,
  recordCreatedArray,
  recordGrown,
} from "./raidSession.ts";

/** The modules a change to an array marks pending (observed on the test VM). */
export const MD_MODULES = ["mdadm", "initramfs"] as const;

export type FsFormat = "ext4" | "xfs" | "btrfs";

/** A disk the reader chose, as Flow A's words name it. */
export interface DiskTarget {
  kind: "disk";
  group: "empty" | "reuse";
  disk: DiskDevice;
  holds: FsRef[];
}

export interface CreateChoices {
  kind: "create";
  targets: DiskTarget[];
  level: CreateLevel;
  forFiles: boolean;
  format: FsFormat;
  tags: string;
  warn: number;
}

export type AddPurpose = "replace" | "spare" | "bigger";

export interface AddChoices {
  kind: "add";
  /** The array as the summary showed it. */
  array: MdArray;
  /** The roles as the summary showed them. */
  roles: { working: number; spares: number; failed: number; missing: number };
  /** The smallest member's size, for "Too small". */
  minSize: number | null;
  /** About how large the array becomes when made bigger (4.4), from the level and the sizes. */
  estimate: number | null;
  purpose: AddPurpose;
  targets: DiskTarget[];
  /** A failed member still listed, taken out after the new disk is in (4.5 step 5). */
  takeOut: (Member & { model: string; serial: string }) | null;
}

export type RaidFlowChoices = CreateChoices | AddChoices;

export type StepKind =
  | "check"
  | "erase"
  | "create"
  | "find"
  | "fsCandidate"
  | "clear"
  | "fsCreate"
  | "fsFind"
  | "fsSetUp"
  | "add"
  | "verifyAdd"
  | "takeOut"
  | "save"
  | "verify";

export interface PlanStep {
  id: string;
  kind: StepKind;
  device?: string;
}

export const targetDevice = (t: DiskTarget): string =>
  t.disk.canonicaldevicefile;

export function raidSteps(choices: RaidFlowChoices): PlanStep[] {
  const erase = choices.targets
    .filter((t) => t.group === "reuse")
    .map((t): PlanStep => ({
      id: `erase:${targetDevice(t)}`,
      kind: "erase",
      device: targetDevice(t),
    }));
  if (choices.kind === "create") {
    return [
      { id: "check", kind: "check" },
      ...erase,
      { id: "create", kind: "create" },
      { id: "find", kind: "find" },
      ...(choices.forFiles
        ? ([
            { id: "fsCandidate", kind: "fsCandidate" },
            { id: "fsCreate", kind: "fsCreate" },
            { id: "fsFind", kind: "fsFind" },
            { id: "fsSetUp", kind: "fsSetUp" },
          ] as PlanStep[])
        : []),
      { id: "save", kind: "save" },
      { id: "verify", kind: "verify" },
    ];
  }
  return [
    { id: "check", kind: "check" },
    ...erase,
    { id: "add", kind: "add" },
    { id: "verifyAdd", kind: "verifyAdd" },
    ...(choices.takeOut !== null
      ? [{ id: "takeOut", kind: "takeOut" } as PlanStep]
      : []),
    { id: "save", kind: "save" },
  ];
}

/** What the checkpoint expects pending, exactly (R10). */
export const expectedModules = (choices: RaidFlowChoices): string[] =>
  choices.kind === "create" && choices.forFiles
    ? [...MD_MODULES, ...MOUNT_MODULES]
    : [...MD_MODULES];

export interface StepState {
  status: TaskStatus;
  taskId?: number;
}

export type Failure =
  | { kind: "blocked"; device: string; reason: RaidUnusable | null }
  | { kind: "changed"; device: string }
  | { kind: "arrayChanged" }
  | { kind: "checkRead"; error: unknown }
  | { kind: "erase"; device: string; error: unknown; erased: string[] }
  | { kind: "notCandidate"; device: string; erased: string[] }
  | { kind: "create"; error: unknown }
  | { kind: "notFound" }
  | { kind: "fsCandidate"; error: unknown }
  /** The new array could not be cleared: stop, nothing else erased. */
  | { kind: "clear"; error: unknown }
  | { kind: "fsCreate"; error: unknown }
  | { kind: "fsNotFound" }
  | { kind: "fsSetUp"; error: unknown }
  | { kind: "add"; device: string; error: unknown }
  | { kind: "spareOnly"; device: string; error: unknown }
  | { kind: "notReported" }
  | { kind: "takeOut"; error: unknown }
  | { kind: "save"; error: unknown }
  | { kind: "notVerified" };

export type RaidPhase =
  | { kind: "running" }
  | { kind: "failed"; at: string; failure: Failure }
  | { kind: "alsoPending"; others: string[] }
  | { kind: "done" }
  | { kind: "stopped"; at: string; failure?: Failure };

export interface TaskLabels {
  erase: (device: string) => string;
  fsCandidates: string;
  fsCreate: (device: string) => string;
  clear: (device: string) => string;
  apply: string;
}

export interface RaidRun {
  id: number;
  choices: RaidFlowChoices;
  steps: PlanStep[];
  state: Readonly<Record<string, StepState>>;
  phase: RaidPhase;
  busy: string | null;
  /** Step 1's fresh rows, by the target's device. */
  fresh: Readonly<Record<string, DiskDevice>>;
  erased: readonly string[];
  /** The created array's device file, from create's reply. */
  createdDevice: string | null;
  /** The array as last read: the new one, or the one disks were added to. */
  array: MdArray | null;
  /** The new file system, once found; its configured row once mounted. */
  found: DetectedFilesystem | null;
  fsRow: ConfiguredFilesystem | null;
  acceptOthers: boolean;
  /** The session's changing key, released when the run ends. */
  changingKey: string;
}

export interface CreateDraft {
  chosen: readonly string[];
  /** null: no level chosen (Stripe is never preselected, not even after "Change choices"). */
  level: CreateLevel | null;
  forFiles: boolean;
  format: FsFormat;
  tags: string;
  warn: number;
}

export interface AddDraft {
  uuid: string;
  chosen: readonly string[];
  purpose: AddPurpose | null;
}

export interface RaidFlowStore {
  run: RaidRun | null;
  create: CreateDraft | null;
  add: AddDraft | null;
}

export const raidFlowStore = createMemoryStore<RaidFlowStore>({
  run: null,
  create: null,
  add: null,
});

let nextRunId = 1;

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
  fs: FsApi;
  raid: RaidApi;
  labels: TaskLabels;
}

const current = (ctx: Context): RaidRun | null => {
  const run = raidFlowStore.getState().run;
  return run !== null && run.id === ctx.id ? run : null;
};

function update(ctx: Context, change: (run: RaidRun) => Partial<RaidRun>) {
  const run = current(ctx);
  if (run !== null) {
    raidFlowStore.set({ run: { ...run, ...change(run) } });
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

/** The array by its UUID in a fresh read, if it is still there under the same device file. */
const findSame = (rows: readonly MdArray[], shown: MdArray) =>
  rows.find((row) => sameArray(row, shown));

const isMember = (array: MdArray, disk: DiskDevice) => {
  const names = diskNames(disk);
  return array.devices.some((d) => names.has(d));
};

// ---- The steps -----------------------------------------------------------------------------------

/** Step 1: every disk still offered in the same group, the same disk; for add, the same array. */
async function stepCheck(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "check", { status: "running" });
  const { choices } = run;
  let reads;
  try {
    reads = await Promise.all([
      ctx.raid.candidates(),
      ctx.fs.disks(),
      ctx.fs.configured(),
      ctx.fs.detected(),
      ctx.raid.arrays(),
    ]);
  } catch (error) {
    fail(ctx, "check", { kind: "checkRead", error });
    return false;
  }
  const [candidates, disks, configured, detected, arrays] = reads;
  if (choices.kind === "add") {
    const now = arrays.find((a) => a.devicefile === choices.array.devicefile);
    if (
      now === undefined ||
      !sameArray(now, choices.array) ||
      now.level !== choices.array.level ||
      now.numdevices !== choices.array.numdevices
    ) {
      fail(ctx, "check", { kind: "arrayChanged" });
      return false;
    }
    let detail: string;
    try {
      detail = await ctx.raid.detail(now.devicefile);
    } catch (error) {
      fail(ctx, "check", { kind: "checkRead", error });
      return false;
    }
    const report = readReport(detail, now.devices);
    const state = arrayState(now, report, detail);
    const decision = addDecision(levelKey(now.level), state, report, false);
    const sameRoles =
      report.known &&
      report.working === choices.roles.working &&
      report.spares === choices.roles.spares &&
      report.failed === choices.roles.failed &&
      report.missing === choices.roles.missing;
    const purposeOk =
      decision.allowed &&
      (decision.mode === "replace"
        ? choices.purpose === "replace"
        : decision.mode === "spare"
          ? choices.purpose === "spare"
          : choices.purpose !== "replace");
    if (!sameRoles || !purposeOk) {
      fail(ctx, "check", { kind: "arrayChanged" });
      return false;
    }
    update(ctx, () => ({ array: now }));
  }
  const placed = raidChoices(
    { candidates, disks, configured, detected, arrays },
    marksFor,
    undefined,
    choices.kind === "add" ? choices.minSize : null,
  );
  if (placed.state !== "known") {
    fail(ctx, "check", { kind: "checkRead", error: undefined });
    return false;
  }
  const fresh: Record<string, DiskDevice> = {};
  for (const target of choices.targets) {
    const device = targetDevice(target);
    const now = disks.find((d) => d.canonicaldevicefile === device);
    if (now === undefined) {
      fail(ctx, "check", { kind: "blocked", device, reason: null });
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
    const offered = [...placed.empty, ...placed.reuse].find(
      (c) => c.disk.canonicaldevicefile === device,
    );
    if (offered === undefined || offered.group !== target.group) {
      fail(ctx, "check", {
        kind: "blocked",
        device,
        reason:
          placed.unusable.find((u) => u.disk.canonicaldevicefile === device) ??
          null,
      });
      return false;
    }
    fresh[device] = offered.disk;
  }
  update(ctx, () => ({ fresh }));
  mark(ctx, "check", { status: "succeeded" });
  return true;
}

/** Step 2: the quick wipe of a disk that holds something, then the plugin must offer it. */
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
        begin: ctx.fs.wipe(disk.devicefile),
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
    mark(ctx, step.id, { ...(run.state[step.id] ?? {}), status: "running" });
  }
  let candidates: MdDisk[];
  try {
    candidates = await ctx.raid.candidates();
  } catch {
    candidates = [];
  }
  if (!isCandidate(candidates, disk)) {
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

const freshDisks = (run: RaidRun): DiskDevice[] =>
  run.choices.targets.map((t) => run.fresh[targetDevice(t)] ?? t.disk);

/** Create: MdMgmt.create with the disks' stable names (0.7). Synchronous, a few seconds. */
async function stepCreate(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null || run.choices.kind !== "create") {
    return false;
  }
  if (run.createdDevice !== null) {
    // Created before a later step failed and "Try again" came back here: never twice.
    mark(ctx, "create", { status: "succeeded" });
    return true;
  }
  mark(ctx, "create", { status: "running" });
  try {
    const reply = await ctx.raid.create({
      devices: freshDisks(run).map((d) => d.devicefile),
      name: "",
      level: run.choices.level,
    });
    update(ctx, () => ({ createdDevice: reply.devicefile }));
    recordChanged(reply.devicefile);
  } catch (error) {
    fail(ctx, "create", { kind: "create", error });
    return false;
  }
  mark(ctx, "create", { status: "succeeded" });
  return true;
}

/** Find the new array: the reply's device file with exactly the chosen disks. */
async function stepFind(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null || run.choices.kind !== "create") {
    return false;
  }
  mark(ctx, "find", { status: "running" });
  let arrays: MdArray[];
  try {
    arrays = await ctx.raid.arrays();
  } catch {
    fail(ctx, "find", { kind: "notFound" });
    return false;
  }
  const disks = freshDisks(run);
  const matches = arrays.filter(
    (a) =>
      (run.createdDevice === null || a.devicefile === run.createdDevice) &&
      sameDisks(a.devices, disks),
  );
  const array = matches.length === 1 ? matches[0] : undefined;
  if (array === undefined) {
    fail(ctx, "find", { kind: "notFound" });
    return false;
  }
  update(ctx, () => ({ array }));
  recordCreatedArray({
    uuid: array.uuid,
    devicefile: array.devicefile,
    forFiles: run.choices.forFiles,
  });
  endChanging(run.changingKey);
  beginChanging(array.uuid);
  update(ctx, () => ({ changingKey: array.uuid }));
  mark(ctx, "find", { status: "succeeded" });
  return true;
}

/** Run the file-system candidates task and return its list; throws when it failed. */
async function fsCandidates(ctx: Context): Promise<FilesystemCandidate[]> {
  const task = startTask(ctx.labels.fsCandidates, ctx.fs.candidates());
  const done = await task.settled;
  taskRegistry.dismiss(task.id);
  if (done.state !== "done" || !Array.isArray(done.result)) {
    throw done.error ?? new Error("no result");
  }
  return done.result as FilesystemCandidate[];
}

/** How many times, and how far apart, the new array is looked for among the candidates. */
const FS_CANDIDATE_TRIES = 5;
const FS_CANDIDATE_WAIT_MS = 2_000;

async function stepFsCandidate(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  const array = run?.array;
  if (run === null || array == null) {
    return false;
  }
  mark(ctx, "fsCandidate", { status: "running" });
  // A new array is a candidate within moments of its creation, once the system has seen the new
  // device (observed). This is a read, so it is looked at again a few times; no change is repeated.
  const listed = async () => {
    for (let attempt = 0; attempt < FS_CANDIDATE_TRIES; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, FS_CANDIDATE_WAIT_MS),
        );
      }
      const list = await fsCandidates(ctx);
      if (list.some((c) => c.devicefile === array.devicefile)) {
        return true;
      }
    }
    return false;
  };
  try {
    if (!(await listed())) {
      // Deleting an array erases only its marks (7), so a new array on the same disks can show the
      // old array's file system again (observed on the VM), and the system then does not offer it.
      // Those disks' contents are what the reader confirmed erasing (the summary says so): the new
      // array is cleared in a step of its own, shown only when it runs (owner, 2026-11-22).
      const detected = await ctx.fs.detected();
      if (!detected.some((fs) => isOnArray(fs, array.devicefile))) {
        fail(ctx, "fsCandidate", { kind: "fsCandidate", error: undefined });
        return false;
      }
      mark(ctx, "fsCandidate", { status: "succeeded" });
      update(ctx, (r) =>
        r.steps.some((step) => step.id === "clear")
          ? {}
          : {
              steps: r.steps.flatMap((step) =>
                step.id === "fsCandidate"
                  ? [step, { id: "clear", kind: "clear" as const }]
                  : [step],
              ),
              state: { ...r.state, clear: { status: "waiting" } },
            },
      );
      return await stepClear(ctx, listed);
    }
  } catch (error) {
    fail(ctx, "fsCandidate", { kind: "fsCandidate", error });
    return false;
  }
  mark(ctx, "fsCandidate", { status: "succeeded" });
  return true;
}

/**
 * Clear the new array (owner, 2026-11-22): a quick wipe of the array this run has just made, then the
 * candidates again. A failure stops the run with the server's words; nothing else is erased.
 */
async function stepClear(
  ctx: Context,
  listed: () => Promise<boolean>,
): Promise<boolean> {
  const run = current(ctx);
  const array = run?.array;
  if (run === null || array == null) {
    return false;
  }
  mark(ctx, "clear", { status: "running" });
  let taskId: number;
  try {
    taskId = await startWipe({
      devicefile: array.devicefile,
      device: array.devicefile,
      serial: "",
      secure: false,
      label: ctx.labels.clear(array.devicefile),
      begin: ctx.fs.wipe(array.devicefile),
    });
  } catch (error) {
    fail(ctx, "clear", { kind: "clear", error });
    return false;
  }
  mark(ctx, "clear", { status: "running", taskId });
  const task = await waitFor(taskId);
  if (task?.state !== "done") {
    fail(ctx, "clear", { kind: "clear", error: task?.error });
    return false;
  }
  try {
    if (!(await listed())) {
      fail(ctx, "clear", { kind: "fsCandidate", error: undefined });
      return false;
    }
  } catch (error) {
    fail(ctx, "clear", { kind: "fsCandidate", error });
    return false;
  }
  mark(ctx, "clear", { status: "succeeded", taskId });
  return true;
}

async function stepFsCreate(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  const array = run?.array;
  if (run === null || array == null || run.choices.kind !== "create") {
    return false;
  }
  mark(ctx, "fsCreate", { status: "running" });
  recordCreatedOn([array.devicefile]);
  const task = startTask(
    ctx.labels.fsCreate(array.devicefile),
    ctx.fs.create({ devicefile: array.devicefile, type: run.choices.format }),
  );
  mark(ctx, "fsCreate", { status: "running", taskId: task.id });
  const done = await task.settled;
  if (done.state !== "done") {
    fail(ctx, "fsCreate", { kind: "fsCreate", error: done.error });
    return false;
  }
  mark(ctx, "fsCreate", { status: "succeeded", taskId: task.id });
  return true;
}

async function stepFsFind(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  const array = run?.array;
  if (run === null || array == null) {
    return false;
  }
  mark(ctx, "fsFind", { status: "running" });
  let candidates: DetectedFilesystem[];
  try {
    candidates = await ctx.fs.mountCandidates();
  } catch {
    fail(ctx, "fsFind", { kind: "fsNotFound" });
    return false;
  }
  const found = findOnArray(candidates, array.devicefile);
  if (found.kind !== "found") {
    fail(ctx, "fsFind", { kind: "fsNotFound" });
    return false;
  }
  update(ctx, () => ({ found: found.fs }));
  mark(ctx, "fsFind", { status: "succeeded" });
  return true;
}

async function stepFsSetUp(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run?.found == null || run.choices.kind !== "create") {
    return false;
  }
  mark(ctx, "fsSetUp", { status: "running" });
  try {
    await ctx.fs.setMountPoint({
      id: run.found.devicefile,
      usagewarnthreshold: run.choices.warn,
      comment: run.choices.tags,
    });
  } catch (error) {
    fail(ctx, "fsSetUp", { kind: "fsSetUp", error });
    return false;
  }
  const created = ownUuid(run.found);
  if (created !== "") {
    recordCreated(created);
  }
  mark(ctx, "fsSetUp", { status: "succeeded" });
  return true;
}

/** Add: MdMgmt.add (one disk) or MdMgmt.grow (one or more), with the stable names. */
async function stepAdd(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null || run.choices.kind !== "add") {
    return false;
  }
  const { choices } = run;
  const array = run.array ?? choices.array;
  const disks = freshDisks(run);
  const device = choices.targets.map(targetDevice).join(", ");
  mark(ctx, "add", { status: "running" });
  try {
    if (choices.purpose === "bigger") {
      await ctx.raid.grow(
        array.devicefile,
        disks.map((d) => d.devicefile),
      );
    } else {
      await ctx.raid.add(array.devicefile, disks[0]?.devicefile ?? "");
    }
  } catch (error) {
    if (choices.purpose === "bigger") {
      // The server adds the disks before it reshapes: one that is now a member stays as a spare.
      const now = await ctx.raid
        .arrays()
        .then((rows) => findSame(rows, array))
        .catch(() => undefined);
      if (now !== undefined && disks.some((d) => isMember(now, d))) {
        recordChanged(array.devicefile);
        fail(ctx, "add", { kind: "spareOnly", device, error });
        return false;
      }
    }
    fail(ctx, "add", { kind: "add", device, error });
    return false;
  }
  recordChanged(array.devicefile);
  if (choices.purpose === "bigger") {
    recordGrown(array.uuid);
  }
  mark(ctx, "add", { status: "succeeded" });
  return true;
}

/** The disk is a member, doing what was asked (4.5 step 4). */
async function stepVerifyAdd(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null || run.choices.kind !== "add") {
    return false;
  }
  const { choices } = run;
  mark(ctx, "verifyAdd", { status: "running" });
  try {
    const rows = await ctx.raid.arrays();
    const now = findSame(rows, run.array ?? choices.array);
    if (now === undefined) {
      fail(ctx, "verifyAdd", { kind: "notReported" });
      return false;
    }
    const detail = await ctx.raid.detail(now.devicefile);
    const report = readReport(detail, now.devices);
    const disks = freshDisks(run);
    const roleOf = (disk: DiskDevice) => {
      const names = diskNames(disk);
      return report.known
        ? report.members.find((m) => names.has(m.device))?.role
        : undefined;
    };
    const ok = disks.every((disk) => {
      const role = roleOf(disk);
      switch (choices.purpose) {
        case "replace":
          return (
            role === "rebuilding" || role === "working" || role === "spare"
          );
        case "spare":
          return role === "spare";
        case "bigger":
          return (
            role !== undefined &&
            role !== "failed" &&
            (arrayState(now, report, detail).kind === "reshaping" ||
              now.numdevices >= choices.array.numdevices + disks.length)
          );
      }
    });
    if (!ok) {
      fail(ctx, "verifyAdd", { kind: "notReported" });
      return false;
    }
    update(ctx, () => ({ array: now }));
  } catch {
    fail(ctx, "verifyAdd", { kind: "notReported" });
    return false;
  }
  mark(ctx, "verifyAdd", { status: "succeeded" });
  return true;
}

/** Take the failed disk out (4.5 step 5): it holds no part of the working array. */
async function stepTakeOut(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (
    run === null ||
    run.choices.kind !== "add" ||
    run.choices.takeOut === null
  ) {
    return false;
  }
  const array = run.array ?? run.choices.array;
  mark(ctx, "takeOut", { status: "running" });
  try {
    await ctx.raid.remove(array.devicefile, run.choices.takeOut.device);
  } catch (error) {
    fail(ctx, "takeOut", { kind: "takeOut", error });
    return false;
  }
  mark(ctx, "takeOut", { status: "succeeded" });
  return true;
}

/** The checkpoint (D11): what is pending now (R10), then the apply as a task. */
async function stepSave(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "save", { status: "running" });
  try {
    const others = otherModules(
      await ctx.fs.pending(),
      expectedModules(run.choices),
    );
    if (others.length > 0 && !run.acceptOthers) {
      mark(ctx, "save", { status: "waiting" });
      update(ctx, () => ({ phase: { kind: "alsoPending", others } }));
      return false;
    }
  } catch {
    // Not knowing what else is pending is no reason to stop: the apply itself is the decision.
  }
  update(ctx, () => ({ phase: { kind: "running" } }));
  const task = startTask(
    ctx.labels.apply,
    ctx.fs.apply({ modules: [], force: false }),
  );
  mark(ctx, "save", { status: "running", taskId: task.id });
  const done = await task.settled;
  if (done.state !== "done") {
    fail(ctx, "save", { kind: "save", error: done.error });
    return false;
  }
  mark(ctx, "save", { status: "succeeded", taskId: task.id });
  if (run.choices.kind === "add") {
    update(ctx, () => ({ phase: { kind: "done" } }));
  }
  return true;
}

/** The result (3.4 last step): the array listed with a state; with a file system, it mounted (B8). */
async function stepVerify(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  const array = run?.array;
  if (run === null || array == null || run.choices.kind !== "create") {
    return false;
  }
  mark(ctx, "verify", { status: "running" });
  try {
    const rows = await ctx.raid.arrays();
    const now = findSame(rows, array);
    if (now === undefined || now.state === false) {
      fail(ctx, "verify", { kind: "notVerified" });
      return false;
    }
    update(ctx, () => ({ array: now }));
    if (run.choices.forFiles && run.found !== null) {
      const found = run.found;
      const configured = await ctx.fs.configured();
      const row = configured.find(
        (r) =>
          sameUuid(r.uuid, found.uuid) || r.devicefile === found.devicefile,
      );
      if (row?.status !== 1 || !row.mounted) {
        fail(ctx, "verify", { kind: "notVerified" });
        return false;
      }
      const entry = await ctx.fs.mountEntry(row.devicefile);
      if (entry === false) {
        fail(ctx, "verify", { kind: "notVerified" });
        return false;
      }
      update(ctx, () => ({ fsRow: row }));
    }
  } catch {
    fail(ctx, "verify", { kind: "notVerified" });
    return false;
  }
  mark(ctx, "verify", { status: "succeeded" });
  update(ctx, () => ({ phase: { kind: "done" } }));
  return true;
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
    case "fsCandidate":
      return stepFsCandidate(ctx);
    case "clear":
      // Reached only by "Try again" from a later step: the array was cleared already.
      return true;
    case "fsCreate":
      return stepFsCreate(ctx);
    case "fsFind":
      return stepFsFind(ctx);
    case "fsSetUp":
      return stepFsSetUp(ctx);
    case "add":
      return stepAdd(ctx);
    case "verifyAdd":
      return stepVerifyAdd(ctx);
    case "takeOut":
      return stepTakeOut(ctx);
    case "save":
      return stepSave(ctx);
    case "verify":
      return stepVerify(ctx);
  }
}

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

/** Release the array once the run has ended (done or stopped). */
function settle(ctx: Context) {
  const run = current(ctx);
  if (run !== null && !isActive(run)) {
    endChanging(run.changingKey);
  }
}

// ---- What the pages call -------------------------------------------------------------------------

const contexts = new Map<number, Context>();

export const isActive = (run: RaidRun): boolean =>
  run.phase.kind === "running" ||
  run.phase.kind === "failed" ||
  run.phase.kind === "alsoPending";

/** Start a run from the confirmed summary. Refused while another RAID run is under way. */
export function startRaidFlow(
  fs: FsApi,
  raid: RaidApi,
  labels: TaskLabels,
  choices: RaidFlowChoices,
): boolean {
  const existing = raidFlowStore.getState().run;
  if (existing !== null && isActive(existing)) {
    return false;
  }
  const changingKey =
    choices.kind === "add" ? choices.array.uuid : `create:${String(nextRunId)}`;
  if (!beginChanging(changingKey)) {
    return false;
  }
  const id = nextRunId++;
  const steps = raidSteps(choices);
  const ctx: Context = { id, fs, raid, labels };
  contexts.clear();
  contexts.set(id, ctx);
  raidFlowStore.set({
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
      createdDevice: null,
      array: choices.kind === "add" ? choices.array : null,
      found: null,
      fsRow: null,
      acceptOthers: false,
      changingKey,
    },
  });
  void runFrom(ctx, "check").finally(() => {
    update(ctx, () => ({ busy: null }));
    settle(ctx);
  });
  return true;
}

export type RaidFlowAction =
  "retry" | "lookAgain" | "applyToo" | "continue" | "stop";

/** The reader's decision after a failure or at the pause. Ignored while another is under way. */
export function raidFlowAction(action: RaidFlowAction): void {
  const run = raidFlowStore.getState().run;
  const ctx = run === null ? undefined : contexts.get(run.id);
  if (run === null || ctx === undefined || run.busy !== null) {
    return;
  }
  const phase = run.phase;
  const at = phase.kind === "failed" ? phase.at : "save";
  const go = (work: () => Promise<unknown>) => {
    update(ctx, () => ({ busy: action }));
    void work().finally(() => {
      update(ctx, () => ({ busy: null }));
      settle(ctx);
    });
  };
  switch (action) {
    case "retry":
    case "lookAgain":
      go(() => runFrom(ctx, at));
      return;
    case "applyToo":
      update(ctx, () => ({ acceptOthers: true }));
      go(() => runFrom(ctx, "save"));
      return;
    case "continue":
      // After a failed take-out (4.7): the failed disk can be taken out later on the array's page.
      go(() => runFrom(ctx, "save"));
      return;
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

/** The reader dismissed the result, or chose to go back to the form: the run is forgotten. */
export function clearRaidFlow(): void {
  const run = raidFlowStore.getState().run;
  if (run !== null) {
    contexts.delete(run.id);
    if (isActive(run)) {
      endChanging(run.changingKey);
    }
  }
  raidFlowStore.set({ run: null });
}

export const saveCreateDraft = (draft: CreateDraft): void =>
  raidFlowStore.set({ create: draft });

export const saveAddDraft = (draft: AddDraft): void =>
  raidFlowStore.set({ add: draft });
