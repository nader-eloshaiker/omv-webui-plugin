// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { blockLayout, losesDataOnOneFailure } from "./arrangement-model";

describe("the blocks on the disks", () => {
  it("copies every block to every disk in a mirror", () => {
    expect(blockLayout("mirror", 2)).toEqual([
      ["A", "A"],
      ["B", "B"],
      ["C", "C"],
    ]);
  });

  it("spreads the blocks across the disks in a stripe", () => {
    expect(blockLayout("stripe", 2)).toEqual([
      ["A", "B"],
      ["C", "D"],
      ["E", "F"],
    ]);
  });

  it("rotates one parity block per row across the disks", () => {
    expect(blockLayout("parity", 3)).toEqual([
      ["A", "B", null],
      ["C", null, "D"],
      [null, "E", "F"],
    ]);
    for (const row of blockLayout("parity", 5)) {
      expect(row.filter((b) => b === null)).toHaveLength(1);
    }
  });

  it("loses data on one failure only in a stripe", () => {
    expect(losesDataOnOneFailure("stripe")).toBe(true);
    expect(losesDataOnOneFailure("mirror")).toBe(false);
    expect(losesDataOnOneFailure("parity")).toBe(false);
  });
});
