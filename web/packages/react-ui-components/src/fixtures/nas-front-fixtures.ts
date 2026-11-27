// SPDX-License-Identifier: GPL-3.0-or-later
// Stories and tests only: the dashboard mock's six-disk NAS as the drawing of its front and the scan
// line take it (DiskMgmt.getList, FileSystemMgmt.getList, ShareMgmt.getList), with the app's words.
// The library carries no words of its own; these stand in for the app's catalogue.
import { createElement, Fragment } from "react";
import type {
  NasFrontBay,
  NasFrontStick,
} from "../components/nas-front/nas-front";
import {
  nasFrontGroups,
  type NasFrontGroup,
  type NasFrontRun,
} from "../components/nas-front/nas-front-model";
import type { ScanLineArea } from "../components/scan-line/scan-line";

const NBSP = String.fromCharCode(160);

export const FRONT_HOST = "nas";

interface DemoBay extends NasFrontBay {
  /** The storage it is in, or that it is an array member, for its bracket. */
  run: "data" | "raid" | "tank" | "unused";
}

/** The five disks on SATA ports, in device order, as the mock reads them. */
export const FRONT_BAYS: readonly DemoBay[] = [
  {
    id: "sda",
    device: "sda",
    kind: "hdd",
    summary: `Hard disk, 3.6${NBSP}TiB`,
    detail: `36${NBSP}°C`,
    run: "data",
  },
  {
    id: "sdb",
    device: "sdb",
    kind: "hdd",
    summary: `Hard disk, 3.6${NBSP}TiB`,
    detail: `35${NBSP}°C`,
    run: "raid",
  },
  {
    id: "sdc",
    device: "sdc",
    kind: "hdd",
    summary: `Hard disk, 3.6${NBSP}TiB`,
    detail: `37${NBSP}°C`,
    run: "raid",
  },
  {
    id: "sdd",
    device: "sdd",
    kind: "disk",
    summary: `Disk, 3.6${NBSP}TiB`,
    detail: "Asleep",
    run: "tank",
  },
  {
    id: "sde",
    device: "sde",
    kind: "ssd",
    summary: `SSD, 931.5${NBSP}GiB`,
    detail: `31${NBSP}°C`,
    run: "unused",
  },
];

/** The NVMe stick holding the system drive. */
export const FRONT_BOARD: readonly NasFrontStick[] = [
  {
    id: "nvme0n1",
    device: "nvme0n1",
    detail: createElement(
      Fragment,
      null,
      `On the mainboard, NVMe SSD, 238.5${NBSP}GiB, `,
      createElement("strong", null, "System drive"),
    ),
  },
];

const RUNS: Record<DemoBay["run"], NasFrontRun> = {
  data: { id: "data", name: "Data drive", tech: "EXT4" },
  raid: { id: "raid", name: "RAID array" },
  tank: { id: "tank", name: "tank", tech: "ZFS pool" },
  unused: { id: "unused", name: "Not in use", dashed: true },
};

/** The brackets of the NAS in use: Data drive, the RAID array, tank, and sde not in use. */
export const FRONT_GROUPS: readonly NasFrontGroup[] = nasFrontGroups(
  FRONT_BAYS,
  (bay) => RUNS[bay.run],
);

/** A new NAS: every disk on a SATA port is ready for storage, under one dashed bracket. */
export const NEW_FRONT_GROUPS: readonly NasFrontGroup[] = nasFrontGroups(
  FRONT_BAYS,
  () => ({ id: "unused", name: "Ready for storage", dashed: true }),
);

export const FRONT_LABELS = {
  large: `The disks in ${FRONT_HOST} and the drives they make`,
  before: `The disks in ${FRONT_HOST}: not checked since you signed in`,
  after: `The disks in ${FRONT_HOST}: all reported no problem`,
};

/** The scan line's areas on the NAS in use, before or after the disk health check. */
export function scanAreas({
  checked,
  almostFull = false,
  newNas = false,
}: {
  checked: boolean;
  almostFull?: boolean;
  newNas?: boolean;
}): ScanLineArea[] {
  return [
    {
      id: "disks",
      label: "Disks",
      tone: checked ? "ok" : "unknown",
      status: checked ? "OK" : "Not checked",
      value: `6${NBSP}disks, 1 asleep`,
      targetId: "scan-story-disks",
      goTo: "Go to the disk temperatures",
    },
    {
      id: "storage",
      label: "Storage",
      tone: almostFull ? "warning" : "ok",
      status: almostFull ? "Almost full" : "OK",
      value: newNas
        ? "Only the system drive"
        : almostFull
          ? `Data drive, 92${NBSP}% used`
          : `4${NBSP}drives, all with space`,
      targetId: "scan-story-map",
      goTo: "Go to the map of your NAS",
    },
    {
      id: "sharing",
      label: "Sharing",
      tone: newNas ? "unknown" : "ok",
      status: newNas ? "Not set up" : "OK",
      value: newNas
        ? "No shared folders yet"
        : `6${NBSP}folders, 2${NBSP}ways in on`,
      targetId: "scan-story-map",
      goTo: "Go to the ways in",
    },
    {
      id: "network",
      label: "Network",
      tone: "ok",
      status: "OK",
      value: "enp2s0 at 1 Gbit/s",
      targetId: "scan-story-map",
      goTo: "Go to the network",
    },
  ];
}
