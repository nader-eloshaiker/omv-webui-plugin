// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS plugin in the mock (phase 5 ZFS design 14): absent from every story but the ZFS ones, and
// in those, each operation answers one of the contract's captured examples.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { describe, expect, it } from "vitest";
import {
  newMockSession,
  scenarioAnswers,
  SCENARIOS,
  type ScenarioName,
} from "./scenarios.ts";
import { ZFS_NOT_INSTALLED, ZFS_SCENARIOS } from "./zfsScenarios.ts";

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
  operationId: OperationId,
  params: unknown = {},
  session = newMockSession(true),
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

const OTHER_SCENARIOS = SCENARIOS.filter(
  (n) => !(ZFS_SCENARIOS as readonly string[]).includes(n),
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
          expect(
            CONTRACT_EXAMPLES.zfsListCompressionTypes.notInstalled,
          ).toEqual({
            status: 404,
            value: { code: 0, message: ZFS_NOT_INSTALLED.message },
          });
        } else {
          expect(answer, operationId).toEqual(ZFS_NOT_INSTALLED);
        }
      }
    },
  );

  it.each(ZFS_SCENARIOS)(
    "%s: every Zfs method answers an example the contract has",
    (scenario) => {
      for (const operationId of ZFS_OPERATIONS) {
        for (const params of [
          {},
          { type: "Pool", name: "tank" },
          { type: "Filesystem", name: "tank/media" },
          { type: "Snapshot", name: "tank/media@2026-11-21_12-00-00" },
        ]) {
          const answer = call(scenario, operationId, params);
          if (typeof answer === "string") {
            expect(
              Object.keys(CONTRACT_EXAMPLES[operationId]),
              `${scenario} ${operationId}`,
            ).toContain(answer);
          } else {
            expect(answer, `${scenario} ${operationId}`).toMatchObject({
              status: 200,
            });
          }
        }
      }
    },
  );

  it.each(ZFS_SCENARIOS)("%s: answers 401 before sign-in", (scenario) => {
    for (const operationId of ZFS_OPERATIONS) {
      expect(
        call(scenario, operationId, {}, newMockSession(false)),
      ).toMatchObject({ status: 401 });
    }
  });

  it.each([
    { scenario: "zfsMirror", report: "mirror", list: "mirrorWithFs" },
    {
      scenario: "zfsChecking",
      report: "mirrorChecking",
      list: "mirrorChecking",
    },
    {
      scenario: "zfsDegraded",
      report: "mirrorDegraded",
      list: "mirrorDegraded",
    },
    {
      scenario: "zfsRebuilding",
      report: "mirrorReplacing",
      list: "mirrorReplacing",
    },
    { scenario: "zfsRaidz2", report: "raidz2", list: "raidz2" },
  ] as const)(
    "$scenario reads the captured $report state",
    ({ scenario, report, list }) => {
      expect(call(scenario, "zfsGetObjectDetails", { type: "Pool" })).toBe(
        report,
      );
      expect(call(scenario, "zfsGetPoolDevices", { name: "tank" })).toBe(
        report,
      );
      expect(call(scenario, "zfsListPools")).toBe(list);
      expect(
        call(scenario, "zfsGetObjectDetails", { type: "Filesystem" }),
      ).toBe("filesystem");
    },
  );

  it("with no pool, the reads answer as the plugin does", () => {
    expect(call("zfsNone", "zfsListPools")).toBe("none");
    expect(call("zfsNone", "zfsGetPoolStatus")).toBe("none");
    expect(call("zfsNone", "zfsGetEmptyCandidates")).toBe("vmScratch");
    expect(call("zfsNone", "zfsGetObjectDetails", { type: "Pool" })).toBe(
      "notFound",
    );
    expect(call("zfsNone", "zfsGetPoolDevices")).toEqual({
      status: 200,
      value: [],
    });
  });

  it.each([
    {
      type: "Snapshot",
      started: "snapshot",
      last: "zfsDeleteSnapshotFinished",
    },
    {
      type: "Filesystem",
      started: "filesystem",
      last: "zfsDeleteFilesystemFinished",
    },
    { type: "Pool", started: "pool", last: "zfsDeletePoolFinished" },
  ] as const)(
    "deleting a $type answers its handle, and its last poll follows",
    ({ type, started, last }) => {
      expect(call("zfsMirror", "zfsDeleteObjectBg", { type })).toBe(started);
      expect(
        call("zfsMirror", "execGetOutput", {
          filename: CONTRACT_EXAMPLES.zfsDeleteObjectBg[started].value,
          pos: 0,
        }),
      ).toBe(last);
    },
  );

  it.each([
    {
      operationId: "zfsAddPool",
      modules: ["collectd", "fstab", "monit", "quota"],
    },
    {
      operationId: "zfsAddObject",
      modules: ["collectd", "fstab", "monit", "quota"],
    },
    {
      operationId: "zfsDeleteObjectBg",
      modules: ["collectd", "fstab", "monit", "quota"],
    },
    {
      operationId: "zfsSetProperties",
      modules: ["collectd", "monit", "quota"],
    },
    { operationId: "zfsQuickSnapshot", modules: [] },
    { operationId: "zfsScrubPool", modules: [] },
    { operationId: "zfsDeviceReplace", modules: [] },
  ] as const)(
    "$operationId marks pending what the plugin marks",
    ({ operationId, modules }) => {
      const session = newMockSession(true);
      call("zfsMirror", operationId, { type: "Pool" }, session);
      expect(Object.keys(session.fsDirty).sort()).toEqual([...modules]);
    },
  );

  it("a refused write marks nothing pending", () => {
    const session = newMockSession(true);
    call("admin", "zfsAddPool", {}, session);
    expect(session.fsDirty).toEqual({});
  });
});
