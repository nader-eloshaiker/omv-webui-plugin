// SPDX-License-Identifier: GPL-3.0-or-later
// A copy job (the classic "Rsync task"), as this interface reads, checks and writes it (phase 5
// services design 0.6, 0.10, 0.11, 5.3 and 6). Pure, so every rule is tested by itself; the pages
// turn the results into words.
//
// Read from source (design 14.1): OMV stores the direction as `type` (local or remote) and `mode`
// (push or pull); Rsync.get returns the stored job with `src` and `dest` and only the flattened side
// fields that apply; Rsync.getList adds `srcname` and `destname` (a folder's name or the other
// computer's address); Rsync.set takes all 36 fields, keeps only the side fields that apply and checks
// nothing else. The contract's request is the union of three shapes, one per direction, each with its
// own sides set and the others empty (RsyncSetRequest); this module builds exactly one of them.
//
// A job's options set in the classic interface are kept on every write. This interface never writes
// extra options, but reads them: an option that deletes makes the job a deleting one everywhere, and
// a trial option makes it trial-only (0.6).
import { RsyncSetRequestSchema } from "@omv-webui/react-api-omv/forms";
import type {
  ConfiguredFilesystem,
  RsyncJob,
  RsyncJobRow,
  RsyncSetLocalRequest,
  RsyncSetPullRequest,
  RsyncSetPushRequest,
  RsyncSetRequest,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import type { ScheduleFieldValue } from "@omv-webui/react-ui-components";
import { isSameOrInside } from "../sharedFolders/nameRules.ts";
import { folderFs, folderState } from "../sharedFolders/shareActions.ts";
import {
  NEW_JOB_SCHEDULE,
  scheduleFields,
  toScheduleValue,
  type StoredJobSchedule,
} from "./jobSchedule.ts";

/** OMV's identifier for "a new object": Rsync.set makes a job with it. */
export const NEW_JOB_UUID = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";

/** A job's page is addressed by its UUID (D3); anything else never reaches a call (UI-4). */
const JOB_ADDRESS =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/u;

export const isJobAddress = (value: unknown): value is string =>
  typeof value === "string" && JOB_ADDRESS.test(value);

// ---- Direction and sides (0.6) -------------------------------------------------------------------

export type Direction = "local" | "push" | "pull";

/** The direction a stored job has, or null for a combination this interface does not know. */
export function directionOf(job: {
  type: string;
  mode: string;
}): Direction | null {
  if (job.type === "local") {
    return "local";
  }
  if (job.type === "remote" && (job.mode === "push" || job.mode === "pull")) {
    return job.mode;
  }
  return null;
}

/** One side of a job: a shared folder by its UUID, or another computer's stored address. */
export type Side =
  { kind: "folder"; uuid: string } | { kind: "remote"; uri: string };

export interface JobSides {
  direction: Direction;
  from: Side;
  to: Side;
}

type SideFields = Pick<RsyncJob, "type" | "mode" | "src" | "dest"> &
  Partial<
    Pick<
      RsyncJob,
      "srcsharedfolderref" | "srcuri" | "destsharedfolderref" | "desturi"
    >
  >;

/** The two sides, from Rsync.get (with its flattened fields) or a Rsync.getList row. */
export function sidesOf(job: SideFields): JobSides | null {
  const direction = directionOf(job);
  if (direction === null) {
    return null;
  }
  const folder = (ref: string | undefined, flat: string | undefined): Side => ({
    kind: "folder",
    uuid: ref !== undefined && ref !== "" ? ref : (flat ?? ""),
  });
  const remote = (uri: string | undefined, flat: string | undefined): Side => ({
    kind: "remote",
    uri: uri !== undefined && uri !== "" ? uri : (flat ?? ""),
  });
  const srcFolder = folder(job.src.sharedfolderref, job.srcsharedfolderref);
  const destFolder = folder(job.dest.sharedfolderref, job.destsharedfolderref);
  switch (direction) {
    case "local":
      return { direction, from: srcFolder, to: destFolder };
    case "push":
      return {
        direction,
        from: srcFolder,
        to: remote(job.dest.uri, job.desturi),
      };
    case "pull":
      return {
        direction,
        from: remote(job.src.uri, job.srcuri),
        to: destFolder,
      };
  }
}

/** The shared folder a side names, or undefined (a remote side, or a folder no longer listed). */
export const folderOfSide = (
  side: Side,
  folders: readonly SharedFolder[],
): SharedFolder | undefined =>
  side.kind === "folder"
    ? folders.find((f) => f.uuid === side.uuid)
    : undefined;

/** The shared folders a job uses, by UUID (for a folder's Used by and Run now's checks). */
export const jobFolders = (sides: JobSides): string[] =>
  [sides.from, sides.to].flatMap((s) => (s.kind === "folder" ? [s.uuid] : []));

// ---- Another computer's address (5.3) ------------------------------------------------------------

/** Over SSH: `user@host:/folder/`, the port and the key in their own fields. */
export interface SshAddress {
  via: "ssh";
  user: string;
  host: string;
  /** An absolute folder, without its trailing "/". */
  path: string;
}

/** Through its rsync server: `rsync://[user@]host[:port]/module/[inside/]`. */
export interface RsyncdAddress {
  via: "rsyncd";
  /** Empty when the server asks for no name. */
  user: string;
  host: string;
  /** null for the rsync port, 873, written without a port. */
  port: number | null;
  module: string;
  /** A folder inside the module, without slashes at either end; empty for the module itself. */
  inside: string;
}

export type RemoteAddress = SshAddress | RsyncdAddress;

export const RSYNCD_PORT = 873;
export const SSH_PORT = 22;

const trimSlashes = (text: string) => text.replace(/^\/+|\/+$/gu, "");

/** An IPv6 address is written in brackets in an address (5.3). */
const hostPart = (host: string) => (host.includes(":") ? `[${host}]` : host);

/** The stored form of an address, always with the trailing "/" (contents into contents, D7). */
export function remoteUri(address: RemoteAddress): string {
  if (address.via === "ssh") {
    const path = trimSlashes(address.path);
    return `${address.user}@${hostPart(address.host)}:/${path === "" ? "" : `${path}/`}`;
  }
  const user = address.user === "" ? "" : `${address.user}@`;
  const port =
    address.port === null || address.port === RSYNCD_PORT
      ? ""
      : `:${String(address.port)}`;
  const inside = trimSlashes(address.inside);
  return `rsync://${user}${hostPart(address.host)}${port}/${trimSlashes(address.module)}/${inside === "" ? "" : `${inside}/`}`;
}

/** The contract's own pattern for an address (RsyncRemoteUri), from the generated push shape. */
const URI_SCHEMA = RsyncSetRequestSchema.options[1].entries.desturi;

/** Whether a stored address fits the contract's two forms (section 6: otherwise it is written again). */
export function fitsRemoteUri(uri: string): boolean {
  const result = URI_SCHEMA["~standard"].validate(uri);
  return !(result instanceof Promise) && result.issues === undefined;
}

const RSYNCD_FORM =
  /^rsync:\/\/(?:([^@/]+)@)?(\[[^\]]+\]|[^:/[\]]+)(?::(\d+))?\/([^/]+)(?:\/(.*))?$/u;
const SSH_FORM = /^([^@/]+)@(\[[^\]]+\]|[^:/[\]]+):(\/.*)$/u;

const unbracket = (host: string) =>
  host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

/**
 * A stored address split into the form's fields, with whether it ends in "/", or null when it does
 * not fit the contract's forms (set in the classic interface): it is then shown as stored.
 */
export function parseRemoteUri(
  uri: string,
): { address: RemoteAddress; trailing: boolean } | null {
  if (!fitsRemoteUri(uri)) {
    return null;
  }
  const rsyncd = RSYNCD_FORM.exec(uri);
  if (rsyncd !== null) {
    const [, user, host, port, module, inside] = rsyncd;
    return {
      address: {
        via: "rsyncd",
        user: user ?? "",
        host: unbracket(host ?? ""),
        port: port === undefined ? null : Number(port),
        module: module ?? "",
        inside: trimSlashes(inside ?? ""),
      },
      trailing: uri.endsWith("/"),
    };
  }
  const ssh = SSH_FORM.exec(uri);
  if (ssh !== null) {
    const [, user, host, path] = ssh;
    return {
      address: {
        via: "ssh",
        user: user ?? "",
        host: unbracket(host ?? ""),
        path: `/${trimSlashes(path ?? "")}`,
      },
      trailing: uri.endsWith("/"),
    };
  }
  return null;
}

/**
 * An address in words: "{{path}} on {{host}}" (0.2), from either form, also one set in the classic
 * interface where it can be split (`host::module`, no trailing "/"); null when it cannot.
 */
export function remoteWords(
  uri: string,
): { host: string; path: string } | null {
  const parsed = parseRemoteUri(uri);
  if (parsed !== null) {
    const a = parsed.address;
    return a.via === "ssh"
      ? { host: a.host, path: a.path }
      : {
          host: a.host,
          path: a.inside === "" ? a.module : `${a.module}/${a.inside}`,
        };
  }
  const loose =
    /^rsync:\/\/(?:[^@/]+@)?(\[[^\]]+\]|[^:/]+)(?::\d+)?\/(.+?)\/?$/u.exec(
      uri,
    ) ??
    /^(?:[^@/]+@)?(\[[^\]]+\]|[^:/]+)::(.+?)\/?$/u.exec(uri) ??
    /^(?:[^@/]+@)?(\[[^\]]+\]|[^:/]+):(.+?)\/?$/u.exec(uri);
  if (loose?.[1] !== undefined && loose[2] !== undefined) {
    return { host: unbracket(loose[1]), path: loose[2] };
  }
  return null;
}

/**
 * A job copies the folder itself, not its contents, when its source is another computer's folder
 * stored without the trailing "/" (0.6; a shared folder's path always ends in "/").
 */
export function copiesFolderItself(sides: JobSides): boolean {
  return sides.from.kind === "remote" && !sides.from.uri.endsWith("/");
}

// ---- What the job does to its destination (0.6) --------------------------------------------------

export interface ExtraOptionFacts {
  /** An option whose name starts with "--del" (not "--delay-updates"): it deletes at the destination. */
  deletes: boolean;
  /** "--remove-source-files": it deletes each file from the source after copying it. */
  removesSource: boolean;
  /** "--dry-run" or "-n": every run is a trial. */
  trial: boolean;
}

/** The extra options' words, as the shell would split them, without quotes and values. */
function optionWords(extra: string): string[] {
  return extra
    .split(/\s+/u)
    .map((w) => w.replace(/^["']+|["']+$/gu, ""))
    .filter((w) => w !== "")
    .map((w) => w.split("=")[0] ?? w);
}

/** What the extra options set in the classic interface do (0.6). */
export function extraOptionFacts(extra: string | undefined): ExtraOptionFacts {
  const words = optionWords(extra ?? "");
  return {
    deletes: words.some(
      (w) => w.startsWith("--del") && w !== "--delay-updates",
    ),
    removesSource: words.some(
      (w) => w === "--remove-source-files" || w === "--remove-sent-files",
    ),
    trial: words.some((w) => w === "--dry-run" || w === "-n"),
  };
}

export type JobOptions = Pick<
  RsyncJob,
  | "optiondelete"
  | "optiondryrun"
  | "extraoptions"
  | "optionarchive"
  | "optionrecursive"
  | "optionperms"
  | "optiontimes"
  | "optiongroup"
  | "optionowner"
  | "optioncompress"
  | "optionacls"
  | "optionxattrs"
  | "optionpartial"
  | "optionquiet"
>;

/** How a job deletes: by its own option, through its extra options, or not at all. */
export type Deletion = "no" | "option" | "extra";

export function deletionOf(
  job: Pick<JobOptions, "optiondelete" | "extraoptions">,
): Deletion {
  if (job.optiondelete === true) {
    return "option";
  }
  return extraOptionFacts(job.extraoptions).deletes ? "extra" : "no";
}

export const deletes = (
  job: Pick<JobOptions, "optiondelete" | "extraoptions">,
): boolean => deletionOf(job) !== "no";

/** Every run is a trial: the stored option, or a trial option in the extra options. */
export const trialOnly = (
  job: Pick<JobOptions, "optiondryrun" | "extraoptions">,
): boolean =>
  job.optiondryrun === true || extraOptionFacts(job.extraoptions).trial;

/** The classic form's defaults for every option the form does not ask (D5), quiet off. */
export const DEFAULT_OPTIONS = {
  optionarchive: true,
  optionrecursive: true,
  optionperms: true,
  optiontimes: true,
  optiongroup: true,
  optionowner: true,
  optioncompress: false,
  optionacls: false,
  optionxattrs: false,
  optionpartial: false,
  optionquiet: false,
} as const;

/** Whether the advanced options differ from D5's defaults (4.2's "Other options"). */
export function otherOptionsSet(job: JobOptions): boolean {
  const changed = (
    Object.keys(DEFAULT_OPTIONS) as (keyof typeof DEFAULT_OPTIONS)[]
  ).some((key) => (job[key] ?? DEFAULT_OPTIONS[key]) !== DEFAULT_OPTIONS[key]);
  return changed || (job.extraoptions ?? "").trim() !== "";
}

// ---- The form's choices (5.2, 5.3) ---------------------------------------------------------------

/** Another computer, as the form holds it. The password is never kept here (0.8, UI-6). */
export interface RemoteChoice {
  via: "ssh" | "rsyncd";
  host: string;
  /** The SSH port, or the rsync server's port. */
  port: number;
  /** Required over SSH; optional through an rsync server. */
  user: string;
  /** Over SSH: an absolute folder. */
  path: string;
  /** Through an rsync server: the folder it offers, and a folder inside it. */
  module: string;
  inside: string;
  /** Over SSH: the UUID of the NAS's SSH key. */
  key: string;
  /**
   * The address as stored, kept while the reader has not written it again (section 6). Empty for an
   * address made from the fields.
   */
  keep: string;
}

export type SideChoice =
  { kind: "folder"; uuid: string } | { kind: "remote"; remote: RemoteChoice };

export interface JobChoices {
  from: SideChoice;
  to: SideChoice;
  /** "Also delete files in {{dest}} that are not in {{src}}" (never preselected). */
  deletes: boolean;
  schedule: ScheduleFieldValue;
  sendemail: boolean;
  comment: string;
}

export const NOTE_MAX = 200;

export const emptyRemote = (
  via: RemoteChoice["via"] = "ssh",
): RemoteChoice => ({
  via,
  host: "",
  port: via === "ssh" ? SSH_PORT : RSYNCD_PORT,
  user: "",
  path: "",
  module: "",
  inside: "",
  key: "",
  keep: "",
});

/** The direction the two choices make, or null while both are another computer. */
export function directionOfChoices(
  choices: Pick<JobChoices, "from" | "to">,
): Direction | null {
  const { from, to } = choices;
  if (from.kind === "folder" && to.kind === "folder") {
    return "local";
  }
  if (from.kind === "folder" && to.kind === "remote") {
    return "push";
  }
  if (from.kind === "remote" && to.kind === "folder") {
    return "pull";
  }
  return null;
}

/** The address a remote choice stands for: the kept one, or the one its fields make. */
export function choiceUri(remote: RemoteChoice): string {
  if (remote.keep !== "") {
    return remote.keep;
  }
  return remoteUri(
    remote.via === "ssh"
      ? { via: "ssh", user: remote.user, host: remote.host, path: remote.path }
      : {
          via: "rsyncd",
          user: remote.user,
          host: remote.host,
          port: remote.port,
          module: remote.module,
          inside: remote.inside,
        },
  );
}

/** A remote side read from a stored job, for the form: its fields, or the stored address kept. */
function remoteChoiceOf(
  uri: string,
  job: Pick<RsyncJob, "authentication" | "sshcertificateref" | "sshport">,
): RemoteChoice {
  const parsed = parseRemoteUri(uri);
  const key = job.sshcertificateref ?? "";
  if (parsed === null) {
    return {
      ...emptyRemote(job.authentication === "pubkey" ? "ssh" : "rsyncd"),
      key,
      keep: uri,
    };
  }
  const a = parsed.address;
  // A stored address without its trailing "/" is kept as stored, so its job copies as it did.
  const keep = parsed.trailing ? "" : uri;
  return a.via === "ssh"
    ? {
        ...emptyRemote("ssh"),
        host: a.host,
        user: a.user,
        path: a.path,
        port: job.sshport ?? SSH_PORT,
        key,
        keep,
      }
    : {
        ...emptyRemote("rsyncd"),
        host: a.host,
        user: a.user,
        port: a.port ?? RSYNCD_PORT,
        module: a.module,
        inside: a.inside,
        keep,
      };
}

/** A stored job as the change form opens it (section 6). null for a direction it does not know. */
export function choicesFromJob(job: RsyncJob): JobChoices | null {
  const sides = sidesOf(job);
  if (sides === null) {
    return null;
  }
  const side = (s: Side): SideChoice =>
    s.kind === "folder"
      ? { kind: "folder", uuid: s.uuid }
      : { kind: "remote", remote: remoteChoiceOf(s.uri, job) };
  return {
    from: side(sides.from),
    to: side(sides.to),
    deletes: job.optiondelete === true,
    schedule: toScheduleValue(job),
    sendemail: job.sendemail === true,
    comment: job.comment ?? "",
  };
}

/** The remote side of the choices, if any. */
export const remoteOf = (
  choices: Pick<JobChoices, "from" | "to">,
): RemoteChoice | undefined =>
  choices.from.kind === "remote"
    ? choices.from.remote
    : choices.to.kind === "remote"
      ? choices.to.remote
      : undefined;

/** Signs in to another computer's rsync server with a password: typed again on every save (0.8). */
export const asksPassword = (
  choices: Pick<JobChoices, "from" | "to">,
): boolean => remoteOf(choices)?.via === "rsyncd";

// ---- The write (0.11) ----------------------------------------------------------------------------

export interface JobWrite {
  /** NEW_JOB_UUID for a new job, else the stored job's. */
  uuid: string;
  choices: JobChoices;
  /** On its schedule (false for a trial save, 5.6 step 2). */
  enable: boolean;
  /** Every run a trial (5.6 step 2), or not. */
  dryrun: boolean;
  /** The password for another computer's rsync server, typed again; empty otherwise. */
  password: string;
  /**
   * The stored job, from Rsync.get just read (R4): its options, extra options, mode and SSH port are
   * kept. Absent for a new job, which takes D5's defaults.
   */
  base?: RsyncJob;
}

/** Rsync.set's request: all 36 fields, in the one shape the direction takes (0.11, 14.1). */
export function jobRequest(write: JobWrite): RsyncSetRequest | null {
  const { choices, base } = write;
  const direction = directionOfChoices(choices);
  if (direction === null) {
    return null;
  }
  const remote = remoteOf(choices);
  const options = {
    optionarchive: base?.optionarchive ?? DEFAULT_OPTIONS.optionarchive,
    optionrecursive: base?.optionrecursive ?? DEFAULT_OPTIONS.optionrecursive,
    optionperms: base?.optionperms ?? DEFAULT_OPTIONS.optionperms,
    optiontimes: base?.optiontimes ?? DEFAULT_OPTIONS.optiontimes,
    optiongroup: base?.optiongroup ?? DEFAULT_OPTIONS.optiongroup,
    optionowner: base?.optionowner ?? DEFAULT_OPTIONS.optionowner,
    optioncompress: base?.optioncompress ?? DEFAULT_OPTIONS.optioncompress,
    optionacls: base?.optionacls ?? DEFAULT_OPTIONS.optionacls,
    optionxattrs: base?.optionxattrs ?? DEFAULT_OPTIONS.optionxattrs,
    optionpartial: base?.optionpartial ?? DEFAULT_OPTIONS.optionpartial,
    optionquiet: base?.optionquiet ?? DEFAULT_OPTIONS.optionquiet,
    optiondelete: choices.deletes,
    optiondryrun: write.dryrun,
  };
  const ssh = remote?.via === "ssh";
  const common = {
    uuid: write.uuid,
    enable: write.enable,
    sendemail: choices.sendemail,
    comment: choices.comment,
    ...scheduleFields(choices.schedule, base),
    ...options,
    extraoptions: base?.extraoptions ?? "",
    authentication: ssh ? ("pubkey" as const) : ("password" as const),
    password: remote?.via === "rsyncd" ? write.password : "",
    sshcertificateref: ssh ? remote.key : "",
    sshport: ssh ? remote.port : (base?.sshport ?? SSH_PORT),
  };
  const folderRef = (side: SideChoice) =>
    side.kind === "folder" ? side.uuid : "";
  const uriOf = (side: SideChoice) =>
    side.kind === "remote" ? choiceUri(side.remote) : "";
  switch (direction) {
    case "local": {
      const request: RsyncSetLocalRequest = {
        ...common,
        type: "local",
        // Not used for a local job; OMV requires it, so the stored one is kept.
        mode: base?.mode === "pull" ? "pull" : "push",
        srcsharedfolderref: folderRef(choices.from),
        srcuri: "",
        destsharedfolderref: folderRef(choices.to),
        desturi: "",
      };
      return request;
    }
    case "push": {
      const request: RsyncSetPushRequest = {
        ...common,
        type: "remote",
        mode: "push",
        srcsharedfolderref: folderRef(choices.from),
        srcuri: "",
        destsharedfolderref: "",
        desturi: uriOf(choices.to),
      };
      return request;
    }
    case "pull": {
      const request: RsyncSetPullRequest = {
        ...common,
        type: "remote",
        mode: "pull",
        srcsharedfolderref: "",
        srcuri: uriOf(choices.from),
        destsharedfolderref: folderRef(choices.to),
        desturi: "",
      };
      return request;
    }
  }
}

// ---- The interface's refusals (0.10, 5.3) --------------------------------------------------------

export type RemoteField =
  "host" | "port" | "user" | "path" | "module" | "inside" | "key";

export type JobRefusal =
  /** A side is not chosen. */
  | { kind: "missing"; side: "from" | "to" }
  /** Both sides are another computer. */
  | { kind: "bothRemote" }
  /** The same shared folder on both sides. */
  | { kind: "same" }
  /** One folder is inside the other: `inner` is inside `outer`. */
  | { kind: "inside"; outer: string; inner: string }
  /** A chosen shared folder is not OK, or its file system is not mounted. */
  | {
      kind: "folder";
      side: "from" | "to";
      uuid: string;
      reason: "notOk" | "notMounted" | "gone";
    }
  /** A field of another computer fails 5.3's rule. */
  | { kind: "remote"; field: RemoteField }
  /** The stored address does not fit the contract: it must be written again (section 6). */
  | { kind: "classicAddress" }
  /** The note is too long or holds a line break. */
  | { kind: "note" };

const IPV4 =
  /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/u;
const NAME_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;

/** One IPv6 address: hex groups, at most one "::", no zone and no embedded IPv4. */
function isIpv6(text: string): boolean {
  if (!/^[0-9A-Fa-f:]+$/u.test(text) || text.includes(":::")) {
    return false;
  }
  const halves = text.split("::");
  if (halves.length > 2) {
    return false;
  }
  const groups = halves.flatMap((h) => (h === "" ? [] : h.split(":")));
  if (groups.some((g) => g.length === 0 || g.length > 4)) {
    return false;
  }
  return halves.length === 2 ? groups.length <= 7 : groups.length === 8;
}

/** One IPv4 or IPv6 address, or a name of letters, digits, "." and "-", at most 253 characters. */
export function isHost(text: string): boolean {
  if (text.includes(":")) {
    return isIpv6(text);
  }
  if (IPV4.test(text)) {
    return true;
  }
  if (/^[\d.]+$/u.test(text)) {
    // Digits and dots that are not an IPv4 address are a mistyped address, not a name.
    return false;
  }
  return text.length <= 253 && text.split(".").every((l) => NAME_LABEL.test(l));
}

export const isUser = (text: string): boolean =>
  /^[a-z_][a-z0-9._-]{0,31}$/u.test(text);

const PATH_PART = /^[A-Za-z0-9._+@-]+$/u;
const goodParts = (text: string) =>
  text.split("/").every((p) => PATH_PART.test(p) && p !== "." && p !== "..");

/** An absolute folder: starts with "/", no spaces, no part "." or "..". */
export const isRemotePath = (text: string): boolean =>
  text.startsWith("/") &&
  trimSlashes(text) !== "" &&
  goodParts(trimSlashes(text));

export const isModule = (text: string): boolean =>
  /^[A-Za-z0-9._-]+$/u.test(text) && text !== "." && text !== "..";

export const isInside = (text: string): boolean =>
  trimSlashes(text) === "" || goodParts(trimSlashes(text));

export const isPort = (port: number): boolean =>
  Number.isInteger(port) && port >= 1 && port <= 65535;

/** 5.3's rules for another computer's fields, in the form's order; the first that fails each field. */
export function remoteProblems(remote: RemoteChoice): RemoteField[] {
  if (remote.keep !== "") {
    return remote.via === "ssh" && remote.key === "" ? ["key"] : [];
  }
  const problems: RemoteField[] = [];
  if (!isHost(remote.host)) {
    problems.push("host");
  }
  if (!isPort(remote.port)) {
    problems.push("port");
  }
  if (remote.via === "ssh") {
    if (!isUser(remote.user)) {
      problems.push("user");
    }
    if (!isRemotePath(remote.path)) {
      problems.push("path");
    }
    if (remote.key === "") {
      problems.push("key");
    }
  } else {
    if (remote.user !== "" && !isUser(remote.user)) {
      problems.push("user");
    }
    if (!isModule(remote.module)) {
      problems.push("module");
    }
    if (!isInside(remote.inside)) {
      problems.push("inside");
    }
  }
  return problems;
}

export interface RefusalReads {
  folders: readonly SharedFolder[];
  fileSystems: readonly ConfiguredFilesystem[];
}

/**
 * Every refusal of 0.10 for saving these choices, in the form's order. `checkFolders` checks that the
 * chosen shared folders are OK and mounted: for a new job and for a side that changed only (0.10).
 */
export function jobRefusals(
  choices: JobChoices,
  reads: RefusalReads,
  checkFolders: { from: boolean; to: boolean } = { from: true, to: true },
): JobRefusal[] {
  const refusals: JobRefusal[] = [];
  const { from, to } = choices;
  if (from.kind === "folder" && from.uuid === "") {
    refusals.push({ kind: "missing", side: "from" });
  }
  if (to.kind === "folder" && to.uuid === "") {
    refusals.push({ kind: "missing", side: "to" });
  }
  if (from.kind === "remote" && to.kind === "remote") {
    refusals.push({ kind: "bothRemote" });
  }
  for (const [name, side] of [
    ["from", from],
    ["to", to],
  ] as const) {
    if (side.kind !== "folder" || side.uuid === "" || !checkFolders[name]) {
      continue;
    }
    const folder = reads.folders.find((f) => f.uuid === side.uuid);
    if (folder === undefined) {
      refusals.push({
        kind: "folder",
        side: name,
        uuid: side.uuid,
        reason: "gone",
      });
      continue;
    }
    const state = folderState(folder, folderFs(folder, reads.fileSystems));
    if (state.pill !== "ok") {
      refusals.push({
        kind: "folder",
        side: name,
        uuid: side.uuid,
        reason:
          state.pill === "critical" &&
          (state.reason === "fsNotMounted" || state.reason === "fsMissing")
            ? "notMounted"
            : "notOk",
      });
    }
  }
  if (
    from.kind === "folder" &&
    to.kind === "folder" &&
    from.uuid !== "" &&
    to.uuid !== ""
  ) {
    if (from.uuid === to.uuid) {
      refusals.push({ kind: "same" });
    } else {
      const a = reads.folders.find((f) => f.uuid === from.uuid);
      const b = reads.folders.find((f) => f.uuid === to.uuid);
      if (a !== undefined && b !== undefined && a.mntentref === b.mntentref) {
        if (isSameOrInside(a.reldirpath, b.reldirpath)) {
          refusals.push({ kind: "inside", outer: a.uuid, inner: b.uuid });
        } else if (isSameOrInside(b.reldirpath, a.reldirpath)) {
          refusals.push({ kind: "inside", outer: b.uuid, inner: a.uuid });
        }
      }
    }
  }
  const remote = remoteOf(choices);
  if (remote !== undefined && from.kind !== to.kind) {
    if (remote.keep !== "" && !fitsRemoteUri(remote.keep)) {
      refusals.push({ kind: "classicAddress" });
    } else {
      const fields = remoteProblems(remote);
      for (const field of fields) {
        refusals.push({ kind: "remote", field });
      }
      if (fields.length === 0 && !fitsRemoteUri(choiceUri(remote))) {
        // Each field passed, yet the whole is still not what the contract accepts: say so on the host.
        refusals.push({ kind: "remote", field: "host" });
      }
    }
  }
  if (choices.comment.length > NOTE_MAX || /[\r\n]/u.test(choices.comment)) {
    refusals.push({ kind: "note" });
  }
  return refusals;
}

// ---- What a change needs (section 6) -------------------------------------------------------------

/** A side as compared: the folder, or the address it makes (with the port for an rsync server). */
function sideIdentity(side: SideChoice): string {
  if (side.kind === "folder") {
    return `folder:${side.uuid}`;
  }
  const r = side.remote;
  return `remote:${r.via}:${choiceUri(r)}`;
}

export interface ChangeNeed {
  /** "save": a read-modify-write to the band; "trial": the add flow from its summary (5.5). */
  need: "save" | "trial";
  /** Deletion turned off: "Files the job deleted before stay deleted." */
  deletionOff: boolean;
  /** Deletion turned off, but the extra options still delete (the job stays treated as deleting). */
  extraStillDeletes: boolean;
}

/**
 * Section 6: changing the sources, destination or direction, or turning deletion on, needs a trial
 * run before the job runs again; turning deletion off, or changing only the schedule, "only when I
 * start it", email, the note, the key or the password, is a save.
 */
export function changeNeed(
  before: JobChoices,
  after: JobChoices,
  extraoptions: string | undefined,
): ChangeNeed {
  const sidesChanged =
    directionOfChoices(before) !== directionOfChoices(after) ||
    sideIdentity(before.from) !== sideIdentity(after.from) ||
    sideIdentity(before.to) !== sideIdentity(after.to);
  const deletionOn = after.deletes && !before.deletes;
  const deletionOff = before.deletes && !after.deletes;
  return {
    need: sidesChanged || deletionOn ? "trial" : "save",
    deletionOff,
    extraStillDeletes: deletionOff && extraOptionFacts(extraoptions).deletes,
  };
}

/**
 * What a trial run was of: the direction, both sides and whether it deletes. A job is turned on only
 * when the trial seen in this session was of the job as it is now (0.10, 5.7).
 */
export function trialKey(
  job: SideFields & Pick<JobOptions, "optiondelete" | "extraoptions">,
): string | null {
  const sides = sidesOf(job);
  if (sides === null) {
    return null;
  }
  const side = (s: Side) =>
    s.kind === "folder" ? `f:${s.uuid}` : `r:${s.uri}`;
  return [
    sides.direction,
    side(sides.from),
    side(sides.to),
    deletes(job) ? "d" : "-",
  ].join("|");
}

/** A list row's sides in words: the folder's name or the other computer's address (getList). */
export function rowSides(
  row: Pick<
    RsyncJobRow,
    "type" | "mode" | "src" | "dest" | "srcname" | "destname"
  >,
): (JobSides & { fromName: string; toName: string }) | null {
  const sides = sidesOf(row);
  return sides === null
    ? null
    : { ...sides, fromName: row.srcname, toName: row.destname };
}

/** The stored schedule fields of a job (for `scheduleFields`' "kept as stored"). */
export const storedSchedule = (job: RsyncJob): StoredJobSchedule => job;

/**
 * The job's shared folders that cannot be reached now (not listed, not OK, or on a file system that
 * is not mounted), for Run now (7.1) and the job page's "What to do now"; undefined while a read
 * these need has not arrived (fail closed).
 */
export function unreachableFolders(
  sides: JobSides,
  folders: readonly SharedFolder[] | undefined,
  fileSystems: readonly ConfiguredFilesystem[] | undefined,
): string[] | undefined {
  if (folders === undefined || fileSystems === undefined) {
    return undefined;
  }
  return jobFolders(sides).filter((uuid) => {
    const folder = folders.find((f) => f.uuid === uuid);
    return (
      folder === undefined ||
      folderState(folder, folderFs(folder, fileSystems)).pill !== "ok"
    );
  });
}

/** The sides the choices make, once both are chosen (the form's sentence, the flows' dialogs). */
export function sidesOfChoices(
  choices: Pick<JobChoices, "from" | "to">,
): JobSides | null {
  const direction = directionOfChoices(choices);
  const side = (s: SideChoice): Side | null =>
    s.kind === "folder"
      ? s.uuid === ""
        ? null
        : { kind: "folder", uuid: s.uuid }
      : s.remote.host === "" && s.remote.keep === ""
        ? null
        : { kind: "remote", uri: choiceUri(s.remote) };
  const from = side(choices.from);
  const to = side(choices.to);
  return direction === null || from === null || to === null
    ? null
    : { direction, from, to };
}

/** Why Run now is unavailable (7.1), first that applies, or null. */
export type RunBlock =
  | { kind: "pending" }
  | { kind: "running"; taskId: number }
  | { kind: "unreachable"; uuid: string };

export function runBlock(input: {
  pending: readonly string[] | undefined;
  runningTask: number | undefined;
  /** The job's shared folders that are not OK or not mounted; undefined while not known. */
  unreachable: readonly string[] | undefined;
}): RunBlock | null {
  if (input.pending === undefined || input.pending.includes("rsync")) {
    return { kind: "pending" };
  }
  if (input.runningTask !== undefined) {
    return { kind: "running", taskId: input.runningTask };
  }
  const first = input.unreachable?.[0];
  if (first !== undefined) {
    return { kind: "unreachable", uuid: first };
  }
  return null;
}

/** A new job's choices (5.2): two shared folders, no deletion, every day at 03:00 (D4). */
export const newJobChoices = (source: string | null): JobChoices => ({
  from: { kind: "folder", uuid: source ?? "" },
  to: { kind: "folder", uuid: "" },
  deletes: false,
  schedule: NEW_JOB_SCHEDULE,
  sendemail: false,
  comment: "",
});
