// SPDX-License-Identifier: GPL-3.0-or-later
import {
  ALL_READ,
  baseNas,
  diskCriticalNas,
  manyNas,
  needsYouNas,
  newNas,
} from "../../fixtures/nas-fixtures";
import {
  ADD_STORAGE_KEY,
  bayLayout,
  capFolders,
  diskKey,
  folderKey,
  folderState,
  isNewNas,
  moreFoldersKey,
  moveInRows,
  nasMapActions,
  nasMapRows,
  nasMapView,
  rowKeys,
  sharedDiskState,
  storageKey,
  stripCounts,
  traceOf,
  UNUSED_ROW,
  wayKey,
  waysRunning,
  type NasFolder,
  type NasMapInput,
  type NasRowDisk,
  type NasStorageRow,
} from "./nas-map-model";

const names = (input: NasMapInput) =>
  nasMapRows(input).map((r) =>
    r.kind === "storage" ? r.storage.name : r.kind,
  );

const storageRow = (input: NasMapInput, id: string) =>
  nasMapRows(input).find(
    (r): r is NasStorageRow => r.kind === "storage" && r.storage.id === id,
  );

describe("building the rows from the reads (6.8)", () => {
  it("gives each storage a row with its disks and folders, the system drive last and unused disks at the end", () => {
    expect(names(baseNas())).toEqual([
      "Data drive",
      "Backup",
      "tank",
      "System drive",
      "unused",
    ]);
    const backup = storageRow(baseNas(), "backup");
    expect(backup?.disks.map((d) => d.device)).toEqual(["sdb", "sdc"]);
    expect(backup?.folders.shown.map((f) => f.name)).toEqual([
      "Time Machine",
      "a4share",
    ]);
  });

  it("puts rows with a problem first, worst first, then the fullest", () => {
    const input = needsYouNas();
    expect(names(input).slice(0, 2)).toEqual(["Data drive", "Backup"]);
    const critical: NasMapInput = {
      ...input,
      disks: input.disks.map((d) =>
        d.id === "sdd"
          ? { ...d, health: "critical", healthLabel: "Failing" }
          : d,
      ),
    };
    expect(names(critical)[0]).toBe("tank");
  });

  it("lets a problem flow right along its row only", () => {
    const rows = nasMapRows(diskCriticalNas());
    const data = rows.find((r) => r.id === "row:data") as NasStorageRow;
    expect(data.tone).toBe("critical");
    expect(data.diskTrouble).toBe(true);
    expect(
      rows
        .filter(
          (r): r is NasStorageRow =>
            r.kind === "storage" && r.id !== "row:data",
        )
        .every((r) => r.tone === null),
    ).toBe(true);
    // A storage's own problem tones its row but not the connector from its disks.
    const full = storageRow(needsYouNas(), "data");
    expect(full?.tone).toBe("warning");
    expect(full?.diskTrouble).toBe(false);
  });

  it("caps the storage at six rows: the problem ones and the fullest, then one row of the rest", () => {
    const rows = nasMapRows(manyNas());
    const more = rows.find((r) => r.kind === "more");
    expect(rows.filter((r) => r.kind === "storage")).toHaveLength(5);
    expect(
      more?.kind === "more" && more.hidden.map((r) => r.storage.name),
    ).toContain("System drive");
    // The row with sdj's warning is among those shown.
    expect(names(manyNas())[0]).toBe("Media 2");
  });

  it("folds a row's disks beyond six into a strip, keeping every disk in trouble full size", () => {
    const archive = storageRow(manyNas(), "archive");
    expect(archive?.disks).toHaveLength(8);
    expect(archive?.bay.full).toEqual([]);
    expect(archive?.bay.strip).toHaveLength(8);
    const disks = (archive?.disks ?? []).map((d, i) =>
      i === 2 ? { ...d, health: "warning" as const } : d,
    );
    const bay = bayLayout(disks, 6);
    expect(bay.full.map((d) => d.id)).toEqual([disks[2]?.id]);
    expect(bay.strip).toHaveLength(7);
    expect(stripCounts(bay.strip)).toEqual({ count: 7, ok: 7, unchecked: 0 });
  });

  it("shows six folders; beyond six, five (those in trouble first) and the rest hidden", () => {
    const folder = (
      n: number,
      health: NasFolder["health"] = "ok",
    ): NasFolder => ({
      id: `f${String(n)}`,
      name: `F${String(n)}`,
      ways: [],
      health,
      healthLabel: health,
    });
    expect(capFolders([1, 2, 3, 4, 5, 6].map((n) => folder(n))).hidden).toEqual(
      [],
    );
    const list = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      folder(n, n === 7 ? "unknown" : "ok"),
    );
    const capped = capFolders(list);
    expect(capped.shown.map((f) => f.id)).toEqual([
      "f7",
      "f1",
      "f2",
      "f3",
      "f4",
    ]);
    expect(capped.hidden.map((f) => f.id)).toEqual(["f5", "f6"]);
  });

  it("puts a disk in two storages on both rows and says where else it is", () => {
    const input = baseNas();
    const shared: NasMapInput = {
      ...input,
      disks: input.disks.map((d) =>
        d.id === "nvme0n1" ? { ...d, storage: ["system", "tank"] } : d,
      ),
    };
    const system = storageRow(shared, "system");
    const tank = storageRow(shared, "tank");
    expect(system?.disks[0]?.alsoIn).toEqual(["tank"]);
    expect(tank?.disks.map((d) => d.device)).toContain("nvme0n1");
  });

  it("knows which disks are unused only when the disks and the storage were read", () => {
    const input = newNas();
    expect(nasMapRows(input).at(-1)?.id).toBe(UNUSED_ROW);
    for (const reads of [
      { ...ALL_READ, disks: "failed" as const },
      { ...ALL_READ, storage: "loading" as const },
    ]) {
      expect(
        nasMapRows({ ...input, reads }).some((r) => r.kind === "unused"),
      ).toBe(false);
    }
  });

  it("says a state two or more disks share once, and nothing for healthy ones", () => {
    const row = nasMapRows(newNas()).find((r) => r.kind === "unused");
    const shared = sharedDiskState(row?.disks ?? []);
    expect(shared?.label).toBe("Not checked yet");
    expect(shared?.ids.size).toBe(5);
    const one: NasRowDisk[] = (row?.disks ?? []).slice(0, 1);
    expect(sharedDiskState(one)).toBeNull();
    expect(
      sharedDiskState(storageRow(baseNas(), "backup")?.disks ?? []),
    ).toBeNull();
  });

  it("marks a folder at risk on a row in trouble, its own problem first", () => {
    const folder: NasFolder = {
      id: "f",
      name: "F",
      ways: [],
      health: "ok",
      healthLabel: "OK",
    };
    expect(folderState(folder, null)).toBeNull();
    expect(folderState(folder, "warning")).toEqual({
      health: "warning",
      own: false,
    });
    expect(folderState({ ...folder, health: "critical" }, "warning")).toEqual({
      health: "critical",
      own: true,
    });
  });

  it("lists only the ways in that are on, and says running once for two or more", () => {
    const view = nasMapView(baseNas());
    expect(view.ways.on.map((w) => w.id)).toEqual(["smb", "nfs", "ssh"]);
    expect(view.ways.off.map((w) => w.id)).toEqual(["rsync"]);
    expect(waysRunning(view.ways.on)).toEqual({ running: 3, total: 3 });
    expect(waysRunning(nasMapView(newNas()).ways.on)).toBeNull();
  });

  it("tells a new NAS only when the storage and folders were read", () => {
    expect(isNewNas(newNas())).toBe(true);
    expect(isNewNas(baseNas())).toBe(false);
    expect(
      isNewNas({ ...newNas(), reads: { ...ALL_READ, folders: "failed" } }),
    ).toBe(false);
    expect(isNewNas({ ...newNas(), reads: {} })).toBe(false);
  });
});

describe("tracing by highlighting (6.8 item 5)", () => {
  const view = nasMapView(baseNas());

  it("lights a folder's row and the ways in it is reached by", () => {
    const t = traceOf(view, folderKey("music"));
    expect([...(t?.rows ?? [])]).toEqual(["row:data"]);
    expect(t?.keys.has(wayKey("smb"))).toBe(true);
    expect(t?.keys.has(wayKey("nfs"))).toBe(true);
  });

  it("lights every folder a way in reaches, wherever it is, and no row", () => {
    const t = traceOf(view, wayKey("nfs"));
    expect(t?.rows.size).toBe(0);
    expect(t?.keys.has(folderKey("music"))).toBe(true);
    expect(t?.keys.has(folderKey("archive"))).toBe(true);
    expect(t?.keys.has(folderKey("photos"))).toBe(false);
  });

  it("lights a disk's row, and a storage's", () => {
    expect([
      ...(traceOf(view, diskKey("row:backup", "sdb"))?.rows ?? []),
    ]).toEqual(["row:backup"]);
    expect([...(traceOf(view, storageKey("tank"))?.rows ?? [])]).toEqual([
      "row:tank",
    ]);
  });

  it("lights every way in and every folder reached from an interface", () => {
    const t = traceOf(view, "interface enp2s0");
    expect([...(t?.ways ?? [])]).toEqual(["smb", "nfs", "ssh"]);
    expect(t?.keys.has(folderKey("photos"))).toBe(true);
    expect(t?.keys.has(folderKey("a4share"))).toBe(false);
  });

  it("knows nothing of a key not on the map", () => {
    expect(traceOf(view, "folder nowhere")).toBeNull();
  });

  it("names the hidden folders' 'more' when a way in reaches one of them", () => {
    const many = nasMapView(manyNas());
    const t = traceOf(many, wayKey("smb"));
    expect(t?.keys.has(moreFoldersKey("row:photos"))).toBe(true);
  });
});

describe("moving on the rows with the keyboard", () => {
  const view = nasMapView(baseNas());
  const grid = view.rows.map((r) => rowKeys(r, true));

  it("knows each row's keys by column", () => {
    expect(grid[0]).toEqual([
      [diskKey("row:data", "sda")],
      [storageKey("data")],
      [folderKey("photos"), folderKey("music"), folderKey("documents")],
    ]);
    expect(grid.at(-1)).toEqual([
      [diskKey(UNUSED_ROW, "sde")],
      [ADD_STORAGE_KEY],
      [],
    ]);
  });

  it("moves along a row, and to the same column of the next row", () => {
    expect(moveInRows(grid, storageKey("data"), "ArrowRight")).toBe(
      folderKey("photos"),
    );
    expect(moveInRows(grid, storageKey("data"), "ArrowDown")).toBe(
      storageKey("backup"),
    );
    expect(moveInRows(grid, folderKey("archive"), "ArrowDown")).toBe(
      "storage system",
    );
    expect(
      moveInRows(grid, diskKey("row:data", "sda"), "ArrowLeft"),
    ).toBeNull();
  });

  it("goes to the first and last thing with Home and End", () => {
    expect(moveInRows(grid, storageKey("tank"), "Home")).toBe(
      diskKey("row:data", "sda"),
    );
    expect(moveInRows(grid, storageKey("tank"), "End")).toBe(ADD_STORAGE_KEY);
  });
});

describe("the map's actions, each once on the screen", () => {
  it("leaves out what the unused row's ghost offers", () => {
    const { footer, ghostAdds } = nasMapActions(nasMapView(baseNas()), []);
    expect(ghostAdds).toBe(true);
    expect(footer).toEqual([
      "check-health",
      "add-folder",
      "sharing",
      "interfaces",
    ]);
  });

  it("leaves to the first steps what they offer, and the ghost becomes a picture", () => {
    const { footer, ghostAdds } = nasMapActions(nasMapView(newNas()), [
      "add-storage",
      "add-folder",
    ]);
    expect(ghostAdds).toBe(false);
    expect(footer).toEqual(["check-health", "sharing", "interfaces"]);
  });
});
