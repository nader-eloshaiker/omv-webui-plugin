// SPDX-License-Identifier: GPL-3.0-or-later
// mke2fs's progress counters written with backspaces (observed on the VM) read as a terminal shows
// them.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { describe, expect, it } from "vitest";
import { replayBackspaces, taskLines } from "./terminal.ts";

describe("replayBackspaces", () => {
  it.each([
    ["plain", "plain"],
    ["ab\bc", "ac"],
    ["\b\bstart", "start"],
    [
      "Allocating group tables:  0/64\b\b\b\b\b     \b\b\b\b\bdone                            ",
      "Allocating group tables: done",
    ],
  ])("%j reads %j", (line, want) => {
    expect(replayBackspaces(line)).toBe(want);
  });
});

describe("taskLines", () => {
  it("splits the captured mke2fs output into lines with no backspace left", () => {
    const lines = taskLines(
      CONTRACT_EXAMPLES.execGetOutput.createExt4Finished.value.output,
    );
    expect(lines.some((l) => l.includes("\b"))).toBe(false);
    expect(lines).toContain("Writing inode tables: done");
    expect(lines.at(-1)).toBe("");
    expect(taskLines("")).toEqual([]);
  });
});
