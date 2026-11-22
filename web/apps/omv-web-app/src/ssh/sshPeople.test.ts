// SPDX-License-Identifier: GPL-3.0-or-later
import type { UserAccount } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import { sshPeople } from "./sshPeople.ts";

const user = (name: string, groups: string[]): UserAccount => ({
  name,
  groups: ["users", ...groups],
});

describe("sshPeople (13.2)", () => {
  it("names the people in _ssh or root, in natural order", () => {
    expect(
      sshPeople([
        user("robin", ["_ssh"]),
        user("sam", []),
        user("alex10", ["root"]),
        user("alex2", ["_ssh", "openmediavault-admin"]),
      ]),
    ).toEqual({ names: ["alex2", "alex10", "robin"], more: 0 });
  });

  it("names at most five, then counts the rest", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      user(`p${String(i + 1)}`, ["_ssh"]),
    );
    expect(sshPeople(many)).toEqual({
      names: ["p1", "p2", "p3", "p4", "p5"],
      more: 3,
    });
  });

  it("is empty when nobody may", () => {
    expect(sshPeople([user("sam", [])])).toEqual({ names: [], more: 0 });
  });
});
