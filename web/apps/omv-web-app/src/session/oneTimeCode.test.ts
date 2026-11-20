// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { codeOf } from "./oneTimeCode.ts";

describe("codeOf", () => {
  it.each([
    ["123456", "123456"],
    ["123 456", "123456"],
    [" 123456\n", "123456"],
    ["12345", null],
    ["1234567", null],
    ["12a456", null],
    ["", null],
  ])("%j is %j", (input, code) => {
    expect(codeOf(input)).toBe(code);
  });
});
