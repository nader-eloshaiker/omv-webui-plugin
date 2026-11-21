#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Record the RAID plugin's (openmediavault-md) replies on the disposable test VM, through an array's
// whole life: the candidates; a mirror created, synchronising and clean, with a spare, with a member
// failed and rebuilt onto the spare, with a working member taken out and a replacement added, being
// checked, holding a mounted file system, and deleted; a RAID5 of three grown to four; a RAID6 of
// four with one and then two members failed; a RAID10 of four; a stripe of two. ERASES THE FOUR
// DISKS IT IS GIVEN.
//
//   node tools/contract-capture/raid.mjs --disks /dev/sdb,/dev/sdc,/dev/sdd,/dev/sde --ssh <destination>
//
// Only for the test VM in $OMV_WEBUI_ENV (default ~/.config/omv-webui/test.env), never the owner's
// server. It refuses to start while configuration changes are pending or any array exists, and
// refuses any disk the plugin's own candidate list (MdMgmt.getCandidates) does not offer: that list
// leaves out the system disk, read-only and USB disks, and every disk that holds something. Arrays
// are created from the disks' stable /dev/disk/by-id/ names, as the interface sends them.
//
// --ssh runs two fixed, test-only commands on the VM: `mdadm --manage <array> --fail <disk>` to fail
// a member (the method the plugin's own source names for testing), and `cat /proc/diskstats` to see
// whether a read touches the disks. Both take only values this tool has checked.
//
// It ends, also after a failure, by unmounting what it mounted, deleting every array made of its
// disks, applying what is pending, and quick-wiping the four disks, so the VM is left as it was.
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
const ARRAY = /^\/dev\/md[0-9]{1,3}$/;
const SSH_DESTINATION = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// The kernel is doing long work on the array: synchronising, rebuilding, reshaping or checking.
const BUSY = /resync|recover|reshap|check/i;

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

  const ok = async (service, method, params) => {
    const r = await s.call(service, method, params);
    if (r.status !== 200) {
      // The server's message may name the array by its host name: scrubbed before it is printed.
      throw new Error(
        scrub(
          `${service}.${method} failed (HTTP ${r.status}): ${r.body.error?.message ?? ""}`,
        ).slice(0, 300),
      );
    }
    return r.body.response;
  };
  const dirtyModules = async () => {
    const info = await ok("System", "getInformation");
    const m = info.dirtyModules;
    return m && !Array.isArray(m) ? Object.keys(m).sort() : [];
  };
  const runTask = async (service, method, params, name) => {
    const started = await s.call(service, method, params);
    if (started.status !== 200) {
      throw new Error(`${service}.${method} failed (HTTP ${started.status})`);
    }
    const last = await followTask(
      s,
      started.body.response,
      name,
      noRecord,
      {},
      {
        tries: 2400,
      },
    );
    if (last.status !== 200) {
      throw new Error(`${service}.${method}'s task failed`);
    }
    return last.body.response.output;
  };
  const applyAll = async () => {
    const t = Date.now();
    await runTask(
      "Config",
      "applyChangesBg",
      { modules: [], force: false },
      "apply",
    );
    return Math.round((Date.now() - t) / 1000);
  };
  const arrays = () => ok("MdMgmt", "enumerateDevices");
  const arrayRow = async (devicefile) =>
    (await arrays()).find((a) => a.devicefile === devicefile);
  /** Record enumerateDevices and the array's report under one state name. */
  const recordState = async (devicefile, name) => {
    const list = await s.call("MdMgmt", "enumerateDevices");
    record("mdMgmtEnumerateDevices", name, list.status, list.body);
    const detail = await s.call("MdMgmt", "getDetail", { devicefile });
    record("mdMgmtGetDetail", name, detail.status, detail.body);
    const row = list.body.response?.find((a) => a.devicefile === devicefile);
    fact(
      `${name}: state "${row?.state}", syncaction ${JSON.stringify(row?.syncaction)}, numdevices ${row?.numdevices}, devices ${JSON.stringify(row?.devices)}, size ${row?.size}`,
    );
    return row;
  };
  /** Wait until the kernel has finished its long work on the array. */
  const waitIdle = async (devicefile, what) => {
    const t = Date.now();
    for (let i = 0; i < 1200; i++) {
      const row = await arrayRow(devicefile);
      if (
        row &&
        (row.syncaction === "idle" || row.syncaction === null) &&
        !BUSY.test(String(row.state))
      ) {
        fact(
          `${what} took about ${Math.round((Date.now() - t) / 1000)} s (8 GiB disks)`,
        );
        return row;
      }
      await sleep(3000);
    }
    throw new Error(`${what} did not end in time`);
  };
  const failMember = (devicefile, disk) => {
    if (!ARRAY.test(devicefile) || !opts.disks.includes(disk)) {
      throw new Error("refusing to fail a disk that is not one of --disks");
    }
    return ssh(opts.ssh, `mdadm --manage ${devicefile} --fail ${disk}`);
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
  /** Which disks a call read from: the disks whose read counter moved while it ran. */
  const touched = async (what, call) => {
    const before = await diskReads();
    await call();
    const after = await diskReads();
    const moved = Object.keys(after).filter((k) => after[k] !== before[k]);
    fact(
      `${what}: disks read meanwhile: ${moved.length ? moved.sort().join(" ") : "none"}`,
    );
  };
  const candidates = async () =>
    (await ok("MdMgmt", "getCandidates")).map((x) => x.devicefile);
  const wipe = async (disk) => {
    const members = (await arrays()).filter((a) =>
      a.devices.some((m) => m === disk),
    );
    if (members.length) {
      throw new Error(`refusing to wipe ${disk}: it is in an array`);
    }
    await runTask(
      "DiskMgmt",
      "wipe",
      { devicefile: disk, secure: false },
      "wipe",
    );
  };
  const wipeAll = async (disks) => {
    for (const disk of disks) {
      await wipe(disk);
    }
    await ok("DiskMgmt", "rescan");
    await sleep(2000);
  };
  const create = async (level, members, name) => {
    const r = await s.call("MdMgmt", "create", {
      devices: members.map((m) => byId.get(m)),
      name: "",
      level,
    });
    record("mdMgmtCreate", name, r.status, r.body);
    if (r.status !== 200) {
      throw new Error(`MdMgmt.create (${level}) failed (HTTP ${r.status})`);
    }
    const devicefile = r.body.response.devicefile;
    if (!ARRAY.test(devicefile)) {
      throw new Error("MdMgmt.create named no /dev/mdN device");
    }
    fact(
      `create ${level}: reply level "${r.body.response.level}", numdevices ${r.body.response.numdevices}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    return devicefile;
  };
  const remove = async (devicefile, disk, name) => {
    const r = await s.call("MdMgmt", "remove", { devicefile, devices: [disk] });
    record("mdMgmtRemove", name, r.status, r.body);
    if (r.status !== 200) {
      throw new Error(`MdMgmt.remove (${name}) failed (HTTP ${r.status})`);
    }
    fact(
      `remove ${name}: reply numdevices ${r.body.response.numdevices}, devices ${JSON.stringify(r.body.response.devices)}`,
    );
  };
  const add = async (devicefile, disk, name) => {
    const r = await s.call("MdMgmt", "add", {
      devicefile,
      devices: [byId.get(disk)],
    });
    record("mdMgmtAdd", name, r.status, r.body);
    if (r.status !== 200) {
      throw new Error(`MdMgmt.add (${name}) failed (HTTP ${r.status})`);
    }
    fact(
      `add ${name}: reply numdevices ${r.body.response.numdevices}; pending ${JSON.stringify(await dirtyModules())}`,
    );
  };
  const destroy = async (devicefile, name) => {
    const r = await s.call("MdMgmt", "delete", { devicefile });
    if (name) {
      record("mdMgmtDelete", name, r.status, r.body);
    }
    if (r.status !== 200) {
      throw new Error(`MdMgmt.delete failed (HTTP ${r.status})`);
    }
  };

  // ---- Before anything changes -------------------------------------------------------------------
  if ((await ok("Config", "isDirty")) !== false) {
    throw new Error(
      "the VM has pending configuration changes; apply or revert them first",
    );
  }
  if ((await arrays()).length !== 0) {
    throw new Error(
      "the VM already has a RAID array; this tool starts from none",
    );
  }
  const disks = (await ok("DiskMgmt", "getList", GET_ALL)).data;
  const byId = new Map(disks.map((x) => [x.canonicaldevicefile, x.devicefile]));
  const offered = await s.call("MdMgmt", "getCandidates");
  record("mdMgmtGetCandidates", "vmScratch", offered.status, offered.body);
  const offeredSet = new Set(
    (offered.body.response ?? []).map((x) => x.devicefile),
  );
  for (const disk of opts.disks) {
    if (!offeredSet.has(disk) && !offeredSet.has(byId.get(disk))) {
      throw new Error(
        `${disk} is not among the plugin's candidates (in use, holding something, or read-only); nothing was changed`,
      );
    }
    if (!byId.get(disk)?.startsWith("/dev/disk/by-id/")) {
      throw new Error(`${disk} has no /dev/disk/by-id/ name`);
    }
  }
  fact(`candidates: ${[...offeredSet].sort().join(" ")}`);
  await touched("getCandidates", () => ok("MdMgmt", "getCandidates"));

  const made = new Set(); // arrays this run created and has not deleted
  let mounted; // the mount folder of the file system on the mirror
  try {
    // ---- A mirror of two ----------------------------------------------------------------------
    const md = await create("mirror", [b, c], "mirror");
    made.add(md);
    let row = await recordState(md, "mirrorSyncing");
    fact(
      `devices sent by their by-id names are listed by their kernel names: ${JSON.stringify(row?.devices) === JSON.stringify([b, c])}`,
    );
    const slaves = await s.call("MdMgmt", "getSlaves", { devicefile: md });
    record("mdMgmtGetSlaves", "mirror", slaves.status, slaves.body);
    fact(
      `getSlaves size type: ${typeof slaves.body.response?.[0]?.size}; candidates while syncing: ${(await candidates()).sort().join(" ")}`,
    );
    await waitIdle(md, "the mirror's first synchronisation");
    row = await recordState(md, "mirror");
    await touched("enumerateDevices on an idle array", () => arrays());
    await touched("getDetail on an idle array", () =>
      ok("MdMgmt", "getDetail", { devicefile: md }),
    );
    await touched("getSlaves on an idle array", () =>
      ok("MdMgmt", "getSlaves", { devicefile: md }),
    );
    fact(`applying mdadm and initramfs took about ${await applyAll()} s`);

    // A spare, then a member fails and the spare takes over.
    await add(md, d, "spare");
    await recordState(md, "mirrorWithSpare");
    await failMember(md, b);
    await sleep(1500);
    await recordState(md, "mirrorRebuilding");
    await remove(md, b, "failed");
    await waitIdle(md, "the rebuild onto the spare");
    fact(
      `a disk taken out keeps the array's marks; candidates now: ${(await candidates()).sort().join(" ")}`,
    );

    // A working member taken out, and a replacement (the failed disk, erased) added.
    await remove(md, d, "working");
    await recordState(md, "mirrorDegraded");
    await wipeAll([b]);
    await add(md, b, "replacement");
    await recordState(md, "mirrorReplacing");
    await waitIdle(md, "the rebuild onto the replacement");

    // A spare taken out.
    await wipeAll([d]);
    await add(md, d, "spareAgain");
    await remove(md, d, "spare");

    // A check, stopped.
    const check = await s.call("MdMgmt", "setSyncAction", {
      devicefile: md,
      action: "check",
    });
    fact(
      `setSyncAction check: HTTP ${check.status}, reply ${JSON.stringify(check.body.response)}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    await sleep(1500);
    await recordState(md, "mirrorChecking");
    const idle = await s.call("MdMgmt", "setSyncAction", {
      devicefile: md,
      action: "idle",
    });
    await sleep(1000);
    const after = await arrayRow(md);
    fact(
      `setSyncAction idle: HTTP ${idle.status}, reply ${JSON.stringify(idle.body.response)}; then state "${after?.state}", syncaction ${after?.syncaction}`,
    );

    // A file system on it, mounted: the delete is refused.
    const fsCandidates = JSON.parse(
      await runTask("FileSystemMgmt", "getCandidatesBg", {}, "fsCandidates"),
    ).map((x) => x.devicefile);
    fact(
      `the new array is a file-system candidate: ${fsCandidates.includes(md)}`,
    );
    await runTask(
      "FileSystemMgmt",
      "create",
      { devicefile: md, type: "ext4" },
      "createExt4",
    );
    const fsRow = (await ok("FileSystemMgmt", "getMountCandidates")).find(
      (x) => x.canonicaldevicefile === md || x.parentdevicefile === md,
    );
    if (!fsRow) {
      throw new Error("the file system on the array is not a mount candidate");
    }
    await ok("FileSystemMgmt", "setMountPoint", {
      id: fsRow.canonicaldevicefile,
    });
    await applyAll();
    const mountedRow = (
      await ok("FileSystemMgmt", "getList", GET_ALL)
    ).data.find((x) => x.canonicaldevicefile === fsRow.canonicaldevicefile);
    mounted = mountedRow?.mountpoint;
    fact(`file system on the array mounted: ${mountedRow?.mounted === true}`);
    const inUse = await s.call("MdMgmt", "enumerateDevices");
    record("mdMgmtEnumerateDevices", "mirrorInUse", inUse.status, inUse.body);
    const refused = await s.call("MdMgmt", "delete", { devicefile: md });
    record("mdMgmtDelete", "mounted", refused.status, refused.body);
    fact(
      `delete while mounted: HTTP ${refused.status}; array still there: ${(await arrayRow(md)) !== undefined}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    await ok("FileSystemMgmt", "umountByDir", { dir: mounted });
    mounted = undefined;
    await applyAll();

    // Deleted.
    await destroy(md, "deleted");
    made.delete(md);
    fact(
      `after delete: arrays ${(await arrays()).length}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    await wipeAll([b, c, d]);

    // ---- A RAID5 of three, grown to four ------------------------------------------------------
    const r5 = await create("raid5", [b, c, d], "raid5");
    made.add(r5);
    await recordState(r5, "raid5Syncing");
    await waitIdle(r5, "the RAID5's first synchronisation");
    const before = await recordState(r5, "raid5");
    const grown = await s.call("MdMgmt", "grow", {
      devicefile: r5,
      devices: [byId.get(e)],
    });
    record("mdMgmtGrow", "reshaping", grown.status, grown.body);
    if (grown.status !== 200) {
      throw new Error(`MdMgmt.grow failed (HTTP ${grown.status})`);
    }
    fact(
      `grow: reply numdevices ${grown.body.response.numdevices}; pending ${JSON.stringify(await dirtyModules())}`,
    );
    await sleep(2000);
    await recordState(r5, "raid5Reshaping");
    await waitIdle(r5, "the reshape from three disks to four");
    const grownRow = await arrayRow(r5);
    fact(`RAID5 size before the grow ${before?.size}, after ${grownRow?.size}`);
    const grownList = await s.call("MdMgmt", "enumerateDevices");
    record(
      "mdMgmtEnumerateDevices",
      "raid5Grown",
      grownList.status,
      grownList.body,
    );
    const missing = await s.call("MdMgmt", "getDetail", {
      devicefile: "/dev/md99",
    });
    record("mdMgmtGetDetail", "notFound", missing.status, missing.body);
    await destroy(r5);
    made.delete(r5);
    await wipeAll(opts.disks);

    // ---- A RAID6 of four, losing one disk and then two ----------------------------------------
    const r6 = await create("raid6", [b, c, d, e], "raid6");
    made.add(r6);
    const none = await s.call("MdMgmt", "getCandidates");
    record("mdMgmtGetCandidates", "none", none.status, none.body);
    await recordState(r6, "raid6Syncing");
    await waitIdle(r6, "the RAID6's first synchronisation");
    await failMember(r6, b);
    await sleep(1500);
    await recordState(r6, "raid6OneFailed");
    await failMember(r6, c);
    await sleep(1500);
    await recordState(r6, "raid6TwoFailed");
    await destroy(r6);
    made.delete(r6);
    await wipeAll(opts.disks);

    // ---- A RAID10 of four ---------------------------------------------------------------------
    const r10 = await create("raid10", [b, c, d, e], "raid10");
    made.add(r10);
    await recordState(r10, "raid10Syncing");
    await destroy(r10);
    made.delete(r10);
    await wipeAll(opts.disks);

    // ---- A stripe of two ----------------------------------------------------------------------
    const r0 = await create("stripe", [b, c], "stripe");
    made.add(r0);
    await recordState(r0, "stripe");
    const noCopies = await s.call("MdMgmt", "setSyncAction", {
      devicefile: r0,
      action: "check",
    });
    record("mdMgmtSetSyncAction", "noCopies", noCopies.status, noCopies.body);
    await destroy(r0);
    made.delete(r0);
    await wipeAll([b, c]);
  } finally {
    // Leave the VM as it was: nothing mounted, no array of these disks, nothing pending, the disks
    // empty.
    try {
      if (mounted) {
        await ok("FileSystemMgmt", "umountByDir", { dir: mounted });
      }
      for (const a of await arrays()) {
        if (a.devices.every((m) => opts.disks.includes(m))) {
          const r = await s.call("MdMgmt", "delete", {
            devicefile: a.devicefile,
          });
          if (r.status !== 200 && ARRAY.test(a.devicefile)) {
            await ssh(opts.ssh, `mdadm --stop ${a.devicefile}`);
          }
        }
      }
      if ((await ok("Config", "isDirty")) !== false) {
        fact(`the last apply took about ${await applyAll()} s`);
      }
      await wipeAll(opts.disks);
      const left = await candidates();
      fact(
        `after cleanup: arrays ${(await arrays()).length}; every disk a candidate again ${opts.disks.every((x) => left.includes(x) || left.includes(byId.get(x)))}; pending ${JSON.stringify(await dirtyModules())}; made and not deleted ${made.size}`,
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
