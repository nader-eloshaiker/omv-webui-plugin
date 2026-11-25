// SPDX-License-Identifier: GPL-3.0-or-later
import {
  bytesText,
  CHECK_RESULT,
  checkable,
  DISKS,
  diskSummary,
  DRIVES,
  filterCounts,
  FOLDERS,
  folderSummary,
  groupDisks,
  groupFolders,
  listWords,
  middleTruncate,
  sharedState,
  sortDisks,
  sortFolders,
  worst,
} from "./model.ts";

const mounted = DRIVES.map((d) => ({ ...d, mounted: true, free: d.size / 2 }));

describe("a state said once for a group", () => {
  it("picks the word most items share, when at least two share it", () => {
    const words: (string | null)[] = ["Not checked", "OK", "Not checked", null];
    const shared = sharedState(words, (w) => w);
    expect(shared?.word).toBe("Not checked");
    expect(shared?.items).toHaveLength(2);
    expect(sharedState(["OK", "Warning", null], (w) => w)).toBeNull();
  });

  it("gives equal counts to the word met first", () => {
    expect(sharedState(["A", "B", "B", "A"], (w) => w)?.word).toBe("A");
  });

  it("lists names with commas and a last and", () => {
    expect(listWords(["sda"])).toBe("sda");
    expect(listWords(["sda", "sdb", "sdc"])).toBe("sda, sdb and sdc");
  });
});

describe("numbers and paths (spec 4.5, 4.8)", () => {
  it("writes binary units with one decimal and a non-breaking space", () => {
    expect(bytesText(3.6 * 1024 ** 4)).toBe("3.6 TiB");
    expect(bytesText(512)).toBe("512 B");
  });

  it("keeps a long path's start and end", () => {
    const path = "/srv/dev-disk-by-uuid-0000/Photos/";
    const short = middleTruncate(path, 16);
    expect(short).toHaveLength(16);
    expect(short.startsWith("/srv/de")).toBe(true);
    expect(short.endsWith("hotos/")).toBe(true);
    expect(middleTruncate("short", 16)).toBe("short");
  });

  it("ranks Unknown above OK, so a set with one unread member is never fine", () => {
    expect(worst(["ok", "unknown", "ok"])).toBe("unknown");
    expect(worst(["unknown", "warning"])).toBe("warning");
  });
});

describe("the shared folders table (spec 4.9)", () => {
  it("answers its question in the summary, worst first", () => {
    expect(folderSummary(FOLDERS, DRIVES)).toEqual([
      "4 shared folders",
      "1 not reachable",
      "3 shared with Windows and Mac",
    ]);
    expect(folderSummary(FOLDERS, mounted)).toEqual([
      "4 shared folders",
      "3 shared with Windows and Mac",
    ]);
  });

  it("counts each filter chip", () => {
    expect(filterCounts(FOLDERS, DRIVES)).toEqual({
      all: 4,
      unreachable: 1,
      shared: 3,
      unshared: 1,
    });
  });

  it("groups by drive with the unreachable drive first, and moves it down once it is back", () => {
    const names = (drives: typeof DRIVES) =>
      groupFolders(
        sortFolders(FOLDERS, drives, "status", "ascending"),
        drives,
      ).map((g) => g.drive?.name);
    expect(names(DRIVES)).toEqual(["Media drive", "Data drive"]);
    expect(names(mounted)).toEqual(["Data drive", "Media drive"]);
  });

  it("does not group when every folder is on one drive", () => {
    const one = FOLDERS.filter((f) => f.drive === "data");
    const groups = groupFolders(one, DRIVES);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.drive).toBeNull();
  });
});

describe("the disks table (spec 4.9)", () => {
  it("groups system, in use, empty and removable disks, in that order", () => {
    expect(
      groupDisks(sortDisks(DISKS, "health", "ascending")).map((g) => [
        g.name,
        g.disks.map((d) => d.device),
      ]),
    ).toEqual([
      ["System disk", ["nvme0n1"]],
      ["In use", ["sda", "sdc"]],
      ["Empty, ready to use", ["sdb", "sdd"]],
      ["Removable and optical", ["sde", "sr0"]],
    ]);
  });

  it("moves a disk that turns Warning to the top of its group", () => {
    const checked = DISKS.map((d) =>
      checkable(d) ? { ...d, ...CHECK_RESULT[d.id] } : d,
    );
    const empty = groupDisks(sortDisks(checked, "health", "ascending")).find(
      (g) => g.id === "empty",
    );
    expect(empty?.disks.map((d) => d.device)).toEqual(["sdd", "sdb"]);
    expect(empty?.health).toBe("warning");
  });

  it("says the health is not checked until every readable disk is", () => {
    expect(diskSummary(DISKS).parts).toEqual([
      "7 disks",
      "health not checked since you signed in",
    ]);
    const checked = DISKS.map((d) =>
      checkable(d) ? { ...d, ...CHECK_RESULT[d.id] } : d,
    );
    expect(diskSummary(checked)).toEqual({
      parts: ["7 disks", "1 warning", "health checked just now"],
      checked: true,
      worst: "warning",
    });
  });
});
