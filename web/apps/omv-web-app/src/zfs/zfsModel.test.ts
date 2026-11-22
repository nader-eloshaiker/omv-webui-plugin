// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS slice's rules on the test VM's captured replies (phase 5 ZFS design 0.2 to 0.12), and on
// hand-written reports in ZFS's format for what the VM cannot show.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ZfsObject,
  ZfsPoolDevice,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  checkDecision,
  compressionSaving,
  findFs,
  findPool,
  floorForDisplay,
  fsDeleteBlockers,
  fsNameProblem,
  fsUsedBy,
  fullLevel,
  isBusy,
  isFsAddress,
  isPoolAddress,
  matchDisks,
  offlineDecision,
  onlineDecision,
  onPool,
  parsePoolReport,
  parseZfsDate,
  poolDeleteBlockers,
  poolHealth,
  poolNameProblem,
  poolRoot,
  poolState,
  protectionOf,
  quotaValue,
  readLastScrub,
  replaceDecision,
  sameDiskName,
  usableSize,
  type PoolReport,
} from "./zfsModel.ts";

const REPORTS = CONTRACT_EXAMPLES.zfsGetObjectDetails;
const DEVICES = CONTRACT_EXAMPLES.zfsGetPoolDevices;
const LISTS = CONTRACT_EXAMPLES.zfsListPools;

const report = (name: keyof typeof REPORTS): PoolReport =>
  parsePoolReport(REPORTS[name].value);
const devices = (name: keyof typeof DEVICES) =>
  DEVICES[name].value as unknown as ZfsPoolDevice[];
const rows = (name: keyof typeof LISTS) =>
  LISTS[name].value.data as unknown as ZfsObject[];
const poolRow = (name: keyof typeof LISTS): ZfsObject => {
  const row = rows(name).find((r) => r.type === "Pool");
  if (row === undefined) {
    throw new Error("no pool row");
  }
  return row;
};

/** A report written by hand in ZFS's format: lines joined by a line feed and a carriage return. */
const written = (...lines: string[]) => lines.join("\n\r");

describe("addresses (0.7)", () => {
  it("takes pool and file-system names in the patterns only", () => {
    expect(isPoolAddress("tank")).toBe(true);
    expect(isPoolAddress("-rf")).toBe(false);
    expect(isPoolAddress("tank/media")).toBe(false);
    expect(isFsAddress("tank")).toBe(true);
    expect(isFsAddress("tank/media")).toBe(true);
    expect(isFsAddress("tank/../../rpc.php")).toBe(false);
    expect(isFsAddress("tank/.")).toBe(false);
    expect(isFsAddress("tank%2Fmedia")).toBe(false);
    expect(isFsAddress(`tank/${"a/".repeat(9)}b`)).toBe(false);
    expect(isFsAddress("my pool")).toBe(false);
  });

  it("finds the row by its full name, never by anything else", () => {
    const list = rows("mirrorWithFs");
    expect(findPool(list, "tank")?.type).toBe("Pool");
    expect(findFs(list, "tank")?.poolroot).toBe(true);
    expect(findFs(list, "tank/media")?.name).toBe("media");
    expect(findFs(list, "tank/other")).toBeUndefined();
    expect(findPool(list, "-rf")).toBeUndefined();
    expect(poolRoot(list, "tank")?.mountpoint).toBe("/tank");
    expect(onPool(list, "tank").map((r) => r.path)).toEqual([
      "tank",
      "tank/media",
    ]);
  });
});

describe("names (0.7, P5)", () => {
  it.each([
    ["data", null],
    ["", "pattern"],
    ["1tank", "pattern"],
    ["a".repeat(33), "pattern"],
    ["mirror1", "reserved"],
    ["RaidZ", "reserved"],
    ["log", "reserved"],
    ["logs", null],
    ["srv", "systemFolder"],
    ["ETC", "systemFolder"],
    ["Tank", "taken"],
  ])("pool %s: %s", (name, problem) => {
    expect(poolNameProblem(name, ["tank"])).toBe(problem);
  });

  it("refuses a file-system name that is taken on the pool, case ignored", () => {
    const list = rows("mirrorWithFs");
    expect(fsNameProblem("data", list, "tank")).toBeNull();
    expect(fsNameProblem("Media", list, "tank")).toBe("taken");
    expect(fsNameProblem(".", list, "tank")).toBe("pattern");
    expect(fsNameProblem("a/b", list, "tank")).toBe("pattern");
    expect(fsNameProblem("photos.2026", list, "tank")).toBeNull();
  });
});

describe("the report (0.3, 0.4)", () => {
  it("reads every captured pool report", () => {
    for (const name of Object.keys(REPORTS) as (keyof typeof REPORTS)[]) {
      if (name === "filesystem" || name === "notFound") {
        continue;
      }
      expect(report(name).known, name).toBe(true);
    }
  });

  it("reads a mirror's tree and the layouts", () => {
    const r = report("mirror");
    if (!r.known) {
      throw new Error("not read");
    }
    expect(r.name).toBe("tank");
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]?.layout).toBe("mirror");
    expect(r.groups[0]?.entries).toHaveLength(2);
    expect(r.scan).toBeNull();
    expect(r.dataErrors).toBe(0);
    const z2 = report("raidz2");
    expect(z2.known && z2.groups[0]?.layout).toBe("raidz2");
    const stripe = report("stripe");
    expect(stripe.known && stripe.groups[0]?.layout).toBe("stripe");
    const single = report("single");
    expect(single.known && single.groups[0]?.layout).toBe("single");
  });

  it("reads a check running, paused, stopped and finished, and a rebuild", () => {
    const running = report("mirrorChecking");
    expect(running.known && running.scan).toMatchObject({
      kind: "check",
      status: "running",
      percent: 1.04,
      secondsLeft: 95,
    });
    const paused = report("mirrorCheckPaused");
    expect(paused.known && paused.scan).toMatchObject({
      kind: "check",
      status: "paused",
      percent: 30.41,
    });
    const stopped = report("mirrorCheckStopped");
    expect(stopped.known && stopped.scan).toMatchObject({ status: "stopped" });
    const done = report("mirrorChecked");
    expect(done.known && done.scan).toMatchObject({
      kind: "check",
      status: "finished",
      repaired: "0B",
      errors: 0,
    });
    const rebuild = report("mirrorReplacing");
    expect(rebuild.known && rebuild.scan).toMatchObject({
      kind: "rebuild",
      status: "running",
      percent: 14.4,
      secondsLeft: 5,
    });
    const rebuilt = report("mirrorReplaced");
    expect(rebuilt.known && rebuilt.scan).toMatchObject({
      kind: "rebuild",
      status: "finished",
    });
  });

  it("reads a replacement in progress as one place with two disks", () => {
    const r = report("mirrorReplacing");
    if (!r.known) {
      throw new Error("not read");
    }
    const entries = r.groups[0]?.entries ?? [];
    expect(entries).toHaveLength(2);
    const pair = entries[1];
    expect(pair?.kind).toBe("replacing");
    if (pair?.kind !== "replacing") {
      throw new Error("no pair");
    }
    expect(pair.new.resilvering).toBe(true);
    expect(pair.old.resilvering).toBe(false);
  });

  it("fails closed on text it does not recognise", () => {
    expect(parsePoolReport(undefined).known).toBe(false);
    expect(parsePoolReport("Pool status (zpool status -v):").known).toBe(false);
    const odd = written(
      "  pool: tank",
      " state: ONLINE",
      "  scan: something new happened",
      "config:",
      "",
      "\tNAME   STATE   READ WRITE CKSUM",
      "\ttank   ONLINE     0     0     0",
      "\t  sdb  ONLINE     0     0     0",
      "",
      "errors: No known data errors",
    );
    expect(parsePoolReport(odd).known).toBe(false);
  });

  it("reads classes, a missing disk, errors and damaged files written by hand", () => {
    const text = written(
      "  pool: tank",
      " state: DEGRADED",
      "config:",
      "",
      "\tNAME                     STATE     READ WRITE CKSUM",
      "\ttank                     DEGRADED     0     0     0",
      "\t  mirror-0               DEGRADED     0     0     0",
      "\t    ata-DISK-A           ONLINE       3     0  1.2K",
      "\t    1234567890123456789  UNAVAIL      0     0     0  was /dev/disk/by-id/ata-DISK-B-part1",
      "\tlogs",
      "\t  ata-DISK-C             ONLINE       0     0     0",
      "\tspares",
      "\t  ata-DISK-D             AVAIL",
      "",
      "errors: 2 data errors, use '-v' for a list",
      "",
      "        /tank/media/file.mkv",
    );
    const r = parsePoolReport(text);
    if (!r.known) {
      throw new Error("not read");
    }
    expect(r.groups.map((g) => g.class)).toEqual(["data", "logs", "spares"]);
    expect(r.dataErrors).toBe(2);
    const missing = r.groups[0]?.entries[1];
    expect(missing?.kind === "disk" && missing.disk.was).toBe(
      "/dev/disk/by-id/ata-DISK-B-part1",
    );
    const first = r.groups[0]?.entries[0];
    expect(first?.kind === "disk" && first.disk.checksum).toBe(1200);
  });

  it("treats hostile names as names", () => {
    const text = written(
      "  pool: x<img",
      " state: ONLINE",
      "config:",
      "",
      "\tNAME     STATE   READ WRITE CKSUM",
      "\tx<img    ONLINE     0     0     0",
      "\t  sdb    ONLINE     0     0     0",
      "",
      "errors: No known data errors",
    );
    const r = parsePoolReport(text);
    expect(r.known && r.name).toBe("x<img");
  });
});

describe("matching the disks (0.4, D8)", () => {
  it("matches each disk of the report to its by-id path", () => {
    const m = matchDisks(report("mirror"), devices("mirror"));
    if (!m.known) {
      throw new Error("not matched");
    }
    expect(m.byId).toBe(true);
    expect(m.disks.map((d) => d.role)).toEqual(["working", "working"]);
    expect(m.disks[0]?.path).toMatch(/-part1$/);
  });

  it("names the two disks of a replacement once each", () => {
    const m = matchDisks(report("mirrorReplacing"), devices("mirrorReplacing"));
    if (!m.known) {
      throw new Error("not matched");
    }
    expect(m.disks).toHaveLength(3);
    expect(m.disks.filter((d) => d.pair !== null)).toHaveLength(2);
    expect(m.disks.map((d) => d.role)).toEqual([
      "working",
      "working",
      "rebuilding",
    ]);
  });

  it("fails closed when a disk has no path or the reply is empty", () => {
    expect(matchDisks(report("mirror"), []).known).toBe(false);
    expect(matchDisks(report("mirror"), devices("raidz1")).known).toBe(false);
    expect(matchDisks({ known: false }, devices("mirror")).known).toBe(false);
  });

  it("refuses changes for a pool ZFS names by kernel names (item 9)", () => {
    const text = written(
      "  pool: tank",
      " state: ONLINE",
      "config:",
      "",
      "\tNAME     STATE   READ WRITE CKSUM",
      "\ttank     ONLINE     0     0     0",
      "\t  mirror-0  ONLINE  0     0     0",
      "\t    sdb1  ONLINE     0     0     0",
      "\t    sdc1  ONLINE     0     0     0",
      "",
      "errors: No known data errors",
    );
    const r = parsePoolReport(text);
    const m = matchDisks(r, [
      { devicefile: "/dev/sdb1", state: "ONLINE", vdev: "mirror-0", label: "" },
      { devicefile: "/dev/sdc1", state: "ONLINE", vdev: "mirror-0", label: "" },
    ]);
    expect(m.known && m.byId).toBe(false);
    const state = poolState({ state: "ONLINE", status: "OK" }, r);
    const disk = m.known ? m.disks[0] : undefined;
    if (disk === undefined) {
      throw new Error("no disk");
    }
    expect(replaceDecision(disk, state, m, false)).toEqual({
      allowed: false,
      blocker: { kind: "notById" },
    });
  });

  it("compares a report name and a path without the partition", () => {
    expect(sameDiskName("ata-X", "/dev/disk/by-id/ata-X-part1")).toBe(true);
    expect(sameDiskName("sdb", "/dev/sdb1")).toBe(true);
    expect(sameDiskName("ata-X", "/dev/disk/by-id/ata-Y-part1")).toBe(false);
  });
});

describe("the state (0.3)", () => {
  it.each([
    ["mirror", "mirror", "ok", "ok"],
    ["mirrorChecking", "mirrorChecking", "checking", "ok"],
    ["mirrorCheckPaused", "mirrorCheckPaused", "checkPaused", "ok"],
    ["mirrorDegraded", "mirrorDegraded", "degraded", "critical"],
    ["mirrorReplacing", "mirrorReplacing", "copying", "warning"],
    ["mirrorReplaced", "mirrorReplaced", "ok", "ok"],
  ] as const)("%s is %s", (list, rep, kind, status) => {
    const state = poolState(poolRow(list), report(rep));
    expect(state.kind).toBe(kind);
    expect(state.status).toBe(status);
  });

  it("polls only while a check or a rebuild runs (P13)", () => {
    expect(
      isBusy(poolState(poolRow("mirrorChecking"), report("mirrorChecking"))),
    ).toBe(true);
    expect(
      isBusy(poolState(poolRow("mirrorReplacing"), report("mirrorReplacing"))),
    ).toBe(true);
    expect(
      isBusy(
        poolState(poolRow("mirrorCheckPaused"), report("mirrorCheckPaused")),
      ),
    ).toBe(false);
    expect(isBusy(poolState(poolRow("mirror"), report("mirror")))).toBe(false);
  });

  it("is Unknown when the plugin or the report cannot say", () => {
    expect(
      poolState({ state: "UNKNOWN", status: "OK" }, report("mirror")).status,
    ).toBe("unknown");
    expect(
      poolState({ state: "ONLINE", status: "OK" }, { known: false }).kind,
    ).toBe("unread");
    expect(
      poolState({ state: "SPLIT", status: "OK" }, report("mirror")).kind,
    ).toBe("unrecognised");
  });

  it("is Critical for damaged files and an unusable pool", () => {
    expect(
      poolState({ state: "ONLINE", status: "Error" }, report("mirror")).kind,
    ).toBe("dataErrors");
    expect(
      poolState({ state: "UNAVAIL", status: "OK" }, report("mirror")).kind,
    ).toBe("unusable");
    expect(
      poolState({ state: "SUSPENDED", status: "OK" }, report("mirror")).kind,
    ).toBe("suspended");
  });

  it("reads getPoolStatus alone for the dashboard (10.1)", () => {
    expect(poolHealth({ state: "DEGRADED", status: "OK" })).toBe("degraded");
    expect(poolHealth({ state: "FAULTED", status: "OK" })).toBe("unusable");
    expect(poolHealth({ state: "ONLINE", status: "Error" })).toBe("damaged");
    expect(poolHealth({ state: "ONLINE", status: "OK" })).toBe("ok");
    expect(poolHealth({ state: "UNKNOWN", status: "OK" })).toBe("unknown");
  });

  it("has fixed levels for how full a pool is (D7)", () => {
    expect(fullLevel(79)).toBe("ok");
    expect(fullLevel(80)).toBe("warning");
    expect(fullLevel(95)).toBe("critical");
  });
});

describe("protection and space (0.5)", () => {
  it("says what each layout can lose, less what is missing", () => {
    expect(protectionOf(report("mirror"))).toEqual({ key: "mirror", count: 1 });
    expect(protectionOf(report("raidz1"))).toEqual({ key: "parity", count: 1 });
    expect(protectionOf(report("raidz2"))).toEqual({ key: "parity", count: 2 });
    expect(protectionOf(report("stripe"))).toEqual({ key: "none" });
    expect(protectionOf(report("single"))).toEqual({ key: "none" });
    expect(protectionOf(report("mirrorDegraded"))).toEqual({ key: "noMore" });
    // Replacing a working disk keeps the copy.
    expect(protectionOf(report("mirrorReplacing"))).toEqual({
      key: "mirror",
      count: 1,
    });
  });

  it("estimates space from the VM's measurements, never more", () => {
    const s = 8 * 1024 ** 3;
    expect(usableSize("mirror", [s, s])).toBeLessThanOrEqual(0.908 * s);
    expect(usableSize("mirror", [s, s])).toBeGreaterThan(0.85 * s);
    expect(usableSize("basic", [s, s])).toBeLessThanOrEqual(0.908 * 2 * s);
    expect(usableSize("raidz1", [s, s, s])).toBeLessThanOrEqual(0.948 * 2 * s);
    expect(usableSize("raidz2", [s, s, s, s])).toBeLessThanOrEqual(
      0.924 * 2 * s,
    );
    expect(usableSize("raidz1", [s, s])).toBe(0);
    expect(floorForDisplay(7.27 * 1024 ** 3)).toBeCloseTo(7.2 * 1024 ** 3, -3);
  });
});

describe("dates (item 8)", () => {
  it("reads the plugin's dates with their time zone", () => {
    expect(parseZfsDate("Sat Nov 21 12:00:00 UTC 2026")).toBe(
      Date.UTC(2026, 10, 21, 12, 0, 0),
    );
    expect(parseZfsDate("Sat Nov 21 13:00:00 +0100 2026")).toBe(
      Date.UTC(2026, 10, 21, 12, 0, 0),
    );
    expect(parseZfsDate("Sat Nov 21 13:00:00 CET 2026")).toBeNull();
    expect(parseZfsDate("Sat Nov 21 12:00:00 2026")).toBeNull();
  });

  it("reads lastscrub's forms", () => {
    expect(readLastScrub("Never")).toEqual({ kind: "never" });
    expect(
      readLastScrub("in progress since Sat Nov 21 12:00:00 UTC 2026").kind,
    ).toBe("running");
    expect(
      readLastScrub("paused (started Sat Nov 21 12:00:00 UTC 2026)").kind,
    ).toBe("paused");
    expect(readLastScrub("canceled on Sat Nov 21 12:00:00 UTC 2026").kind).toBe(
      "stopped",
    );
    const ended = readLastScrub("Sat Nov 21 12:00:00 UTC 2026");
    expect(ended.kind === "ended" && ended.at).toBe(Date.UTC(2026, 10, 21, 12));
  });
});

describe("compression and limits", () => {
  it("reads the ratio without an x (item 5)", () => {
    expect(compressionSaving("1.00")).toBeNull();
    expect(compressionSaving("1.22")).toBe(18);
    expect(compressionSaving("1.22x")).toBe(18);
    expect(compressionSaving("n/a")).toBeNull();
  });

  it("sends a limit in whole GiB or TiB", () => {
    expect(quotaValue(null)).toBe("none");
    expect(quotaValue({ amount: "500", unit: "G" })).toBe("500G");
    expect(quotaValue({ amount: "2", unit: "T" })).toBe("2T");
    expect(quotaValue({ amount: "1.5", unit: "T" })).toBeNull();
    expect(quotaValue({ amount: "0", unit: "G" })).toBeNull();
  });
});

describe("refusals (0.10)", () => {
  const mirror = () => {
    const r = report("mirror");
    const m = matchDisks(r, devices("mirror"));
    return { r, m, state: poolState(poolRow("mirror"), r) };
  };

  it("offers Check now when idle and Stop while checking", () => {
    expect(checkDecision(mirror().state, false)).toEqual({
      allowed: true,
      action: "start",
    });
    const checking = poolState(
      poolRow("mirrorChecking"),
      report("mirrorChecking"),
    );
    expect(checkDecision(checking, false)).toEqual({
      allowed: true,
      action: "stop",
    });
    const paused = poolState(
      poolRow("mirrorCheckPaused"),
      report("mirrorCheckPaused"),
    );
    expect(checkDecision(paused, false)).toEqual({
      allowed: true,
      action: "resume",
    });
    const degraded = poolState(
      poolRow("mirrorDegraded"),
      report("mirrorDegraded"),
    );
    expect(checkDecision(degraded, false)).toMatchObject({
      allowed: false,
      blocker: { kind: "critical" },
    });
    const rebuilding = poolState(
      poolRow("mirrorReplacing"),
      report("mirrorReplacing"),
    );
    expect(checkDecision(rebuilding, false)).toMatchObject({
      allowed: false,
      blocker: { kind: "rebuilding" },
    });
  });

  it("takes a disk offline only when its group can lose another", () => {
    const { m, state } = mirror();
    if (!m.known) {
      throw new Error();
    }
    const disk = m.disks[0];
    if (disk === undefined) {
      throw new Error();
    }
    expect(offlineDecision(disk, state, m, false)).toEqual({ allowed: true });
    const r = report("mirrorDegraded");
    const dm = matchDisks(r, devices("mirrorDegraded"));
    if (!dm.known) {
      throw new Error();
    }
    const ds = poolState(poolRow("mirrorDegraded"), r);
    const [working, offline] = dm.disks;
    if (working === undefined || offline === undefined) {
      throw new Error();
    }
    expect(offlineDecision(working, ds, dm, false).allowed).toBe(false);
    expect(onlineDecision(offline, ds, dm, false)).toEqual({ allowed: true });
    expect(replaceDecision(offline, ds, dm, false)).toEqual({ allowed: true });
  });

  it("never replaces a disk while a rebuild runs", () => {
    const r = report("mirrorReplacing");
    const m = matchDisks(r, devices("mirrorReplacing"));
    if (!m.known) {
      throw new Error();
    }
    const s = poolState(poolRow("mirrorReplacing"), r);
    for (const disk of m.disks) {
      expect(replaceDecision(disk, s, m, false).allowed).toBe(false);
    }
  });

  it("refuses to delete a pool that holds a file system, and its own folder by itself", () => {
    const list = rows("mirrorWithFs");
    const used = fsUsedBy(poolRoot(list, "tank") as ZfsObject, list, {
      shares: { data: [], failed: false },
      omvUsed: { value: false, failed: false },
      snapshots: { data: [], failed: false },
    });
    expect(
      poolDeleteBlockers("tank", list, used, false, false)?.map((b) => b.kind),
    ).toEqual(["fileSystems"]);
    expect(
      poolDeleteBlockers("tank", rows("mirror"), used, false, false),
    ).toEqual([]);
    const root = poolRoot(list, "tank") as ZfsObject;
    expect(fsDeleteBlockers(root, used, false, false)).toEqual([
      { kind: "poolFolder" },
    ]);
  });

  it("refuses to delete a shared file system, by its folder", () => {
    const list = rows("mirrorWithFs");
    const media = findFs(list, "tank/media") as ZfsObject;
    const share = {
      uuid: "u",
      name: "media",
      comment: "",
      mntentref: "x",
      reldirpath: "/",
      _used: false,
      device: "",
      description: "",
      status: "",
      mntent: { dir: "/tank/media" },
    } as unknown as Parameters<typeof fsUsedBy>[2]["shares"]["data"] extends
      readonly (infer T)[] | undefined
      ? T
      : never;
    const used = fsUsedBy(media, list, {
      shares: { data: [share], failed: false },
      omvUsed: { value: false, failed: false },
      snapshots: { data: [], failed: false },
    });
    expect(fsDeleteBlockers(media, used, false, false)).toEqual([
      {
        kind: "shares",
        names: ["media"],
        folders: [{ uuid: "u", name: "media" }],
      },
    ]);
    const unread = fsUsedBy(media, list, {
      shares: { failed: true, error: new Error("x") },
      omvUsed: { value: false, failed: false },
      snapshots: { data: [], failed: false },
    });
    expect(fsDeleteBlockers(media, unread, false, false)?.[0]?.kind).toBe(
      "unread",
    );
  });
});

describe("the mock's hand-written reports read like the captures", () => {
  it("parses every pool report of every ZFS story, and matches its disks", async () => {
    const mocks = await import("../mocks/zfsScenarios.ts");
    for (const name of mocks.ZFS_SCENARIOS) {
      if (name === "zfsKernelNames") {
        continue;
      }
      const state = mocks.newZfsMockState(name);
      // A name outside the pattern ("my pool") has no page, and its report fails closed.
      for (const pool of state.pools.filter((p) => isPoolAddress(p.name))) {
        const parsed = parsePoolReport(mocks.poolReport(state, pool));
        expect(parsed.known, `${name} ${pool.name}`).toBe(true);
        const devices = mocks.poolDevices(pool) as unknown as ZfsPoolDevice[];
        expect(matchDisks(parsed, devices).known, `${name} ${pool.name}`).toBe(
          true,
        );
      }
    }
  });
});
