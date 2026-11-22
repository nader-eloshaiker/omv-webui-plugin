// SPDX-License-Identifier: GPL-3.0-or-later
import type {
  SharedFolder,
  SmbShareRow,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  accessByAccount,
  changedFolders,
  folderValue,
  foldersListing,
  guestsToo,
  leavesNobody,
  listToSave,
  membersWithOwnEntry,
  personLine,
} from "./accessByAccount.ts";

const folder = (
  name: string,
  n: number,
  entries: { type: "user" | "group"; name: string; perms: number }[],
): SharedFolder =>
  ({
    uuid: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
    name,
    reldirpath: `${name}/`,
    comment: "",
    mntentref: "00000000-0000-4000-8000-000000000099",
    privileges: entries.length === 0 ? "" : { privilege: entries },
  }) as SharedFolder;

const USERS = [
  { name: "alex", groups: ["users", "example-team"], comment: "" },
  { name: "robin", groups: ["users"], comment: "" },
  { name: "sam", groups: ["users", "example-team"], comment: "" },
] as UserAccount[];
const GROUPS = [
  { name: "example-team", members: ["alex", "sam"] },
] as UserGroup[];

const PHOTOS = folder("Photos", 1, [
  { type: "group", name: "example-team", perms: 7 },
  { type: "user", name: "robin", perms: 5 },
]);
const BACKUPS = folder("Backups", 2, [
  { type: "user", name: "alex", perms: 7 },
  { type: "user", name: "gone", perms: 7 },
]);
const EMPTY = folder("Public", 3, []);
const SHARE = (f: SharedFolder, guest = "no"): SmbShareRow =>
  ({
    uuid: "00000000-0000-4000-8000-0000000000aa",
    sharedfolderref: f.uuid,
    guest,
  }) as SmbShareRow;

describe("accessByAccount (4.2)", () => {
  it("gives one row per folder in natural order, with the account's stored value", () => {
    const rows = accessByAccount(
      "user",
      "alex",
      [PHOTOS, BACKUPS, EMPTY],
      USERS,
      GROUPS,
    );
    expect(rows.map((r) => r.folder.name)).toEqual([
      "Backups",
      "Photos",
      "Public",
    ]);
    expect(rows.map((r) => r.row.stored)).toEqual(["rw", "none", "none"]);
  });

  it("says what a group adds (the shares slice's 0.4 lines)", () => {
    const rows = accessByAccount("user", "alex", [PHOTOS], USERS, GROUPS);
    expect(personLine(rows[0]!, {})).toEqual({
      kind: "viaGroup",
      access: "rw",
      group: "example-team",
    });
  });

  it("sends back every other entry and drops entries for accounts that are gone", () => {
    const [backups] = accessByAccount("user", "alex", [BACKUPS], USERS, GROUPS);
    expect(listToSave(backups!, "ro")).toEqual([
      { type: "user", name: "alex", perms: 5 },
    ]);
    const [photos] = accessByAccount("user", "alex", [PHOTOS], USERS, GROUPS);
    expect(listToSave(photos!, "rw")).toEqual([
      { type: "group", name: "example-team", perms: 7 },
      { type: "user", name: "alex", perms: 7 },
      { type: "user", name: "robin", perms: 5 },
    ]);
  });

  it("counts changes and reads the grid's choices", () => {
    const rows = accessByAccount(
      "user",
      "alex",
      [PHOTOS, BACKUPS],
      USERS,
      GROUPS,
    );
    const choices = {
      [PHOTOS.uuid]: "ro" as const,
      [BACKUPS.uuid]: "rw" as const,
    };
    expect(changedFolders(rows, choices).map((r) => r.folder.name)).toEqual([
      "Photos",
    ]);
    expect(folderValue(rows[1]!, choices)).toBe("ro");
  });

  it("finds a group's members with their own entry (9.5)", () => {
    const withOwn = folder("Media", 4, [
      { type: "group", name: "example-team", perms: 5 },
      { type: "user", name: "sam", perms: 7 },
    ]);
    const [row] = accessByAccount(
      "group",
      "example-team",
      [withOwn],
      USERS,
      GROUPS,
    );
    expect(membersWithOwnEntry(row!)).toBe(1);
  });

  it("knows guest access and the last-access rule (0.10)", () => {
    const [row] = accessByAccount("user", "robin", [PHOTOS], USERS, GROUPS, [
      SHARE(PHOTOS, "allow"),
    ]);
    expect(guestsToo(row!)).toBe(true);
    expect(leavesNobody(SHARE(PHOTOS), [])).toBe(true);
    expect(leavesNobody(SHARE(PHOTOS, "allow"), [])).toBe(false);
    expect(leavesNobody(undefined, [])).toBe(false);
    expect(leavesNobody(SHARE(PHOTOS), [{ perms: 5 }])).toBe(false);
    expect(leavesNobody(SHARE(PHOTOS), [{ perms: 0 }])).toBe(true);
  });
});

describe("foldersListing (7.3, 11.2)", () => {
  it("lists the folders that name the account, with what is left without it", () => {
    const only = folder("Private", 5, [
      { type: "user", name: "alex", perms: 7 },
    ]);
    const listed = foldersListing(
      "user",
      "alex",
      [PHOTOS, BACKUPS, only],
      USERS,
      GROUPS,
      [SHARE(only)],
    );
    expect(
      listed.map((l) => [l.folder.name, l.access, l.leavesNobody]),
    ).toEqual([
      ["Backups", "rw", false],
      ["Private", "rw", true],
    ]);
    expect(listed[0]!.without).toEqual([]);
  });

  it("finds an account the lists no longer show", () => {
    const listed = foldersListing("user", "gone", [BACKUPS], USERS, GROUPS);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.without).toEqual([
      { type: "user", name: "alex", perms: 7 },
    ]);
  });

  it("lists a group's folders", () => {
    const listed = foldersListing(
      "group",
      "example-team",
      [PHOTOS],
      USERS,
      GROUPS,
    );
    expect(listed[0]!.without).toEqual([
      { type: "user", name: "robin", perms: 5 },
    ]);
  });
});
