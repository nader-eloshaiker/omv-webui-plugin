// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a group": the run (phase 5 users design 10, 6.4 to 6.6; UX audit R3 to R10). A run starts only
// from the reader's confirmation of the summary (R9: never on page load) and runs its steps in order:
// check the choices again, add the group (with its members, at once), give access to the chosen
// shared folders, the checkpoint that applies those changes (R10), and the check that it is ready.
//
// What the test VM showed (OMV 8.6.1; the design's "Changes made during the build"):
// - getGroup and getUser refuse a missing name with exactly "The group '…' does not exist." / "The
//   user '…' does not exist."; only that refusal says the name is free (nameFree.ts). setGroup makes
//   the group when no group has that name and rewrites the one that has it otherwise, so the run never
//   writes before both reads said "free";
// - a new group marks nothing pending, so the checkpoint ("Save and finish") runs only when access
//   was given: it then expects `sharedfolders` and `systemd`, plus `samba` and `avahi` when a folder
//   given access is shared over SMB; anything else pending is listed before it is applied;
// - `members` replaces the group's list; `[]` empties it, and deleteGroup refuses a group with members.
//
// A failed step stops the run and waits for the reader: nothing retries by itself (UI-14). Undo is
// never offered once the group exists (V4: the band's Undo would drop OMV's record and leave the
// group); the way back is "Delete {{group}} again". The run lives here, in memory for the session (the
// store is emptied when the session ends, app.ts), not in a page: leaving the page does not stop it.
// One add-group run at a time; every write checks that its run is still the current one.
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
import { entriesOf, type Access } from "../sharedFolders/accessModel.ts";
import { addFlowModules } from "../sharedFolders/shareActions.ts";
import { shareOf } from "../sharedFolders/smbModel.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import { accessByAccount, listToSave } from "../users/accessByAccount.ts";
import { newNameProblem, type NewNameProblem } from "../users/nameRules.ts";
import { readName } from "./nameFree.ts";

/** What the reader chose, fixed at the summary (10). */
export interface AddGroupChoices {
  name: string;
  comment: string;
  /** The people ticked, by name, in natural order. */
  members: string[];
  /** The access given, by folder UUID: Read and write or Read only (a new group stores nothing else). */
  access: Readonly<Record<string, "rw" | "ro">>;
}

export type AddGroupStep = "check" | "add" | "access" | "apply" | "verify";

/** The steps of 10 that apply: access and its checkpoint only when access was chosen. */
export function addGroupSteps(
  choices: Pick<AddGroupChoices, "access">,
): AddGroupStep[] {
  const withAccess = Object.keys(choices.access).length > 0;
  return [
    "check",
    "add",
    ...(withAccess ? (["access", "apply"] as const) : []),
    "verify",
  ];
}

export interface StepState {
  status: TaskStatus;
  /** The apply's task, in the registry (the handle stays in the task helper, UI-5). */
  taskId?: number;
}

/** Why the run stopped at a step (6.6, adapted for a group in 10). */
export type AddGroupFailure =
  /** Step 1: "There is now a group called {{name}}." */
  | { kind: "takenGroup" }
  /** Step 1: "There is now an account called {{name}}." */
  | { kind: "takenAccount" }
  /** Step 1: the name breaks 0.6's rules (it cannot, from the form; kept for safety). */
  | { kind: "name"; problem: NewNameProblem }
  /** Step 1: other changes became pending (R1). */
  | { kind: "pending"; modules: string[] }
  /** Step 1: a chosen person is no longer listed. */
  | { kind: "personGone"; person: string }
  /** Step 1: a read failed, or a name read answered something other than "does not exist". */
  | { kind: "checkRead"; error: unknown }
  /** Step 2: OMV refused, and getGroup then finds no such group. */
  | { kind: "notAdded"; error: unknown }
  /** Step 2: the group was made, but the request failed after (its members). */
  | { kind: "partlyAdded"; error: unknown }
  /** Step 3: some folders saved, these not. */
  | { kind: "access"; failed: string[]; error: unknown }
  /** Step 4: the apply failed (R7). */
  | { kind: "apply"; error: unknown }
  /** Step 5: applied, but not as chosen. */
  | {
      kind: "notAsChosen";
      what: { kind: "members" } | { kind: "access"; folder: string };
    }
  /** A write's request was cut: whether it took effect is not known. */
  | { kind: "unknown"; step: AddGroupStep }
  /** "Delete {{group}} again" was refused. */
  | { kind: "deleteFailed"; error: unknown };

export type AddGroupPhase =
  | { kind: "running" }
  | { kind: "failed"; at: AddGroupStep; failure: AddGroupFailure }
  /** R10: modules outside the expected set are pending at the checkpoint. */
  | { kind: "alsoPending"; others: string[] }
  /** Ready: the folders it can open, by name, in natural order. */
  | { kind: "done"; folders: string[] }
  | { kind: "stopped"; at: AddGroupStep; failure?: AddGroupFailure }
  /** "Delete {{group}} again" emptied and deleted the group. */
  | { kind: "removed" };

export interface AddGroupRun {
  id: number;
  choices: AddGroupChoices;
  steps: AddGroupStep[];
  state: Readonly<Partial<Record<AddGroupStep, StepState>>>;
  phase: AddGroupPhase;
  /** The reader's last decision while it runs: that button shows it, the others wait. */
  busy: string | null;
  /** setGroup has made the group (known from its reply or a read). */
  made: boolean;
  /** A folder given access is shared over SMB: the checkpoint also expects `samba` and `avahi`. */
  shared: boolean;
  /** "Apply them too" at the checkpoint (R10). */
  acceptOthers: boolean;
}

/** The form as the reader left it, for "Change choices" (every choice kept). */
export interface AddGroupDraft {
  name: string;
  comment: string;
  members: string[];
  /** The grid's choices, by folder UUID. */
  access: Readonly<Record<string, Access>>;
}

export interface AddGroupStore {
  run: AddGroupRun | null;
  draft: AddGroupDraft | null;
}

export const addGroupStore = createMemoryStore<AddGroupStore>({
  run: null,
  draft: null,
});

/** The calls a run keeps for its whole life (useGroupsApi and useSharesApi, taken when it starts). */
export interface AddGroupApi {
  group(name: string): Promise<UserGroup>;
  user(name: string): Promise<UserAccount>;
  users(): Promise<UserAccount[]>;
  groups(): Promise<UserGroup[]>;
  folders(): Promise<SharedFolder[]>;
  shares(): Promise<SmbShareRow[]>;
  pending(): Promise<string[]>;
  setGroup(request: UserMgmtSetGroupRequest): Promise<unknown>;
  deleteGroup(name: string): Promise<unknown>;
  setPrivileges(
    uuid: string,
    privileges: SharedFolderPrivilegeEntry[],
  ): Promise<unknown>;
  /** Config.applyChangesBg, as a task start. */
  apply(): () => Promise<string>;
}

export interface AddGroupOptions {
  /** The apply task's label in the tasks menu. */
  apply: string;
  /** The task registry to follow the apply in; the application's one unless a test gives its own. */
  registry?: TaskRegistry;
}

interface Context {
  id: number;
  api: AddGroupApi;
  options: AddGroupOptions;
}

let nextRunId = 1;
const contexts = new Map<number, Context>();

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const current = (ctx: Context): AddGroupRun | null => {
  const run = addGroupStore.getState().run;
  return run !== null && run.id === ctx.id ? run : null;
};

function update(
  ctx: Context,
  change: (run: AddGroupRun) => Partial<AddGroupRun>,
) {
  const run = current(ctx);
  if (run !== null) {
    addGroupStore.set({ run: { ...run, ...change(run) } });
  }
}

const mark = (ctx: Context, step: AddGroupStep, state: StepState) =>
  update(ctx, (run) => ({ state: { ...run.state, [step]: state } }));

const fail = (ctx: Context, at: AddGroupStep, failure: AddGroupFailure) => {
  mark(ctx, at, { ...(current(ctx)?.state[at] ?? {}), status: "failed" });
  update(ctx, () => ({ phase: { kind: "failed", at, failure } }));
};

const permsOf = (access: "rw" | "ro"): number => (access === "rw" ? 7 : 5);

/** The group's entry in a folder's stored list, as a number (undefined: none). */
function storedPerms(folder: SharedFolder, name: string): number | undefined {
  const entry = entriesOf(folder.privileges).find(
    (e) => e.type === "group" && e.name === name,
  );
  return entry === undefined ? undefined : Number(entry.perms);
}

const sameMembers = (a: readonly string[], b: readonly string[]): boolean => {
  const left = [...a].sort();
  const right = [...b].sort();
  return (
    left.length === right.length && left.every((name, i) => name === right[i])
  );
};

/** The chosen folders, in natural order of name, from a fresh list; those gone are left out. */
function chosenFolders(
  folders: readonly SharedFolder[],
  access: AddGroupChoices["access"],
): SharedFolder[] {
  return folders
    .filter((f) => access[f.uuid] !== undefined)
    .sort((a, b) => collator.compare(a.name, b.name));
}

// ---- The steps -----------------------------------------------------------------------------------

/** Step 1: the name free as a group and as an account, nothing pending, the people still there (R3). */
async function stepCheck(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const { choices } = run;
  mark(ctx, "check", { status: "running" });
  const problem = newNameProblem(choices.name, "group");
  if (problem !== null) {
    fail(ctx, "check", { kind: "name", problem });
    return false;
  }
  let reads;
  try {
    reads = await Promise.all([
      readName("group", choices.name, ctx.api.group),
      readName("user", choices.name, ctx.api.user),
      ctx.api.pending(),
      ctx.api.users(),
    ]);
  } catch (error) {
    fail(ctx, "check", { kind: "checkRead", error });
    return false;
  }
  const [group, account, pending, users] = reads;
  if (group.kind === "taken") {
    fail(ctx, "check", { kind: "takenGroup" });
    return false;
  }
  if (account.kind === "taken") {
    fail(ctx, "check", { kind: "takenAccount" });
    return false;
  }
  if (group.kind === "unknown" || account.kind === "unknown") {
    fail(ctx, "check", {
      kind: "checkRead",
      error:
        group.kind === "unknown"
          ? group.error
          : account.kind === "unknown"
            ? account.error
            : undefined,
    });
    return false;
  }
  if (pending.length > 0) {
    fail(ctx, "check", { kind: "pending", modules: pending });
    return false;
  }
  const listed = new Set(users.map((u) => u.name));
  const gone = choices.members.find((m) => !listed.has(m));
  if (gone !== undefined) {
    fail(ctx, "check", { kind: "personGone", person: gone });
    return false;
  }
  mark(ctx, "check", { status: "succeeded" });
  return true;
}

/** Step 2: setGroup with the name, description and members; at once (B5). */
async function stepAdd(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const { choices } = run;
  mark(ctx, "add", { status: "running" });
  try {
    await ctx.api.setGroup({
      name: choices.name,
      comment: choices.comment,
      members: [...choices.members],
    });
  } catch (error) {
    if (isCut(error)) {
      fail(ctx, "add", { kind: "unknown", step: "add" });
      return false;
    }
    // OMV writes its record and makes the group before it sets the members: read to tell which.
    const now = await readName("group", choices.name, ctx.api.group);
    if (now.kind === "free") {
      update(ctx, () => ({ made: false }));
      fail(ctx, "add", { kind: "notAdded", error });
    } else if (now.kind === "taken") {
      update(ctx, () => ({ made: true }));
      fail(ctx, "add", { kind: "partlyAdded", error });
    } else {
      fail(ctx, "add", { kind: "unknown", step: "add" });
    }
    return false;
  }
  update(ctx, () => ({ made: true }));
  mark(ctx, "add", { status: "succeeded" });
  return true;
}

/**
 * Step 3: for each chosen folder, in natural order, its row read again just before (0.11) and the
 * whole list sent with the group's entry. A folder whose stored entry is already as chosen is not
 * written again (after "Try this step again" or "Check again"). Giving access never leaves a folder
 * with nobody, so 0.10's last-access refusal cannot apply here.
 */
async function stepAccess(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const { choices } = run;
  mark(ctx, "access", { status: "running" });
  let folders;
  let users;
  let groups;
  let shares;
  try {
    [folders, users, groups, shares] = await Promise.all([
      ctx.api.folders(),
      ctx.api.users(),
      ctx.api.groups(),
      ctx.api.shares().catch(() => [] as SmbShareRow[]),
    ]);
  } catch (error) {
    fail(ctx, "access", {
      kind: "access",
      failed: Object.keys(choices.access),
      error,
    });
    return false;
  }
  // The new group may not be listed yet: it is added with the members chosen.
  const withGroup = groups.some((g) => g.name === choices.name)
    ? groups
    : [
        ...groups,
        {
          name: choices.name,
          comment: choices.comment,
          members: [...choices.members],
        },
      ];
  const targets = chosenFolders(folders, choices.access);
  const rows = accessByAccount(
    "group",
    choices.name,
    targets,
    users,
    withGroup,
    shares,
  );
  const shared = targets.some((f) => shareOf(shares, f.uuid) !== undefined);
  update(ctx, () => ({ shared }));
  const missing = Object.keys(choices.access).filter(
    (uuid) => !targets.some((f) => f.uuid === uuid),
  );
  const failed: string[] = [];
  let firstError: unknown;
  for (const row of rows) {
    const want = choices.access[row.id];
    if (want === undefined || current(ctx) === null) {
      continue;
    }
    if (storedPerms(row.folder, choices.name) === permsOf(want)) {
      continue;
    }
    try {
      await ctx.api.setPrivileges(row.id, listToSave(row, want));
    } catch (error) {
      if (isCut(error)) {
        fail(ctx, "access", { kind: "unknown", step: "access" });
        return false;
      }
      failed.push(row.folder.name);
      firstError ??= error;
    }
  }
  if (failed.length > 0 || missing.length > 0) {
    fail(ctx, "access", {
      kind: "access",
      failed: [...failed, ...missing],
      error: firstError,
    });
    return false;
  }
  mark(ctx, "access", { status: "succeeded" });
  return true;
}

/** The checkpoint's expected modules: the access step's (a new group marks nothing, fact 4). */
export const addGroupModules = (shared: boolean): readonly string[] =>
  addFlowModules(shared);

/** Step 4, the checkpoint: what is pending now (R10), then the apply as a task. */
async function stepApply(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "apply", { status: "running" });
  try {
    const others = otherModules(
      await ctx.api.pending(),
      addGroupModules(run.shared),
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
    ctx.options.apply,
    ctx.api.apply(),
    ctx.options.registry,
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

/** Step 5: getGroup's members as chosen, and every chosen folder's entry as chosen. */
async function stepVerify(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const { choices } = run;
  mark(ctx, "verify", { status: "running" });
  const withAccess = Object.keys(choices.access).length > 0;
  let group;
  let folders: SharedFolder[];
  try {
    [group, folders] = await Promise.all([
      ctx.api.group(choices.name),
      withAccess ? ctx.api.folders() : Promise.resolve([]),
    ]);
  } catch (error) {
    fail(
      ctx,
      "verify",
      isCut(error)
        ? { kind: "unknown", step: "verify" }
        : { kind: "notAsChosen", what: { kind: "members" } },
    );
    return false;
  }
  if (!sameMembers(group.members ?? [], choices.members)) {
    fail(ctx, "verify", { kind: "notAsChosen", what: { kind: "members" } });
    return false;
  }
  const targets = chosenFolders(folders, choices.access);
  for (const uuid of Object.keys(choices.access)) {
    const folder = targets.find((f) => f.uuid === uuid);
    const want = choices.access[uuid];
    if (
      folder === undefined ||
      want === undefined ||
      storedPerms(folder, choices.name) !== permsOf(want)
    ) {
      fail(ctx, "verify", {
        kind: "notAsChosen",
        what: { kind: "access", folder: folder?.name ?? uuid },
      });
      return false;
    }
  }
  mark(ctx, "verify", { status: "succeeded" });
  update(ctx, () => ({
    phase: { kind: "done", folders: targets.map((f) => f.name) },
  }));
  return true;
}

async function runStep(ctx: Context, step: AddGroupStep): Promise<boolean> {
  switch (step) {
    case "check":
      return stepCheck(ctx);
    case "add":
      return stepAdd(ctx);
    case "access":
      return stepAccess(ctx);
    case "apply":
      return stepApply(ctx);
    case "verify":
      return stepVerify(ctx);
  }
}

/** Run from a step to the end, stopping at the first that does not succeed. */
async function runFrom(ctx: Context, from: AddGroupStep): Promise<void> {
  const run = current(ctx);
  if (run === null) {
    return;
  }
  update(ctx, () => ({ phase: { kind: "running" } }));
  for (const step of run.steps.slice(Math.max(0, run.steps.indexOf(from)))) {
    if (!(await runStep(ctx, step))) {
      return;
    }
  }
}

/**
 * "Check again" after a cut request (6.6): whether the group is there, then the run goes on from the
 * first step whose effect is not seen. A cut step 2 whose group is not there runs step 2 again (the
 * name was free at step 1, so the group can only be this run's).
 */
async function observe(ctx: Context, at: AddGroupStep): Promise<void> {
  const run = current(ctx);
  if (run === null) {
    return;
  }
  if (at !== "add") {
    await runFrom(ctx, at);
    return;
  }
  const now = await readName("group", run.choices.name, ctx.api.group);
  if (now.kind === "unknown") {
    fail(ctx, "add", { kind: "unknown", step: "add" });
    return;
  }
  if (now.kind === "free") {
    await runFrom(ctx, "add");
    return;
  }
  update(ctx, () => ({ made: true }));
  mark(ctx, "add", { status: "succeeded" });
  const next = run.steps[run.steps.indexOf("add") + 1] ?? "verify";
  await runFrom(ctx, next);
}

/** "Delete {{group}} again": empty it (setGroup, no members), then deleteGroup (10, 11). */
async function deleteAgain(ctx: Context): Promise<void> {
  const run = current(ctx);
  if (run === null) {
    return;
  }
  try {
    await ctx.api.setGroup({
      name: run.choices.name,
      comment: run.choices.comment,
      members: [],
    });
    await ctx.api.deleteGroup(run.choices.name);
  } catch (error) {
    update(ctx, () => ({
      phase: {
        kind: "failed",
        at: "add",
        failure: { kind: "deleteFailed", error },
      },
    }));
    return;
  }
  update(ctx, () => ({ made: false, phase: { kind: "removed" } }));
}

// ---- What the pages call -------------------------------------------------------------------------

/** A run is active until it is done, stopped or removed: it then only shows its result. */
export const isAddGroupActive = (run: AddGroupRun): boolean =>
  run.phase.kind === "running" ||
  run.phase.kind === "failed" ||
  run.phase.kind === "alsoPending";

/** Start a run from the confirmed summary. Refused while another add-group run is under way. */
export function startAddGroup(
  api: AddGroupApi,
  options: AddGroupOptions,
  choices: AddGroupChoices,
): boolean {
  const existing = addGroupStore.getState().run;
  if (existing !== null && isAddGroupActive(existing)) {
    return false;
  }
  const id = nextRunId++;
  const steps = addGroupSteps(choices);
  const ctx: Context = { id, api, options };
  contexts.clear();
  contexts.set(id, ctx);
  addGroupStore.set({
    run: {
      id,
      choices,
      steps,
      state: Object.fromEntries(
        steps.map((s) => [s, { status: "waiting" as const }]),
      ),
      phase: { kind: "running" },
      busy: "start",
      made: false,
      shared: false,
      acceptOthers: false,
    },
  });
  void runFrom(ctx, "check").finally(() => {
    update(ctx, () => ({ busy: null }));
  });
  return true;
}

export type AddGroupAction =
  "retry" | "checkAgain" | "applyToo" | "finish" | "deleteAgain" | "stop";

/** The reader's decision after a failure or at the pause. Ignored while another is under way. */
export function addGroupAction(action: AddGroupAction): void {
  const run = addGroupStore.getState().run;
  const ctx = run === null ? undefined : contexts.get(run.id);
  if (run === null || ctx === undefined || run.busy !== null) {
    return;
  }
  const phase = run.phase;
  const at: AddGroupStep = phase.kind === "failed" ? phase.at : "apply";
  const go = (work: () => Promise<unknown>) => {
    update(ctx, () => ({ busy: action }));
    void work().finally(() => {
      update(ctx, () => ({ busy: null }));
    });
  };
  switch (action) {
    case "retry":
    case "finish":
      go(() => runFrom(ctx, at));
      return;
    case "checkAgain":
      go(() =>
        phase.kind === "failed" && phase.failure.kind === "unknown"
          ? observe(ctx, phase.at)
          : runFrom(ctx, at),
      );
      return;
    case "applyToo":
      update(ctx, () => ({ acceptOthers: true }));
      go(() => runFrom(ctx, "apply"));
      return;
    case "deleteAgain":
      if (!run.made) {
        return;
      }
      go(() => deleteAgain(ctx));
      return;
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

/** The reader dismissed the result, or went back to the form: the run is forgotten. */
export function clearAddGroup(): void {
  const run = addGroupStore.getState().run;
  if (run !== null) {
    contexts.delete(run.id);
  }
  addGroupStore.set({ run: null });
}

export const saveAddGroupDraft = (draft: AddGroupDraft): void =>
  addGroupStore.set({ draft });

export const clearAddGroupDraft = (): void =>
  addGroupStore.set({ draft: null });
