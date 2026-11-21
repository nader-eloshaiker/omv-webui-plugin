// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { typedMatches } from "./typed-matches";

describe("typedMatches", () => {
  it.each([
    // One name: exact, case-sensitive, surrounding spaces ignored (unchanged).
    ["/dev/sdb", "/dev/sdb", true],
    ["  /dev/sdb  ", "/dev/sdb", true],
    ["\t/dev/sdb\n", "/dev/sdb", true],
    ["/DEV/SDB", "/dev/sdb", false],
    ["/dev/sd", "/dev/sdb", false],
    ["/dev/sdbb", "/dev/sdb", false],
    ["", "/dev/sdb", false],
    ["   ", "/dev/sdb", false],
    ["/dev/ sdb", "/dev/sdb", false],
    ["media", "media", true],
    ["Media", "media", false],
    // A name with a space inside it.
    ["Family photos", "Family photos", true],
    ["Family   photos", "Family photos", true],
    ["Familyphotos", "Family photos", false],
    // A name that itself holds a run of spaces still matches when typed as it is.
    ["Old  backup", "Old  backup", true],
    // Two names.
    ["/dev/sdb /dev/sdc", "/dev/sdb /dev/sdc", true],
    ["/dev/sdb   /dev/sdc", "/dev/sdb /dev/sdc", true],
    ["  /dev/sdb /dev/sdc  ", "/dev/sdb /dev/sdc", true],
    ["/dev/sdb\t/dev/sdc", "/dev/sdb /dev/sdc", true],
    ["/dev/sdc /dev/sdb", "/dev/sdb /dev/sdc", false],
    ["/dev/sdb/dev/sdc", "/dev/sdb /dev/sdc", false],
    ["/dev/sdb", "/dev/sdb /dev/sdc", false],
    ["/DEV/SDB /DEV/SDC", "/dev/sdb /dev/sdc", false],
    ["/dev/sdb, /dev/sdc", "/dev/sdb /dev/sdc", false],
    // Four names.
    [
      "/dev/sdb /dev/sdc /dev/sdd /dev/sde",
      "/dev/sdb /dev/sdc /dev/sdd /dev/sde",
      true,
    ],
    [
      " /dev/sdb  /dev/sdc    /dev/sdd /dev/sde ",
      "/dev/sdb /dev/sdc /dev/sdd /dev/sde",
      true,
    ],
    [
      "/dev/sdb /dev/sdc /dev/sde /dev/sdd",
      "/dev/sdb /dev/sdc /dev/sdd /dev/sde",
      false,
    ],
    [
      "/dev/sdb /dev/sdc /dev/sdd",
      "/dev/sdb /dev/sdc /dev/sdd /dev/sde",
      false,
    ],
  ])("%j against %j is %s", (value, confirmText, expected) => {
    expect(typedMatches(value, confirmText)).toBe(expected);
  });
});
