// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's mapping from the contract's rows to the map, the temperatures and the live charts,
// on hand-written rows in the contract's shapes.
import type {
  ConfiguredFilesystem,
  DiskDevice,
  MountedFilesystem,
  NetworkDevice,
  SharedFolder,
  SmartDevice,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import type { SystemSample, TrafficSample } from "../live/liveSamples.ts";
import {
  isAwake,
  liveInterface,
  liveSeries,
  nasModel,
  readStateOf,
  temperatureGroups,
  worstRead,
  type NasInput,
  type NasModelWords,
} from "./nasModel.ts";

const WORDS: NasModelWords = {
  health: (s) => s,
  notChecked: "Not checked yet",
  noReading: "No reading",
  asleep: "Asleep",
  celsius: (c) => `${String(c)} °C`,
  diskSummary: (kind, size) => `${kind}, ${size ?? "?"}`,
  storageState: (s) => s,
  poolState: (s) => s,
  systemDrive: "System drive",
  zfsPool: "ZFS pool",
  fsType: (t) => t.toUpperCase(),
  raidDisksNote: "On the RAID page.",
  poolDisksUnread: "Not read.",
  folderState: () => "Cannot be reached",
  way: (id) => ({ name: id, tech: id.toUpperCase() }),
  speed: () => "1 Gbit/s",
};

const disk = (name: string, over: Partial<DiskDevice> = {}): DiskDevice => ({
  devicename: name,
  canonicaldevicefile: `/dev/${name}`,
  devicefile: `/dev/disk/by-id/ata-EXAMPLE_${name}`,
  devicelinks: [`/dev/disk/by-id/ata-EXAMPLE_${name}`],
  model: "Example",
  size: "4000787030016",
  description: "",
  vendor: "",
  serialnumber: "EXAMPLE-SERIAL",
  wwn: "",
  israid: false,
  isroot: false,
  isreadonly: false,
  powermode: "ACTIVE or IDLE",
  temperature: "36",
  hotpluggable: false,
  ...over,
});

const mounted = (
  device: string,
  over: Partial<MountedFilesystem> = {},
): MountedFilesystem =>
  ({
    devicename: device,
    devicefile: `/dev/${device}`,
    canonicaldevicefile: `/dev/${device}`,
    parentdevicefile: `/dev/${device.replace(/\d+$/u, "")}`,
    devlinks: [],
    uuid: `uuid-${device}`,
    label: device,
    type: "ext4",
    mounted: true,
    mountpoint: `/srv/${device}`,
    blocks: "1",
    size: "1000",
    available: "400",
    used: "",
    percentage: 60,
    description: "",
    devicefiles: [`/dev/${device}`],
    comment: "",
    usagewarnthreshold: 85,
    ...over,
  }) as MountedFilesystem;

const folder = (name: string, dir: string): SharedFolder => ({
  uuid: `f-${name}`,
  name,
  comment: "",
  mntentref: "m",
  reldirpath: `${name}/`,
  _used: false,
  device: "",
  description: "",
  mntent: { dir },
  status: "OK",
});

const input = (over: Partial<NasInput> = {}): NasInput => ({
  disks: [],
  kinds: new Map(),
  health: undefined,
  mounted: [],
  configured: [],
  pools: null,
  poolDevices: new Map(),
  folders: [],
  smb: [],
  nfs: [],
  services: [],
  interfaces: [],
  reads: {},
  ...over,
});

describe("the reads", () => {
  it("counts data kept through a failed poll as read, and a failure with nothing as failed", () => {
    expect(readStateOf({ data: [], isError: true })).toBe("ok");
    expect(readStateOf({ data: undefined, isError: true })).toBe("failed");
    expect(readStateOf({ data: undefined, isError: false })).toBe("loading");
    expect(worstRead("ok", "loading", "failed")).toBe("failed");
    expect(worstRead("ok", "loading")).toBe("loading");
    expect(worstRead("ok", "ok")).toBe("ok");
  });

  it("calls a disk in standby or sleep asleep, and nothing else", () => {
    expect(isAwake(disk("sda", { powermode: "STANDBY" }))).toBe(false);
    expect(isAwake(disk("sda", { powermode: "SLEEP" }))).toBe(false);
    expect(isAwake(disk("sda", { powermode: "ACTIVE or IDLE" }))).toBe(true);
    expect(isAwake(disk("nvme0n1", { powermode: "UNKNOWN" }))).toBe(true);
  });
});

describe("the map's input", () => {
  it("attaches each disk to the file system on it, and its folders by mount point", () => {
    const { input: nas } = nasModel(
      input({
        disks: [disk("sda"), disk("sdb")],
        mounted: [mounted("sda1")],
        folders: [folder("Photos", "/srv/sda1")],
      }),
      WORDS,
    );
    expect(nas.disks.find((d) => d.id === "sda")?.storage).toEqual([
      "fs:uuid-sda1",
    ]);
    expect(nas.disks.find((d) => d.id === "sdb")?.storage).toEqual([]);
    expect(nas.storage[0]?.folders).toEqual(["f-Photos"]);
  });

  it("draws a file system on an array with no disk and a note, and marks RAID members", () => {
    const { input: nas } = nasModel(
      input({
        disks: [disk("sdb", { israid: true }), disk("sdc", { israid: true })],
        mounted: [
          mounted("md0", { parentdevicefile: "/dev/md0", label: "Backup" }),
        ],
      }),
      WORDS,
    );
    const backup = nas.storage[0];
    expect(backup?.kind).toBe("raid");
    expect(backup?.disksNote).toBe("On the RAID page.");
    expect(nas.disks.every((d) => d.raidMember === true)).toBe(true);
    expect(nas.disks.every((d) => d.storage.length === 0)).toBe(true);
  });

  it("gives a pool its disks from Zfs.getPoolDevices, and says so when that read failed", () => {
    const pools = [
      { name: "tank", state: "ONLINE", status: "OK", capacity: 0 },
    ];
    const zfs = mounted("tank", {
      type: "zfs",
      devicefile: "tank",
      canonicaldevicefile: "tank",
      uuid: null,
      usagewarnthreshold: 0,
      mountpoint: "/tank",
    });
    const read = nasModel(
      input({
        disks: [disk("sdd")],
        mounted: [zfs],
        pools,
        poolDevices: new Map([
          [
            "tank",
            [
              {
                devicefile: "/dev/disk/by-id/ata-EXAMPLE_sdd-part1",
                state: "ONLINE",
                vdev: "",
                label: "",
              },
            ],
          ],
        ]),
      }),
      WORDS,
    );
    expect(read.input.disks[0]?.storage).toEqual(["zfs:tank"]);
    expect(read.facts.get("zfs:tank")?.mark).toBeNull();
    const unread = nasModel(
      input({
        disks: [disk("sdd")],
        mounted: [zfs],
        pools,
        poolDevices: new Map([["tank", "failed"]]),
      }),
      WORDS,
    );
    expect(unread.input.storage[0]).toMatchObject({
      disksUnread: true,
      disksNote: "Not read.",
    });
    expect(unread.input.disks[0]?.storage).toEqual([]);
  });

  it("says a disk is asleep, and takes its health only from a check the person asked for", () => {
    const check: SmartDevice[] = [
      {
        devicename: "sda",
        canonicaldevicefile: "/dev/sda",
        overallstatus: "BAD_SECTOR",
      } as SmartDevice,
    ];
    const unchecked = nasModel(
      input({
        disks: [
          disk("sda"),
          disk("sdb", { powermode: "STANDBY", temperature: "" }),
        ],
      }),
      WORDS,
    ).input.disks;
    expect(unchecked[0]).toMatchObject({
      health: "unknown",
      healthLabel: "Not checked yet",
      detail: "36 °C",
    });
    expect(unchecked[1]?.detail).toBe("Asleep");
    const checked = nasModel(
      input({ disks: [disk("sda"), disk("sdb")], health: check }),
      WORDS,
    ).input.disks;
    expect(checked[0]).toMatchObject({ health: "warning" });
    expect(checked[1]).toMatchObject({
      health: "unknown",
      healthLabel: "No reading",
    });
  });

  it("draws each disk as the kind the temperatures draw it, and a plain disk only when not known", () => {
    const disks = [
      disk("nvme0n1", { powermode: "UNKNOWN" }),
      disk("sda"),
      disk("sdb"),
      disk("sdc"),
      disk("sdd", { powermode: "STANDBY", temperature: "" }),
    ];
    // sda and sdb were read awake; sdc's read has not come back; sdd is asleep, so never read.
    const kinds = new Map([
      ["nvme0n1", "nvme" as const],
      ["sda", "hdd" as const],
      ["sdb", "ssd" as const],
    ]);
    const { input: nas } = nasModel(input({ disks, kinds }), WORDS);
    expect(nas.disks.map((d) => [d.id, d.kind])).toEqual([
      ["nvme0n1", "nvme"],
      ["sda", "hdd"],
      ["sdb", "ssd"],
      ["sdc", "disk"],
      ["sdd", "disk"],
    ]);
    const temps = temperatureGroups(disks, kinds, 45, null, new Map(), []);
    const tempKind = new Map(
      temps.flatMap((g) => g.disks.map((d) => [d.device, d.kind ?? "disk"])),
    );
    for (const d of nas.disks) {
      expect(tempKind.get(d.id)).toBe(d.kind);
    }
  });

  it("never draws a hot-pluggable disk as USB: OMV says hot-pluggable for SAS and hot-plug SATA ports", () => {
    const { input: nas } = nasModel(
      input({
        disks: [
          disk("sda", { hotpluggable: true }),
          disk("sdb", { hotpluggable: true }),
        ],
        kinds: new Map([["sda", "hdd"]]),
      }),
      WORDS,
    );
    expect(nas.disks.map((d) => d.kind)).toEqual(["hdd", "disk"]);
  });

  it("calls a missing file system Missing, never fine, and lists the system drive by name", () => {
    const missing = {
      ...mounted("sdx1"),
      status: 3,
      mounted: false,
    } as unknown as ConfiguredFilesystem;
    const { input: nas } = nasModel(
      input({
        mounted: [mounted("nvme0n1p2", { mountpoint: "/", label: "" })],
        configured: [missing],
      }),
      WORDS,
    );
    expect(nas.storage.find((s) => s.system)?.name).toBe("System drive");
    expect(nas.storage.find((s) => !s.system)).toMatchObject({
      health: "unknown",
      healthLabel: "missing",
      used: null,
    });
  });

  it("reaches a folder by SMB only while Windows and Mac sharing is on", () => {
    const photos = folder("Photos", "/srv/sda1");
    const smb = [{ enable: true, sharedfolderref: photos.uuid } as never];
    const on = nasModel(
      input({
        folders: [photos],
        smb,
        services: [
          { name: "samba", title: "SMB", enabled: true, running: true },
        ],
      }),
      WORDS,
    );
    expect(on.input.folders[0]?.ways).toEqual(["smb"]);
    expect(on.input.ways).toEqual([
      { id: "smb", name: "smb", tech: "SMB", enabled: true, running: true },
    ]);
    const off = nasModel(
      input({
        folders: [photos],
        smb,
        services: [
          { name: "samba", title: "SMB", enabled: false, running: false },
        ],
      }),
      WORDS,
    );
    expect(off.input.folders[0]?.ways).toEqual([]);
  });
});

describe("the temperatures", () => {
  it("groups by pool, and puts RAID members with their kind (no arrays are read)", () => {
    const groups = temperatureGroups(
      [
        disk("sda"),
        disk("sdb", { israid: true }),
        disk("sdd"),
        disk("sde", { powermode: "STANDBY", temperature: "" }),
      ],
      new Map([
        ["sda", "hdd"],
        ["sdb", "hdd"],
        ["sdd", "hdd"],
      ]),
      45,
      [{ name: "tank", state: "ONLINE", status: "OK", capacity: 0 }],
      new Map([
        [
          "tank",
          [
            {
              devicefile: "/dev/disk/by-id/ata-EXAMPLE_sdd-part1",
              state: "ONLINE",
              vdev: "",
              label: "",
            },
          ],
        ],
      ]),
      [],
    );
    expect(groups.map((g) => g.id)).toEqual([
      "zfs:tank",
      "kind:hdd",
      "kind:unknown",
    ]);
    expect(groups[1]?.disks.map((d) => d.device)).toEqual(["sda", "sdb"]);
    expect(groups[2]?.disks[0]).toMatchObject({ device: "sde", asleep: true });
    expect(groups[1]?.disks[0]?.limit).toBe(45);
  });
});

describe("the live charts", () => {
  const sample = (t: number, cpu: number): SystemSample => ({
    t,
    cpu,
    memory: 10,
    memUsed: 100,
    memTotal: 1000,
    load1: null,
    load5: null,
    load15: null,
  });
  const traffic = (t: number, rx: number): TrafficSample => ({
    t,
    since: t - 2000,
    interfaces: new Map([["enp2s0", { rx, tx: null }]]),
  });

  it("keeps only the window, in MiB/s, and says when older readings were let go", () => {
    const s = liveSeries(
      [sample(0, 1), sample(100_000, 2), sample(200_000, 3)],
      [traffic(200_000, 2 * 1024 ** 2)],
      "enp2s0",
      120_000,
    );
    expect(s.processor.map((p) => p.v)).toEqual([2, 3]);
    expect(s.dropped).toBe(true);
    expect(s.received).toEqual([{ t: 200_000, v: 2 }]);
    expect(s.sent).toEqual([{ t: 200_000, v: null }]);
    expect(liveSeries([], [], null, 120_000).processor).toEqual([]);
  });

  it("shows the first connected interface, never the loopback", () => {
    const dev = (name: string, link: boolean, type = "ethernet") =>
      ({ devicename: name, link, type }) as NetworkDevice;
    expect(
      liveInterface([
        dev("lo", true, "loopback"),
        dev("enp1s0", false),
        dev("enp2s0", true),
      ]),
    ).toBe("enp2s0");
    expect(liveInterface([dev("enp1s0", false)])).toBeNull();
  });
});
