// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import type { MapDisk, Nas, StorageRow } from "./model.ts";
import {
  accentAt,
  answerOf,
  attentionRows,
  bayLayout,
  capRowFolders,
  diskKey,
  folderState,
  layoutFor,
  MAP_ACTIONS,
  mapActions,
  mapRows,
  mapView,
  moveInRows,
  nasFor,
  needsYou,
  otherAddOns,
  rowKeys,
  rowName,
  stripWords,
  traceOf,
  wayName,
  waysLayout,
  withFirstStorage,
  withoutSdbWarning,
  withSdbWarning,
} from "./model.ts";
import { assembleFor } from "./welcome.ts";

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
      title: "Everything is working.",
      reason:
        "The disks reported no problem at 10:31. All four drives have space.",
      tone: "ok",
    });
  });

  it("counts what needs the person and gives the worst one's reason", () => {
    const answer = answerOf(nasFor("needs-you"));
    expect(answer.title).toBe("Four things need you.");
    expect(answer.reason).toMatch(/^Disk sdb reports a problem/u);
    expect(answer.tone).toBe("warning");
  });

  it("puts a critical problem first, whatever order it was found in", () => {
    const answer = answerOf(nasFor("disk-critical"));
    expect(answer.title).toBe("Two things need you.");
    expect(answer.tone).toBe("critical");
  });

  it("welcomes a new NAS instead of judging it", () => {
    expect(answerOf(nasFor("new-nas")).title).toBe("Welcome to your NAS.");
  });

  it("says which lane could not be read and that the rest is fine", () => {
    expect(answerOf(nasFor("lane-failed"))).toEqual({
      title: "Part of the NAS could not be read.",
      reason: "The disks could not be read. Everything else is OK.",
      tone: "unknown",
    });
  });

  it("is always a full sentence, one thing or many", () => {
    const one = withSdbWarning(nasFor("all-ok"));
    expect(answerOf(one).title).toBe("One thing needs you.");
    for (const state of [
      "all-ok",
      "needs-you",
      "new-nas",
      "lane-failed",
    ] as const) {
      expect(answerOf(nasFor(state)).title).toMatch(/^[A-Z].*\.$/u);
    }
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

describe("a row's caps (6.8 item 9)", () => {
  it("keeps up to six disks as slots", () => {
    const disks = Array.from({ length: 6 }, (_, i) => disk(`sd${String(i)}`));
    expect(bayLayout(disks)).toEqual({ full: disks, strip: [] });
  });

  it("folds healthy disks beyond six into the strip and keeps every disk in trouble full size", () => {
    const disks = [
      ...Array.from({ length: 7 }, (_, i) => disk(`sd${String(i)}`)),
      disk("bad", "warning"),
      disk("worse", "critical"),
    ];
    const { full, strip } = bayLayout(disks);
    expect(full.map((d) => d.device)).toEqual(["bad", "worse"]);
    expect(strip).toHaveLength(7);
    expect(stripWords(strip, true)).toBe("7 more, all OK");
  });

  it("says how many in the strip are not checked", () => {
    const strip = [disk("a"), disk("b", "unknown"), disk("c", "unknown")];
    expect(stripWords(strip, false)).toBe("3 disks: 1 OK, 2 not checked");
  });

  it("shows six folders; beyond six, five (those in trouble first) and the rest as more", () => {
    const folders = Array.from({ length: 8 }, (_, i) => ({
      id: `f${String(i)}`,
      name: "",
      via: [],
      health: i === 7 ? ("warning" as const) : ("ok" as const),
      word: "",
    }));
    expect(capRowFolders(folders.slice(0, 6)).hidden).toEqual([]);
    const { shown, hidden } = capRowFolders(folders);
    expect(shown).toHaveLength(5);
    expect(shown[0]?.id).toBe("f7");
    expect(hidden).toHaveLength(3);
  });

  it("shows only the ways in that are on, the rest in one line", () => {
    const { on, off } = waysLayout(nasFor("all-ok").ways);
    expect(on.map((w) => w.id)).toEqual(["smb", "nfs", "ssh"]);
    expect(off).toBe("Off: Copies to other NAS");
  });
});

const storageRows = (nas: Nas) =>
  mapRows(nas).filter((r): r is StorageRow => r.kind === "storage");

describe("the map's rows (6.8)", () => {
  it("puts rows with a problem first, then the fullest, the system drive last and unused disks at the end", () => {
    const rows = mapRows(nasFor("needs-you"));
    expect(rows.map((r) => r.id)).toEqual([
      "row:s:data",
      "row:s:backup",
      "row:s:tank",
      "row:s:system",
      "row:unused",
    ]);
  });

  it("puts a critical row before a warning one", () => {
    const nas = nasFor("disk-critical");
    const withFull: Nas = {
      ...nas,
      storage: nas.storage.map((s) =>
        s.id === "s:tank"
          ? { ...s, health: "warning", word: "Almost full" }
          : s,
      ),
    };
    expect(storageRows(withFull).map((r) => r.storage.id)).toEqual([
      "s:data",
      "s:tank",
      "s:backup",
      "s:system",
    ]);
  });

  it("lets a problem flow right along its row only", () => {
    const rows = storageRows(nasFor("needs-you"));
    const backup = rows.find((r) => r.storage.id === "s:backup");
    const data = rows.find((r) => r.storage.id === "s:data");
    const tank = rows.find((r) => r.storage.id === "s:tank");
    // sdb's warning: the connector from the disks, the storage and its folders.
    expect(backup?.tone).toBe("warning");
    expect(backup?.diskTrouble).toBe(true);
    expect(
      backup?.folders.shown.map((f) => folderState(f, backup.tone)?.word),
    ).toEqual(["At risk", "At risk"]);
    // A full storage marks its folders, but its disk is fine.
    expect(data?.tone).toBe("warning");
    expect(data?.diskTrouble).toBe(false);
    // Nothing on another row changes.
    expect(tank?.tone).toBeNull();
    expect(tank?.folders.shown.map((f) => folderState(f, tank.tone))).toEqual([
      null,
    ]);
  });

  it("caps storage at six rows: the problem ones, then the fullest, then a row of the rest", () => {
    const rows = mapRows(nasFor("many"));
    expect(rows.map((r) => r.id)).toEqual([
      "row:s:media2",
      "row:s:media1",
      "row:s:archive",
      "row:s:photos",
      "row:s:tank",
      "row:more",
    ]);
    const more = rows.at(-1);
    expect(
      more?.kind === "more" && more.hidden.map((r) => r.storage.id),
    ).toEqual(["s:backup", "s:scratch", "s:system"]);
    expect(more && rowName(more)).toBe("3 more, all OK: more storage");
  });

  it("folds a row's disks beyond six into a strip, and its folders beyond six into more", () => {
    const rows = storageRows(nasFor("many"));
    const archive = rows.find((r) => r.storage.id === "s:archive");
    expect(archive?.bay.full).toEqual([]);
    expect(archive?.bay.strip).toHaveLength(8);
    const photos = rows.find((r) => r.storage.id === "s:photos");
    expect(photos?.folders.shown).toHaveLength(5);
    expect(photos?.folders.hidden).toHaveLength(4);
  });

  it("puts a disk in two storages on both rows and says where else it is", () => {
    const nas = nasFor("all-ok");
    const shared: Nas = {
      ...nas,
      disks: nas.disks.map((d) =>
        d.id === "d:nvme0n1" ? { ...d, feeds: ["s:system", "s:tank"] } : d,
      ),
    };
    const rows = storageRows(shared);
    const tank = rows.find((r) => r.storage.id === "s:tank");
    const system = rows.find((r) => r.storage.id === "s:system");
    expect(tank?.disks.find((d) => d.id === "d:nvme0n1")?.alsoIn).toEqual([
      "System drive",
    ]);
    expect(system?.disks.find((d) => d.id === "d:nvme0n1")?.alsoIn).toEqual([
      "tank",
    ]);
    // Pointing at it on one row lights both.
    const trace = traceOf(mapView(shared), diskKey("row:s:tank", "d:nvme0n1"));
    expect([...trace.rows].sort()).toEqual(["row:s:system", "row:s:tank"]);
  });

  it("leaves out the unused disks' row while the disks could not be read", () => {
    expect(
      mapRows(nasFor("lane-failed")).some((r) => r.kind === "unused"),
    ).toBe(false);
  });

  it("gives a new NAS its system row and a row of the disks not in use", () => {
    const rows = mapRows(nasFor("new-nas"));
    expect(rows.map((r) => r.id)).toEqual(["row:s:system", "row:unused"]);
    const unused = rows[1];
    expect(unused && rowName(unused)).toBe(
      "Not in use: disks sda, sdb, sdc, sdd and sde. Add storage to keep files on them.",
    );
  });
});

describe("tracing by highlighting (6.8 item 5)", () => {
  const view = mapView(nasFor("needs-you"));

  it("lights a folder's row and the ways in it is reached by", () => {
    const t = traceOf(view, "f:music");
    expect([...t.rows]).toEqual(["row:s:data"]);
    expect([...t.ways].sort()).toEqual(["nfs", "smb"]);
    expect(t.keys.has("w:smb")).toBe(true);
    expect(t.keys.has("w:ssh")).toBe(false);
  });

  it("lights every folder a way in reaches, wherever it is, and no row", () => {
    const t = traceOf(view, "w:smb");
    expect(t.rows.size).toBe(0);
    expect([...t.keys].filter((k) => k.startsWith("f:")).sort()).toEqual([
      "f:documents",
      "f:music",
      "f:photos",
      "f:timemachine",
    ]);
    expect(traceOf(view, "w:nfs").keys.has("f:archive")).toBe(true);
  });

  it("lights a disk's row", () => {
    const t = traceOf(view, diskKey("row:s:backup", "d:sdc"));
    expect([...t.rows]).toEqual(["row:s:backup"]);
    expect(t.ways.size).toBe(0);
  });

  it("lights every way in and every folder reached from an interface", () => {
    const t = traceOf(view, "n:enp2s0");
    expect([...t.ways].sort()).toEqual(["nfs", "smb", "ssh"]);
    expect(t.keys.has("f:a4share")).toBe(false);
  });
});

describe("moving on the rows with the keyboard", () => {
  const grid = [
    [["d1"], ["s1"], ["f1", "f2", "f3"]],
    [["d2", "d3"], ["s2"], []],
    [["d4"], ["add"], []],
  ];

  it("moves along a row with left and right", () => {
    expect(moveInRows(grid, "s1", "ArrowRight")).toBe("f1");
    expect(moveInRows(grid, "f1", "ArrowLeft")).toBe("s1");
    expect(moveInRows(grid, "f3", "ArrowRight")).toBeNull();
  });

  it("moves to the same column of the next row, or the nearest column it has", () => {
    expect(moveInRows(grid, "s1", "ArrowDown")).toBe("s2");
    expect(moveInRows(grid, "f2", "ArrowDown")).toBe("s2");
    expect(moveInRows(grid, "d3", "ArrowDown")).toBe("d4");
    expect(moveInRows(grid, "d1", "ArrowUp")).toBeNull();
  });

  it("goes to the first and last thing on the map with Home and End", () => {
    expect(moveInRows(grid, "s2", "Home")).toBe("d1");
    expect(moveInRows(grid, "s2", "End")).toBe("add");
  });

  it("knows each row's keys by column", () => {
    const rows = mapRows(nasFor("needs-you"));
    const backup = rows.find((r) => r.id === "row:s:backup");
    expect(backup && rowKeys(backup, true)).toEqual([
      ["row:s:backup/d:sdb", "row:s:backup/d:sdc"],
      ["s:backup"],
      ["f:timemachine", "f:a4share"],
    ]);
  });
});

describe("names for assistive technology (6.8 item 13)", () => {
  it("names a row by its storage, disks, use and folders", () => {
    const rows = storageRows(nasFor("needs-you"));
    expect(rowName(rows[0] as StorageRow)).toBe(
      "Data drive, on disk sda: 92 percent used, almost full. Shared folders: Photos, Music and Documents, at risk.",
    );
    expect(rowName(rows[1] as StorageRow)).toBe(
      "Backup, on disks sdb and sdc: 41 percent used, disk sdb warning. Shared folders: Time Machine and a4share, at risk.",
    );
    expect(rowName(rows[3] as StorageRow)).toBe(
      "System drive, on disk nvme0n1: 10 percent used. It holds the system, so it keeps no shared folders.",
    );
  });

  it("names a way in by its state and the interface it is reached over", () => {
    const nas = nasFor("needs-you");
    const smb = nas.ways.find((w) => w.id === "smb");
    expect(smb && wayName(smb, nas.ifaces)).toBe(
      "Windows and Mac (SMB): running, over enp2s0",
    );
  });
});

describe("the map's actions, once per screen", () => {
  it("lists the footer in reading order, leaving out what the unused row's ghost offers", () => {
    const { footer, ghostAdds } = mapActions(mapView(nasFor("all-ok")), []);
    expect(ghostAdds).toBe(true);
    expect(footer).toEqual([
      "Check disk health",
      "Add a shared folder",
      "Sharing settings",
      "Interfaces",
    ]);
  });

  it("leaves to the first steps what they offer, and the ghost becomes a picture", () => {
    const nas = nasFor("new-nas");
    const { footer, ghostAdds } = mapActions(
      mapView(nas),
      nas.steps.map((s) => s.action),
    );
    expect(ghostAdds).toBe(false);
    expect(footer).toEqual([
      "Check disk health",
      "Sharing settings",
      "Interfaces",
    ]);
  });

  it("offers every action when nothing else on the screen does", () => {
    const nas = nasFor("many");
    expect(mapActions(mapView(nas), []).footer).toEqual([...MAP_ACTIONS]);
  });
});

describe("the accent", () => {
  it("goes to the worst row when something needs the person", () => {
    expect(accentAt(nasFor("needs-you"), true)).toBe("needs-you");
  });

  it("goes to the map's Add a shared folder when there are no folders", () => {
    expect(accentAt(nasFor("no-folders"), true)).toBe("folders-lane");
  });

  it("goes to the current first step otherwise, and nowhere once they are done or hidden", () => {
    expect(accentAt(nasFor("all-ok"), true)).toBe("step");
    expect(accentAt(nasFor("all-ok"), false)).toBe("none");
    expect(accentAt(nasFor("new-interface"), true)).toBe("none");
  });

  it("leads a new NAS with Add storage: the step, or the unused row's when the steps are hidden", () => {
    const nas: Nas = nasFor("new-nas");
    expect(accentAt(nas, true)).toBe("step");
    expect(accentAt(nas, false)).toBe("add-storage");
    expect(nas.steps.find((s) => !s.done)?.id).toBe("storage");
    expect(withFirstStorage(nas).steps.find((s) => !s.done)?.id).toBe("folder");
  });
});

describe("layout", () => {
  it("chooses the wide, 900 or 390 form by the content width", () => {
    expect(layoutFor(1096)).toBe("wide");
    expect(layoutFor(836)).toBe("mid");
    expect(layoutFor(358)).toBe("narrow");
  });

  it("names the add-ons this interface does not draw by their short name, never ZFS or RAID", () => {
    expect(otherAddOns(nasFor("all-ok").addOns)).toEqual(["compose"]);
    expect(otherAddOns(nasFor("many").addOns)).toEqual(["compose", "wol"]);
    expect(otherAddOns(nasFor("new-nas").addOns)).toEqual([]);
  });
});

describe("the first visit (owner decision 10)", () => {
  it("assembles on a first visit only; otherwise, in reduced motion and for a screenshot, no entrance", () => {
    const base = { reduced: false, still: false, loading: false };
    expect(assembleFor({ ...base, firstVisit: true })).toBe("full");
    expect(assembleFor({ ...base, firstVisit: false })).toBe("none");
    expect(assembleFor({ ...base, firstVisit: true, reduced: true })).toBe(
      "none",
    );
    expect(assembleFor({ ...base, firstVisit: true, still: true })).toBe(
      "none",
    );
  });
});
