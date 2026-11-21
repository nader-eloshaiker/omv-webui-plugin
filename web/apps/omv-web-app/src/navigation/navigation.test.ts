// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  builtRoute,
  CLASSIC,
  CLASSIC_HOME,
  CLASSIC_HTTPS_SETTINGS,
  findNavPage,
  isCurrent,
  NAV_PAGES,
  navFor,
} from "./navigation.ts";

describe("navFor", () => {
  it("gives an administrator every group, in the stock order, with one account item", () => {
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
    expect(nav.at(-1)?.pages.map((p) => p.item)).toEqual(["settings"]);
  });

  it("gives a normal user only their account", () => {
    const nav = navFor("user");
    expect(nav).toHaveLength(1);
    expect(nav[0]?.group).toBe("account");
    expect(nav[0]?.pages.map((p) => p.item)).toEqual(["settings"]);
  });
});

describe("findNavPage", () => {
  it("selects a page only from the table", () => {
    expect(findNavPage("services", "nfs")?.classic).toBe("/#/services/nfs");
    expect(findNavPage("services", "telnet")).toBeUndefined();
    expect(findNavPage("constructor", "toString")).toBeUndefined();
    expect(findNavPage("__proto__", "x")).toBeUndefined();
    expect(findNavPage("account", "password")).toBeUndefined();
  });
});

describe("the table", () => {
  it("names each classic page in the hash form the classic interface routes by", () => {
    for (const page of NAV_PAGES) {
      // System logs names its "Logs" sub-page: the stock group page has two.
      expect(page.classic).toBe(
        page.item === "system-logs"
          ? "/#/diagnostics/system-logs/logs"
          : `/#/${page.group}/${page.item}`,
      );
      expect(page.labelKey).toBe(`nav.items.${page.group}.${page.item}`);
    }
  });

  it("gives the pages built here their own routes", () => {
    expect(
      NAV_PAGES.flatMap((p) => {
        const route = builtRoute(p);
        return route ? [route] : [];
      }),
    ).toEqual([
      "/storage/shared-folders",
      "/services/ssh",
      "/diagnostics/system-logs",
      "/diagnostics/processes",
      "/diagnostics/services",
      "/account/settings",
    ]);
  });

  it("keeps every other classic link in the hash form, and the start page as it is", () => {
    expect(CLASSIC_HOME).toBe("/");
    expect(CLASSIC_HTTPS_SETTINGS).toBe("/#/system/workbench/settings");
    for (const path of Object.values(CLASSIC)) {
      expect(path).toMatch(/^\/#\/[a-z-]+(\/[a-z-]+)+$/);
    }
  });
});

describe("isCurrent", () => {
  it("marks the account item at both of its addresses", () => {
    expect(isCurrent("/account/settings", "/account/settings")).toBe(true);
    expect(isCurrent("/account/password", "/account/settings")).toBe(true);
    expect(isCurrent("/services/ssh", "/account/settings")).toBe(false);
    expect(isCurrent("/services/ssh", "/services/ssh")).toBe(true);
  });

  it("marks Services on every one of its tabs, and nothing else under Diagnostics", () => {
    for (const tab of ["smb", "nfs", "ssh"]) {
      expect(
        isCurrent(`/diagnostics/services/${tab}`, "/diagnostics/services"),
      ).toBe(true);
    }
    expect(isCurrent("/diagnostics/services", "/diagnostics/services")).toBe(
      true,
    );
    expect(isCurrent("/diagnostics/services-x", "/diagnostics/services")).toBe(
      false,
    );
    expect(isCurrent("/diagnostics/processes", "/diagnostics/services")).toBe(
      false,
    );
  });
});
