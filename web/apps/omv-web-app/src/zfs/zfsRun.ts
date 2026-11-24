// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS flows' runs (phase 5 ZFS design 3.4 to 3.7, 4.2, 7.2; UX audit R3 to R10): creating a pool,
// by default going on into a first file system; adding a file system to a pool; and replacing a disk.
// A run starts only from the reader's confirmation (R9: never on page load) and runs its steps in
// order: check everything again (disks by serial number and model, the pool by its name and disks, the
// name still free), erase the disks that hold something, the change, the checkpoint that saves the
// changes (R10, then the apply as a task), and the check of the result. A failed step stops the run and
// waits for the reader: nothing retries by itself (UI-14).
//
// What the test VM showed (design section 20):
// - Zfs.addObject with a name that is taken answers as if it had made it and changes nothing, so the
//   name is checked again just before, and afterwards the file system must be in the list;
// - a refused Zfs.addPool can still write a partition table to its disks, so after any create failure
//   the run says the disks may have been changed and sends the reader back to choose again, which
//   reads the disks again (they then show under "Erase and reuse");
// - Zfs.deviceReplace makes the old and the new disk one place ("replacing-1") until the rebuild ends.
//
// The run lives here, in memory for the session, not in a page: leaving the page does not stop it, and
// coming back shows the step list again. One ZFS run at a time; every write checks that its run is
// still the current one, so a dismissed run or an ended session is never brought back by a late reply.
import type {
  ConfiguredFilesystem,
  DiskDevice,
  ZfsObject,
} from "@omv-webui/react-api-omv/generated";
import { taskRegistry } from "@omv-webui/react-api-omv/tasks";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { diskSession } from "../disks/diskSession.ts";
import type { SessionMarks } from "../disks/diskUse.ts";
import { startWipe } from "../disks/wipeTask.ts";
import { otherModules } from "../filesystems/fsModel.ts";
import { startTask } from "../filesystems/fsTasks.ts";
import type { FsApi } from "../hooks/useFsApi.ts";
import type { ZfsApi } from "../hooks/useZfsApi.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import {
  candidateOf,
  zfsChoices,
  type ZfsDiskChoice,
  type ZfsUnusable,
} from "./zfsChoices.ts";
import {
  addFsBlocker,
  findFs,
  findPool,
  fsNameProblem,
  layoutOfCreate,
  matchDisks,
  parsePoolReport,
  poolNameProblem,
  poolRoot,
  pools,
  poolState,
  quotaValue,
  replaceDecision,
  sameDiskName,
  type CreateLayout,
  type PoolDisk,
} from "./zfsModel.ts";
import {
  beginChanging,
  endChanging,
  recordCreatedPool,
  recordTouched,
  ZFS_MODULES,
} from "./zfsSession.ts";

/** What adding or removing a file system marks pending (kept in zfsSession.ts, which its marks follow). */
export { ZFS_MODULES };
/** Whether something ZFS marks pending is still pending (0.9). */
export const zfsPending = (pending: readonly string[]): boolean =>
  pending.some((m) => (ZFS_MODULES as readonly string[]).includes(m));

/** What a size limit or compression marks pending (observed). */
export const ZFS_SETTING_MODULES = ["collectd", "monit", "quota"] as const;

export interface CreateChoices {
  kind: "create";
  targets: ZfsDiskChoice[];
  layout: CreateLayout;
  name: string;
  /** The first file system's name, or null without one (P6). */
  fs: string | null;
  /** About how much space for files, for the words (0.5). */
  usable: number;
}

export interface AddFsChoices {
  kind: "addFs";
  pool: string;
  name: string;
  /** "500G", "2T", or null for no limit. */
  limit: { amount: string; unit: "G" | "T" } | null;
}

export interface ReplaceChoices {
  kind: "replace";
  pool: string;
  /** The disk to replace as the summary showed it. */
  old: PoolDisk;
  /** Its OMV disk, for the words, when it is among the NAS's disks. */
  oldDisk: DiskDevice | null;
  target: ZfsDiskChoice;
  minSize: number | null;
}

export type ZfsFlowChoices = CreateChoices | AddFsChoices | ReplaceChoices;

export type StepKind =
  | "check"
  | "erase"
  | "create"
  | "find"
  | "fs"
  | "limit"
  | "replace"
  | "save"
  | "verify";

export interface PlanStep {
  id: string;
  kind: StepKind;
  device?: string;
}

export const targetDevice = (t: ZfsDiskChoice): string =>
  t.disk.canonicaldevicefile;

export function zfsSteps(choices: ZfsFlowChoices): PlanStep[] {
  const targets =
    choices.kind === "create"
      ? choices.targets
      : choices.kind === "replace"
        ? [choices.target]
        : [];
  const erase = targets
    .filter((t) => t.group === "reuse")
    .map((t): PlanStep => ({
      id: `erase:${targetDevice(t)}`,
      kind: "erase",
      device: targetDevice(t),
    }));
  switch (choices.kind) {
    case "create":
      return [
        { id: "check", kind: "check" },
        ...erase,
        { id: "create", kind: "create" },
        { id: "find", kind: "find" },
        ...(choices.fs === null ? [] : [{ id: "fs", kind: "fs" } as PlanStep]),
        { id: "save", kind: "save" },
        { id: "verify", kind: "verify" },
      ];
    case "addFs":
      return [
        { id: "check", kind: "check" },
        { id: "fs", kind: "fs" },
        ...(choices.limit === null
          ? []
          : [{ id: "limit", kind: "limit" } as PlanStep]),
        { id: "save", kind: "save" },
        { id: "verify", kind: "verify" },
      ];
    case "replace":
      return [
        { id: "check", kind: "check" },
        ...erase,
        { id: "replace", kind: "replace" },
        { id: "verify", kind: "verify" },
      ];
  }
}

export interface StepState {
  status: TaskStatus;
  taskId?: number;
}

export type Failure =
  | { kind: "blocked"; device: string; reason: ZfsUnusable | null }
  | { kind: "changed"; device: string }
  | { kind: "nameTaken" }
  | { kind: "fsTaken" }
  | { kind: "poolChanged" }
  | { kind: "poolRefused" }
  | { kind: "checkRead"; error: unknown }
  | { kind: "erase"; device: string; error: unknown; erased: string[] }
  | { kind: "notCandidate"; device: string; erased: string[] }
  | { kind: "create"; error: unknown }
  | { kind: "notFound" }
  | { kind: "fs"; error: unknown }
  | { kind: "fsNotListed" }
  | { kind: "limit"; error: unknown }
  | { kind: "replace"; error: unknown }
  | { kind: "notSeen" }
  | { kind: "save"; error: unknown }
  | { kind: "notMounted"; name: string };

export type ZfsPhase =
  | { kind: "running" }
  | { kind: "failed"; at: string; failure: Failure }
  | { kind: "alsoPending"; others: string[] }
  | { kind: "done" }
  | { kind: "stopped"; at: string; failure?: Failure };

export interface TaskLabels {
  erase: (device: string) => string;
  apply: string;
}

export interface ZfsRun {
  id: number;
  choices: ZfsFlowChoices;
  steps: PlanStep[];
  state: Readonly<Record<string, StepState>>;
  phase: ZfsPhase;
  busy: string | null;
  /** Step 1's fresh disk rows, by the target's device. */
  fresh: Readonly<Record<string, DiskDevice>>;
  /** The by-id name each target is sent by, once known (after an erase, the plugin's). */
  sendAs: Readonly<Record<string, string>>;
  erased: readonly string[];
  created: boolean;
  /** The file system was made by this run (a retry then only looks for it). */
  fsMade: boolean;
  /** The pool's own folder and the new file system as last read. */
  root: ZfsObject | null;
  fsRow: ZfsObject | null;
  /** The new file system's OMV row, once it is mounted, for the sharing handover. */
  omvRow: ConfiguredFilesystem | null;
  acceptOthers: boolean;
  /** Skip the limit after "Go on without a limit". */
  skipLimit: boolean;
  changingKey: string;
}

export interface CreateDraft {
  chosen: readonly string[];
  /** null: no layout chosen ("No protection" is never preselected, not after "Change choices"). */
  layout: CreateLayout | null;
  name: string;
  withFs: boolean;
  fsName: string;
}

export interface ZfsFlowStore {
  run: ZfsRun | null;
  create: CreateDraft | null;
}

export const zfsFlowStore = createMemoryStore<ZfsFlowStore>({
  run: null,
  create: null,
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

/** The replace's last step: how many reads of the pool, and how far apart. */
export const REPLACE_VERIFY_TRIES = 5;
export const REPLACE_VERIFY_GAP_MS = 2000;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

interface Context {
  id: number;
  fs: FsApi;
  zfs: ZfsApi;
  labels: TaskLabels;
}

const current = (ctx: Context): ZfsRun | null => {
  const run = zfsFlowStore.getState().run;
  return run !== null && run.id === ctx.id ? run : null;
};

function update(ctx: Context, change: (run: ZfsRun) => Partial<ZfsRun>) {
  const run = current(ctx);
  if (run !== null) {
    zfsFlowStore.set({ run: { ...run, ...change(run) } });
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

/** The pool's name each run is about. */
export const poolOfRun = (choices: ZfsFlowChoices): string =>
  choices.kind === "create" ? choices.name : choices.pool;

const targetsOf = (choices: ZfsFlowChoices): ZfsDiskChoice[] =>
  choices.kind === "create"
    ? choices.targets
    : choices.kind === "replace"
      ? [choices.target]
      : [];

/** The full name of the file system the run makes. */
export const fsPathOf = (choices: ZfsFlowChoices): string | null =>
  choices.kind === "create"
    ? choices.fs === null
      ? null
      : `${choices.name}/${choices.fs}`
    : choices.kind === "addFs"
      ? `${choices.pool}/${choices.name}`
      : null;

// ---- The steps -----------------------------------------------------------------------------------

/** The pool and its disks, fresh, read into the state and the disks' roles. */
async function readPool(ctx: Context, pool: string) {
  const [rows, report, devices] = await Promise.all([
    ctx.zfs.list(),
    ctx.zfs.report(pool),
    ctx.zfs.devices(pool),
  ]);
  const row = findPool(rows, pool);
  const parsed = parsePoolReport(report);
  return {
    rows,
    row,
    report: parsed,
    devices,
    state: row === undefined ? null : poolState(row, parsed),
    disks: matchDisks(parsed, devices),
  };
}

/** Step 1: every disk still offered in the same group, the same disk; the name and the pool still fit. */
async function stepCheck(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "check", { status: "running" });
  const { choices } = run;

  if (choices.kind === "addFs") {
    try {
      const { rows, row, state } = await readPool(ctx, choices.pool);
      const blocker =
        row === undefined || state === null
          ? { kind: "unknown" }
          : addFsBlocker(state, row.capacity, false);
      if (blocker !== null) {
        fail(ctx, "check", { kind: "poolRefused" });
        return false;
      }
      if (fsNameProblem(choices.name, rows, choices.pool) !== null) {
        fail(ctx, "check", { kind: "fsTaken" });
        return false;
      }
    } catch (error) {
      fail(ctx, "check", { kind: "checkRead", error });
      return false;
    }
    mark(ctx, "check", { status: "succeeded" });
    return true;
  }

  let reads;
  try {
    reads = await Promise.all([
      ctx.zfs.candidates(),
      ctx.fs.disks(),
      ctx.fs.configured(),
      ctx.fs.detected(),
      ctx.fs.arrays(),
      ctx.fs.zfsDisks(),
      ctx.zfs.list(),
    ]);
  } catch (error) {
    fail(ctx, "check", { kind: "checkRead", error });
    return false;
  }
  const [candidates, disks, configured, detected, arrays, zfs, rows] = reads;

  if (choices.kind === "create") {
    const taken = pools(rows).map((r) => r.path);
    if (poolNameProblem(choices.name, taken) !== null) {
      fail(ctx, "check", { kind: "nameTaken" });
      return false;
    }
  } else {
    try {
      const now = await readPool(ctx, choices.pool);
      const same =
        now.row !== undefined &&
        now.state !== null &&
        now.disks.known &&
        now.disks.disks.find(
          (d) =>
            d.path === choices.old.path &&
            d.group.vdev === choices.old.group.vdev,
        );
      if (
        same === undefined ||
        same === false ||
        now.state === null ||
        !replaceDecision(same, now.state, now.disks, false).allowed
      ) {
        fail(ctx, "check", { kind: "poolChanged" });
        return false;
      }
    } catch (error) {
      fail(ctx, "check", { kind: "checkRead", error });
      return false;
    }
  }

  const placed = zfsChoices(
    { candidates, disks, configured, detected, arrays, zfs },
    marksFor,
    undefined,
    choices.kind === "replace" ? choices.minSize : null,
  );
  if (placed.state !== "known") {
    fail(ctx, "check", { kind: "checkRead", error: undefined });
    return false;
  }
  const fresh: Record<string, DiskDevice> = {};
  const sendAs: Record<string, string> = {};
  for (const target of targetsOf(choices)) {
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
    if (offered?.group !== target.group || offered.byId !== target.byId) {
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
    sendAs[device] = offered.byId;
  }
  update(ctx, () => ({ fresh, sendAs }));
  mark(ctx, "check", { status: "succeeded" });
  return true;
}

/** Erase a disk that holds something, then the plugin must offer it: its name is then the plugin's. */
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
  let offered: string | undefined;
  try {
    offered = candidateOf(await ctx.zfs.candidates(), disk)?.devicefile;
  } catch {
    offered = undefined;
  }
  if (offered === undefined) {
    fail(ctx, step.id, {
      kind: "notCandidate",
      device,
      erased: [...(current(ctx)?.erased ?? [])],
    });
    return false;
  }
  update(ctx, (r) => ({ sendAs: { ...r.sendAs, [device]: offered } }));
  mark(ctx, step.id, {
    ...(current(ctx)?.state[step.id] ?? {}),
    status: "succeeded",
  });
  return true;
}

/** Create: Zfs.addPool with the fixed settings (D11 to D13). Synchronous. */
async function stepCreate(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null || run.choices.kind !== "create") {
    return false;
  }
  if (run.created) {
    mark(ctx, "create", { status: "succeeded" });
    return true;
  }
  const { choices } = run;
  mark(ctx, "create", { status: "running" });
  const devices = choices.targets.map(
    (t) => run.sendAs[targetDevice(t)] ?? t.byId,
  );
  try {
    await ctx.zfs.addPool({
      pooltype: choices.layout,
      force: false,
      mountpoint: "",
      name: choices.name,
      devices,
      devalias: "id",
      ashift: true,
      ashiftval: 12,
      casesensitivity: "sensitive",
      compress: true,
      compresstype: "lz4",
    });
  } catch (error) {
    // A refused create may still have written a partition table to the disks (observed).
    fail(ctx, "create", { kind: "create", error });
    return false;
  }
  update(ctx, () => ({ created: true }));
  recordTouched(choices.name);
  mark(ctx, "create", { status: "succeeded" });
  return true;
}

/** Find the new pool: the name, with exactly the chosen disks, in the chosen layout. */
async function stepFind(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null || run.choices.kind !== "create") {
    return false;
  }
  const { choices } = run;
  mark(ctx, "find", { status: "running" });
  try {
    const now = await readPool(ctx, choices.name);
    const sent = choices.targets.map(
      (t) => run.sendAs[targetDevice(t)] ?? t.byId,
    );
    const layout = layoutOfCreate(choices.layout, choices.targets.length);
    const groups = now.report.known
      ? now.report.groups.filter((g) => g.class === "data")
      : [];
    const sameDisks =
      now.devices.length === sent.length &&
      sent.every((s) => now.devices.some((d) => sameDiskName(s, d.devicefile)));
    if (
      now.row === undefined ||
      !sameDisks ||
      groups.length !== 1 ||
      groups[0]?.layout !== layout
    ) {
      fail(ctx, "find", { kind: "notFound" });
      return false;
    }
    update(ctx, () => ({ root: poolRoot(now.rows, choices.name) ?? null }));
  } catch {
    fail(ctx, "find", { kind: "notFound" });
    return false;
  }
  recordCreatedPool({ pool: choices.name, withFs: choices.fs !== null });
  mark(ctx, "find", { status: "succeeded" });
  return true;
}

/** Make the file system, then it must be listed: a name taken is answered as made (observed). */
async function stepFs(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  const path = run === null ? null : fsPathOf(run.choices);
  if (run === null || path === null) {
    return false;
  }
  const pool = poolOfRun(run.choices);
  const name = path.slice(pool.length + 1);
  mark(ctx, "fs", { status: "running" });
  let before: ZfsObject[];
  try {
    before = await ctx.zfs.list();
  } catch (error) {
    fail(ctx, "fs", { kind: "fs", error });
    return false;
  }
  if (findFs(before, path) === undefined) {
    if (fsNameProblem(name, before, pool) !== null) {
      fail(ctx, "fs", { kind: "fsTaken" });
      return false;
    }
    try {
      await ctx.zfs.addFs(pool, name);
    } catch (error) {
      fail(ctx, "fs", { kind: "fs", error });
      return false;
    }
    recordTouched(pool);
    update(ctx, () => ({ fsMade: true }));
  } else if (!run.fsMade) {
    // Listed before this step made it: another file system of that name, not this run's.
    fail(ctx, "fs", { kind: "fsTaken" });
    return false;
  }
  try {
    const after = await ctx.zfs.list();
    const row = findFs(after, path);
    if (row === undefined) {
      fail(ctx, "fs", { kind: "fsNotListed" });
      return false;
    }
    update(ctx, () => ({ fsRow: row }));
  } catch {
    fail(ctx, "fs", { kind: "fsNotListed" });
    return false;
  }
  mark(ctx, "fs", { status: "succeeded" });
  return true;
}

/** Set the size limit (4.2 step 3). */
async function stepLimit(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null || run.choices.kind !== "addFs") {
    return false;
  }
  if (run.skipLimit) {
    mark(ctx, "limit", { status: "cancelled" });
    return true;
  }
  const value = quotaValue(run.choices.limit);
  if (value === null) {
    return false;
  }
  mark(ctx, "limit", { status: "running" });
  try {
    await ctx.zfs.setProperties({
      type: "Filesystem",
      name: `${run.choices.pool}/${run.choices.name}`,
      properties: [{ property: "quota", value, modified: true }],
    });
  } catch (error) {
    fail(ctx, "limit", { kind: "limit", error });
    return false;
  }
  mark(ctx, "limit", { status: "succeeded" });
  return true;
}

/** Replace: Zfs.deviceReplace with the old disk's path from getPoolDevices and the new by-id name. */
async function stepReplace(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null || run.choices.kind !== "replace") {
    return false;
  }
  const { choices } = run;
  mark(ctx, "replace", { status: "running" });
  try {
    await ctx.zfs.replace(
      choices.pool,
      choices.old.path,
      run.sendAs[targetDevice(choices.target)] ?? choices.target.byId,
    );
  } catch (error) {
    fail(ctx, "replace", { kind: "replace", error });
    return false;
  }
  mark(ctx, "replace", { status: "succeeded" });
  return true;
}

/** The checkpoint: what is pending now (R10), then the apply as a task. */
async function stepSave(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "save", { status: "running" });
  try {
    const others = otherModules(await ctx.fs.pending(), ZFS_MODULES);
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
  return true;
}

/** The result: mounted where it says (B8); for a replace, the new disk in the old one's place. */
async function stepVerify(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const { choices } = run;
  mark(ctx, "verify", { status: "running" });
  try {
    if (choices.kind === "replace") {
      const sent =
        run.sendAs[targetDevice(choices.target)] ?? choices.target.byId;
      // The pool's status can lag the replace by a moment (observed on the test VM): read it a few
      // times before saying the new disk is not there.
      let there = false;
      for (let attempt = 0; attempt < REPLACE_VERIFY_TRIES; attempt += 1) {
        if (attempt > 0) {
          await wait(REPLACE_VERIFY_GAP_MS);
        }
        const now = await readPool(ctx, choices.pool);
        there =
          now.disks.known &&
          now.disks.disks.some((d) => sameDiskName(sent, d.path));
        if (there) {
          break;
        }
      }
      if (!there) {
        fail(ctx, "verify", { kind: "notSeen" });
        return false;
      }
    } else {
      const pool = poolOfRun(choices);
      const path = fsPathOf(choices);
      const rows = await ctx.zfs.list();
      const root = poolRoot(rows, pool);
      const fs = path === null ? null : (findFs(rows, path) ?? null);
      const configured = await ctx.fs.configured();
      const omv = (name: string) =>
        configured.find((c) => c.type === "zfs" && c.devicefile === name);
      const mountedHere = (name: string, row: ZfsObject | undefined | null) => {
        const entry = omv(name);
        return (
          row?.mounted === true && entry?.status === 1 && entry.mounted === true
        );
      };
      if (choices.kind === "create" && !mountedHere(pool, root)) {
        fail(ctx, "verify", { kind: "notMounted", name: pool });
        return false;
      }
      if (path !== null && !mountedHere(path, fs)) {
        fail(ctx, "verify", { kind: "notMounted", name: path });
        return false;
      }
      update(ctx, () => ({
        root: root ?? null,
        fsRow: fs,
        omvRow: omv(path ?? pool) ?? null,
      }));
    }
  } catch {
    fail(ctx, "verify", {
      kind: choices.kind === "replace" ? "notSeen" : "notMounted",
      name: fsPathOf(choices) ?? poolOfRun(choices),
    });
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
    case "fs":
      return stepFs(ctx);
    case "limit":
      return stepLimit(ctx);
    case "replace":
      return stepReplace(ctx);
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

function settle(ctx: Context) {
  const run = current(ctx);
  if (run !== null && !isActive(run)) {
    endChanging(run.changingKey);
  }
}

// ---- What the pages call -------------------------------------------------------------------------

const contexts = new Map<number, Context>();

export const isActive = (run: ZfsRun): boolean =>
  run.phase.kind === "running" ||
  run.phase.kind === "failed" ||
  run.phase.kind === "alsoPending";

/** Start a run from the confirmed summary. Refused while another ZFS run is under way. */
export function startZfsFlow(
  fs: FsApi,
  zfs: ZfsApi,
  labels: TaskLabels,
  choices: ZfsFlowChoices,
): boolean {
  const existing = zfsFlowStore.getState().run;
  if (existing !== null && isActive(existing)) {
    return false;
  }
  const changingKey = poolOfRun(choices);
  if (!beginChanging(changingKey)) {
    return false;
  }
  const id = nextRunId++;
  const steps = zfsSteps(choices);
  const ctx: Context = { id, fs, zfs, labels };
  contexts.clear();
  contexts.set(id, ctx);
  zfsFlowStore.set({
    run: {
      id,
      choices,
      steps,
      state: Object.fromEntries(
        steps.map((s) => [s.id, { status: "waiting" as const }]),
      ),
      phase: { kind: "running" },
      busy: "start",
      fresh: {},
      sendAs: {},
      erased: [],
      created: false,
      fsMade: false,
      root: null,
      fsRow: null,
      omvRow: null,
      acceptOthers: false,
      skipLimit: false,
      changingKey,
    },
  });
  void runFrom(ctx, "check").finally(() => {
    update(ctx, () => ({ busy: null }));
    settle(ctx);
  });
  return true;
}

export type ZfsFlowAction =
  | "retry"
  | "lookAgain"
  | "applyToo"
  | "goOnWithoutLimit"
  | "goOnWithoutFs"
  | "stop";

/** The reader's decision after a failure or at the pause. Ignored while another is under way. */
export function zfsFlowAction(action: ZfsFlowAction): void {
  const run = zfsFlowStore.getState().run;
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
    case "goOnWithoutLimit":
      update(ctx, () => ({ skipLimit: true }));
      go(() => runFrom(ctx, "limit"));
      return;
    case "goOnWithoutFs":
      // 3.7: "Stop here" after a failed file system goes on to the checkpoint for the pool alone.
      update(ctx, (r) => ({
        steps: r.steps.filter((s) => s.kind !== "fs"),
        choices:
          r.choices.kind === "create" ? { ...r.choices, fs: null } : r.choices,
      }));
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
export function clearZfsFlow(): void {
  const run = zfsFlowStore.getState().run;
  if (run !== null) {
    contexts.delete(run.id);
    if (isActive(run)) {
      endChanging(run.changingKey);
    }
  }
  zfsFlowStore.set({ run: null });
}

export const saveCreateDraft = (draft: CreateDraft): void =>
  zfsFlowStore.set({ create: draft });
