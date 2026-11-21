// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  DEVICE_ORDER,
  fsName,
  newDisks,
  nextDiskSort,
  SLOT,
  sortDisks,
  splitSlots,
} from "./disksList.ts";

const d = (canonicaldevicefile: string, size: string) => ({
  canonicaldevicefile,
  size,
});

describe("sortDisks", () => {
  const disks = [
    d("/dev/sdb", "8000"),
    d("/dev/nvme0n1", "500"),
    d("/dev/sda", "8000"),
    d("/dev/sdaa", "100"),
  ];
  it("keeps the device order in natural order by default", () => {
    expect(
      sortDisks(disks, DEVICE_ORDER).map((x) => x.canonicaldevicefile),
    ).toEqual(["/dev/nvme0n1", "/dev/sda", "/dev/sdaa", "/dev/sdb"]);
  });
  it("sorts by size, equal sizes in device order", () => {
    expect(
      sortDisks(disks, { field: "size", direction: "asc" }).map(
        (x) => x.canonicaldevicefile,
      ),
    ).toEqual(["/dev/sdaa", "/dev/nvme0n1", "/dev/sda", "/dev/sdb"]);
    expect(
      sortDisks(disks, { field: "size", direction: "desc" }).map(
        (x) => x.canonicaldevicefile,
      ),
    ).toEqual(["/dev/sda", "/dev/sdb", "/dev/nvme0n1", "/dev/sdaa"]);
  });
  it("turns the same column over and starts another ascending", () => {
    expect(nextDiskSort(DEVICE_ORDER, "disk")).toEqual({
      field: "disk",
      direction: "desc",
    });
    expect(nextDiskSort(DEVICE_ORDER, "size")).toEqual({
      field: "size",
      direction: "asc",
    });
  });
});

describe("newDisks", () => {
  it("lists the devices the earlier read did not have", () => {
    expect(
      newDisks(["/dev/sda"], [d("/dev/sda", "1"), d("/dev/sdf", "1")]),
    ).toEqual(["/dev/sdf"]);
    expect(newDisks(["/dev/sda"], [d("/dev/sda", "1")])).toEqual([]);
  });
});

describe("fsName", () => {
  it("names a file system by its label, else its type and device", () => {
    expect(
      fsName({ label: "data", type: "ext4", device: "/dev/sdb1", size: null }),
    ).toEqual({
      kind: "label",
      label: "data",
    });
    expect(
      fsName({ label: "", type: "ext4", device: "/dev/sdb1", size: null }),
    ).toEqual({
      kind: "device",
      type: "ext4",
      device: "/dev/sdb1",
    });
  });
});

describe("splitSlots", () => {
  it("cuts a sentence at its slots, in order", () => {
    expect(splitSlots(`File system ${SLOT}, in use`, [SLOT])).toEqual([
      { text: "File system " },
      { slot: SLOT },
      { text: ", in use" },
    ]);
    expect(
      splitSlots(`${SLOT} on <device></device>`, [SLOT, "<device></device>"]),
    ).toEqual([
      { slot: SLOT },
      { text: " on " },
      { slot: "<device></device>" },
    ]);
    expect(splitSlots("No slot", [SLOT])).toEqual([{ text: "No slot" }]);
  });
});
