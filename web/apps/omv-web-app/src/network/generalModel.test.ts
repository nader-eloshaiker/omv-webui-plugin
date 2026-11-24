// SPDX-License-Identifier: GPL-3.0-or-later
// network/generalModel.ts: the name and domain checks (0.8's first row, 2.6's `netGeneral.err.*`),
// the body of setGeneralSettings (0.9, D13), how others find the NAS and what a new name changes (2.3).
import { describe, expect, it } from "vitest";
import {
  checkDomain,
  checkGeneral,
  checkHostname,
  foundAs,
  generalRequest,
  nameEffects,
  windowsName,
} from "./generalModel.ts";

describe("the name", () => {
  it.each(["nas", "nas-host", "NAS2", "a", "a".repeat(63), "0nas"])(
    "takes %j",
    (name) => {
      expect(checkHostname(name)).toBeNull();
    },
  );

  it.each([
    "",
    "-nas",
    "nas-",
    "my_nas",
    "nas.example.org",
    "a".repeat(64),
    "nås",
    "my nas",
  ])("refuses %j", (name) => {
    expect(checkHostname(name)).toEqual({
      field: "hostname",
      code: "netGeneral.err.name",
    });
  });
});

describe("the domain", () => {
  it.each(["", "example.org", "internal", "home.arpa", "Example.ORG"])(
    "takes %j",
    (domain) => {
      expect(checkDomain(domain)).toBeNull();
    },
  );

  it.each([
    ["local", { code: "netGeneral.err.local" }],
    ["LOCAL", { code: "netGeneral.err.local" }],
    ["example", { code: "netGeneral.err.reserved", value: "example" }],
    ["invalid", { code: "netGeneral.err.reserved", value: "invalid" }],
    ["Test", { code: "netGeneral.err.reserved", value: "Test" }],
    ["bad_domain", { code: "netGeneral.err.domain" }],
    ["example..org", { code: "netGeneral.err.domain" }],
    ["-example.org", { code: "netGeneral.err.domain" }],
  ])("refuses %j", (domain, expected) => {
    expect(checkDomain(domain)).toMatchObject(expected);
  });

  it("both checks in field order", () => {
    expect(
      checkGeneral({ hostname: "-x", domainname: "local" }).map((p) => p.field),
    ).toEqual(["hostname", "domainname"]);
  });
});

describe("setGeneralSettings (0.9, D13)", () => {
  it("sends the name in lower case and the domain as typed", () => {
    expect(
      generalRequest({ hostname: " NAS-Host ", domainname: " Example.org " }),
    ).toEqual({ hostname: "nas-host", domainname: "Example.org" });
  });

  it("refuses to write what did not pass its checks", () => {
    expect(() =>
      generalRequest({ hostname: "nas_host", domainname: "" }),
    ).toThrow(Error);
  });
});

describe("how others find it, and what a new name changes (2.2, 2.3)", () => {
  it("found as", () => {
    expect(foundAs({ hostname: "nas", domainname: "example.org" })).toEqual({
      host: "nas",
      local: "nas.local",
      unc: "\\\\nas",
      fqdn: "nas.example.org",
    });
    expect(foundAs({ hostname: "nas", domainname: "" }).fqdn).toBeNull();
  });

  it("the Windows name is the first 15 characters", () => {
    expect(windowsName("a-very-long-nas-name")).toBe("a-very-long-nas");
  });

  it.each<
    [string, { hostname: string; domainname: string }, boolean, string[]]
  >([
    [
      "a new name",
      { hostname: "new-nas", domainname: "example.org" },
      false,
      [
        "netGeneral.effect.smb",
        "netGeneral.effect.nfs",
        "netGeneral.effect.bookmarks",
        "netGeneral.effect.router",
      ],
    ],
    [
      "a new name with HTTPS on",
      { hostname: "new-nas", domainname: "example.org" },
      true,
      [
        "netGeneral.effect.smb",
        "netGeneral.effect.nfs",
        "netGeneral.effect.bookmarks",
        "netGeneral.effect.certificate",
        "netGeneral.effect.router",
      ],
    ],
    [
      "a new domain only",
      { hostname: "nas", domainname: "example.net" },
      false,
      ["netGeneral.effect.domain"],
    ],
    [
      "a name longer than 15 characters",
      { hostname: "a-very-long-nas-name", domainname: "example.org" },
      false,
      [
        "netGeneral.effect.smb",
        "netGeneral.effect.nfs",
        "netGeneral.effect.bookmarks",
        "netGeneral.effect.router",
        "netGeneral.effect.short",
      ],
    ],
    ["capitals only", { hostname: "NAS", domainname: "example.org" }, true, []],
  ])("%s", (_what, draft, https, codes) => {
    expect(
      nameEffects(
        { hostname: "nas", domainname: "example.org" },
        draft,
        https,
      ).map((e) => e.code),
    ).toEqual(codes);
  });

  it("the lines' values", () => {
    const effects = nameEffects(
      { hostname: "nas", domainname: "example.org" },
      { hostname: "a-very-long-nas-name", domainname: "example.net" },
      false,
    );
    expect(effects).toContainEqual({
      code: "netGeneral.effect.smb",
      unc: "\\\\nas",
      smb: "smb://nas",
    });
    expect(effects).toContainEqual({
      code: "netGeneral.effect.domain",
      fqdn: "nas.example.org",
    });
    expect(effects).toContainEqual({
      code: "netGeneral.effect.short",
      short: "a-very-long-nas",
    });
  });
});
