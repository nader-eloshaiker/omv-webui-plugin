// SPDX-License-Identifier: GPL-3.0-or-later
// The rsync server (phase 5 services design 0.3, 0.4, 0.8, 0.10, 0.11, 9, 10): its state, the folders
// offered to it ("modules"), their sign-ins and who may connect, the dialog's rules, and the bodies of
// Rsyncd.setSettings and Rsyncd.setModule. Pure.
//
// Read from OMV's source:
// - Services.getStatus names the rsync server's row `rsyncd`, and its pending module is `rsyncd`;
// - Rsyncd.setSettings and setModule replace the whole object (B11): every field is sent, and a
//   sign-in's password sent empty is stored empty, so a save of a folder with a sign-in carries its
//   password typed again (0.8);
// - OMV refuses a second module of the same name itself; it checks nothing else here.
// The transport replaces every stored password in the replies by whether one is set, so nothing here
// ever holds one: a password exists only in the dialog's state while typed and in the one request.
import type {
  RsyncdModule,
  RsyncdModuleRow,
  RsyncdSetModuleRequest,
  RsyncdSetSettingsRequest,
  RsyncdSettings,
  ServiceStatus,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { statusView } from "../sharedFolders/table.ts";
import {
  checkClient,
  classifyStored,
  type ClientProblem,
  type ClientValue,
  type StoredClient,
} from "./clientRules.ts";

/** The rsync server's row in Services.getStatus, and its pending module. */
export const RSYNCD_SERVICE = "rsyncd";
export const RSYNCD_MODULE = "rsyncd";
/** rsync's own port: an address names the port only when it is another one (0.2). */
export const RSYNC_PORT = 873;
/** OMV's placeholder UUID that asks a set method to create an object (rpc datamodels). */
export const NEW_OBJECT_UUID = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";

// ---- The server's state (0.3) --------------------------------------------------------------------

export type RsyncdState =
  | { kind: "loading" }
  /** Rsyncd.getSettings or Services.getStatus failed, or the status has no `rsyncd` row. */
  | { kind: "unread"; error: unknown }
  | { kind: "off" }
  | { kind: "on" }
  /** On, not running, `rsyncd` not pending: Critical, with the system logs. */
  | { kind: "down" }
  /** On, not running, `rsyncd` pending: no pill, "Turned on. It starts when…". */
  | { kind: "pendingOn" };

export interface Read<T> {
  data: T | undefined;
  failed: boolean;
  error?: unknown;
}

/** The state of the rsync server (0.3), as the SMB page reads Windows and Mac sharing's. */
export function rsyncdState(
  settings: Read<Pick<RsyncdSettings, "enable">>,
  services: Read<readonly ServiceStatus[]>,
  pending: readonly string[],
): RsyncdState {
  if (settings.failed) {
    return { kind: "unread", error: settings.error };
  }
  if (services.failed) {
    return { kind: "unread", error: services.error };
  }
  if (settings.data === undefined) {
    return { kind: "loading" };
  }
  if (!settings.data.enable) {
    return { kind: "off" };
  }
  if (services.data === undefined) {
    return { kind: "loading" };
  }
  const row = services.data.find((r) => r.name === RSYNCD_SERVICE);
  if (row === undefined) {
    return { kind: "unread", error: undefined };
  }
  if (row.running) {
    return { kind: "on" };
  }
  return pending.includes(RSYNCD_MODULE)
    ? { kind: "pendingOn" }
    : { kind: "down" };
}

/**
 * Rsyncd.setSettings: `port` and `extraoptions` exactly as getSettings returned them, with only
 * `enable` changed (0.11).
 */
export function rsyncdSettingsRequest(
  settings: RsyncdSettings,
  enable: boolean,
): RsyncdSetSettingsRequest {
  return {
    enable,
    port: settings.port,
    extraoptions: settings.extraoptions ?? "",
  };
}

// ---- One folder offered (0.2, 0.3, 9.2) ----------------------------------------------------------

/**
 * `rsync://NAS_HOST/{{module}}/`, with `:{{port}}` after the host when the port is not 873 (0.2).
 * Text to copy, never a link (UI-3).
 */
export function rsyncAddress(
  hostname: string,
  name: string,
  port: number = RSYNC_PORT,
): string {
  const host = port === RSYNC_PORT ? hostname : `${hostname}:${String(port)}`;
  return `rsync://${host}/${name}/`;
}

/** What other computers may do: read only, read and write, or write only (set in the classic interface). */
export type ModuleMay = "ro" | "rw" | "wo";

export const moduleMay = (
  module: Pick<RsyncdModule, "readonly" | "writeonly">,
): ModuleMay => (module.writeonly ? "wo" : module.readonly ? "ro" : "rw");

/** A module's sign-ins as 9.2's Sign-in column says them. */
export type ModuleSignIn =
  /** No name and password are asked. */
  | { kind: "none" }
  /** One sign-in: its name, and whether a password is stored (the transport's presence flag). */
  | { kind: "one"; name: string; passwordSet: boolean }
  /** None or several, set in the classic interface while a sign-in is asked: "{{count}} sign-ins". */
  | { kind: "many"; count: number };

export function moduleSignIn(
  module: Pick<RsyncdModule, "authusers" | "users">,
): ModuleSignIn {
  if (!module.authusers) {
    return { kind: "none" };
  }
  const [only] = module.users;
  if (module.users.length === 1 && only !== undefined) {
    return {
      kind: "one",
      name: only.name,
      passwordSet: only.password === true,
    };
  }
  return { kind: "many", count: module.users.length };
}

/**
 * Who may connect to a module (0.4, 9.2): with a sign-in, an empty value is any computer with the
 * name and password; without one, an empty value is any computer (shown with the warning shape).
 */
export const moduleWho = (
  module: Pick<RsyncdModule, "authusers" | "hostsallow">,
): StoredClient =>
  classifyStored(
    module.hostsallow ?? "",
    module.authusers ? "anyWithPassword" : "any",
  );

/** The module that offers a folder, if any (OMV allows one per name; this page one per folder). */
export const moduleOfFolder = (
  modules: readonly RsyncdModuleRow[],
  folderUuid: string,
): RsyncdModuleRow | undefined =>
  modules.find((m) => m.sharedfolderref === folderUuid);

/** The shared folders that can be offered (10.2 field 1): OK, and not offered yet. */
export function offerableFolders(
  folders: readonly SharedFolder[],
  modules: readonly Pick<RsyncdModule, "sharedfolderref">[],
): SharedFolder[] {
  return folders.filter(
    (f) =>
      statusView(f.status).pill === "ok" &&
      !modules.some((m) => m.sharedfolderref === f.uuid),
  );
}

// ---- The dialog's rules (0.10, 10.2) -------------------------------------------------------------

/** 1 to 64 of letters, digits, ".", "_", "-", starting with a letter or digit (the contract's). */
export const MODULE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
/** 1 to 32 of letters, digits, ".", "_", "-" (no ":"; the contract's). */
export const SIGN_IN_NAME = /^[A-Za-z0-9._-]{1,32}$/u;

/** D8: a new module is offered under the folder's own name when it fits the rule; else empty. */
export const defaultModuleName = (folderName: string): string =>
  MODULE_NAME.test(folderName) ? folderName : "";

/** Another module already uses the name, ignoring case (OMV refuses the same name; rsync ignores case). */
export function nameTaken(
  name: string,
  modules: readonly Pick<RsyncdModule, "uuid" | "name">[],
  exceptUuid?: string,
): boolean {
  const wanted = name.toLowerCase();
  return modules.some(
    (m) => m.uuid !== exceptUuid && m.name.toLowerCase() === wanted,
  );
}

/** What the dialog holds while it is open. Never the password: that is held apart and cleared. */
export interface ModuleChoices {
  /** The shared folder's UUID; "" while none is chosen (a new module). */
  folder: string;
  name: string;
  may: ModuleMay;
  /** Ask for a name and password. */
  ask: boolean;
  signInName: string;
  who: ClientValue;
}

/** A new module's first values (10.2): read only, a sign-in asked, any computer with it. */
export function newModuleChoices(folder?: SharedFolder): ModuleChoices {
  return {
    folder: folder?.uuid ?? "",
    name: folder === undefined ? "" : defaultModuleName(folder.name),
    may: "ro",
    ask: true,
    signInName: "",
    who: { choice: "anyWithPassword", text: "" },
  };
}

/** An existing module's values, as read. A classic `hostsallow` opens with no choice made. */
export function moduleChoicesOf(module: RsyncdModule): ModuleChoices {
  const who = moduleWho(module);
  const signIn = moduleSignIn(module);
  return {
    folder: module.sharedfolderref,
    name: module.name,
    may: moduleMay(module),
    ask: module.authusers,
    signInName: signIn.kind === "one" ? signIn.name : "",
    who:
      who.kind === "one" || who.kind === "network"
        ? { choice: who.kind, text: who.value }
        : who.kind === "anyWithPassword"
          ? { choice: "anyWithPassword", text: "" }
          : // "*" or empty without a sign-in, and a value set in the classic interface: none of the
            // choices offered here (0.4), so the reader chooses one before saving.
            { choice: null, text: "" },
  };
}

/** Changing whether a sign-in is asked moves who may connect off a choice that no longer exists. */
export function withAsk(choices: ModuleChoices, ask: boolean): ModuleChoices {
  if (ask === choices.ask) {
    return choices;
  }
  if (ask) {
    return { ...choices, ask };
  }
  // Without a name and password "Any computer with the name and password" is gone: one computer is
  // chosen (10.2 field 6), keeping what was typed.
  return {
    ...choices,
    ask,
    who:
      choices.who.choice === "anyWithPassword"
        ? { choice: "one", text: choices.who.text }
        : choices.who,
  };
}

export type ModuleField = "folder" | "name" | "signInName" | "who";

/** Why a field is refused (0.10, 10.5's `module.err.*`; who may connect as clientRules says). */
export type ModuleFieldProblem =
  | { field: "folder"; kind: "required" }
  | { field: "name"; kind: "pattern" }
  | { field: "name"; kind: "taken"; name: string }
  | { field: "signInName"; kind: "pattern" }
  /** Without a sign-in, who may connect must be one computer or one network. */
  | { field: "who"; kind: "required" }
  | { field: "who"; kind: "client"; problem: ClientProblem };

/**
 * The fields' checks (10.2), on blur and on Save. `modules` is the whole list as read, for the
 * name's uniqueness; `exceptUuid` the module being changed.
 */
export function moduleProblems(
  choices: ModuleChoices,
  modules: readonly Pick<RsyncdModule, "uuid" | "name">[],
  exceptUuid?: string,
): ModuleFieldProblem[] {
  const problems: ModuleFieldProblem[] = [];
  if (choices.folder === "") {
    problems.push({ field: "folder", kind: "required" });
  }
  if (!MODULE_NAME.test(choices.name)) {
    problems.push({ field: "name", kind: "pattern" });
  } else if (nameTaken(choices.name, modules, exceptUuid)) {
    problems.push({ field: "name", kind: "taken", name: choices.name });
  }
  if (choices.ask && !SIGN_IN_NAME.test(choices.signInName)) {
    problems.push({ field: "signInName", kind: "pattern" });
  }
  const who = choices.who;
  if (
    !choices.ask &&
    (who.choice === null ||
      who.choice === "any" ||
      who.choice === "anyWithPassword")
  ) {
    problems.push({ field: "who", kind: "required" });
  } else {
    const check = checkClient(who);
    if (!check.ok) {
      problems.push({ field: "who", kind: "client", problem: check.problem });
    } else if (check.form.kind === "any") {
      // Never offered here (0.10): "*" is not written for an rsync server folder.
      problems.push({ field: "who", kind: "required" });
    }
  }
  return problems;
}

/** The value written as `hostsallow` for valid choices: one computer, one network, or empty. */
export function hostsAllowOf(who: ClientValue): string {
  const check = checkClient(who);
  if (!check.ok || check.form.kind === "any") {
    throw new Error("Who may connect was not checked before writing.");
  }
  return check.client;
}

/** Why the whole dialog cannot save (0.10), before its fields are looked at. */
export type ModuleRefusal =
  /** The folder is not OK (its status, the shares slice's 0.3). */
  | { kind: "folderNotOk" }
  /** The folder is offered already (a new module). */
  | { kind: "offered"; name: string }
  /** Several sign-ins set in the classic interface: saving would need every password (0.8). */
  | { kind: "manySignIns"; count: number }
  /** Stored values the contract cannot send back (readOnlyModule). */
  | { kind: "classicValues" }
  /** The module changed since the dialog read it (another tab, another administrator). */
  | { kind: "changed" }
  /** The module is gone. */
  | { kind: "gone" };

/** A new module's refusal, from the lists read just before the write (0.10). */
export function offerRefusal(
  folderUuid: string,
  folders: readonly SharedFolder[],
  modules: readonly RsyncdModuleRow[],
): ModuleRefusal | null {
  const folder = folders.find((f) => f.uuid === folderUuid);
  if (folder === undefined || statusView(folder.status).pill !== "ok") {
    return { kind: "folderNotOk" };
  }
  const offered = moduleOfFolder(modules, folderUuid);
  return offered === undefined ? null : { kind: "offered", name: offered.name };
}

/** The fields of a module a change compares: what the dialog showed, read again just before the write. */
export function moduleChanged(
  before: RsyncdModule,
  now: RsyncdModule,
): boolean {
  const names = (m: RsyncdModule) => m.users.map((u) => u.name).join("\n");
  return (
    before.name !== now.name ||
    before.sharedfolderref !== now.sharedfolderref ||
    before.readonly !== now.readonly ||
    before.writeonly !== now.writeonly ||
    before.authusers !== now.authusers ||
    (before.hostsallow ?? "") !== (now.hostsallow ?? "") ||
    names(before) !== names(now)
  );
}

/** An existing module's refusal: several sign-ins, or changed or gone since it was read (0.10). */
export function changeRefusal(
  before: RsyncdModule,
  now: RsyncdModule | undefined,
): ModuleRefusal | null {
  if (now === undefined) {
    return { kind: "gone" };
  }
  if (moduleChanged(before, now)) {
    return { kind: "changed" };
  }
  const readOnly = readOnlyModule(now);
  return readOnly === null
    ? null
    : readOnly.kind === "manySignIns"
      ? { kind: "manySignIns", count: readOnly.count }
      : { kind: "classicValues" };
}

/** An account or group name as the contract takes it back (`uid`, `gid`). */
const ACCOUNT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,31}$/u;

/**
 * Why the dialog opens a module read-only (10.2): more than one sign-in set in the classic interface
 * (saving would need every password, 0.8), or stored values the contract cannot send back (a name,
 * account, group, note or sign-in name set in the classic interface outside its rules). Stop offering
 * stays available either way. Null: it can be changed here.
 */
export type ReadOnlyReason =
  { kind: "manySignIns"; count: number } | { kind: "classicValues" };

export function readOnlyModule(module: RsyncdModule): ReadOnlyReason | null {
  if (module.users.length > 1) {
    return { kind: "manySignIns", count: module.users.length };
  }
  const comment = module.comment ?? "";
  const unsendable =
    !MODULE_NAME.test(module.name) ||
    (module.uid !== undefined && !ACCOUNT_NAME.test(module.uid)) ||
    (module.gid !== undefined && !ACCOUNT_NAME.test(module.gid)) ||
    comment.length > 255 ||
    /[\r\n]/u.test(comment) ||
    (module.maxconnections ?? 0) < 0 ||
    module.users.some((u) => !SIGN_IN_NAME.test(u.name));
  return unsendable ? { kind: "classicValues" } : null;
}

// ---- Writing (0.11) ------------------------------------------------------------------------------

/** The classic form's defaults for what the dialog does not ask (0.11). */
export const NEW_MODULE_DEFAULTS = {
  enable: true,
  comment: "",
  uid: "nobody",
  gid: "users",
  usechroot: true,
  writeonly: false,
  list: true,
  maxconnections: 0,
  hostsdeny: "",
  extraoptions: "",
} as const;

const accessOf = (may: ModuleMay) =>
  may === "ro"
    ? { readonly: true, writeonly: false }
    : may === "rw"
      ? { readonly: false, writeonly: false }
      : { readonly: false, writeonly: true };

/**
 * Rsyncd.setModule for a new module: the new-object marker, the dialog's fields and the classic
 * defaults. `password` is the one typed, for the request only; checked choices only.
 */
export function newModuleRequest(
  choices: ModuleChoices,
  password: string,
): RsyncdSetModuleRequest {
  return {
    ...NEW_MODULE_DEFAULTS,
    uuid: NEW_OBJECT_UUID,
    sharedfolderref: choices.folder,
    name: choices.name,
    ...accessOf(choices.may),
    authusers: choices.ask,
    users: choices.ask ? [{ name: choices.signInName, password }] : [],
    hostsallow: hostsAllowOf(choices.who),
  };
}

/**
 * Rsyncd.setModule for an existing module: the object from Rsyncd.getModule read just before, with
 * the dialog's fields, and its one sign-in's password typed again (0.8). The folder and the name are
 * fixed when changing (10.2). A stored write-only stays as it was while "Copy to it only" is kept.
 */
export function changedModuleRequest(
  module: RsyncdModule,
  choices: ModuleChoices,
  password: string,
): RsyncdSetModuleRequest {
  const access =
    choices.may === "wo" && moduleMay(module) === "wo"
      ? { readonly: module.readonly, writeonly: module.writeonly }
      : accessOf(choices.may);
  return {
    uuid: module.uuid,
    enable: module.enable,
    sharedfolderref: module.sharedfolderref,
    name: module.name,
    comment: module.comment ?? NEW_MODULE_DEFAULTS.comment,
    uid: module.uid ?? NEW_MODULE_DEFAULTS.uid,
    gid: module.gid ?? NEW_MODULE_DEFAULTS.gid,
    ...access,
    maxconnections: module.maxconnections ?? NEW_MODULE_DEFAULTS.maxconnections,
    list: module.list ?? NEW_MODULE_DEFAULTS.list,
    hostsallow: hostsAllowOf(choices.who),
    hostsdeny: module.hostsdeny ?? NEW_MODULE_DEFAULTS.hostsdeny,
    authusers: choices.ask,
    usechroot: module.usechroot ?? NEW_MODULE_DEFAULTS.usechroot,
    users: choices.ask ? [{ name: choices.signInName, password }] : [],
    extraoptions: module.extraoptions ?? NEW_MODULE_DEFAULTS.extraoptions,
  };
}
