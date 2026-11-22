// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a person" (Flow B): the run (phase 5 users design 6.4 to 6.6; UX audit R3 to R10; Q5). A run
// starts only from the reader's confirmation of the summary (R9: never on page load) and runs its
// steps in order: check the choices again, add the person (setUser, which takes effect at once, B5),
// give access to the chosen shared folders, the one checkpoint that applies the changes (R10, then the
// apply as a task), and the check that the person is ready. A failed step stops the run and waits for
// the reader: nothing retries by itself (UI-14). Undo is never offered once the person exists (V4): the
// way back is "Delete {{name}} again".
//
// What the test VM showed (the design's section 23, the brief's VM facts):
// - a name is free only when getUser AND getGroup answer HTTP 500 with OMV's exact "does not exist"
//   words for that name; any other answer stops the flow, so it never writes over an existing account;
// - a new person marks `postfix` only; access adds `sharedfolders`, `systemd`, and `samba`, `avahi`
//   for a folder shared over SMB (R10's expected set);
// - the groups sent replace the whole list (0.5): `users`, the two privilege groups as chosen, the OMV
//   groups as chosen.
//
// THE PASSWORD (0.7, UI-6): it is never in this module's store, a step's state, a failure or a log. It
// is passed to `startAddPerson` and to the decisions that need it ("Try again", "Finish setting up", a
// cut request's "Check again") as an argument, held in that call's own scope until setUser returns,
// whatever it returned, and then dropped; the form clears its own copy at once. A decision that needs
// it again asks the reader for it (`needsPassword`).
//
// The run lives here, in memory for the session (emptied when it ends, app.ts), not in a page: leaving
// the page does not stop it, and coming back shows the step list again. One add run at a time; every
// write checks that its run is still the current one, so a dismissed run or an ended session is never
// brought back by a late reply. While it runs the person is marked as being changed by this session
// (usersSession), and once made they are recorded there, so the Users list recognises unfinished work
// after a reload (R8).
import type {
  SharedFolder,
  UserAccount,
  UserGroup,
  UserMgmtSetUserRequest,
} from "@omv-webui/react-api-omv/generated";
import type { TaskRegistry } from "@omv-webui/react-api-omv/tasks";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { otherModules } from "../filesystems/fsModel.ts";
import { isCut, startTask } from "../filesystems/fsTasks.ts";
import type { FsApi } from "../hooks/useFsApi.ts";
import type { UsersApi } from "../hooks/useUsersApi.ts";
import type { Access } from "../sharedFolders/accessModel.ts";
import { FOLDER_MODULES, SMB_MODULES } from "../sharedFolders/shareActions.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import { accessByAccount, listToSave } from "./accessByAccount.ts";
import { isMissing } from "./personPage.ts";
import { ADMIN_GROUP, SSH_GROUP } from "./systemGroups.ts";
import {
  groupsToSend,
  LOGIN_SHELL,
  newUserParams,
  NOLOGIN_SHELL,
  userSetParams,
} from "./userModel.ts";
import { byName } from "./usersList.ts";
import {
  accountId,
  beginAccountAction,
  endAccountAction,
  forgetAdded,
  recordAdded,
  recordDeleted,
  storedFor,
} from "./usersSession.ts";

// ---- The form's checks (6.2, 0.7) ------------------------------------------------------------------

export type PasswordProblem = "empty" | "lineBreak" | "mismatch";

/** 0.7: not empty, one line (OMV's rules only), and typed the same twice. Spaces are kept as typed. */
export function passwordProblem(
  password: string,
  again: string,
): PasswordProblem | null {
  if (password === "") {
    return "empty";
  }
  if (/[\r\n]/u.test(password)) {
    return "lineBreak";
  }
  if (again !== password) {
    return "mismatch";
  }
  return null;
}

// ---- The choices -----------------------------------------------------------------------------------

/** What the reader chose, fixed at the summary (6.2, 6.3). Never the password. */
export interface AddPersonChoices {
  name: string;
  email: string;
  comment: string;
  /** The OMV groups chosen, by name. */
  groups: string[];
  admin: boolean;
  ssh: boolean;
  /** The access chosen, by folder UUID: only folders whose value differs from what they store. */
  access: Readonly<Record<string, Access>>;
  /** The folder names, by UUID, for the words of failures and the result. */
  folderNames: Readonly<Record<string, string>>;
  /** Home folders were on, in this shared folder, when the summary was made. */
  homeFolder: string | null;
}

/** The form as the reader left it, for "Change choices" (6.3): every choice except the passwords. */
export type AddPersonDraft = Omit<
  AddPersonChoices,
  "folderNames" | "homeFolder"
>;

export type AddPersonStep = "check" | "add" | "access" | "apply" | "verify";

/** The steps of 6.4 that apply to these choices, in order. */
export const addPersonSteps = (
  choices: Pick<AddPersonChoices, "access">,
): AddPersonStep[] => [
  "check",
  "add",
  ...(Object.keys(choices.access).length > 0 ? (["access"] as const) : []),
  "apply",
  "verify",
];

/** The whole groups list a new person is made with (0.5): never empty. */
export const newPersonGroups = (
  choices: Pick<AddPersonChoices, "groups" | "admin" | "ssh">,
  omvGroups: readonly Pick<UserGroup, "name">[],
): string[] =>
  groupsToSend({ groups: [] }, omvGroups, {
    admin: choices.admin,
    ssh: choices.ssh,
    omvGroups: choices.groups,
  });

/** The request of step 2 (0.11's new-person fields). */
export const addRequest = (
  choices: AddPersonChoices,
  omvGroups: readonly Pick<UserGroup, "name">[],
  password: string,
): UserMgmtSetUserRequest =>
  newUserParams({
    name: choices.name,
    password,
    email: choices.email,
    comment: choices.comment,
    groups: newPersonGroups(choices, omvGroups),
    ssh: choices.ssh,
  });

/** R10's expected set at the checkpoint: `postfix`, and with access the folders' modules. */
export function expectedModules(
  choices: Pick<AddPersonChoices, "access">,
  shares: readonly { sharedfolderref: string }[],
): string[] {
  const uuids = Object.keys(choices.access);
  if (uuids.length === 0) {
    return ["postfix"];
  }
  const shared = uuids.some((u) => shares.some((s) => s.sharedfolderref === u));
  return ["postfix", ...FOLDER_MODULES, ...(shared ? SMB_MODULES : [])];
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Step 5: what is not as chosen, or null. */
export function notAsChosen(
  choices: AddPersonChoices,
  now: UserAccount,
  omvGroups: readonly Pick<UserGroup, "name">[],
  folders: readonly SharedFolder[],
): { what: "groups" } | { what: "access"; folder: string } | null {
  if (!sameSet(now.groups ?? [], newPersonGroups(choices, omvGroups))) {
    return { what: "groups" };
  }
  for (const [uuid, access] of Object.entries(choices.access)) {
    const folder = folders.find((f) => f.uuid === uuid);
    if (folder === undefined || storedFor(folder, choices.name) !== access) {
      return {
        what: "access",
        folder: choices.folderNames[uuid] ?? folder?.name ?? uuid,
      };
    }
  }
  return null;
}

// ---- The run ---------------------------------------------------------------------------------------

export interface StepState {
  status: TaskStatus;
  /** The apply's task, in the registry (the handle stays in the task helper, UI-5). */
  taskId?: number;
}

/** Why the run stopped at a step (6.6). */
export type AddPersonFailure =
  /** Step 1: "There is now an account called {{name}}." */
  | { kind: "takenAccount" }
  /** Step 1: "There is now a group called {{name}}." */
  | { kind: "takenGroup" }
  /** Step 1: "The group {{group}} no longer exists." */
  | { kind: "groupGone"; group: string }
  /** Step 1: other changes became pending (R1). */
  | { kind: "pending"; modules: string[] }
  /** Step 1: a read failed. */
  | { kind: "checkRead"; error: unknown }
  /** Step 1: getUser or getGroup answered something other than "does not exist" (22 #1). */
  | { kind: "nameUnknown"; error: unknown }
  /** Step 2: OMV refused, and getUser then finds no such account. */
  | { kind: "notAdded"; error: unknown }
  /** Step 2: the account was made, but the request failed after (the password, the groups). */
  | { kind: "partlyAdded"; error: unknown }
  /** Step 3: some folders' access was not saved. */
  | { kind: "access"; folders: string[]; error: unknown }
  /** Step 4: the apply failed (R7). */
  | { kind: "apply"; error: unknown }
  /** Step 5: applied, but the person is not as chosen. */
  | { kind: "notAsChosen"; what: "groups" }
  | { kind: "notAsChosen"; what: "access"; folder: string }
  /** A write's request was cut: whether it took effect is not known. */
  | { kind: "unknown"; step: AddPersonStep }
  /** "Delete {{name}} again" was refused. */
  | { kind: "deleteFailed"; error: unknown };

export type AddPersonPhase =
  | { kind: "running" }
  | { kind: "failed"; at: AddPersonStep; failure: AddPersonFailure }
  /** R10: modules outside the expected set are pending at the checkpoint. */
  | { kind: "alsoPending"; others: string[] }
  | { kind: "done" }
  | { kind: "stopped"; at: AddPersonStep; failure?: AddPersonFailure }
  /** "Delete {{name}} again" deleted the person. */
  | { kind: "deleted" };

export interface AddPersonRun {
  id: number;
  choices: AddPersonChoices;
  steps: AddPersonStep[];
  state: Readonly<Partial<Record<AddPersonStep, StepState>>>;
  phase: AddPersonPhase;
  /** The reader's last decision while it runs: that button shows it, the others wait. */
  busy: string | null;
  /** The person exists (step 2 made them, or a re-read found them). */
  made: boolean;
  /** The folders whose access step 3 has saved, by UUID. */
  accessSaved: readonly string[];
  /** "Apply them too" at the checkpoint (R10). */
  acceptOthers: boolean;
}

export interface AddPersonStore {
  run: AddPersonRun | null;
  draft: AddPersonDraft | null;
}

export const addPersonStore = createMemoryStore<AddPersonStore>({
  run: null,
  draft: null,
});

/** The calls a run keeps for its whole life (a mutation started after its page went still runs). */
export interface AddPersonApi {
  users: Pick<
    UsersApi,
    | "user"
    | "group"
    | "users"
    | "groups"
    | "folders"
    | "shares"
    | "pending"
    | "setUser"
    | "deleteUser"
    | "setPrivileges"
  >;
  apply: FsApi["apply"];
}

export interface AddPersonLabels {
  /** The apply task's label in the tasks menu. */
  apply: string;
  /** The task registry to follow the apply in; the application's one unless a test gives its own. */
  registry?: TaskRegistry;
}

interface Context {
  id: number;
  api: AddPersonApi;
  labels: AddPersonLabels;
}

let nextRunId = 1;
const contexts = new Map<number, Context>();

const current = (ctx: Context): AddPersonRun | null => {
  const run = addPersonStore.getState().run;
  return run !== null && run.id === ctx.id ? run : null;
};

function update(
  ctx: Context,
  change: (run: AddPersonRun) => Partial<AddPersonRun>,
) {
  const run = current(ctx);
  if (run !== null) {
    addPersonStore.set({ run: { ...run, ...change(run) } });
  }
}

const mark = (ctx: Context, step: AddPersonStep, state: StepState) =>
  update(ctx, (run) => ({ state: { ...run.state, [step]: state } }));

const fail = (ctx: Context, at: AddPersonStep, failure: AddPersonFailure) => {
  mark(ctx, at, { ...(current(ctx)?.state[at] ?? {}), status: "failed" });
  update(ctx, () => ({ phase: { kind: "failed", at, failure } }));
};

/** The account is there: keep it in the session's journal (1.5), once. */
function adopt(ctx: Context) {
  const run = current(ctx);
  if (run === null) {
    return;
  }
  if (!run.made) {
    update(ctx, () => ({ made: true }));
  }
  recordAdded({ name: run.choices.name, access: run.choices.access });
}

/** Whether a name answers "does not exist": true free, false taken, or the error that says neither. */
async function freeAs(
  read: () => Promise<unknown>,
  kind: "user" | "group",
  name: string,
): Promise<{ free: boolean } | { error: unknown }> {
  try {
    await read();
    return { free: false };
  } catch (error) {
    return isMissing(error, kind, name) ? { free: true } : { error };
  }
}

// ---- The steps -------------------------------------------------------------------------------------

/** Step 1: everything again, fresh (R3): the name free as an account and a group, nothing pending. */
async function stepCheck(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const { choices } = run;
  const users = ctx.api.users;
  mark(ctx, "check", { status: "running" });
  const asUser = await freeAs(
    () => users.user(choices.name),
    "user",
    choices.name,
  );
  if ("error" in asUser) {
    fail(ctx, "check", { kind: "nameUnknown", error: asUser.error });
    return false;
  }
  if (!asUser.free) {
    fail(ctx, "check", { kind: "takenAccount" });
    return false;
  }
  const asGroup = await freeAs(
    () => users.group(choices.name),
    "group",
    choices.name,
  );
  if ("error" in asGroup) {
    fail(ctx, "check", { kind: "nameUnknown", error: asGroup.error });
    return false;
  }
  if (!asGroup.free) {
    fail(ctx, "check", { kind: "takenGroup" });
    return false;
  }
  let pending: string[];
  let groups: UserGroup[];
  try {
    [pending, groups] = await Promise.all([users.pending(), users.groups()]);
  } catch (error) {
    fail(ctx, "check", { kind: "checkRead", error });
    return false;
  }
  if (pending.length > 0) {
    fail(ctx, "check", { kind: "pending", modules: pending });
    return false;
  }
  const gone = choices.groups.find((g) => !groups.some((x) => x.name === g));
  if (gone !== undefined) {
    fail(ctx, "check", { kind: "groupGone", group: gone });
    return false;
  }
  const privileges = [
    ...(choices.admin ? [ADMIN_GROUP] : []),
    ...(choices.ssh ? [SSH_GROUP] : []),
  ];
  for (const group of privileges) {
    const there = await freeAs(() => users.group(group), "group", group);
    if ("error" in there) {
      fail(ctx, "check", { kind: "checkRead", error: there.error });
      return false;
    }
    if (there.free) {
      fail(ctx, "check", { kind: "groupGone", group });
      return false;
    }
  }
  mark(ctx, "check", { status: "succeeded" });
  return true;
}

/**
 * Step 2: setUser for a new person, or, after "partlyAdded", for the person now there (re-read first,
 * every field as read, the choices applied). The password is only this call's argument.
 */
async function stepAdd(ctx: Context, password: string): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const { choices } = run;
  const users = ctx.api.users;
  if (password === "") {
    // A new person needs a password (0.7); the reader is asked for it again.
    fail(
      ctx,
      "add",
      run.made
        ? { kind: "partlyAdded", error: undefined }
        : { kind: "notAdded", error: undefined },
    );
    return false;
  }
  mark(ctx, "add", { status: "running" });
  try {
    const groups = await users.groups();
    if (run.made) {
      const now = await users.user(choices.name);
      await users.setUser(
        userSetParams(now, {
          groups: newPersonGroups(choices, groups),
          shell: choices.ssh ? LOGIN_SHELL : NOLOGIN_SHELL,
          password,
          email: choices.email,
          comment: choices.comment,
        }),
      );
    } else {
      await users.setUser(addRequest(choices, groups, password));
    }
  } catch (error) {
    if (isCut(error)) {
      fail(ctx, "add", { kind: "unknown", step: "add" });
      return false;
    }
    // Tell "nothing made" from "made, but not set up" by reading the account again.
    const there = await freeAs(
      () => users.user(choices.name),
      "user",
      choices.name,
    );
    if ("error" in there) {
      fail(ctx, "add", { kind: "unknown", step: "add" });
    } else if (there.free) {
      fail(ctx, "add", { kind: "notAdded", error });
    } else {
      adopt(ctx);
      fail(ctx, "add", { kind: "partlyAdded", error });
    }
    return false;
  }
  adopt(ctx);
  mark(ctx, "add", { status: "succeeded" });
  return true;
}

/** Step 3: per chosen folder, in natural order: its row re-read, then the whole list with the person. */
async function stepAccess(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const { choices } = run;
  const users = ctx.api.users;
  mark(ctx, "access", { status: "running" });
  const failed: string[] = [];
  let firstError: unknown = undefined;
  let lists: [UserAccount[], UserGroup[]];
  try {
    lists = await Promise.all([users.users(), users.groups()]);
  } catch (error) {
    fail(ctx, "access", {
      kind: "access",
      folders: Object.keys(choices.access).map(
        (u) => choices.folderNames[u] ?? u,
      ),
      error,
    });
    return false;
  }
  const todo = Object.keys(choices.access)
    .filter((u) => !(current(ctx)?.accessSaved ?? []).includes(u))
    .sort((a, b) =>
      byName(choices.folderNames[a] ?? a, choices.folderNames[b] ?? b),
    );
  for (const uuid of todo) {
    const value = choices.access[uuid];
    if (value === undefined) {
      continue;
    }
    try {
      const folder = (await users.folders()).find((f) => f.uuid === uuid);
      const row =
        folder === undefined
          ? undefined
          : accessByAccount("user", choices.name, [folder], ...lists)[0];
      if (row === undefined) {
        failed.push(choices.folderNames[uuid] ?? uuid);
        continue;
      }
      await users.setPrivileges(uuid, listToSave(row, value));
      update(ctx, (r) => ({ accessSaved: [...r.accessSaved, uuid] }));
    } catch (error) {
      if (isCut(error)) {
        fail(ctx, "access", { kind: "unknown", step: "access" });
        return false;
      }
      failed.push(choices.folderNames[uuid] ?? uuid);
      firstError ??= error;
    }
  }
  if (failed.length > 0) {
    fail(ctx, "access", { kind: "access", folders: failed, error: firstError });
    return false;
  }
  mark(ctx, "access", { status: "succeeded" });
  return true;
}

/** Step 4, the checkpoint: what is pending now (R10), then the apply as a task. */
async function stepApply(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  mark(ctx, "apply", { status: "running" });
  try {
    const [pending, shares] = await Promise.all([
      ctx.api.users.pending(),
      ctx.api.users.shares(),
    ]);
    const others = otherModules(pending, expectedModules(run.choices, shares));
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
    ctx.labels.registry,
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

/** Step 5: the person's groups and shell as chosen, and the folders' entries as chosen. */
async function stepVerify(ctx: Context): Promise<boolean> {
  const run = current(ctx);
  if (run === null) {
    return false;
  }
  const users = ctx.api.users;
  mark(ctx, "verify", { status: "running" });
  try {
    const [now, groups, folders] = await Promise.all([
      users.user(run.choices.name),
      users.groups(),
      users.folders(),
    ]);
    const off = notAsChosen(run.choices, now, groups, folders);
    if (off !== null) {
      fail(ctx, "verify", { kind: "notAsChosen", ...off });
      return false;
    }
  } catch {
    fail(ctx, "verify", { kind: "unknown", step: "verify" });
    return false;
  }
  mark(ctx, "verify", { status: "succeeded" });
  forgetAdded(run.choices.name);
  update(ctx, () => ({ phase: { kind: "done" } }));
  return true;
}

async function runStep(
  ctx: Context,
  step: AddPersonStep,
  password: { value: string },
): Promise<boolean> {
  switch (step) {
    case "check":
      return stepCheck(ctx);
    case "add": {
      // Taken once, then dropped: after setUser returns the run holds no password (0.7).
      const typed = password.value;
      password.value = "";
      return stepAdd(ctx, typed);
    }
    case "access":
      return stepAccess(ctx);
    case "apply":
      return stepApply(ctx);
    case "verify":
      return stepVerify(ctx);
  }
}

/** Run from a step to the end, stopping at the first that does not succeed. */
async function runFrom(
  ctx: Context,
  from: AddPersonStep,
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
  } finally {
    password.value = "";
  }
}

/**
 * "Check again" after a cut request (6.6): whether the person exists, then the run goes on from the
 * first step whose effect is not seen. A cut step 2 whose person is not there runs step 2 again, which
 * needs the password (the caller asked for it).
 */
async function observe(
  ctx: Context,
  password: { value: string },
): Promise<void> {
  const run = current(ctx);
  if (run === null) {
    return;
  }
  const users = ctx.api.users;
  const there = await freeAs(
    () => users.user(run.choices.name),
    "user",
    run.choices.name,
  );
  if ("error" in there) {
    // Still not known: the failure stays, and the reader may check again.
    return;
  }
  if (there.free) {
    update(ctx, () => ({ made: false }));
    if (password.value === "") {
      fail(ctx, "add", { kind: "notAdded", error: undefined });
      return;
    }
    await runFrom(ctx, "add", password);
    return;
  }
  password.value = "";
  adopt(ctx);
  mark(ctx, "add", { status: "succeeded" });
  let folders: SharedFolder[];
  try {
    folders = await users.folders();
  } catch {
    return;
  }
  const saved = Object.entries(run.choices.access)
    .filter(([uuid, access]) => {
      const folder = folders.find((f) => f.uuid === uuid);
      return (
        folder !== undefined && storedFor(folder, run.choices.name) === access
      );
    })
    .map(([uuid]) => uuid);
  update(ctx, () => ({ accessSaved: saved }));
  const steps = current(ctx)?.steps ?? [];
  const needAccess =
    steps.includes("access") &&
    saved.length < Object.keys(run.choices.access).length;
  if (steps.includes("access") && !needAccess) {
    mark(ctx, "access", { status: "succeeded" });
  }
  await runFrom(ctx, needAccess ? "access" : "apply");
}

// ---- What the page calls ---------------------------------------------------------------------------

/** A run is active until it is done, stopped or deleted: it then only shows its result. */
export const isPersonRunActive = (run: AddPersonRun): boolean =>
  run.phase.kind === "running" ||
  run.phase.kind === "failed" ||
  run.phase.kind === "alsoPending";

/** Whether the decision the reader faces needs the password typed again (6.6). */
export function needsPassword(run: AddPersonRun): boolean {
  const phase = run.phase;
  if (phase.kind !== "failed") {
    return false;
  }
  switch (phase.failure.kind) {
    // Trying step 1 again goes on to step 2, which needs it.
    case "checkRead":
    case "nameUnknown":
    case "notAdded":
    case "partlyAdded":
    case "deleteFailed":
      return true;
    case "unknown":
      return phase.failure.step === "add";
    default:
      return false;
  }
}

function settle(ctx: Context) {
  const run = current(ctx);
  if (run !== null && !isPersonRunActive(run)) {
    endAccountAction(accountId("user", run.choices.name));
  }
}

/** Start a run from the confirmed summary. Refused while another add run, or an action on the name, runs. */
export function startAddPerson(
  api: AddPersonApi,
  labels: AddPersonLabels,
  choices: AddPersonChoices,
  password: string,
): boolean {
  const existing = addPersonStore.getState().run;
  if (existing !== null && isPersonRunActive(existing)) {
    return false;
  }
  if (!beginAccountAction(accountId("user", choices.name), "add")) {
    return false;
  }
  const id = nextRunId++;
  const steps = addPersonSteps(choices);
  const ctx: Context = { id, api, labels };
  contexts.clear();
  contexts.set(id, ctx);
  addPersonStore.set({
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
      accessSaved: [],
      acceptOthers: false,
    },
  });
  void runFrom(ctx, "check", { value: password }).finally(() => {
    update(ctx, () => ({ busy: null }));
    settle(ctx);
  });
  return true;
}

export type AddPersonAction =
  "retry" | "finish" | "checkAgain" | "applyToo" | "deleteAgain" | "stop";

/**
 * The reader's decision after a failure or at the pause. Ignored while another is under way. The
 * password is passed only to the decisions that need it (`needsPassword`), and dropped after the
 * request.
 */
export function addPersonAction(action: AddPersonAction, password = ""): void {
  const run = addPersonStore.getState().run;
  const ctx = run === null ? undefined : contexts.get(run.id);
  if (run === null || ctx === undefined || run.busy !== null) {
    return;
  }
  const phase = run.phase;
  const at: AddPersonStep = phase.kind === "failed" ? phase.at : "apply";
  const typed = { value: password };
  const go = (work: () => Promise<unknown>) => {
    const id = accountId("user", run.choices.name);
    beginAccountAction(id, "add");
    update(ctx, () => ({ busy: action }));
    void work().finally(() => {
      typed.value = "";
      update(ctx, () => ({ busy: null }));
      settle(ctx);
    });
  };
  switch (action) {
    case "retry":
    case "finish":
      go(() => runFrom(ctx, at, typed));
      return;
    case "checkAgain":
      go(() =>
        phase.kind === "failed" && phase.failure.kind === "unknown"
          ? observe(ctx, typed)
          : runFrom(ctx, at, typed),
      );
      return;
    case "applyToo":
      update(ctx, () => ({ acceptOthers: true }));
      go(() => runFrom(ctx, "apply"));
      return;
    case "deleteAgain":
      // "Delete {{name}} again" (6.6): the account just made goes; nothing of theirs is kept.
      go(async () => {
        try {
          await ctx.api.users.deleteUser(run.choices.name);
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
        recordDeleted("user", run.choices.name, true);
        update(ctx, () => ({ made: false, phase: { kind: "deleted" } }));
      });
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

/** The reader dismissed the result, or went back to the form: the run is forgotten. */
export function clearAddPerson(): void {
  const run = addPersonStore.getState().run;
  if (run !== null) {
    contexts.delete(run.id);
    endAccountAction(accountId("user", run.choices.name));
  }
  addPersonStore.set({ run: null });
}

export const saveAddPersonDraft = (draft: AddPersonDraft): void =>
  addPersonStore.set({ draft });

export const clearAddPersonDraft = (): void =>
  addPersonStore.set({ draft: null });
