// SPDX-License-Identifier: GPL-3.0-or-later
// The RAID slice's rules on the test VM's captured replies (phase 5 RAID design 0.1 to 0.11), and on
// hand-written ones for what the VM cannot show.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { MdArray } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  addDecision,
  arrayAddress,
  arrayState,
  arrayUsedBy,
  checkDecision,
  deleteBlockers,
  findArray,
  isArrayAddress,
  isBusy,
  levelKey,
  memberRows,
  ownName,
  protection,
  readReport,
  removeDecision,
  reportProgress,
  stateProgress,
  usableSize,
  withoutHost,
  type Member,
} from "./raidModel.ts";

const ARRAYS = CONTRACT_EXAMPLES.mdMgmtEnumerateDevices;
const DETAIL = CONTRACT_EXAMPLES.mdMgmtGetDetail;
type Captured = Exclude<keyof typeof DETAIL, "notFound">;

const rowOf = (name: keyof typeof ARRAYS): MdArray => {
  const value = ARRAYS[name].value;
  if (!Array.isArray(value) || value[0] === undefined) {
    throw new Error(`no row in ${name}`);
  }
  return value[0] as MdArray;
};
const detailOf = (name: Captured): string => String(DETAIL[name].value);

/** The row and the report captured together, with the state the page reads from them. */
function read(name: Captured) {
  const row = rowOf(name);
  const detail = detailOf(name);
  const report = readReport(detail, row.devices);
  return { row, detail, report, state: arrayState(row, report, detail) };
}

describe("addresses (0.6)", () => {
  it.each([
    ["md0", true],
    ["md127", true],
    ["md999", true],
    ["md1000", false],
    ["MD0", false],
    ["md", false],
    ["md0/../../rpc.php", false],
    ["sdb", false],
  ])("%s is an address: %s", (value, ok) => {
    expect(isArrayAddress(value)).toBe(ok);
  });

  it("finds the row by its device file, and only that", () => {
    const rows = [rowOf("mirror")];
    expect(findArray(rows, "md0")?.uuid).toBe(rowOf("mirror").uuid);
    expect(findArray(rows, "md1")).toBeUndefined();
    expect(findArray(rows, "../md0")).toBeUndefined();
    expect(arrayAddress({ devicefile: "/dev/md0" })).toBe("md0");
    expect(arrayAddress({ devicefile: "/dev/md/media" })).toBeNull();
  });
});

describe("names (0.1)", () => {
  it("never shows the host part, nor mdadm's numbered default", () => {
    expect(ownName("")).toBe("");
    expect(ownName("nas:0")).toBe("");
    expect(ownName("otherpc:media")).toBe("media");
    expect(ownName("media")).toBe("media");
    expect(ownName("host:<img onerror>")).toBe("<img onerror>");
  });

  it("takes the host out of the report's Name line, and only there", () => {
    const report = withoutHost(detailOf("mirror"));
    expect(report).not.toMatch(/nas/);
    expect(report).toMatch(/^ {14}Name : 0$/m);
    expect(report).toContain("Raid Level : raid1");
    expect(withoutHost("  Name : otherpc:media")).toBe("  Name : media");
  });
});

describe("levels and protection (0.1, 0.4)", () => {
  it.each([
    ["raid1", "raid1"],
    ["mirror", "raid1"],
    ["stripe", "raid0"],
    ["raid0", "raid0"],
    ["RAID6", "raid6"],
    ["", "unknown"],
    ["multipath", "other"],
  ])("%s is %s", (level, key) => {
    expect(levelKey(level)).toBe(key);
  });

  it("says what each level can lose, reduced by the disks already short", () => {
    expect(protection("raid1", 2)).toEqual({ key: "mirror", count: 1 });
    expect(protection("raid1", 3)).toEqual({ key: "mirror", count: 2 });
    expect(protection("raid5", 3)).toEqual({ key: "one" });
    expect(protection("raid6", 4)).toEqual({ key: "two" });
    expect(protection("raid10", 4)).toEqual({ key: "raid10" });
    expect(protection("raid0", 2)).toEqual({ key: "none" });
    expect(protection("raid1", 2, 1)).toEqual({ key: "noMore" });
    expect(protection("raid5", 3, 1)).toEqual({ key: "noMore" });
    expect(protection("raid6", 4, 1)).toEqual({ key: "one" });
    expect(protection("raid6", 4, 2)).toEqual({ key: "noMore" });
    expect(protection("raid1", 3, 1)).toEqual({ key: "mirror", count: 1 });
    expect(protection("other", 2)).toBeNull();
  });

  it("estimates the usable space with each disk as the smallest, as the VM's sizes show", () => {
    const disk = 8_589_934_592;
    expect(usableSize("raid1", [disk, disk])).toBe(disk);
    expect(usableSize("raid5", [disk, disk, disk])).toBe(2 * disk);
    expect(usableSize("raid6", [disk, disk, disk, disk])).toBe(2 * disk);
    expect(usableSize("raid10", [disk, disk, disk, disk])).toBe(2 * disk);
    expect(usableSize("raid0", [disk, disk])).toBe(2 * disk);
    expect(usableSize("raid1", [disk, 2 * disk])).toBe(disk);
    // The VM's arrays: about the estimate, a little less (mdadm's own records).
    expect(Number(rowOf("raid5").size)).toBeLessThanOrEqual(2 * disk);
    expect(Number(rowOf("raid5").size)).toBeGreaterThan(1.99 * disk);
  });
});

describe("progress (0.1)", () => {
  it("reads a resync's and a rebuild's progress from the state", () => {
    expect(stateProgress(rowOf("mirrorSyncing").state)).toEqual({
      percent: 2.4,
      minutesLeft: 0.6,
    });
    expect(stateProgress(rowOf("mirrorRebuilding").state)).toEqual({
      percent: 4.7,
      minutesLeft: 0.3,
    });
    expect(stateProgress("clean")).toBeNull();
    expect(stateProgress(false)).toBeNull();
  });

  it("reads a reshape's and a check's progress from the report only (the state has none)", () => {
    expect(stateProgress(rowOf("raid5Reshaping").state)).toBeNull();
    expect(reportProgress(detailOf("raid5Reshaping"))).toEqual({
      kind: "reshape",
      percent: 6,
    });
    expect(stateProgress(rowOf("mirrorChecking").state)).toBeNull();
    expect(reportProgress(detailOf("mirrorChecking"))).toEqual({
      kind: "check",
      percent: 7,
    });
    expect(reportProgress(detailOf("mirrorRebuilding"))).toEqual({
      kind: "rebuild",
      percent: 4,
    });
    expect(reportProgress(detailOf("mirror"))).toBeNull();
  });
});

describe("the report's member table (0.3)", () => {
  const roles = (name: Captured) => {
    const report = read(name).report;
    return report.known
      ? report.members.map((m) => `${m.device} ${m.role}`)
      : null;
  };
  const counts = (name: Captured) => {
    const report = read(name).report;
    if (!report.known) {
      return null;
    }
    const { working, rebuilding, spares, failed, missing } = report;
    return { working, rebuilding, spares, failed, missing };
  };

  it("reads every captured report", () => {
    for (const name of Object.keys(DETAIL)) {
      if (name !== "notFound") {
        expect(read(name as Captured).report.known, name).toBe(true);
      }
    }
  });

  it("a healthy mirror: two working", () => {
    expect(roles("mirror")).toEqual(["/dev/sdb working", "/dev/sdc working"]);
    expect(counts("mirror")).toEqual({
      working: 2,
      rebuilding: 0,
      spares: 0,
      failed: 0,
      missing: 0,
    });
  });

  it("a RAID10's set words still read as working", () => {
    expect(counts("raid10Syncing")?.working).toBe(4);
  });

  it("a spare is a spare, and devices lists it too", () => {
    expect(roles("mirrorWithSpare")).toEqual([
      "/dev/sdb working",
      "/dev/sdc working",
      "/dev/sdd spare",
    ]);
    expect(rowOf("mirrorWithSpare").devices).toHaveLength(3);
  });

  it("a failed disk still listed is Failed, not also Missing", () => {
    expect(roles("mirrorRebuilding")).toEqual([
      "/dev/sdd rebuilding",
      "/dev/sdc working",
      "/dev/sdb failed",
    ]);
    expect(counts("mirrorRebuilding")).toEqual({
      working: 1,
      rebuilding: 1,
      spares: 0,
      failed: 1,
      missing: 0,
    });
  });

  it("a disk taken out is Missing, as one row without a disk", () => {
    expect(counts("mirrorDegraded")).toEqual({
      working: 1,
      rebuilding: 0,
      spares: 0,
      failed: 0,
      missing: 1,
    });
    expect(memberRows(read("mirrorDegraded").report).map((r) => r.key)).toEqual(
      ["/dev/sdc", "missing-0"],
    );
  });

  it("RAID6 with one and with two failed: removed slots and faulty lines are the same disks", () => {
    expect(counts("raid6OneFailed")).toEqual({
      working: 3,
      rebuilding: 0,
      spares: 0,
      failed: 1,
      missing: 0,
    });
    expect(counts("raid6TwoFailed")).toEqual({
      working: 2,
      rebuilding: 0,
      spares: 0,
      failed: 2,
      missing: 0,
    });
    expect(memberRows(read("raid6TwoFailed").report)).toHaveLength(4);
  });

  it("a disk missing beside a failed one still listed: one of each", () => {
    const report = readReport(
      [
        "    Number   Major   Minor   RaidDevice State",
        "       -       0        0        0      removed",
        "       -       0        0        1      removed",
        "       2       8       48        2      active sync   /dev/sdd",
        "       3       8       64        3      active sync   /dev/sde",
        "",
        "       0       8       16        -      faulty   /dev/sdb",
      ].join("\n"),
    );
    expect(report.known && [report.failed, report.missing]).toEqual([1, 1]);
  });

  it.each([
    ["no table", "State : clean"],
    [
      "a line it cannot read",
      "    Number   Major   Minor   RaidDevice State\n  what is this",
    ],
    ["an empty table", "    Number   Major   Minor   RaidDevice State\n"],
    ["not text", 42],
    ["markup", "<script>alert(1)</script>"],
  ])("fails closed on %s", (_, text) => {
    expect(readReport(text).known).toBe(false);
  });

  it("fails closed when a listed member is not in the table", () => {
    expect(
      readReport(detailOf("mirror"), ["/dev/sdb", "/dev/sdc", "/dev/sdx"])
        .known,
    ).toBe(false);
  });

  it("keeps a role it does not know as mdadm's words", () => {
    const report = readReport(
      "    Number   Major   Minor   RaidDevice State\n       0       8       16        0      replacing   /dev/sdb",
    );
    expect(report.known && report.members[0]).toEqual({
      device: "/dev/sdb",
      role: "other",
      words: "replacing",
    });
  });
});

describe("an array's state (0.2)", () => {
  it.each<[Captured, string, string]>([
    ["mirror", "ok", "ok"],
    ["mirrorSyncing", "resyncing", "warning"],
    ["mirrorWithSpare", "ok", "ok"],
    ["mirrorRebuilding", "rebuilding", "critical"],
    ["mirrorDegraded", "degraded", "critical"],
    ["mirrorReplacing", "rebuilding", "critical"],
    ["mirrorChecking", "checking", "ok"],
    ["raid5Syncing", "resyncing", "warning"],
    ["raid5", "ok", "ok"],
    ["raid5Reshaping", "reshaping", "warning"],
    ["raid6Syncing", "resyncing", "warning"],
    ["raid6OneFailed", "degraded", "critical"],
    ["raid6TwoFailed", "degraded", "critical"],
    ["raid10Syncing", "resyncing", "warning"],
    ["stripe", "ok", "ok"],
  ])("%s is %s (%s)", (name, kind, status) => {
    const { state } = read(name);
    expect(state.kind).toBe(kind);
    expect(state.status).toBe(status);
  });

  it("takes a reshape's and a check's progress from the report", () => {
    expect(read("raid5Reshaping").state.progress).toEqual({
      percent: 6,
      minutesLeft: null,
    });
    expect(read("mirrorChecking").state.progress?.percent).toBe(7);
    expect(read("mirrorRebuilding").state.rebuildingOnto).toBe("/dev/sdd");
  });

  it("counts the disks short from the report: RAID6 one, then two", () => {
    expect(read("raid6OneFailed").state.short).toBe(1);
    expect(read("raid6TwoFailed").state.short).toBe(2);
    expect(read("mirrorRebuilding").state.short).toBe(1);
    expect(read("mirrorWithSpare").state.short).toBe(0);
  });

  it("is degraded when the report counts fewer working disks, whatever the state says", () => {
    const row = { ...rowOf("mirror") };
    expect(arrayState(row, read("mirrorDegraded").report).kind).toBe(
      "degraded",
    );
  });

  it.each([
    [false, "unread", "unknown"],
    ["", "unread", "unknown"],
    ["inactive", "inactive", "critical"],
    ["active, FAILED, Not Started", "inactive", "critical"],
    ["clean, FAILED", "failed", "critical"],
    ["clean, resyncing (PENDING)", "resyncPending", "warning"],
    ["active, resyncing (DELAYED)", "resyncDelayed", "warning"],
    ["clean, frobnicating", "unrecognised", "unknown"],
    ["<img src=x onerror=alert(1)>", "unrecognised", "unknown"],
  ] as const)("state %j is %s", (state, kind, status) => {
    const s = arrayState({ state, syncaction: null, numdevices: 2 });
    expect(s.kind).toBe(kind);
    expect(s.status).toBe(status);
  });

  it("polls only while the kernel is working", () => {
    expect(isBusy(read("mirrorSyncing").state.kind)).toBe(true);
    expect(isBusy(read("raid5Reshaping").state.kind)).toBe(true);
    expect(isBusy(read("mirrorChecking").state.kind)).toBe(true);
    expect(isBusy(read("mirrorRebuilding").state.kind)).toBe(true);
    expect(isBusy(read("mirror").state.kind)).toBe(false);
    expect(isBusy(read("mirrorDegraded").state.kind)).toBe(false);
    expect(isBusy(read("stripe").state.kind)).toBe(false);
  });
});

describe("refusals (0.9)", () => {
  const member = (name: Captured, device: string): Member => {
    const report = read(name).report;
    const found = report.known
      ? report.members.find((m) => m.device === device)
      : undefined;
    if (found === undefined) {
      throw new Error(`${device} not in ${name}`);
    }
    return found;
  };
  const add = (name: Captured, changing = false) => {
    const { row, report, state } = read(name);
    return addDecision(levelKey(row.level), state, report, changing);
  };

  it("adds a replacement to a degraded array, a spare to a mirror, either to a RAID5", () => {
    expect(add("mirrorDegraded")).toEqual({ allowed: true, mode: "replace" });
    expect(add("raid6OneFailed")).toEqual({ allowed: true, mode: "replace" });
    expect(add("mirror")).toEqual({ allowed: true, mode: "spare" });
    expect(add("raid5")).toEqual({ allowed: true, mode: "either" });
  });

  it("refuses to add to a stripe, a busy or rebuilding array, an unread report, or one being changed", () => {
    expect(add("stripe")).toEqual({
      allowed: false,
      blocker: { kind: "level" },
    });
    expect(add("mirrorSyncing")).toEqual({
      allowed: false,
      blocker: { kind: "busy", what: "resync" },
    });
    expect(add("raid5Reshaping")).toEqual({
      allowed: false,
      blocker: { kind: "busy", what: "reshape" },
    });
    expect(add("mirrorChecking")).toEqual({
      allowed: false,
      blocker: { kind: "busy", what: "check" },
    });
    expect(add("mirrorRebuilding")).toEqual({
      allowed: false,
      blocker: { kind: "rebuilding", disk: "/dev/sdd" },
    });
    expect(add("mirror", true)).toEqual({
      allowed: false,
      blocker: { kind: "changing" },
    });
    const { row, state } = read("mirrorDegraded");
    expect(
      addDecision(levelKey(row.level), state, { known: false }, false),
    ).toEqual({
      allowed: false,
      blocker: { kind: "rolesUnknown" },
    });
    expect(
      addDecision(
        "raid1",
        arrayState({ state: false, syncaction: null, numdevices: 2 }),
        null,
        false,
      ),
    ).toEqual({ allowed: false, blocker: { kind: "unknown" } });
  });

  it("takes out a failed disk or a spare plainly, a working disk of a healthy array typed", () => {
    const at = (name: Captured, device: string) => {
      const { row, state } = read(name);
      return removeDecision(
        levelKey(row.level),
        state,
        member(name, device),
        false,
      );
    };
    expect(at("mirrorRebuilding", "/dev/sdb")).toEqual({
      allowed: true,
      confirm: "plain",
    });
    expect(at("mirrorWithSpare", "/dev/sdd")).toEqual({
      allowed: true,
      confirm: "plain",
    });
    expect(at("mirror", "/dev/sdb")).toEqual({
      allowed: true,
      confirm: "typed",
    });
    expect(at("mirrorRebuilding", "/dev/sdd")).toEqual({
      allowed: false,
      blocker: { kind: "rebuilding" },
    });
    expect(at("mirrorRebuilding", "/dev/sdc")).toEqual({
      allowed: false,
      blocker: { kind: "degraded" },
    });
    expect(at("raid6OneFailed", "/dev/sdc")).toEqual({
      allowed: false,
      blocker: { kind: "degraded" },
    });
    expect(at("raid6OneFailed", "/dev/sdb")).toEqual({
      allowed: true,
      confirm: "plain",
    });
    expect(at("mirrorSyncing", "/dev/sdb")).toEqual({
      allowed: false,
      blocker: { kind: "busy", what: "resync" },
    });
    expect(at("stripe", "/dev/sdb")).toEqual({
      allowed: false,
      blocker: { kind: "level" },
    });
  });

  it("checks an OK idle array, stops a check, and refuses a busy or degraded one", () => {
    expect(checkDecision(read("mirror").state, false)).toEqual({
      allowed: true,
      action: "check",
    });
    expect(checkDecision(read("mirrorChecking").state, false)).toEqual({
      allowed: true,
      action: "idle",
    });
    expect(checkDecision(read("mirrorSyncing").state, false)).toEqual({
      allowed: false,
      blocker: { kind: "busy", what: "resync" },
    });
    expect(checkDecision(read("mirrorDegraded").state, false)).toEqual({
      allowed: false,
      blocker: { kind: "degraded" },
    });
  });
});

describe("what uses an array, and deleting it (0.11, 7.1)", () => {
  const FS = CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value.data[0];
  const onArray = {
    ...FS,
    uuid: "00000000-0000-4000-8000-000000000770",
    devicefile: "/dev/disk/by-uuid/00000000-0000-4000-8000-000000000770",
    canonicaldevicefile: "/dev/md0",
    parentdevicefile: "/dev/md0",
    devicefiles: ["/dev/md0"],
    mountpoint: "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000770",
  };
  const row = rowOf("mirror");
  const state = read("mirror").state;
  const inputs = (
    configured: unknown[] | undefined,
    detected: unknown[] | undefined = [],
  ) => ({
    configured: {
      data: configured as never,
      failed: false,
    },
    detected: { data: detected as never, failed: false },
  });

  it("names a file system set up on it, and refuses the delete", () => {
    const used = arrayUsedBy(row, inputs([FS, onArray]));
    expect(used.kind === "known" && used.configured.map((f) => f.uuid)).toEqual(
      [onArray.uuid],
    );
    expect(deleteBlockers(state, used, false)?.map((b) => b.kind)).toEqual([
      "fs",
    ]);
  });

  it("counts a file system on a partition of the array", () => {
    const used = arrayUsedBy(
      row,
      inputs([
        {
          ...onArray,
          canonicaldevicefile: "/dev/md0p1",
          parentdevicefile: "",
          devicefiles: [],
        },
      ]),
    );
    expect(used.kind === "known" && used.configured).toHaveLength(1);
  });

  it("refuses for other storage, a file system being created, and a read that failed", () => {
    expect(
      deleteBlockers(
        state,
        arrayUsedBy({ ...row, _used: true }, inputs([])),
        false,
      )?.map((b) => b.kind),
    ).toEqual(["other"]);
    expect(
      deleteBlockers(
        state,
        arrayUsedBy(
          row,
          inputs([
            { ...onArray, status: 2, canonicaldevicefile: "", devicefiles: [] },
          ]),
        ),
        false,
      )?.map((b) => b.kind),
    ).toEqual(["creating"]);
    expect(
      deleteBlockers(
        state,
        arrayUsedBy(row, {
          configured: { failed: true, error: new Error("x") },
          detected: { data: [], failed: false },
        }),
        false,
      )?.map((b) => b.kind),
    ).toEqual(["unread"]);
  });

  it("says nothing while its reads load (Checking…, not the fail-closed state)", () => {
    expect(
      deleteBlockers(state, arrayUsedBy(row, inputs(undefined)), false),
    ).toBeNull();
  });

  it("allows deleting an empty array, synchronising or not", () => {
    expect(
      deleteBlockers(state, arrayUsedBy(row, inputs([FS])), false),
    ).toEqual([]);
    expect(
      deleteBlockers(
        read("mirrorSyncing").state,
        arrayUsedBy(row, inputs([])),
        false,
      ),
    ).toEqual([]);
  });

  it("lists a file system found on it but not set up", () => {
    const found = { ...onArray, mounted: false };
    const used = arrayUsedBy(row, inputs([], [found]));
    expect(used.kind === "known" && used.found).toHaveLength(1);
    expect(deleteBlockers(state, used, false)).toEqual([]);
  });
});
