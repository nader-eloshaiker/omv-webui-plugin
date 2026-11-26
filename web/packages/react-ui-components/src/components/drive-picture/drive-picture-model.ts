// SPDX-License-Identifier: GPL-3.0-or-later
// The drive pictures' kinds and sizes, and how a disk's kind is read from the contract's rows, apart
// from the drawing so the temperatures can lay out a tile without drawing one.

/** What a disk is, for its picture and its group only: never a colour and never a figure. */
export type DrivePictureKind = "hdd" | "ssd" | "nvme";

/**
 * What a picture draws: a kind, or `disk`, a plain drive that claims no kind (never guess), for a disk
 * whose kind was not read, as the drive bay's and the NAS map's `disk`.
 */
export type DrivePictureShape = DrivePictureKind | "disk";

/** `marker` for a key or a line of text, `tile` in the temperatures, `large` on a disk's own page. */
export type DrivePictureSize = "marker" | "tile" | "large";

/**
 * Each picture's size in pixels. The hard disk and the SSD keep the 3.5" to 2.5" proportion; the
 * tile hard disk's height and the tile stick's length are the temperature scale's length (56px).
 * The plain `disk` has the hard disk's box, so it stands as tall as the scale.
 */
export const DRIVE_PICTURE_BOX: Readonly<
  Record<DrivePictureSize, Record<DrivePictureShape, { w: number; h: number }>>
> = {
  marker: {
    hdd: { w: 12, h: 15 },
    ssd: { w: 10, h: 13 },
    nvme: { w: 16, h: 6 },
    disk: { w: 12, h: 15 },
  },
  tile: {
    hdd: { w: 40, h: 56 },
    ssd: { w: 29, h: 40 },
    nvme: { w: 56, h: 16 },
    disk: { w: 40, h: 56 },
  },
  large: {
    hdd: { w: 52, h: 72 },
    ssd: { w: 37, h: 52 },
    nvme: { w: 88, h: 24 },
    disk: { w: 52, h: 72 },
  },
};

/**
 * A disk's kind from what the contract gives: an NVMe SSD by its kernel name (DiskMgmt.getList or
 * Smart.getList `devicename`, "nvme0n1"); otherwise Smart.getInformation's `rotationrate`, "Solid
 * State Device" for an SSD or a speed such as "7200 rpm" for a hard disk. Null when neither says,
 * so the caller decides rather than the picture guessing.
 */
export function driveKindOf(
  disk: { devicename: string },
  information?: { rotationrate?: unknown } | null,
): DrivePictureKind | null {
  if (/^nvme\d/u.test(disk.devicename)) {
    return "nvme";
  }
  const rate = information?.rotationrate;
  if (typeof rate === "string") {
    if (/solid state/iu.test(rate)) {
      return "ssd";
    }
    if (/\d\s*rpm/iu.test(rate)) {
      return "hdd";
    }
  }
  if (typeof rate === "number") {
    return rate === 0 ? "ssd" : "hdd";
  }
  return null;
}
