// SPDX-License-Identifier: GPL-3.0-or-later
// The remembering RAID mock (phase 5 RAID design 14): its written reports read as the captured ones do,
// and it remembers creates, adds, removals, checks and deletes, with the kernel's work moving on.
import type { MdArray } from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { describe, expect, it } from "vitest";
import { arrayState, readReport } from "../raid/raidModel.ts";
import {
  detailOf,
  newRaidMockState,
  RAID_SCENARIOS,
  raidAnswers,
  raidWiped,
  rowOf,
} from "./raidScenarios.ts";

const hooks = () => {
  const dirty: string[] = [];
  return {
    dirty,
    hooks: {
      dirty: (m: readonly string[]) => dirty.push(...m),
      offerForFs: () => undefined,
      mounted: () => false,
    },
  };
};
const value = (a: FixedAnswer) => a.value;

describe("the RAID mock", () => {
  it.each(
    RAID_SCENARIOS.filter(
      (n) => n !== "raidNoPlugin" && n !== "raidDetailFails",
    ),
  )("%s: every report reads, and agrees with the row", (name) => {
    const state = newRaidMockState(name);
    for (const a of state.arrays) {
      const row = rowOf(a);
      const report = readReport(detailOf(a), row.devices);
      expect(report.known, `${name} ${a.devicefile}`).toBe(true);
    }
  });

  it("reads a failed member once, as Failed, as on the VM", () => {
    const [a] = newRaidMockState("raidRaid6TwoFailed").arrays;
    const report = a === undefined ? null : readReport(detailOf(a));
    expect(
      report?.known && [report.failed, report.missing, report.working],
    ).toEqual([2, 0, 2]);
  });

  it("creates a mirror that synchronises and ends, and offers its disks no more", () => {
    const state = newRaidMockState("admin");
    const { dirty, hooks: h } = hooks();
    const answers = raidAnswers("admin", state, h);
    const created = value(
      answers.mdMgmtCreate?.({
        params: {
          devices: ["/dev/sdb", "/dev/sdc"],
          name: "",
          level: "mirror",
        },
      }) as FixedAnswer,
    ) as { devicefile: string; level: string };
    expect(created.devicefile).toBe("/dev/md0");
    expect(created.level).toBe("mirror");
    expect(dirty).toEqual(["mdadm", "initramfs"]);
    expect(state.free).toEqual(["/dev/sdd"]);
    const rows = () =>
      value(
        answers.mdMgmtEnumerateDevices?.({ params: {} }) as FixedAnswer,
      ) as MdArray[];
    expect(arrayState(rows()[0] as MdArray).kind).toBe("resyncing");
    for (let i = 0; i < 10; i += 1) {
      rows();
    }
    expect(arrayState(rows()[0] as MdArray).kind).toBe("ok");
  });

  it("takes a working disk out (degraded), and offers it again only once wiped", () => {
    const state = newRaidMockState("raidMirror");
    const answers = raidAnswers("raidMirror", state, hooks().hooks);
    answers.mdMgmtRemove?.({
      params: { devicefile: "/dev/md0", devices: ["/dev/sdb"] },
    });
    const [a] = state.arrays;
    expect(a && arrayState(rowOf(a), readReport(detailOf(a))).kind).toBe(
      "degraded",
    );
    expect(state.free).not.toContain("/dev/sdb");
    raidWiped(state, "/dev/sdb");
    expect(state.free).toContain("/dev/sdb");
    answers.mdMgmtAdd?.({
      params: { devicefile: "/dev/md0", devices: ["/dev/sdb"] },
    });
    expect(a && arrayState(rowOf(a), readReport(detailOf(a))).kind).toBe(
      "rebuilding",
    );
  });

  it("refuses to delete an array whose file system is mounted, changing nothing", () => {
    const state = newRaidMockState("raidMirror");
    const { dirty, hooks: h } = hooks();
    const answers = raidAnswers("raidMirror", state, {
      ...h,
      mounted: () => true,
    });
    const reply = answers.mdMgmtDelete?.({
      params: { devicefile: "/dev/md0" },
    });
    expect(reply?.status).toBe(500);
    expect(state.arrays).toHaveLength(1);
    expect(dirty).toEqual([]);
  });

  it("checks a mirror, and refuses a check on a stripe", () => {
    const state = newRaidMockState("raidStripe");
    const answers = raidAnswers("raidStripe", state, hooks().hooks);
    expect(
      answers.mdMgmtSetSyncAction?.({
        params: { devicefile: "/dev/md0", action: "check" },
      }).status,
    ).toBe(500);
    const mirror = newRaidMockState("raidMirror");
    raidAnswers("raidMirror", mirror, hooks().hooks).mdMgmtSetSyncAction?.({
      params: { devicefile: "/dev/md0", action: "check" },
    });
    const [a] = mirror.arrays;
    expect(a && arrayState(rowOf(a)).kind).toBe("checking");
  });

  it("grows a RAID5, bigger only when the reshape ends", () => {
    const state = newRaidMockState("raidRaid5");
    state.free.push("/dev/sde");
    const answers = raidAnswers("raidRaid5", state, hooks().hooks);
    answers.mdMgmtGrow?.({
      params: { devicefile: "/dev/md0", devices: ["/dev/sde"] },
    });
    const [a] = state.arrays;
    const before = a?.size;
    expect(a && arrayState(rowOf(a)).kind).toBe("reshaping");
    for (let i = 0; i < 10; i += 1) {
      answers.mdMgmtEnumerateDevices?.({ params: {} });
    }
    expect(a?.size).toBeGreaterThan(before ?? 0);
  });

  it("answers the 404 for every read without the plugin", () => {
    const answers = raidAnswers(
      "raidNoPlugin",
      newRaidMockState("raidNoPlugin"),
      hooks().hooks,
    );
    expect(answers.mdMgmtGetCandidates?.({ params: {} }).status).toBe(404);
    expect(answers.mdMgmtEnumerateDevices?.({ params: {} }).status).toBe(404);
  });
});
