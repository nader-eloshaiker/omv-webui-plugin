// SPDX-License-Identifier: GPL-3.0-or-later
// The services scenarios of the mock (phase 5 services design 16): Linux and Unix sharing (NFS), the
// rsync server, copy jobs, and the rest of SMB (the workgroup, recycle bins). Development and test
// code only (UI-11).
//
// In these stories the answers REMEMBER what the reader did, as the shares and users mocks do, so the
// journeys of the design's sections 1 to 12 can be walked on `pnpm dev:mock`. The shared folders, SMB,
// people and file systems are the shares mock's state (sharesScenarios.ts) and its answers, with each
// folder marked in use while an NFS entry, an rsync server folder or a copy job refers to it. What the
// answers do is what OMV does, read from source and, where the test VM showed it, as captured (the
// examples under spec-api-omv/src/examples, OMV 8.6.1):
// - NFS.getSettings also lists every NFS share under `shares` ("" when there is none); setSettings
//   answers the versions as one comma-separated string; setShare refuses a new entry for a folder whose
//   path has a blank, and extra options that fail OMV's pattern (an empty value too); a folder's first
//   entry makes its bind mount under /export (fstab) and its last entry's removal takes it away;
//   setShare answers the bind mount's UUID as `mntentref`; deleteShare answers [];
// - SMB.setSettings refuses a workgroup that is not a NetBIOS name; SMB.getShare answers the stored
//   share without `sharedfoldername`;
// - Rsyncd.setModule refuses a second folder of the same name; getModuleList and getModule list each
//   sign-in with its password, setModule and deleteModule answer the stored shape (`users.user[]`), the
//   passwords included; Rsync.get, getList, set and delete answer the job's stored password. Every
//   stored password is "EXAMPLE-PASSWORD", so the transport's replacement and removal are exercised;
// - Rsync.set keeps only the side fields that apply to the type and mode; get answers the schedule as
//   lists and the flattened side fields that apply; getList (and NFS.getShareList) fail as a whole when
//   a job's (an entry's) shared folder is gone;
// - Rsync.execute refuses while `rsync` is pending and SMB.emptyRecycleBin while `samba` is, with OMV's
//   "Please apply the configuration changes first."; a job runs as last applied; a second start while
//   it runs ends at once with a failure and no output; a stopped task's handle is gone;
// - pending modules (observed on the test VM): NFS.setSettings avahi, nfs; a folder's first NFS
//   entry avahi, collectd, fstab, monit, nfs and quota, a further one avahi, nfs; a changed one nfs;
//   removing one avahi, nfs, and for the folder's last the same six as its first; Rsyncd.setSettings
//   avahi, rsyncd; the module writes rsyncd; Rsync.set and delete rsync; the SMB writes avahi, samba.
//   An apply commits all of it; an undo brings back the configuration as last applied.
//
// Task output comes in chunks, one per poll, as Exec.getOutput reports what was written since `pos`. A
// run's output is built in the shape of the captured runs (execGetOutput.rsync*: the job script's
// "Please wait, syncing ..." and "[ERROR] The synchronisation failed.", rsync's own lines); a failed
// run's last poll fails with the command and the whole output, as the captured failures do.
//
// The stored records are written here in the shape of the captured examples (named beside each), so a
// story can hold any number of them; servicesScenarios.test.ts checks each reply against the contract's
// schema and the captured example's fields. The states the VM did not show (1,000 jobs, a run of 30,000
// lines, failures of the add flow at each step, hostile text) are WRITTEN BY HAND and say so in their
// labels. No
// value comes from a real system: names are documentation names, UUIDs documentation values, addresses
// from 192.0.2.0/24 and 2001:db8::/32, the other computer backup.example.org, the host "nas".
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  NfsShare,
  RsyncdModule,
  RsyncdSettings,
  RsyncJobStored,
  SmbShare,
  UserAccount,
} from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import {
  NEW_OBJECT,
  newSharesMockState,
  SHARES_MODULES,
  sharesAnswers,
  sharesApplied,
  sharesReverted,
  sharesSmbRunning,
  type MockFolder,
  type SharesMockState,
  type SharesModule,
} from "./sharesScenarios.ts";

export { NEW_OBJECT };

export const SERVICES_SCENARIOS = [
  "servicesNone",
  "servicesSome",
  "servicesRoot",
  "servicesDown",
  "jobsDeleting",
  "jobsCustomSchedule",
  "jobsRun",
  "jobsTrial",
  "jobsPending",
  "jobsMany",
  "jobsBroken",
  "modulesMany",
  "recycleBin",
  "servicesNoSshList",
  "servicesHostile",
  "jobsAddFails",
  "jobsAddFailsCheck",
  "jobsAddFailsSave",
  "jobsAddFailsApply",
  "jobsAddFailsTrial",
  "jobsAddFailsTurnOn",
  "jobsAddFailsTurnOnApply",
  "jobsAddFailsCut",
] as const;
export type ServicesScenarioName = (typeof SERVICES_SCENARIOS)[number];

export const SERVICES_SCENARIO_LABELS: Record<ServicesScenarioName, string> = {
  servicesNone:
    "Services: NFS and the rsync server off, no entries, folders offered, jobs or SSH keys",
  servicesSome:
    "Services: NFS on with three entries, the rsync server on with two folders, three copy jobs (hand-written)",
  servicesRoot:
    "Services: NFS entries with no_root_squash and other classic options (hand-written)",
  servicesDown:
    "Services: NFS and the rsync server on but not running (hand-written)",
  jobsDeleting:
    "Copy jobs: one that deletes, one through extra options, one removing source files, one trial-only (hand-written)",
  jobsCustomSchedule:
    "Copy jobs: multi-value fields, every N hours, every N minutes, Sundays as 7, only when started (hand-written)",
  jobsRun:
    "Copy jobs: Run now with 30,000 lines, host key failure, failing at once, a long one to stop (hand-written)",
  jobsTrial:
    "Copy jobs: a trial into Backup lists 12 deletions, into Media none, anywhere else fails (hand-written)",
  jobsPending: "Copy jobs: a job's change not applied, so rsync is pending",
  jobsMany:
    "Copy jobs: 1,000 jobs and 400 NFS entries over 200 folders (generated)",
  jobsBroken:
    "Copy jobs: the list fails because a job's shared folder is gone (hand-written)",
  modulesMany:
    "Rsync server: a folder with three sign-ins set in the classic interface",
  recycleBin:
    "SMB: a 30-day recycle bin, one kept until emptied, one off; emptying with output and with none (hand-written)",
  servicesNoSshList:
    "Copy jobs: the NAS's SSH keys cannot be read (hand-written)",
  servicesHostile:
    "Services: long, right-to-left and markup-looking notes, names, hosts and output (hand-written)",
  jobsAddFails:
    "Add a copy job: each new job fails at the next step in turn (hand-written)",
  jobsAddFailsCheck:
    "Add a copy job: another change becomes pending 5 s after the folders are read (hand-written)",
  jobsAddFailsSave:
    "Add a copy job: saving the job for trial runs fails (hand-written)",
  jobsAddFailsApply:
    "Add a copy job: applying the trial job fails once (hand-written)",
  jobsAddFailsTrial: "Add a copy job: the trial run fails once (hand-written)",
  jobsAddFailsTurnOn:
    "Add a copy job: saving the job turned on fails once (hand-written)",
  jobsAddFailsTurnOnApply:
    "Add a copy job: applying the job turned on fails once (hand-written)",
  jobsAddFailsCut:
    "Add a copy job: the request to save it is cut after it was saved (hand-written)",
};

export const isServicesScenario = (
  name: string,
): name is ServicesScenarioName =>
  (SERVICES_SCENARIOS as readonly string[]).includes(name);

// ---- Failures of the add flow ---------------------------------------------------------------------

/** Where the add-a-copy-job flow (design 5.6, 5.8) is made to fail. */
export type JobsAddFailure =
  "check" | "save" | "apply" | "trial" | "turnOnSave" | "turnOnApply" | "cut";

/** jobsAddFails: the k-th new job (counted from 0) meets failure k of these, wrapping. */
export const JOBS_ADD_FAILURES_IN_TURN = [
  "save",
  "apply",
  "trial",
  "turnOnSave",
  "turnOnApply",
  "cut",
] as const satisfies readonly JobsAddFailure[];

const FIXED_ADD_FAILURE: Partial<Record<ServicesScenarioName, JobsAddFailure>> =
  {
    jobsAddFailsSave: "save",
    jobsAddFailsApply: "apply",
    jobsAddFailsTrial: "trial",
    jobsAddFailsTurnOn: "turnOnSave",
    jobsAddFailsTurnOnApply: "turnOnApply",
    jobsAddFailsCut: "cut",
  };

/**
 * The failure the k-th new copy job of a story meets: the fixed one of a jobsAddFails<Step> story, the
 * k-th in turn in jobsAddFails, none elsewhere. A refused save's "Try this step again" is a new job
 * too, so jobsAddFailsSave refuses only every other one (the first, the third, ...). The check failure
 * is not met here: see jobsAddFailsCheck in servicesInformationRead.
 */
export function jobsAddFailureOf(
  name: ServicesScenarioName,
  k: number,
): JobsAddFailure | null {
  if (name === "jobsAddFails") {
    return (
      JOBS_ADD_FAILURES_IN_TURN[k % JOBS_ADD_FAILURES_IN_TURN.length] ?? null
    );
  }
  if (name === "jobsAddFailsSave" && k % 2 === 1) {
    return null;
  }
  return FIXED_ADD_FAILURE[name] ?? null;
}

/** How long after the shared folders are first read another change becomes pending (jobsAddFailsCheck). */
export const CHECK_FAILS_AFTER_MS = 5_000;

// ---- Modules --------------------------------------------------------------------------------------

/**
 * OMV's descriptions of the modules the services methods mark dirty: the shares mock's (samba, avahi),
 * nfs, fstab, collectd, monit and quota as the file-system mock has them; rsync's and rsyncd's are not
 * captured ("").
 */
export const SERVICES_MODULES = {
  ...SHARES_MODULES,
  nfs: "NFS server.",
  fstab: "Management of the file systems to be mounted.",
  collectd: "Statistics collection and monitoring daemon.",
  monit: "Statistics collection and monitoring daemon.",
  quota: "",
  rsync: "",
  rsyncd: "",
} as const;

/** What a folder's first NFS entry, and the removal of its last, mark (observed on the test VM). */
const NFS_MOUNT_MODULES = [
  "avahi",
  "collectd",
  "fstab",
  "monit",
  "nfs",
  "quota",
] as const satisfies readonly ServicesModule[];
export type ServicesModule = keyof typeof SERVICES_MODULES;

/** The modules a story starts with pending (jobsPending: a job's change not applied). */
export const servicesStartsPending = (
  name: ServicesScenarioName,
): readonly ServicesModule[] => (name === "jobsPending" ? ["rsync"] : []);

// ---- Small helpers --------------------------------------------------------------------------------

const ok = (value: unknown): FixedAnswer => ({ status: 200, value });
const fail = (status: number, message: string): FixedAnswer => ({
  status,
  message,
  code: 0,
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const param = (params: unknown, key: string): unknown =>
  typeof params === "object" && params !== null
    ? (params as Record<string, unknown>)[key]
    : undefined;
const text = (params: unknown, key: string): string => {
  const value = param(params, key);
  return typeof value === "string" ? value : "";
};
const flag = (params: unknown, key: string): boolean =>
  param(params, key) === true;
const int = (params: unknown, key: string, fallback: number): number => {
  const value = param(params, key);
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : fallback;
};
/** A schedule field as sent (a list) or stored (comma-separated text), as OMV stores it. */
const joined = (params: unknown, key: string, fallback: string): string => {
  const value = param(params, key);
  if (Array.isArray(value)) {
    return value.map(String).join(",");
  }
  return typeof value === "string" ? value : fallback;
};
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const pad = (n: number, width: number) => String(n).padStart(width, "0");

// ---- The stored shapes ----------------------------------------------------------------------------

interface Side {
  sharedfolderref: string;
  uri: string;
}

/** A copy job as OMV stores it: the schedule as comma-separated text, the password as it was typed. */
export type StoredJob = Required<Omit<RsyncJobStored, "src" | "dest">> & {
  src: Side;
  dest: Side;
  password: string;
};

/** A folder offered to the rsync server as OMV stores it, each sign-in with its password. */
export type StoredModule = Required<Omit<RsyncdModule, "users">> & {
  users: { name: string; password: string }[];
};

/** An NFS entry as OMV stores it. */
export type StoredNfsShare = Required<NfsShare>;

/** One of the NAS's SSH keys, as CertificateMgmt.getSshList lists it (never the private half). */
export interface MockSshKey {
  uuid: string;
  comment: string;
  publickey: string;
}

interface ServicesConfig {
  nfs: { enable: boolean; versions: string[] };
  nfsShares: StoredNfsShare[];
  /** Each shared folder's bind mount under /export (its fstab entry), by the folder's UUID. */
  exports: Record<string, string>;
  rsyncd: Required<RsyncdSettings>;
  modules: StoredModule[];
  jobs: StoredJob[];
}

/** A task this mock started (Rsync.execute, SMB.emptyRecycleBin), followed through Exec.*. */
export interface MockTask {
  handle: string;
  /** The job's or SMB share's UUID. */
  ref: string;
  /** Everything the task writes. */
  output: string;
  /** Where each poll's chunk ends, in order; the last is the output's length. */
  bounds: number[];
  /** The message of the last poll when the task fails (the command and its whole output). */
  failure?: string;
  /** Where the task stops writing for a long time, until it is stopped (jobsRun's long copy). */
  holdAt?: number;
  /** Polls answered while held. */
  held: number;
  state: "running" | "stopped" | "gone";
}

export interface ServicesMockState {
  name: ServicesScenarioName;
  /** The shared folders, SMB, people and file systems (the shares mock's state). */
  shares: SharesMockState;
  /** The services' configuration as saved. */
  config: ServicesConfig;
  /** As last applied: what an undo brings back, what the services run, and what a job runs as. */
  applied: ServicesConfig;
  /** The modules this story's writes left pending since the last apply or undo. */
  pending: string[];
  keys: MockSshKey[];
  tasks: Map<string, MockTask>;
  /** UUIDs handed out so far. */
  made: number;
  /** Tasks started so far. */
  started: number;
  /** New copy jobs asked for so far (the failure in turn). */
  newJobs: number;
  /** The add-flow failure the job under way will still meet, once. */
  armed: { failure: JobsAddFailure; job: string; turnedOn: boolean } | null;
  /** When the shared folders were first read (jobsAddFailsCheck). */
  firstFolderRead?: number;
  /** jobsAddFailsCheck: the other change has become pending. */
  checkFired: boolean;
}

// ---- The captured pieces -------------------------------------------------------------------------

/** OMV's messages, as captured where the VM showed them. */
export const SERVICES_MSG = {
  // nfsGetStats.pendingChanges, rsyncExecute.pending (captured).
  pending: "Please apply the configuration changes first.",
  // nfsGetShareList.folderGone (captured).
  folderGone: (folder: string) =>
    `Failed to execute XPath query './/system/shares/sharedfolder[uuid='${folder}']'.`,
  // nfsSetShare.blankInPath (captured).
  blankInPath: (name: string) =>
    `The relative path of the shared folder '${name}' contains blanks.`,
  // nfsSetShare.emptyExtraOptions (captured).
  extraOptions: (value: string) =>
    `extraoptions: The value '${value}' doesn't match the pattern '^(([a-zA-Z_]+)(=([\\w@:\\/]+))?[,])*([a-zA-Z_]+)(=([\\w@:\\/]+))?$' (code=0).`,
  // rsyncdSetModule.nameTaken (captured).
  moduleNameTaken: (name: string) =>
    `The configuration object 'conf.service.rsyncd.module' is not unique. An object with the property 'name' and value '${name}' already exists.`,
  // execGetOutput.rsyncStopped (captured): the handle of a stopped or finished task is gone.
  gone: (handle: string) => `Failed to open file (filename=${handle}, mode=r).`,
  // Written by hand in OMV's words for a missing object.
  notFound: (what: string, id: string) =>
    `The configuration object '${what}' with the identifier '${id}' does not exist.`,
  // smbSetSettings.badWorkgroup (captured).
  badWorkgroup: (value: string) =>
    `workgroup: The value '${value}' is not a valid NetBIOS name.`,
  // Written by hand: the add flow's failures and the SSH key list.
  jobNotSaved:
    "Failed to store the configuration object 'conf.service.rsync.job'.",
  sshList:
    "Failed to execute XPath query '//system/certificates/sshcertificate'.",
};
const CUT = fail(504, "Gateway Time-out");

/** The environment of OMV's task commands (execGetOutput.rsyncSecondStartFailed, captured). */
const SCRIPT_ENV =
  "export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin; export LC_ALL=C.UTF-8; export LANGUAGE=; export SHELL=/bin/sh; sudo --shell --non-interactive -- ";
const commandFailed = (script: string, code: number, output: string) =>
  `Failed to execute command '${SCRIPT_ENV}${script} 2>&1' with exit code '${String(code)}': ${output}`;
const jobScript = (job: string) =>
  `/var/lib/openmediavault/cron.d/rsync-${job}`;
// The share's recycle-bin script, and how SMB.emptyRecycleBin runs it (emptyRecycleBinBinOffFailed).
const recycleScriptPath = (share: string) =>
  `/var/lib/openmediavault/cron.d/samba-recycle-${share}`;
const recycleScript = (share: string) => `${recycleScriptPath(share)} -f`;

/** The handle prefix of this mock's tasks; OMV's are /tmp/bgstatus and random letters. */
const TASK_PREFIX = "/tmp/bgstatusSvcTask";
/** How many polls a held task answers before it finishes by itself (about an hour at 2 s). */
export const HOLD_POLLS = 1_800;

/** The documentation SSH key of the captures (tools/contract-capture/scrub.mjs). */
const DOC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";

export const EXAMPLE_PASSWORD = "EXAMPLE-PASSWORD";

const SERVICES = CONTRACT_EXAMPLES.servicesGetStatus.sshOnly.value.data;
const SMB_ON = clone(CONTRACT_EXAMPLES.smbGetSettings.on.value);
const SMB_OFF = clone(CONTRACT_EXAMPLES.smbGetSettings.off.value);
const { sharedfoldername: _shareName, ...SHARE_ROW } =
  CONTRACT_EXAMPLES.smbGetShareList.one.value.data[0];
/** A new SMB share as the classic form makes it, as captured. */
const SHARE_DEFAULTS = clone(SHARE_ROW) as SmbShare;

// ---- The places ----------------------------------------------------------------------------------

/** The shares mock's mount entries (sharesScenarios.ts): sda1, sdd1, sdb1 (Archive) and tank. */
const ENTRY = {
  sda1: uuid(1),
  sdd1: uuid(2),
  sdb1: uuid(3),
  tank: uuid(4),
} as const;

/** The shared folders of every story. */
export const SERVICES_FOLDERS = {
  photos: uuid(0x1001),
  backup: uuid(0x1002),
  media: uuid(0x1003),
  /** "Holiday Photos": its folder on the disk has a blank, so NFS refuses it. */
  holiday: uuid(0x1004),
  /** "Archive", on sdb1, which is not mounted. */
  archive: uuid(0x1005),
  /** "Документы": non-Latin letters. */
  documents: uuid(0x1006),
} as const;
/** A shared folder whose record is gone (jobsBroken). */
export const GONE_FOLDER = uuid(0x1fff);

/** The copy jobs a test or a story picks by UUID. */
export const SERVICES_JOBS = {
  /** servicesSome: Media into Backup, both on this NAS. */
  local: uuid(0x5001),
  /** servicesSome: Photos to backup.example.org over SSH. */
  push: uuid(0x5002),
  /** servicesSome: from backup.example.org's rsync server into Backup, with a password. */
  pull: uuid(0x5003),
  /** jobsRun: succeeds with 30,000 lines. */
  big: uuid(0x5011),
  /** jobsRun: fails with "Host key verification failed". */
  hostKey: uuid(0x5012),
  /** jobsRun: fails at once with no output. */
  atOnce: uuid(0x5013),
  /** jobsRun: writes a little, then runs until it is stopped. */
  long: uuid(0x5014),
} as const;

export const SERVICES_SHARES = {
  /** SMB share of Photos (servicesSome; recycleBin: a 30-day bin). */
  photos: uuid(0x7001),
  /** recycleBin: Media's share, its bin kept until emptied (and empty). */
  media: uuid(0x7002),
  /** recycleBin: Backup's share, its bin off. */
  backup: uuid(0x7003),
} as const;

export const SERVICES_KEY = uuid(0x6001);

const priv = (type: "user" | "group", name: string, perms: 0 | 5 | 7) => ({
  type,
  name,
  perms,
});

function folder(
  id: string,
  name: string,
  mntentref: string,
  over: Partial<MockFolder> = {},
): MockFolder {
  return {
    uuid: id,
    name,
    comment: "",
    mntentref,
    reldirpath: `${name}/`,
    privileges: [],
    ...over,
  };
}

function baseFolders(): MockFolder[] {
  const F = SERVICES_FOLDERS;
  return [
    folder(F.photos, "Photos", ENTRY.sdd1, {
      comment: "Family photos",
      privileges: [priv("user", "alex", 7), priv("user", "sam", 5)],
    }),
    folder(F.backup, "Backup", ENTRY.sda1, {
      privileges: [priv("user", "alex", 7)],
    }),
    folder(F.media, "Media", ENTRY.sdd1, {
      comment: "Films and music",
      privileges: [priv("group", "family", 5)],
    }),
    folder(F.holiday, "Holiday Photos", ENTRY.sdd1),
    folder(F.archive, "Archive", ENTRY.sdb1, {
      comment: "On a disk that is not mounted",
    }),
    folder(F.documents, "Документы", ENTRY.sdd1),
  ];
}

function smbShare(
  id: string,
  folderUuid: string,
  over: Partial<SmbShare> = {},
) {
  return {
    ...clone(SHARE_DEFAULTS),
    uuid: id,
    sharedfolderref: folderUuid,
    ...over,
  };
}

/** An NFS entry in the shape of nfsGetShare.one (captured). */
function nfsShare(
  n: number,
  folderUuid: string,
  client: string,
  options: string,
  over: Partial<StoredNfsShare> = {},
): StoredNfsShare {
  return {
    uuid: uuid(0x2000 + n),
    sharedfolderref: folderUuid,
    mntentref: "",
    client,
    options,
    comment: "",
    extraoptions: "subtree_check,insecure",
    ...over,
  };
}

/** A folder offered to the rsync server in the shape of rsyncdGetModule.noSignIn (captured). */
function module(
  n: number,
  folderUuid: string,
  name: string,
  over: Partial<StoredModule> = {},
): StoredModule {
  return {
    uuid: uuid(0x4000 + n),
    enable: true,
    sharedfolderref: folderUuid,
    uid: "nobody",
    gid: "users",
    name,
    comment: "",
    readonly: false,
    writeonly: false,
    maxconnections: 0,
    list: true,
    hostsallow: "",
    hostsdeny: "",
    extraoptions: "",
    authusers: false,
    usechroot: true,
    users: [],
    ...over,
  };
}

/** A copy job's stored fields in the shape of rsyncSet.created (captured), with nothing chosen. */
const JOB_DEFAULTS: Omit<StoredJob, "uuid"> = {
  enable: true,
  sendemail: false,
  comment: "",
  type: "local",
  mode: "push",
  src: { sharedfolderref: "", uri: "" },
  dest: { sharedfolderref: "", uri: "" },
  minute: "0",
  everynminute: false,
  hour: "3",
  everynhour: false,
  month: "*",
  dayofmonth: "*",
  everyndayofmonth: false,
  dayofweek: "*",
  optionrecursive: true,
  optiontimes: true,
  optiongroup: true,
  optionowner: true,
  optioncompress: false,
  optionarchive: true,
  optiondelete: false,
  optionquiet: false,
  optionperms: true,
  optionacls: false,
  optionxattrs: false,
  optiondryrun: false,
  optionpartial: false,
  extraoptions: "",
  authentication: "password",
  password: "",
  sshcertificateref: "",
  sshport: 22,
};

function localJob(
  id: string,
  src: string,
  dest: string,
  over: Partial<StoredJob> = {},
): StoredJob {
  return {
    ...clone(JOB_DEFAULTS),
    uuid: id,
    src: { sharedfolderref: src, uri: "" },
    dest: { sharedfolderref: dest, uri: "" },
    ...over,
  };
}

/** From a shared folder to another computer over SSH, with the NAS's key. */
function pushJob(
  id: string,
  src: string,
  uri: string,
  over: Partial<StoredJob> = {},
): StoredJob {
  return localJob(id, src, "", {
    type: "remote",
    mode: "push",
    dest: { sharedfolderref: "", uri },
    authentication: "pubkey",
    sshcertificateref: SERVICES_KEY,
    ...over,
  });
}

/** From another computer's rsync server into a shared folder, with a password. */
function pullJob(
  id: string,
  uri: string,
  dest: string,
  over: Partial<StoredJob> = {},
): StoredJob {
  return localJob(id, "", dest, {
    type: "remote",
    mode: "pull",
    src: { sharedfolderref: "", uri },
    authentication: "password",
    password: EXAMPLE_PASSWORD,
    ...over,
  });
}

const KEY: MockSshKey = {
  uuid: SERVICES_KEY,
  comment: "example-key",
  publickey: `${DOC_KEY} example-key`,
};

// ---- The stories ---------------------------------------------------------------------------------

interface Story {
  folders: MockFolder[];
  smbShares: SmbShare[];
  smbOn: boolean;
  config: ServicesConfig;
  keys: MockSshKey[];
}

const NFS_OFF = () => ({ enable: false, versions: ["3", "4", "4.1", "4.2"] });
const NFS_ON = () => ({ enable: true, versions: ["3", "4", "4.1", "4.2"] });
const RSYNCD_OFF = () => ({ enable: false, port: 873, extraoptions: "" });
const RSYNCD_ON = () => ({ enable: true, port: 873, extraoptions: "" });

function emptyConfig(): ServicesConfig {
  return {
    nfs: NFS_OFF(),
    nfsShares: [],
    exports: {},
    rsyncd: RSYNCD_OFF(),
    modules: [],
    jobs: [],
  };
}

/** servicesSome's NFS entries, modules and jobs (the captured examples' choices). */
function someConfig(): ServicesConfig {
  const F = SERVICES_FOLDERS;
  return {
    nfs: NFS_ON(),
    nfsShares: [
      nfsShare(1, F.media, "192.0.2.10", "rw"),
      nfsShare(2, F.media, "192.0.2.0/24", "ro"),
      nfsShare(3, F.backup, "*", "ro"),
    ],
    exports: {},
    rsyncd: RSYNCD_ON(),
    modules: [
      module(1, F.media, "media", {
        comment: "Family media",
        hostsallow: "192.0.2.10",
      }),
      module(2, F.photos, "photos", {
        readonly: true,
        authusers: true,
        users: [{ name: "copier", password: EXAMPLE_PASSWORD }],
      }),
    ],
    jobs: [
      localJob(SERVICES_JOBS.local, F.media, F.backup, {
        comment: "Media to Backup",
      }),
      pushJob(
        SERVICES_JOBS.push,
        F.photos,
        "backup@backup.example.org:/srv/copies/photos/",
        { hour: "1", dayofweek: "7" },
      ),
      pullJob(
        SERVICES_JOBS.pull,
        "rsync://copier@backup.example.org/photos/",
        F.backup,
        { enable: false },
      ),
    ],
  };
}

const LONG_NOTE =
  `<script>alert(1)</script> \u202Eevil ${"A long note of a copy job. ".repeat(10)}`.slice(
    0,
    200,
  );
/** A computer's name of 200 characters, in labels of at most 63. */
const LONG_HOST = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(60)}.example.org`;
const RTL_MODULE = "תיקייה-".repeat(40).slice(0, 200);

function hostileStory(): Story {
  const markup = folder(uuid(0x1101), "<b>x</b>", ENTRY.sdd1, {
    reldirpath: "markup/",
    comment: '<img src=x onerror="alert(1)">',
  });
  const rtl = folder(uuid(0x1102), "תמונות", ENTRY.sdd1, {
    reldirpath: "rtl/",
    comment: "תמונות מהחופשה",
  });
  const bidi = folder(uuid(0x1103), "\u202Eevil.exe", ENTRY.sdd1, {
    reldirpath: "bidi/",
  });
  const long = folder(uuid(0x1104), `Long-${"n".repeat(195)}`, ENTRY.sda1, {
    reldirpath: "long/",
    comment: "A name of 200 characters, made outside OMV's checks.",
  });
  return {
    folders: [...baseFolders(), markup, rtl, bidi, long],
    smbShares: [smbShare(SERVICES_SHARES.photos, markup.uuid)],
    smbOn: true,
    config: {
      nfs: NFS_ON(),
      nfsShares: [
        nfsShare(1, markup.uuid, "<img src=x onerror=alert(1)>", "rw", {
          comment: "<b>set in the classic interface</b>",
        }),
        nfsShare(2, rtl.uuid, "192.0.2.10", "ro", { comment: "מחשב הסלון" }),
        nfsShare(3, long.uuid, LONG_HOST, "ro"),
      ],
      exports: {},
      rsyncd: RSYNCD_ON(),
      modules: [
        module(1, rtl.uuid, RTL_MODULE, { comment: LONG_NOTE }),
        module(2, markup.uuid, "<script>alert(1)</script>", {
          comment: '<img src=x onerror="alert(1)">',
          authusers: true,
          users: [{ name: "\u202Ecopier", password: EXAMPLE_PASSWORD }],
        }),
      ],
      jobs: [
        localJob(uuid(0x5101), rtl.uuid, long.uuid, { comment: LONG_NOTE }),
        pushJob(
          uuid(0x5102),
          bidi.uuid,
          `backup@${LONG_HOST}:/srv/\u202Ecopies/`,
          { comment: "גיבוי לילי" },
        ),
        pullJob(
          uuid(0x5103),
          `rsync://<b>copier</b>@${LONG_HOST}/photos/`,
          markup.uuid,
        ),
      ],
    },
    keys: [{ ...KEY, comment: "<b>key</b> \u202Eyek" }],
  };
}

function manyStory(): Story {
  const refs = [ENTRY.sda1, ENTRY.sdd1, ENTRY.tank];
  const many = Array.from({ length: 200 }, (_, i) =>
    folder(
      uuid(0x1200 + i),
      `folder-${pad(i + 1, 3)}`,
      refs[i % 3] ?? ENTRY.sda1,
    ),
  );
  const nfsShares = many.flatMap((f, i) => [
    nfsShare(2 * i + 1, f.uuid, `192.0.2.${String((i % 250) + 1)}`, "rw"),
    nfsShare(2 * i + 2, f.uuid, "192.0.2.0/24", "ro"),
  ]);
  const jobs = Array.from({ length: 1000 }, (_, i) => {
    const src = many[i % 200]?.uuid ?? SERVICES_FOLDERS.photos;
    const dest = many[(i + 1) % 200]?.uuid ?? SERVICES_FOLDERS.backup;
    const id = uuid(0x5200 + i);
    const over: Partial<StoredJob> = {
      comment: i % 3 === 0 ? `Copy job ${pad(i + 1, 4)}` : "",
      minute: String(i % 60),
      hour: String(i % 24),
      enable: i % 7 !== 0,
    };
    switch (i % 4) {
      case 1:
        return pushJob(
          id,
          src,
          `backup@backup.example.org:/srv/copies/job-${pad(i + 1, 4)}/`,
          over,
        );
      case 2:
        return pullJob(
          id,
          `rsync://backup.example.org/copies/job-${pad(i + 1, 4)}/`,
          dest,
          over,
        );
      default:
        return localJob(id, src, dest, over);
    }
  });
  return {
    folders: [...baseFolders(), ...many],
    smbShares: [],
    smbOn: true,
    config: { ...emptyConfig(), nfs: NFS_ON(), nfsShares, jobs },
    keys: [clone(KEY)],
  };
}

function storyOf(name: ServicesScenarioName): Story {
  const F = SERVICES_FOLDERS;
  const some = (): Story => ({
    folders: baseFolders(),
    smbShares: [smbShare(SERVICES_SHARES.photos, F.photos)],
    smbOn: true,
    config: someConfig(),
    keys: [clone(KEY)],
  });
  switch (name) {
    case "servicesNone":
      return {
        folders: baseFolders(),
        smbShares: [],
        smbOn: false,
        config: emptyConfig(),
        keys: [],
      };
    case "servicesSome":
    case "servicesDown":
    case "servicesNoSshList":
    case "jobsPending":
      return some();
    case "servicesRoot": {
      const story = some();
      story.config.nfsShares = [
        nfsShare(1, F.media, "192.0.2.10", "rw", {
          extraoptions: "no_root_squash,subtree_check,insecure",
        }),
        nfsShare(2, F.media, "*.example.org", "rw", {
          extraoptions: "all_squash,anonuid=1000,anongid=100,sync",
          comment: "Set in the classic interface",
        }),
        nfsShare(3, F.backup, "2001:db8::/32", "ro"),
      ];
      return story;
    }
    case "jobsDeleting": {
      const story = some();
      story.config.jobs = [
        localJob(uuid(0x5021), F.media, F.backup, {
          comment: "Media to Backup, deleting",
          optiondelete: true,
        }),
        localJob(uuid(0x5022), F.photos, F.backup, {
          extraoptions: "--delete-after --exclude=.recycle",
        }),
        pushJob(
          uuid(0x5023),
          F.documents,
          "backup@backup.example.org:/srv/copies/documents/",
          { extraoptions: "--remove-source-files" },
        ),
        localJob(uuid(0x5024), F.photos, F.media, {
          comment: "Photos into Media, trial only",
          optiondelete: true,
          optiondryrun: true,
          enable: false,
        }),
      ];
      return story;
    }
    case "jobsCustomSchedule": {
      const story = some();
      story.config.jobs = [
        localJob(uuid(0x5031), F.media, F.backup, {
          comment: "Twice a day on weekdays",
          minute: "0,30",
          hour: "1,13",
          dayofweek: "1,3,5",
        }),
        localJob(uuid(0x5032), F.photos, F.backup, {
          comment: "Every 6 hours",
          minute: "15",
          hour: "6",
          everynhour: true,
        }),
        localJob(uuid(0x5033), F.documents, F.backup, {
          comment: "Every 10 minutes",
          minute: "10",
          everynminute: true,
          hour: "*",
        }),
        localJob(uuid(0x5034), F.media, F.photos, {
          comment: "Sundays",
          minute: "30",
          hour: "4",
          dayofweek: "7",
        }),
        localJob(uuid(0x5035), F.photos, F.media, {
          comment: "Only when started",
          enable: false,
        }),
        localJob(uuid(0x5036), F.documents, F.media, {
          comment: "Day 31 or Mondays, in some months",
          minute: "5",
          hour: "2",
          dayofmonth: "1,15,31",
          month: "1,4,7,10",
          dayofweek: "1",
        }),
      ];
      return story;
    }
    case "jobsRun": {
      const story = some();
      story.config.jobs = [
        localJob(SERVICES_JOBS.big, F.photos, F.backup, {
          comment: "Photos to Backup",
        }),
        pushJob(
          SERVICES_JOBS.hostKey,
          F.photos,
          "backup@backup.example.org:/srv/copies/photos/",
        ),
        localJob(SERVICES_JOBS.atOnce, F.documents, F.backup, {
          comment: "Documents to Backup",
        }),
        localJob(SERVICES_JOBS.long, F.media, F.backup, {
          comment: "Media to Backup (large)",
        }),
      ];
      return story;
    }
    case "jobsTrial":
    case "jobsAddFails":
    case "jobsAddFailsCheck":
    case "jobsAddFailsSave":
    case "jobsAddFailsApply":
    case "jobsAddFailsTrial":
    case "jobsAddFailsTurnOn":
    case "jobsAddFailsTurnOnApply":
    case "jobsAddFailsCut": {
      const story = some();
      story.config.jobs = [];
      return story;
    }
    case "jobsMany":
      return manyStory();
    case "jobsBroken": {
      const story = some();
      story.config.jobs.push(
        localJob(uuid(0x5041), GONE_FOLDER, F.backup, {
          comment: "Old folder to Backup",
        }),
      );
      return story;
    }
    case "modulesMany": {
      const story = some();
      story.config.modules.push(
        module(3, F.backup, "archive", {
          readonly: true,
          hostsallow: "192.0.2.0/24",
          authusers: true,
          users: [
            { name: "alex", password: EXAMPLE_PASSWORD },
            { name: "robin", password: EXAMPLE_PASSWORD },
            { name: "sam", password: EXAMPLE_PASSWORD },
          ],
        }),
      );
      return story;
    }
    case "recycleBin":
      return {
        folders: baseFolders(),
        smbShares: [
          smbShare(SERVICES_SHARES.photos, F.photos, {
            recyclebin: true,
            recyclemaxage: 30,
          }),
          smbShare(SERVICES_SHARES.media, F.media, {
            recyclebin: true,
            recyclemaxage: 0,
          }),
          smbShare(SERVICES_SHARES.backup, F.backup),
        ],
        smbOn: true,
        config: emptyConfig(),
        keys: [],
      };
    case "servicesHostile":
      return hostileStory();
  }
}

const dirKey = (f: Pick<MockFolder, "mntentref" | "reldirpath">) =>
  `${f.mntentref}|${f.reldirpath}`;

export function newServicesMockState(
  name: ServicesScenarioName,
): ServicesMockState {
  const story = storyOf(name);
  const base = newSharesMockState("sharesSome");
  const entries = base.entries.map((e) =>
    e.uuid === ENTRY.sdb1 ? { ...e, fs: { ...e.fs, mounted: false } } : e,
  );
  const smb = {
    folders: story.folders,
    shares: story.smbShares,
    settings: clone(story.smbOn ? SMB_ON : SMB_OFF),
  };
  const shares: SharesMockState = {
    ...base,
    host: "nas",
    config: smb,
    applied: clone(smb),
    entries,
    dirs: story.folders.filter((f) => f.reldirpath !== "/").map(dirKey),
  };
  const config = story.config;
  // Each folder with an NFS entry has its bind mount under /export.
  let mounts = 0x3000;
  for (const s of config.nfsShares) {
    config.exports[s.sharedfolderref] ??= uuid(++mounts);
    s.mntentref = config.exports[s.sharedfolderref] ?? "";
  }
  const applied = clone(config);
  if (name === "jobsPending") {
    // A change to the local job saved and not applied: rsync is pending.
    const job = config.jobs.find((j) => j.uuid === SERVICES_JOBS.local);
    if (job !== undefined) {
      job.hour = "4";
      job.comment = "Media to Backup, at 04:00";
    }
  }
  const state: ServicesMockState = {
    name,
    shares,
    config,
    applied,
    pending: [...servicesStartsPending(name)],
    keys: story.keys,
    tasks: new Map(),
    made: 0x8000,
    started: 0,
    newJobs: 0,
    armed: null,
    checkFired: false,
  };
  markUsed(state);
  return state;
}

// ---- Reading the state ---------------------------------------------------------------------------

const folderOf = (state: ServicesMockState, id: string) =>
  state.shares.config.folders.find((f) => f.uuid === id);

/** A folder is in use (OMV's `_used`) while an NFS entry, rsync server folder or copy job refers to it. */
function markUsed(state: ServicesMockState): void {
  const used = new Set<string>([
    ...state.config.nfsShares.map((s) => s.sharedfolderref),
    ...state.config.modules.map((m) => m.sharedfolderref),
    ...state.config.jobs.flatMap((j) => [
      j.src.sharedfolderref,
      j.dest.sharedfolderref,
    ]),
  ]);
  for (const f of state.shares.config.folders) {
    if (used.has(f.uuid)) {
      f.usedElsewhere = true;
    } else {
      delete f.usedElsewhere;
    }
  }
}

/** OMV's getlist: search over every field, sort on a top-level field, then the page. */
function paged<T>(rows: T[], params: unknown): { total: number; data: T[] } {
  const search = text(params, "search").toLowerCase();
  let list =
    search === ""
      ? rows
      : rows.filter((r) => JSON.stringify(r).toLowerCase().includes(search));
  const field = text(params, "sortfield");
  if (field !== "") {
    const dir = text(params, "sortdir") === "desc" ? -1 : 1;
    list = [...list].sort((a, b) => {
      const x = String((a as Record<string, unknown>)[field] ?? "");
      const y = String((b as Record<string, unknown>)[field] ?? "");
      return x < y ? -dir : x > y ? dir : 0;
    });
  }
  const start = Number(param(params, "start") ?? 0) || 0;
  const limit = param(params, "limit");
  const data =
    typeof limit === "number"
      ? list.slice(start, start + limit)
      : list.slice(start);
  return { total: list.length, data };
}

/** The job's shared-folder sides, as its type and mode use them. */
const jobFolders = (j: StoredJob): string[] =>
  j.type === "local"
    ? [j.src.sharedfolderref, j.dest.sharedfolderref]
    : j.mode === "push"
      ? [j.src.sharedfolderref]
      : [j.dest.sharedfolderref];

/** Rsync.get's reply: the stored job, the schedule as lists, the flattened sides that apply. */
function jobGet(j: StoredJob) {
  const list = (value: string) => value.split(",");
  return {
    ...clone(j),
    minute: list(j.minute),
    hour: list(j.hour),
    dayofmonth: list(j.dayofmonth),
    month: list(j.month),
    dayofweek: list(j.dayofweek),
    ...(j.type === "local" || j.mode === "push"
      ? { srcsharedfolderref: j.src.sharedfolderref }
      : { srcuri: j.src.uri }),
    ...(j.type === "local" || j.mode === "pull"
      ? { destsharedfolderref: j.dest.sharedfolderref }
      : { desturi: j.dest.uri }),
  };
}

/** The stored module in OMV's stored shape: the sign-ins under `users.user`. */
const moduleStored = (m: StoredModule) => ({
  ...clone(m),
  users: { user: clone(m.users) },
});

/** Whether a job deletes at its destination: the option, or an extra option starting --del (0.6). */
export const jobDeletes = (j: StoredJob): boolean =>
  j.optiondelete || /(^|\s)--del/.test(j.extraoptions);
/** Whether a job only tries: the option, or --dry-run or -n in its extra options (0.6). */
export const jobTries = (j: StoredJob): boolean =>
  j.optiondryrun || /(^|\s)(--dry-run|-n)(\s|$)/.test(j.extraoptions);

// ---- The task outputs ----------------------------------------------------------------------------

/** Lines split into chunks of `per` lines each, as polls deliver them. */
function chunked(lines: readonly string[], per: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += per) {
    out.push(
      lines
        .slice(i, i + per)
        .map((l) => `${l}\n`)
        .join(""),
    );
  }
  return out;
}

interface Plan {
  chunks: string[];
  /** The exit code and the failure: the last poll fails with the command and the whole output. */
  exit?: number;
  /** The chunk after which the task is held until it is stopped. */
  holdAfter?: number;
}

/** A side's place in the output: a folder's absolute path, or the other computer's address. */
function placeOf(state: ServicesMockState, ref: string, uri: string): string {
  if (uri !== "") {
    return uri;
  }
  const f = folderOf(state, ref);
  const fs = state.shares.entries.find((e) => e.uuid === f?.mntentref)?.fs;
  return `${fs?.mountpoint ?? "/srv/missing"}/${f?.reldirpath ?? ""}`;
}

const HOSTILE_LINES = [
  "\u001b[1;31mphotos/\u202Egpj.exe\u001b[0m",
  "<script>alert(1)</script>.txt",
  "תמונות/חופשה.jpg",
  "\u2066isolated\u2069 and \u200Fmarked\u200E.txt",
];

/** What a run of the job writes, and how it ends (design 0.6, 7.3). */
function runPlan(
  state: ServicesMockState,
  j: StoredJob,
  failTrial: boolean,
): Plan {
  const src = placeOf(state, j.src.sharedfolderref, j.src.uri);
  const dest = placeOf(state, j.dest.sharedfolderref, j.dest.uri);
  const header = [`Please wait, syncing <${src}> to <${dest}> ...`, ""];
  // A failed run ends with the script's "[ERROR] The synchronisation failed." (captured).
  const fail = (lines: string[], exit: number): Plan => ({
    chunks: chunked(
      [...header, ...lines, "[ERROR] The synchronisation failed."],
      50,
    ),
    exit,
  });
  // The script checks the shared folders' mounts first (execGetOutput.rsyncNotMountedFailed).
  for (const [which, ref] of [
    ["Source", j.src.sharedfolderref],
    ["Destination", j.dest.sharedfolderref],
  ] as const) {
    const f = ref === "" ? undefined : folderOf(state, ref);
    const fs = state.shares.entries.find((e) => e.uuid === f?.mntentref)?.fs;
    if (f !== undefined && fs !== undefined && !fs.mounted) {
      return {
        chunks: chunked(
          [
            `[ERROR] ${which} storage device not mounted at <${fs.mountpoint}/>!`,
          ],
          50,
        ),
        exit: 1,
      };
    }
  }
  const dry = jobTries(j);
  const deletes = jobDeletes(j);
  const destName =
    j.dest.uri === ""
      ? folderOf(state, j.dest.sharedfolderref)?.name
      : undefined;
  // As execGetOutput.rsyncHostKeyFailed (captured).
  const hostKey = [
    "Host key verification failed.",
    "rsync: connection unexpectedly closed (0 bytes received so far) [sender]",
    "rsync error: unexplained error (code 255) at io.c(285) [sender=3.5.0]",
  ];
  // As execGetOutput.rsyncWrongPasswordFailed (captured), for a job through an rsync server.
  const authFailed = (uri: string) => [
    `@ERROR: auth failed on module ${/^rsync:\/\/[^/]+\/([^/]+)/.exec(uri)?.[1] ?? ""}`,
    "rsync error: error starting client-server protocol (code 5) at main.c(1954) [Receiver=3.5.0]",
  ];
  // Written by hand in rsync's words: the destination refuses the copy.
  const denied = [
    `rsync: [Receiver] mkdir "${dest}" failed: Permission denied (13)`,
    "rsync error: error in file IO (code 11) at main.c(791) [Receiver=3.5.0]",
  ];
  /** The trial's failure: the host key over SSH, the sign-in through an rsync server, else access. */
  const trialFailure = (): Plan =>
    j.authentication === "pubkey"
      ? fail(hostKey, 255)
      : j.type === "remote"
        ? fail(authFailed(j.mode === "pull" ? j.src.uri : j.dest.uri), 5)
        : fail(denied, 11);
  if (failTrial) {
    return trialFailure();
  }
  if (state.name === "jobsRun") {
    switch (j.uuid) {
      case SERVICES_JOBS.hostKey:
        return fail(hostKey, 255);
      case SERVICES_JOBS.atOnce:
        return { chunks: [], exit: 1 };
      case SERVICES_JOBS.big: {
        // 30,000 lines in all: the header, the list, rsync's summary and the script's last line.
        const files = Array.from(
          { length: 30_000 - 8 },
          (_, i) =>
            `photos/${pad(Math.floor(i / 100), 3)}/IMG_${pad(i, 5)}.jpg`,
        );
        return {
          chunks: chunked(
            [
              ...header,
              "sending incremental file list",
              "./",
              ...files,
              "",
              "sent 92,341,778 bytes  received 571,034 bytes  1,523,816.59 bytes/sec",
              "total size is 92,110,233  speedup is 1.00",
              "The synchronisation has completed successfully.",
            ],
            1_500,
          ),
        };
      }
      case SERVICES_JOBS.long: {
        const files = Array.from(
          { length: 400 },
          (_, i) => `films/${pad(i, 4)}.mkv`,
        );
        const chunks = chunked(
          [...header, "sending incremental file list", "./", ...files],
          100,
        );
        return {
          chunks: [
            ...chunks,
            ...chunked(
              [
                "",
                "sent 412,334,901,234 bytes  received 9,102 bytes  98,233,113.12 bytes/sec",
                "total size is 412,300,112,334  speedup is 1.00",
                "The synchronisation has completed successfully.",
              ],
              10,
            ),
          ],
          holdAfter: chunks.length,
        };
      }
    }
  }
  let deletions = [
    "old-dir/deeper/older.txt",
    "old-dir/deeper/",
    "old-dir/old.txt",
    "old-dir/",
    "only-here.txt",
  ];
  let copies = [
    "./",
    "one.txt",
    "readme.txt",
    "two.txt",
    "open/",
    "sub/",
    "sub/three.txt",
  ];
  if (state.name === "jobsTrial" && dry) {
    if (destName === "Backup") {
      deletions = Array.from(
        { length: 12 },
        (_, i) => `old-copies/file-${pad(i + 1, 2)}.txt`,
      );
      copies = [
        "./",
        ...Array.from({ length: 20 }, (_, i) => `new-${pad(i + 1, 2)}.txt`),
      ];
    } else if (destName === "Media") {
      deletions = [];
    } else {
      return trialFailure();
    }
  }
  if (state.name === "servicesHostile") {
    copies = [...copies, ...HOSTILE_LINES];
  }
  const listed = j.optionquiet
    ? []
    : [
        j.type === "remote" && j.mode === "pull"
          ? "receiving incremental file list"
          : "sending incremental file list",
        ...(deletes ? deletions.map((d) => `deleting ${d}`) : []),
        ...copies,
        "",
        "sent 236 bytes  received 122 bytes  716.00 bytes/sec",
        `total size is 40  speedup is 0.11${dry ? " (DRY RUN)" : ""}`,
      ];
  return {
    chunks: chunked(
      [...header, ...listed, "The synchronisation has completed successfully."],
      4,
    ),
  };
}

/**
 * What emptying a share's recycle bin writes, in the shape of the captured runs: the script's "Please
 * wait, empty recyle bin of <...> ..." (OMV's spelling), then GNU rm's own lines
 * (execGetOutput.emptyRecycleBinFinished); only the first line when the bin is empty, as Media's is
 * in recycleBin (emptyRecycleBinNothingFinished). Without SMB on and the share's bin on, as last
 * applied, the script does not exist (emptyRecycleBinBinOffFailed, emptyRecycleBinSmbOffFailed).
 */
function recyclePlan(state: ServicesMockState, share: SmbShare): Plan {
  const settings = state.shares.applied.settings;
  const applied = state.shares.applied.shares.find(
    (s) => s.uuid === share.uuid,
  );
  if (!settings.enable || applied?.recyclebin !== true) {
    return {
      chunks: chunked(
        [`/bin/sh: 1: ${recycleScriptPath(share.uuid)}: not found`],
        10,
      ),
      exit: 127,
    };
  }
  const place = placeOf(state, share.sharedfolderref, "");
  const first = `Please wait, empty recyle bin of <${place}> ...`;
  if (share.uuid === SERVICES_SHARES.media) {
    return { chunks: chunked([first], 1) };
  }
  const bin = `${place}.recycle`;
  return {
    chunks: chunked(
      [
        first,
        `removed '${bin}/alex/docs/d.txt'`,
        `removed directory '${bin}/alex/docs'`,
        `removed '${bin}/alex/c.txt'`,
        `removed '${bin}/alex/b.txt'`,
        `removed directory '${bin}/alex'`,
        `removed '${bin}/sam/draft.odt'`,
        `removed directory '${bin}/sam'`,
      ],
      2,
    ),
  };
}

function startTask(
  state: ServicesMockState,
  ref: string,
  plan: Plan,
  script: string,
): string {
  state.started += 1;
  const handle = `${TASK_PREFIX}${pad(state.started, 6)}`;
  const bounds: number[] = [];
  let output = "";
  let holdAt: number | undefined;
  plan.chunks.forEach((chunk, i) => {
    output += chunk;
    bounds.push(output.length);
    if (plan.holdAfter === i + 1) {
      holdAt = output.length;
    }
  });
  state.tasks.set(handle, {
    handle,
    ref,
    output,
    bounds,
    ...(plan.exit === undefined
      ? {}
      : { failure: commandFailed(script, plan.exit, output.trimEnd()) }),
    ...(holdAt === undefined ? {} : { holdAt }),
    held: 0,
    state: "running",
  });
  return handle;
}

const isOwnHandle = (handle: unknown): handle is string =>
  typeof handle === "string" && handle.startsWith(TASK_PREFIX);

/**
 * Exec.getOutput for this mock's tasks: what was written since `pos`, one chunk per poll; the last
 * poll reports `running: false`, or fails with the command and the whole output. A stopped or finished
 * task's handle is gone (execGetOutput.rsyncStopped, captured). Undefined for any other handle.
 */
export function servicesTaskOutput(
  state: ServicesMockState,
  params: unknown,
): FixedAnswer | undefined {
  const handle = param(params, "filename");
  if (!isOwnHandle(handle)) {
    return undefined;
  }
  const task = state.tasks.get(handle);
  if (task === undefined || task.state !== "running") {
    return fail(500, SERVICES_MSG.gone(handle));
  }
  const pos = Math.max(0, int(params, "pos", 0));
  const reply = (end: number, running: boolean) =>
    ok({
      filename: handle,
      pos: end,
      output: task.output.slice(pos, end),
      pendingOutput: false,
      running,
    });
  if (
    task.holdAt !== undefined &&
    pos >= task.holdAt &&
    task.held < HOLD_POLLS
  ) {
    task.held += 1;
    return reply(pos, true);
  }
  const end = task.bounds.find((b) => b > pos) ?? task.output.length;
  if (end < task.output.length) {
    return reply(end, true);
  }
  if (task.failure !== undefined) {
    // The last of the output first, then the failure on the next poll.
    if (end > pos) {
      return reply(end, true);
    }
    task.state = "gone";
    return fail(500, task.failure);
  }
  task.state = "gone";
  return reply(end, false);
}

/** Exec.isRunning for this mock's tasks; undefined for any other handle. */
export function servicesTaskRunning(
  state: ServicesMockState,
  params: unknown,
): FixedAnswer | undefined {
  const handle = param(params, "filename");
  if (!isOwnHandle(handle)) {
    return undefined;
  }
  const task = state.tasks.get(handle);
  if (task === undefined || task.state === "gone") {
    return fail(500, SERVICES_MSG.gone(handle));
  }
  return ok({ filename: handle, running: task.state === "running" });
}

/** Exec.stop for this mock's tasks: the task ends where it is; undefined for any other handle. */
export function servicesTaskStop(
  state: ServicesMockState,
  params: unknown,
): FixedAnswer | undefined {
  const handle = param(params, "filename");
  if (!isOwnHandle(handle)) {
    return undefined;
  }
  const task = state.tasks.get(handle);
  if (task === undefined || task.state === "gone") {
    return fail(500, SERVICES_MSG.gone(handle));
  }
  task.state = "stopped";
  return ok(null);
}

/**
 * Before System.getInformation or Config.isDirty answers: in jobsAddFailsCheck, the first read at least
 * CHECK_FAILS_AFTER_MS after the shared folders were first read finds another administrator's change
 * to SMB pending, so the add flow's check (5.6, step 1) finds new pending changes. Once.
 */
export function servicesInformationRead(
  state: ServicesMockState,
  hooks: { dirty: (modules: readonly ServicesModule[]) => void },
  now = Date.now(),
): void {
  if (
    state.name !== "jobsAddFailsCheck" ||
    state.checkFired ||
    state.firstFolderRead === undefined ||
    now - state.firstFolderRead < CHECK_FAILS_AFTER_MS
  ) {
    return;
  }
  state.checkFired = true;
  const modules = ["samba", "avahi"] as const;
  for (const m of modules) {
    if (!state.pending.includes(m)) {
      state.pending.push(m);
    }
  }
  hooks.dirty(modules);
}

// ---- The answers ---------------------------------------------------------------------------------

interface Call {
  params: unknown;
}
export type ServicesReply = (call: Call) => FixedAnswer;

export const SERVICES_OPERATIONS = [
  // The shares mock's, with the folders' use marked first.
  "shareMgmtGetList",
  "shareMgmtGetCandidates",
  "shareMgmtSet",
  "shareMgmtSetPrivileges",
  "shareMgmtDelete",
  "userMgmtGetUserList",
  "userMgmtGetGroupList",
  "smbGetSettings",
  "smbSetSettings",
  "smbGetShareList",
  "smbSetShare",
  "smbDeleteShare",
  "fileSystemMgmtGetList",
  // This mock's own.
  "servicesGetStatus",
  "emailNotificationGet",
  "nfsGetStats",
  "nfsGetSettings",
  "nfsSetSettings",
  "nfsGetShareList",
  "nfsGetShare",
  "nfsSetShare",
  "nfsDeleteShare",
  "rsyncdGetSettings",
  "rsyncdSetSettings",
  "rsyncdGetModuleList",
  "rsyncdGetModule",
  "rsyncdSetModule",
  "rsyncdDeleteModule",
  "rsyncGetList",
  "rsyncGet",
  "rsyncSet",
  "rsyncDelete",
  "rsyncExecute",
  "smbGetShare",
  "smbEmptyRecycleBin",
  "certificateMgmtGetSshList",
] as const;
export type ServicesOperation = (typeof SERVICES_OPERATIONS)[number];

/** The shares mock's operations this mock passes on. */
type SharedOperation = Exclude<
  ServicesOperation,
  | "servicesGetStatus"
  | "emailNotificationGet"
  | `nfs${string}`
  | `rsync${string}`
  | "smbGetShare"
  | "smbEmptyRecycleBin"
  | "certificateMgmtGetSshList"
>;

/** Whether a service runs now: on as last applied, and not kept down by the story. */
export function servicesRunning(
  state: ServicesMockState,
  service: "nfs" | "rsyncd",
): boolean {
  const on =
    service === "nfs" ? state.applied.nfs.enable : state.applied.rsyncd.enable;
  return on && state.name !== "servicesDown";
}

/**
 * The remembering answers of a services story. `dirty` receives the modules a write marks pending,
 * which the caller adds to what System.getInformation and Config.isDirty report.
 */
export function servicesAnswers(
  state: ServicesMockState,
  hooks: { dirty: (modules: readonly ServicesModule[]) => void },
): Record<ServicesOperation, ServicesReply> {
  const dirty = (modules: readonly ServicesModule[]) => {
    for (const m of modules) {
      if (!state.pending.includes(m)) {
        state.pending.push(m);
      }
    }
    hooks.dirty(modules);
  };
  const isPending = (m: ServicesModule) => state.pending.includes(m);
  const newUuid = () => uuid(++state.made);
  const shares = sharesAnswers(state.shares, {
    dirty: (modules: readonly SharesModule[]) => dirty(modules),
  });
  /** A shares answer, after the folders' use is marked. */
  const passed =
    (operationId: SharedOperation): ServicesReply =>
    (call) => {
      markUsed(state);
      return shares[operationId](call);
    };
  const gone = (refs: readonly string[]) =>
    refs.find((r) => r !== "" && folderOf(state, r) === undefined);

  const own = {
    shareMgmtGetList: (call: Call) => {
      state.firstFolderRead ??= Date.now();
      return passed("shareMgmtGetList")(call);
    },

    servicesGetStatus: () => {
      const data = SERVICES.map((s) => {
        switch (s.name) {
          case "nfs":
          case "rsyncd": {
            const enabled =
              s.name === "nfs"
                ? state.applied.nfs.enable
                : state.applied.rsyncd.enable;
            return { ...s, enabled, running: servicesRunning(state, s.name) };
          }
          case "samba":
            return {
              ...s,
              enabled: state.shares.applied.settings.enable,
              running: sharesSmbRunning(state.shares),
            };
          default:
            return { ...s };
        }
      });
      return ok({ total: data.length, data });
    },

    emailNotificationGet: () =>
      ok(
        clone(
          state.name === "servicesNone"
            ? CONTRACT_EXAMPLES.emailNotificationGet.notConfigured.value
            : CONTRACT_EXAMPLES.emailNotificationGet.configured.value,
        ),
      ),

    // ---- NFS ----

    nfsGetStats: () => {
      if (isPending("nfs")) {
        return fail(500, SERVICES_MSG.pending);
      }
      if (!servicesRunning(state, "nfs")) {
        return ok("Service disabled");
      }
      // In the shape of nfsGetStats.exports (hand-written there too): one line per folder.
      const lines = Object.entries(state.applied.exports).map(([ref]) => {
        const clients = state.applied.nfsShares
          .filter((s) => s.sharedfolderref === ref)
          .map(
            (s) =>
              `${s.client}(sync,wdelay,hide,sec=sys,${s.options},secure,root_squash,no_all_squash)`,
          );
        return `/export/${folderOf(state, ref)?.name ?? ""} \t${clients.join(" ")}`;
      });
      return ok(lines.join("\n"));
    },

    nfsGetSettings: () => {
      const { nfs, nfsShares } = state.config;
      // As nfsGetSettings.on and .off (captured): every share under `shares`, "" when none.
      return ok({
        enable: nfs.enable,
        versions: [...nfs.versions],
        shares: nfsShares.length === 0 ? "" : { share: clone(nfsShares) },
      });
    },

    nfsSetSettings: ({ params }: Call) => {
      const versions = param(params, "versions");
      state.config.nfs = {
        enable: flag(params, "enable"),
        versions: Array.isArray(versions) ? versions.map(String) : [],
      };
      dirty(["nfs", "avahi"]);
      // As nfsSetSettings.turnedOn (captured): the versions as stored, one comma-separated string.
      return ok({
        enable: state.config.nfs.enable,
        versions: state.config.nfs.versions.join(","),
      });
    },

    nfsGetShareList: ({ params }: Call) => {
      const missing = gone(
        state.config.nfsShares.map((s) => s.sharedfolderref),
      );
      if (missing !== undefined) {
        return fail(500, SERVICES_MSG.folderGone(missing));
      }
      return ok(
        paged(
          state.config.nfsShares.map((s) => ({
            ...clone(s),
            sharedfoldername: folderOf(state, s.sharedfolderref)?.name ?? "",
          })),
          params,
        ),
      );
    },

    nfsGetShare: ({ params }: Call) => {
      const id = text(params, "uuid");
      const found = state.config.nfsShares.find((s) => s.uuid === id);
      return found === undefined
        ? fail(500, SERVICES_MSG.notFound("conf.service.nfs.share", id))
        : ok(clone(found));
    },

    nfsSetShare: ({ params }: Call) => {
      const id = text(params, "uuid");
      const ref = text(params, "sharedfolderref");
      const extraoptions = text(params, "extraoptions");
      if (
        !/^(([a-zA-Z_]+)(=([\w@:/]+))?[,])*([a-zA-Z_]+)(=([\w@:/]+))?$/.test(
          extraoptions,
        )
      ) {
        return fail(500, SERVICES_MSG.extraOptions(extraoptions));
      }
      const sent: StoredNfsShare = {
        uuid: id,
        sharedfolderref: ref,
        mntentref: text(params, "mntentref"),
        client: text(params, "client"),
        options: text(params, "options"),
        extraoptions,
        comment: text(params, "comment"),
      };
      if (id === NEW_OBJECT) {
        const f = folderOf(state, ref);
        if (f === undefined) {
          return fail(500, SERVICES_MSG.folderGone(ref));
        }
        if (f.reldirpath.includes(" ")) {
          return fail(500, SERVICES_MSG.blankInPath(f.name));
        }
        // OMV ignores the mntentref sent and uses, or makes, the folder's bind mount under /export.
        const first = state.config.exports[ref] === undefined;
        const mount = state.config.exports[ref] ?? newUuid();
        state.config.exports[ref] = mount;
        const made = { ...sent, uuid: newUuid(), mntentref: mount };
        state.config.nfsShares.push(made);
        dirty(first ? NFS_MOUNT_MODULES : ["nfs", "avahi"]);
        return ok(clone(made));
      }
      const index = state.config.nfsShares.findIndex((s) => s.uuid === id);
      if (index < 0) {
        return fail(500, SERVICES_MSG.notFound("conf.service.nfs.share", id));
      }
      state.config.nfsShares[index] = sent;
      dirty(["nfs"]);
      return ok(clone(sent));
    },

    nfsDeleteShare: ({ params }: Call) => {
      const id = text(params, "uuid");
      const found = state.config.nfsShares.find((s) => s.uuid === id);
      if (found === undefined) {
        return fail(500, SERVICES_MSG.notFound("conf.service.nfs.share", id));
      }
      state.config.nfsShares = state.config.nfsShares.filter(
        (s) => s.uuid !== id,
      );
      const last = !state.config.nfsShares.some(
        (s) => s.sharedfolderref === found.sharedfolderref,
      );
      if (last) {
        state.config.exports = Object.fromEntries(
          Object.entries(state.config.exports).filter(
            ([ref]) => ref !== found.sharedfolderref,
          ),
        );
      }
      dirty(last ? NFS_MOUNT_MODULES : ["nfs", "avahi"]);
      // As nfsDeleteShare.removed (captured): an empty array.
      return ok([]);
    },

    // ---- The rsync server ----

    rsyncdGetSettings: () => ok(clone(state.config.rsyncd)),

    rsyncdSetSettings: ({ params }: Call) => {
      state.config.rsyncd = {
        enable: flag(params, "enable"),
        port: int(params, "port", state.config.rsyncd.port),
        extraoptions: text(params, "extraoptions"),
      };
      dirty(["rsyncd", "avahi"]);
      return ok(clone(state.config.rsyncd));
    },

    rsyncdGetModuleList: ({ params }: Call) =>
      ok(
        paged(
          state.config.modules.map((m) => ({
            ...clone(m),
            sharedfoldername: folderOf(state, m.sharedfolderref)?.name ?? "",
          })),
          params,
        ),
      ),

    rsyncdGetModule: ({ params }: Call) => {
      const id = text(params, "uuid");
      const found = state.config.modules.find((m) => m.uuid === id);
      return found === undefined
        ? fail(500, SERVICES_MSG.notFound("conf.service.rsyncd.module", id))
        : ok(clone(found));
    },

    rsyncdSetModule: ({ params }: Call) => {
      const id = text(params, "uuid");
      const name = text(params, "name");
      const users = param(params, "users");
      const sent: StoredModule = {
        uuid: id,
        enable: flag(params, "enable"),
        sharedfolderref: text(params, "sharedfolderref"),
        uid: text(params, "uid"),
        gid: text(params, "gid"),
        name,
        comment: text(params, "comment"),
        readonly: flag(params, "readonly"),
        writeonly: flag(params, "writeonly"),
        maxconnections: int(params, "maxconnections", 0),
        list: flag(params, "list"),
        hostsallow: text(params, "hostsallow"),
        hostsdeny: text(params, "hostsdeny"),
        extraoptions: text(params, "extraoptions"),
        authusers: flag(params, "authusers"),
        usechroot: flag(params, "usechroot"),
        // Stored as received, the password included.
        users: Array.isArray(users)
          ? users.map((u) => ({
              name: text(u, "name"),
              password: text(u, "password"),
            }))
          : [],
      };
      if (id === NEW_OBJECT) {
        if (state.config.modules.some((m) => m.name === name)) {
          return fail(500, SERVICES_MSG.moduleNameTaken(name));
        }
        const made = { ...sent, uuid: newUuid() };
        state.config.modules.push(made);
        dirty(["rsyncd"]);
        return ok(moduleStored(made));
      }
      const index = state.config.modules.findIndex((m) => m.uuid === id);
      if (index < 0) {
        return fail(
          500,
          SERVICES_MSG.notFound("conf.service.rsyncd.module", id),
        );
      }
      state.config.modules[index] = sent;
      dirty(["rsyncd"]);
      return ok(moduleStored(sent));
    },

    rsyncdDeleteModule: ({ params }: Call) => {
      const id = text(params, "uuid");
      const found = state.config.modules.find((m) => m.uuid === id);
      if (found === undefined) {
        return fail(
          500,
          SERVICES_MSG.notFound("conf.service.rsyncd.module", id),
        );
      }
      state.config.modules = state.config.modules.filter((m) => m.uuid !== id);
      dirty(["rsyncd"]);
      return ok(moduleStored(found));
    },

    // ---- Copy jobs ----

    rsyncGetList: ({ params }: Call) => {
      const missing = gone(state.config.jobs.flatMap(jobFolders));
      if (missing !== undefined) {
        return fail(500, SERVICES_MSG.folderGone(missing));
      }
      const nameOf = (side: Side) =>
        side.uri !== ""
          ? side.uri
          : (folderOf(state, side.sharedfolderref)?.name ?? "");
      return ok(
        paged(
          state.config.jobs.map((j) => ({
            ...clone(j),
            srcname: nameOf(j.src),
            destname: nameOf(j.dest),
          })),
          params,
        ),
      );
    },

    rsyncGet: ({ params }: Call) => {
      const id = text(params, "uuid");
      const found = state.config.jobs.find((j) => j.uuid === id);
      return found === undefined
        ? fail(500, SERVICES_MSG.notFound("conf.service.rsync.job", id))
        : ok(jobGet(found));
    },

    rsyncSet: ({ params }: Call) => {
      const id = text(params, "uuid");
      const type = text(params, "type") === "remote" ? "remote" : "local";
      const mode = text(params, "mode") === "pull" ? "pull" : "push";
      // OMV keeps only the side fields that apply to the type and mode, and blanks the others.
      const src: Side =
        type === "local" || mode === "push"
          ? { sharedfolderref: text(params, "srcsharedfolderref"), uri: "" }
          : { sharedfolderref: "", uri: text(params, "srcuri") };
      const dest: Side =
        type === "local" || mode === "pull"
          ? { sharedfolderref: text(params, "destsharedfolderref"), uri: "" }
          : { sharedfolderref: "", uri: text(params, "desturi") };
      const sent: StoredJob = {
        ...clone(JOB_DEFAULTS),
        uuid: id,
        enable: flag(params, "enable"),
        sendemail: flag(params, "sendemail"),
        comment: text(params, "comment"),
        type,
        mode,
        src,
        dest,
        minute: joined(params, "minute", "*"),
        hour: joined(params, "hour", "*"),
        dayofmonth: joined(params, "dayofmonth", "*"),
        month: joined(params, "month", "*"),
        dayofweek: joined(params, "dayofweek", "*"),
        everynminute: flag(params, "everynminute"),
        everynhour: flag(params, "everynhour"),
        everyndayofmonth: flag(params, "everyndayofmonth"),
        optionrecursive: flag(params, "optionrecursive"),
        optiontimes: flag(params, "optiontimes"),
        optiongroup: flag(params, "optiongroup"),
        optionowner: flag(params, "optionowner"),
        optioncompress: flag(params, "optioncompress"),
        optionarchive: flag(params, "optionarchive"),
        optiondelete: flag(params, "optiondelete"),
        optionquiet: flag(params, "optionquiet"),
        optionperms: flag(params, "optionperms"),
        optionacls: flag(params, "optionacls"),
        optionxattrs: flag(params, "optionxattrs"),
        optiondryrun: flag(params, "optiondryrun"),
        optionpartial: flag(params, "optionpartial"),
        extraoptions: text(params, "extraoptions"),
        authentication:
          text(params, "authentication") === "pubkey" ? "pubkey" : "password",
        password: text(params, "password"),
        sshcertificateref: text(params, "sshcertificateref"),
        sshport: int(params, "sshport", 22),
      };
      if (id === NEW_OBJECT) {
        const failure = jobsAddFailureOf(state.name, state.newJobs);
        state.newJobs += 1;
        if (failure === "save") {
          return fail(500, SERVICES_MSG.jobNotSaved);
        }
        const made = { ...sent, uuid: newUuid() };
        state.config.jobs.push(made);
        dirty(["rsync"]);
        state.armed =
          failure === null || failure === "cut" || failure === "check"
            ? null
            : { failure, job: made.uuid, turnedOn: false };
        if (failure === "cut") {
          return CUT;
        }
        return ok(clone(made));
      }
      const index = state.config.jobs.findIndex((j) => j.uuid === id);
      if (index < 0) {
        return fail(500, SERVICES_MSG.notFound("conf.service.rsync.job", id));
      }
      const armed = state.armed;
      if (armed?.job === id && !sent.optiondryrun) {
        if (armed.failure === "turnOnSave") {
          state.armed = null;
          return fail(500, SERVICES_MSG.jobNotSaved);
        }
        if (armed.failure === "turnOnApply") {
          armed.turnedOn = true;
        }
      }
      state.config.jobs[index] = sent;
      dirty(["rsync"]);
      return ok(clone(sent));
    },

    rsyncDelete: ({ params }: Call) => {
      const id = text(params, "uuid");
      const found = state.config.jobs.find((j) => j.uuid === id);
      if (found === undefined) {
        return fail(500, SERVICES_MSG.notFound("conf.service.rsync.job", id));
      }
      state.config.jobs = state.config.jobs.filter((j) => j.uuid !== id);
      if (state.armed?.job === id) {
        state.armed = null;
      }
      dirty(["rsync"]);
      return ok(clone(found));
    },

    rsyncExecute: ({ params }: Call) => {
      if (isPending("rsync")) {
        return fail(500, SERVICES_MSG.pending);
      }
      const id = text(params, "uuid");
      // The job runs as last applied: its script is written when the changes are applied.
      const job = state.applied.jobs.find((j) => j.uuid === id);
      if (job === undefined) {
        return fail(500, SERVICES_MSG.notFound("conf.service.rsync.job", id));
      }
      // One run at a time: the script's lock makes a second start end at once, with no output.
      const running = [...state.tasks.values()].some(
        (t) => t.ref === id && t.state === "running",
      );
      if (running) {
        return ok(startTask(state, id, { chunks: [], exit: 1 }, jobScript(id)));
      }
      const failTrial =
        state.armed?.job === id && state.armed.failure === "trial";
      if (failTrial) {
        state.armed = null;
      }
      return ok(
        startTask(state, id, runPlan(state, job, failTrial), jobScript(id)),
      );
    },

    // ---- SMB ----

    smbGetShare: ({ params }: Call) => {
      const id = text(params, "uuid");
      const found = state.shares.config.shares.find((s) => s.uuid === id);
      return found === undefined
        ? fail(500, SERVICES_MSG.notFound("conf.service.smb.share", id))
        : ok(clone(found));
    },

    smbEmptyRecycleBin: ({ params }: Call) => {
      if (isPending("samba")) {
        return fail(500, SERVICES_MSG.pending);
      }
      const id = text(params, "uuid");
      const found = state.shares.config.shares.find((s) => s.uuid === id);
      if (found === undefined) {
        return fail(500, SERVICES_MSG.notFound("conf.service.smb.share", id));
      }
      return ok(
        startTask(state, id, recyclePlan(state, found), recycleScript(id)),
      );
    },

    certificateMgmtGetSshList: ({ params }: Call) => {
      if (state.name === "servicesNoSshList") {
        return fail(500, SERVICES_MSG.sshList);
      }
      return ok(
        paged(
          state.keys.map((k) => ({
            ...clone(k),
            _used: state.config.jobs.some(
              (j) => j.sshcertificateref === k.uuid,
            ),
          })),
          params,
        ),
      );
    },
  };

  return {
    shareMgmtGetCandidates: passed("shareMgmtGetCandidates"),
    shareMgmtSet: passed("shareMgmtSet"),
    shareMgmtSetPrivileges: passed("shareMgmtSetPrivileges"),
    shareMgmtDelete: passed("shareMgmtDelete"),
    userMgmtGetUserList: passed("userMgmtGetUserList"),
    userMgmtGetGroupList: passed("userMgmtGetGroupList"),
    smbGetSettings: passed("smbGetSettings"),
    // OMV's NetBIOS-name rule for the workgroup (design 0.10, 11.2), before the shares mock's write.
    smbSetSettings: (call: Call) => {
      const workgroup = param(call.params, "workgroup");
      if (
        typeof workgroup === "string" &&
        !/^[A-Za-z0-9 !#$%&'()\-.@^_{}~]{1,15}$/.test(workgroup)
      ) {
        return fail(500, SERVICES_MSG.badWorkgroup(workgroup));
      }
      return passed("smbSetSettings")(call);
    },
    smbGetShareList: passed("smbGetShareList"),
    smbSetShare: passed("smbSetShare"),
    smbDeleteShare: passed("smbDeleteShare"),
    fileSystemMgmtGetList: passed("fileSystemMgmtGetList"),
    ...own,
  };
}

/**
 * A finished apply: the configuration is committed and the services follow it. False when it fails
 * (once): the add flow's apply of the trial job (jobsAddFailsApply) or of the job turned on
 * (jobsAddFailsTurnOnApply).
 */
export function servicesApplied(state: ServicesMockState): boolean {
  const armed = state.armed;
  if (
    armed !== null &&
    (armed.failure === "apply" ||
      (armed.failure === "turnOnApply" && armed.turnedOn))
  ) {
    state.armed = null;
    return false;
  }
  if (!sharesApplied(state.shares)) {
    return false;
  }
  state.applied = clone(state.config);
  state.pending = [];
  return true;
}

/** A finished undo: the configuration as last applied comes back. */
export function servicesReverted(state: ServicesMockState): void {
  sharesReverted(state.shares);
  state.config = clone(state.applied);
  state.pending = [];
  if (
    state.armed !== null &&
    !state.config.jobs.some((j) => j.uuid === state.armed?.job)
  ) {
    state.armed = null;
  }
  markUsed(state);
}

/** The people of the stories, for tests: the shares mock's alex, sam and robin. */
export const servicesPeople = (state: ServicesMockState): UserAccount[] =>
  state.shares.users;
