// SPDX-License-Identifier: GPL-3.0-or-later
// Phase 1 acceptance (docs/07): each first operation succeeds against the test VM through the
// generated client, with development-build response validation reporting no mismatch. The reads
// Phases 3 and 5 added are checked the same way.
//
// Credentials come from $OMV_WEBUI_ENV and are never printed. The disks and disk-health reads of
// Phase 5 only read; none of their writes is called here. The only writes send the SSH
// settings back unchanged, then apply or revert them, and force a redeploy of one harmless module
// to have a task that runs long enough to stop.
import type { SmartDeviceList } from "@omv-webui/ts-api-omv";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  configApplyChangesBg,
  configIsDirty,
  configRevertChangesBg,
  diskMgmtEnumerateDevices,
  diskMgmtGetHdParm,
  diskMgmtGetList,
  emailNotificationGet,
  execIsRunning,
  execStop,
  fileSystemMgmtEnumerateMountedFilesystems,
  fileSystemMgmtGetList,
  logFileGetList,
  mdMgmtEnumerateDevices,
  networkEnumerateDevicesList,
  networkGetGeneralSettings,
  nfsGetStats,
  servicesGetStatus,
  sessionLogin,
  sessionLogout,
  sessionVerify,
  shareMgmtGetList,
  smartEnumerateDevices,
  smartEnumerateMonitoredDevices,
  smartGetAttributes,
  smartGetDeviceSettings,
  smartGetExtendedInformation,
  smartGetInformation,
  smartGetListBg,
  smartGetScheduledTest,
  smartGetScheduleList,
  smartGetSelfTestLogs,
  smartGetSettings,
  smbGetStats,
  sshGet,
  sshGetStats,
  sshSet,
  systemGetInformation,
  systemGetTimeSettings,
  systemGetTopInfo,
  userMgmtGetUserByContext,
  webGuiGetAutoLogoutSettings,
  webGuiGetSettings,
} from "../src/generated/index.ts";
import {
  createTaskRegistry,
  type TaskSnapshot,
} from "../src/tasks/registry.ts";
import { RpcError } from "../src/transport/RpcError.ts";

const envFile =
  process.env.OMV_WEBUI_ENV ?? join(homedir(), ".config/omv-webui/test.env");
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .map((l) => /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [m[1], m[2]!.replace(/^(['"])(.*)\1$/, "$2")]),
) as Record<string, string>;

const account = (user: string, password: string) => ({
  username: env[user]!,
  password: env[password]!,
});
const ADMIN = account("OMV_ADMIN_USER", "OMV_ADMIN_PASSWORD");
const USER = account("OMV_USER", "OMV_USER_PASSWORD");
const TWO_FACTOR = account("OMV_2FA_USER", "OMV_2FA_PASSWORD");

function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "").toUpperCase()]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

// Development-build validation reports mismatches with console.warn; any warning fails the test.
const warnings: unknown[][] = [];
beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args);
  });
});
afterEach(() => {
  expect(warnings, "the reply did not match the contract").toEqual([]);
});

const settled = (r: ReturnType<typeof createTaskRegistry>, id: number) =>
  new Promise<TaskSnapshot>((resolve) => {
    const off = r.onSettled((t) => {
      if (t.id === id) {
        off();
        resolve(t);
      }
    });
  });

describe("as an administrator", () => {
  beforeAll(async () => {
    const reply = await sessionLogin(ADMIN);
    expect(reply).toMatchObject({
      status: "authenticated",
      permissions: { role: "admin" },
    });
    expect(reply).not.toHaveProperty("sessionid");
  });
  afterAll(async () => {
    await sessionLogout();
  });

  it("reads system information, pending changes, SSH settings and shared folders", async () => {
    const info = await systemGetInformation();
    expect(info.version).toMatch(/^8\./);
    expect(typeof info.dirtyModules).toBe("object");
    expect(Array.isArray(info.dirtyModules)).toBe(false);
    expect(await configIsDirty()).toBe(false);
    expect(await configIsDirty(undefined, { background: true })).toBe(false);
    const ssh = await sshGet();
    expect(ssh.port).toBeGreaterThan(0);
    const shares = await shareMgmtGetList({ start: 0, limit: null });
    expect(shares.total).toBe(shares.data.length);
    const page = await shareMgmtGetList({
      start: 0,
      limit: 25,
      sortfield: "name",
      sortdir: "asc",
      search: "no-such-share",
    });
    expect(page).toEqual({ total: 0, data: [] });
  });

  it("reads the session timeout", async () => {
    const { timeout } = await webGuiGetAutoLogoutSettings();
    expect(Number.isInteger(timeout)).toBe(true);
    expect(timeout).toBeGreaterThanOrEqual(0);
    expect(timeout).toBeLessThanOrEqual(1440);
  });

  it("reads the host name, the clock, the web interface settings and the e-mail settings", async () => {
    const { hostname } = await networkGetGeneralSettings();
    expect(hostname).not.toBe("");
    const time = await systemGetTimeSettings();
    expect(time.timezone).not.toBe("");
    expect(Number.isNaN(Date.parse(time.date.ISO8601))).toBe(false);
    const web = await webGuiGetSettings();
    expect(typeof web.enablessl).toBe("boolean");
    expect(web.timeout).toBe((await webGuiGetAutoLogoutSettings()).timeout);
    const email = await emailNotificationGet();
    expect(typeof email.enable).toBe("boolean");
    // The server sends the SMTP password; the transport removes it (x-omv-omit, UI-6).
    expect(email).not.toHaveProperty("password");
  });

  it("reads mounted and configured file systems, disk health, services, network interfaces, logs, processes and service details", async () => {
    const filesystems = await fileSystemMgmtEnumerateMountedFilesystems({
      includeroot: true,
    });
    expect(filesystems.some((fs) => fs.mountpoint === "/")).toBe(true);
    const configured = await fileSystemMgmtGetList({
      start: 0,
      limit: null,
      sortfield: null,
      sortdir: null,
    });
    expect(configured.total).toBe(configured.data.length);
    expect(configured.data.every((fs) => [1, 2, 3].includes(fs.status))).toBe(
      true,
    );
    const registry = createTaskRegistry();
    const id = registry.start("Checking disk health", () =>
      smartGetListBg({ start: 0, limit: null }),
    );
    const task = await settled(registry, id);
    expect(task.state).toBe("done");
    const disks = task.result as SmartDeviceList;
    expect(disks.total).toBe(disks.data.length);
    const services = await servicesGetStatus();
    expect(services.data.map((s) => s.name)).toEqual(
      expect.arrayContaining(["nfs", "samba", "ssh"]),
    );
    const network = await networkEnumerateDevicesList({
      start: 0,
      limit: null,
    });
    expect(network.data.map((d) => d.devicename)).toContain("lo");
    for (const device of network.data) {
      // A configured Wi-Fi interface's key is removed (x-omv-omit, UI-6).
      expect(device).not.toHaveProperty("wpapsk");
    }
    const log = await logFileGetList({
      start: 0,
      limit: 5,
      sortfield: "rownum",
      sortdir: "desc",
      id: "syslog",
    });
    expect(log.data.length).toBeLessThanOrEqual(5);
    const top = await systemGetTopInfo({ format: "json" });
    expect(top.processes.length).toBeGreaterThan(0);
    for (const stats of [smbGetStats, nfsGetStats, sshGetStats]) {
      expect(typeof (await stats())).toBe("string");
    }
  });

  it("reads the disks, their power settings and disk health without changing anything", async () => {
    const disks = await diskMgmtEnumerateDevices();
    expect(disks.length).toBeGreaterThan(0);
    expect(disks.some((d) => d.isroot)).toBe(true);
    const list = await diskMgmtGetList({
      start: 0,
      limit: null,
      sortfield: null,
      sortdir: null,
    });
    expect(list.total).toBe(disks.length);
    expect(list.data.map((d) => d.devicename).sort()).toEqual(
      disks.map((d) => d.devicename).sort(),
    );
    const smart = await smartEnumerateDevices();
    expect(smart.length).toBeGreaterThan(0);
    // The test VM's NVMe disk is the one that reports S.M.A.R.T. data.
    const readable = smart.find((d) => d.overallstatus === "GOOD");
    expect(readable).toBeDefined();
    const devicefile = readable!.canonicaldevicefile;
    const monitored = await smartEnumerateMonitoredDevices();
    expect(Array.isArray(monitored)).toBe(true);
    const settings = await smartGetSettings();
    expect(settings.interval).toBeGreaterThanOrEqual(10);
    const info = await smartGetInformation({ devicefile });
    expect(info.devicefile).toBe(devicefile);
    expect(Array.isArray(await smartGetAttributes({ devicefile }))).toBe(true);
    expect(Array.isArray(await smartGetSelfTestLogs({ devicefile }))).toBe(
      true,
    );
    expect(await smartGetExtendedInformation({ devicefile })).toContain(
      "=== START OF INFORMATION SECTION ===",
    );
    const schedule = await smartGetScheduleList({
      start: 0,
      limit: null,
      sortfield: null,
      sortdir: null,
    });
    expect(schedule.total).toBe(schedule.data.length);
    expect(await configIsDirty()).toBe(false);
  });

  it("is told the RAID plugin is not installed by HTTP 404", async () => {
    await expect(mdMgmtEnumerateDevices()).rejects.toMatchObject({
      status: 404,
      code: 0,
      message: "RPC service 'MdMgmt' not found.",
    });
  });

  it("is told when a disk or settings object it asks for does not exist", async () => {
    const unknown = { uuid: "00000000-0000-4000-8000-0000000000ff" };
    for (const read of [
      () => diskMgmtGetHdParm(unknown),
      () => smartGetScheduledTest(unknown),
    ]) {
      await expect(read()).rejects.toBeInstanceOf(RpcError);
    }
    // A disk whose monitoring settings were never saved (none are on the test VM) has none to read.
    const [disk] = await smartEnumerateMonitoredDevices();
    if (disk === undefined) {
      const [any] = await smartEnumerateDevices();
      await expect(
        smartGetDeviceSettings({ devicefile: any!.canonicaldevicefile }),
      ).rejects.toMatchObject({ status: 500 });
    }
  });

  it("saves SSH settings, sees the change pending, and applies it as a task", async () => {
    const ssh = await sshGet();
    expect(await sshSet(ssh)).toEqual(ssh);
    expect(await configIsDirty()).toBe(true);
    const registry = createTaskRegistry();
    const id = registry.start("Applying changes", () =>
      configApplyChangesBg({ modules: [], force: false }),
    );
    const task = await settled(registry, id);
    expect(task.state).toBe("done");
    expect(task.result).toEqual(expect.arrayContaining(["ssh"]));
    expect(await configIsDirty()).toBe(false);
  });

  it("saves SSH settings again and discards the change as a task", async () => {
    await sshSet(await sshGet());
    expect(await configIsDirty()).toBe(true);
    const registry = createTaskRegistry();
    const id = registry.start("Discarding changes", () =>
      configRevertChangesBg({ filename: "" }),
    );
    const task = await settled(registry, id);
    expect(task.state).toBe("done");
    expect(await configIsDirty()).toBe(false);
  });

  it("asks whether a task runs and stops it", async () => {
    const handle = await configApplyChangesBg({
      modules: ["avahi"],
      force: true,
    });
    const running = await execIsRunning({ filename: handle });
    expect(running.filename).toBe(handle);
    if (running.running) {
      expect(await execStop({ filename: handle })).toBeFalsy();
    }
    // Put the stopped module back the way it was.
    const registry = createTaskRegistry();
    const id = registry.start("Applying changes", () =>
      configApplyChangesBg({ modules: ["avahi"], force: true }),
    );
    expect((await settled(registry, id)).state).toBe("done");
  });
});

describe("as a user", () => {
  beforeAll(async () => {
    expect(await sessionLogin(USER)).toMatchObject({
      status: "authenticated",
      permissions: { role: "user" },
    });
  });
  afterAll(async () => {
    await sessionLogout();
  });

  it("reads their own account and the reduced system information", async () => {
    const me = await userMgmtGetUserByContext();
    expect(me.name).toBe(USER.username);
    expect(Object.keys(await systemGetInformation()).sort()).toEqual([
      "hostname",
      "time",
      "ts",
    ]);
  });

  it("reads the session timeout", async () => {
    const { timeout } = await webGuiGetAutoLogoutSettings();
    expect(Number.isInteger(timeout)).toBe(true);
    expect(timeout).toBeGreaterThanOrEqual(0);
  });

  it("is refused an administrator's operation", async () => {
    const error = await sshGet().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcError);
    expect(error).toMatchObject({ status: 403, kind: "forbidden" });
  });
});

describe("with a second factor", () => {
  it("signs in with a one-time code and out again", async () => {
    const challenge = await sessionLogin(TWO_FACTOR);
    expect(challenge).toEqual({
      status: "challengeRequired",
      username: TWO_FACTOR.username,
      challenge: { kind: "totp" },
    });
    const signedIn = await sessionVerify({
      code: totp(env.OMV_2FA_TOTP_SECRET!),
    });
    expect(signedIn).toMatchObject({
      status: "authenticated",
      username: TWO_FACTOR.username,
    });
    expect(signedIn).not.toHaveProperty("sessionid");
    await sessionLogout();
  });
});

describe("signed out", () => {
  it("gets 401 for an ordinary call", async () => {
    await expect(systemGetInformation()).rejects.toMatchObject({
      status: 401,
      kind: "session",
    });
  });
});
