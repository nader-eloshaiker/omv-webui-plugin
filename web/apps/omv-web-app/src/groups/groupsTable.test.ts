// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  SharedFolder,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  foldersOfGroup,
  groupListRows,
  namesUpTo,
  nextGroupSort,
  pageOfGroups,
  searchGroups,
  sortGroups,
} from "./groupsTable.ts";

const folder = (
  name: string,
  privilege: { type: string; name: string; perms: number | string }[],
) =>
  ({ uuid: name, name, privileges: { privilege } }) as unknown as SharedFolder;

const FOLDERS = [
  folder("Photos", [
    { type: "group", name: "family", perms: 7 },
    { type: "group", name: "kids", perms: 0 },
  ]),
  folder("Media", [
    { type: "group", name: "family", perms: "5" },
    { type: "user", name: "kids", perms: 7 },
  ]),
  folder("Empty", []),
];

const GROUPS: UserGroup[] = [
  { name: "kids", members: ["sam", "robin"], comment: "" },
  { name: "family", members: ["alex"], comment: "Everyone at home" },
  { name: "group10", comment: "Tenth" },
  { name: "group9" },
];

describe("the Groups list (8)", () => {
  it("counts the folders that give the group Read and write or Read only, never Blocked or a person's entry", () => {
    expect(foldersOfGroup("family", FOLDERS)).toBe(2);
    expect(foldersOfGroup("kids", FOLDERS)).toBe(0);
  });

  it("joins the lists, members in natural order, the count unknown without the folders", () => {
    const rows = groupListRows(GROUPS, undefined);
    expect(rows[0]).toEqual({
      name: "kids",
      comment: "",
      members: ["robin", "sam"],
      folders: null,
    });
    expect(groupListRows(GROUPS, FOLDERS)[1]?.folders).toBe(2);
  });

  it("searches the name, the description and the members, ignoring case", () => {
    const rows = groupListRows(GROUPS, FOLDERS);
    expect(searchGroups(rows, "HOME").map((r) => r.name)).toEqual(["family"]);
    expect(searchGroups(rows, "sam").map((r) => r.name)).toEqual(["kids"]);
    expect(searchGroups(rows, "  ")).toHaveLength(4);
  });

  it("sorts in natural order, and by the counts with the name as the tie-break", () => {
    const rows = groupListRows(GROUPS, FOLDERS);
    expect(
      sortGroups(rows, { field: "name", direction: "asc" }).map((r) => r.name),
    ).toEqual(["family", "group9", "group10", "kids"]);
    expect(
      sortGroups(rows, { field: "members", direction: "desc" }).map(
        (r) => r.name,
      ),
    ).toEqual(["kids", "family", "group9", "group10"]);
    expect(
      sortGroups(groupListRows(GROUPS, undefined), {
        field: "folders",
        direction: "desc",
      }).map((r) => r.name),
    ).toEqual(["family", "group9", "group10", "kids"]);
  });

  it("reverses the sorted column, and starts a new one ascending", () => {
    expect(nextGroupSort({ field: "name", direction: "asc" }, "name")).toEqual({
      field: "name",
      direction: "desc",
    });
    expect(
      nextGroupSort({ field: "name", direction: "desc" }, "folders"),
    ).toEqual({ field: "folders", direction: "asc" });
  });

  it("pages, clamping to the last page that exists", () => {
    const rows = Array.from({ length: 120 }, (_, i) => i);
    expect(pageOfGroups(rows, 2, 50)).toMatchObject({
      page: 2,
      pageCount: 3,
      from: 101,
      to: 120,
    });
    expect(pageOfGroups(rows, 9, 50).page).toBe(2);
    expect(pageOfGroups([], 0, 50)).toMatchObject({ from: 0, to: 0 });
  });

  it("names at most so many, and says how many more", () => {
    expect(namesUpTo(["a", "b", "c", "d", "e"], 3)).toEqual({
      shown: ["a", "b", "c"],
      more: 2,
    });
    expect(namesUpTo(["a"], 3)).toEqual({ shown: ["a"], more: 0 });
  });
});
