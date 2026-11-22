// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  groupChanged,
  groupSetRequest,
  mainGroupMembers,
  memberChanges,
  membersToSave,
  sameMembers,
} from "./groupWrites.ts";

describe("a group's writes (0.11, 9.3, 9.4)", () => {
  it("compares members in any order, and treats a missing list as empty", () => {
    expect(sameMembers(["b", "a"], ["a", "b"])).toBe(true);
    expect(sameMembers(undefined, [])).toBe(true);
    expect(sameMembers(["a"], ["a", "b"])).toBe(false);
  });

  it("sees a change elsewhere in the members or the description", () => {
    const shown = { members: ["alex"], comment: "Home" };
    expect(groupChanged(shown, { members: ["alex"], comment: "Home" })).toBe(
      false,
    );
    expect(groupChanged(shown, { members: [], comment: "Home" })).toBe(true);
    expect(groupChanged(shown, { members: ["alex"], comment: "" })).toBe(true);
    expect(groupChanged({ members: [] }, { members: [], comment: "" })).toBe(
      false,
    );
  });

  it("finds the people whose main group it is, never those already listed", () => {
    const users = [
      { name: "alex", gid: 100 },
      { name: "kim", gid: 1001 },
      { name: "lee", gid: 1001 },
    ];
    expect(mainGroupMembers({ gid: 1001, members: ["lee"] }, users)).toEqual([
      "kim",
    ]);
    expect(mainGroupMembers({ members: [] }, users)).toEqual([]);
  });

  it("never sends a person whose main group it is", () => {
    expect(membersToSave(["robin", "kim", "alex"], ["kim"])).toEqual([
      "alex",
      "robin",
    ]);
  });

  it("counts the people added and taken out", () => {
    expect(memberChanges(["a", "b"], ["b", "c", "d"])).toBe(3);
    expect(memberChanges(["a"], ["a"])).toBe(0);
  });

  it("sends the re-read fields with only the change, never the group number", () => {
    const now = {
      name: "family",
      comment: "Home",
      members: ["alex"],
      gid: 1000,
    };
    expect(groupSetRequest(now, { comment: "At home" })).toEqual({
      name: "family",
      comment: "At home",
      members: ["alex"],
    });
    expect(groupSetRequest(now, { members: [] })).toEqual({
      name: "family",
      comment: "Home",
      members: [],
    });
    expect(groupSetRequest({ name: "x" }, { members: ["a"] })).toEqual({
      name: "x",
      comment: "",
      members: ["a"],
    });
  });
});
