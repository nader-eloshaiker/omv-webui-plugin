// SPDX-License-Identifier: GPL-3.0-or-later
// The brackets under the NAS's front: neighbouring bays of one drive share a bracket, a drive whose
// disks are not neighbours gets one per run, and the columns hold the stick's words.
import { describe, expect, it } from "vitest";
import { nasFrontColumns, nasFrontGroups } from "./nas-front-model";

const runOf = (id: string) =>
  id === "unused"
    ? { id, name: "Not in use", dashed: true }
    : { id, name: id === "raid" ? "RAID array" : "Data drive" };

describe("nasFrontGroups", () => {
  it("groups neighbouring bays of one drive under one bracket, in bay order", () => {
    const bays = ["data", "raid", "raid", "tank", "unused"];
    expect(
      nasFrontGroups(bays, (b) =>
        b === "tank" ? { id: b, name: "tank", tech: "ZFS pool" } : runOf(b),
      ),
    ).toEqual([
      { id: "data", name: "Data drive", start: 1, span: 1 },
      { id: "raid", name: "RAID array", start: 2, span: 2 },
      { id: "tank", name: "tank", tech: "ZFS pool", start: 4, span: 1 },
      { id: "unused", name: "Not in use", dashed: true, start: 5, span: 1 },
    ]);
  });

  it("gives a drive whose disks are not neighbours a bracket per run", () => {
    const groups = nasFrontGroups(["data", "unused", "data"], runOf);
    expect(groups.map((g) => [g.id, g.start, g.span])).toEqual([
      ["data", 1, 1],
      ["unused", 2, 1],
      ["data", 3, 1],
    ]);
  });

  it("puts every bay of a new NAS under one dashed bracket", () => {
    expect(nasFrontGroups([1, 2, 3, 4, 5], () => runOf("unused"))).toEqual([
      { id: "unused", name: "Not in use", dashed: true, start: 1, span: 5 },
    ]);
  });

  it("has no bracket without a bay", () => {
    expect(nasFrontGroups([], () => runOf("data"))).toEqual([]);
  });

  it("passes the bay and its index to the caller", () => {
    const seen: [string, number][] = [];
    nasFrontGroups(["a", "b"], (bay, i) => {
      seen.push([bay, i]);
      return runOf("data");
    });
    expect(seen).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });
});

describe("nasFrontColumns", () => {
  it("is a column per bay", () => {
    expect(nasFrontColumns(5, 1)).toBe(5);
    expect(nasFrontColumns(3, 0)).toBe(3);
  });

  it("keeps a column beside the stick for its words", () => {
    expect(nasFrontColumns(1, 1)).toBe(2);
    expect(nasFrontColumns(0, 1)).toBe(2);
  });

  it("never has no column", () => {
    expect(nasFrontColumns(0, 0)).toBe(1);
  });
});
