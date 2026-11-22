// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { groupHasPage } from "./groupPage.ts";

describe("a group's page address (9, 14.2)", () => {
  it("has one, except where a static route takes the address or the name cannot be one", () => {
    expect(groupHasPage("family")).toBe(true);
    expect(groupHasPage("Family.2$")).toBe(true);
    expect(groupHasPage("add")).toBe(false);
    expect(groupHasPage("")).toBe(false);
    expect(groupHasPage("a/b")).toBe(false);
  });
});
