// SPDX-License-Identifier: GPL-3.0-or-later
// Who may sign in over SSH, for the line under "Turn on SSH" (phase 5 users design 13.2): the account
// part of 0.3 only (in `_ssh` or `root`), from UserMgmt.getUserList, at most five names in natural
// order and how many more (0.2). Pure.
import type { UserAccount } from "@omv-webui/react-api-omv/generated";
import { naturalCompare } from "../format/format.ts";
import { sshAllowed } from "../users/userModel.ts";

/** At most this many names are said in a sentence (0.2). */
export const NAMED = 5;

export function sshPeople(users: readonly UserAccount[]): {
  names: string[];
  more: number;
} {
  const allowed = users
    .filter(sshAllowed)
    .map((u) => u.name)
    .sort(naturalCompare);
  return {
    names: allowed.slice(0, NAMED),
    more: Math.max(0, allowed.length - NAMED),
  };
}
