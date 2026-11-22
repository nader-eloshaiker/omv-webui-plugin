// SPDX-License-Identifier: GPL-3.0-or-later
// The system groups a person may be in (phase 5 users design 0.5): the two this interface offers as
// explicit choices, every person's main group, and what the well-known others mean. A system group
// other than the two is never offered, never added or removed here, and kept on every save. Pure.

/** Members sign in to this interface and the classic one as administrators (OMV's sign-in). */
export const ADMIN_GROUP = "openmediavault-admin";
/** The SSH server lets in only `root` and `_ssh` (`AllowGroups root _ssh` in OMV's template). */
export const SSH_GROUP = "_ssh";
/** Every person's main group; OMV sets it on every save, and it is in no sentence. */
export const DEFAULT_GROUP = "users";
/** The superuser group, which also lets a person in over SSH. */
export const ROOT_GROUP = "root";

/** Groups that are never "other system groups": the main group and the two offered. */
export const MANAGED_SYSTEM_GROUPS: readonly string[] = [
  DEFAULT_GROUP,
  ADMIN_GROUP,
  SSH_GROUP,
];

/** A system group's words (`systemGroup.*`), and whether it amounts to control of the NAS. */
export interface SystemGroupInfo {
  name: string;
  /** The copy key of its meaning, or null for "its name only". */
  wordsKey: string | null;
  warned: boolean;
}

const WORDS: Readonly<Record<string, { key: string; warned: boolean }>> = {
  root: { key: "systemGroup.root", warned: true },
  sudo: { key: "systemGroup.sudo", warned: true },
  disk: { key: "systemGroup.disk", warned: true },
  shadow: { key: "systemGroup.shadow", warned: true },
  docker: { key: "systemGroup.containers", warned: true },
  lxd: { key: "systemGroup.containers", warned: true },
  libvirt: { key: "systemGroup.containers", warned: true },
  "incus-admin": { key: "systemGroup.containers", warned: true },
  "openmediavault-config": { key: "systemGroup.omv", warned: true },
  "openmediavault-engined": { key: "systemGroup.omv", warned: true },
  "openmediavault-webgui": { key: "systemGroup.omv", warned: true },
  adm: { key: "systemGroup.logs", warned: false },
  "systemd-journal": { key: "systemGroup.logs", warned: false },
};

export function systemGroupInfo(name: string): SystemGroupInfo {
  const known = Object.hasOwn(WORDS, name) ? WORDS[name] : undefined;
  return {
    name,
    wordsKey: known?.key ?? null,
    warned: known?.warned ?? false,
  };
}
