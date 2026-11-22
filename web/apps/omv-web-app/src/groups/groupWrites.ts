// SPDX-License-Identifier: GPL-3.0-or-later
// A group's page's writes (phase 5 users design 0.5, 0.11, 9.3, 9.4): read, change, write. setGroup
// replaces the whole member list, so every save sends `name`, `comment` and `members` from the getGroup
// read made just before, with only the change; `gid` is never sent. A save stops when the re-read
// differs from what the page showed. A person whose main group it is (an account made outside OMV) is
// not in OMV's member list: shown ticked and unavailable, never sent. Pure.
import type {
  UserAccount,
  UserGroup,
  UserMgmtSetGroupRequest,
} from "@omv-webui/react-api-omv/generated";

const sorted = (names: readonly string[] | undefined): string[] =>
  [...new Set(names ?? [])].sort();

/** The same people, in any order. */
export const sameMembers = (
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean => {
  const x = sorted(a);
  const y = sorted(b);
  return x.length === y.length && x.every((n, i) => n === y[i]);
};

/** What the page showed differs from the re-read, in members or description. */
export const groupChanged = (
  shown: Pick<UserGroup, "members" | "comment">,
  now: Pick<UserGroup, "members" | "comment">,
): boolean =>
  !sameMembers(shown.members, now.members) ||
  (shown.comment ?? "") !== (now.comment ?? "");

/** The people whose main group this is (their account's group number is the group's), by name. */
export function mainGroupMembers(
  group: Pick<UserGroup, "gid" | "members">,
  users: readonly Pick<UserAccount, "name" | "gid">[],
): string[] {
  if (group.gid === undefined) {
    return [];
  }
  const members = new Set(group.members ?? []);
  return users
    .filter((u) => u.gid === group.gid && !members.has(u.name))
    .map((u) => u.name);
}

/** The members a save sends: the ticked people, without those whose main group it is. */
export const membersToSave = (
  ticked: readonly string[],
  mainGroup: readonly string[],
): string[] => sorted(ticked).filter((n) => !mainGroup.includes(n));

/** How many people's ticks differ from the saved list. */
export function memberChanges(
  saved: readonly string[],
  ticked: readonly string[],
): number {
  const a = new Set(saved);
  const b = new Set(ticked);
  let count = 0;
  for (const n of a) {
    if (!b.has(n)) {
      count += 1;
    }
  }
  for (const n of b) {
    if (!a.has(n)) {
      count += 1;
    }
  }
  return count;
}

/** setGroup's body from the group just re-read, with one change (0.11). */
export function groupSetRequest(
  now: Pick<UserGroup, "name" | "comment" | "members">,
  change: { comment: string } | { members: readonly string[] },
): UserMgmtSetGroupRequest {
  return {
    name: now.name,
    comment: "comment" in change ? change.comment : (now.comment ?? ""),
    members:
      "members" in change ? [...change.members] : [...(now.members ?? [])],
  };
}
