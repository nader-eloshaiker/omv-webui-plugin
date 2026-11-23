// SPDX-License-Identifier: GPL-3.0-or-later
// network/dto.ts: the one boundary step, narrowing a stored interface's type and methods.
import { describe, expect, it } from "vitest";
import { toIfaceSettings } from "./dto.ts";
import { settings } from "./fixtures.testing.ts";

describe("toIfaceSettings", () => {
  const stored = settings("enp2s0");

  it.each(["ethernet", "wifi", "bond", "vlan", "bridge"])(
    "keeps the type %s",
    (type) => {
      expect(toIfaceSettings({ ...stored, type })?.type).toBe(type);
    },
  );

  it.each([
    ["a type OMV does not write", { type: "virtual" }],
    ["an IPv4 method OMV does not write", { method: "auto" }],
    ["an IPv6 method OMV does not write", { method6: "slaac" }],
    ["an empty method (a bond's port row)", { method: "" }],
  ])("null for %s", (_what, over) => {
    expect(toIfaceSettings({ ...stored, ...over })).toBeNull();
  });

  it("keeps a row's _used and _readonly", () => {
    expect(
      toIfaceSettings({ ...stored, _used: true, _readonly: false }),
    ).toMatchObject({ _used: true, _readonly: false });
  });
});
