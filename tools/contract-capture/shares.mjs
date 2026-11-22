#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Record the shares domain's replies on the disposable test VM (design phase-5-shares 14.2): shared
// folders made, changed, given access and deleted (keeping and with their files), the people and
// groups offered for access, Windows and Mac sharing (SMB) turned on and off, SMB shares made,
// changed and removed, and the server's refusals met on the way. It also opens the shares from a
// client, as the test people, to see what each access choice lets them do. ERASES THE THREE DISKS IT
// IS GIVEN.
//
//   node tools/contract-capture/shares.mjs --ext4 /dev/sdd --btrfs /dev/sdb --zfs /dev/sdc \
//     --ssh <destination> [--smbclient <docker image>]
//
// Only for the test VM in $OMV_WEBUI_ENV (default ~/.config/omv-webui/test.env), never the owner's
// server. It refuses to start while configuration changes are pending, while any SMB share or ZFS
// pool exists, and for any disk the server's candidate list does not offer. Every shared folder it
// makes is on a file system it made on those disks; it never changes another shared folder, file
// system or account. Its test people and group carry documentation names, with passwords that exist
// only in this process.
//
// --ssh runs fixed, test-only commands on the VM, each with values this tool has checked: `stat` of a
// folder it made (its mode and group), making a folder or many small files in a folder it made,
// `test -d`, unmounting and mounting again a file system it made (to read a folder whose file system
// is not mounted), a BTRFS snapshot of a folder it made, removing a shared folder's record by hand
// (to read the SMB shares when one names a folder that is gone), and clearing ZFS's marks.
// --smbclient names a local Docker image with Samba's smbclient, run with the test person's password
// in its environment, to open a share from a client.
//
// It ends, also after a failure, by removing every SMB share, shared folder, person and group it
// made, restoring the SMB settings it read first, deleting its pool and file systems, applying what
// is pending and quick-wiping the disks, so the VM is left as it was. Replies are scrubbed and
// verified as by capture.mjs and written as draft examples the same way. Credentials, the host,
// the passwords and the disks' identifiers are never printed.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  ENV_PATH,
  Session,
  followTask,
  loadEnv,
  openCapture,
  sleep,
} from "./capture.mjs";

const GET_ALL = { start: 0, limit: null, sortfield: null, sortdir: null };
const GET_ALL_SEARCH = { ...GET_ALL, search: null };
const NEW = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
const DISK = /^\/dev\/sd[a-z]$/;
const BY_ID = /^\/dev\/disk\/by-id\/[A-Za-z0-9._:+-]+$/;
const SSH_DESTINATION = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const IMAGE = /^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]+)?$/;
// A folder this tool made: an absolute path under /srv or the test pool, of safe characters only.
const SAFE_PATH = /^\/(?:srv|tank)\/[A-Za-z0-9._/-]+$/;
// Documentation names (design 11.2), never the owner's.
const PEOPLE = ["alex", "sam", "robin"];
const GROUP = "family";
const POOL = "tank";
const POOL_SETTINGS = {
  force: false,
  mountpoint: "",
  devalias: "id",
  ashift: true,
  ashiftval: 12,
  casesensitivity: "sensitive",
  compress: true,
  compresstype: "lz4",
};
// The classic form's defaults for a new SMB share (design 0.10, D5).
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
    if (
      !["--ext4", "--btrfs", "--zfs", "--ssh", "--smbclient"].includes(flag)
    ) {
      throw new Error(`unknown argument ${flag}`);
    }
    out[flag.slice(2)] = value;
  }
  const disks = [out.ext4, out.btrfs, out.zfs];
  if (!disks.every((d) => DISK.test(String(d))) || new Set(disks).size !== 3) {
    throw new Error(
      "--ext4, --btrfs and --zfs take three different whole-disk device files such as /dev/sdd",
    );
  }
  if (!SSH_DESTINATION.test(String(out.ssh))) {
    throw new Error("--ssh takes an ssh destination such as omv8vm");
  }
  if (out.smbclient !== undefined && !IMAGE.test(out.smbclient)) {
    throw new Error("--smbclient takes a local Docker image name");
  }
  return out;
}

function run(cmd, argv, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, {
      stdio: ["ignore", "pipe", "pipe"],
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

const noRecord = () => {};

async function main() {
  const opts = args(process.argv.slice(2));
  const env = loadEnv(ENV_PATH);
  const { base, record, results, scrub } = await openCapture(env);
  const s = new Session(base);
  const signedIn = await s.login(env, "admin");
  if (signedIn.status !== 200) {
    throw new Error(`sign-in failed (HTTP ${signedIn.status})`);
  }
  const facts = [];
  const fact = (line) => facts.push(line);
  const passwords = new Map(
    PEOPLE.map((p) => [p, randomBytes(18).toString("base64url")]),
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
  /** A sub-test: its failure is a fact, and the run goes on to the next. */
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      fact(`STEP FAILED ${name}: ${scrub(e.message).slice(0, 300)}`);
      if ((await ok("Config", "isDirty")) !== false) {
        await applyAll();
      }
    }
  };
  const folders = async () => (await ok("ShareMgmt", "getList", GET_ALL)).data;
  const shares = async () => (await ok("SMB", "getShareList", GET_ALL)).data;

  // ---- preconditions ----
  if ((await ok("Config", "isDirty")) !== false) {
    throw new Error(
      "the VM has pending configuration changes; apply or revert them first",
    );
  }
  if ((await shares()).length !== 0) {
    throw new Error(
      "the VM has SMB shares; this tool runs only on a VM without any",
    );
  }
  if ((await ok("Zfs", "getPoolStatus")).length !== 0) {
    throw new Error(
      "the VM has a ZFS pool; this tool runs only on a VM without any",
    );
  }
  const existingFolders = new Set((await folders()).map((f) => f.uuid));
  const users = (await ok("UserMgmt", "getUserList", GET_ALL_SEARCH)).data.map(
    (u) => u.name,
  );
  if (PEOPLE.some((p) => users.includes(p))) {
    throw new Error("a test person already exists; remove it first");
  }
  const smbBefore = await ok("SMB", "getSettings");
  const candidatesJson = await runTask(
    "FileSystemMgmt",
    "getCandidatesBg",
    {},
    "fsCandidates",
  );
  const offered = new Set(
    JSON.parse(candidatesJson.body.response.output).map((c) => c.devicefile),
  );
  for (const d of [opts.ext4, opts.btrfs]) {
    if (!offered.has(d)) {
      throw new Error(
        `${d} is not among the server's candidates; nothing was changed`,
      );
    }
  }
  const zfsOffered = (await ok("Zfs", "getEmptyCandidates")).find((x) =>
    x.description?.includes(`[${opts.zfs},`),
  );
  if (!zfsOffered || !BY_ID.test(zfsOffered.devicefile)) {
    throw new Error(
      `${opts.zfs} is not among the ZFS plugin's candidates; nothing was changed`,
    );
  }

  // What this tool made, removed again at the end.
  const made = {
    folders: [],
    shares: [],
    people: [],
    group: false,
    fs: [],
    pool: false,
    wiped: [],
  };
  const mounts = {}; // type -> { uuid (mount entry), dir }
  const smb = async (share, person, command) => {
    if (!opts.smbclient) {
      return "not checked (no --smbclient)";
    }
    const argv = [
      "run",
      "--rm",
      "-e",
      "PASSWD",
      "-e",
      "NAS_HOST",
      opts.smbclient,
      "sh",
      "-c",
    ];
    const target = `//$NAS_HOST/${share}`;
    const who = person === null ? "-N" : `-U ${person}`;
    const r = await run(
      "docker",
      [...argv, `smbclient "${target}" ${who} -c '${command}' 2>&1`],
      {
        PASSWD: person === null ? "" : passwords.get(person),
        NAS_HOST: env.NAS_HOST,
      },
    );
    const status = /NT_STATUS_[A-Z_]+/.exec(r.out)?.[0];
    return status ?? (r.code === 0 ? "OK" : `exit ${r.code}`);
  };
  /** What a person (or a guest, null) may do in a share: none, read or write. */
  const access = async (share, person) => {
    const read = await smb(share, person, "ls");
    if (read !== "OK") {
      return `none (${read})`;
    }
    const write = await smb(
      share,
      person,
      "put /etc/hostname webui-probe.txt; del webui-probe.txt",
    );
    return write === "OK" ? "write" : `read (${write})`;
  };
  const listShares = async (person) => {
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
        `smbclient -L //$NAS_HOST -U ${person} 2>&1`,
      ],
      { PASSWD: passwords.get(person), NAS_HOST: env.NAS_HOST },
    );
    return [...r.out.matchAll(/^\s+(\S+)\s+Disk/gm)].map((m) => m[1]).join(" ");
  };
  const newFolder = async (name, mount, reldirpath, extra = {}) => {
    const r = await s.call("ShareMgmt", "set", {
      uuid: NEW,
      name,
      comment: "",
      mntentref: mounts[mount].uuid,
      reldirpath,
      mode: "770",
      ...extra,
    });
    if (r.status === 200) {
      made.folders.push(r.body.response.uuid);
    }
    return r;
  };
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
  const setAccess = (uuid, privileges) =>
    s.call("ShareMgmt", "setPrivileges", { uuid, privileges });
  const newShare = async (folderUuid, extra = {}) => {
    const r = await s.call("SMB", "setShare", {
      ...SHARE_DEFAULTS,
      uuid: NEW,
      sharedfolderref: folderUuid,
      ...extra,
    });
    if (r.status === 200) {
      made.shares.push(r.body.response.uuid);
    }
    return r;
  };
  const shareOf = async (folderUuid) =>
    (await shares()).find((x) => x.sharedfolderref === folderUuid);
  const rmw = (row, change = {}) => {
    const { sharedfoldername: _gone, ...rest } = row;
    return { ...rest, ...change };
  };

  try {
    // ---- 1. Read-only, before anything changes ----
    await capture(
      "shareMgmtGetCandidates",
      "dataOnly",
      "ShareMgmt",
      "getCandidates",
    );
    const stockUsers = await capture(
      "userMgmtGetUserList",
      "stock",
      "UserMgmt",
      "getUserList",
      GET_ALL_SEARCH,
    );
    fact(
      `item 6: getUserList lists the web administrator account: ${stockUsers.body.response.data.some((u) => u.name === "admin")}`,
    );
    const stockGroups = await capture(
      "userMgmtGetGroupList",
      "stock",
      "UserMgmt",
      "getGroupList",
      GET_ALL_SEARCH,
    );
    fact(
      `item 6: getGroupList lists users: ${stockGroups.body.response.data.some((g) => g.name === "users")}; groups listed ${stockGroups.body.response.total}`,
    );
    await capture("smbGetSettings", "off", "SMB", "getSettings");
    await capture("smbGetShareList", "none", "SMB", "getShareList", GET_ALL);
    const detailFull = await s.call("UserMgmt", "getUserList", {
      ...GET_ALL_SEARCH,
      detail: "full",
    });
    fact(`getUserList detail full: ${said(detailFull)}`);

    // ---- 2. The file systems: EXT4, BTRFS and a ZFS pool on the scratch disks ----
    for (const [type, disk] of [
      ["ext4", opts.ext4],
      ["btrfs", opts.btrfs],
    ]) {
      const created = await runTask(
        "FileSystemMgmt",
        "create",
        { devicefile: disk, type },
        `create${type}`,
      );
      made.wiped.push(disk);
      if (created.status !== 200) {
        throw new Error(`creating ${type} failed`);
      }
      const candidate = (await ok("FileSystemMgmt", "getMountCandidates")).find(
        (f) =>
          f.parentdevicefile === disk ||
          f.devicefile === disk ||
          f.canonicaldevicefile?.startsWith(disk),
      );
      if (!candidate) {
        throw new Error(`the new ${type} file system is not a mount candidate`);
      }
      const entry = await ok("FileSystemMgmt", "setMountPoint", {
        id: candidate.canonicaldevicefile,
        usagewarnthreshold: 85,
        comment: type === "ext4" ? "Media" : "Archive",
      });
      mounts[type] = { uuid: entry.uuid, dir: entry.dir };
      made.fs.push(type);
      await applyAll();
    }
    const pool = await s.call("Zfs", "addPool", {
      ...POOL_SETTINGS,
      pooltype: "basic",
      name: POOL,
      devices: [zfsOffered.devicefile],
    });
    if (pool.status !== 200) {
      throw new Error(`Zfs.addPool failed (HTTP ${pool.status})`);
    }
    made.pool = true;
    made.wiped.push(opts.zfs);
    await applyAll();
    const cands = await capture(
      "shareMgmtGetCandidates",
      "several",
      "ShareMgmt",
      "getCandidates",
    );
    const zfsRow = cands.body.response.find(
      (c) =>
        !Object.values(mounts).some((m) => m.uuid === c.uuid) &&
        /tank/.test(c.description),
    );
    fact(
      `item 1: getCandidates rows ${cands.body.response.length}; ext4 listed ${cands.body.response.some((c) => c.uuid === mounts.ext4.uuid)}; btrfs listed ${cands.body.response.some((c) => c.uuid === mounts.btrfs.uuid)}; zfs listed ${zfsRow !== undefined}`,
    );
    if (zfsRow) {
      mounts.zfs = { uuid: zfsRow.uuid };
    }

    // ---- 3. The test people and group ----
    for (const name of PEOPLE) {
      const r = await s.call("UserMgmt", "setUser", {
        name,
        groups: [],
        password: passwords.get(name),
        email: "",
        comment: name === "alex" ? "Alex at home" : "",
        disallowusermod: false,
        sshpubkeys: [],
      });
      if (r.status !== 200) {
        throw new Error(`could not create a test person (HTTP ${r.status})`);
      }
      made.people.push(name);
    }
    fact(`after making three people: pending ${await pending()}`);
    const g = await s.call("UserMgmt", "setGroup", {
      name: GROUP,
      comment: "Everyone at home",
      members: ["alex"],
    });
    if (g.status !== 200) {
      throw new Error(`could not create the test group (HTTP ${g.status})`);
    }
    made.group = true;
    fact(`after making a group: pending ${await pending()}`);
    if ((await ok("Config", "isDirty")) !== false) {
      await applyAll();
    }
    await capture(
      "userMgmtGetUserList",
      "several",
      "UserMgmt",
      "getUserList",
      GET_ALL_SEARCH,
    );
    await capture(
      "userMgmtGetGroupList",
      "several",
      "UserMgmt",
      "getGroupList",
      GET_ALL_SEARCH,
    );

    // ---- 4. Make a shared folder; change it (items 2, 8) ----
    let photos;
    await step("make Photos", async () => {
      const r = await newFolder("Photos", "ext4", "Photos");
      record("shareMgmtSet", "created", r.status, r.body);
      if (r.status !== 200) {
        throw new Error(said(r));
      }
      photos = r.body.response.uuid;
      fact(
        `item 2: set new: pending ${await pending()}; reply reldirpath "${r.body.response.reldirpath}", mode ${r.body.response.mode}`,
      );
      const row = await folderRow(photos);
      fact(
        `item 8: a new folder on the disk: ${(await ssh(opts.ssh, `stat -c '%a %G' '${folderPath(row)}'`)).trim()}`,
      );
      fact(`apply after a new folder took ${await applyAll()} s`);
    });
    await step("change a description", async () => {
      const row = await folderRow(photos);
      await setAccess(photos, [{ type: "user", name: "alex", perms: 7 }]);
      await applyAll();
      const r = await s.call("ShareMgmt", "set", {
        uuid: row.uuid,
        name: row.name,
        comment: "Family photos",
        mntentref: row.mntentref,
        reldirpath: row.reldirpath,
      });
      record("shareMgmtSet", "changed", r.status, r.body);
      fact(
        `item 2: set change without an SMB share: pending ${await pending()}`,
      );
      const after = await folderRow(photos);
      fact(
        `item 8: the description change kept the access list: ${JSON.stringify(after.privileges) === JSON.stringify({ privilege: [{ type: "user", name: "alex", perms: 7 }] })}; privileges as read ${JSON.stringify(after.privileges)}`,
      );
      await applyAll();
    });
    await step("existing folder keeps its mode", async () => {
      const dir = `${mounts.ext4.dir}/Existing`;
      if (!SAFE_PATH.test(dir)) {
        throw new Error("unexpected mount folder");
      }
      await ssh(
        opts.ssh,
        `mkdir -m 755 '${dir}' && echo kept > '${dir}/keep.txt'`,
      );
      const r = await newFolder("Existing", "ext4", "Existing");
      fact(
        `item 8: set on an existing folder: ${said(r)}; on the disk ${(await ssh(opts.ssh, `stat -c '%a %G' '${dir}'`)).trim()}`,
      );
      await applyAll();
    });
    await step("names", async () => {
      const lower = await newFolder("photos", "ext4", "photos-lower");
      fact(`item 9: a second folder named with different case: ${said(lower)}`);
      const nameTaken = await s.call("ShareMgmt", "set", {
        uuid: NEW,
        name: "Photos",
        comment: "",
        mntentref: mounts.ext4.uuid,
        reldirpath: "Elsewhere",
        mode: "770",
      });
      record("shareMgmtSet", "nameTaken", nameTaken.status, nameTaken.body);
      const pathTaken = await s.call("ShareMgmt", "set", {
        uuid: NEW,
        name: "Photos2",
        comment: "",
        mntentref: mounts.ext4.uuid,
        reldirpath: "Photos",
        mode: "770",
      });
      record("shareMgmtSet", "pathTaken", pathTaken.status, pathTaken.body);
      const long = await newFolder("x".repeat(200), "ext4", "long");
      fact(`item 9: a 200-character name: ${said(long)}`);
      const at80 = await newFolder("y".repeat(80), "ext4", "at80");
      fact(`item 9: an 80-character name: ${said(at80)}`);
      // Hebrew letters: two bytes each in UTF-8.
      const rtl41 = await newFolder("א".repeat(41), "ext4", "rtl41");
      fact(
        `item 9: a right-to-left name of 41 letters (82 bytes): ${said(rtl41)}`,
      );
      const rtl40 = await newFolder("א".repeat(40), "ext4", "rtl40");
      fact(
        `item 9: a right-to-left name of 40 letters (80 bytes): ${said(rtl40)}`,
      );
      const rtl = await newFolder("תמונות", "ext4", "rtl");
      fact(`item 9: a right-to-left name of 6 letters: ${said(rtl)}`);
      const dotdot = await newFolder("Dots", "ext4", "a..b");
      fact(`a path with two full stops: ${said(dotdot)}`);
      const whole = await newFolder("Whole", "btrfs", "/");
      fact(
        `whole file system: ${said(whole)}; stored reldirpath "${whole.body.response?.reldirpath}"`,
      );
      for (const reserved of ["homes", "global"]) {
        const r = await newFolder(reserved, "ext4", reserved);
        fact(`item 9: a folder named ${reserved}: ${said(r)}`);
      }
      await applyAll();
    });

    // ---- 5. Access (items 2, 6), refusals ----
    await step("access", async () => {
      const saved = await setAccess(photos, [
        { type: "group", name: GROUP, perms: 5 },
        { type: "user", name: "alex", perms: 7 },
        { type: "user", name: "sam", perms: 5 },
      ]);
      record("shareMgmtSetPrivileges", "saved", saved.status, saved.body);
      fact(
        `item 2: setPrivileges without an SMB share: pending ${await pending()}`,
      );
      const list = await capture(
        "shareMgmtGetList",
        "withAccess",
        "ShareMgmt",
        "getList",
        GET_ALL,
      );
      const row = list.body.response.data.find((f) => f.uuid === photos);
      fact(
        `item 6: privileges with several entries ${JSON.stringify(row.privileges).slice(0, 200)}; perms is a ${typeof row.privileges?.privilege?.[0]?.perms}`,
      );
      await applyAll();
      const unknown = await setAccess(photos, [
        { type: "user", name: "nobody-here", perms: 7 },
      ]);
      record(
        "shareMgmtSetPrivileges",
        "unknownAccount",
        unknown.status,
        unknown.body,
      );
      const admin = await setAccess(photos, [
        { type: "user", name: "admin", perms: 7 },
      ]);
      record(
        "shareMgmtSetPrivileges",
        "adminRefused",
        admin.status,
        admin.body,
      );
      fact(`refused access writes left: pending ${await pending()}`);
      const existing = (await folders()).find((f) => f.name === "Existing");
      if (existing) {
        const none = await setAccess(existing.uuid, []);
        fact(`setPrivileges with an empty list: ${said(none)}`);
        const one = await setAccess(existing.uuid, [
          { type: "user", name: "robin", perms: 5 },
        ]);
        fact(`setPrivileges with one entry: ${said(one)}`);
        const rows = await folders();
        fact(
          `item 6: privileges after an empty list (a folder made elsewhere) ${JSON.stringify(rows.find((f) => f.name === "Whole")?.privileges)}; with one entry ${JSON.stringify(rows.find((f) => f.uuid === existing.uuid)?.privileges)}`,
        );
        await applyAll();
      }
    });

    // ---- 6. A NAS name too long for SMB (item 11) ----
    await step("host too long", async () => {
      const general = await ok("Network", "getGeneralSettings");
      const r = await s.call("Network", "setGeneralSettings", {
        hostname: "nas-name-sixteen",
        domainname: general.domainname,
      });
      if (r.status !== 200) {
        throw new Error(`could not set a long NAS name (${said(r)})`);
      }
      const refused = await s.call("SMB", "setSettings", {
        ...smbBefore,
        enable: true,
      });
      record("smbSetSettings", "hostTooLong", refused.status, refused.body);
      const back = await s.call("Config", "revertChanges", { filename: "" });
      fact(
        `item 11: turning SMB on with a 16-character name: ${said(refused)}; reverted ${back.status === 200}; pending ${await pending()}`,
      );
      const now = await ok("Network", "getGeneralSettings");
      if (now.hostname !== general.hostname) {
        throw new Error("the NAS name did not return to what it was");
      }
    });

    // ---- 7. SMB on, a share, read-modify-write (items 2, 7, 12) ----
    let share;
    await step("SMB on", async () => {
      const on = await s.call("SMB", "setSettings", {
        ...smbBefore,
        enable: true,
      });
      record("smbSetSettings", "turnedOn", on.status, on.body);
      fact(`item 2: setSettings on: pending ${await pending()}`);
      const read = await capture("smbGetSettings", "on", "SMB", "getSettings");
      const kept = Object.keys(smbBefore).filter(
        (k) =>
          k !== "enable" &&
          JSON.stringify(read.body.response[k]) !==
            JSON.stringify(smbBefore[k]),
      );
      fact(
        `item 7: setSettings with the whole reply: fields changed besides enable: ${kept.join(" ") || "none"}`,
      );
      const withShares = await s.call("SMB", "setSettings", {
        ...read.body.response,
        shares: [],
      });
      fact(
        `setSettings with a field outside the settings ("shares"): ${said(withShares)}`,
      );
      const created = await newShare(photos);
      record("smbSetShare", "created", created.status, created.body);
      fact(`item 2: setShare new: pending ${await pending()}`);
      share = created.body.response?.uuid;
      const second = await newShare(photos);
      record("smbSetShare", "secondShare", second.status, second.body);
      await capture("smbGetShareList", "one", "SMB", "getShareList", GET_ALL);
      const t = Date.now();
      fact(`item 12: apply with SMB turned on took ${await applyAll()} s`);
      let running = false;
      for (let i = 0; i < 30 && !running; i++) {
        const st = await ok("Services", "getStatus", {});
        running = st.data.find((x) => x.name === "samba")?.running === true;
        if (!running) {
          await sleep(1000);
        }
      }
      fact(
        `item 12: smb running ${running} about ${Math.round((Date.now() - t) / 1000)} s after the apply started; alex sees ${await listShares("alex")}`,
      );
    });
    await step("share read-modify-write", async () => {
      const row = await shareOf(photos);
      const classic = await s.call(
        "SMB",
        "setShare",
        rmw(row, {
          recyclebin: true,
          recyclemaxsize: 10,
          recyclemaxage: 7,
          timemachine: true,
          hostsallow: "",
          extraoptions: "veto files = /.DS_Store/",
        }),
      );
      fact(
        `a share with classic options: ${said(classic)}; pending ${await pending()}`,
      );
      await capture(
        "smbGetShareList",
        "classicOptions",
        "SMB",
        "getShareList",
        GET_ALL,
      );
      const before = await shareOf(photos);
      const changed = await s.call(
        "SMB",
        "setShare",
        rmw(before, { browseable: false }),
      );
      record("smbSetShare", "changed", changed.status, changed.body);
      const after = await shareOf(photos);
      const lost = Object.keys(before).filter(
        (k) =>
          k !== "browseable" &&
          JSON.stringify(before[k]) !== JSON.stringify(after[k]),
      );
      fact(
        `item 7: setShare with the row minus sharedfoldername: ${said(changed)}; fields changed besides browseable: ${lost.join(" ") || "none"}`,
      );
      const withName = await s.call("SMB", "setShare", {
        ...after,
        browseable: true,
      });
      fact(`item 7: setShare with sharedfoldername left in: ${said(withName)}`);
      const back = await s.call(
        "SMB",
        "setShare",
        rmw(await shareOf(photos), {
          browseable: true,
          recyclebin: false,
          recyclemaxsize: 0,
          recyclemaxage: 0,
          timemachine: false,
          macoscompat: false,
          extraoptions: "",
        }),
      );
      fact(`share options back to the defaults: ${said(back)}`);
      const row2 = await folderRow(photos);
      await s.call("ShareMgmt", "set", {
        uuid: row2.uuid,
        name: row2.name,
        comment: "Family photos",
        mntentref: row2.mntentref,
        reldirpath: row2.reldirpath,
      });
      fact(`item 2: set change with an SMB share: pending ${await pending()}`);
      await setAccess(photos, row2.privileges.privilege);
      fact(
        `item 2: set change and setPrivileges with an SMB share: pending ${await pending()}`,
      );
      await applyAll();
    });

    // ---- 8. What each access choice lets a person do (items 3, 4, 5) ----
    await step("access combinations", async () => {
      const cases = [
        ["person 7", [{ type: "user", name: "alex", perms: 7 }], {}],
        ["person 5", [{ type: "user", name: "alex", perms: 5 }], {}],
        [
          "no entry, another has 7",
          [{ type: "user", name: "sam", perms: 7 }],
          {},
        ],
        [
          "group 7, person no entry",
          [{ type: "group", name: GROUP, perms: 7 }],
          {},
        ],
        [
          "group 7, person 0",
          [
            { type: "group", name: GROUP, perms: 7 },
            { type: "user", name: "alex", perms: 0 },
          ],
          {},
        ],
        [
          "group 5, person 7",
          [
            { type: "group", name: GROUP, perms: 5 },
            { type: "user", name: "alex", perms: 7 },
          ],
          {},
        ],
        [
          "read only for everyone, person 7",
          [{ type: "user", name: "alex", perms: 7 }],
          { readonly: true },
        ],
        [
          "guest access on, person 0",
          [
            { type: "user", name: "alex", perms: 0 },
            { type: "user", name: "sam", perms: 7 },
          ],
          { guest: "allow" },
        ],
        [
          "guests only, person 7",
          [{ type: "user", name: "alex", perms: 7 }],
          { guest: "only" },
        ],
        ["empty list", [], {}],
      ];
      for (const [label, privileges, shareChange] of cases) {
        const p = await setAccess(photos, privileges);
        const sh = await s.call(
          "SMB",
          "setShare",
          rmw(await shareOf(photos), {
            readonly: false,
            guest: "no",
            ...shareChange,
          }),
        );
        if (p.status !== 200 || sh.status !== 200) {
          fact(
            `item 4 ${label}: could not be set up (${said(p)}; ${said(sh)})`,
          );
          continue;
        }
        await applyAll();
        await sleep(1500);
        const who = [
          await access("Photos", "alex"),
          await access("Photos", "robin"),
        ];
        if (shareChange.guest) {
          who.push(await access("Photos", null));
        }
        // The empty list's result is recorded for the owner and kept out of the repository's text.
        fact(
          `item ${label === "empty list" ? "3 (owner only)" : "4"} ${label}: alex ${who[0]}; robin (no entry) ${who[1]}${who[2] ? `; a guest ${who[2]}` : ""}`,
        );
      }
      // Back to the access the examples show.
      await setAccess(photos, [
        { type: "group", name: GROUP, perms: 5 },
        { type: "user", name: "alex", perms: 7 },
        { type: "user", name: "sam", perms: 5 },
      ]);
      await s.call(
        "SMB",
        "setShare",
        rmw(await shareOf(photos), { readonly: false, guest: "no" }),
      );
      await applyAll();
    });

    // ---- 9. A folder whose file system is not mounted (item 12) ----
    await step("file system not mounted", async () => {
      const onBtrfs = await newFolder("Archive", "btrfs", "Archive");
      fact(
        `a folder on BTRFS: ${said(onBtrfs)}; on the disk ${onBtrfs.status === 200 ? (await ssh(opts.ssh, `btrfs subvolume show '${folderPath(await folderRow(onBtrfs.body.response.uuid))}' >/dev/null 2>&1 && echo subvolume || echo folder`)).trim() : "-"}`,
      );
      await applyAll();
      if (!SAFE_PATH.test(mounts.btrfs.dir)) {
        throw new Error("unexpected mount folder");
      }
      await ssh(
        opts.ssh,
        `umount '${mounts.btrfs.dir}' && test -d '${mounts.btrfs.dir}'`,
      );
      try {
        const list = await capture(
          "shareMgmtGetList",
          "fsNotMounted",
          "ShareMgmt",
          "getList",
          GET_ALL,
        );
        const row = list.body.response.data.find((f) => f.name === "Archive");
        const c = await ok("ShareMgmt", "getCandidates");
        fact(
          `item 12: a folder whose file system is not mounted (its mount folder exists): status ${row?.status}; item 1: an unmounted file system among the candidates ${c.some((x) => x.uuid === mounts.btrfs.uuid)}`,
        );
      } finally {
        await ssh(opts.ssh, `mount '${mounts.btrfs.dir}'`);
      }
    });

    // ---- 10. A share whose folder was removed by hand (item 13) ----
    await step("share of a folder gone", async () => {
      const gone = await newFolder("Gone", "ext4", "Gone");
      const sh = await newShare(gone.body.response.uuid);
      await applyAll();
      const uuid = gone.body.response.uuid;
      if (!/^[0-9a-f-]{36}$/.test(uuid)) {
        throw new Error("unexpected UUID");
      }
      await ssh(
        opts.ssh,
        `omv-confdbadm delete --uuid ${uuid} conf.system.sharedfolder`,
      );
      made.folders = made.folders.filter((x) => x !== uuid);
      const list = await capture(
        "smbGetShareList",
        "folderGone",
        "SMB",
        "getShareList",
        GET_ALL,
      );
      fact(
        `item 13: getShareList when a share's folder was removed by hand: ${said(list)}`,
      );
      const del = await capture(
        "smbDeleteShare",
        "removed",
        "SMB",
        "deleteShare",
        { uuid: sh.body.response.uuid },
      );
      fact(`item 2: deleteShare: ${said(del)}; pending ${await pending()}`);
      made.shares = made.shares.filter((x) => x !== sh.body.response.uuid);
      await applyAll();
    });

    // ---- 11. Deleting (items 2, 10) ----
    await step("delete refused while shared", async () => {
      const refused = await s.call("ShareMgmt", "delete", {
        uuid: photos,
        recursive: false,
      });
      record("shareMgmtDelete", "referenced", refused.status, refused.body);
      await s.call(
        "SMB",
        "setShare",
        rmw(await shareOf(photos), { enable: false }),
      );
      const refusedOff = await s.call("ShareMgmt", "delete", {
        uuid: photos,
        recursive: false,
      });
      fact(
        `item 10: delete while an enabled share refers: ${said(refused)}; while a turned-off share refers: ${said(refusedOff)}`,
      );
      await applyAll();
    });
    await step("delete keeping the files", async () => {
      const existing = (await folders()).find((f) => f.name === "Existing");
      const path = folderPath(existing);
      const r = await s.call("ShareMgmt", "delete", {
        uuid: existing.uuid,
        recursive: false,
      });
      record("shareMgmtDelete", "removed", r.status, r.body);
      made.folders = made.folders.filter((x) => x !== existing.uuid);
      fact(
        `item 2: delete keeping the files: pending ${await pending()}; files still there ${(await ssh(opts.ssh, `test -f '${path}/keep.txt' && echo yes || echo no`)).trim()}`,
      );
      await applyAll();
    });
    await step("delete with another folder inside", async () => {
      const outer = await newFolder("Outer", "ext4", "Outer");
      const inner = await newFolder("Inner", "ext4", "Outer/Inner");
      fact(`a folder inside another: ${said(inner)}`);
      const r = await s.call("ShareMgmt", "delete", {
        uuid: outer.body.response.uuid,
        recursive: true,
      });
      record("shareMgmtDelete", "otherInside", r.status, r.body);
      await applyAll();
    });
    await step("delete with files, large", async () => {
      const big = await newFolder("Big", "ext4", "Big");
      const row = await folderRow(big.body.response.uuid);
      const path = folderPath(row);
      await applyAll();
      // About 2 GiB in 20,000 files of 100 kB, in 20 folders.
      await ssh(
        opts.ssh,
        `cd '${path}' && for d in $(seq 1 20); do mkdir d$d; for f in $(seq 1 1000); do head -c 100000 /dev/urandom > d$d/f$f; done; done; du -sh . | cut -f1`,
      );
      const t = Date.now();
      const r = await s.call("ShareMgmt", "delete", {
        uuid: row.uuid,
        recursive: true,
      });
      record("shareMgmtDelete", "deletedWithFiles", r.status, r.body);
      if (r.status === 200) {
        made.folders = made.folders.filter((x) => x !== row.uuid);
      }
      fact(
        `item 10: delete with 2 GiB in 20,000 files: ${said(r)} in ${Math.round((Date.now() - t) / 100) / 10} s; folder still there ${(await ssh(opts.ssh, `test -e '${path}' && echo yes || echo no`)).trim()}; item 2: pending ${await pending()}`,
      );
      await applyAll();
    });
    await step("delete with files, BTRFS snapshot", async () => {
      const archive = (await folders()).find((f) => f.name === "Archive");
      const path = folderPath(archive);
      const snap = `${mounts.btrfs.dir}/webui-test-snapshot`;
      await ssh(
        opts.ssh,
        `echo x > '${path}/a.txt' && btrfs subvolume snapshot -r '${path}' '${snap}' >/dev/null`,
      );
      const r = await s.call("ShareMgmt", "delete", {
        uuid: archive.uuid,
        recursive: true,
      });
      if (r.status === 200) {
        made.folders = made.folders.filter((x) => x !== archive.uuid);
      }
      fact(
        `item 10: delete with files on a BTRFS subvolume with a snapshot: ${said(r)}; folder still there ${(await ssh(opts.ssh, `test -e '${path}' && echo yes || echo no`)).trim()}; snapshot still there ${(await ssh(opts.ssh, `test -e '${snap}' && echo yes || echo no`)).trim()}`,
      );
      await ssh(
        opts.ssh,
        `btrfs subvolume delete '${snap}' >/dev/null 2>&1; true`,
      );
      await applyAll();
    });
    await step("a folder named homes, shared", async () => {
      const homes = (await folders()).find((f) => f.name === "homes");
      if (!homes) {
        return;
      }
      const sh = await newShare(homes.uuid);
      await setAccess(homes.uuid, [{ type: "user", name: "alex", perms: 7 }]);
      await applyAll();
      await sleep(1500);
      fact(
        `item 9: with a folder named homes shared: alex sees ${await listShares("alex")}; alex in homes ${await access("homes", "alex")}`,
      );
      await s.call("SMB", "deleteShare", { uuid: sh.body.response.uuid });
      made.shares = made.shares.filter((x) => x !== sh.body.response.uuid);
      await applyAll();
    });
    await step("stop sharing, SMB off", async () => {
      await capture(
        "smbGetShareList",
        "turnedOff",
        "SMB",
        "getShareList",
        GET_ALL,
      );
      const row = await shareOf(photos);
      const del = await s.call("SMB", "deleteShare", { uuid: row.uuid });
      fact(`deleteShare of Photos: ${said(del)}`);
      made.shares = made.shares.filter((x) => x !== row.uuid);
      const off = await s.call("SMB", "setSettings", {
        ...(await ok("SMB", "getSettings")),
        enable: false,
      });
      record("smbSetSettings", "turnedOff", off.status, off.body);
      fact(`item 2: setSettings off: pending ${await pending()}`);
      await applyAll();
      const r = await s.call("ShareMgmt", "delete", {
        uuid: photos,
        recursive: true,
      });
      fact(`item 2: delete with files: ${said(r)}; pending ${await pending()}`);
      if (r.status === 200) {
        made.folders = made.folders.filter((x) => x !== photos);
      }
      await applyAll();
    });
    await capture(
      "shareMgmtGetList",
      "afterShares",
      "ShareMgmt",
      "getList",
      GET_ALL,
    );
  } finally {
    // Leave the VM as it was.
    try {
      for (const uuid of made.shares) {
        await s.call("SMB", "deleteShare", { uuid });
      }
      for (const uuid of [...made.folders].reverse()) {
        if (!existingFolders.has(uuid)) {
          await s.call("ShareMgmt", "delete", { uuid, recursive: false });
        }
      }
      for (const f of await folders()) {
        if (!existingFolders.has(f.uuid)) {
          fact(
            `cleanup: a shared folder of this run is still there (${f.status})`,
          );
        }
      }
      const smbNow = await ok("SMB", "getSettings");
      if (JSON.stringify(smbNow) !== JSON.stringify(smbBefore)) {
        await ok("SMB", "setSettings", smbBefore);
      }
      // People first: on the test VM, deleting the group before its member was not done.
      for (const name of made.people) {
        const r = await s.call("UserMgmt", "deleteUser", { name });
        if (r.status !== 200) {
          fact(
            `cleanup: a test person was not deleted (HTTP ${r.status}); delete it on the VM`,
          );
        }
      }
      if (made.group) {
        const r = await s.call("UserMgmt", "deleteGroup", { name: GROUP });
        if (r.status !== 200) {
          fact(
            `cleanup: the test group was not deleted (HTTP ${r.status}); delete it on the VM`,
          );
        }
      }
      if ((await ok("Config", "isDirty")) !== false) {
        await applyAll();
      }
      if (made.pool) {
        const last = await runTask(
          "Zfs",
          "deleteObjectBg",
          { type: "Pool", name: POOL, mp: `/${POOL}`, recursive: false },
          "deletePool",
        );
        fact(`cleanup: pool deleted ${last.status === 200}`);
      }
      for (const type of made.fs) {
        const dir = mounts[type]?.dir;
        if (dir) {
          await s.call("FileSystemMgmt", "umountByDir", { dir });
        }
      }
      if ((await ok("Config", "isDirty")) !== false) {
        await applyAll();
      }
      for (const disk of made.wiped) {
        await ssh(
          opts.ssh,
          `zpool labelclear -f ${disk}1 2>/dev/null; zpool labelclear -f ${disk} 2>/dev/null; true`,
        );
        await runTask(
          "DiskMgmt",
          "wipe",
          { devicefile: disk, secure: false },
          "wipe",
        );
      }
      await ok("DiskMgmt", "rescan");
      const smbAfter = await ok("SMB", "getSettings");
      fact(
        `after cleanup: SMB settings as before ${JSON.stringify(smbAfter) === JSON.stringify(smbBefore)}; SMB shares ${(await shares()).length}; shared folders ${(await folders()).length} (was ${existingFolders.size}); pools ${(await ok("Zfs", "getPoolStatus")).length}; pending ${await pending()}`,
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
