// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { elapsedParts, taskLines } from "./taskView.ts";

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
