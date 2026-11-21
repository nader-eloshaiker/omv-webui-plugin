#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Record the ZFS plugin's (openmediavault-zfs) replies on the disposable test VM, through a pool's
// whole life: no pool; a mirror of two with a file system, its size limit and compression, its
// snapshots taken, rolled back and deleted, checked (running, stopped, paused, finished), with a
// disk taken offline and brought back, with a working disk replaced by a third, then the file system
// and the pool deleted; a RAID-Z1 of three, a RAID-Z2 of four, a stripe of two and a single disk;
// the server's refusals met on the way. With the mirror idle, it also counts, per read, whether the
// member disks were read while the call ran. ERASES THE FOUR DISKS IT IS GIVEN.
//
//   node tools/contract-capture/zfs.mjs --disks /dev/sdb,/dev/sdc,/dev/sdd,/dev/sde --ssh <destination>
//
// Only for the test VM in $OMV_WEBUI_ENV (default ~/.config/omv-webui/test.env), never the owner's
// server. It refuses to start while configuration changes are pending or any pool exists, and
// refuses any disk the plugin's own candidate list (Zfs.getEmptyCandidates) does not offer: that
// list leaves out the system disk, read-only and USB disks, and every disk that holds something.
// Pools are created from the disks' stable /dev/disk/by-id/ names, as the interface sends them, with
// the interface's fixed settings (design phase-5-zfs 12.1).
//
// --ssh runs fixed, test-only commands on the VM, each with values this tool has checked:
// `cat /proc/diskstats` (did a read touch the disks?), writing 5 GiB of random data into the test
// file system (so a check and a rebuild last long enough to be seen), pausing a check (the classic
// interface's pause, not in the contract), exporting and importing the test pool (to read with
// ZFS's memory of the pool empty), `ls -l` of the plugin's configuration backups (reported, never
// written), and clearing ZFS's marks from the four disks when the pools are gone.
//
// It ends, also after a failure, by deleting every file system and pool made of its disks, applying
// what is pending, clearing ZFS's marks and quick-wiping the four disks, so the VM is left as it was.
// Replies are scrubbed and verified as by capture.mjs and written as draft examples the same way.
// Credentials, the host and the disks' identifiers are never printed.
import { spawn } from "node:child_process";
import {
  ENV_PATH,
  Session,
  followTask,
  loadEnv,
  openCapture,
  sleep,
} from "./capture.mjs";

const GET_ALL = { start: 0, limit: null, sortfield: null, sortdir: null };
const DISK = /^\/dev\/sd[a-z]$/;
const BY_ID = /^\/dev\/disk\/by-id\/[A-Za-z0-9._:+-]+$/;
const SSH_DESTINATION = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// The pool and file system this tool makes: documentation names, never the owner's.
const POOL = "tank";
const FS = "media";
const FS_PATH = `${POOL}/${FS}`;
// The interface's fixed settings for a new pool (design phase-5-zfs 12.1, D11 and D12).
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
const READS = [
  ["Zfs", "listCompressionTypes", {}],
  ["Zfs", "getPoolStatus", {}],
  ["Zfs", "getPoolDevices", { name: POOL }],
  ["Zfs", "getObjectDetails", { name: POOL, type: "Pool" }],
  ["Zfs", "listPools", GET_ALL],
  ["Zfs", "getAllSnapshots", GET_ALL],
  ["Zfs", "getObjectDetails", { name: FS_PATH, type: "Filesystem" }],
  ["Zfs", "getEmptyCandidates", {}],
  ["FileSystemMgmt", "getList", GET_ALL],
  ["FileSystemMgmt", "enumerateFilesystems", {}],
  ["FileSystemMgmt", "enumerateMountedFilesystems", { includeroot: false }],
];

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === "--disks") {
      out.disks = String(value).split(",");
      i++;
    } else if (flag === "--ssh") {
      out.ssh = value;
      i++;
    } else {
      throw new Error(`unknown argument ${flag}`);
    }
  }
  if (
    !Array.isArray(out.disks) ||
    out.disks.length !== 4 ||
    new Set(out.disks).size !== 4 ||
    !out.disks.every((d) => DISK.test(d))
  ) {
    throw new Error(
      "--disks takes four different whole-disk device files such as /dev/sdb,/dev/sdc,/dev/sdd,/dev/sde",
    );
  }
  if (!SSH_DESTINATION.test(String(out.ssh))) {
    throw new Error("--ssh takes an ssh destination such as omv8vm");
  }
  return out;
}

/** Run one fixed command on the VM over ssh and return its standard output. */
function ssh(destination, command) {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", ["-o", "BatchMode=yes", destination, command], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`a test-only command on the VM failed (${code})`)),
    );
  });
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
  const [b, c, d, e] = opts.disks;
  const short = (disk) => disk.slice("/dev/".length);

  const ok = async (service, method, params) => {
    const r = await s.call(service, method, params);
    if (r.status !== 200) {
      // The server's message may name a disk by its serial number: scrubbed before it is printed.
      throw new Error(
        scrub(
          `${service}.${method} failed (HTTP ${r.status}): ${r.body.error?.message ?? ""}`,
        ).slice(0, 400),
      );
    }
    return r.body.response;
  };
  /** Call a method and record its reply under a name, whatever its status. */
  const capture = async (operationId, name, service, method, params) => {
    const r = await s.call(service, method, params);
    record(operationId, name, r.status, r.body);
    return r;
  };
  const dirtyModules = async () => {
    const info = await ok("System", "getInformation");
    const m = info.dirtyModules;
    return m && !Array.isArray(m) ? Object.keys(m).sort() : [];
  };
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
    return Math.round((Date.now() - t) / 1000);
  };
  const pools = () => ok("Zfs", "getPoolStatus");
  const rows = async () => (await ok("Zfs", "listPools", GET_ALL)).data;
  const poolDevices = (name) => ok("Zfs", "getPoolDevices", { name });
  const report = (name) =>
    ok("Zfs", "getObjectDetails", { name, type: "Pool" });
  const candidates = async () =>
    (await ok("Zfs", "getEmptyCandidates")).map((x) => x.devicefile);
  /** The /dev/disk/by-id/ name the plugin offers for a disk, its description naming the disk. */
  const offeredName = async (disk) => {
    const list = await ok("Zfs", "getEmptyCandidates");
    const row = list.find((x) => x.description?.includes(`[${disk},`));
    if (!row || !BY_ID.test(row.devicefile)) {
      throw new Error(`${disk} is not among the plugin's candidates`);
    }
    return row.devicefile;
  };
  /** The path getPoolDevices gives for one of this tool's disks, by the disk's by-id name. */
  const memberPath = async (disk) => {
    const id = byId.get(disk);
    const row = (await poolDevices(POOL)).find(
      (x) => x.devicefile === id || x.devicefile.startsWith(`${id}-part`),
    );
    if (!row) {
      throw new Error(`${disk} is not a member of the test pool`);
    }
    return row.devicefile;
  };
  /** Record the four reads of a pool's state under one name. */
  const recordState = async (name, state) => {
    // The report first: it is the one that shows ZFS's work in progress.
    const detail = await capture(
      "zfsGetObjectDetails",
      state,
      "Zfs",
      "getObjectDetails",
      { name, type: "Pool" },
    );
    await capture("zfsListPools", state, "Zfs", "listPools", GET_ALL);
    await capture("zfsGetPoolDevices", state, "Zfs", "getPoolDevices", {
      name,
    });
    await capture("zfsGetPoolStatus", state, "Zfs", "getPoolStatus", {});
    const scan = /\bscan: (.*)/.exec(String(detail.body.response))?.[1] ?? "";
    fact(`${state}: scan line "${scrub(scan).slice(0, 120)}"`);
  };
  /** Wait until ZFS has no check or rebuild in progress on the pool. */
  const waitIdle = async (name, what) => {
    const t = Date.now();
    for (let i = 0; i < 1200; i++) {
      if (!/in progress/.test(await report(name))) {
        fact(
          `${what} took about ${Math.round((Date.now() - t) / 1000)} s (5 GiB on 8 GiB disks)`,
        );
        return;
      }
      await sleep(1000);
    }
    throw new Error(`${what} did not end in time`);
  };
  /** Reads completed per disk, from the VM's /proc/diskstats. */
  const diskReads = async () => {
    const reads = {};
    for (const line of (await ssh(opts.ssh, "cat /proc/diskstats")).split(
      "\n",
    )) {
      const f = line.trim().split(/\s+/);
      if (/^(sd[a-z]|nvme\d+n\d+)$/.test(f[2] ?? "")) {
        reads[f[2]] = Number(f[3]);
      }
    }
    return reads;
  };
  /** The disks whose read counter moved while `call` ran. */
  const moved = async (call) => {
    const before = await diskReads();
    await call();
    const after = await diskReads();
    return Object.keys(after)
      .filter((k) => after[k] !== before[k])
      .sort();
  };
  const createPool = async (pooltype, members, name) => {
    const devices = [];
    for (const disk of members) {
      devices.push(await offeredName(disk));
    }
    const t = Date.now();
    const r = await s.call("Zfs", "addPool", {
      ...POOL_SETTINGS,
      pooltype,
      name: POOL,
      devices,
    });
    if (r.status !== 200) {
      record("zfsAddPool", `${name}Failed`, r.status, r.body);
      throw new Error(`Zfs.addPool (${pooltype}) failed (HTTP ${r.status})`);
    }
    made.add(POOL);
    fact(
      `addPool ${pooltype}: HTTP 200 in ${Math.round((Date.now() - t) / 100) / 10} s, reply ${JSON.stringify(r.body.response)}; pending ${JSON.stringify(await dirtyModules())}`,
    );
  };
  const deleteObject = async (type, name, mp, capturedAs) => {
    // The task's last poll is recorded as execGetOutput.zfsDelete<What>Finished (or Failed).
    const taskName = capturedAs
      ? `zfsDelete${capturedAs[0].toUpperCase()}${capturedAs.slice(1)}`
      : "delete";
    const started = await s.call("Zfs", "deleteObjectBg", {
      type,
      name,
      mp,
      recursive: false,
    });
    if (capturedAs) {
      record("zfsDeleteObjectBg", capturedAs, started.status, started.body);
    }
    if (started.status !== 200) {
      throw new Error(`Zfs.deleteObjectBg (${type}) failed to start`);
    }
    const last = await followTask(
      s,
      started.body.response,
      taskName,
      capturedAs ? record : noRecord,
      {},
      { tries: 240 },
    );
    return last;
  };
  const deletePool = async (capturedAs) => {
    const last = await deleteObject("Pool", POOL, `/${POOL}`, capturedAs);
    if (last.status !== 200) {
      throw new Error("deleting the test pool failed");
    }
    made.delete(POOL);
    await refreshCandidates();
    fact(
      `after deleting a pool: pending ${JSON.stringify(await dirtyModules())}; offered again: ${opts.disks
        .filter((x) => candidatesNow.has(x))
        .map(short)
        .join(" ")}`,
    );
  };
  /** Clear ZFS's marks and quick-wipe disks no pool uses. */
  const wipeAll = async (disks) => {
    const inUse = new Set();
    for (const p of await pools()) {
      for (const dev of await poolDevices(p.name)) {
        inUse.add(dev.devicefile);
      }
    }
    for (const disk of disks) {
      const id = byId.get(disk);
      if ([...inUse].some((x) => x === id || x.startsWith(`${id}-part`))) {
        throw new Error(`refusing to wipe ${disk}: it is in a pool`);
      }
      await ssh(
        opts.ssh,
        `zpool labelclear -f ${disk}1 2>/dev/null; zpool labelclear -f ${disk} 2>/dev/null; true`,
      );
      const last = await runTask(
        "DiskMgmt",
        "wipe",
        { devicefile: disk, secure: false },
        "wipe",
      );
      if (last.status !== 200) {
        throw new Error(`wiping ${disk} failed`);
      }
    }
    await ok("DiskMgmt", "rescan");
    await sleep(2000);
  };
  let candidatesNow = new Set();
  const refreshCandidates = async () => {
    const list = await candidates();
    candidatesNow = new Set(
      opts.disks.filter((x) => {
        const id = byId.get(x);
        return list.includes(id) || list.includes(x);
      }),
    );
  };

  // ---- Before anything changes -------------------------------------------------------------------
  if ((await ok("Config", "isDirty")) !== false) {
    throw new Error(
      "the VM has pending configuration changes; apply or revert them first",
    );
  }
  if ((await pools()).length !== 0 || (await rows()).length !== 0) {
    throw new Error(
      "the VM already has a ZFS pool; this tool starts from none",
    );
  }
  const disks = (await ok("DiskMgmt", "getList", GET_ALL)).data;
  const byId = new Map(
    disks
      .filter((x) => x.devicefile?.startsWith("/dev/disk/by-id/"))
      .map((x) => [x.canonicaldevicefile, x.devicefile]),
  );
  const offered = await s.call("Zfs", "getEmptyCandidates");
  const offeredList = (offered.body.response ?? []).map((x) => x.devicefile);
  for (const disk of opts.disks) {
    if (!BY_ID.test(byId.get(disk) ?? "")) {
      throw new Error(`${disk} has no usable /dev/disk/by-id/ name`);
    }
    if (!offeredList.includes(byId.get(disk))) {
      throw new Error(
        `${disk} is not among the plugin's candidates (in use, holding something, or read-only); nothing was changed`,
      );
    }
  }
  record("zfsGetEmptyCandidates", "vmScratch", offered.status, offered.body);
  await capture(
    "zfsListCompressionTypes",
    "list",
    "Zfs",
    "listCompressionTypes",
    {},
  );
  await capture("zfsListPools", "none", "Zfs", "listPools", GET_ALL);
  await capture("zfsGetPoolStatus", "none", "Zfs", "getPoolStatus", {});
  await capture(
    "zfsGetAllSnapshots",
    "none",
    "Zfs",
    "getAllSnapshots",
    GET_ALL,
  );
  const notFound = await capture(
    "zfsGetObjectDetails",
    "notFound",
    "Zfs",
    "getObjectDetails",
    { name: "nosuchpool", type: "Pool" },
  );
  fact(
    `getObjectDetails for a pool that does not exist: HTTP ${notFound.status}; getPoolDevices for one: ${JSON.stringify(await poolDevices("nosuchpool"))}`,
  );
  fact(
    `with no pool, getEmptyCandidates offers: ${opts.disks.map(short).join(" ")}`,
  );

  const made = new Set(); // pools this run created and has not deleted
  try {
    // ---- A mirror of two, with a file system -------------------------------------------------
    await createPool("mirror", [b, c], "mirror");
    fact(
      `the plugin's configuration backups: ${(
        await ssh(
          opts.ssh,
          "ls -l /etc/openmediavault/config-zfs-*.xml 2>/dev/null | awk '{print $1, $3, $4}' | sort | uniq -c",
        )
      )
        .trim()
        .replace(/\s+/g, " ")}`,
    );
    await recordState(POOL, "mirror");
    await capture(
      "zfsGetEmptyCandidates",
      "afterMirror",
      "Zfs",
      "getEmptyCandidates",
      {},
    );
    // A disk in an active pool, and a name ZFS keeps for itself: ZFS refuses both.
    const inUse = await s.call("Zfs", "addPool", {
      ...POOL_SETTINGS,
      pooltype: "basic",
      name: "other",
      devices: [byId.get(b)],
    });
    record("zfsAddPool", "diskInUse", inUse.status, inUse.body);
    fact(`addPool with a disk of the mirror: HTTP ${inUse.status}`);
    const reserved = await s.call("Zfs", "addPool", {
      ...POOL_SETTINGS,
      pooltype: "basic",
      name: "mirror1",
      devices: [await offeredName(e)],
    });
    record("zfsAddPool", "reservedName", reserved.status, reserved.body);
    if (reserved.status === 200) {
      // ZFS took the name after all: the pool is deleted again at once.
      await deleteObject("Pool", "mirror1", "/mirror1");
    }
    await refreshCandidates();
    fact(
      `addPool named "mirror1": HTTP ${reserved.status}; ${short(e)} still offered ${candidatesNow.has(e)}, signatures on it ${(await ssh(opts.ssh, `wipefs -n ${e} | tail -n +2 | wc -l`)).trim()}`,
    );
    if (!candidatesNow.has(e)) {
      await wipeAll([e]);
    }
    fact(`applying after addPool took about ${await applyAll()} s`);

    const added = await s.call("Zfs", "addObject", {
      type: "filesystem",
      path: POOL,
      name: FS,
      mountpoint: "",
    });
    fact(
      `addObject filesystem: HTTP ${added.status}, reply ${JSON.stringify(added.body.response)}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    const again = await s.call("Zfs", "addObject", {
      type: "filesystem",
      path: POOL,
      name: FS,
      mountpoint: "",
    });
    fact(
      `addObject with a name already taken: HTTP ${again.status}; rows named ${FS_PATH}: ${(await rows()).filter((x) => x.path === FS_PATH).length}`,
    );
    fact(`applying after addObject took about ${await applyAll()} s`);
    const fsRows = await rows();
    const root = fsRows.find((x) => x.type === "Filesystem" && x.poolroot);
    const pool = fsRows.find((x) => x.type === "Pool");
    fact(
      `pool row size ${pool?.size}, own folder used + available ${root ? root.used + root.available : "?"}`,
    );
    for (const [op, method, params] of [
      ["fileSystemMgmtGetList", "getList", GET_ALL],
      ["fileSystemMgmtEnumerateFilesystems", "enumerateFilesystems", {}],
      [
        "fileSystemMgmtEnumerateMountedFilesystems",
        "enumerateMountedFilesystems",
        { includeroot: false },
      ],
    ]) {
      await capture(op, "zfs", "FileSystemMgmt", method, params);
    }
    const mountable = await ok("FileSystemMgmt", "getMountCandidates");
    fact(
      `getMountCandidates offers a ZFS file system: ${mountable.some((x) => x.type === "zfs")}`,
    );
    const byName = await s.call("FsTab", "getByFsName", { fsname: FS_PATH });
    fact(`FsTab.getByFsName with ${FS_PATH}: HTTP ${byName.status}`);

    // Data, so that a check and a rebuild last long enough to be seen.
    await ssh(
      opts.ssh,
      `dd if=/dev/urandom of=/${FS_PATH}/fill.bin bs=1M count=5120 status=none && sync`,
    );
    await sleep(6000);

    // ---- Which reads touch the member disks --------------------------------------------------
    const control = await moved(() => sleep(1000));
    fact(
      `reads: nothing called for 1 s, disks read meanwhile: ${control.join(" ") || "none"}`,
    );
    for (const [service, method, params] of READS) {
      const hits = [];
      const times = [];
      for (let i = 0; i < 3; i++) {
        hits.push(
          await moved(async () => {
            const t = Date.now();
            await ok(service, method, params);
            times.push(Date.now() - t);
          }),
        );
        await sleep(500);
      }
      fact(
        `reads, warm, ${service}.${method}${params.type ? ` (${params.type})` : ""}: ${hits.map((h) => h.join(" ") || "none").join(" | ")} (${times.join(", ")} ms)`,
      );
    }
    for (const [service, method, params] of READS) {
      await ssh(
        opts.ssh,
        `zpool export ${POOL} && zpool import -d /dev/disk/by-id ${POOL}`,
      );
      await sleep(3000);
      const hits = await moved(() => ok(service, method, params));
      fact(
        `reads, first after import, ${service}.${method}${params.type ? ` (${params.type})` : ""}: ${hits.join(" ") || "none"}`,
      );
    }

    // ---- The file system's settings ----------------------------------------------------------
    await capture("zfsListPools", "mirrorWithFs", "Zfs", "listPools", GET_ALL);
    const set = await s.call("Zfs", "setProperties", {
      type: "Filesystem",
      name: FS_PATH,
      properties: [
        { property: "quota", value: "6G", modified: true },
        { property: "compression", value: "off", modified: true },
      ],
    });
    fact(
      `setProperties quota and compression: HTTP ${set.status}, reply ${JSON.stringify(set.body.response)}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    const below = await s.call("Zfs", "setProperties", {
      type: "Filesystem",
      name: FS_PATH,
      properties: [{ property: "quota", value: "1G", modified: true }],
    });
    record("zfsSetProperties", "belowUsed", below.status, below.body);
    fact(
      `setProperties with a limit below what it holds: HTTP ${below.status}`,
    );
    await capture(
      "zfsListPools",
      "mirrorFsSettings",
      "Zfs",
      "listPools",
      GET_ALL,
    );
    await capture(
      "zfsGetObjectDetails",
      "filesystem",
      "Zfs",
      "getObjectDetails",
      { name: FS_PATH, type: "Filesystem" },
    );
    fact(`applying after setProperties took about ${await applyAll()} s`);

    // ---- Snapshots ---------------------------------------------------------------------------
    await ok("Zfs", "quickSnapshot", { name: FS_PATH, recursive: false });
    fact(`quickSnapshot: pending ${JSON.stringify(await dirtyModules())}`);
    await capture(
      "zfsGetAllSnapshots",
      "one",
      "Zfs",
      "getAllSnapshots",
      GET_ALL,
    );
    await sleep(1100);
    // Two in one second: the second is refused, as its name is taken.
    let sameSecond;
    for (let i = 0; i < 5 && !sameSecond; i++) {
      await sleep(1000 - (Date.now() % 1000) + 50);
      await ok("Zfs", "quickSnapshot", { name: FS_PATH, recursive: false });
      const r = await s.call("Zfs", "quickSnapshot", {
        name: FS_PATH,
        recursive: false,
      });
      if (r.status !== 200) {
        sameSecond = r;
      }
    }
    if (sameSecond) {
      record(
        "zfsQuickSnapshot",
        "sameSecond",
        sameSecond.status,
        sameSecond.body,
      );
    }
    fact(
      `two quickSnapshots in one second: second refused ${Boolean(sameSecond)}`,
    );
    const snaps = await s.call("Zfs", "getAllSnapshots", GET_ALL);
    record("zfsGetAllSnapshots", "several", snaps.status, snaps.body);
    const list = snaps.body.response.data.filter((x) => x.parent === FS_PATH);
    fact(
      `getAllSnapshots order: ${list.length} rows, in name order ${list.every((x, i) => i === 0 || list[i - 1].name < x.name)}`,
    );
    const oldest = list[0].path;
    const newest = list.at(-1).path;
    const refused = await s.call("Zfs", "rollbackSnapshot", { name: oldest });
    record(
      "zfsRollbackSnapshot",
      "newerSnapshots",
      refused.status,
      refused.body,
    );
    fact(`rollback to the oldest: HTTP ${refused.status}`);
    const rolled = await s.call("Zfs", "rollbackSnapshot", { name: newest });
    fact(
      `rollback to the newest: HTTP ${rolled.status}, reply ${JSON.stringify(rolled.body.response)}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    const delSnap = await deleteObject("Snapshot", oldest, "", "snapshot");
    fact(
      `deleteObjectBg snapshot: task ${delSnap.status === 200 ? "finished" : "failed"}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    const withFs = await deleteObject("Pool", POOL, `/${POOL}`, "poolWithFs");
    fact(
      `deleteObjectBg of a pool with a file system: task HTTP ${withFs.status}; pool still there ${(await pools()).length === 1}`,
    );
    if ((await ok("Config", "isDirty")) !== false) {
      fact(`applying after the snapshots took about ${await applyAll()} s`);
    }

    // ---- Checking the pool -------------------------------------------------------------------
    // Read at once: a check of 5 GiB on the VM's disks takes only seconds.
    const started = await s.call("Zfs", "scrubPool", { name: POOL });
    await recordState(POOL, "mirrorChecking");
    const stopped = await s.call("Zfs", "stopScrub", { name: POOL });
    fact(
      `scrubPool: HTTP ${started.status}, reply ${JSON.stringify(started.body.response)}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    fact(
      `stopScrub: HTTP ${stopped.status}, reply ${JSON.stringify(stopped.body.response)}`,
    );
    await recordState(POOL, "mirrorCheckStopped");
    const noCheck = await s.call("Zfs", "stopScrub", { name: POOL });
    record("zfsStopScrub", "notChecking", noCheck.status, noCheck.body);
    fact(`stopScrub with no check running: HTTP ${noCheck.status}`);
    await ok("Zfs", "scrubPool", { name: POOL });
    await ssh(opts.ssh, `zpool scrub -p ${POOL}`);
    await sleep(500);
    await recordState(POOL, "mirrorCheckPaused");
    const resumed = await s.call("Zfs", "scrubPool", { name: POOL });
    fact(`scrubPool on a paused check: HTTP ${resumed.status}`);
    await waitIdle(POOL, "the check");
    await recordState(POOL, "mirrorChecked");

    // ---- A disk offline, then back -----------------------------------------------------------
    const cPath = await memberPath(c);
    const offline = await s.call("Zfs", "deviceOffline", {
      pool: POOL,
      device: cPath,
    });
    fact(
      `deviceOffline: HTTP ${offline.status}, reply ${JSON.stringify(offline.body.response)}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    await recordState(POOL, "mirrorDegraded");
    const last = await s.call("Zfs", "deviceOffline", {
      pool: POOL,
      device: await memberPath(b),
    });
    record("zfsDeviceOffline", "noReplicas", last.status, last.body);
    fact(`deviceOffline of the last working disk: HTTP ${last.status}`);
    const online = await s.call("Zfs", "deviceOnline", {
      pool: POOL,
      device: cPath,
    });
    fact(`deviceOnline: HTTP ${online.status}`);
    await waitIdle(POOL, "catching up after deviceOnline");
    const clear = await s.call("Zfs", "clearPool", { name: POOL });
    fact(`clearPool: HTTP ${clear.status}`);

    // ---- A working disk replaced by another --------------------------------------------------
    const newDisk = await offeredName(d);
    const replaced = await s.call("Zfs", "deviceReplace", {
      pool: POOL,
      olddevice: cPath,
      newdevice: newDisk,
    });
    fact(
      `deviceReplace: HTTP ${replaced.status}, reply ${JSON.stringify(replaced.body.response)}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    if (replaced.status !== 200) {
      record("zfsDeviceReplace", "failed", replaced.status, replaced.body);
      throw new Error("Zfs.deviceReplace failed");
    }
    await recordState(POOL, "mirrorReplacing");
    await waitIdle(POOL, "the rebuild onto the new disk");
    await recordState(POOL, "mirrorReplaced");
    await refreshCandidates();
    fact(
      `after the replace, offered: ${[...candidatesNow].map(short).join(" ") || "none"}`,
    );

    // ---- Deleted -----------------------------------------------------------------------------
    const delFs = await deleteObject(
      "Filesystem",
      FS_PATH,
      `/${FS_PATH}`,
      "filesystem",
    );
    fact(
      `deleteObjectBg file system: task HTTP ${delFs.status}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    await refreshCandidates();
    await deletePool("pool");
    await capture(
      "zfsGetEmptyCandidates",
      "afterPoolDeleted",
      "Zfs",
      "getEmptyCandidates",
      {},
    );
    fact(
      `after delete: wipefs lines ${(
        await ssh(
          opts.ssh,
          `for x in ${opts.disks.join(" ")}; do wipefs -n $x | tail -n +2 | wc -l; done`,
        )
      )
        .trim()
        .replace(/\s+/g, " ")}`,
    );
    fact(`applying after the deletes took about ${await applyAll()} s`);
    await wipeAll(opts.disks);

    // ---- The other layouts -------------------------------------------------------------------
    for (const [pooltype, members, state] of [
      ["raidz1", [b, c, d], "raidz1"],
      ["raidz2", [b, c, d, e], "raidz2"],
      ["basic", [b, c], "stripe"],
      ["basic", [b], "single"],
    ]) {
      await createPool(pooltype, members, state);
      await recordState(POOL, state);
      const rootRow = (await rows()).find((x) => x.poolroot);
      fact(
        `${state}: own folder used + available ${rootRow ? rootRow.used + rootRow.available : "?"}`,
      );
      await deletePool();
      await applyAll();
      await wipeAll(members);
    }
  } finally {
    // Leave the VM as it was: no pool of these disks, nothing pending, the disks empty.
    try {
      for (const p of await pools()) {
        const devs = await poolDevices(p.name);
        const ours = devs.every((x) =>
          opts.disks.some((disk) => {
            const id = byId.get(disk);
            return x.devicefile === id || x.devicefile.startsWith(`${id}-part`);
          }),
        );
        if (!ours || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(p.name)) {
          continue;
        }
        for (const row of (await rows()).filter(
          (x) => x.type === "Filesystem" && !x.poolroot && x.pool === p.name,
        )) {
          await deleteObject("Filesystem", row.path, row.mountpoint);
        }
        await deleteObject("Pool", p.name, `/${p.name}`);
      }
      if ((await ok("Config", "isDirty")) !== false) {
        fact(`the last apply took about ${await applyAll()} s`);
      }
      await wipeAll(opts.disks);
      await refreshCandidates();
      fact(
        `after cleanup: pools ${(await pools()).length}; every disk a candidate again ${candidatesNow.size === 4}; pending ${JSON.stringify(await dirtyModules())}; made and not deleted ${made.size}`,
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
