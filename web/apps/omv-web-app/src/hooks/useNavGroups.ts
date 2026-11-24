// SPDX-License-Identifier: GPL-3.0-or-later
// The menu the session's role sees (navigation.ts), with what is known at run time about the plugins:
// shared by the side navigation and the command palette, so both always list the same pages.
import type { Role } from "@omv-webui/react-api-omv/generated";
import { navFor } from "../navigation/navigation.ts";
import { useRaidPlugin } from "./useRaidReads.ts";
import { useZfsPlugin } from "./useZfsReads.ts";

export function useNavGroups(role: Role) {
  // The RAID item is shown only once the plugin is known to be installed (0.10); a normal user's shell
  // makes no RAID call (10).
  const raidPlugin = useRaidPlugin(role === "admin") === "installed";
  // The same for ZFS, by Zfs.listCompressionTypes, which runs no command (ZFS design 0.11, P14).
  const zfsPlugin = useZfsPlugin(role === "admin") === "installed";
  return navFor(role, { raidPlugin, zfsPlugin });
}
