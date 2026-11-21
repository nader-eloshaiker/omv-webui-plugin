// SPDX-License-Identifier: GPL-3.0-or-later
// Which disks may go into an array (phase 5 RAID design 0.7) on the test VM's captured lists.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type {
  ConfiguredFilesystem,
  DetectedFilesystem,
  DiskDevice,
  MdArray,
  MdDisk,
} from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import {
  isCandidate,
  isUsb,
  raidChoices,
  sameDisks,
  type RaidChoiceInputs,
} from "./raidChoices.ts";

const clone = <T>(v: unknown): T => JSON.parse(JSON.stringify(v)) as T;
const DISKS = clone<DiskDevice[]>(
  CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value.data,
);
const CONFIGURED = clone<ConfiguredFilesystem[]>(
  CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value.data,
);
const DETECTED = clone<DetectedFilesystem[]>(
  CONTRACT_EXAMPLES.fileSystemMgmtEnumerateFilesystems.vmFilesystems.value,
);
const CANDIDATES = clone<MdDisk[]>(
  CONTRACT_EXAMPLES.mdMgmtGetCandidates.vmScratch.value,
);
const MIRROR = clone<MdArray[]>(
  CONTRACT_EXAMPLES.mdMgmtEnumerateDevices.mirror.value,
);

const inputs = (over: Partial<RaidChoiceInputs> = {}): RaidChoiceInputs => ({
  candidates: CANDIDATES,
  disks: DISKS,
  configured: CONFIGURED,
  detected: DETECTED,
  arrays: [],
  ...over,
});
const none = () => ({ wiping: false });
const known = (choices: ReturnType<typeof raidChoices>) => {
  if (choices.state !== "known") {
    throw new Error(choices.state);
  }
  return choices;
};
const names = (list: { disk: DiskDevice }[]) =>
  list.map((c) => c.disk.canonicaldevicefile);

describe("raidChoices", () => {
  it("offers the empty scratch disks, never the system disk or the data disk", () => {
    const c = known(raidChoices(inputs(), none));
    expect(names(c.empty)).toEqual(["/dev/sdb", "/dev/sdc", "/dev/sdd"]);
    const unusable = c.unusable.map((u) => u.disk.canonicaldevicefile);
    expect(unusable).toContain("/dev/nvme0n1");
    expect(unusable).toContain("/dev/sda");
  });

  it("does not take hotpluggable for USB: the VM's SATA disks report it and are offered", () => {
    expect(DISKS.find((d) => d.devicename === "sdb")?.hotpluggable).toBe(true);
    expect(isUsb(DISKS.find((d) => d.devicename === "sdb") as DiskDevice)).toBe(
      false,
    );
  });

  it("leaves a USB disk out, with its reason", () => {
    const usb = {
      ...(DISKS.find((d) => d.devicename === "sdd") as DiskDevice),
      devicelinks: ["/dev/disk/by-id/usb-Example_Stick_0001-0:0"],
    };
    const c = known(
      raidChoices(
        inputs({ disks: DISKS.map((d) => (d.devicename === "sdd" ? usb : d)) }),
        none,
      ),
    );
    expect(names(c.empty)).not.toContain("/dev/sdd");
    expect(c.unusable.find((u) => u.disk.devicename === "sdd")?.kind).toBe(
      "usb",
    );
  });

  it("offers a disk the plugin leaves out, which holds nothing set up, under Erase and reuse", () => {
    const c = known(
      raidChoices(
        inputs({
          candidates: CANDIDATES.filter((d) => d.devicefile !== "/dev/sdd"),
        }),
        none,
      ),
    );
    expect(names(c.reuse)).toEqual(["/dev/sdd"]);
    expect(c.reuse[0]?.holds).toEqual([]);
  });

  it("never offers a member of an array", () => {
    const c = known(raidChoices(inputs({ arrays: MIRROR }), none));
    expect(names(c.empty)).toEqual(["/dev/sdd"]);
    const sdb = c.unusable.find((u) => u.disk.devicename === "sdb");
    expect(sdb?.kind === "blocked" && sdb.blockers.map((b) => b.kind)).toEqual([
      "raid",
    ]);
  });

  it("never offers a ZFS pool's disks for an array (ZFS design 10.2)", () => {
    const c = known(
      raidChoices(
        inputs({
          configured: clone<ConfiguredFilesystem[]>(
            CONTRACT_EXAMPLES.fileSystemMgmtGetList.zfs.value.data,
          ),
          detected: clone<DetectedFilesystem[]>(
            CONTRACT_EXAMPLES.fileSystemMgmtEnumerateFilesystems.zfs.value,
          ),
        }),
        none,
      ),
    );
    expect(names(c.empty)).toEqual(["/dev/sdd"]);
    for (const name of ["sdb", "sdc"]) {
      const member = c.unusable.find((u) => u.disk.devicename === name);
      expect(member?.kind === "blocked" && member.blockers).toEqual([
        { kind: "zfs", pool: "tank" },
      ]);
    }
  });

  it("says a disk smaller than the array's is too small, when adding", () => {
    const c = known(raidChoices(inputs(), none, undefined, 9_000_000_000));
    expect(c.empty).toEqual([]);
    expect(c.unusable.filter((u) => u.kind === "small")).toHaveLength(3);
  });

  it("offers nothing while an input is missing, and fails closed on a failure", () => {
    expect(raidChoices(inputs({ candidates: undefined }), none).state).toBe(
      "loading",
    );
    expect(raidChoices(inputs({ arrays: undefined }), none).state).toBe(
      "loading",
    );
    expect(
      raidChoices(inputs(), none, { failed: true, error: new Error("x") })
        .state,
    ).toBe("failed");
  });

  it("refuses a disk being wiped", () => {
    const c = known(
      raidChoices(inputs(), (d) => ({ wiping: d.devicename === "sdb" })),
    );
    expect(names(c.empty)).toEqual(["/dev/sdc", "/dev/sdd"]);
  });

  it("matches the plugin's kernel names and an array's members to the disks", () => {
    const sdb = DISKS.find((d) => d.devicename === "sdb") as DiskDevice;
    const sdc = DISKS.find((d) => d.devicename === "sdc") as DiskDevice;
    expect(isCandidate(CANDIDATES, sdb)).toBe(true);
    expect(sameDisks(["/dev/sdb", "/dev/sdc"], [sdb, sdc])).toBe(true);
    expect(sameDisks(["/dev/sdb"], [sdb, sdc])).toBe(false);
    expect(sameDisks(["/dev/sdb", "/dev/sdd"], [sdb, sdc])).toBe(false);
  });
});
