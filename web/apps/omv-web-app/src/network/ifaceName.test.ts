// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { isInterfaceName } from "./ifaceName.ts";

describe("isInterfaceName", () => {
  it.each([
    "enp2s0",
    "bond0",
    "bond0.10",
    "br0",
    "wlp3s0",
    "enx00005e005301",
    "a",
    "eth-1_x",
  ])("takes %s", (name) => {
    expect(isInterfaceName(name)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["16 characters", "enx00005e0053011"],
    ["a slash", "eth0/1"],
    ["a colon", "eth0:1"],
    ["a space", "eth 0"],
    ["a dot", "."],
    ["two dots", ".."],
    ["a control character", "eth\u00000"],
    ["a line break", "eth0\n"],
    ["markup", "<b>x</b>"],
    ["non-ASCII", "eth‮0"],
  ])("refuses %s", (_label, name) => {
    expect(isInterfaceName(name)).toBe(false);
  });
});
