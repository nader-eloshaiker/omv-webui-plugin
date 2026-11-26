// SPDX-License-Identifier: GPL-3.0-or-later
// The chart lab's pure rules: what a meter reads from a file system row, the waffle's squares and
// its gap at the mark, the live window and its honest span, the chart geometry's gaps, each network
// half's own scale, and the temperatures' limit, their groups by array, pool and kind, and what the
// dashboard shows past eight disks.
import { describe, expect, it } from "vitest";
import {
  NO_READINGS,
  record,
  seriesOf,
  STILL_COUNT,
  STILL_START,
  stillFeed,
  stillReadings,
} from "./feed.ts";
import type { DiskGroup, DiskTemp, VolumesRead } from "./model.ts";
import {
  arrayName,
  arrayState,
  DASHBOARD_ALL,
  dashboardSplit,
  diskGroups,
  DISKS,
  DISKS_24,
  DRIVE_BOX,
  EVERY_MS,
  FILE_SYSTEMS,
  linePath,
  liveAlt,
  MIN_RATE_SCALE,
  niceMax,
  onDisk,
  overLimit,
  PLOT_H,
  poolLayout,
  poolState,
  rateScale,
  restWords,
  runsOf,
  sharedLimit,
  SMART_SETTINGS,
  spaceOf,
  spanWords,
  tempOf,
  tempScale,
  trimmed,
  VOLUMES,
  VOLUMES_24,
  waffleDrawing,
  waffleOf,
  WINDOW_MS,
  withCopy,
  yAt,
} from "./model.ts";

/** The figures carry a non-breaking space before their unit, as the pages write them. */
const nb = (words: string) =>
  words.replace(/(\d) (?=[%A-Za-z°])/gu, "$1\u00a0");

/** Only the degrees carry the non-breaking space: "16 disks" keeps an ordinary one. */
const degrees = (words: string) => words.replace(/ °C/gu, "\u00a0°C");

const fixture = (id: string) => {
  const f = FILE_SYSTEMS.find((x) => x.id === id);
  if (!f) {
    throw new Error(id);
  }
  return f;
};

describe("space", () => {
  it("reads percentage, available, size and the admin's mark from the file system row", () => {
    const data = spaceOf(fixture("data"));
    expect(data).toMatchObject({
      name: "Data drive",
      used: 62,
      free: nb("1.4 TiB"),
      total: nb("3.6 TiB"),
      mark: 85,
      over: false,
    });
    expect(data?.valueText).toBe(
      nb("62 % used, 1.4 TiB free of 3.6 TiB, the warning mark is at 85 %."),
    );
  });

  it("has no mark when the admin set 0, and is over only at or past the mark", () => {
    expect(spaceOf(fixture("tank"))?.mark).toBeNull();
    expect(spaceOf(fixture("media"))).toMatchObject({ used: 91, over: true });
  });

  it("has no reading for a file system that sends -1", () => {
    const missing = {
      ...fixture("data"),
      read: {
        ...fixture("data").read,
        percentage: -1,
        size: "-1",
        available: "-1",
      },
    };
    expect(spaceOf(missing)).toBeNull();
  });

  it("crosses the Data drive's mark after the 1 TiB copy", () => {
    const after = withCopy(FILE_SYSTEMS).find((f) => f.id === "data");
    expect(after && spaceOf(after)).toMatchObject({
      used: 90,
      free: nb("409.6 GiB"),
      over: true,
    });
  });

  it("fills squares exactly, the last one in part, a column at a time from the bottom", () => {
    const w = waffleOf(62.4, 85, { cols: 20, rows: 5 });
    expect(w.share).toBe(1);
    expect(w.squares.slice(0, 62).every((q) => q.fill === 1)).toBe(true);
    expect(w.squares[62]?.fill).toBeCloseTo(0.4);
    expect(w.squares[63]?.fill).toBe(0);
    // Square 62 is the third from the bottom of the thirteenth column.
    expect(w.squares[62]).toMatchObject({ col: 12, row: 2 });
    expect(waffleOf(50, null, { cols: 10, rows: 2 }).mark).toBeNull();
  });

  it("puts OMV's default mark between two columns at every size", () => {
    for (const shape of [
      { cols: 20, rows: 5 },
      { cols: 20, rows: 2 },
    ]) {
      const w = waffleOf(62, 85, shape);
      expect(w.mark).toMatchObject({ value: 85, col: 17, j: 0 });
      expect(w.squares.findIndex((q) => q.past)).toBe(w.mark?.at);
    }
  });

  it("opens a gap at the mark: a straight rule between columns, a stepped one inside a column", () => {
    const shape = { cols: 20, rows: 5 };
    const size = { sq: 7, gap: 2, wide: 6, ext: 3 };
    const straight = waffleDrawing(waffleOf(62, 85, shape), shape, size);
    expect(straight.width).toBe(20 * 9 - 2 + 6);
    expect(straight.rule).toMatch(/^M[\d.]+ 0V[\d.]+$/u);
    // The last square before the mark and the first past it are a wider gap apart than any others.
    const before = straight.at[84];
    const after = straight.at[85];
    expect(before && after && after.x - (before.x + size.sq)).toBe(
      size.gap + size.wide,
    );
    const stepped = waffleDrawing(waffleOf(41, 88, shape), shape, size);
    expect(stepped.rule).toMatch(/H/u);
    // 88 % is 17 columns and three squares: the fourth square of column 17 moves with the past ones.
    expect(stepped.at[87]?.x).toBe(17 * 9);
    expect(stepped.at[88]?.x).toBe(17 * 9 + 6);
    const none = waffleDrawing(waffleOf(28, null, shape), shape, size);
    expect(none.rule).toBeNull();
    expect(none.width).toBe(20 * 9 - 2);
  });

  it("marks the used squares past the mark, which take the warning fill only with the word", () => {
    const media = spaceOf(fixture("media"));
    const w = waffleOf(media?.used ?? 0, media?.mark ?? null, {
      cols: 20,
      rows: 5,
    });
    expect(w.squares.filter((q) => q.past && q.fill > 0)).toHaveLength(6);
    expect(media?.over).toBe(true);
    expect(spaceOf(fixture("data"))?.over).toBe(false);
  });
});

describe("live readings", () => {
  it("keeps two minutes and says how far back honestly", () => {
    const samples = Array.from({ length: 70 }, (_, i) => ({
      t: STILL_START + i * EVERY_MS,
    }));
    const { kept, dropped } = trimmed(samples);
    expect(dropped).toBe(true);
    expect(kept.length).toBe(WINDOW_MS / EVERY_MS);
    expect(spanWords(kept, dropped)).toBe("Last 2 minutes");
    expect(spanWords(samples.slice(0, 5), false)).toBe("Since 10:31");
    expect(spanWords(samples.slice(0, 1), false)).toBe("One reading, at 10:31");
    expect(spanWords([], false)).toBe("No reading yet");
  });

  it("has a network rate only from the second reading, as the app derives it", () => {
    const feed = stillFeed();
    const one = record(NO_READINGS, feed.next(STILL_START));
    expect(seriesOf(one).rx).toHaveLength(0);
    const two = record(one, feed.next(STILL_START + EVERY_MS));
    expect(seriesOf(two).rx).toHaveLength(1);
    expect(seriesOf(two).memTotal).toBe(4104114176);
  });

  it("gives the same 40 readings every time for still=1", () => {
    const a = seriesOf(stillReadings().readings);
    const b = seriesOf(stillReadings().readings);
    expect(a.cpu).toHaveLength(STILL_COUNT);
    expect(a).toEqual(b);
    expect(a.last).toBe(STILL_START + (STILL_COUNT - 1) * EVERY_MS);
  });

  it("breaks the line at a pause or a missing value, never joining across it", () => {
    const points = [
      { t: 0, v: 1 },
      { t: 2000, v: 2 },
      { t: 4000, v: null },
      { t: 6000, v: 3 },
      { t: 30000, v: 4 },
      { t: 32000, v: 5 },
    ];
    expect(runsOf(points).map((r) => r.length)).toEqual([2, 1, 2]);
    expect(linePath(points, 32000, 10).match(/M/gu)).toHaveLength(3);
  });

  it("states the value now and the range seen", () => {
    const points = [
      { t: STILL_START, v: 3 },
      { t: STILL_START + EVERY_MS, v: 41 },
      { t: STILL_START + 2 * EVERY_MS, v: 12 },
    ];
    expect(
      liveAlt("Processor", points, false, (n) => nb(`${String(n)} %`)),
    ).toBe(nb("Processor: 12 % now, between 3 % and 41 % since 10:31."));
  });

  it("rounds a scale up to 1, 2 or 5 times a power of ten", () => {
    expect(niceMax(0.2)).toBe(1);
    expect(niceMax(1.3)).toBe(2);
    expect(niceMax(38)).toBe(50);
    expect(niceMax(92)).toBe(100);
  });

  it("scales each half of the network chart on its own, from the readings seen", () => {
    const at = (vs: number[]) =>
      vs.map((v, i) => ({ t: STILL_START + i * EVERY_MS, v }));
    expect(rateScale(at([0.4, 38, 12]))).toBe(50);
    expect(rateScale(at([0.8, 1.7, 1.1]))).toBe(2);
    expect(rateScale(at([]))).toBe(MIN_RATE_SCALE);
    // The still set: a copy in at up to about 90 MiB/s, with about 1 MiB/s going out.
    const s = seriesOf(stillReadings().readings);
    expect(rateScale(s.rx)).toBe(100);
    expect(rateScale(s.tx)).toBe(2);
  });

  it("keeps a trickle out of 0.1 MiB/s clear of the baseline on the minimum scale", () => {
    const tiny = rateScale([{ t: 0, v: 0.1 }]);
    expect(tiny).toBe(1);
    const middle = PLOT_H / 2;
    // On its own scale a tenth of the half's height: about 5 of the plot's 100 units, so 5px on
    // the 112px plot and 4px on the compact one.
    expect(yAt(0.1, tiny, "down") - middle).toBeGreaterThan(4.5);
    // On the traffic in's scale it would lie on the baseline.
    expect(yAt(0.1, 100, "down") - middle).toBeLessThan(0.1);
  });
});

describe("temperatures", () => {
  const disks = DISKS.map((d) => tempOf(d, SMART_SETTINGS));

  it("reads text or numbers, and leaves a sleeping disk unread", () => {
    expect(disks.map((d) => d.c)).toEqual([34, 36, 35, 37, null, 31]);
    expect(disks.find((d) => d.device === "sdd")?.asleep).toBe(true);
  });

  it("draws the limit only when one is set", () => {
    expect(sharedLimit(disks)).toBe(45);
    const none = DISKS.map((d) => tempOf(d, { tempmax: 0 }));
    expect(sharedLimit(none)).toBeNull();
    expect(tempScale(disks, 45)).toMatchObject({ lo: 25, hi: 50 });
  });
});

describe("the drive pictures", () => {
  it("keeps the hard disk to SSD proportion, and the tile's length is the temperature scale's", () => {
    for (const size of ["marker", "tile", "large"] as const) {
      const { hdd, ssd } = DRIVE_BOX[size];
      expect(ssd.h / hdd.h).toBeGreaterThan(0.7);
      expect(ssd.h / hdd.h).toBeLessThan(0.9);
    }
    expect(DRIVE_BOX.tile.hdd.h).toBe(56);
    expect(DRIVE_BOX.tile.nvme.w).toBe(56);
  });
});

describe("the groups: each array and pool, then the rest by kind", () => {
  const six = DISKS.map((d) => tempOf(d, SMART_SETTINGS));
  const bay = DISKS_24.map((d) => tempOf(d, SMART_SETTINGS));
  const names = (g: DiskGroup | undefined) => g?.disks.map((d) => d.device);
  const temp = (device: string): DiskTemp => ({
    device,
    file: `/dev/${device}`,
    links: [`/dev/disk/by-id/ata-EXAMPLE-${device}`],
    kind: "hdd",
    c: 40,
    asleep: false,
    limit: 45,
  });
  const none: VolumesRead = { arrays: [], pools: [], labels: [] };

  it("groups the six disks as the dashboard has them: Backup of sdb and sdc, tank on sdd", () => {
    const groups = diskGroups(six, VOLUMES);
    expect(groups.map((g) => [g.title, names(g)])).toEqual([
      ["Backup, Mirror (RAID 1)", ["sdb", "sdc"]],
      ["tank, ZFS pool (single disk)", ["sdd"]],
      ["Hard disks", ["sda"]],
      ["SSDs", ["sde"]],
      ["NVMe SSDs, on the mainboard", ["nvme0n1"]],
    ]);
    expect(groups.map((g) => g.from)).toEqual([
      "md",
      "zfs",
      "kind",
      "kind",
      "kind",
    ]);
    expect(groups.every((g) => g.state === null)).toBe(true);
  });

  it("puts every one of the 24 disks in exactly one group", () => {
    const groups = diskGroups(bay, VOLUMES_24);
    const all = groups.flatMap((g) => g.disks.map((d) => d.device));
    expect(all).toHaveLength(24);
    expect(new Set(all).size).toBe(24);
    expect([...all].sort()).toEqual(bay.map((d) => d.device).sort());
    expect(groups.map((g) => [g.title, g.disks.length])).toEqual([
      ["Backup, Mirror (RAID 1)", 2],
      ["Apps, Mirror (RAID 1)", 2],
      ["Archive, Double parity (RAID 6)", 8],
      ["tank, ZFS pool (mirror)", 2],
      ["Hard disks", 8],
      ["SSDs", 2],
    ]);
    // At least two arrays, one pool and some disks in none.
    expect(groups.filter((g) => g.from === "md").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(groups.filter((g) => g.from === "zfs")).toHaveLength(1);
    expect(groups.filter((g) => g.from === "kind").length).toBeGreaterThan(0);
  });

  it("keeps the members in their array, partitions and by-id paths included, in device order", () => {
    const groups = diskGroups(bay, VOLUMES_24);
    expect(names(groups[0])).toEqual(["sdb", "sdc"]);
    // md2's members are partitions (/dev/sdf1), tank's are by-id paths to a partition.
    expect(names(groups[2])).toEqual([
      "sdf",
      "sdg",
      "sdh",
      "sdj",
      "sdk",
      "sdl",
      "sdm",
      "sdn",
    ]);
    expect(names(groups[3])).toEqual(["sdd", "sde"]);
    // None of a volume's members is in a kind group as well.
    const inKind = groups
      .filter((g) => g.from === "kind")
      .flatMap((g) => g.disks.map((d) => d.device));
    for (const g of groups.filter((x) => x.from !== "kind")) {
      for (const d of g.disks) {
        expect(inKind).not.toContain(d.device);
      }
    }
  });

  it("keeps an NVMe stick in its array, drawn as a stick, and out of the NVMe group", () => {
    const groups = diskGroups(bay, VOLUMES_24);
    const apps = groups.find((g) => g.title.startsWith("Apps"));
    expect(names(apps)).toEqual(["nvme0n1", "nvme1n1"]);
    expect(apps?.disks.every((d) => d.kind === "nvme")).toBe(true);
    expect(groups.find((g) => g.id === "kind:nvme")).toBeUndefined();
    // Without the arrays, the same sticks are the NVMe group.
    expect(
      names(diskGroups(bay, none).find((g) => g.id === "kind:nvme")),
    ).toEqual(["nvme0n1", "nvme1n1"]);
  });

  it("shows a disk in two volumes once, in the first", () => {
    const groups = diskGroups([temp("sda"), temp("sdb")], {
      arrays: [
        {
          devicefile: "/dev/md0",
          name: "",
          level: "raid1",
          devices: ["/dev/sda1", "/dev/sdb1"],
          state: "clean",
          syncaction: "idle",
        },
      ],
      pools: [
        {
          status: { name: "tank", state: "ONLINE" },
          devices: [
            { devicefile: "/dev/disk/by-id/ata-EXAMPLE-sda-part2", vdev: "" },
          ],
        },
      ],
      labels: [],
    });
    expect(groups.map((g) => [g.title, names(g)])).toEqual([
      ["RAID md0, Mirror (RAID 1)", ["sda", "sdb"]],
    ]);
  });

  it("matches a partition to its disk by the kernel's naming, and nothing else", () => {
    expect(onDisk("/dev/sdb", "/dev/sdb")).toBe(true);
    expect(onDisk("/dev/sdb1", "/dev/sdb")).toBe(true);
    expect(onDisk("/dev/sdba", "/dev/sdb")).toBe(false);
    expect(onDisk("/dev/nvme0n1p1", "/dev/nvme0n1")).toBe(true);
    // nvme0n10 is another disk, not a partition of nvme0n1.
    expect(onDisk("/dev/nvme0n10", "/dev/nvme0n1")).toBe(false);
    expect(onDisk("/dev/disk/by-id/ata-X-part1", "/dev/disk/by-id/ata-X")).toBe(
      true,
    );
    expect(onDisk("/dev/disk/by-id/ata-X2", "/dev/disk/by-id/ata-X")).toBe(
      false,
    );
  });

  it("names an array by its file system's label, then mdadm's own name, then its device", () => {
    const labels = [{ devicename: "md0", label: "Backup" }];
    expect(arrayName({ devicefile: "/dev/md0", name: "" }, labels)).toBe(
      "Backup",
    );
    expect(
      arrayName({ devicefile: "/dev/md1", name: "othernas:media" }, labels),
    ).toBe("media");
    expect(arrayName({ devicefile: "/dev/md2", name: "" }, labels)).toBe(
      "RAID md2",
    );
  });

  it("says a pool's arrangement from its groups, not from a disk being replaced", () => {
    const d = (vdev: string) => ({ devicefile: "/dev/sdx", vdev });
    expect(poolLayout([d("mirror-0"), d("mirror-0")])).toBe("mirror");
    expect(
      poolLayout([d("mirror-0"), d("replacing-1"), d("replacing-1")]),
    ).toBe("mirror");
    expect(poolLayout([d("raidz1-0"), d("raidz1-0"), d("raidz1-0")])).toBe(
      "RAID-Z1",
    );
    expect(poolLayout([d("")])).toBe("single disk");
    expect(poolLayout([d(""), d("")])).toBe("stripe");
  });

  it("says an array or pool is rebuilding or short of a disk only when it is", () => {
    const groups = diskGroups(bay, VOLUMES_24);
    expect(groups.find((g) => g.title.startsWith("Archive"))?.state).toEqual({
      tone: "warning",
      words: "Rebuilding",
    });
    expect(groups.filter((g) => g.state !== null).map((g) => g.title)).toEqual([
      "Archive, Double parity (RAID 6)",
    ]);
    expect(
      arrayState({ state: "clean, degraded", syncaction: "idle" }),
    ).toEqual({ tone: "warning", words: "A disk is missing or has failed" });
    expect(arrayState({ state: "clean", syncaction: "idle" })).toBeNull();
    const pool = (state: string, vdev = "mirror-0") => ({
      status: { name: "tank", state },
      devices: [{ devicefile: "/dev/sdx", vdev }],
    });
    expect(poolState(pool("ONLINE"))).toBeNull();
    expect(poolState(pool("DEGRADED"))?.words).toBe(
      "A disk is missing or has failed",
    );
    expect(poolState(pool("DEGRADED", "replacing-1"))?.words).toBe(
      "Rebuilding",
    );
    expect(poolState(pool("FAULTED"))?.tone).toBe("critical");
  });
});

describe("on the dashboard", () => {
  const six = DISKS.map((d) => tempOf(d, SMART_SETTINGS));
  const bay = DISKS_24.map((d) => tempOf(d, SMART_SETTINGS));

  it("shows every disk up to eight", () => {
    const groups = diskGroups(six, VOLUMES);
    expect(six.length).toBeLessThanOrEqual(DASHBOARD_ALL);
    expect(dashboardSplit(groups)).toEqual({ shown: groups, rest: [] });
  });

  it("past eight, shows the groups with a disk over the limit and sums up the rest", () => {
    const split = dashboardSplit(diskGroups(bay, VOLUMES_24));
    expect(split.shown.map((g) => g.title)).toEqual(["Hard disks"]);
    const rest = split.rest.flatMap((g) => g.disks);
    expect(rest).toHaveLength(16);
    expect(restWords(rest, false, 45)).toBe(
      degrees(
        "The other 16 disks are between 31 °C and 43 °C, under the alert limit of 45 °C.",
      ),
    );
  });

  it("never hides a disk over the limit, wherever it is", () => {
    // Each disk in turn over the limit, in an array, a pool or no volume.
    for (const hot of bay) {
      const disks = bay.map((d) =>
        d.device === hot.device ? { ...d, c: 47, asleep: false } : d,
      );
      const split = dashboardSplit(diskGroups(disks, VOLUMES_24));
      const hidden = split.rest.flatMap((g) => g.disks);
      expect(hidden.filter(overLimit)).toEqual([]);
      expect(
        split.shown.flatMap((g) => g.disks).map((d) => d.device),
      ).toContain(hot.device);
    }
  });

  it("says what the hidden disks are, counting only those read", () => {
    const disk = (device: string, c: number | null): DiskTemp => ({
      device,
      file: `/dev/${device}`,
      links: [],
      kind: "hdd",
      c,
      asleep: c === null,
      limit: 45,
    });
    expect(restWords([disk("sda", 30), disk("sdb", 34)], true, 45)).toBe(
      degrees(
        "All 2 disks are between 30 °C and 34 °C, under the alert limit of 45 °C.",
      ),
    );
    expect(restWords([disk("sda", 30), disk("sdb", null)], false, null)).toBe(
      degrees("1 of the other 2 disks is at 30 °C."),
    );
    expect(restWords([disk("sda", null)], false, 45)).toBe(
      "None of the other 1 disk has a temperature reading.",
    );
  });
});
