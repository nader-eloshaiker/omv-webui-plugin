// SPDX-License-Identifier: GPL-3.0-or-later
// The remembering file-system mock (fsScenarios.ts): the story Flow A walks, told call by call, as the
// test VM showed it. Create makes a mount candidate, setting up its mount adds the row and the entry and
// marks the four modules pending, the apply mounts it, an undo forgets the entry, and unmounting returns
// it to the candidates with the three modules pending.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { describe, expect, it } from "vitest";
import { FS_HANDLES } from "./fsScenarios.ts";
import {
  newMockSession,
  scenarioAnswers,
  type MockSession,
  type ScenarioName,
} from "./scenarios.ts";

type Rows = { devicefile: string; mounted: boolean; uuid: string }[];
const SDD = CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value.data[4];
const APPLY = CONTRACT_EXAMPLES.execGetOutput.appliedFinished.value.filename;
const REVERT = CONTRACT_EXAMPLES.execGetOutput.revertedFinished.value.filename;

function call(
  name: ScenarioName,
  session: MockSession,
  operationId: string,
  params: unknown = {},
): string | FixedAnswer {
  const answers = scenarioAnswers(name, session) as Record<
    string,
    | ((c: { params: unknown; options: unknown }) => string | FixedAnswer)
    | string
    | FixedAnswer
  >;
  const answer = answers[operationId];
  if (answer === undefined) {
    throw new Error(operationId);
  }
  return typeof answer === "function"
    ? answer({ params, options: undefined })
    : answer;
}
const value = <T>(answer: string | FixedAnswer): T =>
  (answer as FixedAnswer).value as T;
const pending = (name: ScenarioName, session: MockSession) =>
  Object.keys(
    value<{ dirtyModules: object }>(call(name, session, "systemGetInformation"))
      .dirtyModules,
  ).sort();

function createOnSdd(name: ScenarioName, session: MockSession) {
  call(name, session, "fileSystemMgmtCreate", {
    devicefile: SDD?.devicefile,
    type: "ext4",
  });
  const creating = value<{ data: { status: number }[] }>(
    call(name, session, "fileSystemMgmtGetList"),
  ).data;
  expect(creating.some((r) => r.status === 2)).toBe(true);
  call(name, session, "execGetOutput", { filename: FS_HANDLES.create });
  return value<Rows>(call(name, session, "fileSystemMgmtGetMountCandidates"));
}

describe("the remembering file-system mock", () => {
  it("tells Flow A's story: create, set up, apply, then unmount", () => {
    const session = newMockSession(true);
    const free = value<{ output: string }>(
      call("admin", session, "execGetOutput", {
        filename: FS_HANDLES.candidates,
      }),
    );
    expect(
      (JSON.parse(free.output) as { devicefile: string }[]).map(
        (c) => c.devicefile,
      ),
    ).toEqual(["/dev/sdb", "/dev/sdc", "/dev/sdd"]);
    const candidates = createOnSdd("admin", session);
    const made = candidates.find((c) => c.devicefile.includes("0701"));
    expect(made).toBeDefined();
    call("admin", session, "fileSystemMgmtSetMountPoint", {
      id: made?.devicefile,
      usagewarnthreshold: 85,
      comment: "Media",
    });
    expect(pending("admin", session)).toEqual([
      "collectd",
      "fstab",
      "monit",
      "quota",
    ]);
    let rows = value<{ data: Rows }>(
      call("admin", session, "fileSystemMgmtGetList"),
    ).data;
    expect(rows.find((r) => r.uuid === made?.uuid)?.mounted).toBe(false);
    expect(
      value(
        call("admin", session, "fsTabGetByFsName", {
          fsname: made?.devicefile,
        }),
      ),
    ).toMatchObject({ comment: "Media", usagewarnthreshold: 85 });
    call("admin", session, "execGetOutput", { filename: APPLY });
    rows = value<{ data: Rows }>(
      call("admin", session, "fileSystemMgmtGetList"),
    ).data;
    const mounted = rows.find((r) => r.uuid === made?.uuid) as unknown as {
      mounted: boolean;
      mountpoint: string;
    };
    expect(mounted.mounted).toBe(true);
    expect(pending("admin", session)).toEqual([]);
    call("admin", session, "fileSystemMgmtUmountByDir", {
      dir: mounted.mountpoint,
    });
    expect(pending("admin", session)).toEqual(["collectd", "monit", "quota"]);
    expect(
      value<Rows>(
        call("admin", session, "fileSystemMgmtGetMountCandidates"),
      ).map((c) => c.uuid),
    ).toContain(made?.uuid);
  });

  it("forgets a mount that was set up and undone, and finds it on the disk again", () => {
    const session = newMockSession(true);
    const made = createOnSdd("admin", session).find((c) =>
      c.devicefile.includes("0701"),
    );
    call("admin", session, "fileSystemMgmtSetMountPoint", {
      id: made?.devicefile,
    });
    call("admin", session, "execGetOutput", { filename: REVERT });
    expect(
      value<{ data: Rows }>(
        call("admin", session, "fileSystemMgmtGetList"),
      ).data.map((r) => r.uuid),
    ).not.toContain(made?.uuid);
    expect(
      value<Rows>(
        call("admin", session, "fileSystemMgmtGetMountCandidates"),
      ).map((c) => c.uuid),
    ).toContain(made?.uuid);
  });

  it("fails the first apply in fsApplyFails, and mounts on the second", () => {
    const session = newMockSession(true);
    const made = createOnSdd("fsApplyFails", session).find((c) =>
      c.devicefile.includes("0701"),
    );
    call("fsApplyFails", session, "fileSystemMgmtSetMountPoint", {
      id: made?.devicefile,
    });
    expect(
      call("fsApplyFails", session, "execGetOutput", { filename: APPLY }),
    ).toBe("applyFailed");
    expect(
      call("fsApplyFails", session, "execGetOutput", { filename: APPLY }),
    ).toBe("appliedFinished");
  });

  it("marks NFS pending too in fsAlsoPending (R10)", () => {
    const session = newMockSession(true);
    const made = createOnSdd("fsAlsoPending", session)[1];
    call("fsAlsoPending", session, "fileSystemMgmtSetMountPoint", {
      id: made?.devicefile,
    });
    expect(pending("fsAlsoPending", session)).toContain("nfs");
  });

  it("answers a busy unmount with the server's words and changes nothing", () => {
    const session = newMockSession(true);
    const answer = call("fsBusy", session, "fileSystemMgmtUmountByDir", {
      dir: "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000702",
    });
    expect(answer).toMatchObject({ status: 500 });
    expect((answer as FixedAnswer).message).toMatch(/target is busy\./);
    expect(pending("fsBusy", session)).toEqual([]);
  });

  it("answers 401 before sign-in, without touching the state", () => {
    const session = newMockSession(false);
    expect(call("admin", session, "fileSystemMgmtGetList")).toMatchObject({
      status: 401,
    });
  });
});
