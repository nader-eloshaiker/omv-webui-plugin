// SPDX-License-Identifier: GPL-3.0-or-later
// Deleting a person (phase 5 users design 7; 0.8, 0.9, 0.10; P9, D12). What is checked before the
// dialog shows anything, and the run once the reader has confirmed:
// 1. "Delete the account": UserMgmt.deleteUser, which takes effect at once. OMV removes the account,
//    its record and its SMB entry; files, the home folder and the folders' access entries stay
//    (observed on the test VM).
// 2. "Take {{name}} off the access lists" (when the reader left it ticked, the default): per folder that
//    lists them, in natural order, its row re-read and ShareMgmt.setPrivileges with the whole list
//    without them (entries for other accounts that no longer exist dropped too, as the folder's page
//    does).
// 3. "Save the change": R10 re-reads what is pending (expected `postfix` and `ssh`, observed, and with
//    step 2 the folders' modules) and asks when something else appeared; then Config.applyChangesBg.
// A cut request leaves the outcome unknown: "Check again" re-reads the list. Nothing retries by itself
// (UI-14). The run lives here, in memory for the session and by the person's name, not in a page:
// leaving the page does not stop it, and coming back shows it. While it runs the person is marked as
// being changed by this session (usersSession), which every other action on them refuses.
import type {
  HomeFolderSettings,
  SharedFolder,
  SmbShareRow,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import type { TaskRegistry } from "@omv-webui/react-api-omv/tasks";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { otherModules } from "../filesystems/fsModel.ts";
import { isCut, startTask } from "../filesystems/fsTasks.ts";
import type { FsApi } from "../hooks/useFsApi.ts";
import type { UsersApi } from "../hooks/useUsersApi.ts";
import { FOLDER_MODULES, SMB_MODULES } from "../sharedFolders/shareActions.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";
import { foldersListing, type ListedIn } from "./accessByAccount.ts";
import { isMissing } from "./personPage.ts";
import {
  isAdministrator,
  mayDelete,
  omvGroupsOf,
  otherSystemGroups,
  sshAllowed,
  type SelfReading,
} from "./userModel.ts";
import {
  accountId,
  beginAccountAction,
  endAccountAction,
  recordDeleted,
  runningOnAccount,
  type AccountAction,
} from "./usersSession.ts";

// ---- The button's blockers (7.1) -------------------------------------------------------------------

export type DeleteBlocker =
  | { kind: "self" }
  | { kind: "unknownSelf" }
  | { kind: "unread"; error: unknown }
  | { kind: "running"; action: AccountAction };

/** Why "Delete {{name}}…" is unavailable now, from the page's reads, failing closed. */
export function deleteBlocker(input: {
  self: SelfReading;
  person: Pick<UserAccount, "groups">;
  /** A read the dialog rests on failed (the folders, the SMB shares, the home setting). */
  unread: { error: unknown } | null;
  running: AccountAction | null;
}): DeleteBlocker | null {
  if (input.self === "self") {
    return { kind: "self" };
  }
  if (!mayDelete(input.self, input.person)) {
    return { kind: "unknownSelf" };
  }
  if (input.running !== null) {
    return { kind: "running", action: input.running };
  }
  if (input.unread !== null) {
    return { kind: "unread", error: input.unread.error };
  }
  return null;
}

// ---- The check before the dialog (7.2) --------------------------------------------------------------

/** What the dialog says, captured when it was checked (the account goes meanwhile). */
export interface DeleteFacts {
  person: UserAccount;
  /** The groups they are in, but for `users` and the two privilege groups (which have their lines). */
  groups: string[];
  admin: boolean;
  ssh: boolean;
  keys: number;
  /** The folders whose lists name them, with what goes with them. */
  listedIn: ListedIn[];
  /** Their home folder's shared folder, when home folders are on and it is listed. */
  home: SharedFolder | null;
}

export type DeleteCheck =
  | { kind: "refused"; blocker: DeleteBlocker }
  | { kind: "gone" }
  | { kind: "changed" }
  | { kind: "preflight"; modules: string[] }
  | { kind: "confirm"; facts: DeleteFacts };

export interface DeleteCheckApi {
  user(name: string): Promise<UserAccount>;
  users(): Promise<UserAccount[]>;
  groups(): Promise<UserGroup[]>;
  folders(): Promise<SharedFolder[]>;
  shares(): Promise<SmbShareRow[]>;
  homeSettings(): Promise<HomeFolderSettings>;
  pending(): Promise<string[]>;
}

const same = (
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
) =>
  JSON.stringify([...(a ?? [])].sort()) ===
  JSON.stringify([...(b ?? [])].sort());

/**
 * 7.2: getUser, the folders, the SMB shares, the home setting and the pending modules read again,
 * then the self rule once more (0.8). A failed read refuses (fail closed). The person changed since
 * the page read them (their groups) stops it: the page shows the current details first.
 */
export async function checkDelete(
  api: DeleteCheckApi,
  shown: UserAccount,
  self: SelfReading,
): Promise<DeleteCheck> {
  let person: UserAccount;
  try {
    person = await api.user(shown.name);
  } catch (error) {
    if (isMissing(error, "user", shown.name)) {
      return { kind: "gone" };
    }
    return { kind: "refused", blocker: { kind: "unread", error } };
  }
  const running = runningOnAccount(accountId("user", shown.name));
  const blocker = deleteBlocker({ self, person, unread: null, running });
  if (blocker !== null) {
    return { kind: "refused", blocker };
  }
  if (!same(person.groups, shown.groups)) {
    return { kind: "changed" };
  }
  let reads;
  try {
    reads = await Promise.all([
      api.users(),
      api.groups(),
      api.folders(),
      api.shares(),
      api.homeSettings(),
      api.pending(),
    ]);
  } catch (error) {
    return { kind: "refused", blocker: { kind: "unread", error } };
  }
  const [users, groups, folders, shares, home, pending] = reads;
  if (pending.length > 0) {
    return { kind: "preflight", modules: pending };
  }
  return {
    kind: "confirm",
    facts: {
      person,
      groups: [
        ...omvGroupsOf(person, groups),
        ...otherSystemGroups(person, groups).map((g) => g.name),
      ],
      admin: isAdministrator(person),
      ssh: sshAllowed(person),
      keys: (person.sshpubkeys ?? []).length,
      listedIn: foldersListing(
        "user",
        person.name,
        folders,
        users,
        groups,
        shares,
      ),
      home: home.enable
        ? (folders.find((f) => f.uuid === home.sharedfolderref) ?? null)
        : null,
    },
  };
}

// ---- The run (7.4) -----------------------------------------------------------------------------------

export type DeleteStep = "delete" | "access" | "save";

export type PersonDeletePhase =
  | { kind: "running" }
  | { kind: "alsoPending"; others: string[] }
  /** `error` undefined at "delete": "Check again" found the person still listed. */
  | {
      kind: "failed";
      at: DeleteStep;
      error: unknown;
      /** At "access": the folders that still list them, by name. */
      folders?: string[];
    }
  | { kind: "unknown" }
  | { kind: "done" }
  /** "Stop here" after the account went: what is left stays (access lines, or pending in the band). */
  | { kind: "stopped"; at: DeleteStep };

export interface PersonDeleteRun {
  name: string;
  /** The folders to take them off (7.3's checkbox), by UUID, with their names. */
  folders: readonly { uuid: string; name: string }[];
  /** Any of those folders is shared over SMB (R10's expected set). */
  shared: boolean;
  steps: Readonly<Record<DeleteStep, { status: TaskStatus; taskId?: number }>>;
  /** The folders step 2 has written, by UUID. */
  accessDone: readonly string[];
  phase: PersonDeletePhase;
  busy: boolean;
}

/** The calls a run makes (useUsersApi and useFsApi, taken when it starts). */
export interface PersonDeleteApi {
  users: Pick<
    UsersApi,
    | "deleteUser"
    | "users"
    | "groups"
    | "folders"
    | "shares"
    | "pending"
    | "setPrivileges"
  >;
  /** Config.applyChangesBg, as a task start. */
  apply: () => ReturnType<FsApi["apply"]>;
}

export const personDeletes = createMemoryStore<{
  byName: Readonly<Record<string, PersonDeleteRun>>;
}>({ byName: {} });

export const personDeleteOf = (name: string): PersonDeleteRun | undefined =>
  personDeletes.getState().byName[name];

/** A run that has not come to an end the reader must act on or dismiss. */
export const isPersonDeleting = (run: PersonDeleteRun | undefined): boolean =>
  run !== undefined &&
  (run.busy ||
    run.phase.kind === "running" ||
    run.phase.kind === "alsoPending");

function put(name: string, run: PersonDeleteRun | null) {
  personDeletes.set((s) => {
    const { [name]: _gone, ...rest } = s.byName;
    return { byName: run === null ? rest : { ...rest, [name]: run } };
  });
}

function change(
  name: string,
  edit: (run: PersonDeleteRun) => Partial<PersonDeleteRun>,
) {
  const now = personDeleteOf(name);
  if (now !== undefined) {
    put(name, { ...now, ...edit(now) });
  }
}

const step = (
  name: string,
  id: DeleteStep,
  state: { status: TaskStatus; taskId?: number },
) => change(name, (r) => ({ steps: { ...r.steps, [id]: state } }));

export interface PersonDeleteOptions {
  /** The apply task's label in the tasks menu. */
  apply: string;
  registry?: TaskRegistry;
}

interface Context {
  api: PersonDeleteApi;
  options: PersonDeleteOptions;
}

const contexts = new Map<string, Context>();

/** R10's expected set (observed): `postfix` and `ssh`, and with step 2 the folders' modules. */
export function deleteModules(
  run: Pick<PersonDeleteRun, "folders" | "shared">,
): string[] {
  return [
    "postfix",
    "ssh",
    ...(run.folders.length > 0 ? FOLDER_MODULES : []),
    ...(run.folders.length > 0 && run.shared ? SMB_MODULES : []),
  ];
}

/** The reader dismissed the result, or closed a failure. */
export function dismissPersonDelete(name: string): void {
  contexts.delete(name);
  put(name, null);
}

/**
 * Start a deletion from the confirmed dialog: the request, then (when ticked) the access lists, then
 * the checkpoint. Refused (false) while another action of this session runs on the person.
 */
export function startPersonDelete(
  api: PersonDeleteApi,
  facts: DeleteFacts,
  takeOff: boolean,
  options: PersonDeleteOptions,
): boolean {
  const name = facts.person.name;
  if (
    isPersonDeleting(personDeleteOf(name)) ||
    !beginAccountAction(accountId("user", name), "delete")
  ) {
    return false;
  }
  const folders = takeOff
    ? facts.listedIn.map((l) => ({ uuid: l.folder.uuid, name: l.folder.name }))
    : [];
  contexts.set(name, { api, options });
  recordDeleted("user", name, false);
  put(name, {
    name,
    folders,
    shared: takeOff && facts.listedIn.some((l) => l.share !== undefined),
    steps: {
      delete: { status: "running" },
      access: { status: "waiting" },
      save: { status: "waiting" },
    },
    accessDone: [],
    phase: { kind: "running" },
    busy: true,
  });
  void runDelete(name).finally(() => {
    change(name, () => ({ busy: false }));
    endAccountAction(accountId("user", name));
  });
  return true;
}

async function runDelete(name: string): Promise<void> {
  const ctx = contexts.get(name);
  if (ctx === undefined) {
    return;
  }
  step(name, "delete", { status: "running" });
  try {
    await ctx.api.users.deleteUser(name);
  } catch (error) {
    step(name, "delete", { status: "failed" });
    change(name, () => ({
      phase: isCut(error)
        ? { kind: "unknown" }
        : { kind: "failed", at: "delete", error },
    }));
    return;
  }
  await removed(name);
}

/** The account is gone: say so to the session, then the access lists and the checkpoint. */
async function removed(name: string): Promise<void> {
  step(name, "delete", { status: "succeeded" });
  recordDeleted("user", name, true);
  const run = personDeleteOf(name);
  if (run !== undefined && run.folders.length > 0) {
    if (!(await toAccess(name))) {
      return;
    }
  }
  await toSave(name, false);
}

async function toAccess(name: string): Promise<boolean> {
  const ctx = contexts.get(name);
  const run = personDeleteOf(name);
  if (ctx === undefined || run === undefined) {
    return false;
  }
  change(name, () => ({ phase: { kind: "running" } }));
  step(name, "access", { status: "running" });
  const failed: string[] = [];
  let firstError: unknown = undefined;
  let lists: [UserAccount[], UserGroup[], SmbShareRow[]];
  try {
    lists = await Promise.all([
      ctx.api.users.users(),
      ctx.api.users.groups(),
      ctx.api.users.shares(),
    ]);
  } catch (error) {
    step(name, "access", { status: "failed" });
    change(name, () => ({
      phase: {
        kind: "failed",
        at: "access",
        error,
        folders: run.folders.map((f) => f.name),
      },
    }));
    return false;
  }
  for (const folder of run.folders) {
    if ((personDeleteOf(name)?.accessDone ?? []).includes(folder.uuid)) {
      continue;
    }
    try {
      const now = (await ctx.api.users.folders()).find(
        (f) => f.uuid === folder.uuid,
      );
      const listed =
        now === undefined
          ? undefined
          : foldersListing("user", name, [now], ...lists)[0];
      // A folder gone, or no longer listing them, has nothing to take off.
      if (listed !== undefined) {
        await ctx.api.users.setPrivileges(folder.uuid, listed.without);
      }
      change(name, (r) => ({ accessDone: [...r.accessDone, folder.uuid] }));
    } catch (error) {
      failed.push(folder.name);
      firstError ??= error;
    }
  }
  if (failed.length > 0) {
    step(name, "access", { status: "failed" });
    change(name, () => ({
      phase: {
        kind: "failed",
        at: "access",
        error: firstError,
        folders: failed,
      },
    }));
    return false;
  }
  step(name, "access", { status: "succeeded" });
  return true;
}

async function toSave(name: string, acceptOthers: boolean): Promise<void> {
  const ctx = contexts.get(name);
  const run = personDeleteOf(name);
  if (ctx === undefined || run === undefined) {
    return;
  }
  change(name, () => ({ phase: { kind: "running" } }));
  step(name, "save", { status: "running" });
  try {
    const others = otherModules(
      await ctx.api.users.pending(),
      deleteModules(run),
    );
    if (others.length > 0 && !acceptOthers) {
      step(name, "save", { status: "waiting" });
      change(name, () => ({ phase: { kind: "alsoPending", others } }));
      return;
    }
  } catch {
    // Not knowing what else is pending is no reason to stop: the apply lists what it applies.
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

/** "Check again" after a cut request: the list says whether the person was deleted. */
async function checkAgain(name: string): Promise<void> {
  const ctx = contexts.get(name);
  if (ctx === undefined) {
    return;
  }
  let users: UserAccount[];
  try {
    users = await ctx.api.users.users();
  } catch {
    // Still not known: the reader may check again.
    return;
  }
  if (users.some((u) => u.name === name)) {
    step(name, "delete", { status: "failed" });
    change(name, () => ({
      phase: { kind: "failed", at: "delete", error: undefined },
    }));
    return;
  }
  await removed(name);
}

export type PersonDeleteDecision =
  "applyToo" | "retryAccess" | "retrySave" | "checkAgain" | "stop";

/** The reader's decision during the steps; ignored while a step runs. */
export function personDeleteDecision(
  name: string,
  decision: PersonDeleteDecision,
): void {
  const run = personDeleteOf(name);
  if (run === undefined || run.busy) {
    return;
  }
  if (decision === "stop") {
    const at = run.phase.kind === "failed" ? run.phase.at : "save";
    change(name, () => ({ phase: { kind: "stopped", at } }));
    return;
  }
  if (!beginAccountAction(accountId("user", name), "delete")) {
    return;
  }
  change(name, () => ({ busy: true }));
  const work =
    decision === "applyToo"
      ? () => toSave(name, true)
      : decision === "retrySave"
        ? () => toSave(name, false)
        : decision === "retryAccess"
          ? async () => {
              if (await toAccess(name)) {
                await toSave(name, false);
              }
            }
          : () => checkAgain(name);
  void work().finally(() => {
    change(name, () => ({ busy: false }));
    endAccountAction(accountId("user", name));
  });
}

/** Whether a folder in the dialog's list would be left with nobody (said, not refused, 0.10). */
export const leftWithNobody = (listed: readonly ListedIn[]): ListedIn[] =>
  listed.filter((l) => l.leavesNobody);
