// SPDX-License-Identifier: GPL-3.0-or-later
// Which devices Flow A offers (phase 5 file-systems design 6.3; owner, P1): the stricter of the server's
// list and the disk-use model wins, and nothing is offered while an input is missing. Finding the new
// file system, the usable space of each way of combining disks, and the typed names.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ConfiguredFilesystem,
  DetectedFilesystem,
  DiskDevice,
  FilesystemCandidate,
  MdArray,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  btrfsUsable,
  devicesToType,
  diskOf,
  findNewFilesystem,
  findOnArray,
  minDisks,
  placesOf,
  storageChoices,
  type ChoiceInputs,
} from "./storageChoices.ts";

const DISKS = CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value
  .data as unknown as DiskDevice[];
const disk = (name: string) =>
  DISKS.find((d) => d.devicename === name) as DiskDevice;
const CONFIGURED = CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value
  .data as unknown as ConfiguredFilesystem[];
const DETECTED = CONTRACT_EXAMPLES.fileSystemMgmtEnumerateFilesystems
  .vmFilesystems.value as unknown as DetectedFilesystem[];
const FREE = JSON.parse(
  CONTRACT_EXAMPLES.execGetOutput.fsCandidatesFinished.value.output,
) as FilesystemCandidate[];
const NEW_FS = CONTRACT_EXAMPLES.fileSystemMgmtGetMountCandidates.created
  .value[0] as unknown as DetectedFilesystem;

const inputs = (over: Partial<ChoiceInputs> = {}): ChoiceInputs => ({
  candidates: FREE,
  disks: DISKS,
  configured: CONFIGURED,
  detected: DETECTED,
  arrays: null,
  ...over,
});
const noMarks = () => ({ wiping: false });

describe("storageChoices (6.3)", () => {
  it("offers the server's empty disks and lists every other disk with its blockers", () => {
    const result = storageChoices(inputs(), noMarks);
    if (result.state !== "known") {
      throw new Error(result.state);
    }
    expect(result.empty.map((c) => c.disk.devicename)).toEqual([
      "sdb",
      "sdc",
      "sdd",
    ]);
    expect(result.reuse).toEqual([]);
    expect(
      result.unusable.map((u) =>
        u.kind === "disk"
          ? u.disk.devicename
          : u.kind === "array"
            ? u.array.devicefile
            : u.device,
      ),
    ).toEqual(["nvme0n1", "sda", "sr0"]);
    const system = result.unusable[0];
    expect(system?.kind === "disk" && system.blockers[0]?.kind).toBe("system");
  });

  it("offers a disk the server leaves out as Erase and reuse when the model allows a wipe", () => {
    const old = {
      ...NEW_FS,
      label: "old-pc",
      type: "ntfs",
      uuid: "0000000000000090",
    };
    const result = storageChoices(
      inputs({
        candidates: FREE.filter((c) => c.devicefile !== "/dev/sdd"),
        detected: [...DETECTED, old],
      }),
      noMarks,
    );
    if (result.state !== "known") {
      throw new Error(result.state);
    }
    expect(result.reuse.map((c) => c.disk.devicename)).toEqual(["sdd"]);
    expect(result.reuse[0]?.holds[0]?.label).toBe("old-pc");
  });

  it("lets the stricter win: a disk the server offers but the model refuses is not offered", () => {
    const swap = { ...NEW_FS, type: "swap" };
    const result = storageChoices(
      inputs({ detected: [...DETECTED, swap] }),
      noMarks,
    );
    if (result.state !== "known") {
      throw new Error(result.state);
    }
    expect(result.empty.map((c) => c.disk.devicename)).toEqual(["sdb", "sdc"]);
    const sdd = result.unusable.find(
      (u) => u.kind === "disk" && u.disk.devicename === "sdd",
    );
    expect(sdd?.kind === "disk" && sdd.blockers.map((b) => b.kind)).toEqual([
      "swap",
    ]);
  });

  it("never offers the system disk, whatever the server says", () => {
    const result = storageChoices(
      inputs({
        candidates: [
          ...FREE,
          { devicefile: "/dev/nvme0n1", size: "1", description: "" },
        ],
      }),
      noMarks,
    );
    if (result.state !== "known") {
      throw new Error(result.state);
    }
    expect([...result.empty, ...result.reuse].some((c) => c.disk.isroot)).toBe(
      false,
    );
  });

  it("refuses a disk being wiped, and calls a wiped one empty", () => {
    const result = storageChoices(inputs(), (d) =>
      d.devicename === "sdb" ? { wiping: true } : { wiping: false, wipedAt: 5 },
    );
    if (result.state !== "known") {
      throw new Error(result.state);
    }
    expect(result.empty.map((c) => c.disk.devicename)).toEqual(["sdc", "sdd"]);
    expect(result.empty[0]?.wipedAt).toBe(5);
  });

  it("lists a candidate it cannot place as not offered", () => {
    const result = storageChoices(
      inputs({
        candidates: [
          ...FREE,
          { devicefile: "/dev/loop0", size: "1", description: "" },
        ],
      }),
      noMarks,
    );
    if (result.state !== "known") {
      throw new Error(result.state);
    }
    expect(result.unusable.at(-1)).toEqual({
      kind: "unplaced",
      device: "/dev/loop0",
    });
  });

  it("offers an empty RAID array the server offers, and refuses its members", () => {
    const array = {
      ...CONTRACT_EXAMPLES.mdMgmtEnumerateDevices.mirrors.value[0],
      devicefile: "/dev/md0",
      devices: ["/dev/sdb", "/dev/sdc"],
      _used: false,
    } as unknown as MdArray;
    const result = storageChoices(
      inputs({
        arrays: [array],
        candidates: [
          FREE[2] as FilesystemCandidate,
          { devicefile: "/dev/md0", size: "1", description: "" },
        ],
      }),
      noMarks,
    );
    if (result.state !== "known") {
      throw new Error(result.state);
    }
    expect(result.raid.map((c) => c.array.devicefile)).toEqual(["/dev/md0"]);
    expect(result.empty.map((c) => c.disk.devicename)).toEqual(["sdd"]);
  });

  it.each([
    ["short of a disk", "mirrorDegraded"],
    ["rebuilding", "mirrorRebuilding"],
  ] as const)(
    "does not offer an array %s, and says why (RAID design 9.3, D16)",
    (_, example) => {
      const array = CONTRACT_EXAMPLES.mdMgmtEnumerateDevices[example]
        .value[0] as unknown as MdArray;
      const result = storageChoices(
        inputs({
          arrays: [array],
          candidates: [{ devicefile: "/dev/md0", size: "1", description: "" }],
        }),
        noMarks,
      );
      if (result.state !== "known") {
        throw new Error(result.state);
      }
      expect(result.raid).toEqual([]);
      const refused = result.unusable.find((u) => u.kind === "array");
      expect(refused?.kind === "array" && refused.state.status).toBe(
        "critical",
      );
    },
  );

  it("offers a synchronising array", () => {
    const array = CONTRACT_EXAMPLES.mdMgmtEnumerateDevices.mirrorSyncing
      .value[0] as unknown as MdArray;
    const result = storageChoices(
      inputs({
        arrays: [array],
        candidates: [{ devicefile: "/dev/md0", size: "1", description: "" }],
      }),
      noMarks,
    );
    expect(result.state === "known" && result.raid).toHaveLength(1);
  });

  it.each([
    ["the candidates", { candidates: undefined }],
    ["the disks", { disks: undefined }],
    ["the configured file systems", { configured: undefined }],
    ["the detected file systems", { detected: undefined }],
    ["the RAID arrays", { arrays: undefined }],
  ] as const)("offers nothing until %s are read (fail closed)", (_, over) => {
    expect(storageChoices(inputs(over), noMarks).state).toBe("loading");
  });

  it("offers nothing when a read failed, with its error", () => {
    expect(
      storageChoices(inputs(), noMarks, { failed: true, error: "boom" }),
    ).toEqual({ state: "failed", error: "boom" });
  });
});

describe("finding the new file system (6.6 step 4, 7.3)", () => {
  it("finds exactly the one on the chosen disk", () => {
    expect(findNewFilesystem([NEW_FS], [disk("sdd")])).toEqual({
      kind: "found",
      fs: NEW_FS,
    });
    expect(findNewFilesystem([NEW_FS], [disk("sdb")])).toEqual({
      kind: "notFound",
    });
    const second = { ...NEW_FS, uuid: "00000000-0000-4000-8000-0000000000ee" };
    expect(findNewFilesystem([NEW_FS, second], [disk("sdd")])).toEqual({
      kind: "ambiguous",
    });
  });

  it("finds a BTRFS file system across every chosen disk", () => {
    const btrfs = {
      ...NEW_FS,
      type: "btrfs",
      parentdevicefile: "/dev/sdb",
      canonicaldevicefile: "/dev/sdb",
      devicefiles: ["/dev/sdb", "/dev/sdc"],
    };
    expect(findNewFilesystem([btrfs], [disk("sdb"), disk("sdc")]).kind).toBe(
      "found",
    );
    expect(findNewFilesystem([btrfs], [disk("sdb"), disk("sdd")]).kind).toBe(
      "notFound",
    );
  });

  it("finds the one made directly on a RAID array", () => {
    const onArray = {
      ...NEW_FS,
      canonicaldevicefile: "/dev/md0",
      parentdevicefile: "/dev/md0",
      devicefiles: ["/dev/md0"],
    };
    expect(findOnArray([onArray, NEW_FS], "/dev/md0").kind).toBe("found");
  });
});

describe("combining disks (7.1, 7.2)", () => {
  const T = 1000;
  it.each([
    ["raid1", [T, T], T],
    ["raid1", [T, 3 * T], T],
    ["raid1", [T, T, T], 1.5 * T],
    ["raid10", [T, T, T, T], 2 * T],
    ["raid0", [T, T], 2 * T],
    ["raid0", [T, 5 * T], 2 * T],
    ["single", [T, 5 * T], 6 * T],
  ] as const)("%s on %o gives about %d", (profile, sizes, want) => {
    expect(btrfsUsable(sizes, profile)).toBe(want);
  });

  it("needs four disks for RAID10 and two otherwise", () => {
    expect(minDisks("raid10")).toBe(4);
    expect(minDisks("raid1")).toBe(2);
    expect(minDisks("single")).toBe(2);
  });

  it("types every device name with one space between, in order", () => {
    expect(devicesToType(["/dev/sdb", "/dev/sdc"])).toBe("/dev/sdb /dev/sdc");
  });
});

describe("where a file system is (1.3)", () => {
  it("is on its parent device, or every disk of a multi-device one", () => {
    expect(placesOf(CONFIGURED[0] as ConfiguredFilesystem)).toEqual([
      "/dev/sda",
    ]);
    expect(
      placesOf({
        parentdevicefile: "/dev/sdb",
        canonicaldevicefile: "/dev/sdb",
        devicefiles: ["/dev/sdb", "/dev/sdc1"],
        hasmultipledevices: true,
      }),
    ).toEqual(["/dev/sdb", "/dev/sdc"]);
    expect(diskOf(NEW_FS, DISKS)?.devicename).toBe("sdd");
  });
});
