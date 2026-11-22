#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Record the users domain's replies on the disposable test VM (design phase-5-users 18.2): people
// and groups read, made, changed and deleted, passwords set, administrator rights and SSH sign-in
// given and taken away, home folders turned on and off, and the server's refusals met on the way.
// It also signs in as the test people (here, over SSH and SFTP, and to SMB from a client) to see
// what each change does, and when. ERASES THE DISK IT IS GIVEN.
//
//   node tools/contract-capture/users.mjs --disk /dev/sdb --ssh <destination> \
//     --key <private key file> [--smbclient <docker image>] [--many 300]
//
// Only for the test VM in $OMV_WEBUI_ENV (default ~/.config/omv-webui/test.env), never the owner's
// server. It refuses to start while configuration changes are pending, while home folders are on,
// while any SMB share exists, when a test name is already an account or a group, and for a disk the
// server's candidate list does not offer. Its people and groups carry documentation names, with
// passwords that exist only in this process. It never changes an account or a group it did not
// make, with one exception it undoes: the home folders setting acts on every person, so each
// existing person's home folder path is read first and put back exactly afterwards.
//
// --ssh runs fixed, test-only commands on the VM, each with values this tool has checked: `stat` and
// `test -d` of a home folder, `ls -ln`, writing a small file as a test person, `groupadd`/`groupdel`
// of a group named here (one OMV holds no record for), putting an existing person's home folder path
// back with `usermod --home`, and reading `getent passwd` lines. --key is a private key made for
// the run; its public half is given to a test person to check key sign-in. --smbclient names a local
// Docker image with Samba's smbclient, run with the test person's password in its environment.
// Password sign-in over SSH and SFTP is driven by `expect`, with the password in its environment.
//
// It ends, also after a failure, by removing every person, group, SMB share and shared folder it
// made, restoring the home folders, SSH and SMB settings it read first, unmounting its file system,
// applying what is pending and quick-wiping the disk. Replies are scrubbed and verified as by
// capture.mjs and written as draft examples the same way. Credentials, the host, the passwords and
// the disk's identifiers are never printed.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ENV_PATH,
  Session,
  followTask,
  loadEnv,
  openCapture,
} from "./capture.mjs";

const GET_ALL = { start: 0, limit: null, sortfield: null, sortdir: null };
const GET_ALL_SEARCH = { ...GET_ALL, search: null };
const NEW = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
const DISK = /^\/dev\/sd[b-z]$/;
const SSH_DESTINATION = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const IMAGE = /^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]+)?$/;
// An account or group name this tool sends to a shell: OMV's own format, nothing else.
const NAME = /^[a-zA-Z0-9_.][a-zA-Z0-9_.-]*\$?$/;
// A home folder path this tool reads: under /srv or /home, or OMV's /nonexistent.
const SAFE_PATH = /^\/(?:srv|home)\/[A-Za-z0-9._/-]+$|^\/nonexistent$/;
// Documentation names (design 15.2), never the owner's.
const PEOPLE = ["alex", "robin", "sam"];
const TEAM = "example-team";
const KIDS = "example-kids";
const OUTSIDE = "example-outside";
const NOLOGIN = "/usr/sbin/nologin";
const SH = "/usr/bin/sh";
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

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (!["--disk", "--ssh", "--key", "--smbclient", "--many"].includes(flag)) {
      throw new Error(`unknown argument ${flag}`);
    }
    out[flag.slice(2)] = value;
  }
  if (!DISK.test(String(out.disk))) {
    throw new Error("--disk takes a whole-disk device file such as /dev/sdb");
  }
  if (!SSH_DESTINATION.test(String(out.ssh))) {
    throw new Error("--ssh takes an ssh destination such as omv8vm");
  }
  if (!out.key || !fs.existsSync(out.key) || !fs.existsSync(`${out.key}.pub`)) {
    throw new Error("--key takes a private key file with its .pub beside it");
  }
  if (out.smbclient !== undefined && !IMAGE.test(out.smbclient)) {
    throw new Error("--smbclient takes a local Docker image name");
  }
  out.many = out.many === undefined ? 300 : Number(out.many);
  if (!Number.isInteger(out.many) || out.many < 0 || out.many > 500) {
    throw new Error("--many takes a number of people from 0 to 500");
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

/** Run one fixed command on the VM over ssh and return its standard output. */
async function ssh(destination, command) {
  const r = await run("ssh", ["-o", "BatchMode=yes", destination, command]);
  if (r.code !== 0) {
    throw new Error(`a test-only command on the VM failed (${r.code})`);
  }
  return r.out;
}

const checkedName = (name) => {
  if (!NAME.test(name)) {
    throw new Error("a name this tool did not expect");
  }
  return name;
};

const noRecord = () => {};

async function main() {
  const opts = args(process.argv.slice(2));
  const env = loadEnv(ENV_PATH);
  const { base, record, results, scrub } = await openCapture(env);
  // The run is long, and a slow client check can outlast the idle timeout: a call answered 401 was
  // not run, so it signs in again and makes the call once more.
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
  const facts = [];
  const fact = (line) => facts.push(line);
  const secret = () => randomBytes(18).toString("base64url");
  const passwords = new Map(PEOPLE.map((p) => [p, secret()]));
  const publicKey = fs.readFileSync(`${opts.key}.pub`, "utf8").trim();
  const protectedNames = new Set(
    [
      "admin",
      env.OMV_ADMIN_USER,
      env.OMV_USER,
      env.OMV_STOCK_ADMIN_USER,
      env.OMV_2FA_USER,
    ].filter(Boolean),
  );

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
    record(operationId, name, r.status, r.body);
    return r;
  };
  const said = (r) =>
    r.status === 200
      ? "accepted"
      : `HTTP ${r.status}: ${scrub(r.body.error?.message ?? "").slice(0, 200)}`;
  const dirtyModules = async () => {
    const info = await ok("System", "getInformation");
    const m = info.dirtyModules;
    return m && !Array.isArray(m) ? Object.keys(m).sort() : [];
  };
  const pending = async () => (await dirtyModules()).join(" ") || "(none)";
  const runTask = async (service, method, params, name, rec = noRecord) => {
    const started = await s.call(service, method, params);
    if (started.status !== 200) {
      throw new Error(`${service}.${method} failed (HTTP ${started.status})`);
    }
    return followTask(s, started.body.response, name, rec, {}, { tries: 2400 });
  };
  const applyAll = async () => {
    const t = Date.now();
    const last = await runTask(
      "Config",
      "applyChangesBg",
      { modules: [], force: false },
      "apply",
    );
    if (last.status !== 200) {
      throw new Error("applying the pending changes failed");
    }
    return Math.round((Date.now() - t) / 100) / 10;
  };
  const applyIfDirty = async () => {
    if ((await ok("Config", "isDirty")) !== false) {
      await applyAll();
    }
  };
  /** A sub-test: its failure is a fact, and the run goes on to the next. */
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      fact(`STEP FAILED ${name}: ${scrub(e.message).slice(0, 300)}`);
      await applyIfDirty().catch(() => {});
    }
  };
  const users = async () =>
    (await ok("UserMgmt", "getUserList", GET_ALL_SEARCH)).data;
  const groups = async () =>
    (await ok("UserMgmt", "getGroupList", GET_ALL_SEARCH)).data;
  const getUser = (name) => s.call("UserMgmt", "getUser", { name });
  const userOf = async (name) => ok("UserMgmt", "getUser", { name });
  const groupOf = async (name) => ok("UserMgmt", "getGroup", { name });
  const passwdLine = async (name) =>
    (
      await ssh(opts.ssh, `getent passwd '${checkedName(name)}' || true`)
    ).trim();

  // What this tool made, removed again at the end.
  const made = {
    people: new Set(),
    groups: new Set(),
    outside: false,
    folders: [],
    shares: [],
    fs: null,
    wiped: false,
  };
  const person = (name, change = {}) => ({
    name,
    groups: ["users"],
    shell: NOLOGIN,
    password: passwords.get(name) ?? "",
    email: "",
    comment: "",
    disallowusermod: false,
    sshpubkeys: [],
    ...change,
  });
  const setUser = async (params) => {
    if (protectedNames.has(params.name)) {
      throw new Error("refused: an account this tool must not change");
    }
    const r = await s.call("UserMgmt", "setUser", params);
    if (r.status === 200) {
      made.people.add(params.name);
    }
    return r;
  };
  /** Write back as read, with a change: read, change, write (design 0.11). */
  const rmw = async (name, change) => {
    const u = await userOf(name);
    return setUser({
      name,
      groups: u.groups,
      shell: u.shell,
      password: "",
      email: u.email,
      comment: u.comment,
      disallowusermod: u.disallowusermod,
      sshpubkeys: u.sshpubkeys,
      ...change,
    });
  };
  const setGroup = async (params) => {
    const r = await s.call("UserMgmt", "setGroup", params);
    if (r.status === 200) {
      made.groups.add(params.name);
    }
    return r;
  };
  const deleteUser = async (name) => {
    const r = await s.call("UserMgmt", "deleteUser", { name });
    if (r.status === 200) {
      made.people.delete(name);
    }
    return r;
  };
  const deleteGroup = async (name) => {
    const r = await s.call("UserMgmt", "deleteGroup", { name });
    if (r.status === 200) {
      made.groups.delete(name);
    }
    return r;
  };
  /** Sign in to this web interface as a test person: their role, or why not. */
  const webRole = async (name, password = passwords.get(name)) => {
    const w = new Session(base);
    const r = await w.call("Session", "login", { username: name, password });
    if (r.status !== 200) {
      return `refused (HTTP ${r.status})`;
    }
    const role = r.body.response?.permissions?.role ?? "unknown";
    await w.call("Session", "logout");
    return role;
  };
  /**
   * Sign in over SSH (`true`) or SFTP (`ls`) with a password. The password reaches ssh through an
   * askpass helper that prints it from its environment; it is never on a command line or a file.
   */
  const askpass = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "webui-askpass-")),
    "askpass.sh",
  );
  fs.writeFileSync(askpass, '#!/bin/sh\nprintf "%s\\n" "$PASSWD"\n', {
    mode: 0o700,
  });
  const sshPassword = async (
    name,
    kind = "ssh",
    password = passwords.get(name),
  ) => {
    const common = [
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "PubkeyAuthentication=no",
      "-o",
      "PreferredAuthentications=password",
      "-o",
      "NumberOfPasswordPrompts=1",
      "-o",
      "ConnectTimeout=10",
    ];
    const target = `${checkedName(name)}@${env.NAS_HOST}`;
    const r = await run(
      kind === "ssh" ? "ssh" : "sftp",
      kind === "ssh" ? [...common, target, "true"] : [...common, target],
      {
        PASSWD: password,
        SSH_ASKPASS: askpass,
        SSH_ASKPASS_REQUIRE: "force",
        DISPLAY: "none",
      },
      kind === "ssh" ? "" : "ls\nbye\n",
    );
    return r.code === 0 ? "signed in" : `refused (${r.code})`;
  };
  const sshKey = async (name) => {
    const r = await run("ssh", [
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "IdentitiesOnly=yes",
      "-o",
      "ConnectTimeout=10",
      "-i",
      opts.key,
      `${checkedName(name)}@${env.NAS_HOST}`,
      "true",
    ]);
    return r.code === 0 ? "signed in" : `refused (${r.code})`;
  };
  const smb = async (
    name,
    command,
    share = null,
    password = passwords.get(name),
  ) => {
    if (!opts.smbclient) {
      return "not checked (no --smbclient)";
    }
    const target = share === null ? "-L //$NAS_HOST" : `"//$NAS_HOST/${share}"`;
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
        `smbclient ${target} -U ${checkedName(name)}%"$PASSWD" ${command ? `-c '${command}'` : ""} 2>&1`,
      ],
      { PASSWD: password, NAS_HOST: env.NAS_HOST },
    );
    const status = /NT_STATUS_[A-Z_]+/.exec(r.out)?.[0];
    return status ?? (r.code === 0 ? "OK" : `exit ${r.code}`);
  };
  const smbShares = async (name) => {
    if (!opts.smbclient) {
      return "not checked";
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
        `smbclient -L //$NAS_HOST -U ${checkedName(name)}%"$PASSWD" 2>&1`,
      ],
      { PASSWD: passwords.get(name), NAS_HOST: env.NAS_HOST },
    );
    const listed = [...r.out.matchAll(/^\s+(\S+)\s+Disk/gm)].map((m) => m[1]);
    return listed.length
      ? listed
          .map((n) =>
            PEOPLE.includes(n) || ["Media", "homes", "IPC$"].includes(n)
              ? n
              : "(other)",
          )
          .join(" ")
      : (/NT_STATUS_[A-Z_]+/.exec(r.out)?.[0] ?? "none");
  };
  const homeOf = async (name) => {
    const dir = (await userOf(name)).dir;
    if (!SAFE_PATH.test(dir)) {
      return "(a path this tool does not read)";
    }
    const r = await ssh(
      opts.ssh,
      `if test -d '${dir}'; then stat -c '%a %U %G' '${dir}'; else echo missing; fi`,
    );
    return `${dir.replace(/^\/srv\/[^/]+/, "/srv/<fs>")}: ${r.trim()}`;
  };

  // ---- preconditions ----
  if ((await ok("Config", "isDirty")) !== false) {
    throw new Error(
      "the VM has pending configuration changes; apply or revert them first",
    );
  }
  const homeBefore = await ok("UserMgmt", "getSettings");
  if (homeBefore.enable !== false) {
    throw new Error(
      "home folders are on; this tool runs only while they are off",
    );
  }
  if ((await ok("SMB", "getShareList", GET_ALL)).data.length !== 0) {
    throw new Error(
      "the VM has SMB shares; this tool runs only on a VM without any",
    );
  }
  const usersBefore = await users();
  const groupsBefore = await groups();
  const taken = new Set([
    ...usersBefore.map((u) => u.name),
    ...groupsBefore.map((g) => g.name),
  ]);
  for (const n of [...PEOPLE, TEAM, KIDS, OUTSIDE, "add"]) {
    if (taken.has(n) || (await getUser(n)).status === 200) {
      throw new Error("a test name is already in use; remove it first");
    }
  }
  const smbBefore = await ok("SMB", "getSettings");
  const sshBefore = await ok("SSH", "get");
  const existingFolders = new Set(
    (await ok("ShareMgmt", "getList", GET_ALL)).data.map((f) => f.uuid),
  );
  // Every existing person's passwd line, put back exactly if the home folders setting changes it.
  // OMV's own records of people and groups: a refused new name can leave one behind (design 6.6).
  const recordNames = async (model) =>
    JSON.parse(await ssh(opts.ssh, `omv-confdbadm read ${model}`)).map((o) => ({
      uuid: o.uuid,
      name: o.name,
    }));
  const recordsBefore = {
    user: new Set(
      (await recordNames("conf.system.usermngmnt.user")).map((o) => o.uuid),
    ),
    group: new Set(
      (await recordNames("conf.system.usermngmnt.group")).map((o) => o.uuid),
    ),
  };
  const passwdBefore = new Map();
  for (const u of usersBefore) {
    passwdBefore.set(u.name, await passwdLine(u.name));
  }
  const candidatesJson = await runTask(
    "FileSystemMgmt",
    "getCandidatesBg",
    {},
    "fsCandidates",
  );
  const offered = new Set(
    JSON.parse(candidatesJson.body.response.output).map((c) => c.devicefile),
  );
  if (!offered.has(opts.disk)) {
    throw new Error(
      `${opts.disk} is not among the server's candidates; nothing was changed`,
    );
  }

  let mount = null;
  try {
    // ---- 1. Reads, before anything changes (items 1 and 2) ----
    await step("reads", async () => {
      const missing = await capture(
        "userMgmtGetUser",
        "missing",
        "UserMgmt",
        "getUser",
        { name: "alex" },
      );
      fact(
        `item 1: getUser for a missing name: ${said(missing)}; code ${missing.body.error?.code}`,
      );
      const missingGroup = await capture(
        "userMgmtGetGroup",
        "missing",
        "UserMgmt",
        "getGroup",
        { name: TEAM },
      );
      fact(
        `item 1: getGroup for a missing name: ${said(missingGroup)}; code ${missingGroup.body.error?.code}`,
      );
      const badName = await s.call("UserMgmt", "getUser", { name: "-alex" });
      fact(
        `item 1: getUser for a name OMV's pattern refuses: ${said(badName)}; code ${badName.body.error?.code}`,
      );
      record("userMgmtGetUser", "invalidName", badName.status, badName.body);
      for (const n of ["admin", "root", "nobody"]) {
        const r = await getUser(n);
        const u = r.body.response ?? {};
        fact(
          `item 1: getUser ${n}: ${said(r)}; system ${u.system}; uid ${u.uid}; shell ${u.shell}; dir ${u.dir}; groups ${(u.groups ?? []).join(",")}`,
        );
        if (n === "admin") {
          record("userMgmtGetUser", "builtInAdmin", r.status, r.body);
        }
      }
      if (env.OMV_ADMIN_USER) {
        const r = await getUser(env.OMV_ADMIN_USER);
        record("userMgmtGetUser", "administrator", r.status, r.body);
        fact(
          `item 1: getUser for the test administrator: system ${r.body.response?.system}`,
        );
      }
      for (const g of [
        "_ssh",
        "openmediavault-admin",
        "users",
        "root",
        "sudo",
      ]) {
        const r = await s.call("UserMgmt", "getGroup", { name: g });
        fact(
          `item 2: getGroup ${g}: ${said(r)}; system ${r.body.response?.system}; gid ${r.body.response?.gid}; members ${(r.body.response?.members ?? []).length}`,
        );
        if (g === "_ssh") {
          record("userMgmtGetGroup", "sshGroup", r.status, r.body);
        }
        if (g === "openmediavault-admin") {
          record("userMgmtGetGroup", "adminGroup", r.status, r.body);
        }
      }
      await capture("userMgmtGetSettings", "off", "UserMgmt", "getSettings");
      fact(`item 10: getSettings before: ${JSON.stringify(homeBefore)}`);
      const listed = usersBefore.map((u) => u.name);
      fact(
        `item 1: getUserList lists admin ${listed.includes("admin")}, root ${listed.includes("root")}; ${listed.length} people`,
      );
    });

    // ---- 2. A scratch file system, a shared folder shared over SMB, SMB on ----
    const created = await runTask(
      "FileSystemMgmt",
      "create",
      { devicefile: opts.disk, type: "ext4" },
      "createExt4",
    );
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
    made.fs = mount;
    await applyAll();
    const newFolder = async (name, reldirpath) => {
      const f = await ok("ShareMgmt", "set", {
        uuid: NEW,
        name,
        comment: "",
        mntentref: mount.uuid,
        reldirpath,
        mode: "770",
      });
      made.folders.push(f.uuid);
      return f;
    };
    const media = await newFolder("Media", "Media/");
    const homes = await newFolder("Homes", "Homes/");
    const whole = await newFolder("Whole", "/").catch((e) => {
      fact(
        `item 10 (P12): a shared folder for the whole file system: ${scrub(e.message).slice(0, 200)}`,
      );
      return null;
    });
    await applyAll();
    const share = await ok("SMB", "setShare", {
      ...SHARE_DEFAULTS,
      uuid: NEW,
      sharedfolderref: media.uuid,
    });
    made.shares.push(share.uuid);
    await ok("SMB", "setSettings", { ...smbBefore, enable: true });
    await applyAll();

    // ---- 3. A new person (item 3) ----
    await step("item 3", async () => {
      const r = await setUser(
        person("alex", { email: "alex@example.org", comment: "Alex at home" }),
      );
      record("userMgmtSetUser", "created", r.status, r.body);
      fact(`item 3: setUser new, no-login shell, groups [users]: ${said(r)}`);
      fact(`item 3: pending after a new person: ${await pending()}`);
      const u = await userOf("alex");
      fact(
        `item 3: the new person's shell ${u.shell}; groups ${u.groups.join(",")}; uid ${u.uid}; gid ${u.gid}; home ${await homeOf("alex")}`,
      );
      const got = await getUser("alex");
      record("userMgmtGetUser", "person", got.status, got.body);
      const robin = await setUser(
        person("robin", { shell: SH, groups: ["users", "_ssh"] }),
      );
      fact(
        `item 3: setUser new with ${SH} and _ssh: ${said(robin)}; pending ${await pending()}`,
      );
      const sam = await setUser(person("sam", { groups: [] }));
      fact(
        `item 3: setUser new with groups []: ${said(sam)}; groups then ${(await userOf("sam")).groups.join(",")}`,
      );
      fact(
        `item 3: web sign-in as the new person, before Apply: ${await webRole("alex")}`,
      );
      fact(
        `item 5: SMB as the new person, before Apply: ${await smb("alex", "")}`,
      );
      await applyAll();
      fact(
        `item 5: SMB as the new person, after Apply: ${await smb("alex", "")}`,
      );
    });

    // ---- 4. Changing a person (item 4) ----
    await step("item 4", async () => {
      const g = await setGroup({ name: TEAM, comment: "", members: [] });
      fact(
        `item 9: setGroup new, empty: ${said(g)}; pending ${await pending()}`,
      );
      record("userMgmtSetGroup", "created", g.status, g.body);
      await applyIfDirty();
      await setGroup({ name: KIDS, comment: "Children", members: [] });
      await applyIfDirty();
      const all = await rmw("alex", { groups: ["users", TEAM, KIDS, "audio"] });
      record("userMgmtSetUser", "changed", all.status, all.body);
      fact(
        `item 4: groups set to users, two groups and audio: ${said(all)}; groups then ${(await userOf("alex")).groups.join(",")}; pending ${await pending()}`,
      );
      await applyIfDirty();
      const less = await rmw("alex", { groups: ["users", TEAM] });
      fact(
        `item 4: groups set to users and one group: ${said(less)}; groups then ${(await userOf("alex")).groups.join(",")}`,
      );
      const empty = await rmw("alex", { groups: [] });
      fact(
        `item 4: groups []: ${said(empty)}; groups then ${(await userOf("alex")).groups.join(",")}`,
      );
      const onlyUsers = await rmw("alex", { groups: ["users"] });
      fact(
        `item 4: groups [users]: ${said(onlyUsers)}; groups then ${(await userOf("alex")).groups.join(",")}`,
      );
      const missingGroup = await rmw("alex", {
        groups: ["users", "example-nogroup"],
      });
      record(
        "userMgmtSetUser",
        "groupMissing",
        missingGroup.status,
        missingGroup.body,
      );
      fact(`item 4: a group that does not exist: ${said(missingGroup)}`);
      await applyIfDirty();
      const keyed = await rmw("alex", { sshpubkeys: [publicKey] });
      fact(
        `item 4: one OpenSSH key added: ${said(keyed)}; pending ${await pending()}`,
      );
      const read1 = (await userOf("alex")).sshpubkeys;
      const withKeys = await getUser("alex");
      record("userMgmtGetUser", "withKey", withKeys.status, withKeys.body);
      await applyIfDirty();
      const back = await rmw("alex", {});
      const read2 = (await userOf("alex")).sshpubkeys;
      fact(
        `item 4: keys sent back as read: ${said(back)}; stored as RFC 4716 ${read1.every((k) => k.startsWith("---- BEGIN SSH2"))}; unchanged ${JSON.stringify(read1) === JSON.stringify(read2)}; pending with keys ${await pending()}`,
      );
      await applyIfDirty();
      const noKeyChange = await rmw("robin", { comment: "Robin" });
      fact(
        `item 4: a change to a person without keys: ${said(noKeyChange)}; pending ${await pending()}`,
      );
      await applyIfDirty();
      const uidBefore = (await userOf("alex")).uid;
      const withUid = await rmw("alex", { uid: uidBefore + 500 });
      fact(
        `item 4: uid sent on a change: ${said(withUid)}; uid unchanged ${(await userOf("alex")).uid === uidBefore}`,
      );
      for (const [label, comment] of [
        ["a comma", "Alex, at home"],
        ["a colon", "Alex: at home"],
        ["66 characters", "a".repeat(66)],
        ["200 characters", "b".repeat(200)],
        ["right-to-left", "אלכס at home"],
      ]) {
        const r = await rmw("alex", { comment });
        const stored = (await userOf("alex")).comment;
        fact(
          `item 4: a description with ${label}: ${said(r)}; stored as sent ${stored === comment}; stored length ${stored.length}`,
        );
        if (label === "a colon") {
          record("userMgmtSetUser", "commentColon", r.status, r.body);
        }
      }
      const capitals = await rmw("alex", {
        email: "Alex.Home@Example.org",
        comment: "Alex at home",
      });
      fact(
        `item 4: an email address with capitals: ${said(capitals)}; stored as sent ${(await userOf("alex")).email === "Alex.Home@Example.org"}`,
      );
      const badEmail = await rmw("alex", { email: "not an address" });
      record("userMgmtSetUser", "invalidEmail", badEmail.status, badEmail.body);
      fact(`item 4: an email address that is not one: ${said(badEmail)}`);
      await rmw("alex", { email: "alex@example.org", sshpubkeys: [] });
      await applyIfDirty();
    });

    // ---- 5. Passwords (item 5) ----
    await step("item 5", async () => {
      const variants = [
        ["spaces at both ends", `  ${secret()}  `],
        ["a colon", `${secret()}:${secret()}`],
        ["non-Latin letters", `пароль-üñï-${secret()}`],
        ["200 characters", secret().repeat(10).slice(0, 200)],
      ];
      for (const [label, password] of variants) {
        const r = await rmw("alex", { password });
        passwords.set("alex", password);
        fact(
          `item 5: a password with ${label}: ${said(r)}; pending ${await pending()}; here ${await webRole("alex")}; SMB ${await smb("alex", "")}; trimmed refused ${(await webRole("alex", password.trim())).startsWith("refused") || password.trim() === password}`,
        );
      }
      const lineBreak = await rmw("alex", {
        password: `${secret()}\n${secret()}`,
      });
      record(
        "userMgmtSetUser",
        "passwordLineBreak",
        lineBreak.status,
        lineBreak.body,
      );
      fact(`item 5: a password with a line break: ${said(lineBreak)}`);
      passwords.set("alex", secret());
      await rmw("alex", { password: passwords.get("alex") });
      await applyIfDirty();
    });

    // ---- 6. SSH (item 6) ----
    await step("item 6", async () => {
      fact(
        `item 6: SSH settings: on ${sshBefore.enable}, password sign-in ${sshBefore.passwordauthentication}, keys ${sshBefore.pubkeyauthentication}`,
      );
      fact(
        `item 6: in _ssh with ${SH}: SSH ${await sshPassword("robin")}; SFTP ${await sshPassword("robin", "sftp")}`,
      );
      fact(
        `item 6: not in _ssh (${NOLOGIN}): SSH ${await sshPassword("alex")}; SFTP ${await sshPassword("alex", "sftp")}`,
      );
      await rmw("robin", { shell: NOLOGIN });
      fact(
        `item 6: in _ssh with ${NOLOGIN}, no Apply: SSH ${await sshPassword("robin")}; SFTP ${await sshPassword("robin", "sftp")}; pending ${await pending()}`,
      );
      await rmw("robin", { shell: SH, groups: ["users"] });
      fact(
        `item 6: out of _ssh with ${SH}, no Apply: SSH ${await sshPassword("robin")}; SFTP ${await sshPassword("robin", "sftp")}`,
      );
      await rmw("robin", { groups: ["users", "_ssh"] });
      fact(`item 6: back in _ssh, no Apply: SSH ${await sshPassword("robin")}`);
      await rmw("sam", { shell: SH, groups: ["users", "root"] });
      fact(
        `item 6: in root, not _ssh, with ${SH}: SSH ${await sshPassword("sam")}; groups ${(await userOf("sam")).groups.join(",")}`,
      );
      await rmw("sam", { shell: NOLOGIN, groups: ["users"] });
      fact(`item 6: out of root: SSH ${await sshPassword("sam")}`);
      const keyed = await rmw("robin", { sshpubkeys: [publicKey] });
      fact(
        `item 6: key added to a person in _ssh: ${said(keyed)}; pending ${await pending()}; key sign-in before Apply ${await sshKey("robin")}`,
      );
      await applyAll();
      fact(`item 6: key sign-in after Apply ${await sshKey("robin")}`);
    });

    // ---- 7. Administrator rights (item 7) ----
    await step("item 7", async () => {
      fact(`item 7: before: here as ${await webRole("alex")}`);
      const u = await userOf("alex");
      const made1 = await rmw("alex", {
        groups: [...u.groups, "openmediavault-admin"],
      });
      fact(
        `item 7: made an administrator: ${said(made1)}; pending ${await pending()}; here as ${await webRole("alex")}`,
      );
      await rmw("alex", { groups: u.groups });
      fact(`item 7: rights taken away: here as ${await webRole("alex")}`);
      await applyIfDirty();
    });

    // ---- 8. Groups (item 9) ----
    await step("item 9", async () => {
      await ok("ShareMgmt", "setPrivileges", {
        uuid: media.uuid,
        privileges: [{ type: "group", name: TEAM, perms: 7 }],
      });
      await applyAll();
      fact(
        `item 9: SMB share as a person outside the group: ${await smb("sam", "ls", "Media")}`,
      );
      const changed = await setGroup({
        name: TEAM,
        comment: "The team",
        members: ["alex", "sam"],
      });
      record("userMgmtSetGroup", "changed", changed.status, changed.body);
      fact(
        `item 9: setGroup change (members and description): ${said(changed)}; pending ${await pending()}; members then ${(await groupOf(TEAM)).members.join(",")}`,
      );
      fact(
        `item 9: SMB share as the new member, before Apply: ${await smb("sam", "ls", "Media")}`,
      );
      await applyAll();
      fact(
        `item 9: SMB share as the new member, after Apply: ${await smb("sam", "ls", "Media")}`,
      );
      const only = await setGroup({
        name: TEAM,
        comment: "The team",
        members: ["alex"],
      });
      fact(
        `item 9: members replaced by one: ${said(only)}; members then ${(await groupOf(TEAM)).members.join(",")}`,
      );
      const commentOnly = await setGroup({
        name: TEAM,
        comment: "The team, again",
        members: ["alex"],
      });
      fact(
        `item 9: description only: ${said(commentOnly)}; pending ${await pending()}`,
      );
      await applyIfDirty();
      const g66 = await setGroup({
        name: KIDS,
        comment: "c".repeat(66),
        members: [],
      });
      fact(
        `item 9: a group description of 66 characters: ${said(g66)}; colon ${said(await setGroup({ name: KIDS, comment: "a: b", members: [] }))}`,
      );
      const unknown = await setGroup({
        name: KIDS,
        comment: "",
        members: ["example-nobody"],
      });
      record("userMgmtSetGroup", "unknownMember", unknown.status, unknown.body);
      fact(`item 9: a member who does not exist: ${said(unknown)}`);
      await ssh(opts.ssh, `groupadd '${checkedName(OUTSIDE)}'`);
      made.outside = true;
      fact(
        `item 9: getGroupList shows a group OMV holds no record for: ${(await groups()).some((x) => x.name === OUTSIDE)}; comment field present ${"comment" in ((await groups()).find((x) => x.name === OUTSIDE) ?? {})}`,
      );
      const outside = await setGroup({
        name: OUTSIDE,
        comment: "",
        members: ["alex"],
      });
      fact(
        `item 9: setGroup on a group OMV holds no record for: ${said(outside)}; pending ${await pending()}`,
      );
      await applyIfDirty();
      const full = await s.call("UserMgmt", "deleteGroup", { name: TEAM });
      record("userMgmtDeleteGroup", "hasMembers", full.status, full.body);
      fact(`item 9: deleteGroup with members: ${said(full)}`);
      const emptied = await setGroup({
        name: TEAM,
        comment: "The team, again",
        members: [],
      });
      fact(
        `item 9: members []: ${said(emptied)}; members then ${(await groupOf(TEAM)).members.length}; pending ${await pending()}`,
      );
      await applyIfDirty();
      const gone = await deleteGroup(TEAM);
      record("userMgmtDeleteGroup", "deleted", gone.status, gone.body);
      fact(
        `item 9: deleteGroup empty: ${said(gone)}; pending ${await pending()}; access entry kept ${JSON.stringify((await ok("ShareMgmt", "getList", GET_ALL)).data.find((f) => f.uuid === media.uuid)?.privileges?.privilege ?? null).includes(TEAM)}`,
      );
      const outsideEmptied = await setGroup({
        name: OUTSIDE,
        comment: "",
        members: [],
      });
      fact(
        `item 9: deleteGroup of the outside group: empty ${said(outsideEmptied)}; delete ${said(await deleteGroup(OUTSIDE))}; pending ${await pending()}`,
      );
      made.outside =
        (await s.call("UserMgmt", "getGroup", { name: OUTSIDE })).status ===
        200;
      await ok("ShareMgmt", "setPrivileges", {
        uuid: media.uuid,
        privileges: [],
      });
      await applyIfDirty();
    });

    // ---- 9. Names (item 11) ----
    await step("item 11", async () => {
      const tries = [
        ["32 characters", `alex-${"x".repeat(27)}`],
        ["33 characters", `alex-${"x".repeat(28)}`],
        ["100 characters", `alex-${"x".repeat(95)}`],
        ["257 characters", `alex-${"x".repeat(252)}`],
        ["capitals", "Alex"],
        ["a leading digit", "1alex"],
        ["a trailing $", "alex$"],
        ["digits only", "1234"],
        ["the name add", "add"],
      ];
      for (const [label, name] of tries) {
        if ((await getUser(name)).status === 200 || taken.has(name)) {
          fact(`item 11: ${label}: already an account, not tried`);
          continue;
        }
        const r = await setUser(person(name, { password: secret() }));
        fact(`item 11: a name with ${label}: ${said(r)}`);
        if (r.status !== 200 && label === "33 characters") {
          record("userMgmtSetUser", "nameTooLong", r.status, r.body);
        }
        if (r.status === 200 || (await getUser(name)).status === 200) {
          made.people.add(name);
          await deleteUser(name);
        }
      }
      const sameName = await setGroup({
        name: "sam",
        comment: "",
        members: [],
      });
      fact(`item 11: a group named like a person: ${said(sameName)}`);
      if (sameName.status === 200) {
        await deleteGroup("sam");
      }
      await applyIfDirty();
    });

    // ---- 10. Home folders (item 10; design 12.4 and P12) ----
    await step("item 10", async () => {
      fact(`item 10: homes before: alex ${await homeOf("alex")}`);
      await ssh(
        opts.ssh,
        `install -d -m 700 -o alex -g users /home/alex && echo hello > /home/alex/kept.txt && chown alex /home/alex/kept.txt`,
      );
      await ssh(opts.ssh, `usermod --home /home/alex alex`);
      const t = Date.now();
      const on = await s.call("UserMgmt", "setSettings", {
        enable: true,
        sharedfolderref: homes.uuid,
      });
      record("userMgmtSetSettings", "turnedOn", on.status, on.body);
      const people = (await users()).length;
      fact(
        `item 10: turned on in a folder: ${said(on)}; ${Date.now() - t} ms for ${people} people; pending ${await pending()}`,
      );
      await capture("userMgmtGetSettings", "on", "UserMgmt", "getSettings");
      fact(
        `item 10: alex ${await homeOf("alex")}; old home's file moved ${(await ssh(opts.ssh, `test -f '${(await userOf("alex")).dir}/kept.txt' && echo yes || echo no`)).trim()}; robin ${await homeOf("robin")}`,
      );
      const row = (await ok("ShareMgmt", "getList", GET_ALL)).data.find(
        (f) => f.uuid === homes.uuid,
      );
      fact(`item 10: the folder's _used while on: ${row?._used}`);
      const del = await s.call("ShareMgmt", "delete", {
        uuid: homes.uuid,
        recursive: false,
      });
      fact(`item 10: deleting the folder while on: ${said(del)}`);
      const newcomer = await setUser(
        person("sam", { comment: "", groups: ["users"] }),
      );
      fact(
        `item 10: a change to an existing person while on: ${said(newcomer)}; sam ${await homeOf("sam")}`,
      );
      await ok("SMB", "setSettings", {
        ...(await ok("SMB", "getSettings")),
        homesenable: true,
      });
      fact(
        `item 10: SMB lists before Apply, with home sharing on: ${await smbShares("alex")}`,
      );
      await applyAll();
      fact(
        `item 10: SMB lists after Apply: ${await smbShares("alex")}; alex opens their home ${await smb("alex", "ls", "alex")}; robin opens alex's ${await smb("robin", "ls", "alex")}`,
      );
      const off = await s.call("UserMgmt", "setSettings", {
        enable: false,
        sharedfolderref: homes.uuid,
      });
      record("userMgmtSetSettings", "turnedOff", off.status, off.body);
      fact(
        `item 10: turned off: ${said(off)}; pending ${await pending()}; alex ${(await userOf("alex")).dir}; files stay ${(await ssh(opts.ssh, `test -d '${row ? `${mount.dir}/Homes/alex` : "/nonexistent"}' && echo yes || echo no`)).trim()}`,
      );
      fact(
        `item 10: settings after off: ${JSON.stringify(await ok("UserMgmt", "getSettings"))}`,
      );
      await applyAll();
      fact(
        `item 10: SMB lists after off and Apply: ${await smbShares("alex")}`,
      );
      // P12: a shared folder that is the whole file system.
      if (!whole) {
        return;
      }
      const wholeOn = await s.call("UserMgmt", "setSettings", {
        enable: true,
        sharedfolderref: whole.uuid,
      });
      const top = (await ssh(opts.ssh, `ls -1 '${mount.dir}'`))
        .trim()
        .split("\n");
      fact(
        `item 10 (P12): turned on in a whole-file-system folder: ${said(wholeOn)}; the file system's top level then holds ${top.map((n) => (PEOPLE.includes(n) || ["Media", "Homes", "lost+found"].includes(n) ? n : "(other person)")).join(" ")}; alex ${await homeOf("alex")}`,
      );
      await s.call("UserMgmt", "setSettings", {
        enable: false,
        sharedfolderref: "",
      });
      await ok("SMB", "setSettings", {
        ...(await ok("SMB", "getSettings")),
        homesenable: smbBefore.homesenable,
      });
      await applyIfDirty();
    });

    // ---- 11. Deleting a person (item 8) ----
    await step("item 8", async () => {
      await ssh(
        opts.ssh,
        `install -d -m 770 -o robin -g users '${mount.dir}/Media/robin-files' && echo hello > '${mount.dir}/Media/robin-files/note.txt' && chown robin '${mount.dir}/Media/robin-files/note.txt'`,
      );
      await ok("ShareMgmt", "setPrivileges", {
        uuid: media.uuid,
        privileges: [{ type: "user", name: "robin", perms: 7 }],
      });
      await setGroup({ name: TEAM, comment: "", members: ["robin"] });
      await applyAll();
      const uid = (await userOf("robin")).uid;
      fact(
        `item 8: before: key sign-in ${await sshKey("robin")}; SMB ${await smb("robin", "ls", "Media")}`,
      );
      const r = await deleteUser("robin");
      record("userMgmtDeleteUser", "deleted", r.status, r.body);
      fact(`item 8: deleteUser: ${said(r)}; pending ${await pending()}`);
      fact(
        `item 8: SMB at once: ${await smb("robin", "ls", "Media")}; here ${await webRole("robin")}; key sign-in before Apply ${await sshKey("robin")}`,
      );
      fact(
        `item 8: files stay ${(await ssh(opts.ssh, `stat -c '%u %U' '${mount.dir}/Media/robin-files/note.txt'`)).trim().replace(/\S+$/, (o) => (o === "UNKNOWN" ? "shown as UNKNOWN" : o === String(uid) ? "shown as a number" : "(a name)"))}; group members then ${(await groupOf(TEAM)).members.join(",") || "(none)"}`,
      );
      const row = (await ok("ShareMgmt", "getList", GET_ALL)).data.find(
        (f) => f.uuid === media.uuid,
      );
      fact(
        `item 8: access entry kept ${JSON.stringify(row?.privileges ?? null).includes("robin")}`,
      );
      await applyAll();
      fact(`item 8: key sign-in after Apply ${await sshKey("robin")}`);
      const gone = await s.call("UserMgmt", "deleteUser", { name: "robin" });
      record("userMgmtDeleteUser", "missing", gone.status, gone.body);
      fact(`item 8: deleteUser again: ${said(gone)}`);
      passwords.set("robin", secret());
      const again = await setUser(person("robin"));
      fact(
        `item 8: a new person after the delete: ${said(again)}; uid ${(await userOf("robin")).uid} (deleted one had ${uid})`,
      );
      await ok("ShareMgmt", "setPrivileges", {
        uuid: media.uuid,
        privileges: [],
      });
      await setGroup({ name: TEAM, comment: "", members: [] });
      await deleteGroup(TEAM);
      await applyIfDirty();
    });

    // ---- 12. Size (item 12) ----
    await step("item 12", async () => {
      if (opts.many === 0) {
        fact("item 12: not run (--many 0)");
        return;
      }
      const many = Array.from(
        { length: opts.many },
        (_, i) => `alex-${String(i + 1).padStart(3, "0")}`,
      );
      const t0 = Date.now();
      for (const name of many) {
        await setUser(person(name, { password: secret() }));
      }
      fact(
        `item 12: ${opts.many} people made in ${Math.round((Date.now() - t0) / 1000)} s`,
      );
      const t1 = Date.now();
      const list = await users();
      fact(
        `item 12: getUserList with ${list.length} people: ${Date.now() - t1} ms`,
      );
      const t2 = Date.now();
      const on = await s.call("UserMgmt", "setSettings", {
        enable: true,
        sharedfolderref: homes.uuid,
      });
      fact(
        `item 12: home folders on for ${list.length} people: ${said(on)} in ${Date.now() - t2} ms`,
      );
      const t3 = Date.now();
      const off = await s.call("UserMgmt", "setSettings", {
        enable: false,
        sharedfolderref: "",
      });
      fact(`item 12: and off: ${said(off)} in ${Date.now() - t3} ms`);
      for (const name of many) {
        await deleteUser(name);
      }
      await applyIfDirty();
    });

    // ---- 13. The classic deep links (item 13) ----
    fact(
      "item 13: the classic interface's routes usermgmt/users/edit/:name and usermgmt/groups/edit/:name are read from its source; not opened here",
    );
  } finally {
    // Leave the VM as it was.
    try {
      for (const name of [...made.people]) {
        const r = await s.call("UserMgmt", "deleteUser", { name });
        if (r.status !== 200) {
          fact("cleanup: a test person was not deleted; delete it on the VM");
        }
      }
      for (const name of [...made.groups]) {
        await s.call("UserMgmt", "setGroup", {
          name,
          comment: "",
          members: [],
        });
        const r = await s.call("UserMgmt", "deleteGroup", { name });
        if (
          r.status !== 200 &&
          (await s.call("UserMgmt", "getGroup", { name })).status === 200
        ) {
          fact("cleanup: a test group was not deleted; delete it on the VM");
        }
      }
      // OMV's records left by refused new names (the account was never made).
      for (const [kind, model] of [
        ["user", "conf.system.usermngmnt.user"],
        ["group", "conf.system.usermngmnt.group"],
      ]) {
        for (const o of await recordNames(model)) {
          if (
            !recordsBefore[kind].has(o.uuid) &&
            /^[0-9a-f-]{36}$/.test(o.uuid) &&
            (
              await s.call(
                "UserMgmt",
                kind === "user" ? "getUser" : "getGroup",
                { name: o.name },
              )
            ).status !== 200
          ) {
            await ssh(
              opts.ssh,
              `omv-confdbadm delete --uuid ${o.uuid} ${model}`,
            );
            fact(`cleanup: a leftover ${kind} record removed`);
          }
        }
      }
      if (made.outside) {
        await ssh(opts.ssh, `groupdel '${checkedName(OUTSIDE)}' || true`);
      }
      const homeNow = await ok("UserMgmt", "getSettings");
      if (JSON.stringify(homeNow) !== JSON.stringify(homeBefore)) {
        await s.call("UserMgmt", "setSettings", homeBefore);
      }
      // The home folders setting rewrites every person's home folder path: put each back exactly.
      for (const [name, line] of passwdBefore) {
        const now = await passwdLine(name);
        if (now !== line) {
          const dir = line.split(":")[5];
          if (SAFE_PATH.test(dir)) {
            await ssh(
              opts.ssh,
              `usermod --home '${dir}' '${checkedName(name)}'`,
            );
          }
          fact(
            `cleanup: an existing person's passwd line restored: ${(await passwdLine(name)) === line}`,
          );
        }
      }
      for (const uuid of made.shares) {
        await s.call("SMB", "deleteShare", { uuid });
      }
      await applyIfDirty();
      for (const uuid of [...made.folders].reverse()) {
        if (!existingFolders.has(uuid)) {
          await s.call("ShareMgmt", "delete", { uuid, recursive: false });
        }
      }
      const smbNow = await ok("SMB", "getSettings");
      if (JSON.stringify(smbNow) !== JSON.stringify(smbBefore)) {
        await ok("SMB", "setSettings", smbBefore);
      }
      const sshNow = await ok("SSH", "get");
      if (JSON.stringify(sshNow) !== JSON.stringify(sshBefore)) {
        await ok("SSH", "set", sshBefore);
      }
      await applyIfDirty();
      if (made.fs?.dir) {
        await s.call("FileSystemMgmt", "umountByDir", { dir: made.fs.dir });
      }
      await applyIfDirty();
      if (made.wiped) {
        await runTask(
          "DiskMgmt",
          "wipe",
          { devicefile: opts.disk, secure: false },
          "wipe",
        );
      }
      await ok("DiskMgmt", "rescan");
      await ssh(opts.ssh, "rm -rf /home/alex; rm -f /tmp/logfile*");
      const passwdSame = (
        await Promise.all(
          [...passwdBefore].map(async ([n, l]) => (await passwdLine(n)) === l),
        )
      ).every(Boolean);
      fact(
        `after cleanup: home folders as before ${JSON.stringify(await ok("UserMgmt", "getSettings")) === JSON.stringify(homeBefore)}; SMB as before ${JSON.stringify(await ok("SMB", "getSettings")) === JSON.stringify(smbBefore)}; SSH as before ${JSON.stringify(await ok("SSH", "get")) === JSON.stringify(sshBefore)}; people ${(await users()).length} (was ${usersBefore.length}); groups ${(await groups()).length} (was ${groupsBefore.length}); existing passwd lines unchanged ${passwdSame}; shared folders ${(await ok("ShareMgmt", "getList", GET_ALL)).data.length} (was ${existingFolders.size}); pending ${await pending()}`,
      );
    } finally {
      await s.call("Session", "logout");
      for (const line of [...results, ...facts.map((f) => scrub(f))]) {
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
