// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  edgeInLineage,
  lineage,
  mapEdges,
  moveOnMap,
  type MapNodeShape,
} from "./connection-map-model";

// Disks feed file systems, which hold shared folders, which are shared over SMB or NFS.
const NODES: MapNodeShape[] = [
  { id: "sda", feeds: ["data"] },
  { id: "sdb", feeds: ["data"], status: "warning" },
  { id: "sdc", feeds: ["backup"] },
  { id: "data", feeds: ["photos", "music"] },
  { id: "backup", feeds: ["copies"] },
  { id: "photos", feeds: ["smb", "nfs"] },
  { id: "music", feeds: ["smb"] },
  { id: "copies", feeds: [], off: true },
  { id: "smb" },
  { id: "nfs", status: "unknown" },
];

describe("the lineage of a node", () => {
  it("is everything that feeds it and everything it feeds, never its siblings", () => {
    expect([...lineage(NODES, "photos")].sort()).toEqual(
      ["data", "nfs", "photos", "sda", "sdb", "smb"].sort(),
    );
    // Tracing a disk shows what depends on it: the file system and everything on it.
    expect([...lineage(NODES, "sdb")].sort()).toEqual(
      ["data", "music", "nfs", "photos", "sdb", "smb"].sort(),
    );
  });

  it("survives a cycle", () => {
    const loop: MapNodeShape[] = [
      { id: "a", feeds: ["b"] },
      { id: "b", feeds: ["a"] },
    ];
    expect([...lineage(loop, "a")].sort()).toEqual(["a", "b"]);
  });
});

describe("the lines", () => {
  const edges = mapEdges(NODES);
  const tone = (from: string, to: string) =>
    edges.find((e) => e.from === from && e.to === to);

  it("takes the colour of a node in trouble at either end", () => {
    expect(tone("sdb", "data")?.tone).toBe("warning");
    expect(tone("sda", "data")?.tone).toBe("ok");
    expect(tone("photos", "nfs")?.tone).toBe("unknown");
  });

  it("is dashed where either end is not in use, and skips links to nodes not on the map", () => {
    expect(tone("backup", "copies")?.off).toBe(true);
    expect(mapEdges([{ id: "x", feeds: ["gone"] }])).toEqual([]);
  });

  it("lights only the lines whose two ends are traced", () => {
    const traced = lineage(NODES, "music");
    expect(
      edgeInLineage(
        { from: "data", to: "music", tone: "ok", off: false },
        traced,
      ),
    ).toBe(true);
    expect(
      edgeInLineage(
        { from: "data", to: "photos", tone: "ok", off: false },
        traced,
      ),
    ).toBe(false);
  });
});

describe("the arrow keys", () => {
  const columns = [["sda", "sdb", "sdc"], ["data", "backup"], [], ["smb"]];
  it.each([
    ["sda", "ArrowDown", "sdb"],
    ["sdc", "ArrowDown", null],
    ["sda", "ArrowUp", null],
    ["sdc", "ArrowRight", "backup"],
    ["backup", "ArrowRight", "smb"],
    ["smb", "ArrowLeft", "data"],
    ["data", "ArrowLeft", "sda"],
    ["backup", "Home", "sda"],
    ["sda", "End", "smb"],
    ["sda", "Enter", null],
  ] as const)("from %s, %s goes to %s", (from, key, to) => {
    expect(moveOnMap(columns, from, key)).toBe(to);
  });
});
