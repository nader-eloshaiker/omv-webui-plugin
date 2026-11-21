// SPDX-License-Identifier: GPL-3.0-or-later
import { RpcError } from "@omv-webui/react-api-omv/transport";
import { describe, expect, it } from "vitest";
import { elapsedParts, emptyOutputKey, taskLines } from "./taskView.ts";

describe("elapsedParts", () => {
  it.each([
    [0, 0, 0],
    [999, 0, 0],
    [59_999, 0, 59],
    [135_000, 2, 15],
    [-5, 0, 0],
  ])("%i ms is %i min %i s", (ms, minutes, seconds) => {
    expect(elapsedParts(ms)).toEqual({ minutes, seconds });
  });
});

describe("taskLines", () => {
  it("splits output into lines and drops the trailing empty one", () => {
    expect(taskLines("a\nb\n")).toEqual(["a", "b"]);
    expect(taskLines("")).toEqual([]);
  });

  it("puts a failure's message after the output", () => {
    expect(taskLines("step 1\n", "it broke\nhere")).toEqual([
      "step 1",
      "it broke",
      "here",
    ]);
    expect(taskLines("", "it broke")).toEqual(["it broke"]);
  });
});

describe("emptyOutputKey", () => {
  const error = (operationId: string) =>
    new RpcError({ status: 500, code: 0, message: "it broke", operationId });

  it.each([
    ["running", "tasks.waiting", undefined],
    ["done", "tasks.noOutput", undefined],
    ["stopped", "tasks.noOutput", undefined],
    // OMV answers Exec.getOutput with the task's error once it has failed, so its output is unread.
    ["failed", "tasks.outputUnread", error("execGetOutput")],
    ["failed", "tasks.outputUnread", undefined],
    // The call that starts the task failed: nothing ran.
    ["failed", "tasks.notStarted", error("fileSystemMgmtCreate")],
  ] as const)("a %s task says %s", (state, key, failure) => {
    expect(emptyOutputKey({ state, error: failure })).toBe(key);
  });
});
