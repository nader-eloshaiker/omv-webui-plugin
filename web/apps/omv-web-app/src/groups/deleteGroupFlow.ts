// SPDX-License-Identifier: GPL-3.0-or-later
// Deleting a group, once the reader has confirmed (phase 5 users design 11.3; 0.9, 0.10; P10). OMV's
// deleteGroup refuses a group that still has members, so the run is up to four steps:
//   1 "Take everyone out of {{group}}": setGroup with `members` [] (only with members; marks `samba`,
//     observed on the test VM);
//   2 "Delete the group": deleteGroup (marks nothing, observed);
//   3 "Take {{group}} off the access lists" (when ticked): per folder that lists it, its row re-read
//     and ShareMgmt.setPrivileges without the group's entry (stale entries dropped, as the folder's
//     page does; accessByAccount.foldersListing);
//   4 "Save the change": R10 re-reads what is pending; expected `samba` when step 1 ran, and the
//     folder modules when step 3 wrote; anything else is listed and asked about first; then
//     Config.applyChangesBg through the one task registry. With nothing of its own pending, nothing
//     is applied.
// When step 2 fails after step 1 emptied the group, "Put the members back" (setGroup with the list read
// at 11.2) is offered beside "Try again". A request that was cut leaves the outcome unknown: "Could not
// tell whether {{group}} was deleted." with "Check again", which re-reads the group and resumes at the
// first step whose effect is not seen. Never retried by itself (UI-14).
//
// The run lives here, in memory for the session and by the group's name, not in a page: leaving the
// page does not stop it, and coming back shows it. While it runs the group is marked as being changed
// by this session (usersSession), which every other action on it refuses.
import type {
  SharedFolder,
  SharedFolderPrivilegeEntry,
  SmbShareRow,
  UserAccount,
  UserGroup,
  UserMgmtSetGroupRequest,
} from "@omv-webui/react-api-omv/generated";
import type { TaskRegistry } from "@omv-webui/react-api-omv/tasks";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { otherModules } from "../filesystems/fsModel.ts";
import { isCut, startTask } from "../filesystems/fsTasks.ts";
import { folderChangeModules } from "../sharedFolders/shareActions.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import { foldersListing } from "../users/accessByAccount.ts";
import {
  accountId,
  beginAccountAction,
  endAccountAction,
  recordDeleted,
} from "../users/usersSession.ts";
import { readName } from "./nameFree.ts";

/** The module any change to a group leaves pending (observed on the test VM, 0.9). */
export const GROUP_CHANGE_MODULE = "samba";

export type GroupDeleteStep = "empty" | "delete" | "access" | "save";

export type GroupDeletePhase =
  | { kind: "running" }
  | { kind: "alsoPending"; others: string[] }
  /**
   * A step failed. `error` undefined: "Check again" found the step's effect not there. At "access",
   * `folders` names the folders that still list the group.
   */
  | {
      kind: "failed";
      at: GroupDeleteStep;
      error: unknown;
      folders?: string[];
    }
  | { kind: "unknown"; at: GroupDeleteStep }
  | { kind: "done" }
  /** "Stop here": the group is deleted; what is left stays pending in the band. */
  | { kind: "stopped" }
  /** "Put the members back" succeeded: the group stays, with its members. */
  | { kind: "putBack" };

export interface GroupDeleteInput {
  name: string;
  /** The group's description, as read just before (setGroup sends it back unchanged). */
  comment: string;
  /** The members read at 11.2: emptied at step 1, and put back on request. */
  members: readonly string[];
  /** The folders to take the group off (by `uuid`), or none when the reader cleared the box. */
  access: readonly string[];
}

export interface GroupDeleteRun {
  input: GroupDeleteInput;
  steps: Readonly<
    Partial<Record<GroupDeleteStep, { status: TaskStatus; taskId?: number }>>
  >;
  phase: GroupDeletePhase;
  busy: boolean;
  /** Step 1 emptied the group (so "Put the members back" means something). */
  emptied: boolean;
  /** Step 3 wrote at least one folder, and whether one of them has an SMB share. */
  wroteAccess: { any: boolean; smb: boolean };
}

/** The calls a run makes (useGroupsApi and useSharesApi, taken when it starts). */
export interface GroupDeleteApi {
  setGroup(request: UserMgmtSetGroupRequest): Promise<unknown>;
  deleteGroup(name: string): Promise<unknown>;
  group(name: string): Promise<UserGroup>;
  folders(): Promise<SharedFolder[]>;
  users(): Promise<UserAccount[]>;
  groups(): Promise<UserGroup[]>;
  shares(): Promise<SmbShareRow[]>;
  setPrivileges(
    uuid: string,
    privileges: SharedFolderPrivilegeEntry[],
  ): Promise<unknown>;
  pending(): Promise<string[]>;
  /** Config.applyChangesBg, as a task start. */
  apply(): () => Promise<string>;
}

export interface GroupDeleteOptions {
  /** The apply task's label in the tasks menu. */
  apply: string;
  registry?: TaskRegistry;
}

export const groupDeletes = createMemoryStore<{
  byName: Readonly<Record<string, GroupDeleteRun>>;
}>({ byName: {} });

export const groupDeleteOf = (name: string): GroupDeleteRun | undefined =>
  groupDeletes.getState().byName[name];

/** A run the reader has not seen to an end yet. */
export const isGroupDeleting = (run: GroupDeleteRun | undefined): boolean =>
  run !== undefined &&
  (run.busy ||
    run.phase.kind === "running" ||
    run.phase.kind === "alsoPending");

/** The steps this run has, in order. */
export const groupDeleteSteps = (
  input: Pick<GroupDeleteInput, "members" | "access">,
): GroupDeleteStep[] => [
  ...(input.members.length > 0 ? (["empty"] as const) : []),
  "delete",
  ...(input.access.length > 0 ? (["access"] as const) : []),
  "save",
];

/** R10's expected set: `samba` when step 1 ran, and the folder modules when step 3 wrote. */
export function groupDeleteModules(run: GroupDeleteRun): string[] {
  return [
    ...(run.emptied ? [GROUP_CHANGE_MODULE] : []),
    ...(run.wroteAccess.any ? folderChangeModules(run.wroteAccess.smb) : []),
  ].filter((m, i, all) => all.indexOf(m) === i);
}

function put(name: string, run: GroupDeleteRun | null) {
  groupDeletes.set((s) => {
    const { [name]: _gone, ...rest } = s.byName;
    return { byName: run === null ? rest : { ...rest, [name]: run } };
  });
}

function change(
  name: string,
  edit: (run: GroupDeleteRun) => Partial<GroupDeleteRun>,
) {
  const now = groupDeleteOf(name);
  if (now !== undefined) {
    put(name, { ...now, ...edit(now) });
  }
}

const step = (
  name: string,
  id: GroupDeleteStep,
  state: { status: TaskStatus; taskId?: number },
) => change(name, (r) => ({ steps: { ...r.steps, [id]: state } }));

const contexts = new Map<
  string,
  { api: GroupDeleteApi; options: GroupDeleteOptions }
>();

/** The reader dismissed the result, or closed a failure. */
export function dismissGroupDelete(name: string): void {
  contexts.delete(name);
  put(name, null);
}

/** Start a deletion; refused (false) while another action of this session runs on the group. */
export function startGroupDelete(
  api: GroupDeleteApi,
  input: GroupDeleteInput,
  options: GroupDeleteOptions,
): boolean {
  if (
    isGroupDeleting(groupDeleteOf(input.name)) ||
    !beginAccountAction(accountId("group", input.name), "delete")
  ) {
    return false;
  }
  recordDeleted("group", input.name, false);
  contexts.set(input.name, { api, options });
  put(input.name, {
    input,
    steps: Object.fromEntries(
      groupDeleteSteps(input).map((s) => [s, { status: "waiting" }]),
    ),
    phase: { kind: "running" },
    busy: true,
    emptied: false,
    wroteAccess: { any: false, smb: false },
  });
  void guarded(input.name, () => fromStep(input.name, first(input)));
  return true;
}

const first = (input: GroupDeleteInput): GroupDeleteStep =>
  input.members.length > 0 ? "empty" : "delete";

async function guarded(name: string, work: () => Promise<void>) {
  try {
    await work();
  } finally {
    change(name, () => ({ busy: false }));
    endAccountAction(accountId("group", name));
  }
}

async function fromStep(name: string, at: GroupDeleteStep): Promise<void> {
  change(name, () => ({ phase: { kind: "running" } }));
  if (at === "empty" && !(await empty(name))) {
    return;
  }
  if ((at === "empty" || at === "delete") && !(await remove(name))) {
    return;
  }
  const run = groupDeleteOf(name);
  if (run === undefined) {
    return;
  }
  if (at !== "save" && run.input.access.length > 0 && !(await access(name))) {
    return;
  }
  await save(name, false);
}

const fail = (
  name: string,
  at: GroupDeleteStep,
  error: unknown,
  folders?: string[],
) => {
  step(name, at, { status: "failed" });
  change(name, () => ({
    phase: isCut(error)
      ? { kind: "unknown", at }
      : {
          kind: "failed",
          at,
          error,
          ...(folders === undefined ? {} : { folders }),
        },
  }));
};

async function empty(name: string): Promise<boolean> {
  const ctx = contexts.get(name);
  const run = groupDeleteOf(name);
  if (ctx === undefined || run === undefined) {
    return false;
  }
  step(name, "empty", { status: "running" });
  try {
    await ctx.api.setGroup({ name, comment: run.input.comment, members: [] });
  } catch (error) {
    fail(name, "empty", error);
    return false;
  }
  step(name, "empty", { status: "succeeded" });
  change(name, () => ({ emptied: true }));
  return true;
}

async function remove(name: string): Promise<boolean> {
  const ctx = contexts.get(name);
  if (ctx === undefined) {
    return false;
  }
  step(name, "delete", { status: "running" });
  try {
    await ctx.api.deleteGroup(name);
  } catch (error) {
    fail(name, "delete", error);
    return false;
  }
  deleted(name);
  return true;
}

function deleted(name: string) {
  step(name, "delete", { status: "succeeded" });
  recordDeleted("group", name, true);
}

async function access(name: string): Promise<boolean> {
  const ctx = contexts.get(name);
  const run = groupDeleteOf(name);
  if (ctx === undefined || run === undefined) {
    return false;
  }
  step(name, "access", { status: "running" });
  let listing;
  try {
    const [folders, users, groups, shares] = await Promise.all([
      ctx.api.folders(),
      ctx.api.users(),
      ctx.api.groups(),
      ctx.api.shares().catch(() => [] as SmbShareRow[]),
    ]);
    listing = foldersListing("group", name, folders, users, groups, shares);
  } catch (error) {
    fail(name, "access", error, []);
    return false;
  }
  const chosen = new Set(run.input.access);
  const todo = listing.filter((l) => chosen.has(l.folder.uuid));
  const left: string[] = [];
  let failure: unknown = null;
  for (const item of todo) {
    if (failure !== null) {
      left.push(item.folder.name);
      continue;
    }
    try {
      await ctx.api.setPrivileges(item.folder.uuid, item.without);
      change(name, (r) => ({
        wroteAccess: {
          any: true,
          smb: r.wroteAccess.smb || item.share !== undefined,
        },
      }));
    } catch (error) {
      failure = error;
      left.push(item.folder.name);
    }
  }
  if (failure !== null) {
    fail(name, "access", failure, left);
    return false;
  }
  step(name, "access", { status: "succeeded" });
  return true;
}

async function save(name: string, acceptOthers: boolean): Promise<void> {
  const ctx = contexts.get(name);
  const run = groupDeleteOf(name);
  if (ctx === undefined || run === undefined) {
    return;
  }
  change(name, () => ({ phase: { kind: "running" } }));
  step(name, "save", { status: "running" });
  const expected = groupDeleteModules(run);
  let pending: string[] | null = null;
  try {
    pending = await ctx.api.pending();
  } catch {
    // Not knowing what is pending is no reason to stop: the apply lists what it applies.
  }
  if (pending !== null) {
    if (!pending.some((m) => expected.includes(m))) {
      // Nothing of this run's is pending: nothing to apply, and nobody else's change is applied.
      step(name, "save", { status: "succeeded" });
      change(name, () => ({ phase: { kind: "done" } }));
      return;
    }
    const others = otherModules(pending, expected);
    if (others.length > 0 && !acceptOthers) {
      step(name, "save", { status: "waiting" });
      change(name, () => ({ phase: { kind: "alsoPending", others } }));
      return;
    }
  }
  const task = startTask(
    ctx.options.apply,
    ctx.api.apply(),
    ctx.options.registry,
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

/** "Check again" after a cut request: the group's state says how far the run got. */
async function checkAgain(name: string, at: GroupDeleteStep): Promise<void> {
  const ctx = contexts.get(name);
  const run = groupDeleteOf(name);
  if (ctx === undefined || run === undefined) {
    return;
  }
  if (at === "access") {
    await fromStep(name, "access");
    return;
  }
  if (at === "save") {
    await save(name, false);
    return;
  }
  const read = await readName("group", name, ctx.api.group);
  if (read.kind === "unknown") {
    // Still not known: the reader may check again.
    return;
  }
  if (read.kind === "free") {
    if (run.input.members.length > 0) {
      step(name, "empty", { status: "succeeded" });
      change(name, () => ({ emptied: true }));
    }
    deleted(name);
    if (run.input.access.length > 0) {
      if (!(await access(name))) {
        return;
      }
    }
    await save(name, false);
    return;
  }
  if (at === "empty") {
    if ((read.value.members ?? []).length === 0) {
      step(name, "empty", { status: "succeeded" });
      change(name, () => ({ emptied: true }));
      await fromStep(name, "delete");
      return;
    }
    step(name, "empty", { status: "failed" });
    change(name, () => ({
      phase: { kind: "failed", at: "empty", error: undefined },
    }));
    return;
  }
  // At "delete", the group is still there: not deleted.
  step(name, "delete", { status: "failed" });
  change(name, () => ({
    phase: { kind: "failed", at: "delete", error: undefined },
  }));
}

async function putBack(name: string): Promise<void> {
  const ctx = contexts.get(name);
  const run = groupDeleteOf(name);
  if (ctx === undefined || run === undefined) {
    return;
  }
  try {
    await ctx.api.setGroup({
      name,
      comment: run.input.comment,
      members: [...run.input.members],
    });
  } catch (error) {
    change(name, () => ({
      phase: { kind: "failed", at: "delete", error },
    }));
    return;
  }
  change(name, () => ({ phase: { kind: "putBack" } }));
}

export type GroupDeleteDecision =
  | "retryDelete"
  | "putBack"
  | "retryAccess"
  | "applyToo"
  | "retrySave"
  | "checkAgain"
  | "stop";

/** The reader's decision during the steps; ignored while a step runs. */
export function groupDeleteDecision(
  name: string,
  decision: GroupDeleteDecision,
): void {
  const run = groupDeleteOf(name);
  if (run === undefined || run.busy) {
    return;
  }
  if (decision === "stop") {
    change(name, () => ({ phase: { kind: "stopped" } }));
    return;
  }
  if (!beginAccountAction(accountId("group", name), "delete")) {
    return;
  }
  change(name, () => ({ busy: true }));
  const phase = run.phase;
  const work = (): Promise<void> => {
    switch (decision) {
      case "retryDelete":
        return fromStep(name, "delete");
      case "putBack":
        return putBack(name);
      case "retryAccess":
        return fromStep(name, "access");
      case "applyToo":
        return save(name, true);
      case "retrySave":
        return save(name, false);
      case "checkAgain":
        return phase.kind === "unknown"
          ? checkAgain(name, phase.at)
          : Promise.resolve();
    }
  };
  void guarded(name, work);
}
