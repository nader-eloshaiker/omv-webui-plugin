// SPDX-License-Identifier: GPL-3.0-or-later
// Task results in the contract's examples. A task's result travels as JSON text in the last
// Exec.getOutput poll, where lint sees only a string; these tests hold each such example to the
// result schema its task declares (x-omv-task), and follow one task through the registry.
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { OPERATIONS, SCHEMAS } from "../contract/generated/operations.ts";
import type { OperationTable } from "../contract/types.ts";
import { CONTRACT_EXAMPLES } from "../examples/generated/examples.ts";
import { diskMgmtWipe } from "../generated/omv/disk-mgmt/disk-mgmt.ts";
import {
  smartExecuteScheduledTest,
  smartGetListBg,
} from "../generated/omv/smart/smart.ts";
import { createRpcHandlers } from "../mocks/handlers.ts";
import { validate } from "../transport/schema.ts";
import { createTaskRegistry } from "./registry.ts";

type PollExample = keyof typeof CONTRACT_EXAMPLES.execGetOutput;

/** Which task each last-poll example finishes: the operation that started it. */
const FINISHES = {
  appliedFinished: "configApplyChangesBg",
  revertedFinished: "configRevertChangesBg",
  smartDevicesFinished: "smartGetListBg",
  smartManyBadSectorsFinished: "smartGetListBg",
  smartStatusUnknownFinished: "smartGetListBg",
  wipeFinished: "diskMgmtWipe",
  selfTestFinished: "smartExecuteScheduledTest",
  fsCandidatesFinished: "fileSystemMgmtGetCandidatesBg",
  fsCandidatesNoneFinished: "fileSystemMgmtGetCandidatesBg",
  createExt4Finished: "fileSystemMgmtCreate",
  createBtrfsRaid1Finished: "fileSystemMgmtCreateBtrfs",
  zfsDeleteSnapshotFinished: "zfsDeleteObjectBg",
  zfsDeleteFilesystemFinished: "zfsDeleteObjectBg",
  zfsDeletePoolFinished: "zfsDeleteObjectBg",
  rsyncRunFinished: "rsyncExecute",
  rsyncTrialFinished: "rsyncExecute",
  rsyncPullRsyncdFinished: "rsyncExecute",
  emptyRecycleBinFinished: "smbEmptyRecycleBin",
  emptyRecycleBinNothingFinished: "smbEmptyRecycleBin",
  identifyFinished: "networkIdentify",
} as const satisfies Partial<Record<PollExample, string>>;

/** Tasks with no result whose output is a log to show: the commands' text, never parsed. */
const LOG_OUTPUT: ReadonlySet<keyof typeof FINISHES> = new Set([
  "wipeFinished",
  "selfTestFinished",
  "createExt4Finished",
  "createBtrfsRaid1Finished",
  "rsyncRunFinished",
  "rsyncTrialFinished",
  "rsyncPullRsyncdFinished",
  "emptyRecycleBinFinished",
  "emptyRecycleBinNothingFinished",
]);

// The table, widened to its declared shape so every entry may carry a task.
const TABLE: OperationTable = OPERATIONS;
const resultSchemaOf = (operationId: string): string | undefined =>
  Object.values(TABLE).find((op) => op.operationId === operationId)?.task
    ?.result;

describe("task result examples", () => {
  it("every successful last poll is listed with the task it finishes", () => {
    const finished = Object.entries(CONTRACT_EXAMPLES.execGetOutput)
      .filter(([, ex]) => ex.status === 200 && !ex.value.running)
      .map(([name]) => name)
      .sort();
    expect(finished).toEqual(Object.keys(FINISHES).sort());
  });

  it.each(Object.entries(FINISHES))(
    "%s matches the result schema of %s",
    (name, operationId) => {
      const example =
        CONTRACT_EXAMPLES.execGetOutput[name as keyof typeof FINISHES];
      const resultSchema = resultSchemaOf(operationId);
      if (resultSchema === undefined) {
        // A task without a result schema has no result to check: an undo, or a port's light
        // blinked, prints nothing; a wipe or a self-test prints a log.
        if (LOG_OUTPUT.has(name as keyof typeof FINISHES)) {
          expect(example.value.output).not.toBe("");
        } else {
          expect(example.value.output).toBe("");
        }
        return;
      }
      const schema = SCHEMAS[resultSchema];
      expect(schema, resultSchema).toBeDefined();
      if (schema) {
        expect(
          validate(
            JSON.parse(example.value.output) as unknown,
            schema,
            SCHEMAS,
          ),
        ).toEqual([]);
      }
    },
  );
});

describe("the disk health task through the registry", () => {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it.each([
    {
      example: "smartDevicesFinished",
      statuses: [
        "GOOD",
        "BAD_STATUS",
        "BAD_STATUS",
        "BAD_STATUS",
        "BAD_STATUS",
      ],
    },
    {
      example: "smartManyBadSectorsFinished",
      statuses: ["GOOD", "BAD_SECTOR_MANY"],
    },
    { example: "smartStatusUnknownFinished", statuses: ["GOOD", "BAD_STATUS"] },
  ] as const)(
    "$example: the task's result is the parsed list of disks",
    async ({ example, statuses }) => {
      server.use(
        ...createRpcHandlers({
          smartGetListBg: "smartDevices",
          execGetOutput: example,
        }),
      );
      const registry = createTaskRegistry(() => Promise.resolve());
      const id = registry.start("Checking disk health", () =>
        smartGetListBg({ start: 0, limit: null }),
      );
      const settled = await new Promise((resolve) => {
        registry.onSettled(resolve);
      });
      expect(settled).toMatchObject({ id, state: "done" });
      const result = registry.get(id)?.result as {
        total: number;
        data: { overallstatus: string }[];
      };
      expect(result.total).toBe(statuses.length);
      expect(result.data.map((d) => d.overallstatus)).toEqual(statuses);
    },
  );
});

describe("the wipe and self-test tasks through the registry", () => {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  const wipe = () => diskMgmtWipe({ devicefile: "/dev/sda", secure: false });
  const selfTest = () =>
    smartExecuteScheduledTest({
      uuid: "00000000-0000-4000-8000-000000000201",
    });

  it.each([
    {
      task: "a quick wipe",
      begin: wipe,
      answers: { diskMgmtWipe: "started", execGetOutput: "wipeFinished" },
      state: "done",
      text: "GPT data structures destroyed!",
    },
    {
      task: "a wipe of a disk in use",
      begin: wipe,
      answers: { diskMgmtWipe: "started", execGetOutput: "wipeFailed" },
      state: "failed",
      text: "Device or resource busy",
    },
    {
      task: "a self-test",
      begin: selfTest,
      answers: {
        smartExecuteScheduledTest: "started",
        execGetOutput: "selfTestFinished",
      },
      state: "done",
      text: "Testing has begun.",
    },
    {
      task: "a self-test whose disk has no monitoring settings",
      begin: selfTest,
      answers: {
        smartExecuteScheduledTest: "noDeviceSettings",
        execGetOutput: "selfTestFinished",
      },
      state: "failed",
      text: "does not return the requested number of 1 object(s)",
    },
  ] as const)(
    "$task ends $state, with a log and no result",
    async ({ begin, answers, state, text }) => {
      server.use(...createRpcHandlers(answers));
      const registry = createTaskRegistry(() => Promise.resolve());
      const id = registry.start("Working", begin);
      const settled = await new Promise((resolve) => {
        registry.onSettled(resolve);
      });
      expect(settled).toMatchObject({ id, state });
      const task = registry.get(id);
      expect(task?.result).toBeUndefined();
      const shown =
        state === "done" ? task?.output : (task?.error?.message ?? "");
      expect(shown).toContain(text);
    },
  );
});
