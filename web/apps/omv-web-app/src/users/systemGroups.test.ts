// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { systemGroupInfo } from "./systemGroups.ts";

describe("systemGroupInfo (0.5)", () => {
  it.each([
    ["root", "systemGroup.root", true],
    ["sudo", "systemGroup.sudo", true],
    ["disk", "systemGroup.disk", true],
    ["shadow", "systemGroup.shadow", true],
    ["docker", "systemGroup.containers", true],
    ["lxd", "systemGroup.containers", true],
    ["libvirt", "systemGroup.containers", true],
    ["incus-admin", "systemGroup.containers", true],
    ["openmediavault-config", "systemGroup.omv", true],
    ["openmediavault-engined", "systemGroup.omv", true],
    ["openmediavault-webgui", "systemGroup.omv", true],
    ["adm", "systemGroup.logs", false],
    ["systemd-journal", "systemGroup.logs", false],
    ["audio", null, false],
    ["constructor", null, false],
  ])("%s", (name, key, warned) => {
    expect(systemGroupInfo(name)).toEqual({ name, wordsKey: key, warned });
  });
});
