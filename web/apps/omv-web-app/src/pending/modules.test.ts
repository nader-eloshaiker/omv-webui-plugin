// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import common from "../locales/en/common.json";
import {
  isKnownModule,
  KNOWN_MODULES,
  mayCutConnection,
  pendingModules,
} from "./modules.ts";

describe("the module names", () => {
  it("has a plain name in the catalogue for every known module", () => {
    for (const id of KNOWN_MODULES) {
      expect(common.modules[id], id).toBeTruthy();
    }
  });

  it("knows OMV's modules and nothing else", () => {
    expect(isKnownModule("samba")).toBe(true);
    expect(isKnownModule("zfs")).toBe(false);
    expect(isKnownModule("toString")).toBe(false);
  });
});

describe("mayCutConnection", () => {
  it.each([
    [["ssh", "avahi"], false],
    [["ssh", "systemd-networkd"], true],
    [["nginx"], true],
    [["certificates"], true],
    [["phpfpm"], true],
    [["iptables"], true],
    [[], false],
  ])("%j: %s", (ids, cuts) => {
    expect(mayCutConnection(ids)).toBe(cuts);
  });
});

describe("pendingModules", () => {
  it("lists the ids, sorted, and nothing for no map", () => {
    expect(pendingModules({ ssh: "x", avahi: "y" })).toEqual(["avahi", "ssh"]);
    expect(pendingModules(undefined)).toEqual([]);
    expect(pendingModules({})).toEqual([]);
  });
});
