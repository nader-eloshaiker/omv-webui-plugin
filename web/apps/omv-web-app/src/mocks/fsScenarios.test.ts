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
  finish(name, session, FS_HANDLES.create);
  return value<Rows>(call(name, session, "fileSystemMgmtGetMountCandidates"));
}

interface Poll {
  running: boolean;
  output: string;
}
/** Poll a task as the task helper does, until it ends; every answer, in order. */
function finish(
  name: ScenarioName,
  session: MockSession,
  filename: string,
): (string | FixedAnswer)[] {
  const answers: (string | FixedAnswer)[] = [];
  for (let i = 0; i < 10; i += 1) {
    const answer = call(name, session, "execGetOutput", { filename });
    answers.push(answer);
    if (
      typeof answer === "string" ||
      answer.status !== 200 ||
      !(answer.value as Poll).running
    ) {
      return answers;
    }
  }
  throw new Error("the task never ended");
}

const SDB = CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value.data[2];

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
    const made = candidates.find((c) => c.devicefile.includes("0761"));
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
      c.devicefile.includes("0761"),
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
      c.devicefile.includes("0761"),
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

  it("writes the partition first and fails the create on a later poll in fsCreateFails, as OMV does", () => {
    const session = newMockSession(true);
    call("fsCreateFails", session, "fileSystemMgmtCreate", {
      devicefile: SDD?.devicefile,
      type: "ext4",
    });
    const [first, last, ...rest] = finish(
      "fsCreateFails",
      session,
      FS_HANDLES.create,
    );
    expect(rest).toEqual([]);
    expect(first).toMatchObject({ status: 200, value: { running: true } });
    expect(((first as FixedAnswer).value as Poll).output).toMatch(
      /^Creating new GPT entries in memory\.\nDisk \/dev\/sdd: 16777216 sectors, 8\.0 GiB\n/,
    );
    expect(last).toMatchObject({
      status: 500,
      message:
        "Device '/dev/sdd1' is not available after a waiting period of 10 seconds.",
    });
    // Nothing was made, and the row being created is gone.
    expect(
      value<{ data: { status: number }[] }>(
        call("fsCreateFails", session, "fileSystemMgmtGetList"),
      ).data.some((r) => r.status === 2),
    ).toBe(false);
  });

  it("fails a BTRFS create with mkfs.btrfs's words for the chosen disks in fsCreateFails", () => {
    const session = newMockSession(true);
    call("fsCreateFails", session, "fileSystemMgmtCreateBtrfs", {
      profile: "raid0",
      devicefiles: `${String(SDB?.devicefile)},${String(SDD?.devicefile)}`,
    });
    const answers = finish("fsCreateFails", session, FS_HANDLES.createBtrfs);
    expect(answers).toHaveLength(2);
    expect((answers[1] as FixedAnswer).message).toMatch(
      /mkfs\.btrfs --force --data 'raid0' --metadata 'raid0' \/dev\/sdb \/dev\/sdd 2>&1'.*ERROR: unable to open \/dev\/sdd: Device or resource busy$/s,
    );
  });

  it.each([
    ["raid1", 8589934592],
    ["raid0", 2 * 8589934592],
    ["single", 2 * 8589934592],
  ])(
    "mounts a BTRFS %s of two 8 GiB disks with the size that profile holds",
    (profile, holds) => {
      const session = newMockSession(true);
      call("admin", session, "fileSystemMgmtCreateBtrfs", {
        profile,
        devicefiles: `${String(SDB?.devicefile)},${String(SDD?.devicefile)}`,
      });
      finish("admin", session, FS_HANDLES.createBtrfs);
      const made = value<Rows>(
        call("admin", session, "fileSystemMgmtGetMountCandidates"),
      ).find((c) => c.uuid.endsWith("0761"));
      expect(made).toBeDefined();
      call("admin", session, "fileSystemMgmtSetMountPoint", {
        id: made?.devicefile,
      });
      call("admin", session, "execGetOutput", { filename: APPLY });
      const row = value<{ data: (Rows[number] & { size: string })[] }>(
        call("admin", session, "fileSystemMgmtGetList"),
      ).data.find((r) => r.uuid === made?.uuid);
      expect(row?.mounted).toBe(true);
      expect(Number(row?.size)).toBe(Math.round(holds * 0.98));
    },
  );

  it.each(["fsVariety", "fsMany"] as const)(
    "gives every file system with a page in %s its mount entry, with the row's level and tags",
    (name) => {
      const session = newMockSession(true);
      const rows = value<{
        data: {
          devicefile: string;
          mountpoint: string;
          status: number;
          usagewarnthreshold: number;
          comment: string;
        }[];
      }>(call(name, session, "fileSystemMgmtGetList")).data.filter(
        (r) => r.mountpoint !== "/",
      );
      expect(rows.length).toBeGreaterThan(5);
      const uuids = new Set<string>();
      for (const row of rows) {
        const entry = value<{
          uuid: string;
          usagewarnthreshold: number;
          comment: string;
        }>(call(name, session, "fsTabGetByFsName", { fsname: row.devicefile }));
        expect(entry).toMatchObject({
          usagewarnthreshold: row.usagewarnthreshold,
          comment: row.comment,
        });
        uuids.add(entry.uuid);
      }
      expect(uuids.size).toBe(rows.length);
    },
  );
});
