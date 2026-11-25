// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { MapDisk, MapStorage, Nas } from "./model.ts";
import {
  accentAt,
  answerOf,
  areaStates,
  atRisk,
  attentionRows,
  bayLayout,
  capFolders,
  capStorage,
  feedsWords,
  laneSummary,
  layoutFor,
  mapView,
  MORE_ID,
  nasFor,
  needsYou,
  riskDepth,
  riskTones,
  STRIP_ID,
  stripWords,
  tileColumns,
  waysLayout,
  withFirstStorage,
  withoutSdbWarning,
  withSdbWarning,
} from "./model.ts";

const disk = (id: string, health: MapDisk["health"] = "ok"): MapDisk => ({
  id: `d:${id}`,
  device: id,
  kind: "hdd",
  size: "1 TiB",
  health,
  word: "",
  temp: null,
  power: "none",
  feeds: [],
});

describe("the answer (A)", () => {
  it("says all is well with when the disks were checked and how many drives have space", () => {
    expect(answerOf(nasFor("all-ok"))).toEqual({
      title: "All OK",
      reason: "Disks checked at 10:31. All 4 drives have space.",
      tone: "ok",
    });
  });

  it("counts what needs the person and gives the worst one's reason", () => {
    const answer = answerOf(nasFor("needs-you"));
    expect(answer.title).toBe("4 things need you");
    expect(answer.reason).toMatch(/^Disk sdb reports a problem/u);
    expect(answer.tone).toBe("warning");
  });

  it("puts a critical problem first, whatever order it was found in", () => {
    const answer = answerOf(nasFor("disk-critical"));
    expect(answer.title).toBe("2 things need you");
    expect(answer.tone).toBe("critical");
  });

  it("welcomes a new NAS instead of judging it", () => {
    expect(answerOf(nasFor("new-nas")).title).toBe("Welcome to your NAS");
  });

  it("says which lane could not be read and that the rest is fine", () => {
    expect(answerOf(nasFor("lane-failed"))).toEqual({
      title: "Could not read everything",
      reason: "The disks could not be read. Everything else is OK.",
      tone: "unknown",
    });
  });
});

describe("the areas", () => {
  it("names a lane that failed as Unknown, not OK", () => {
    const disks = areaStates(nasFor("lane-failed")).find(
      (a) => a.id === "disks",
    );
    expect(disks).toMatchObject({ health: "unknown", word: "Could not read" });
  });

  it("calls unchecked disks Not checked, and an empty area None yet", () => {
    const areas = areaStates(nasFor("new-nas"));
    expect(areas.find((a) => a.id === "disks")?.word).toBe("Not checked");
    expect(areas.find((a) => a.id === "folders")).toMatchObject({
      word: "None yet",
      empty: true,
    });
  });

  it("takes the state of what needs the person in that area", () => {
    const system = areaStates(nasFor("needs-you")).find(
      (a) => a.id === "system",
    );
    expect(system?.health).toBe("warning");
  });
});

describe("needs you (B)", () => {
  it("lists worst first and keeps the found order among equals", () => {
    expect(needsYou(nasFor("needs-you")).map((a) => a.id)).toEqual([
      "a:sdb",
      "a:data",
      "a:restart",
      "a:clock",
    ]);
  });

  it("shows three rows, then how many more", () => {
    const { shown, more } = attentionRows(needsYou(nasFor("needs-you")));
    expect(shown).toHaveLength(3);
    expect(more).toBe(1);
  });

  it("a problem arrives and resolves", () => {
    const ok = nasFor("all-ok");
    const bad = withSdbWarning(ok);
    expect(needsYou(bad).map((a) => a.id)).toEqual(["a:sdb"]);
    expect(needsYou(withoutSdbWarning(bad))).toEqual([]);
  });
});

describe("the lanes' caps (6.4)", () => {
  it("keeps up to twelve disks as slots", () => {
    const disks = Array.from({ length: 12 }, (_, i) => disk(`sd${String(i)}`));
    expect(bayLayout(disks)).toEqual({ full: disks, strip: [] });
  });

  it("folds healthy disks beyond twelve into the strip and keeps every disk in trouble full size", () => {
    const disks = [
      ...Array.from({ length: 22 }, (_, i) => disk(`sd${String(i)}`)),
      disk("bad", "warning"),
      disk("worse", "critical"),
    ];
    const { full, strip } = bayLayout(disks);
    expect(full.map((d) => d.device)).toEqual(["bad", "worse"]);
    expect(strip).toHaveLength(22);
    expect(stripWords(strip, true)).toBe("22 more, all OK");
  });

  it("says how many in the strip are not checked", () => {
    const strip = [disk("a"), disk("b", "unknown"), disk("c", "unknown")];
    expect(stripWords(strip, false)).toBe("3 disks: 1 OK, 2 not checked");
  });

  it("shows drives in trouble first, then the fullest, when there are more than five", () => {
    const drive = (
      id: string,
      used: number,
      health: MapStorage["health"] = "ok",
    ) => ({ id, used, health }) as MapStorage;
    const list = [
      drive("a", 0.1),
      drive("b", 0.9),
      drive("c", 0.2, "warning"),
      drive("d", 0.5),
      drive("e", 0.3),
      drive("f", 0.95),
    ];
    const { shown, hidden } = capStorage(list);
    expect(shown.map((s) => s.id)).toEqual(["c", "f", "b", "d", "e"]);
    expect(hidden.map((s) => s.id)).toEqual(["a"]);
  });

  it("counts a drive on a disk in trouble as in trouble", () => {
    const drive = (id: string, used: number) =>
      ({ id, used, health: "ok" }) as MapStorage;
    const list = ["a", "b", "c", "d", "e", "f"].map((id, i) =>
      drive(id, i / 10),
    );
    const sick = { ...disk("x", "warning"), feeds: ["a"] };
    expect(capStorage(list, [sick]).shown[0]?.id).toBe("a");
  });

  it("caps folders at six, those in trouble first", () => {
    const folders = Array.from({ length: 8 }, (_, i) => ({
      id: `f${String(i)}`,
      name: "",
      via: [],
      health: i === 7 ? ("warning" as const) : ("ok" as const),
      word: "",
    }));
    const { shown, hidden } = capFolders(folders);
    expect(shown[0]?.id).toBe("f7");
    expect(hidden).toHaveLength(2);
  });

  it("shows only the ways in that are on, the rest in one line", () => {
    const { on, off } = waysLayout(nasFor("all-ok").ways);
    expect(on.map((w) => w.id)).toEqual(["smb", "nfs", "ssh"]);
    expect(off).toBe("Off: Copies to other NAS");
  });
});

describe("the map's graph", () => {
  it("folds hidden nodes into their lane's more node and the strip", () => {
    const view = mapView(nasFor("many"));
    const ids = view.nodes.map((n) => n.id);
    expect(ids).toContain(STRIP_ID);
    expect(ids).toContain(MORE_ID.storage);
    expect(ids).toContain(MORE_ID.folders);
    expect(view.bay.full.map((d) => d.device)).toEqual(["sdj"]);
    expect(view.folders.hidden).toHaveLength(24);
  });

  it("puts what a failing disk holds at risk, down to the folders and no further", () => {
    const nodes = mapView(nasFor("disk-critical")).nodes;
    expect([...atRisk(nodes, "d:sda")].sort()).toEqual([
      "d:sda",
      "f:documents",
      "f:music",
      "f:photos",
      "s:data",
    ]);
    expect(riskTones(nodes).get("f:photos")).toBe("critical");
    expect(riskTones(nodes).has("w:smb")).toBe(false);
  });

  it("measures how far each node at risk is from the trouble", () => {
    const nodes = mapView(nasFor("needs-you")).nodes;
    const depth = riskDepth(nodes, "d:sdb");
    expect(depth.get("s:backup")).toBe(1);
    expect(depth.get("f:timemachine")).toBe(2);
    expect(depth.has("s:data")).toBe(false);
  });
});

describe("the accent", () => {
  it("goes to the worst row when something needs the person", () => {
    expect(accentAt(nasFor("needs-you"), true)).toBe("needs-you");
  });

  it("goes to the empty folders lane's action when there are no folders", () => {
    expect(accentAt(nasFor("no-folders"), true)).toBe("folders-lane");
  });

  it("goes to the current first step otherwise, and nowhere once they are done or hidden", () => {
    expect(accentAt(nasFor("all-ok"), true)).toBe("step");
    expect(accentAt(nasFor("all-ok"), false)).toBe("none");
    expect(accentAt(nasFor("new-interface"), true)).toBe("none");
  });

  it("leads a new NAS with Add storage, and a ghost becoming real moves it on", () => {
    const nas: Nas = nasFor("new-nas");
    expect(accentAt(nas, true)).toBe("step");
    expect(nas.steps.find((s) => !s.done)?.id).toBe("storage");
    expect(withFirstStorage(nas).steps.find((s) => !s.done)?.id).toBe("folder");
  });
});

describe("words and layout", () => {
  it("says what a node feeds when the lines are dropped", () => {
    expect(feedsWords(["Photos"])).toBe("Feeds Photos");
    expect(feedsWords(["A", "B", "C"])).toBe("Feeds A, B and C");
    expect(feedsWords(["A", "B", "C", "D", "E"])).toBe("Feeds A, B and 3 more");
  });

  it("chooses five lanes, three lanes, or rows by the content width", () => {
    expect(layoutFor(1096)).toBe("wide");
    expect(layoutFor(836)).toBe("mid");
    expect(layoutFor(358)).toBe("narrow");
  });

  it("balances the add-on tiles into full rows", () => {
    expect(tileColumns(3, 4)).toBe(3);
    expect(tileColumns(4, 3)).toBe(2);
    expect(tileColumns(5, 4)).toBe(3);
    expect(tileColumns(3, 1)).toBe(1);
  });

  it("sums a lane for its row at 390", () => {
    const nas = nasFor("needs-you");
    expect(laneSummary(nas, "disks", areaStates(nas))).toEqual({
      count: "6",
      health: "warning",
      word: "Warning",
    });
    expect(laneSummary(nas, "ways", areaStates(nas)).count).toBe("3 on");
  });
});
