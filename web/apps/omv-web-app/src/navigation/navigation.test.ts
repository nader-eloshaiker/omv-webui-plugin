// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { findNavPage, NAV_PAGES, navFor } from "./navigation.ts";

describe("navFor", () => {
  it("gives an administrator every group, in the stock order, without the user-only account settings", () => {
    const nav = navFor("admin");
    expect(nav.map((g) => g.group)).toEqual([
      "system",
      "network",
      "storage",
      "services",
      "usermgmt",
      "diagnostics",
      "account",
    ]);
    expect(nav.at(-1)?.pages.map((p) => p.item)).toEqual(["password"]);
  });

  it("gives a normal user only their account, as the stock interface does", () => {
    const nav = navFor("user");
    expect(nav).toHaveLength(1);
    expect(nav[0]?.group).toBe("account");
    expect(nav[0]?.pages.map((p) => p.item)).toEqual(["settings", "password"]);
  });
});

describe("findNavPage", () => {
  it("selects a page only from the table", () => {
    expect(findNavPage("services", "ssh")?.classic).toBe("/services/ssh");
    expect(findNavPage("services", "telnet")).toBeUndefined();
    expect(findNavPage("constructor", "toString")).toBeUndefined();
    expect(findNavPage("__proto__", "x")).toBeUndefined();
  });
});

describe("the table", () => {
  it("names each classic page as a path on this server, matching its own route", () => {
    for (const page of NAV_PAGES) {
      expect(page.classic).toBe(`/${page.group}/${page.item}`);
      expect(page.labelKey).toBe(`nav.items.${page.group}.${page.item}`);
    }
  });
});
