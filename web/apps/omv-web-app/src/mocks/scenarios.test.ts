// SPDX-License-Identifier: GPL-3.0-or-later
// The mock's wiring: every scenario answers every operation of the contract, nothing outside
// Session answers before sign-in, and every answer names an example the contract has.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { describe, expect, it } from "vitest";
import {
  SCENARIOS,
  newMockSession,
  scenarioAnswers,
  startsDirty,
  type MockSession,
  type ScenarioName,
} from "./scenarios.ts";

type OperationId = keyof typeof CONTRACT_EXAMPLES;
type AnyAnswer =
  | string
  | FixedAnswer
  | ((call: { params: unknown; options: unknown }) => string | FixedAnswer);

const OPERATION_IDS = Object.keys(CONTRACT_EXAMPLES) as OperationId[];

/** The answer of one operation in a scenario, to a call with these params. */
function answerOf(
  scenario: ScenarioName,
  session: MockSession,
  operationId: OperationId,
  params: unknown = {},
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

const exampleNames = (operationId: OperationId): string[] =>
  Object.keys(CONTRACT_EXAMPLES[operationId]);

describe("the mock scenarios", () => {
  it.each(SCENARIOS)("%s answers every operation of the contract", (name) => {
    const answered = Object.keys(scenarioAnswers(name, newMockSession(true)));
    expect(answered.sort()).toEqual([...OPERATION_IDS].sort());
  });

  it.each(OPERATION_IDS.filter((id) => !id.startsWith("session")))(
    "%s answers 401 before sign-in",
    (operationId) => {
      expect(
        answerOf("admin", newMockSession(false), operationId),
      ).toMatchObject({ status: 401 });
    },
  );

  it.each(OPERATION_IDS)(
    "%s answers with an example the contract has, once signed in",
    (operationId) => {
      const answer = answerOf("admin", newMockSession(true), operationId);
      if (typeof answer === "string") {
        expect(exampleNames(operationId)).toContain(answer);
      } else {
        expect(answer).toMatchObject({ status: expect.any(Number) });
      }
    },
  );

  it.each([
    { id: "syslog", want: "syslog" },
    { id: "apt_term", want: "updates" },
    { id: "smbdaudit", want: "smbAudit" },
    { id: "auth", want: "empty" },
    { id: "no-such-log", want: "unknownLog" },
    { id: undefined, want: "unknownLog" },
  ])("logFileGetList for the log $id answers $want", ({ id, want }) => {
    expect(
      answerOf("admin", newMockSession(true), "logFileGetList", {
        start: 0,
        limit: null,
        id,
      }),
    ).toBe(want);
  });

  it.each([
    {
      handle: CONTRACT_EXAMPLES.smartGetListBg.smartDevices.value,
      want: "smartDevicesFinished",
    },
    {
      handle: CONTRACT_EXAMPLES.execGetOutput.appliedFinished.value.filename,
      want: "appliedFinished",
    },
    {
      handle: CONTRACT_EXAMPLES.diskMgmtWipe.started.value,
      want: "wipeFinished",
    },
    {
      handle: CONTRACT_EXAMPLES.smartExecuteScheduledTest.started.value,
      want: "selfTestFinished",
    },
  ])(
    "execGetOutput for the handle $handle answers $want",
    ({ handle, want }) => {
      expect(
        answerOf("admin", newMockSession(true), "execGetOutput", {
          filename: handle,
          pos: 0,
        }),
      ).toBe(want);
    },
  );

  it.each([
    "diskMgmtSetHdParm",
    "smartSetSettings",
    "smartSetDeviceSettings",
    "smartSetScheduledTest",
    "smartDeleteScheduledTest",
  ] as const)("%s leaves its change pending", (operationId) => {
    const session = newMockSession(true);
    answerOf("admin", session, operationId);
    expect(answerOf("admin", session, "configIsDirty")).toBe("dirty");
  });

  it.each([
    "diskMgmtWipe",
    "diskMgmtRescan",
    "smartExecuteScheduledTest",
  ] as const)("%s leaves nothing pending", (operationId) => {
    const session = newMockSession(true);
    answerOf("admin", session, operationId);
    expect(answerOf("admin", session, "configIsDirty")).toBe("clean");
  });

  it.each([
    { dirty: false, want: "noConnections" },
    { dirty: true, want: "pendingChanges" },
  ])(
    "sshGetStats with changes pending: $dirty answers $want",
    ({ dirty, want }) => {
      expect(
        answerOf("admin", newMockSession(true, dirty), "sshGetStats"),
      ).toBe(want);
    },
  );

  it("servicePending starts with SMB/CIFS saved and not applied, and SSH's details readable", () => {
    const session = newMockSession(true, startsDirty("servicePending"));
    const info = answerOf("servicePending", session, "systemGetInformation");
    expect(info).toMatchObject({
      status: 200,
      value: { dirtyModules: { samba: expect.any(String) } },
    });
    expect(answerOf("servicePending", session, "smbGetStats")).toBe(
      "pendingChanges",
    );
    expect(answerOf("servicePending", session, "sshGetStats")).toBe(
      "noConnections",
    );
  });

  it.each([
    "disksAllGood",
    "disksMixed",
    "disksEmpty",
    "disksUnrecognised",
  ] as const)("%s ends its disk-health task with a list of disks", (name) => {
    const answer = answerOf(name, newMockSession(true), "execGetOutput", {
      filename: CONTRACT_EXAMPLES.smartGetListBg.smartDevices.value,
      pos: 0,
    }) as FixedAnswer;
    const output = (answer.value as { output: string }).output;
    const list = JSON.parse(output) as { total: number; data: unknown[] };
    expect(list.total).toBe(list.data.length);
  });

  it("logsLarge answers the syslog with 5,000 entries, newest first", () => {
    const answer = answerOf(
      "logsLarge",
      newMockSession(true),
      "logFileGetList",
      {
        id: "syslog",
        start: 0,
        limit: null,
      },
    ) as FixedAnswer;
    const value = answer.value as { total: number; data: { rownum: number }[] };
    expect(value.total).toBe(5000);
    expect(value.data[0]?.rownum).toBe(4999);
  });
});
