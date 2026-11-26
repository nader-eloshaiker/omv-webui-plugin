// SPDX-License-Identifier: GPL-3.0-or-later
// The temperatures' pure rules, from the contract's rows: a reading as text or a number, a sleeping
// disk unread, the one limit and scale; the groups by array, pool and kind, every disk exactly once,
// partitions and by-id paths matched by the kernel's naming; and on the dashboard, past eight disks,
// never a disk over the limit behind the disclosure.
import { describe, expect, it } from "vitest";
import {
  DISKS_24,
  DISKS_6,
  SMART_SETTINGS,
  temperatureGroups,
  VOLUMES_24,
  VOLUMES_6,
} from "../../fixtures/chart-fixtures";
import {
  arrayNameOf,
  arrayStateOf,
  celsiusOf,
  DASHBOARD_ALL,
  dashboardSplit,
  diskGroups,
  diskOverLimit,
  diskTemperatureOf,
  memberOnDisk,
  poolLayoutOf,
  poolStateOf,
  restSummary,
  sharedLimit,
  temperatureScale,
  temperatureShare,
  type DiskGroup,
  type DiskTemperature,
  type VolumeRows,
} from "./disk-temperatures-model";

const six = DISKS_6.map((d) =>
  diskTemperatureOf(
    {
      disk: d.row,
      kind: d.row.devicename.startsWith("nvme")
        ? "nvme"
        : d.row.devicename === "sde"
          ? "ssd"
          : "hdd",
    },
    SMART_SETTINGS,
  ),
);
const names = (g: DiskGroup | undefined) => g?.disks.map((d) => d.device);
/** A group's words, as a test reads them: its source and its own name. */
const key = (g: DiskGroup) =>
  g.from === "md"
    ? `md ${g.name ?? g.device} ${g.level}`
    : g.from === "zfs"
      ? `zfs ${g.name}`
      : `kind ${g.kind}`;
const none: VolumeRows = { arrays: [], pools: [], labels: [] };
const temp = (device: string, c: number | null = 40): DiskTemperature => ({
  device,
  file: `/dev/${device}`,
  links: [`/dev/disk/by-id/ata-EXAMPLE-${device}`],
  kind: "hdd",
  c,
  asleep: c === null,
  limit: 45,
});

describe("a disk's reading", () => {
  it("reads text or numbers, and leaves a sleeping disk unread", () => {
    expect(six.map((d) => d.c)).toEqual([34, 36, 35, 37, null, 31]);
    expect(six.find((d) => d.device === "sdd")?.asleep).toBe(true);
    expect(celsiusOf("")).toBeNull();
    expect(celsiusOf(" 41 ")).toBe(41);
    expect(celsiusOf(Number.NaN)).toBeNull();
  });

  it("takes a disk's own limit over the shared one, and 0 as none", () => {
    const row = DISKS_6[1]?.row;
    if (!row) {
      throw new Error("no row");
    }
    expect(
      diskTemperatureOf({ disk: row, kind: "hdd", tempmax: 50 }, SMART_SETTINGS)
        .limit,
    ).toBe(50);
    expect(
      diskTemperatureOf({ disk: row, kind: "hdd", tempmax: 0 }, SMART_SETTINGS)
        .limit,
    ).toBe(45);
    expect(
      diskTemperatureOf({ disk: row, kind: "hdd" }, { tempmax: 0 }).limit,
    ).toBeNull();
  });

  it("draws the limit only when one is set, on a scale in steps of 5 °C with room either side", () => {
    expect(sharedLimit(six)).toBe(45);
    expect(
      sharedLimit(
        DISKS_6.map((d) =>
          diskTemperatureOf({ disk: d.row, kind: "hdd" }, { tempmax: 0 }),
        ),
      ),
    ).toBeNull();
    const scale = temperatureScale(six, 45);
    expect(scale).toMatchObject({ lo: 25, hi: 50 });
    expect(temperatureShare(45, scale)).toBeCloseTo(0.8);
    expect(temperatureShare(10, scale)).toBe(0);
    expect(temperatureScale([], null)).toMatchObject({ lo: 20, hi: 50 });
  });
});

describe("the groups: each array and pool, then the rest by kind", () => {
  const bay = temperatureGroups(DISKS_24, VOLUMES_24);

  it("groups the six disks as the dashboard has them: Backup of sdb and sdc, tank on sdd", () => {
    const groups = diskGroups(six, VOLUMES_6);
    expect(groups.map((g) => [key(g), names(g)])).toEqual([
      ["md Backup raid1", ["sdb", "sdc"]],
      ["zfs tank", ["sdd"]],
      ["kind hdd", ["sda"]],
      ["kind ssd", ["sde"]],
      ["kind nvme", ["nvme0n1"]],
    ]);
    expect(groups.every((g) => g.state === null)).toBe(true);
    const tank = groups.find((g) => g.from === "zfs");
    expect(tank?.from === "zfs" && tank.layout).toEqual({
      kinds: [],
      groups: 0,
      members: 1,
    });
  });

  it("puts every one of the 24 disks in exactly one group", () => {
    const all = bay.flatMap((g) => g.disks.map((d) => d.device));
    expect(all).toHaveLength(24);
    expect(new Set(all).size).toBe(24);
    expect(bay.map((g) => [key(g), g.disks.length])).toEqual([
      ["md Backup raid1", 2],
      ["md Apps raid1", 2],
      ["md Archive raid6", 8],
      ["zfs tank", 2],
      ["kind hdd", 8],
      ["kind ssd", 2],
    ]);
  });

  it("keeps the members in their array, partitions and by-id paths included, in device order", () => {
    // md2's members are partitions (/dev/sdf1), tank's are by-id paths to a partition.
    expect(names(bay[2])).toEqual([
      "sdf",
      "sdg",
      "sdh",
      "sdj",
      "sdk",
      "sdl",
      "sdm",
      "sdn",
    ]);
    expect(names(bay[3])).toEqual(["sdd", "sde"]);
    const inKind = bay
      .filter((g) => g.from === "kind")
      .flatMap((g) => g.disks.map((d) => d.device));
    for (const g of bay.filter((x) => x.from !== "kind")) {
      for (const d of g.disks) {
        expect(inKind).not.toContain(d.device);
      }
    }
  });

  it("reads each disk's kind from Smart.getInformation and keeps an NVMe stick in its array", () => {
    const apps = bay.find((g) => g.from === "md" && g.name === "Apps");
    expect(names(apps)).toEqual(["nvme0n1", "nvme1n1"]);
    expect(apps?.disks.every((d) => d.kind === "nvme")).toBe(true);
    expect(bay.find((g) => g.id === "kind:nvme")).toBeUndefined();
    expect(names(bay.find((g) => g.id === "kind:ssd"))).toEqual(["sdq", "sdv"]);
    // Without the arrays, the same sticks are the NVMe group.
    const disks = bay.flatMap((g) => g.disks);
    expect(
      names(diskGroups(disks, none).find((g) => g.id === "kind:nvme")),
    ).toEqual(["nvme0n1", "nvme1n1"]);
  });

  it("shows a disk in two volumes once, in the first, and names an array without a label by its device", () => {
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
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ from: "md", device: "md0", name: null });
    expect(names(groups[0])).toEqual(["sda", "sdb"]);
  });

  it("matches a partition to its disk by the kernel's naming, and nothing else", () => {
    expect(memberOnDisk("/dev/sdb", "/dev/sdb")).toBe(true);
    expect(memberOnDisk("/dev/sdb1", "/dev/sdb")).toBe(true);
    expect(memberOnDisk("/dev/sdba", "/dev/sdb")).toBe(false);
    expect(memberOnDisk("/dev/nvme0n1p1", "/dev/nvme0n1")).toBe(true);
    // nvme0n10 is another disk, not a partition of nvme0n1.
    expect(memberOnDisk("/dev/nvme0n10", "/dev/nvme0n1")).toBe(false);
    expect(
      memberOnDisk("/dev/disk/by-id/ata-X-part1", "/dev/disk/by-id/ata-X"),
    ).toBe(true);
    expect(
      memberOnDisk("/dev/disk/by-id/ata-X2", "/dev/disk/by-id/ata-X"),
    ).toBe(false);
  });

  it("names an array by its file system's label, then mdadm's own name, then not at all", () => {
    const labels = [{ devicename: "md0", label: "Backup" }];
    expect(arrayNameOf({ devicefile: "/dev/md0", name: "" }, labels)).toBe(
      "Backup",
    );
    expect(
      arrayNameOf({ devicefile: "/dev/md1", name: "othernas:media" }, labels),
    ).toBe("media");
    expect(
      arrayNameOf({ devicefile: "/dev/md2", name: "" }, labels),
    ).toBeNull();
    expect(
      arrayNameOf({ devicefile: "/dev/md3", name: "" }, [
        { devicename: "md3", label: null },
      ]),
    ).toBeNull();
  });

  it("reads a pool's arrangement from its groups, not from a disk being replaced", () => {
    const d = (vdev: string) => ({ devicefile: "/dev/sdx", vdev });
    expect(poolLayoutOf([d("mirror-0"), d("mirror-0")]).kinds).toEqual([
      "mirror",
    ]);
    expect(
      poolLayoutOf([d("mirror-0"), d("replacing-1"), d("replacing-1")]),
    ).toEqual({
      kinds: ["mirror"],
      groups: 1,
      members: 3,
    });
    expect(poolLayoutOf([d("raidz1-0"), d("raidz1-1")])).toEqual({
      kinds: ["raidz1"],
      groups: 2,
      members: 2,
    });
    expect(poolLayoutOf([d("draid2:4d:1s-0")]).kinds).toEqual(["draid"]);
    expect(poolLayoutOf([d(""), d("")])).toEqual({
      kinds: [],
      groups: 0,
      members: 2,
    });
  });

  it("says an array or pool is rebuilding or short of a disk only when it is", () => {
    expect(
      bay.find((g) => g.from === "md" && g.name === "Archive")?.state,
    ).toEqual({
      tone: "warning",
      reason: "rebuilding",
    });
    expect(bay.filter((g) => g.state !== null)).toHaveLength(1);
    expect(
      arrayStateOf({ state: "clean, degraded", syncaction: "idle" }),
    ).toEqual({
      tone: "warning",
      reason: "degraded",
    });
    expect(arrayStateOf({ state: "clean", syncaction: null })).toBeNull();
    expect(arrayStateOf({ state: false, syncaction: null })).toBeNull();
    const pool = (state: string, vdev = "mirror-0") => ({
      status: { name: "tank", state },
      devices: [{ devicefile: "/dev/sdx", vdev }],
    });
    expect(poolStateOf(pool("ONLINE"))).toBeNull();
    expect(poolStateOf(pool("DEGRADED"))?.reason).toBe("degraded");
    expect(poolStateOf(pool("DEGRADED", "replacing-1"))?.reason).toBe(
      "rebuilding",
    );
    expect(poolStateOf(pool("FAULTED"))).toEqual({
      tone: "critical",
      reason: "unavailable",
    });
  });
});

describe("on the dashboard", () => {
  const bayDisks = temperatureGroups(DISKS_24, VOLUMES_24).flatMap(
    (g) => g.disks,
  );

  it("shows every disk up to eight", () => {
    const groups = diskGroups(six, VOLUMES_6);
    expect(six.length).toBeLessThanOrEqual(DASHBOARD_ALL);
    expect(dashboardSplit(groups)).toEqual({ shown: groups, rest: [] });
  });

  it("past eight, shows the groups with a disk over the limit and sums up the rest", () => {
    const split = dashboardSplit(diskGroups(bayDisks, VOLUMES_24));
    expect(split.shown.map((g) => g.id)).toEqual(["kind:hdd"]);
    const rest = split.rest.flatMap((g) => g.disks);
    expect(rest).toHaveLength(16);
    expect(restSummary(rest, false, 45)).toEqual({
      count: 16,
      read: 16,
      lo: 31,
      hi: 43,
      limit: 45,
      all: false,
    });
  });

  it("never hides a disk over the limit, wherever it is", () => {
    // Each disk in turn over the limit, in an array, a pool or no volume, asleep ones included.
    for (const hot of bayDisks) {
      const disks = bayDisks.map((d) =>
        d.device === hot.device ? { ...d, c: 47, asleep: false } : d,
      );
      const split = dashboardSplit(diskGroups(disks, VOLUMES_24));
      const hidden = split.rest.flatMap((g) => g.disks);
      expect(hidden.filter(diskOverLimit)).toEqual([]);
      expect(
        split.shown.flatMap((g) => g.disks).map((d) => d.device),
      ).toContain(hot.device);
    }
  });

  it("counts only the hidden disks that were read", () => {
    expect(
      restSummary([temp("sda", 30), temp("sdb", null)], false, null),
    ).toEqual({
      count: 2,
      read: 1,
      lo: 30,
      hi: 30,
      limit: null,
      all: false,
    });
    expect(restSummary([temp("sda", null)], true, 45)).toMatchObject({
      read: 0,
      lo: null,
      hi: null,
      all: true,
    });
  });
});
