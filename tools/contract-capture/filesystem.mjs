#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Record the file-system lifecycle's replies on the disposable test VM: find the candidates, create
// EXT4 on an empty scratch disk, mount it, read and save its settings, read its details, grow it,
// unmount it, and erase the disk again. ERASES THE DEVICE IT IS GIVEN.
//
//   node tools/contract-capture/filesystem.mjs --device /dev/sdd [--busy-ssh <ssh destination>]
//     [--btrfs /dev/sdb,/dev/sdc]
//
// Only for the test VM in $OMV_WEBUI_ENV (default ~/.config/omv-webui/test.env), never the owner's
// server. It refuses to start while configuration changes are pending, and refuses any device the
// server's own candidate list (FileSystemMgmt.getCandidatesBg) does not offer: that list leaves out
// the system disk, read-only disks and every disk that holds a partition table, a file system or a
// RAID signature. It ends, also after a failure, by unmounting and removing the mount entry it
// made, applying what is pending, and quick-wiping each device it used, so the VM is left as it was.
//
// --busy-ssh runs `cd <mount folder> && sleep` over ssh while it asks for an unmount, to record the
// server's refusal of a busy file system; the shell is ended right after. --btrfs also creates a
// BTRFS mirror (RAID1) on those devices, records its output and details, and wipes them again.
//
// Replies are scrubbed and verified as by capture.mjs and written as draft examples the same way.
// Credentials, the host and the device's identifiers are never printed.
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
const DEVICE = /^\/dev\/(sd[a-z]+|vd[a-z]+|nvme\d+n\d+)$/;

function args(argv) {
  const out = { btrfs: [] };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === "--device") {
      out.device = value;
      i++;
    } else if (flag === "--busy-ssh") {
      out.busySsh = value;
      i++;
    } else if (flag === "--btrfs") {
      out.btrfs = String(value).split(",");
      i++;
    } else {
      throw new Error(`unknown argument ${flag}`);
    }
  }
  for (const d of [out.device, ...out.btrfs]) {
    if (!DEVICE.test(String(d))) {
      throw new Error(
        `"${d}" is not a whole-disk device file such as /dev/sdd`,
      );
    }
  }
  if (out.btrfs.length === 1 || out.btrfs.includes(out.device)) {
    throw new Error("--btrfs takes two devices other than --device");
  }
  return out;
}

const noRecord = () => {};

async function main() {
  const opts = args(process.argv.slice(2));
  const env = loadEnv(ENV_PATH);
  const { base, record, results } = await openCapture(env);
  const s = new Session(base);
  const signedIn = await s.login(env, "admin");
  if (signedIn.status !== 200) {
    throw new Error(`sign-in failed (HTTP ${signedIn.status})`);
  }
  const facts = [];
  const fact = (line) => facts.push(line);

  const ok = async (service, method, params) => {
    const r = await s.call(service, method, params);
    if (r.status !== 200) {
      throw new Error(
        `${service}.${method} failed (HTTP ${r.status}): ${r.body.error?.message ?? ""}`.slice(
          0,
          200,
        ),
      );
    }
    return r.body.response;
  };
  const dirtyModules = async () => {
    const info = await ok("System", "getInformation");
    const d = info.dirtyModules;
    return d && !Array.isArray(d) ? Object.keys(d).sort() : [];
  };
  const runTask = async (service, method, params, name, recordIt) => {
    const started = await s.call(service, method, params);
    if (recordIt) {
      record(recordIt[0], recordIt[1], started.status, started.body);
    }
    if (started.status !== 200) {
      throw new Error(`${service}.${method} failed (HTTP ${started.status})`);
    }
    const last = await followTask(
      s,
      started.body.response,
      name,
      recordIt ? record : noRecord,
      {},
      { resultJson: recordIt?.[2] === "json", tries: 600 },
    );
    if (last.status !== 200) {
      throw new Error(`${service}.${method}'s task failed`);
    }
    return last.body.response.output;
  };
  const applyAll = async () => {
    await runTask(
      "Config",
      "applyChangesBg",
      { modules: [], force: false },
      "apply",
    );
  };
  const wipe = (devicefile) =>
    runTask("DiskMgmt", "wipe", { devicefile, secure: false }, "wipe");

  if ((await ok("Config", "isDirty")) !== false) {
    throw new Error(
      "the VM has pending configuration changes; apply or revert them first",
    );
  }

  // 1. The candidates, as the stock create form reads them.
  const candidates = JSON.parse(
    await runTask("FileSystemMgmt", "getCandidatesBg", {}, "fsCandidates", [
      "fileSystemMgmtGetCandidatesBg",
      "started",
      "json",
    ]),
  );
  const offered = new Set(candidates.map((c) => c.devicefile));
  for (const d of [opts.device, ...opts.btrfs]) {
    if (!offered.has(d)) {
      throw new Error(
        `${d} is not among the server's candidates (not empty, in use or read-only); nothing was changed`,
      );
    }
  }
  fact(`candidates: ${[...offered].sort().join(" ")}`);

  let fs; // the new file system's getList row
  let mounted = false;
  let busy;
  const used = [];
  try {
    // 2. Create EXT4 on the scratch disk; look for the "being created" row while it runs.
    used.push(opts.device);
    const started = await s.call("FileSystemMgmt", "create", {
      devicefile: opts.device,
      type: "ext4",
    });
    record("fileSystemMgmtCreate", "started", started.status, started.body);
    if (started.status !== 200) {
      throw new Error(`FileSystemMgmt.create failed (HTTP ${started.status})`);
    }
    const during = await s.call("FileSystemMgmt", "getList", GET_ALL);
    if (during.body.response?.data?.some((f) => f.status === 2)) {
      record("fileSystemMgmtGetList", "creating", during.status, during.body);
    } else {
      fact("getList while creating: no status 2 row seen (mkfs was quicker)");
    }
    const created = await followTask(
      s,
      started.body.response,
      "createExt4",
      record,
      {},
      { tries: 600 },
    );
    if (created.status !== 200) {
      throw new Error("the create task failed");
    }

    // 3. The new file system among the mount candidates (V3: found by parentdevicefile).
    const mc = await s.call("FileSystemMgmt", "getMountCandidates");
    record("fileSystemMgmtGetMountCandidates", "created", mc.status, mc.body);
    const candidate = mc.body.response.find(
      (f) => f.parentdevicefile === opts.device,
    );
    fact(
      `V3: getMountCandidates has a row with parentdevicefile ${opts.device}: ${candidate !== undefined}`,
    );
    if (!candidate) {
      throw new Error("the new file system is not a mount candidate");
    }
    const devicefile = candidate.canonicaldevicefile;
    const none = await s.call("FsTab", "getByFsName", { fsname: devicefile });
    record("fsTabGetByFsName", "none", none.status, none.body);

    // 4. Mount it: save, see what is pending, apply only fstab (V2), then the rest.
    const saved = await s.call("FileSystemMgmt", "setMountPoint", {
      id: devicefile,
      usagewarnthreshold: 85,
      comment: "Media,Photos",
    });
    record("fileSystemMgmtSetMountPoint", "saved", saved.status, saved.body);
    if (saved.status !== 200) {
      throw new Error("FileSystemMgmt.setMountPoint failed");
    }
    mounted = true; // a mount entry exists from here on
    fact(`V8 setMountPoint: ${(await dirtyModules()).join(" ")}`);
    const again = await s.call("FileSystemMgmt", "setMountPoint", {
      id: devicefile,
    });
    record(
      "fileSystemMgmtSetMountPoint",
      "alreadyExists",
      again.status,
      again.body,
    );
    const pending = await s.call("FileSystemMgmt", "getList", GET_ALL);
    record(
      "fileSystemMgmtGetList",
      "mountPending",
      pending.status,
      pending.body,
    );
    const row = (list) =>
      list.data.find((f) => f.canonicaldevicefile === devicefile);
    fact(
      `getList before apply: status ${row(pending.body.response)?.status}, mounted ${row(pending.body.response)?.mounted}`,
    );
    await runTask(
      "Config",
      "applyChangesBg",
      { modules: ["fstab"], force: false },
      "applyFstab",
    );
    fs = row(await ok("FileSystemMgmt", "getList", GET_ALL));
    fact(`V2: after applying fstab alone, mounted ${fs?.mounted}`);
    fact(`V8 left after the fstab apply: ${(await dirtyModules()).join(" ")}`);
    await applyAll();
    fs = row(await ok("FileSystemMgmt", "getList", GET_ALL));
    fact(
      `after applying the rest: mounted ${fs.mounted}, nothing pending: ${!(await ok("Config", "isDirty"))}`,
    );

    // 5. Its mount entry, and a change of warning level and tags.
    const entry = await s.call("FsTab", "getByFsName", { fsname: devicefile });
    record("fsTabGetByFsName", "entry", entry.status, entry.body);
    const byUuid = await ok("FsTab", "getByFsName", { fsname: fs.uuid });
    fact(
      `getByFsName by file-system UUID finds the same entry: ${byUuid?.uuid === entry.body.response.uuid}`,
    );
    fact(`tags stored as: ${JSON.stringify(entry.body.response.comment)}`);
    const changed = await s.call("FsTab", "set", {
      ...entry.body.response,
      usagewarnthreshold: 90,
      comment: "Media,Photos,Backups",
    });
    record("fsTabSet", "saved", changed.status, changed.body);
    fact(`V8 FsTab.set on the entry: ${(await dirtyModules()).join(" ")}`);
    await applyAll();
    const tagged = await s.call("FileSystemMgmt", "getList", GET_ALL);
    record("fileSystemMgmtGetList", "withTags", tagged.status, tagged.body);

    // 6. Details, and the details of a device with no file system.
    const details = await s.call("FileSystemMgmt", "getDetails", {
      devicefile,
    });
    record("fileSystemMgmtGetDetails", "ext4", details.status, details.body);
    const missing = await s.call("FileSystemMgmt", "getDetails", {
      devicefile: `${opts.device}9`,
    });
    record(
      "fileSystemMgmtGetDetails",
      "notFound",
      missing.status,
      missing.body,
    );

    // 7. Grow it: the partition already fills the disk.
    const grown = await s.call("FileSystemMgmt", "grow", { id: fs.uuid });
    fact(
      `grow: HTTP ${grown.status}, reply ${JSON.stringify(grown.body.response)}, pending ${JSON.stringify(await dirtyModules())}`,
    );
    if (grown.status !== 200) {
      record("fileSystemMgmtGrow", "refused", grown.status, grown.body);
    }
    const after = row(await ok("FileSystemMgmt", "getList", GET_ALL));
    fact(`grow: size before ${fs.size}, after ${after.size}`);

    // 8. A refused unmount while a shell sits in the folder.
    if (opts.busySsh) {
      // A terminal, so ending the ssh client hangs up the remote shell; and a short sleep, so the
      // folder is released by itself if it does not.
      busy = spawn(
        "ssh",
        ["-tt", opts.busySsh, `cd '${fs.mountpoint}' && exec sleep 20`],
        { stdio: "ignore" },
      );
      await sleep(3000);
      const refused = await s.call("FileSystemMgmt", "umountByDir", {
        dir: fs.mountpoint,
      });
      record("fileSystemMgmtUmountByDir", "busy", refused.status, refused.body);
      const still = await ok("FsTab", "getByFsName", { fsname: devicefile });
      fact(
        `busy unmount: HTTP ${refused.status}; mount entry kept ${still !== false}; pending ${JSON.stringify(await dirtyModules())}`,
      );
      busy.kill();
      busy = undefined;
      await sleep(1000);
    }

    // 9. Unmount for real, once the folder is released.
    let um;
    for (let i = 0; i < 12; i++) {
      um = await s.call("FileSystemMgmt", "umountByDir", {
        dir: fs.mountpoint,
      });
      if (um.status === 200 || !/busy/i.test(um.body.error?.message ?? "")) {
        break;
      }
      await sleep(3000);
    }
    fact(
      `umountByDir: HTTP ${um.status}, reply ${JSON.stringify(um.body.response)}`,
    );
    if (um.status !== 200) {
      throw new Error("FileSystemMgmt.umountByDir failed");
    }
    mounted = false;
    fact(`V8 left after umountByDir: ${(await dirtyModules()).join(" ")}`);
    await applyAll();

    // 10. BTRFS mirror on two more empty disks.
    if (opts.btrfs.length) {
      used.push(...opts.btrfs);
      await runTask(
        "FileSystemMgmt",
        "createBtrfs",
        { profile: "raid1", devicefiles: opts.btrfs.join(",") },
        "createBtrfsRaid1",
        ["fileSystemMgmtCreateBtrfs", "started"],
      );
      const btrfs = (await ok("FileSystemMgmt", "getMountCandidates")).find(
        (f) => f.type === "btrfs",
      );
      fact(
        `BTRFS: mount candidate ${btrfs !== undefined}, hasmultipledevices ${btrfs?.hasmultipledevices}, devicefiles ${btrfs?.devicefiles?.length}`,
      );
      if (btrfs) {
        const d = await s.call("FileSystemMgmt", "getDetails", {
          devicefile: btrfs.canonicaldevicefile,
        });
        record(
          "fileSystemMgmtGetDetails",
          "btrfsMirror",
          d.status,
          d.body,
          {},
          {
            note: "a BTRFS mirror (RAID1) on two disks, not mounted",
          },
        );
      }
    }
  } finally {
    busy?.kill();
    // Leave the VM as it was: no mount entry, nothing pending, the devices empty.
    try {
      if (mounted && fs?.mountpoint) {
        await ok("FileSystemMgmt", "umountByDir", { dir: fs.mountpoint });
      }
      if ((await ok("Config", "isDirty")) !== false) {
        await applyAll();
      }
      for (const d of used) {
        await wipe(d);
      }
      await ok("DiskMgmt", "rescan");
      await sleep(2000);
      const left = JSON.parse(
        await runTask("FileSystemMgmt", "getCandidatesBg", {}, "fsCandidates"),
      ).map((c) => c.devicefile);
      fact(
        `after cleanup: every device used is a candidate again ${used.every((d) => left.includes(d))}; pending ${JSON.stringify(await dirtyModules())}`,
      );
    } finally {
      await s.call("Session", "logout");
      for (const line of [...results, ...facts]) {
        console.log(line);
      }
      if (results.some((l) => l.startsWith("FAIL"))) {
        process.exitCode = 1;
      }
    }
  }
}

main().catch((e) => {
  // The message is ours, the network's or the server's; it never carries a credential.
  console.error(`capture failed: ${e.message}`);
  process.exitCode = 1;
});
