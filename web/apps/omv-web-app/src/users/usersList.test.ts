// SPDX-License-Identifier: GPL-3.0-or-later
import type { UserAccount } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  controlSummary,
  fewNames,
  groupsColumn,
  matchesSearch,
  matchesShow,
  nextUsersSort,
  pageOf,
  sortUsers,
  visibleUsers,
  warnedGroupsOf,
} from "./usersList.ts";

const alex: UserAccount = {
  name: "alex",
  comment: "Alex at home",
  email: "alex@example.org",
  groups: ["users", "openmediavault-admin", "family", "sudo"],
};
const robin: UserAccount = {
  name: "robin",
  comment: "",
  email: "",
  groups: ["users", "_ssh", "family", "kids", "audio"],
};
const sam: UserAccount = { name: "sam", groups: ["users"] };
const user10: UserAccount = { name: "user10", groups: ["users", "root"] };
const user9: UserAccount = { name: "user9", groups: ["users"] };
const GROUPS = [
  { name: "family", members: ["alex", "robin"] },
  { name: "kids", members: ["robin"] },
  { name: "team", members: ["sam"] },
];
const ALL = [robin, user10, sam, alex, user9];

describe("search and filter (1.2)", () => {
  it("searches the name, the description and the email address, ignoring case", () => {
    expect(matchesSearch(alex, "HOME")).toBe(true);
    expect(matchesSearch(alex, "example.org")).toBe(true);
    expect(matchesSearch(alex, "lex")).toBe(true);
    expect(matchesSearch(alex, "robin")).toBe(false);
    expect(matchesSearch(alex, "  ")).toBe(true);
  });

  it("filters administrators, SSH (with root) and system groups", () => {
    expect(ALL.filter((u) => matchesShow(u, "admins", GROUPS))).toEqual([alex]);
    expect(
      ALL.filter((u) => matchesShow(u, "ssh", GROUPS)).map((u) => u.name),
    ).toEqual(["robin", "user10"]);
    expect(
      ALL.filter((u) => matchesShow(u, "systemGroups", GROUPS)).map(
        (u) => u.name,
      ),
    ).toEqual(["robin", "user10", "alex"]);
  });
});

describe("sorting (1.3)", () => {
  it("sorts names in natural order", () => {
    expect(
      sortUsers(ALL, { field: "name", direction: "asc" }).map((u) => u.name),
    ).toEqual(["alex", "robin", "sam", "user9", "user10"]);
    expect(
      sortUsers(ALL, { field: "name", direction: "desc" }).map((u) => u.name),
    ).toEqual(["user10", "user9", "sam", "robin", "alex"]);
  });

  it("puts an empty description last either way, ties by name", () => {
    expect(
      sortUsers([sam, alex, robin], {
        field: "description",
        direction: "desc",
      }).map((u) => u.name),
    ).toEqual(["alex", "robin", "sam"]);
  });

  it("sorts Yes after No, ascending", () => {
    expect(
      sortUsers([alex, sam], { field: "admin", direction: "asc" }).map(
        (u) => u.name,
      ),
    ).toEqual(["sam", "alex"]);
  });

  it("reverses the sorted column and starts a new one ascending", () => {
    expect(nextUsersSort({ field: "name", direction: "asc" }, "name")).toEqual({
      field: "name",
      direction: "desc",
    });
    expect(nextUsersSort({ field: "name", direction: "desc" }, "ssh")).toEqual({
      field: "ssh",
      direction: "asc",
    });
  });

  it("combines search, filter and sort", () => {
    expect(
      visibleUsers(ALL, GROUPS, {
        search: "user",
        show: "ssh",
        sort: { field: "name", direction: "asc" },
      }).map((u) => u.name),
    ).toEqual(["user10"]);
  });
});

describe("paging (1.2)", () => {
  it("clamps to the last page that exists", () => {
    const rows = Array.from({ length: 120 }, (_, i) => i);
    expect(pageOf(rows, 0, 50).rows).toHaveLength(50);
    expect(pageOf(rows, 2, 50)).toMatchObject({ page: 2, pageCount: 3 });
    expect(pageOf(rows, 2, 50).rows).toHaveLength(20);
    expect(pageOf(rows, 9, 50).page).toBe(2);
    expect(pageOf([], 3, 50)).toMatchObject({ page: 0, pageCount: 1 });
  });
});

describe("names in a sentence (0.2)", () => {
  it("shows at most five in natural order, then how many more", () => {
    expect(fewNames(["b", "a"])).toEqual({ shown: ["a", "b"], more: 0 });
    expect(fewNames(["f", "e", "d", "c", "b", "a", "g"])).toEqual({
      shown: ["a", "b", "c", "d", "e"],
      more: 2,
    });
  });
});

describe("who can control this NAS (1.2)", () => {
  it("lists administrators, who may sign in over SSH, and the warned system groups", () => {
    expect(controlSummary(ALL, GROUPS)).toEqual({
      admins: ["alex"],
      ssh: ["robin", "user10"],
      powers: [
        { name: "alex", groups: ["sudo"] },
        { name: "user10", groups: ["root"] },
      ],
    });
  });

  it("does not warn about groups that only read logs or play sound", () => {
    expect(warnedGroupsOf(robin, GROUPS)).toEqual([]);
    expect(
      warnedGroupsOf({ groups: ["users", "adm", "docker"] }, GROUPS),
    ).toEqual(["docker"]);
  });
});

describe("the Groups column (1.3)", () => {
  it("names the OMV groups only, three at most", () => {
    expect(groupsColumn(robin, GROUPS)).toEqual({
      shown: ["family", "kids"],
      more: 0,
    });
    expect(
      groupsColumn(
        { name: "x", groups: ["users", "a", "b", "c", "d"] },
        ["a", "b", "c", "d"].map((name) => ({ name })),
      ),
    ).toEqual({ shown: ["a", "b", "c"], more: 1 });
    // A membership known from the group's side counts too.
    expect(groupsColumn(sam, GROUPS)).toEqual({ shown: ["team"], more: 0 });
  });
});
