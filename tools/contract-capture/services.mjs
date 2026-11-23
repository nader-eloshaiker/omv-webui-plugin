#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Record the services slice's replies on the disposable test VM (design phase-5-services 14.2 and
// 17.2): Linux and Unix sharing (NFS) turned on and off and its entries made, changed and removed;
// the rsync server turned on and off and folders offered to it; copy jobs (rsync) made, changed,
// run, stopped and deleted, with their output; a share's recycle bin turned on, used and emptied;
// the workgroup; the NAS's SSH keys. It also uses each service from a client, the VM itself or a
// smbclient container on this computer, to see what each choice lets in. ERASES THE DISK IT IS GIVEN.
//
//   node tools/contract-capture/services.mjs --disk /dev/sdd --ssh <destination> \
//     [--smbclient <docker image>]
//
// Only for the test VM in $OMV_WEBUI_ENV (default ~/.config/omv-webui/test.env), never the owner's
// server. It refuses to start while configuration changes are pending; while any NFS share, copy
// job, rsync server folder, SSH key, SMB share, ZFS pool or RAID array exists; while anything is
// mounted under /export; when a test person already exists; and for a disk the server's candidate
// list does not offer. Every shared folder it makes is on a file system it makes on that disk; it
// never changes another shared folder, file system or account. Its test people carry documentation
// names, and every password it uses (people, rsync sign-ins, a copy job's) is random, exists only in
// this process and is never printed. The "other computer" of every remote job is the VM itself.
//
// --ssh runs fixed, test-only commands on the VM, each with values this tool has checked: files made
// and read in folders it made, `stat`, mounting its own NFS exports from 127.0.0.1 at one fixed
// folder and unmounting them, rsync as a client of the VM's own rsync server (the password reaches
// it on standard input), unmounting and mounting again its own file system, removing a shared
// folder's record by hand (to read a list that names a folder that is gone), reading the cron file
// and the exports, adding localhost's host key to root's known_hosts (put back exactly afterwards),
// and running a share's recycle-bin script. --smbclient names a local Docker image with Samba's
// smbclient, run with the test person's password in its environment, to delete files over SMB.
//
// It ends, also after a failure, by removing every job, rsync server folder, NFS share, SMB share,
// SSH key, person and shared folder it made, restoring the NFS, rsync server, SMB and SSH settings
// it read first, applying what is pending, unmounting its file system and quick-wiping the disk,
// then checking that the VM is as it was. Replies are scrubbed and verified as by capture.mjs and
// written as draft examples the same way; on top of that, the loopback address and localhost (the
// VM as its own client) become documentation values, and a reply that carries a test password
// outside a `password` field is not written. Credentials, the host and the passwords are never
// printed.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_PATH, Session, loadEnv, openCapture, sleep } from "./capture.mjs";

const EXAMPLES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../web/packages/spec-api-omv/src/examples",
);
const GET_ALL = { start: 0, limit: null, sortfield: null, sortdir: null };
const GET_ALL_SEARCH = { ...GET_ALL, search: null };
const NEW = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
// Only the scratch disks of the test VM; never the system disk or the data disk.
const DISK = /^\/dev\/sd[b-e]$/;
const SSH_DESTINATION = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const IMAGE = /^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]+)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The scratch file system's mount folder, and a folder this tool made on it.
const MOUNT_DIR = /^\/srv\/dev-disk-by-uuid-[0-9a-f-]+$/;
const SAFE_PATH = /^\/srv\/dev-disk-by-uuid-[0-9a-f-]+(?:\/[A-Za-z0-9._-]+)*$/;
// Where the VM mounts its own NFS exports as a client.
const MNT = "/mnt/webui-services-nfs";
const KNOWN_HOSTS = "/root/.ssh/known_hosts";
const KNOWN_HOSTS_BACKUP = "/root/.ssh/known_hosts.webui-services-backup";
const RSYNC_LOG = "/var/log/rsync.log";
const CRON_FILE = "/etc/cron.d/openmediavault-rsync";
// Documentation names (design 0.1), never the owner's.
const PEOPLE = ["alex", "robin"];
const SIGN_IN = "copier";
const KEY_COMMENT = "example-key";
// An address no computer on the network has (RFC 5737), and a name that never resolves (RFC 6761).
const OTHER_ADDRESS = "192.0.2.99";
const UNRESOLVED = "nas-client.invalid";
const SH = "/usr/bin/sh";
const NOLOGIN = "/usr/sbin/nologin";
// The classic form's defaults for a new SMB share (shares design 0.10, D5).
const SHARE_DEFAULTS = {
  enable: true,
  comment: "",
  guest: "no",
  readonly: false,
  browseable: true,
  recyclebin: false,
  recyclemaxsize: 0,
  recyclemaxage: 0,
  hidedotfiles: true,
  inheritacls: false,
  inheritpermissions: false,
  easupport: true,
  storedosattributes: false,
  hostsallow: "",
  hostsdeny: "",
  audit: false,
  timemachine: false,
  extraoptions: "",
  followsymlinks: true,
  widelinks: false,
  macoscompat: false,
  transportencryption: false,
};
const SHARE_FIELDS = [
  "uuid",
  "sharedfolderref",
  ...Object.keys(SHARE_DEFAULTS),
];
const NFS_FIELDS = [
  "uuid",
  "sharedfolderref",
  "mntentref",
  "client",
  "options",
  "extraoptions",
  "comment",
];
const MODULE_FIELDS = [
  "uuid",
  "enable",
  "sharedfolderref",
  "name",
  "comment",
  "uid",
  "gid",
  "readonly",
  "writeonly",
  "maxconnections",
  "list",
  "hostsallow",
  "hostsdeny",
  "authusers",
  "usechroot",
  "users",
  "extraoptions",
];
// A new copy job with the classic form's defaults (design 0.11, D5): every one of the 36 fields.
const JOB_DEFAULTS = {
  uuid: NEW,
  enable: true,
  sendemail: false,
  comment: "",
  type: "local",
  mode: "push",
  srcsharedfolderref: "",
  srcuri: "",
  destsharedfolderref: "",
  desturi: "",
  minute: ["0"],
  everynminute: false,
  hour: ["3"],
  everynhour: false,
  month: ["*"],
  dayofmonth: ["*"],
  everyndayofmonth: false,
  dayofweek: ["*"],
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

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (!["--disk", "--ssh", "--smbclient"].includes(flag)) {
      throw new Error(`unknown argument ${flag}`);
    }
    out[flag.slice(2)] = value;
  }
  if (!DISK.test(String(out.disk))) {
    throw new Error("--disk takes a scratch disk from /dev/sdb to /dev/sde");
  }
  if (!SSH_DESTINATION.test(String(out.ssh))) {
    throw new Error("--ssh takes an ssh destination such as omv8vm");
  }
  if (out.smbclient !== undefined && !IMAGE.test(out.smbclient)) {
    throw new Error("--smbclient takes a local Docker image name");
  }
  return out;
}

function run(cmd, argv, env = {}, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, {
      stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, out }));
    if (input !== null) {
      child.stdin.end(input);
    }
  });
}

/** A value put into a fixed command, in single quotes: never one that could leave them. */
const q = (value) => {
  if (!/^[^'\\\x00-\x1f`$]*$/.test(value)) {
    throw new Error("a value this tool did not expect in a command");
  }
  return `'${value}'`;
};

/** Every string in a value, with a function applied; the input is untouched. */
const mapStrings = (value, fn) =>
  Array.isArray(value)
    ? value.map((v) => mapStrings(v, fn))
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]),
        )
      : typeof value === "string"
        ? fn(value)
        : value;

// The VM as its own client: its loopback addresses and name become documentation ones, keeping
// each value's form (an address stays an address, a network a network).
const LOOPBACK = [
  [/\b127\.0\.0\.0\/8\b/g, "192.0.2.0/24"],
  [/\b127\.0\.0\.1\b/g, "192.0.2.10"],
  [/(?<![0-9A-Fa-f:])::1(?![0-9A-Fa-f:])/g, "2001:db8::10"],
  [/\blocalhost\b/g, "backup.example.org"],
];
const LOOPBACK_LEFT =
  /\b127\.\d+\.\d+\.\d+\b|\blocalhost\b|(?<![0-9A-Fa-f:])::1(?![0-9A-Fa-f:])/;
const withoutLoopback = (value) =>
  mapStrings(value, (s) =>
    LOOPBACK.reduce((out, [re, doc]) => out.replace(re, doc), s),
  );

async function main() {
  const opts = args(process.argv.slice(2));
  const env = loadEnv(ENV_PATH);
  const { base, record, results, scrub } = await openCapture(env);
  // The run is long: a call answered 401 was not run, so it signs in again and calls once more.
  const s = new Session(base);
  const call = s.call.bind(s);
  s.call = async (service, method, params) => {
    const r = await call(service, method, params);
    if (r.status === 401 && service !== "Session") {
      await s.login(env, "admin");
      return call(service, method, params);
    }
    return r;
  };
  const signedIn = await s.login(env, "admin");
  if (signedIn.status !== 200) {
    throw new Error(`sign-in failed (HTTP ${signedIn.status})`);
  }

  // ---- Secrets of this run, and what is printed and written ----
  const secret = () => randomBytes(18).toString("base64url");
  const passwords = new Map(PEOPLE.map((p) => [p, secret()]));
  const syncPassword = secret();
  const wrongPassword = secret();
  const archivePasswords = [secret(), secret(), secret()];
  const secrets = [
    ...passwords.values(),
    syncPassword,
    wrongPassword,
    ...archivePasswords,
  ];
  const hideSecrets = (text) =>
    secrets.reduce((t, p) => t.split(p).join("(a test password)"), text);
  const facts = [];
  const fact = (line) => facts.push(line);
  const written = [];
  /** A test password anywhere in a reply other than a `password` field. */
  const secretOutsidePasswordField = (value, key) => {
    if (Array.isArray(value)) {
      return value.some((v) => secretOutsidePasswordField(v, key));
    }
    if (value && typeof value === "object") {
      return Object.entries(value).some(([k, v]) =>
        secretOutsidePasswordField(v, k),
      );
    }
    return (
      typeof value === "string" &&
      key !== "password" &&
      secrets.some((p) => value.includes(p))
    );
  };
  /** Record a reply as record() does, after the loopback rule and the test-password check. */
  const rec = (operationId, name, status, body, keys = {}, shape = {}) => {
    if (secretOutsidePasswordField(body, undefined)) {
      results.push(
        `FAIL  ${operationId}.${name}: a test password outside a password field. Not written.`,
      );
      return;
    }
    const rewritten = withoutLoopback(body);
    const left = JSON.stringify(
      status === 200 ? rewritten.response : (rewritten.error?.message ?? ""),
    );
    if (LOOPBACK_LEFT.test(left)) {
      results.push(
        `FAIL  ${operationId}.${name}: a loopback address or localhost left. Not written.`,
      );
      return;
    }
    const before = results.length;
    record(operationId, name, status, rewritten, keys, shape);
    if (results.slice(before).some((l) => l.startsWith("new "))) {
      written.push(`${operationId}.${name}.yaml`);
    }
  };

  const ok = async (service, method, params) => {
    const r = await s.call(service, method, params);
    if (r.status !== 200) {
      throw new Error(
        scrub(
          `${service}.${method} failed (HTTP ${r.status}): ${r.body.error?.message ?? ""}`,
        ).slice(0, 400),
      );
    }
    return r.body.response;
  };
  const capture = async (operationId, name, service, method, params) => {
    const r = await s.call(service, method, params);
    rec(operationId, name, r.status, r.body);
    return r;
  };
  const said = (r) =>
    r.status === 200
      ? "accepted"
      : `HTTP ${r.status}: ${scrub(r.body.error?.message ?? "").slice(0, 300)}`;
  const dirtyModules = async () => {
    const info = await ok("System", "getInformation");
    const m = info.dirtyModules;
    return m && !Array.isArray(m) ? Object.keys(m).sort() : [];
  };
  const pending = async () => (await dirtyModules()).join(" ") || "(none)";
  /** Follow a task to its end, asking for the whole output each time; the last reply. */
  const follow = async (handle, tries = 2400) => {
    for (let i = 0; i < tries; i++) {
      await sleep(500);
      const r = await s.call("Exec", "getOutput", { filename: handle, pos: 0 });
      if (r.status !== 200) {
        return r;
      }
      if (!r.body.response.running && !r.body.response.pendingOutput) {
        return r;
      }
    }
    throw new Error("a task did not finish in time");
  };
  const runTask = async (service, method, params) => {
    const started = await s.call(service, method, params);
    if (started.status !== 200) {
      throw new Error(`${service}.${method} failed (${said(started)})`);
    }
    return follow(started.body.response);
  };
  const recordTask = (name, r) =>
    rec(
      "execGetOutput",
      `${name}${r.status === 200 ? "Finished" : "Failed"}`,
      r.status,
      r.body,
    );
  const outputOf = (r) =>
    r.status === 200 ? r.body.response.output : (r.body.error?.message ?? "");
  const applyAll = async () => {
    const t = Date.now();
    const last = await runTask("Config", "applyChangesBg", {
      modules: [],
      force: false,
    });
    if (last.status !== 200) {
      throw new Error(`applying the pending changes failed (${said(last)})`);
    }
    return Math.round((Date.now() - t) / 100) / 10;
  };
  const applyIfDirty = async () => {
    if ((await ok("Config", "isDirty")) !== false) {
      await applyAll();
    }
  };
  /** What a write alone marks pending, then applied, so the next is measured alone too. */
  const measured = async (label, r) => {
    fact(`item 1: ${label}: ${said(r)}; pending ${await pending()}`);
    await applyIfDirty();
    return r;
  };
  /** A sub-test: its failure is a fact, and the run goes on to the next. */
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      fact(`STEP FAILED ${name}: ${scrub(e.message).slice(0, 400)}`);
      await applyIfDirty().catch((e2) =>
        fact(
          `STEP ${name}: apply after the failure failed too: ${scrub(e2.message).slice(0, 200)}`,
        ),
      );
    }
  };
  /** Run one fixed command on the VM over ssh; its output. Throws on a non-zero exit. */
  const vm = async (command, input = null) => {
    const r = await run(
      "ssh",
      ["-o", "BatchMode=yes", opts.ssh, command],
      {},
      input,
    );
    if (r.code !== 0) {
      throw new Error(
        `a test-only command on the VM failed (${r.code}): ${hideSecrets(scrub(r.out)).slice(0, 300)}`,
      );
    }
    return r.out;
  };
  const vmLine = async (command, input = null) =>
    (await vm(command, input)).trim().replace(/\s*\n\s*/g, " | ");
  const list = async (service, method, params = GET_ALL) => {
    const r = await ok(service, method, params);
    return Array.isArray(r) ? r : r.data;
  };
  const folders = () => list("ShareMgmt", "getList");
  const users = () => list("UserMgmt", "getUserList", GET_ALL_SEARCH);

  // ---- Preconditions, and what is put back at the end ----
  const vmName = String((await ok("System", "getInformation")).hostname ?? "");
  if ((await ok("Config", "isDirty")) !== false) {
    throw new Error(
      "the VM has pending configuration changes; apply or revert them first",
    );
  }
  const before = {
    nfs: await ok("NFS", "getSettings"),
    rsyncd: await ok("Rsyncd", "getSettings"),
    smb: await ok("SMB", "getSettings"),
    ssh: await ok("SSH", "get"),
    keys: await list("CertificateMgmt", "getSshList"),
    jobs: await list("Rsync", "getList"),
    modules: await list("Rsyncd", "getModuleList"),
    nfsShares: await list("NFS", "getShareList"),
    smbShares: await list("SMB", "getShareList"),
    cron: await ok("Cron", "getList", {
      ...GET_ALL,
      type: ["reboot", "shutdown", "standby", "userdefined"],
    }),
    fstab: await ok("FsTab", "enumerateEntries"),
    folders: await folders(),
    users: (await users()).map((u) => u.name),
    pools: await ok("Zfs", "getPoolStatus"),
    md: await list("MdMgmt", "getList"),
  };
  for (const [what, rows] of [
    ["an NFS share", before.nfsShares],
    ["a copy job", before.jobs],
    ["an rsync server folder", before.modules],
    ["an SSH key", before.keys],
    ["an SMB share", before.smbShares],
    ["a ZFS pool", before.pools],
    ["a RAID array", before.md],
  ]) {
    if (rows.length !== 0) {
      throw new Error(
        `the VM has ${what}; this tool runs only on a VM without any`,
      );
    }
  }
  if (PEOPLE.some((p) => before.users.includes(p))) {
    throw new Error("a test person already exists; remove it first");
  }
  const vmBefore = {
    exportMounts: (
      await vm("findmnt -rn -o TARGET | grep -c '^/export' || true")
    ).trim(),
    exportEntries: (await vm("ls -A /export 2>/dev/null | wc -l")).trim(),
    homes: (
      await vm(
        "for d in /home/alex /home/robin; do test -e $d && echo $d; done; true",
      )
    ).trim(),
    knownHosts: (
      await vm(
        `if test -e ${KNOWN_HOSTS}; then sha256sum ${KNOWN_HOSTS} | cut -d' ' -f1; else echo absent; fi`,
      )
    ).trim(),
    rsyncLog: (
      await vm(
        `if test -e ${RSYNC_LOG}; then stat -c %s ${RSYNC_LOG}; else echo absent; fi`,
      )
    ).trim(),
    exports: (await vm("sha256sum /etc/exports | cut -d' ' -f1")).trim(),
    cronFile: (
      await vm(`sha256sum ${CRON_FILE} 2>/dev/null | cut -d' ' -f1; true`)
    ).trim(),
    rsyncdConf: (
      await vm("sha256sum /etc/rsyncd.conf 2>/dev/null | cut -d' ' -f1; true")
    ).trim(),
    sshKeyFiles: (
      await vm("ls /etc/ssh/openmediavault-* 2>/dev/null | wc -l")
    ).trim(),
  };
  if (vmBefore.exportMounts !== "0" || vmBefore.exportEntries !== "0") {
    throw new Error(
      "/export is not empty or something is mounted there; nothing was changed",
    );
  }
  if (vmBefore.homes !== "") {
    throw new Error(
      "a test person's home folder exists on the VM; nothing was changed",
    );
  }
  if (vmBefore.knownHosts !== "absent") {
    await vm(`cp -p ${KNOWN_HOSTS} ${KNOWN_HOSTS_BACKUP}`);
  }
  const candidates = await runTask("FileSystemMgmt", "getCandidatesBg", {});
  const offered = new Set(
    JSON.parse(candidates.body.response.output).map((c) => c.devicefile),
  );
  if (!offered.has(opts.disk)) {
    throw new Error(
      `${opts.disk} is not among the server's candidates; nothing was changed`,
    );
  }
  fact(
    `before: NFS on ${before.nfs.enable}, versions ${JSON.stringify(before.nfs.versions)}; rsync server on ${before.rsyncd.enable}, port ${before.rsyncd.port}; SMB on ${before.smb.enable}, workgroup ${before.smb.workgroup}; SSH on ${before.ssh.enable}, key sign-in ${before.ssh.pubkeyauthentication}; known_hosts ${vmBefore.knownHosts === "absent" ? "absent" : "present (backed up)"}; rsync log ${vmBefore.rsyncLog === "absent" ? "absent" : "present"}`,
  );

  // What this tool made, removed again at the end.
  const made = {
    jobs: new Set(),
    modules: new Set(),
    nfs: new Set(),
    smb: new Set(),
    keys: new Set(),
    people: new Set(),
    folders: [],
    mount: null,
    wiped: false,
    knownHosts: false,
  };
  let mount; // the scratch file system's mount entry
  const folderPath = (f) => {
    const p = `${f.mntent?.dir ?? ""}/${f.reldirpath}`
      .replace(/\/+$/, "")
      .replace(/\/+/g, "/");
    if (!SAFE_PATH.test(p) || p.includes("..")) {
      throw new Error("a folder path this tool did not expect");
    }
    return p;
  };
  const folderRow = async (uuid) =>
    (await folders()).find((f) => f.uuid === uuid);
  /** A new shared folder on the scratch file system, mode 770 as this interface makes them. */
  const newFolder = async (name, reldirpath) => {
    const r = await s.call("ShareMgmt", "set", {
      uuid: NEW,
      name,
      comment: "",
      mntentref: mount.uuid,
      reldirpath,
      mode: "770",
    });
    if (r.status === 200) {
      made.folders.push(r.body.response.uuid);
    }
    return r;
  };
  const folder = async (name, reldirpath = `${name}/`) => {
    const r = await newFolder(name, reldirpath);
    if (r.status !== 200) {
      throw new Error(`could not make the folder ${name} (${said(r)})`);
    }
    const row = await folderRow(r.body.response.uuid);
    return { uuid: row.uuid, name, path: folderPath(row) };
  };
  const nfsShare = async (change) => {
    const r = await s.call("NFS", "setShare", {
      uuid: NEW,
      mntentref: NEW,
      options: "rw",
      extraoptions: "subtree_check,insecure",
      comment: "",
      ...change,
    });
    if (r.status === 200 && change.uuid === undefined) {
      made.nfs.add(r.body.response.uuid);
    }
    return r;
  };
  const nfsChange = async (uuid, change) => {
    const row = await ok("NFS", "getShare", { uuid });
    return s.call("NFS", "setShare", {
      ...Object.fromEntries(NFS_FIELDS.map((k) => [k, row[k]])),
      ...change,
    });
  };
  const nfsDelete = async (uuid) => {
    const r = await s.call("NFS", "deleteShare", { uuid });
    if (r.status === 200) {
      made.nfs.delete(uuid);
    }
    return r;
  };
  const module = async (change) => {
    const r = await s.call("Rsyncd", "setModule", {
      uuid: NEW,
      enable: true,
      comment: "",
      uid: "nobody",
      gid: "users",
      readonly: false,
      writeonly: false,
      maxconnections: 0,
      list: true,
      hostsallow: "",
      hostsdeny: "",
      authusers: false,
      usechroot: true,
      users: [],
      extraoptions: "",
      ...change,
    });
    if (r.status === 200 && change.uuid === undefined) {
      made.modules.add(r.body.response.uuid);
    }
    return r;
  };
  const moduleChange = async (uuid, change) => {
    const row = await ok("Rsyncd", "getModule", { uuid });
    return s.call("Rsyncd", "setModule", {
      ...Object.fromEntries(MODULE_FIELDS.map((k) => [k, row[k]])),
      ...change,
    });
  };
  const moduleDelete = async (uuid) => {
    const r = await s.call("Rsyncd", "deleteModule", { uuid });
    if (r.status === 200) {
      made.modules.delete(uuid);
    }
    return r;
  };
  const job = async (change) => {
    const r = await s.call("Rsync", "set", { ...JOB_DEFAULTS, ...change });
    if (r.status === 200 && change.uuid === undefined) {
      made.jobs.add(r.body.response.uuid);
    }
    return r;
  };
  const jobOrThrow = async (change) => {
    const r = await job(change);
    if (r.status !== 200) {
      throw new Error(`Rsync.set failed (${said(r)})`);
    }
    return r.body.response.uuid;
  };
  /** Read, change, write a copy job (design 0.11): get's fields, flattened ones from src and dest. */
  const jobChange = async (uuid, change) => {
    const g = await ok("Rsync", "get", { uuid });
    const p = Object.fromEntries(
      Object.keys(JOB_DEFAULTS).map((k) => [k, g[k]]),
    );
    p.srcsharedfolderref = g.srcsharedfolderref ?? g.src?.sharedfolderref ?? "";
    p.srcuri = g.srcuri ?? g.src?.uri ?? "";
    p.destsharedfolderref =
      g.destsharedfolderref ?? g.dest?.sharedfolderref ?? "";
    p.desturi = g.desturi ?? g.dest?.uri ?? "";
    return s.call("Rsync", "set", { ...p, ...change });
  };
  const jobDelete = async (uuid) => {
    const r = await s.call("Rsync", "delete", { uuid });
    if (r.status === 200) {
      made.jobs.delete(uuid);
    }
    return r;
  };
  /** Run a copy job now and follow it; the last reply and the run's time. */
  const runJob = async (uuid, startName = null) => {
    const t = Date.now();
    const started = await s.call("Rsync", "execute", { uuid });
    if (startName) {
      rec("rsyncExecute", startName, started.status, started.body);
    }
    if (started.status !== 200) {
      return { r: started, ms: Date.now() - t, handle: null };
    }
    const r = await follow(started.body.response);
    return { r, ms: Date.now() - t, handle: started.body.response };
  };
  const smbShare = async (folderUuid, change = {}) => {
    const r = await s.call("SMB", "setShare", {
      ...SHARE_DEFAULTS,
      uuid: NEW,
      sharedfolderref: folderUuid,
      ...change,
    });
    if (r.status === 200) {
      made.smb.add(r.body.response.uuid);
    }
    return r;
  };
  const smbChange = async (uuid, change) => {
    const row = await ok("SMB", "getShare", { uuid });
    return s.call("SMB", "setShare", {
      ...Object.fromEntries(SHARE_FIELDS.map((k) => [k, row[k]])),
      ...change,
    });
  };
  const setUser = async (name, change = {}) => {
    const r = await s.call("UserMgmt", "setUser", {
      name,
      groups: ["users"],
      shell: NOLOGIN,
      password: passwords.get(name),
      email: "",
      comment: "",
      disallowusermod: false,
      sshpubkeys: [],
      ...change,
    });
    if (r.status !== 200) {
      throw new Error(`could not make a test person (${said(r)})`);
    }
    made.people.add(name);
  };
  /** Open a share as a test person with smbclient in a container; NT_STATUS or OK. */
  const smb = async (share, person, command) => {
    if (!opts.smbclient) {
      return "not checked (no --smbclient)";
    }
    const r = await run(
      "docker",
      [
        "run",
        "--rm",
        "-e",
        "PASSWD",
        "-e",
        "NAS_HOST",
        opts.smbclient,
        "sh",
        "-c",
        `smbclient "//$NAS_HOST/${share}" -U ${person} -c '${command}' 2>&1`,
      ],
      { PASSWD: passwords.get(person), NAS_HOST: env.NAS_HOST },
    );
    const status = /NT_STATUS_[A-Z_]+/.exec(r.out)?.[0];
    return status ?? (r.code === 0 ? "OK" : `exit ${r.code}`);
  };
  /** rsync as a client on the VM, the password (or none) on standard input. */
  const rsyncClient = async (argv, password = "") =>
    vmLine(
      `read -r RSYNC_PASSWORD; if [ -n "$RSYNC_PASSWORD" ]; then export RSYNC_PASSWORD; else unset RSYNC_PASSWORD; fi; timeout 60 rsync ${argv} </dev/null 2>&1; echo "exit $?"`,
      `${password}\n`,
    );
  /** Mount an NFS export of the VM on the VM, run a body while mounted, unmount; the transcript. */
  const nfsMount = async (spec, options, body = "") =>
    vmLine(
      `mkdir -p ${MNT}; if timeout 40 mount -t nfs -o ${options},soft,timeo=30,retrans=1 ${spec} ${MNT} 2>&1; then echo mounted; ${body} cd /; umount ${MNT} 2>/dev/null || umount -l ${MNT}; else echo not-mounted; fi; rmdir ${MNT} 2>/dev/null; true`,
    );
  const asAlex = (cmd) =>
    `setpriv --reuid=alex --regid=users --init-groups ${cmd}`;
  const asStranger = (cmd) =>
    `setpriv --reuid=54321 --regid=54321 --clear-groups ${cmd}`;
  const tryCmd = (label, cmd) =>
    `if ${cmd} >/dev/null 2>&1; then echo '${label} yes'; else echo '${label} no'; fi;`;
  const nfsActive = async () =>
    vmLine("systemctl is-active nfs-server 2>&1; true");
  const fileList = (dir) =>
    vmLine(
      `cd ${q(dir)} && find . -mindepth 1 -printf '%P %s %TY%Tm%Td%TH%TM%TS\\n' | sort | sha256sum | cut -c1-16`,
    );

  try {
    // ---- 1. Read-only, before anything changes ----
    await capture("nfsGetSettings", "off", "NFS", "getSettings");
    await capture("nfsGetShareList", "none", "NFS", "getShareList", GET_ALL);
    await capture("rsyncdGetSettings", "off", "Rsyncd", "getSettings");
    await capture(
      "rsyncdGetModuleList",
      "none",
      "Rsyncd",
      "getModuleList",
      GET_ALL,
    );
    await capture("rsyncGetList", "none", "Rsync", "getList", GET_ALL);
    await capture(
      "certificateMgmtGetSshList",
      "none",
      "CertificateMgmt",
      "getSshList",
      GET_ALL,
    );
    fact(
      `item 10: the rsync server's port on this VM before any change: ${before.rsyncd.port}; item 2: getSettings keys ${Object.keys(before.nfs).join(",")}; shares ${JSON.stringify(before.nfs.shares)}`,
    );

    // ---- 2. A scratch file system, folders, people, a key ----
    const created = await runTask("FileSystemMgmt", "create", {
      devicefile: opts.disk,
      type: "ext4",
    });
    made.wiped = true;
    if (created.status !== 200) {
      throw new Error("creating the scratch file system failed");
    }
    const candidate = (await ok("FileSystemMgmt", "getMountCandidates")).find(
      (f) =>
        f.parentdevicefile === opts.disk ||
        f.devicefile === opts.disk ||
        f.canonicaldevicefile?.startsWith(opts.disk),
    );
    if (!candidate) {
      throw new Error("the new file system is not a mount candidate");
    }
    mount = await ok("FileSystemMgmt", "setMountPoint", {
      id: candidate.canonicaldevicefile,
      usagewarnthreshold: 85,
      comment: "Scratch",
    });
    made.mount = mount;
    if (!MOUNT_DIR.test(mount.dir)) {
      throw new Error("the scratch file system's mount folder is unexpected");
    }
    await applyAll();
    const media = await folder("Media");
    const backup = await folder("Backup");
    const copies = await folder("Copies");
    const pulled = await folder("Pulled");
    await applyAll();
    fact(
      `a new folder on the disk (ShareMgmt.set mode 770): ${await vmLine(`stat -c '%a %U:%G' ${q(media.path)}`)}`,
    );

    const keyMade = await s.call("CertificateMgmt", "createSsh", {
      type: "ed25519",
      comment: KEY_COMMENT,
    });
    if (keyMade.status !== 200) {
      throw new Error(`CertificateMgmt.createSsh failed (${said(keyMade)})`);
    }
    const keyUuid = keyMade.body.response.uuid;
    made.keys.add(keyUuid);
    fact(
      `item 13: createSsh reply keys ${Object.keys(keyMade.body.response).join(",")}; private key in its reply ${"privatekey" in keyMade.body.response}`,
    );
    await measured("CertificateMgmt.createSsh", keyMade);
    const keyRow = (await list("CertificateMgmt", "getSshList")).find(
      (k) => k.uuid === keyUuid,
    );
    fact(
      `item 13: getSshList row keys ${Object.keys(keyRow).join(",")}; _used before a job uses it ${keyRow._used}; private key in the row ${"privatekey" in keyRow}`,
    );
    await setUser("alex", {
      groups: ["users", "_ssh"],
      shell: SH,
      sshpubkeys: [keyRow.publickey],
    });
    await setUser("robin");
    await applyAll();
    const ids = await vmLine(
      "id -u alex; id -u robin; getent group users | cut -d: -f3",
    );
    fact(
      `test people made; their numbers and the users group's (uid alex, uid robin, gid users): ${ids}`,
    );

    // ---- 3. NFS: on, entries, shapes, pending (items 1, 2) ----
    let mediaFirst;
    let mediaSecond;
    let backupEntry;
    await step("NFS on and entries", async () => {
      const on = await s.call("NFS", "setSettings", {
        enable: true,
        versions: before.nfs.versions,
      });
      rec("nfsSetSettings", "turnedOn", on.status, on.body);
      await measured("NFS.setSettings on", on);
      const first = await nfsShare({
        sharedfolderref: media.uuid,
        client: "127.0.0.1",
      });
      rec("nfsSetShare", "created", first.status, first.body);
      mediaFirst = first.body.response?.uuid;
      fact(
        `item 2: setShare new reply mntentref is the new marker ${first.body.response?.mntentref === NEW}; fstab entries for /export now ${(await ok("FsTab", "enumerateEntries")).filter((e) => e.dir?.startsWith("/export")).length}`,
      );
      await measured("NFS.setShare new, the folder's first entry", first);
      const second = await nfsShare({
        sharedfolderref: media.uuid,
        client: "127.0.0.0/8",
        options: "ro",
      });
      mediaSecond = second.body.response?.uuid;
      await measured(
        "NFS.setShare new, a second entry for the same folder",
        second,
      );
      const any = await nfsShare({
        sharedfolderref: backup.uuid,
        client: "*",
        options: "ro",
      });
      backupEntry = any.body.response?.uuid;
      await applyIfDirty();
      const several = await capture(
        "nfsGetShareList",
        "several",
        "NFS",
        "getShareList",
        GET_ALL,
      );
      const one = await capture("nfsGetShare", "one", "NFS", "getShare", {
        uuid: mediaFirst,
      });
      const row = several.body.response.data.find((x) => x.uuid === mediaFirst);
      fact(
        `item 2: getShareList row keys ${Object.keys(row).join(",")}; getShare keys ${Object.keys(one.body.response).join(",")}; getShare fields beyond setShare's ${
          Object.keys(one.body.response)
            .filter((k) => !NFS_FIELDS.includes(k))
            .join(",") || "none"
        }`,
      );
      const settings = await capture(
        "nfsGetSettings",
        "on",
        "NFS",
        "getSettings",
      );
      fact(
        `item 2: getSettings with entries: keys ${Object.keys(settings.body.response).join(",")}; shares is ${Array.isArray(settings.body.response.shares) ? "a list" : typeof settings.body.response.shares} ${JSON.stringify(Object.keys(settings.body.response.shares ?? {}))}`,
      );
      fact(
        `item 3: /etc/exports with three entries: ${scrub(await vmLine("grep -v '^#' /etc/exports | sed '/^$/d'"))}`,
      );
      const changed = await nfsChange(mediaFirst, { options: "ro" });
      rec("nfsSetShare", "changed", changed.status, changed.body);
      await measured("NFS.setShare, an existing entry changed", changed);
      const empty = await nfsShare({
        sharedfolderref: backup.uuid,
        client: "127.0.0.1",
        extraoptions: "",
      });
      if (empty.status === 200) {
        fact("item 2: setShare with an empty extraoptions: accepted");
        await nfsDelete(empty.body.response.uuid);
      } else {
        rec("nfsSetShare", "emptyExtraOptions", empty.status, empty.body);
        fact(`item 2: setShare with an empty extraoptions: ${said(empty)}`);
      }
      await applyIfDirty();
      const removed = await nfsDelete(mediaSecond);
      rec("nfsDeleteShare", "removed", removed.status, removed.body);
      fact(
        `item 2: deleteShare reply keys ${Object.keys(removed.body.response ?? {}).join(",")}`,
      );
      await measured("NFS.deleteShare, not the folder's last entry", removed);
      const last = await nfsDelete(backupEntry);
      fact(
        `item 2: after deleting a folder's last entry, fstab entries for /export ${(await ok("FsTab", "enumerateEntries")).filter((e) => e.dir?.startsWith("/export")).length}`,
      );
      await measured("NFS.deleteShare, the folder's last entry", last);
    });

    // ---- 4. NFS access, with the VM as its own client (item 3) ----
    await step("NFS access", async () => {
      await vm(
        `mkdir -m 777 ${q(`${media.path}/open`)} && echo hello > ${q(`${media.path}/readme.txt`)} && chmod 644 ${q(`${media.path}/readme.txt`)}`,
      );
      const states = [
        ["one computer 127.0.0.1, rw", { client: "127.0.0.1", options: "rw" }],
        [
          `one computer ${OTHER_ADDRESS}, rw`,
          { client: OTHER_ADDRESS, options: "rw" },
        ],
        ["a network 127.0.0.0/8, rw", { client: "127.0.0.0/8", options: "rw" }],
        ["any computer *, ro", { client: "*", options: "ro" }],
      ];
      const writes = [
        tryCmd("root writes in the 770 folder:", `touch ${MNT}/root-test`),
        tryCmd("root writes in a 777 folder:", `touch ${MNT}/open/root-test`),
        `stat -c 'owner of what root wrote: %U:%G' ${MNT}/open/root-test 2>/dev/null;`,
        tryCmd("alex reads:", asAlex(`ls ${MNT}`)),
        tryCmd("alex writes:", asAlex(`touch ${MNT}/alex-test`)),
        `stat -c 'owner of what alex wrote: %U:%G' ${MNT}/alex-test 2>/dev/null;`,
        tryCmd("uid 54321 reads:", asStranger(`ls ${MNT}`)),
        tryCmd(
          "uid 54321 reads a 644 file:",
          asStranger(`cat ${MNT}/readme.txt`),
        ),
        tryCmd("uid 54321 writes:", asStranger(`touch ${MNT}/stranger-test`)),
      ].join(" ");
      for (const [label, change] of states) {
        const r = await nfsChange(mediaFirst, change);
        if (r.status !== 200) {
          fact(`item 3 ${label}: could not be set (${said(r)})`);
          continue;
        }
        await applyAll();
        await sleep(2000);
        fact(
          `item 3 ${label}: NFSv3 127.0.0.1:/export/Media: ${scrub(await nfsMount("127.0.0.1:/export/Media", "vers=3", writes))}`,
        );
        fact(
          `item 3 ${label}: NFSv4.2 127.0.0.1:/Media: ${scrub(await nfsMount("127.0.0.1:/Media", "vers=4.2"))}; NFSv4.2 127.0.0.1:/export/Media: ${scrub(await nfsMount("127.0.0.1:/export/Media", "vers=4.2"))}`,
        );
        await vm(
          `rm -f ${q(`${media.path}/root-test`)} ${q(`${media.path}/open/root-test`)} ${q(`${media.path}/alex-test`)} ${q(`${media.path}/stranger-test`)}`,
        );
      }
      fact(
        `item 3: exportfs -v with "*": ${scrub(await vmLine("exportfs -v 2>&1 | tr -s ' \\t' ' '"))}`,
      );
      const unresolved = await nfsShare({
        sharedfolderref: backup.uuid,
        client: UNRESOLVED,
      });
      fact(`item 3: an entry naming ${UNRESOLVED}: ${said(unresolved)}`);
      try {
        const t = await applyAll();
        await sleep(2000);
        fact(
          `item 3: after apply (${t} s) with a name that does not resolve: nfs-server ${await nfsActive()}; Services.getStatus nfs ${JSON.stringify((await ok("Services", "getStatus", {})).data.find((x) => x.name === "nfs") ?? null)}; exportfs ${scrub(await vmLine("exportfs -v 2>&1 | tr -s ' \\t' ' '"))}; the other entry still mounts: ${scrub(await nfsMount("127.0.0.1:/export/Media", "vers=3"))}`,
        );
      } finally {
        if (unresolved.status === 200) {
          await nfsDelete(unresolved.body.response.uuid);
          await applyIfDirty();
        }
      }
    });

    // ---- 5. An NFS entry whose folder was removed by hand (item 2) ----
    await step("NFS folder gone", async () => {
      const gone = await folder("GoneNfs");
      const entry = await nfsShare({
        sharedfolderref: gone.uuid,
        client: "127.0.0.1",
      });
      if (entry.status !== 200) {
        throw new Error(said(entry));
      }
      await applyAll();
      if (!UUID.test(gone.uuid)) {
        throw new Error("unexpected UUID");
      }
      await vm(
        `omv-confdbadm delete --uuid ${gone.uuid} conf.system.sharedfolder`,
      );
      made.folders = made.folders.filter((x) => x !== gone.uuid);
      const r = await capture(
        "nfsGetShareList",
        "folderGone",
        "NFS",
        "getShareList",
        GET_ALL,
      );
      fact(
        `item 2: getShareList when an entry's folder was removed by hand: ${said(r)}`,
      );
      const one = await s.call("NFS", "getShare", {
        uuid: entry.body.response.uuid,
      });
      fact(`item 2: getShare of that entry: ${said(one)}`);
      fact(
        `item 2: deleteShare of that entry: ${said(await nfsDelete(entry.body.response.uuid))}`,
      );
      await applyAll();
    });

    // ---- 5b. NFS names: a name with a space, letters outside the Latin alphabet (item 4) ----
    await step("NFS names", async () => {
      await nfsChange(mediaFirst, { client: "127.0.0.1", options: "rw" });
      await applyIfDirty();
      const spaced = await newFolder("Holiday Photos", "Holiday Photos/");
      fact(
        `item 4: a shared folder named "Holiday Photos" in "Holiday Photos/": ${said(spaced)}`,
      );
      if (spaced.status === 200) {
        const r = await nfsShare({
          sharedfolderref: spaced.body.response.uuid,
          client: "127.0.0.1",
        });
        rec("nfsSetShare", "blankInPath", r.status, r.body);
        fact(`item 4: NFS.setShare for it: ${said(r)}`);
        if (r.status === 200) {
          await nfsDelete(r.body.response.uuid);
        }
      }
      const nameOnly = await newFolder("Family Videos", "Family-Videos/");
      fact(
        `item 4: a shared folder named "Family Videos" in "Family-Videos/": ${said(nameOnly)}`,
      );
      await applyIfDirty();
      if (nameOnly.status === 200) {
        const r = await nfsShare({
          sharedfolderref: nameOnly.body.response.uuid,
          client: "127.0.0.1",
        });
        fact(`item 4: NFS.setShare for it: ${said(r)}`);
        if (r.status === 200) {
          try {
            const t = await applyAll();
            fact(
              `item 4: after apply (${t} s): exports ${JSON.stringify(scrub(await vmLine("grep -i 'family' /etc/exports || true")))}; mounted at /export ${JSON.stringify(await vmLine("findmnt -rn -o TARGET | grep -i family || true"))}; nfs-server ${await nfsActive()}; exportfs ${JSON.stringify(scrub(await vmLine("exportfs -v 2>&1 | grep -i -A1 family | tr -s ' \\t' ' '; true")))}; mount "/export/Family Videos" ${scrub(await nfsMount("'127.0.0.1:/export/Family Videos'", "vers=3"))}; the other entry ${scrub(await nfsMount("127.0.0.1:/export/Media", "vers=3"))}`,
            );
          } catch (e) {
            fact(
              `item 4: apply with "Family Videos" shared over NFS failed: ${scrub(e.message).slice(0, 300)}`,
            );
          } finally {
            await nfsDelete(r.body.response.uuid);
            await applyIfDirty().catch((e) =>
              fact(
                `item 4: apply after removing it failed: ${scrub(e.message).slice(0, 300)}`,
              ),
            );
          }
        }
      }
      const cyrillic = await newFolder("Фото", "Фото/");
      fact(`item 4: a shared folder named Фото: ${said(cyrillic)}`);
      await applyIfDirty();
      if (cyrillic.status === 200) {
        const r = await nfsShare({
          sharedfolderref: cyrillic.body.response.uuid,
          client: "127.0.0.1",
        });
        fact(`item 4: NFS.setShare for Фото: ${said(r)}`);
        if (r.status === 200) {
          try {
            await applyAll();
            fact(
              `item 4: Фото: exports ${JSON.stringify(scrub(await vmLine("grep 'Фото' /etc/exports || true")))}; NFSv3 /export/Фото ${scrub(await nfsMount("127.0.0.1:/export/Фото", "vers=3", `ls ${MNT} >/dev/null && echo listed;`))}; NFSv4.2 /Фото ${scrub(await nfsMount("127.0.0.1:/Фото", "vers=4.2"))}`,
            );
          } finally {
            await nfsDelete(r.body.response.uuid);
            await applyIfDirty();
          }
        }
      }
    });
    await step("NFS off", async () => {
      for (const uuid of [...made.nfs]) {
        await nfsDelete(uuid);
      }
      await applyIfDirty();
      const off = await s.call("NFS", "setSettings", {
        enable: false,
        versions: before.nfs.versions,
      });
      rec("nfsSetSettings", "turnedOff", off.status, off.body);
      await measured("NFS.setSettings off", off);
      fact(
        `after NFS off: mounted under /export ${JSON.stringify(await vmLine("findmnt -rn -o TARGET | grep '^/export' || true"))}; fstab entries for /export ${(await ok("FsTab", "enumerateEntries")).filter((e) => e.dir?.startsWith("/export")).length}; nfs-server ${await nfsActive()}`,
      );
    });

    // ---- 6. The rsync server: on, folders offered, shapes, pending (items 1, 10) ----
    let mediaModule;
    let photosModule;
    let archiveModule;
    await step("rsync server", async () => {
      const on = await s.call("Rsyncd", "setSettings", {
        enable: true,
        port: before.rsyncd.port,
        extraoptions: before.rsyncd.extraoptions,
      });
      rec("rsyncdSetSettings", "turnedOn", on.status, on.body);
      await measured("Rsyncd.setSettings on", on);
      await capture("rsyncdGetSettings", "on", "Rsyncd", "getSettings");
      const noSignIn = await module({
        sharedfolderref: media.uuid,
        name: "media",
        comment: "Family media",
        hostsallow: "127.0.0.1",
      });
      rec("rsyncdSetModule", "created", noSignIn.status, noSignIn.body);
      mediaModule = noSignIn.body.response?.uuid;
      fact(
        `item 10: setModule reply keys ${Object.keys(noSignIn.body.response ?? {}).join(",")}; users ${JSON.stringify(noSignIn.body.response?.users)}`,
      );
      await measured("Rsyncd.setModule new", noSignIn);
      const signIn = await module({
        sharedfolderref: media.uuid,
        name: "photos",
        readonly: true,
        authusers: true,
        users: [{ name: SIGN_IN, password: syncPassword }],
      });
      photosModule = signIn.body.response?.uuid;
      fact(
        `item 10: setModule with a sign-in: reply users is ${JSON.stringify(Object.keys(signIn.body.response?.users ?? {}))}; its password present ${signIn.body.response?.users?.user?.[0]?.password === syncPassword}`,
      );
      const three = await module({
        sharedfolderref: backup.uuid,
        name: "archive",
        readonly: true,
        authusers: true,
        hostsallow: "127.0.0.0/8",
        users: ["alex", "robin", "sam"].map((name, i) => ({
          name,
          password: archivePasswords[i],
        })),
      });
      archiveModule = three.body.response?.uuid;
      const taken = await module({
        sharedfolderref: backup.uuid,
        name: "media",
      });
      rec("rsyncdSetModule", "nameTaken", taken.status, taken.body);
      fact(`item 10: a second folder offered as media: ${said(taken)}`);
      await applyIfDirty();
      const listed = await capture(
        "rsyncdGetModuleList",
        "several",
        "Rsyncd",
        "getModuleList",
        GET_ALL,
      );
      const row = listed.body.response.data.find(
        (m) => m.uuid === photosModule,
      );
      fact(
        `item 10: getModuleList row keys ${Object.keys(row).join(",")}; users[] keys ${Object.keys(row.users?.[0] ?? {}).join(",")}; the password present and as sent ${row.users?.[0]?.password === syncPassword}; a folder without a sign-in has users ${JSON.stringify(listed.body.response.data.find((m) => m.uuid === mediaModule)?.users)}`,
      );
      const withSignIn = await capture(
        "rsyncdGetModule",
        "withSignIn",
        "Rsyncd",
        "getModule",
        { uuid: photosModule },
      );
      await capture("rsyncdGetModule", "noSignIn", "Rsyncd", "getModule", {
        uuid: mediaModule,
      });
      fact(
        `item 10: getModule keys ${Object.keys(withSignIn.body.response).join(",")}; users[].password present ${withSignIn.body.response.users?.[0]?.password === syncPassword}`,
      );
      fact(
        `item 10: /etc/rsyncd.conf: ${scrub(await vmLine("grep -v '^#' /etc/rsyncd.conf | sed '/^$/d'"))}; the secrets files hold the password ${(await vmLine(`grep -c -F -f - /var/lib/openmediavault/rsyncd-photos.secrets || true`, `${syncPassword}\n`)) === "1"}; secrets file mode ${await vmLine("stat -c '%a %U:%G' /var/lib/openmediavault/rsyncd-photos.secrets")}`,
      );
      const changed = await moduleChange(mediaModule, {
        comment: "Family media, offered",
      });
      rec("rsyncdSetModule", "changed", changed.status, changed.body);
      await measured("Rsyncd.setModule, existing changed", changed);
    });

    await step("rsync server from a client", async () => {
      await vm(
        `printf 'probe\\n' > ${q(`${mount.dir}/probe.txt`)} && chmod 640 ${q(`${mount.dir}/probe.txt`)}`,
      );
      fact(
        `item 10: the module list from 127.0.0.1: ${scrub(await rsyncClient("rsync://127.0.0.1/"))}`,
      );
      fact(
        `item 10: no sign-in, read and write, hosts allow 127.0.0.1: push from 127.0.0.1 ${scrub(await rsyncClient(`${q(`${mount.dir}/probe.txt`)} rsync://127.0.0.1/media/plain.txt`))}; with -a ${scrub(await rsyncClient(`-a ${q(`${mount.dir}/probe.txt`)} rsync://127.0.0.1/media/archive.txt`))}; what landed ${await vmLine(`stat -c '%n %U:%G %a' ${q(`${media.path}/plain.txt`)} ${q(`${media.path}/archive.txt`)}`)}; alex (in users) reads them ${await vmLine(`${asAlex(`cat ${q(`${media.path}/plain.txt`)} ${q(`${media.path}/archive.txt`)}`)} >/dev/null 2>&1 && echo yes || echo no`)}; robin reads them ${await vmLine(`setpriv --reuid=robin --regid=users --init-groups cat ${q(`${media.path}/archive.txt`)} >/dev/null 2>&1 && echo yes || echo no`)}`,
      );
      fact(
        `item 10: pull from it: ${scrub(await rsyncClient(`rsync://127.0.0.1/media/readme.txt ${q(`${mount.dir}/pulled.txt`)}`))}`,
      );
      // Who may connect.
      for (const [label, hostsallow] of [
        [`one address ${OTHER_ADDRESS}`, OTHER_ADDRESS],
        ["a network 127.0.0.0/8", "127.0.0.0/8"],
      ]) {
        await moduleChange(mediaModule, { hostsallow });
        await applyAll();
        fact(
          `item 10: hosts allow ${label}: from 127.0.0.1 ${scrub(await rsyncClient("rsync://127.0.0.1/media/"))}`,
        );
      }
      // Read only.
      await moduleChange(mediaModule, { readonly: true });
      await applyAll();
      fact(
        `item 10: read only: push ${scrub(await rsyncClient(`${q(`${mount.dir}/probe.txt`)} rsync://127.0.0.1/media/ro.txt`))}; pull ${scrub(await rsyncClient(`rsync://127.0.0.1/media/readme.txt ${q(`${mount.dir}/pulled2.txt`)}`))}`,
      );
      // The shared folder's access list.
      const priv = await s.call("ShareMgmt", "setPrivileges", {
        uuid: media.uuid,
        privileges: [{ type: "user", name: "robin", perms: 0 }],
      });
      await moduleChange(mediaModule, {
        readonly: false,
        hostsallow: "127.0.0.1",
      });
      await applyAll();
      fact(
        `item 10: access list robin none (${said(priv)}): push to the module still ${scrub(await rsyncClient(`${q(`${mount.dir}/probe.txt`)} rsync://127.0.0.1/media/after-access.txt`))}`,
      );
      await s.call("ShareMgmt", "setPrivileges", {
        uuid: media.uuid,
        privileges: [],
      });
      // A sign-in.
      fact(
        `item 10: with a sign-in, the right password: ${scrub(await rsyncClient(`rsync://${SIGN_IN}@127.0.0.1/photos/readme.txt ${q(`${mount.dir}/signed.txt`)}`, syncPassword))}`,
      );
      const wrong = await rsyncClient(
        `rsync://${SIGN_IN}@127.0.0.1/photos/readme.txt ${q(`${mount.dir}/signed2.txt`)}`,
        wrongPassword,
      );
      fact(
        `item 10: with a sign-in, a wrong password: ${scrub(hideSecrets(wrong))}; the output holds a password ${secrets.some((p) => wrong.includes(p))}`,
      );
      await vm(
        `rm -f ${["plain.txt", "archive.txt", "ro.txt", "after-access.txt"].map((f) => q(`${media.path}/${f}`)).join(" ")}`,
      );
      await applyIfDirty();
    });

    // ---- 7. Copy jobs: local (items 1, 5, 6, 7) ----
    await vm(
      `cd ${q(media.path)} && mkdir -p sub && printf 'one\\n' > one.txt && printf 'two, older\\n' > two.txt && printf 'three\\n' > sub/three.txt && touch -d '2026-01-01 12:00' two.txt`,
    );
    let local;
    await step("local job: made, pending, run", async () => {
      const r = await job({
        comment: "Media to Backup",
        srcsharedfolderref: media.uuid,
        destsharedfolderref: backup.uuid,
      });
      rec("rsyncSet", "created", r.status, r.body);
      local = r.body.response?.uuid;
      fact(
        `item 5: set's reply keys ${Object.keys(r.body.response ?? {}).join(",")}; schedule fields are ${typeof r.body.response?.minute}; password present ${"password" in (r.body.response ?? {})}`,
      );
      const refused = await s.call("Rsync", "execute", { uuid: local });
      rec("rsyncExecute", "pending", refused.status, refused.body);
      fact(`item 7: execute while rsync is pending: ${said(refused)}`);
      await measured("Rsync.set new", r);
      await capture("rsyncGet", "local", "Rsync", "get", { uuid: local });
      const { r: done, ms, handle } = await runJob(local, "started");
      recordTask("rsyncRun", done);
      fact(
        `item 7: Rsync.execute's reply is a ${typeof handle} of the form ${String(handle).replace(/[A-Za-z0-9]{6}$/, "XXXXXX")}; followed with Exec.getOutput like other tasks; the run ${said(done)} in ${ms} ms`,
      );
      fact(
        `item 6: contents into contents: Backup has one.txt ${await vmLine(`test -f ${q(`${backup.path}/one.txt`)} && echo yes || echo no`)}, has a Media folder ${await vmLine(`test -e ${q(`${backup.path}/Media`)} && echo yes || echo no`)}; output ${JSON.stringify(scrub(outputOf(done)))}`,
      );
      const changed = await jobChange(local, { comment: "Media into Backup" });
      rec("rsyncSet", "changed", changed.status, changed.body);
      await measured("Rsync.set, existing changed", changed);
    });

    await step("local job: newer files replaced, trial, deletion", async () => {
      await vm(
        `cd ${q(backup.path)} && printf 'two, newer here\\n' > two.txt && touch -d '2026-06-01 12:00' two.txt`,
      );
      const { r: again } = await runJob(local);
      fact(
        `item 6: a destination file newer than the source's: ${said(again)}; now ${JSON.stringify(await vmLine(`cat ${q(`${backup.path}/two.txt`)}`))} (the source has "two, older")`,
      );
      await vm(
        `cd ${q(backup.path)} && printf 'only here\\n' > only-here.txt && mkdir -p old-dir/deeper && printf x > old-dir/old.txt && printf y > old-dir/deeper/older.txt; cd ${q(media.path)} && printf 'new\\n' > new.txt && printf 'one, changed\\n' > one.txt`,
      );
      const trialOn = await jobChange(local, {
        optiondryrun: true,
        optiondelete: true,
        optionquiet: false,
      });
      if (trialOn.status !== 200) {
        throw new Error(said(trialOn));
      }
      await applyAll();
      const beforeTrial = await fileList(backup.path);
      const { r: trial } = await runJob(local);
      recordTask("rsyncTrial", trial);
      const afterTrial = await fileList(backup.path);
      const lines = outputOf(trial).split("\n");
      fact(
        `item 6: the trial ${said(trial)}; nothing changed on disk ${beforeTrial === afterTrial}; deleting lines ${lines.filter((l) => l.startsWith("deleting ")).length}; whole output ${JSON.stringify(scrub(outputOf(trial)))}`,
      );
      const real = await jobChange(local, {
        optiondryrun: false,
        optiondelete: true,
      });
      if (real.status !== 200) {
        throw new Error(said(real));
      }
      await applyAll();
      const { r: deleting } = await runJob(local);
      fact(
        `item 6: the real run with deletion ${said(deleting)}; only-here.txt still there ${await vmLine(`test -e ${q(`${backup.path}/only-here.txt`)} && echo yes || echo no`)}; old-dir still there ${await vmLine(`test -e ${q(`${backup.path}/old-dir`)} && echo yes || echo no`)}; output ${JSON.stringify(scrub(outputOf(deleting)))}`,
      );
      const off = await jobChange(local, {
        enable: false,
        optiondelete: false,
      });
      await applyAll();
      await vm(`printf 'when started\\n' > ${q(`${media.path}/manual.txt`)}`);
      const { r: manual } = await runJob(local);
      fact(
        `item 7: a job with enable false (${said(off)}) run with execute: ${said(manual)}; copied ${await vmLine(`test -f ${q(`${backup.path}/manual.txt`)} && echo yes || echo no`)}; in the cron file ${await vmLine(`grep -c ${local} ${CRON_FILE} || true`)}`,
      );
      await jobChange(local, { enable: true });
      await applyAll();
    });

    await step("local job: nested folders", async () => {
      const inner = await folder("Inner", "Media/Inner/");
      const nested = await job({
        srcsharedfolderref: media.uuid,
        destsharedfolderref: inner.uuid,
      });
      fact(
        `item 6: a job from a folder into a folder inside it: ${said(nested)} (not run)`,
      );
      const same = await job({
        srcsharedfolderref: media.uuid,
        destsharedfolderref: media.uuid,
      });
      fact(`item 6: a job from a folder into itself: ${said(same)} (not run)`);
      const empty = await job({
        srcsharedfolderref: "",
        destsharedfolderref: media.uuid,
      });
      fact(`item 6: a local job without a source: ${said(empty)}`);
      for (const r of [nested, same, empty]) {
        if (r.status === 200) {
          await jobDelete(r.body.response.uuid);
        }
      }
      await applyIfDirty();
    });

    // ---- 8. Many files, a second start, Stop, not mounted (item 7) ----
    const bulk = await folder("Bulk");
    const bulkCopy = await folder("BulkCopy");
    await applyAll();
    await step("20,000 files", async () => {
      await vm(
        `cd ${q(bulk.path)} && mkdir many && cd many && seq -w 1 20000 | sed 's/^/file-/' | xargs touch`,
      );
      const uuid = await jobOrThrow({
        srcsharedfolderref: bulk.uuid,
        destsharedfolderref: bulkCopy.uuid,
      });
      await applyAll();
      const { r, ms } = await runJob(uuid);
      const out = outputOf(r);
      fact(
        `item 7: 20,000 small files: ${said(r)} in ${ms} ms; output ${out.length} characters in ${out.split("\n").length} lines; first lines ${JSON.stringify(scrub(out.split("\n").slice(0, 4).join("\n")))}; last lines ${JSON.stringify(scrub(out.split("\n").slice(-6).join("\n")))}`,
      );
      await vm(
        `rm -rf ${q(`${bulk.path}/many`)} ${q(`${bulkCopy.path}/many`)}`,
      );
      await jobDelete(uuid);
      fact(`item 1: Rsync.delete: pending ${await pending()}`);
      await applyAll();
    });
    await step("a second start, then Stop", async () => {
      await vm(`head -c 40000000 /dev/urandom > ${q(`${bulk.path}/big.bin`)}`);
      const uuid = await jobOrThrow({
        srcsharedfolderref: bulk.uuid,
        destsharedfolderref: bulkCopy.uuid,
        extraoptions: "--bwlimit=2000",
      });
      if (!UUID.test(uuid)) {
        throw new Error("unexpected UUID");
      }
      await applyAll();
      const first = await s.call("Rsync", "execute", { uuid });
      if (first.status !== 200) {
        throw new Error(said(first));
      }
      const handle = first.body.response;
      await sleep(3000);
      const lock = `/run/rsync-${uuid}`;
      fact(
        `item 7: lock ${lock} while running: ${await vmLine(`test -e ${lock} && echo present || echo absent`)}`,
      );
      const t = Date.now();
      const second = await runJob(uuid);
      recordTask("rsyncSecondStart", second.r);
      fact(
        `item 7: a second start while the first runs: ${said(second.r)} after ${Date.now() - t} ms; output ${JSON.stringify(scrub(outputOf(second.r)))}`,
      );
      const running = await s.call("Exec", "getOutput", {
        filename: handle,
        pos: 0,
      });
      rec("execGetOutput", "rsyncStoppedRunning", running.status, running.body);
      fact(
        `item 7: the first, half-way: running ${running.body.response?.running}`,
      );
      const stop = await s.call("Exec", "stop", { filename: handle });
      fact(
        `item 7: Exec.stop: ${said(stop)}; reply ${JSON.stringify(stop.body.response)}`,
      );
      const after = await s.call("Exec", "getOutput", {
        filename: handle,
        pos: 0,
      });
      rec("execGetOutput", "rsyncStopped", after.status, after.body);
      fact(
        `item 7: getOutput after Stop: ${said(after)}; right after, lock ${await vmLine(`test -e ${lock} && echo present || echo absent`)}, rsync processes of the job ${await vmLine(`pgrep -fc 'rsync-${uuid}|bwlimit=2000' || true`)}`,
      );
      await sleep(5000);
      fact(
        `item 7: 5 s after Stop: lock ${await vmLine(`test -e ${lock} && echo present || echo absent`)}, rsync processes ${await vmLine(`pgrep -fc 'rsync-${uuid}|bwlimit=2000' || true`)}; big.bin copied ${await vmLine(`test -f ${q(`${bulkCopy.path}/big.bin`)} && echo yes || echo no`)}`,
      );
      for (let i = 0; i < 40; i++) {
        if (
          (await vmLine(`test -e ${lock} && echo present || echo absent`)) ===
          "absent"
        ) {
          break;
        }
        await sleep(1000);
      }
      const fast = await jobChange(uuid, { extraoptions: "" });
      await applyAll();
      const next = await runJob(uuid);
      fact(
        `item 7: the next run after Stop (${said(fast)}): ${said(next.r)} in ${next.ms} ms; big.bin copied ${await vmLine(`cmp -s ${q(`${bulk.path}/big.bin`)} ${q(`${bulkCopy.path}/big.bin`)} && echo yes || echo no`)}`,
      );
      await vm(
        `rm -f ${q(`${bulk.path}/big.bin`)} ${q(`${bulkCopy.path}/big.bin`)}`,
      );
      await jobDelete(uuid);
      await applyAll();
    });

    // ---- 9. Remote jobs: push over SSH with a key, pull from the rsync server (items 8, 13) ----
    let push;
    let pull;
    await step("push over SSH", async () => {
      push = await jobOrThrow({
        comment: "Media to the other computer",
        type: "remote",
        mode: "push",
        srcsharedfolderref: media.uuid,
        desturi: `alex@localhost:${copies.path}/`,
        authentication: "pubkey",
        sshcertificateref: keyUuid,
      });
      await applyAll();
      await capture("rsyncGet", "pushSsh", "Rsync", "get", { uuid: push });
      const keys = await capture(
        "certificateMgmtGetSshList",
        "one",
        "CertificateMgmt",
        "getSshList",
        GET_ALL,
      );
      fact(
        `item 13: getSshList with a job using the key: _used ${keys.body.response.data[0]?._used}`,
      );
      const hostKey = await runJob(push);
      recordTask("rsyncHostKey", hostKey.r);
      fact(
        `item 8: push over SSH to a host not in known_hosts: ${said(hostKey.r)}; output ${JSON.stringify(scrub(outputOf(hostKey.r)))}; known_hosts now ${await vmLine(`test -e ${KNOWN_HOSTS} && echo present || echo absent`)}`,
      );
      made.knownHosts = true;
      await vm(
        `ssh-keyscan -t ed25519,ecdsa,rsa localhost 2>/dev/null >> ${KNOWN_HOSTS}; chmod 600 ${KNOWN_HOSTS}`,
      );
      const pushed = await runJob(push);
      recordTask("rsyncPushSsh", pushed.r);
      fact(
        `item 8: push over SSH after the host is known: ${said(pushed.r)}; Copies has one.txt ${await vmLine(`test -f ${q(`${copies.path}/one.txt`)} && echo yes || echo no`)}, a Media folder ${await vmLine(`test -e ${q(`${copies.path}/Media`)} && echo yes || echo no`)}; owner ${await vmLine(`stat -c '%U:%G %a' ${q(`${copies.path}/one.txt`)}`)}; output ${JSON.stringify(scrub(outputOf(pushed.r)))}`,
      );
      const spaced = await jobChange(push, {
        desturi: `alex@localhost:${copies.path}/With space/`,
      });
      await applyAll();
      const withSpace = await runJob(push);
      fact(
        `item 8: a remote path with a space (${said(spaced)}): ${said(withSpace.r)}; landed in "With space" ${await vmLine(`test -f ${q(`${copies.path}/With space/one.txt`)} && echo yes || echo no`)}; output ${JSON.stringify(scrub(outputOf(withSpace.r)).slice(-400))}`,
      );
      await jobChange(push, { desturi: `alex@localhost:${copies.path}/` });
      await applyAll();
    });
    await step("pull from the rsync server", async () => {
      pull = await jobOrThrow({
        comment: "The other computer's photos to Pulled",
        type: "remote",
        mode: "pull",
        srcuri: `rsync://${SIGN_IN}@localhost/photos/`,
        destsharedfolderref: pulled.uuid,
        authentication: "password",
        password: syncPassword,
      });
      await applyAll();
      const got = await capture("rsyncGet", "pullRsyncd", "Rsync", "get", {
        uuid: pull,
      });
      fact(
        `item 5: get of a pull job: keys ${Object.keys(got.body.response).join(",")}; password present and as sent ${got.body.response.password === syncPassword}`,
      );
      const right = await runJob(pull);
      recordTask("rsyncPullRsyncd", right.r);
      fact(
        `item 8: pull from the rsync server, right password: ${said(right.r)}; Pulled has one.txt ${await vmLine(`test -f ${q(`${pulled.path}/one.txt`)} && echo yes || echo no`)}, a photos folder ${await vmLine(`test -e ${q(`${pulled.path}/photos`)} && echo yes || echo no`)}; output holds a password ${secrets.some((p) => outputOf(right.r).includes(p))}; the script holds it ${(await vmLine(`grep -c -F -f - /var/lib/openmediavault/cron.d/rsync-${pull} || true`, `${syncPassword}\n`)) !== "0"}; script mode ${await vmLine(`stat -c '%a %U:%G' /var/lib/openmediavault/cron.d/rsync-${pull}`)}`,
      );
      await jobChange(pull, { password: wrongPassword });
      await applyAll();
      const wrong = await runJob(pull);
      recordTask("rsyncWrongPassword", wrong.r);
      fact(
        `item 8: pull with a wrong password: ${said(wrong.r)}; output holds a password ${secrets.some((p) => outputOf(wrong.r).includes(p))}; output ${JSON.stringify(hideSecrets(scrub(outputOf(wrong.r))))}`,
      );
      await jobChange(pull, { password: syncPassword });
      await applyAll();
    });
    await step("job shapes", async () => {
      const all = await capture(
        "rsyncGetList",
        "several",
        "Rsync",
        "getList",
        GET_ALL,
      );
      const rows = all.body.response.data;
      fact(
        `item 5: getList row keys ${Object.keys(rows[0]).join(",")}; password per row ${rows.map((x) => (x.password === "" ? "empty" : x.password === syncPassword ? "as sent" : "other")).join(",")}; srcname/destname ${rows
          .map((x) => `${x.srcname}->${x.destname}`)
          .map((t) => t.replace(/localhost/g, "backup.example.org"))
          .join("; ")}`,
      );
      for (const [label, uuid] of [
        ["local", local],
        ["push", push],
        ["pull", pull],
      ]) {
        if (!uuid) {
          continue;
        }
        const g = await ok("Rsync", "get", { uuid });
        fact(
          `item 5: get ${label}: flattened ${["srcsharedfolderref", "srcuri", "destsharedfolderref", "desturi"].filter((k) => k in g).join(",")}; src ${JSON.stringify(Object.keys(g.src ?? {}))}; schedule minute ${JSON.stringify(g.minute)}`,
        );
      }
    });
    await step("source not mounted", async () => {
      await vm(`umount ${q(mount.dir)} && test -d ${q(mount.dir)}`);
      try {
        const { r } = await runJob(local);
        recordTask("rsyncNotMounted", r);
        fact(
          `item 7: a job whose source file system is not mounted: ${said(r)}`,
        );
      } finally {
        await vm(`mount ${q(mount.dir)}`);
      }
      fact(
        `item 7: mounted again ${await vmLine(`mountpoint -q ${q(mount.dir)} && echo yes || echo no`)}`,
      );
    });
    await step("a copy job whose folder is gone", async () => {
      const gone = await folder("GoneRsync");
      await applyAll();
      const uuid = await jobOrThrow({
        srcsharedfolderref: gone.uuid,
        destsharedfolderref: backup.uuid,
      });
      if (!UUID.test(gone.uuid)) {
        throw new Error("unexpected UUID");
      }
      await vm(
        `omv-confdbadm delete --uuid ${gone.uuid} conf.system.sharedfolder`,
      );
      made.folders = made.folders.filter((x) => x !== gone.uuid);
      const r = await capture(
        "rsyncGetList",
        "folderGone",
        "Rsync",
        "getList",
        GET_ALL,
      );
      fact(
        `item 5: getList when a job's folder was removed by hand: ${said(r)}`,
      );
      fact(
        `item 5: get of that job: ${said(await s.call("Rsync", "get", { uuid }))}`,
      );
      fact(`item 5: delete of that job: ${said(await jobDelete(uuid))}`);
      await applyAll();
    });

    // ---- 10. Schedules (item 9) ----
    await step("schedules", async () => {
      const cases = [
        ["every day at 03:00", {}],
        ["every Monday at 03:00", { dayofweek: ["1"] }],
        ["day 15 of every month at 03:00", { dayofmonth: ["15"] }],
        ["every hour at :15", { minute: ["15"], hour: ["*"] }],
        [
          "every 6 hours (everynhour)",
          { minute: ["0"], hour: ["6"], everynhour: true },
        ],
        [
          "every 15 minutes (everynminute)",
          { minute: ["15"], hour: ["*"], everynminute: true },
        ],
        [
          "every 10 days of the month (everyndayofmonth)",
          { dayofmonth: ["10"], everyndayofmonth: true },
        ],
        ["weekday 7 at 03:00", { dayofweek: ["7"] }],
        [
          "several values",
          {
            minute: ["0", "30"],
            hour: ["1", "13"],
            dayofweek: ["1", "3", "5"],
            month: ["1", "7"],
          },
        ],
        ["enable false", { enable: false }],
      ];
      const uuids = [];
      for (const [label, change] of cases) {
        const r = await job({
          srcsharedfolderref: media.uuid,
          destsharedfolderref: backup.uuid,
          ...change,
        });
        uuids.push([
          label,
          r.status === 200 ? r.body.response.uuid : null,
          said(r),
        ]);
      }
      const bad = await job({
        srcsharedfolderref: media.uuid,
        destsharedfolderref: backup.uuid,
        minute: ["75"],
      });
      fact(`item 9: minute 75: ${said(bad)}`);
      if (bad.status === 200) {
        await jobDelete(bad.body.response.uuid);
      }
      await applyAll();
      const cron = await vm(`cat ${CRON_FILE}`);
      for (const [label, uuid, result] of uuids) {
        const line = uuid
          ? cron.split("\n").find((l) => l.includes(uuid))
          : undefined;
        fact(
          `item 9: ${label}: ${uuid ? (line ? JSON.stringify(scrub(line)) : "absent") : result}`,
        );
      }
      fact(
        `item 9: the cron file's head ${JSON.stringify(
          scrub(
            cron
              .split("\n")
              .filter((l) => !l.startsWith("#") && !l.includes("rsync-"))
              .join(" | "),
          ),
        )}`,
      );
      for (const [, uuid] of uuids) {
        if (uuid) {
          await jobDelete(uuid);
        }
      }
      await applyAll();
    });

    // ---- 11. Deleting a job, and the rsync server off (items 1, 13) ----
    await step("delete jobs, rsync server off", async () => {
      if (pull) {
        const del = await jobDelete(pull);
        rec("rsyncDelete", "deleted", del.status, del.body);
        fact(
          `item 5: delete's reply keys ${Object.keys(del.body.response ?? {}).join(",")}; it touched no file: Pulled has one.txt ${await vmLine(`test -f ${q(`${pulled.path}/one.txt`)} && echo yes || echo no`)}`,
        );
        await measured("Rsync.delete", del);
      }
      if (archiveModule) {
        const del = await moduleDelete(archiveModule);
        rec("rsyncdDeleteModule", "removed", del.status, del.body);
        await measured("Rsyncd.deleteModule", del);
      }
      const off = await s.call("Rsyncd", "setSettings", {
        enable: false,
        port: before.rsyncd.port,
        extraoptions: before.rsyncd.extraoptions,
      });
      rec("rsyncdSetSettings", "turnedOff", off.status, off.body);
      await measured("Rsyncd.setSettings off", off);
    });

    // ---- 12. The workgroup and the recycle bin (items 1, 11, 12) ----
    await step("workgroup", async () => {
      const long = await s.call("SMB", "setSettings", {
        ...before.smb,
        workgroup: "WORKGROUP-SIXTEE",
      });
      rec("smbSetSettings", "badWorkgroup", long.status, long.body);
      const colon = await s.call("SMB", "setSettings", {
        ...before.smb,
        workgroup: "WORK:GROUP",
      });
      const fifteen = await s.call("SMB", "setSettings", {
        ...before.smb,
        workgroup: "WORKGROUP-FIFTE",
      });
      const space = await s.call("SMB", "setSettings", {
        ...before.smb,
        workgroup: "HOME OFFICE",
      });
      fact(
        `item 12: workgroup of 16 characters: ${said(long)}; with a colon: ${said(colon)}; of 15 characters: ${said(fifteen)}; with a space: ${said(space)}`,
      );
      await s.call("SMB", "setSettings", before.smb);
      await applyIfDirty();
      const only = await s.call("SMB", "setSettings", {
        ...before.smb,
        workgroup: "EXAMPLE",
      });
      await measured("SMB.setSettings, the workgroup only (SMB off)", only);
      await s.call("SMB", "setSettings", before.smb);
      await applyIfDirty();
    });
    let share;
    await step("recycle bin", async () => {
      await s.call("SMB", "setSettings", { ...before.smb, enable: true });
      await s.call("ShareMgmt", "setPrivileges", {
        uuid: media.uuid,
        privileges: [{ type: "user", name: "alex", perms: 7 }],
      });
      const sh = await smbShare(media.uuid);
      if (sh.status !== 200) {
        throw new Error(said(sh));
      }
      share = sh.body.response.uuid;
      await applyAll();
      const stock = await capture("smbGetShare", "stock", "SMB", "getShare", {
        uuid: share,
      });
      fact(
        `item 11: getShare keys ${Object.keys(stock.body.response).join(",")}; fields beyond setShare's ${
          Object.keys(stock.body.response)
            .filter((k) => !SHARE_FIELDS.includes(k))
            .join(",") || "none"
        }`,
      );
      const binOn = await smbChange(share, {
        recyclebin: true,
        recyclemaxage: 30,
      });
      await measured("SMB.setShare, the recycle bin only", binOn);
      await capture("smbGetShare", "recycleOn", "SMB", "getShare", {
        uuid: share,
      });
      const pendingAgain = await smbChange(share, {});
      fact(
        `a share saved unchanged: ${said(pendingAgain)}; pending ${await pending()}`,
      );
      const refused = await s.call("SMB", "emptyRecycleBin", { uuid: share });
      rec("smbEmptyRecycleBin", "pending", refused.status, refused.body);
      fact(`item 11: emptyRecycleBin while samba is pending: ${said(refused)}`);
      await applyAll();
      await sleep(2000);
      const script = `/var/lib/openmediavault/cron.d/samba-recycle-${share}`;
      fact(
        `item 11: the share's recycle-bin script after apply: ${await vmLine(`test -x ${script} && echo present || echo absent`)}; daily task ${await vmLine("test -x /etc/cron.daily/openmediavault-samba-recycle && echo present || echo absent")}`,
      );
      const put = await smb(
        "Media",
        "alex",
        "put /etc/hostname a.txt; put /etc/hostname b.txt; put /etc/hostname c.txt; mkdir docs; put /etc/hostname docs/d.txt; del a.txt; del b.txt; del c.txt; del docs/d.txt",
      );
      const bin = `${media.path}/.recycle`;
      fact(
        `item 11: files deleted over SMB as alex (${put}): in the recycle bin ${scrub(await vmLine(`cd ${q(media.path)} && find .recycle 2>/dev/null | sort | tr '\\n' ' '; true`))}; .recycle ${await vmLine(`stat -c '%a %U:%G' ${q(bin)} 2>/dev/null; stat -c '%a %U:%G' ${q(`${bin}/alex`)} 2>/dev/null; true`)}`,
      );
      await vm(
        `touch -a -m -d '40 days ago' ${q(`${bin}/alex/a.txt`)} && touch -a -m -d '10 days ago' ${q(`${bin}/alex/b.txt`)}`,
      );
      const daily = await vmLine(`${script} 2>&1; echo "exit $?"`);
      fact(
        `item 11: the share's script without -f (30 days): ${scrub(daily)}; a.txt (40 days) ${await vmLine(`test -e ${q(`${bin}/alex/a.txt`)} && echo kept || echo removed`)}; b.txt (10 days) ${await vmLine(`test -e ${q(`${bin}/alex/b.txt`)} && echo kept || echo removed`)}; c.txt (today) ${await vmLine(`test -e ${q(`${bin}/alex/c.txt`)} && echo kept || echo removed`)}`,
      );
      const started = await s.call("SMB", "emptyRecycleBin", { uuid: share });
      rec("smbEmptyRecycleBin", "started", started.status, started.body);
      if (started.status === 200) {
        const r = await follow(started.body.response);
        recordTask("emptyRecycleBin", r);
        fact(
          `item 11: emptying with files: ${said(r)}; left ${scrub(await vmLine(`cd ${q(media.path)} && find .recycle 2>/dev/null | sort | tr '\\n' ' '; true`))}; output ${JSON.stringify(scrub(outputOf(r)))}`,
        );
        const again = await runTask("SMB", "emptyRecycleBin", { uuid: share });
        recordTask("emptyRecycleBinNothing", again);
        fact(
          `item 11: emptying an empty bin: ${said(again)}; output ${JSON.stringify(scrub(outputOf(again)))}`,
        );
      }
      // The bin turned off keeps .recycle as it was.
      await smb("Media", "alex", "put /etc/hostname e.txt; del e.txt");
      const kept = await fileList(bin);
      await smbChange(share, { recyclebin: false });
      await applyAll();
      fact(
        `item 11: the bin turned off: .recycle as it was ${(await fileList(bin)) === kept}; the script ${await vmLine(`test -e ${script} && echo present || echo absent`)}`,
      );
      const binOff = await runTask("SMB", "emptyRecycleBin", { uuid: share });
      recordTask("emptyRecycleBinBinOff", binOff);
      fact(
        `item 11: emptying with the bin off: ${said(binOff)}; output ${JSON.stringify(scrub(outputOf(binOff)))}`,
      );
      await smbChange(share, { recyclebin: true, recyclemaxage: 30 });
      await s.call("SMB", "setSettings", {
        ...(await ok("SMB", "getSettings")),
        enable: false,
      });
      await applyAll();
      const smbOff = await runTask("SMB", "emptyRecycleBin", { uuid: share });
      recordTask("emptyRecycleBinSmbOff", smbOff);
      fact(
        `item 11: emptying with SMB off (bin on): ${said(smbOff)}; the script ${await vmLine(`test -e ${script} && echo present || echo absent`)}; output ${JSON.stringify(scrub(outputOf(smbOff)))}`,
      );
    });
  } finally {
    // Leave the VM as it was.
    try {
      await vm(
        `umount -l ${MNT} 2>/dev/null; rmdir ${MNT} 2>/dev/null; true`,
      ).catch(() => {});
      // None existed before this run, so every one left is this run's.
      for (const j of await list("Rsync", "getList").catch(() => [])) {
        await s.call("Rsync", "delete", { uuid: j.uuid });
      }
      for (const uuid of made.jobs) {
        await s.call("Rsync", "delete", { uuid });
      }
      for (const m of await list("Rsyncd", "getModuleList").catch(() => [])) {
        await s.call("Rsyncd", "deleteModule", { uuid: m.uuid });
      }
      for (const uuid of made.nfs) {
        await s.call("NFS", "deleteShare", { uuid });
      }
      for (const n of await list("NFS", "getShareList").catch(() => [])) {
        await s.call("NFS", "deleteShare", { uuid: n.uuid });
      }
      for (const uuid of made.smb) {
        await s.call("SMB", "deleteShare", { uuid });
      }
      await s.call("NFS", "setSettings", {
        enable: before.nfs.enable,
        versions: before.nfs.versions,
      });
      await s.call("Rsyncd", "setSettings", {
        enable: before.rsyncd.enable,
        port: before.rsyncd.port,
        extraoptions: before.rsyncd.extraoptions,
      });
      if (
        JSON.stringify(await ok("SMB", "getSettings")) !==
        JSON.stringify(before.smb)
      ) {
        await s.call("SMB", "setSettings", before.smb);
      }
      if (
        JSON.stringify(await ok("SSH", "get")) !== JSON.stringify(before.ssh)
      ) {
        await s.call("SSH", "set", before.ssh);
      }
      await applyIfDirty();
      for (const uuid of made.keys) {
        const r = await s.call("CertificateMgmt", "deleteSsh", { uuid });
        if (r.status !== 200) {
          fact(`cleanup: the SSH key was not deleted (${said(r)})`);
        }
      }
      for (const name of made.people) {
        const r = await s.call("UserMgmt", "deleteUser", { name });
        if (r.status !== 200) {
          fact(`cleanup: a test person was not deleted (${said(r)})`);
        }
      }
      await applyIfDirty();
      const existing = new Set(before.folders.map((f) => f.uuid));
      for (const uuid of [...made.folders].reverse()) {
        if (!existing.has(uuid)) {
          await s.call("ShareMgmt", "delete", { uuid, recursive: false });
        }
      }
      for (const f of await folders()) {
        if (!existing.has(f.uuid)) {
          fact(
            `cleanup: a shared folder of this run is still there (${f.name})`,
          );
        }
      }
      await applyIfDirty();
      const fstabBefore = new Set(before.fstab.map((e) => e.uuid));
      for (const e of await ok("FsTab", "enumerateEntries")) {
        if (!fstabBefore.has(e.uuid) && e.dir?.startsWith("/export")) {
          await s.call("FsTab", "delete", { uuid: e.uuid });
          fact("cleanup: an /export mount entry was left; removed");
        }
      }
      await applyIfDirty();
      // A bind mount OMV left under /export (a folder name with a space is written to fstab as
      // \040, and mounted at a folder of that literal name). /proc/self/mounts escapes the target
      // in octal, so printf %b gives back the real path. /export was empty before this run.
      await vm(
        'awk \'$2 ~ "^/export/" {print $2}\' /proc/self/mounts | while read -r m; do umount -l "$(printf \'%b\' "$m")"; done; find /export -mindepth 1 -maxdepth 1 -type d -empty -delete; true',
      );
      if (made.mount?.dir) {
        await s.call("FileSystemMgmt", "umountByDir", { dir: made.mount.dir });
      }
      await applyIfDirty();
      if (made.wiped) {
        await runTask("DiskMgmt", "wipe", {
          devicefile: opts.disk,
          secure: false,
        });
      }
      await ok("DiskMgmt", "rescan");
      if (vmBefore.knownHosts === "absent") {
        await vm(`rm -f ${KNOWN_HOSTS}`);
      } else {
        await vm(`mv -f ${KNOWN_HOSTS_BACKUP} ${KNOWN_HOSTS}`);
      }
      if (vmBefore.rsyncLog === "absent") {
        await vm(`rm -f ${RSYNC_LOG}`);
      } else if (/^\d+$/.test(vmBefore.rsyncLog)) {
        await vm(`truncate -s ${vmBefore.rsyncLog} ${RSYNC_LOG}`);
      }
      await vm("rm -f /tmp/logfile*; rm -rf /home/alex /home/robin");

      // ---- The VM as it was? ----
      const nfsNow = await ok("NFS", "getSettings");
      const rsyncdNow = await ok("Rsyncd", "getSettings");
      const smbNow = await ok("SMB", "getSettings");
      const sshNow = await ok("SSH", "get");
      const fstabNow = await ok("FsTab", "enumerateEntries");
      const foldersNow = await folders();
      const usersNow = (await users()).map((u) => u.name);
      const cronNow = await ok("Cron", "getList", {
        ...GET_ALL,
        type: ["reboot", "shutdown", "standby", "userdefined"],
      });
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      fact(
        `after cleanup: dirtymodules.json ${await vmLine("cat /var/lib/openmediavault/dirtymodules.json")}; FsTab entries ${fstabNow.length} (was ${before.fstab.length}, same ${same(fstabNow.map((e) => e.uuid).sort(), before.fstab.map((e) => e.uuid).sort())}); shared folders ${foldersNow.map((f) => f.name).join(",")} (same ${same(foldersNow.map((f) => f.uuid).sort(), before.folders.map((f) => f.uuid).sort())}); accounts same ${same([...usersNow].sort(), [...before.users].sort())}`,
      );
      fact(
        `after cleanup: NFS as before ${same({ e: nfsNow.enable, v: nfsNow.versions }, { e: before.nfs.enable, v: before.nfs.versions })}; rsync server as before ${same(rsyncdNow, before.rsyncd)}; SMB as before ${same(smbNow, before.smb)}; SSH as before ${same(sshNow, before.ssh)}; cron list as before ${same(cronNow, before.cron)}`,
      );
      fact(
        `after cleanup: NFS shares ${(await list("NFS", "getShareList")).length}; copy jobs ${(await list("Rsync", "getList")).length}; rsync server folders ${(await list("Rsyncd", "getModuleList")).length}; SMB shares ${(await list("SMB", "getShareList")).length}; SSH keys ${(await list("CertificateMgmt", "getSshList")).length}; key files in /etc/ssh ${await vmLine("ls /etc/ssh/openmediavault-* 2>/dev/null | wc -l")} (was ${vmBefore.sshKeyFiles})`,
      );
      fact(
        `after cleanup: wipefs -n lines sdb sdc sdd sde: ${await vmLine("for d in sdb sdc sdd sde; do printf '%s ' $(wipefs -n /dev/$d | wc -l); done")}; /tmp/logfile* ${await vmLine("ls /tmp/logfile* 2>/dev/null | wc -l")}; known_hosts ${vmBefore.knownHosts === "absent" ? `absent as before: ${await vmLine(`test -e ${KNOWN_HOSTS} && echo no || echo yes`)}` : `restored: ${(await vmLine(`sha256sum ${KNOWN_HOSTS} | cut -d' ' -f1`)) === vmBefore.knownHosts}`}; rsync log ${await vmLine(`if test -e ${RSYNC_LOG}; then stat -c %s ${RSYNC_LOG}; else echo absent; fi`)} (was ${vmBefore.rsyncLog}); /export mounts ${await vmLine("findmnt -rn -o TARGET | grep -c '^/export' || true")}, entries ${await vmLine("ls -A /export 2>/dev/null | wc -l")}; ${MNT} ${await vmLine(`test -e ${MNT} && echo present || echo absent`)}`,
      );
      fact(
        `after cleanup: /etc/exports as before ${(await vmLine("sha256sum /etc/exports | cut -d' ' -f1")) === vmBefore.exports}; the rsync cron file as before ${(await vmLine(`sha256sum ${CRON_FILE} 2>/dev/null | cut -d' ' -f1; true`)) === vmBefore.cronFile}; /etc/rsyncd.conf as before ${(await vmLine("sha256sum /etc/rsyncd.conf 2>/dev/null | cut -d' ' -f1; true")) === vmBefore.rsyncdConf}; rsync job scripts ${await vmLine("ls /var/lib/openmediavault/cron.d/ | grep -c '^rsync-' || true")}; recycle scripts ${await vmLine("ls /var/lib/openmediavault/cron.d/ | grep -c '^samba-recycle-' || true")}; home folders of test people ${await vmLine("ls -d /home/alex /home/robin 2>/dev/null | wc -l")}`,
      );
    } catch (e) {
      fact(
        `CLEANUP FAILED: ${scrub(e.message).slice(0, 400)}; the VM may need its snapshot`,
      );
    } finally {
      await s.call("Session", "logout");
      // Re-read every example this run wrote: nothing of the VM, no loopback, no test password.
      for (const file of written) {
        const text = fs.readFileSync(path.join(EXAMPLES, file), "utf8");
        const leaks = [
          [env.NAS_HOST && text.includes(env.NAS_HOST), "the host"],
          [secrets.some((p) => text.includes(p)), "a test password"],
          [LOOPBACK_LEFT.test(text), "a loopback address or localhost"],
          [
            vmName.length > 3 &&
              vmName !== "openmediavault" &&
              text.includes(vmName),
            "the VM's name",
          ],
        ].filter(([leak]) => leak);
        if (leaks.length) {
          results.push(
            `FAIL  ${file}: re-read found ${leaks.map(([, w]) => w).join(", ")}`,
          );
        }
      }
      for (const line of [
        ...results,
        ...facts.map((f) => hideSecrets(scrub(f))),
      ]) {
        console.log(line);
      }
      if (results.some((l) => l.startsWith("FAIL"))) {
        process.exitCode = 1;
      }
    }
  }
}

main().catch((err) => {
  // The message is ours, the network's or the server's; it never carries a credential.
  console.error(`capture failed: ${err.message}`);
  process.exitCode = 1;
});
