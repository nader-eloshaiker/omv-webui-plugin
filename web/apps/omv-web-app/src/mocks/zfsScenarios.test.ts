// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS plugin in the mock (phase 5 ZFS design 14): absent from every story but the zfs* ones; in
// those, every reply has the contract's shape, the reports are written as zpool status writes them
// (the captured ones exactly), and the answers remember what the reader did, as the test VM showed.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import * as F from "@omv-webui/react-api-omv/forms";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { describe, expect, it } from "vitest";
// Test code only: the contract's tables, to check every reply and every request sent here.
import {
  OPERATIONS,
  SCHEMAS,
} from "../../../../packages/react-api-omv/src/contract/generated/operations.ts";
import {
  normalise,
  validate,
} from "../../../../packages/react-api-omv/src/transport/schema.ts";
import { isDashboardScenario } from "./dashboardScenarios.ts";
import {
  newMockSession,
  scenarioAnswers,
  SCENARIOS,
  type MockSession,
  type ScenarioName,
} from "./scenarios.ts";
import {
  ZFS_NOT_INSTALLED,
  ZFS_SCENARIOS,
  type ZfsScenarioName,
} from "./zfsScenarios.ts";

type OperationId = keyof typeof CONTRACT_EXAMPLES;
const ZFS_OPERATIONS = (Object.keys(CONTRACT_EXAMPLES) as OperationId[]).filter(
  (id) => id.startsWith("zfs"),
);

type AnyAnswer =
  | string
  | FixedAnswer
  | ((call: { params: unknown; options: unknown }) => string | FixedAnswer);

function call(
  scenario: ScenarioName,
  operationId: string,
  params: unknown = {},
  session: MockSession = newMockSession(true),
): string | FixedAnswer | undefined {
  const answers: Readonly<Partial<Record<string, AnyAnswer>>> = scenarioAnswers(
    scenario,
    session,
  );
  const answer = answers[operationId];
  return typeof answer === "function"
    ? answer({ params, options: undefined })
    : answer;
}

const entryOf = (operationId: string) =>
  Object.values(OPERATIONS).find((e) => e.operationId === operationId);

/** A reply checked against the contract: a 200 reply has the response's shape. */
function checked(
  operationId: string,
  answer: string | FixedAnswer | undefined,
) {
  expect(answer, operationId).toBeDefined();
  if (typeof answer === "string" || answer === undefined) {
    return answer;
  }
  if (answer.status === 200) {
    const schema = entryOf(operationId)?.response;
    if (schema === null || schema === undefined) {
      expect(answer.value ?? null, operationId).toBeNull();
    } else {
      // As the transport reads it: the known wire quirks normalised first.
      expect(
        validate(normalise(answer.value, schema, SCHEMAS), schema, SCHEMAS),
        operationId,
      ).toEqual([]);
    }
  } else {
    expect(answer.message, operationId).toEqual(expect.any(String));
  }
  return answer;
}

/** A request this test sends, held first to the contract's form schema of its operation. */
function sent(
  schema: {
    "~standard": {
      validate: (value: unknown) => unknown;
    };
  } | null,
  params: unknown,
) {
  if (schema !== null) {
    const result = schema["~standard"].validate(params) as {
      issues?: readonly { message: string }[];
    };
    expect(
      result.issues?.map((i) => i.message),
      JSON.stringify(params),
    ).toBeUndefined();
  }
  return params;
}

/** A story's session and a caller that keeps it, with each reply checked. */
function story(scenario: ZfsScenarioName | ScenarioName) {
  const session = newMockSession(true);
  // One answers object per session, as the mock's handlers build it once.
  const answers: Readonly<Partial<Record<string, AnyAnswer>>> = scenarioAnswers(
    scenario,
    session,
  );
  const ask = (operationId: string, params: unknown = {}) => {
    const answer = answers[operationId];
    const result =
      typeof answer === "function"
        ? answer({ params, options: undefined })
        : answer;
    return checked(operationId, result);
  };
  const value = <T>(operationId: string, params: unknown = {}): T => {
    const answer = ask(operationId, params);
    expect(answer, operationId).toMatchObject({ status: 200 });
    return (answer as FixedAnswer).value as T;
  };
  const pending = () =>
    Object.keys(
      value<{ dirtyModules: object }>("systemGetInformation").dirtyModules,
    ).sort();
  return { session, ask, value, pending };
}

interface Row {
  type: string;
  path: string;
  name: string;
  state: string;
  mountpoint: string;
  size: number | null;
  used: number;
  available: number;
  compression?: string;
  scrubstate: string;
  lastscrub: string;
  hasshares: boolean;
}
interface Device {
  devicefile: string;
  state: string;
  vdev: string;
}

const LIST = { start: 0, limit: null, sortfield: null, sortdir: null };
const ID = (serial: number) =>
  `/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-${String(serial).padStart(4, "0")}`;
const SDB = ID(3);
const SDC = ID(4);
const SDD = ID(5);
const SDE = ID(6);

/**
 * A report with its columns' padding made one width: the captures' serial numbers were shortened by
 * the scrubbing after ZFS padded its columns to the real ones.
 */
const columns = (report: string) => report.replace(/ {2,}/g, "  ");

const OTHER_SCENARIOS = SCENARIOS.filter(
  (n) =>
    !(ZFS_SCENARIOS as readonly string[]).includes(n) &&
    !isDashboardScenario(n),
);

describe("the ZFS plugin in the mock", () => {
  it("covers all nineteen Zfs operations of the contract", () => {
    expect(ZFS_OPERATIONS).toHaveLength(19);
  });

  it.each(OTHER_SCENARIOS)(
    "%s: the plugin is not installed, so every Zfs method answers OMV's 404",
    (scenario) => {
      for (const operationId of ZFS_OPERATIONS) {
        const answer = call(scenario, operationId);
        if (operationId === "zfsListCompressionTypes") {
          expect(answer).toBe("notInstalled");
        } else {
          expect(answer, operationId).toEqual(ZFS_NOT_INSTALLED);
        }
      }
    },
  );

  it("zfsNoPlugin answers the 404 for every Zfs method", () => {
    for (const operationId of ZFS_OPERATIONS) {
      expect(call("zfsNoPlugin", operationId)).toEqual(ZFS_NOT_INSTALLED);
    }
  });

  it.each(ZFS_SCENARIOS)("%s: answers 401 before sign-in", (scenario) => {
    for (const operationId of ZFS_OPERATIONS) {
      expect(
        call(scenario, operationId, {}, newMockSession(false)),
      ).toMatchObject({ status: 401 });
    }
  });

  it.each(
    ZFS_SCENARIOS.filter((n) => n !== "zfsNoPlugin" && n !== "zfsBroken"),
  )("%s: every read answers in the contract's shape", (scenario) => {
    const s = story(scenario);
    expect(s.value("zfsListCompressionTypes")).toEqual(
      CONTRACT_EXAMPLES.zfsListCompressionTypes.list.value,
    );
    const rows = s.value<{ data: Row[] }>("zfsListPools", LIST).data;
    s.value("zfsGetPoolStatus");
    s.value("zfsGetEmptyCandidates");
    s.value("zfsGetAllSnapshots", LIST);
    for (const row of rows) {
      if (row.type === "Pool") {
        s.value("zfsGetPoolDevices", { name: row.name });
        const report = s.ask("zfsGetObjectDetails", {
          type: "Pool",
          name: row.name,
        });
        if (scenario !== "zfsReportFails") {
          expect(report).toMatchObject({ status: 200 });
        }
      } else if (row.type === "Filesystem") {
        s.value("zfsGetObjectDetails", { type: "Filesystem", name: row.path });
      }
    }
    for (const op of [
      "fileSystemMgmtGetList",
      "fileSystemMgmtEnumerateFilesystems",
      "fileSystemMgmtEnumerateMountedFilesystems",
      "diskMgmtGetList",
      "shareMgmtGetList",
    ]) {
      s.ask(op, LIST);
    }
  });

  it("zfsBroken: the probe answers, every other read fails with ZFS's words", () => {
    const s = story("zfsBroken");
    expect(s.ask("zfsListCompressionTypes")).toMatchObject({ status: 200 });
    for (const op of [
      "zfsListPools",
      "zfsGetPoolStatus",
      "zfsGetObjectDetails",
    ]) {
      expect(s.ask(op, { type: "Pool", name: "tank" })).toMatchObject({
        status: 500,
        message: expect.stringContaining("modprobe zfs"),
      });
    }
  });

  it.each([
    { scenario: "zfsMirror", example: "mirror" },
    { scenario: "zfsDegraded", example: "mirrorDegraded" },
    { scenario: "zfsCheckStopped", example: "mirrorCheckStopped" },
    { scenario: "zfsReplaced", example: "mirrorReplaced" },
    { scenario: "zfsRaidz1", example: "raidz1" },
    { scenario: "zfsRaidz2", example: "raidz2" },
    { scenario: "zfsStripe", example: "stripe" },
    { scenario: "zfsSingle", example: "single" },
  ] as const)(
    "$scenario writes the captured $example report exactly",
    ({ scenario, example }) => {
      const s = story(scenario);
      expect(
        columns(
          s.value<string>("zfsGetObjectDetails", {
            type: "Pool",
            name: "tank",
          }),
        ),
      ).toBe(
        columns(String(CONTRACT_EXAMPLES.zfsGetObjectDetails[example].value)),
      );
      expect(s.value("zfsGetPoolDevices", { name: "tank" })).toEqual(
        CONTRACT_EXAMPLES.zfsGetPoolDevices[example].value,
      );
      const status =
        s.value<{ name: string; state: string }[]>("zfsGetPoolStatus");
      expect(status.map((p) => [p.name, p.state])).toEqual(
        CONTRACT_EXAMPLES.zfsGetPoolStatus[example].value.map((p) => [
          p.name,
          p.state,
        ]),
      );
    },
  );

  it.each([
    { scenario: "zfsChecking", example: "mirrorChecking" },
    { scenario: "zfsPaused", example: "mirrorCheckPaused" },
    { scenario: "zfsRebuilding", example: "mirrorReplacing" },
  ] as const)(
    "$scenario writes the captured $example tree and scan line",
    ({ scenario, example }) => {
      const s = story(scenario);
      const mine = s.value<string>("zfsGetObjectDetails", {
        type: "Pool",
        name: "tank",
      });
      const captured = String(
        CONTRACT_EXAMPLES.zfsGetObjectDetails[example].value,
      );
      const tree = (report: string) =>
        report.split("\n\r").slice(report.split("\n\r").indexOf("config:"));
      const scan = (report: string) =>
        report.split("\n\r").find((l) => l.startsWith("  scan:"));
      expect(tree(columns(mine))).toEqual(tree(columns(captured)));
      expect(scan(mine)).toBe(scan(captured));
      expect(s.value("zfsGetPoolDevices", { name: "tank" })).toEqual(
        CONTRACT_EXAMPLES.zfsGetPoolDevices[example].value,
      );
      const row = s.value<{ data: Row[] }>("zfsListPools", LIST).data[0];
      const capturedRow = CONTRACT_EXAMPLES.zfsListPools[example].value.data[0];
      expect([row?.lastscrub, row?.scrubstate]).toEqual([
        capturedRow?.lastscrub,
        capturedRow?.scrubstate,
      ]);
    },
  );

  it("the space for files follows the VM's measurements", () => {
    const share = (scenario: ZfsScenarioName) => {
      const rows = story(scenario).value<{ data: Row[] }>(
        "zfsListPools",
        LIST,
      ).data;
      const own = rows.find(
        (r) => r.type === "Filesystem" && r.path === "tank",
      );
      return ((own?.used ?? 0) + (own?.available ?? 0)) / 8589934592;
    };
    expect(share("zfsMirror")).toBeCloseTo(0.908, 2);
    expect(share("zfsSingle")).toBeCloseTo(0.908, 2);
    expect(share("zfsStripe")).toBeCloseTo(2 * 0.908, 2);
    expect(share("zfsRaidz1")).toBeCloseTo(2 * 0.948, 2);
    expect(share("zfsRaidz2")).toBeCloseTo(2 * 0.924, 2);
  });

  it("creating a mirror takes its disks, lists its own folder and marks the four modules", () => {
    const s = story("zfsNone");
    expect(
      s
        .value<{ devicefile: string }[]>("zfsGetEmptyCandidates")
        .map((c) => c.devicefile),
    ).toEqual([SDB, SDC, SDD, SDE]);
    const request = sent(F.ZfsAddPoolRequestSchema, {
      pooltype: "mirror",
      force: false,
      mountpoint: "",
      name: "tank",
      devices: [SDB, SDC],
      devalias: "id",
      ashift: true,
      ashiftval: 12,
      casesensitivity: "sensitive",
      compress: true,
      compresstype: "lz4",
    });
    expect(s.ask("zfsAddPool", request)).toEqual({ status: 200, value: null });
    expect(
      s
        .value<{ devicefile: string }[]>("zfsGetEmptyCandidates")
        .map((c) => c.devicefile),
    ).toEqual([SDD, SDE]);
    const rows = s.value<{ data: Row[] }>("zfsListPools", LIST).data;
    expect(rows.map((r) => [r.type, r.path])).toEqual([
      ["Pool", "tank"],
      ["Filesystem", "tank"],
    ]);
    expect(rows[1]).toMatchObject({ compression: "lz4", mountpoint: "/tank" });
    expect(s.pending()).toEqual(["collectd", "fstab", "monit", "quota"]);
    const devices = s.value<Device[]>("zfsGetPoolDevices", { name: "tank" });
    expect(devices.map((d) => [d.devicefile, d.vdev])).toEqual([
      [`${SDB}-part1`, "mirror-0"],
      [`${SDC}-part1`, "mirror-0"],
    ]);
    const configured = s
      .value<{
        data: {
          type: string;
          uuid: unknown;
          devicefile: string;
          devicefiles: string[];
        }[];
      }>("fileSystemMgmtGetList", LIST)
      .data.filter((r) => r.type === "zfs");
    expect(configured).toEqual([
      expect.objectContaining({
        uuid: null,
        devicefile: "tank",
        devicefiles: ["/dev/sdb", "/dev/sdc"],
      }),
    ]);
    // Flow A no longer offers its disks.
    expect(s.session.fs?.free.map((c) => c.devicefile)).not.toContain(
      "/dev/sdb",
    );
  });

  it("a name ZFS keeps for itself is refused and still leaves a partition table", () => {
    const s = story("zfsNone");
    const request = sent(F.ZfsAddPoolRequestSchema, {
      pooltype: "basic",
      force: false,
      mountpoint: "",
      name: "tank",
      devices: [SDE],
      devalias: "id",
      ashift: true,
      ashiftval: 12,
      casesensitivity: "sensitive",
      compress: true,
      compresstype: "lz4",
    });
    expect(
      s.ask("zfsAddPool", { ...(request as object), name: "mirror1" }),
    ).toMatchObject({
      status: 500,
      message: expect.stringContaining("name is reserved"),
    });
    expect(
      s
        .value<{ devicefile: string }[]>("zfsGetEmptyCandidates")
        .map((c) => c.devicefile),
    ).not.toContain(SDE);
    expect(s.pending()).toEqual([]);
    // Wiped, it is offered again.
    s.ask("diskMgmtWipe", { devicefile: SDE, secure: false });
    s.ask("execGetOutput", {
      filename: CONTRACT_EXAMPLES.diskMgmtWipe.started.value,
      pos: 0,
    });
    expect(
      s
        .value<{ devicefile: string }[]>("zfsGetEmptyCandidates")
        .map((c) => c.devicefile),
    ).toContain(SDE);
  });

  it("zfsCreateFails refuses and leaves the disks under Erase and reuse", () => {
    const s = story("zfsCreateFails");
    expect(
      s.ask("zfsAddPool", {
        pooltype: "mirror",
        name: "tank",
        devices: [SDB, SDC],
      }),
    ).toMatchObject({ status: 500 });
    expect(
      s
        .value<{ devicefile: string }[]>("zfsGetEmptyCandidates")
        .map((c) => c.devicefile),
    ).toEqual([SDD, SDE]);
  });

  it("adding a file system with a name that is taken changes nothing", () => {
    const s = story("zfsMirror");
    const add = sent(F.ZfsAddObjectRequestSchema, {
      type: "filesystem",
      path: "tank",
      name: "docs",
      mountpoint: "",
    });
    expect(s.ask("zfsAddObject", add)).toEqual({ status: 200, value: null });
    expect(s.pending()).toEqual(["collectd", "fstab", "monit", "quota"]);
    const count = () => s.value<{ total: number }>("zfsListPools", LIST).total;
    const before = count();
    expect(
      s.ask("zfsAddObject", { ...(add as object), name: "media" }),
    ).toEqual({
      status: 200,
      value: null,
    });
    expect(count()).toBe(before);
    const rows = s.value<{ data: Row[] }>("zfsListPools", LIST).data;
    expect(rows.find((r) => r.path === "tank/docs")).toMatchObject({
      mountpoint: "/tank/docs",
      compression: "lz4",
    });
    const mounted = s.value<{ devicefile: string }[]>(
      "fileSystemMgmtEnumerateMountedFilesystems",
    );
    expect(mounted.map((r) => r.devicefile)).toContain("tank/docs");
  });

  it("a size limit below what a file system holds is refused; one above it is set", () => {
    const s = story("zfsMirror");
    const set = (value: string) =>
      s.ask(
        "zfsSetProperties",
        sent(F.ZfsSetPropertiesRequestSchema, {
          type: "Filesystem",
          name: "tank/media",
          properties: [{ property: "quota", value, modified: true }],
        }),
      );
    expect(set("1G")).toMatchObject({
      status: 500,
      message: expect.stringContaining("size is less than current used"),
    });
    expect(s.pending()).toEqual([]);
    expect(set("6G")).toEqual({ status: 200, value: null });
    expect(s.pending()).toEqual(["collectd", "monit", "quota"]);
    const media = s
      .value<{ data: Row[] }>("zfsListPools", LIST)
      .data.find((r) => r.path === "tank/media");
    expect(media?.size).toBe(6 * 1024 ** 3);
    expect(media?.available).toBeLessThan(1024 ** 3);
    s.ask("zfsSetProperties", {
      type: "Filesystem",
      name: "tank/media",
      properties: [{ property: "compression", value: "off", modified: true }],
    });
    expect(
      s
        .value<{ data: Row[] }>("zfsListPools", LIST)
        .data.find((r) => r.path === "tank/media")?.compression,
    ).toBe("off");
  });

  it("snapshots: taken by the NAS's time, roll-back past a newer one refused, deleted as a task", () => {
    const s = story("zfsMirror");
    const names = () =>
      s
        .value<{ data: { parent: string; name: string }[] }>(
          "zfsGetAllSnapshots",
          LIST,
        )
        .data.filter((x) => x.parent === "tank/media")
        .map((x) => x.name);
    expect(names()).toEqual(["2026-11-21_12-00-00", "2026-11-21_12-00-01"]);
    s.ask(
      "zfsQuickSnapshot",
      sent(F.ZfsQuickSnapshotRequestSchema, {
        name: "tank/media",
        recursive: false,
      }),
    );
    const taken = names();
    expect(taken).toHaveLength(3);
    expect(taken[2]).toMatch(/^\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d$/);
    expect(s.pending()).toEqual([]);
    expect(
      s.ask(
        "zfsRollbackSnapshot",
        sent(F.ZfsRollbackSnapshotRequestSchema, {
          name: "tank/media@2026-11-21_12-00-00",
        }),
      ),
    ).toMatchObject({
      status: 500,
      message: expect.stringContaining("more recent snapshots"),
    });
    expect(
      s.ask("zfsRollbackSnapshot", { name: `tank/media@${taken[2] ?? ""}` }),
    ).toEqual({ status: 200, value: null });
    const handle = s.value<string>(
      "zfsDeleteObjectBg",
      sent(null, {
        type: "Snapshot",
        name: `tank/media@${taken[2] ?? ""}`,
        mp: "",
        recursive: false,
      }),
    );
    expect(s.pending()).toEqual(["collectd", "fstab", "monit", "quota"]);
    expect(s.ask("execGetOutput", { filename: handle, pos: 0 })).toMatchObject({
      status: 200,
      value: { running: false },
    });
    expect(names()).toHaveLength(2);
  });

  it("a check moves on at every report read, ends, and can be stopped", () => {
    const s = story("zfsMirror");
    const report = () =>
      s.value<string>("zfsGetObjectDetails", { type: "Pool", name: "tank" });
    expect(s.ask("zfsStopScrub", { name: "tank" })).toMatchObject({
      status: 500,
      message: expect.stringContaining("there is no active scrub"),
    });
    s.ask("zfsScrubPool", sent(F.ZfsScrubPoolRequestSchema, { name: "tank" }));
    expect(report()).toContain("10.00% done");
    expect(report()).toContain("20.00% done");
    const row = s.value<{ data: Row[] }>("zfsListPools", LIST).data[0];
    expect(row).toMatchObject({ scrubstate: "running" });
    expect(row?.lastscrub).toMatch(/^in progress since .* UTC 2026$/);
    let last = "";
    for (let i = 0; i < 9; i += 1) {
      last = report();
    }
    expect(last).toMatch(
      /scan: scrub repaired 0B in 00:00:03 with 0 errors on /,
    );
    expect(
      s.value<{ data: Row[] }>("zfsListPools", LIST).data[0],
    ).toMatchObject({
      scrubstate: "completed",
    });
    s.ask("zfsScrubPool", { name: "tank" });
    expect(s.ask("zfsStopScrub", { name: "tank" })).toEqual({
      status: 200,
      value: null,
    });
    expect(report()).toMatch(/scan: scrub canceled on /);
    expect(
      s.value<{ data: Row[] }>("zfsListPools", LIST).data[0]?.lastscrub,
    ).toMatch(/^canceled on .* UTC 2026$/);
  });

  it("a paused check continues", () => {
    const s = story("zfsPaused");
    s.ask("zfsScrubPool", { name: "tank" });
    expect(
      s.value<string>("zfsGetObjectDetails", { type: "Pool", name: "tank" }),
    ).toContain("scrub in progress since");
  });

  it("replacing a disk shows both in replacing-1, then lets go of the old one", () => {
    const s = story("zfsMirror");
    expect(
      s.ask(
        "zfsDeviceReplace",
        sent(F.ZfsDeviceReplaceRequestSchema, {
          pool: "tank",
          olddevice: `${SDC}-part1`,
          newdevice: SDD,
        }),
      ),
    ).toEqual({ status: 200, value: null });
    expect(s.pending()).toEqual([]);
    const devices = s.value<Device[]>("zfsGetPoolDevices", { name: "tank" });
    expect(devices.map((d) => [d.devicefile, d.vdev])).toEqual([
      [`${SDB}-part1`, "mirror-0"],
      [`${SDC}-part1`, "replacing-1"],
      [`${SDD}-part1`, "replacing-1"],
    ]);
    const report = () =>
      s.value<string>("zfsGetObjectDetails", { type: "Pool", name: "tank" });
    expect(report()).toContain("(resilvering)");
    let last = "";
    for (let i = 0; i < 10; i += 1) {
      last = report();
    }
    expect(last).toMatch(/scan: resilvered .* with 0 errors on /);
    expect(
      s
        .value<Device[]>("zfsGetPoolDevices", { name: "tank" })
        .map((d) => d.devicefile),
    ).toEqual([`${SDB}-part1`, `${SDD}-part1`]);
    // The old disk keeps ZFS's partition table: not offered until wiped.
    expect(
      s
        .value<{ devicefile: string }[]>("zfsGetEmptyCandidates")
        .map((c) => c.devicefile),
    ).toEqual([SDE]);
  });

  it("taking a disk offline degrades the pool; the last copy is refused", () => {
    const s = story("zfsMirror");
    const offline = (device: string) =>
      s.ask(
        "zfsDeviceOffline",
        sent(F.ZfsDeviceOfflineRequestSchema, { pool: "tank", device }),
      );
    expect(offline(`${SDC}-part1`)).toEqual({ status: 200, value: null });
    expect(s.value<{ state: string }[]>("zfsGetPoolStatus")[0]?.state).toBe(
      "DEGRADED",
    );
    expect(offline(`${SDB}-part1`)).toMatchObject({
      status: 500,
      message: expect.stringContaining("no valid replicas"),
    });
    s.ask("zfsDeviceOnline", { pool: "tank", device: `${SDC}-part1` });
    expect(s.value<{ state: string }[]>("zfsGetPoolStatus")[0]?.state).toBe(
      "ONLINE",
    );
  });

  it("clearing the error counts zeroes them", () => {
    const s = story("zfsErrors");
    const report = () =>
      s.value<string>("zfsGetObjectDetails", { type: "Pool", name: "tank" });
    expect(report()).toMatch(/ONLINE\s+3\s+0\s+12/);
    s.ask("zfsClearPool", { name: "tank" });
    expect(report()).not.toMatch(/ONLINE\s+3\s+0\s+12/);
  });

  it("deletes: a pool with a file system refused, the file system then the pool, the disks after a wipe", () => {
    const s = story("zfsMirror");
    const remove = (params: object) =>
      s.value<string>("zfsDeleteObjectBg", sent(null, params));
    const last = (handle: string) =>
      s.ask("execGetOutput", { filename: handle, pos: 0 });
    expect(
      last(
        remove({ type: "Pool", name: "tank", mp: "/tank", recursive: false }),
      ),
    ).toMatchObject({
      status: 500,
      message: 'Cannot delete pool "tank": it has datasets. Delete them first.',
    });
    // A folder the pool does not have is refused at once.
    expect(
      s.ask("zfsDeleteObjectBg", {
        type: "Filesystem",
        name: "tank/media",
        mp: "/srv/x",
        recursive: false,
      }),
    ).toMatchObject({ status: 500 });
    expect(
      last(
        remove({
          type: "Filesystem",
          name: "tank/media",
          mp: "/tank/media",
          recursive: false,
        }),
      ),
    ).toMatchObject({ status: 200 });
    expect(
      s
        .value<{ data: { parent: string }[] }>("zfsGetAllSnapshots", LIST)
        .data.filter((x) => x.parent === "tank/media"),
    ).toEqual([]);
    expect(
      last(
        remove({ type: "Pool", name: "tank", mp: "/tank", recursive: false }),
      ),
    ).toMatchObject({
      status: 200,
    });
    expect(s.value<{ total: number }>("zfsListPools", LIST).total).toBe(0);
    expect(
      s
        .value<{ data: { type: string }[] }>("fileSystemMgmtGetList", LIST)
        .data.filter((r) => r.type === "zfs"),
    ).toEqual([]);
    const free = () =>
      s
        .value<{ devicefile: string }[]>("zfsGetEmptyCandidates")
        .map((c) => c.devicefile);
    expect(free()).toEqual([SDD, SDE]);
    s.ask("diskMgmtWipe", { devicefile: SDB, secure: false });
    s.ask("execGetOutput", {
      filename: CONTRACT_EXAMPLES.diskMgmtWipe.started.value,
      pos: 0,
    });
    expect(free()).toEqual([SDB, SDD, SDE]);
  });

  it("a shared file system is not deleted, and its folder is the one the share names", () => {
    const s = story("zfsShared");
    const shares = s.value<{
      data: { name: string; mntent: { dir: string } }[];
    }>("shareMgmtGetList", LIST).data;
    expect(shares.find((x) => x.name === "media")?.mntent.dir).toBe(
      "/tank/media",
    );
    expect(
      s
        .value<{ data: Row[] }>("zfsListPools", LIST)
        .data.find((r) => r.path === "tank/media")?.hasshares,
    ).toBe(true);
    const handle = s.value<string>("zfsDeleteObjectBg", {
      type: "Filesystem",
      name: "tank/media",
      mp: "/tank/media",
      recursive: false,
    });
    expect(s.ask("execGetOutput", { filename: handle, pos: 0 })).toMatchObject({
      status: 500,
    });
  });

  it("FsTab.getByFsName refuses a ZFS name as OMV does (HTTP 400)", () => {
    const s = story("zfsMirror");
    expect(s.ask("fsTabGetByFsName", { fsname: "tank/media" })).toMatchObject({
      status: 400,
    });
  });

  it("a pool OMV does not know yet is only in enumerateFilesystems", () => {
    const s = story("zfsUnknownToOmv");
    const names = (op: string) =>
      (
        (op === "fileSystemMgmtGetList"
          ? s.value<{ data: { devicefile: string; type: string }[] }>(op, LIST)
              .data
          : s.value<{ devicefile: string; type: string }[]>(op)) as {
          devicefile: string;
          type: string;
        }[]
      )
        .filter((r) => r.type === "zfs")
        .map((r) => r.devicefile);
    expect(names("fileSystemMgmtEnumerateFilesystems")).toEqual(
      expect.arrayContaining(["backup", "backup/old", "tank"]),
    );
    expect(names("fileSystemMgmtGetList")).not.toContain("backup");
    expect(names("fileSystemMgmtEnumerateMountedFilesystems")).not.toContain(
      "backup",
    );
  });

  it("zfsKernelNames: the disks are named by their kernel names", () => {
    const s = story("zfsKernelNames");
    expect(
      s
        .value<Device[]>("zfsGetPoolDevices", { name: "tank" })
        .map((d) => d.devicefile),
    ).toEqual(["/dev/sdb1", "/dev/sdc1"]);
    expect(
      s.value<string>("zfsGetObjectDetails", { type: "Pool", name: "tank" }),
    ).toMatch(/\n\r\t {4}sdb1 +ONLINE/);
  });

  it("zfsMissing and zfsUnusable say where a missing disk was last seen", () => {
    const missing = story("zfsMissing").value<string>("zfsGetObjectDetails", {
      type: "Pool",
      name: "tank",
    });
    expect(missing).toMatch(
      /UNAVAIL +0 +0 +0 {2}was \/dev\/disk\/by-id\/.*-part1/,
    );
    expect(missing).toContain(" state: DEGRADED");
    expect(
      story("zfsUnusable").value<{ state: string }[]>("zfsGetPoolStatus")[0]
        ?.state,
    ).toBe("UNAVAIL");
  });

  it("zfsGroups names every class and group", () => {
    const s = story("zfsGroups");
    const report = s.value<string>("zfsGetObjectDetails", {
      type: "Pool",
      name: "tank",
    });
    for (const word of [
      "mirror-0",
      "mirror-1",
      "special",
      "mirror-2",
      "logs",
      "cache",
    ]) {
      expect(report).toContain(
        `\t${word.startsWith("mirror") ? "  " : ""}${word}`,
      );
    }
  });

  it("zfsEmptyDevices answers an empty device list for a listed pool", () => {
    expect(
      story("zfsEmptyDevices").value("zfsGetPoolDevices", { name: "tank" }),
    ).toEqual([]);
  });

  it("zfsMany lists twenty pools, zfsManySnapshots 500 snapshots", () => {
    expect(
      story("zfsMany").value<{ state: string }[]>("zfsGetPoolStatus"),
    ).toHaveLength(20);
    expect(
      story("zfsManySnapshots").value<{ total: number }>(
        "zfsGetAllSnapshots",
        LIST,
      ).total,
    ).toBe(500);
  });
});
