// SPDX-License-Identifier: GPL-3.0-or-later
// The Disks list's small rules (phase 5 disks design 1.3, 1.5): its sort, which disks a rescan found,
// and how a file system is named in the "Used for" column. Pure, so each is tested by itself.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { naturalCompare, parseByteCount } from "../format/format.ts";
import type { FsRef } from "./diskUse.ts";

export type DiskSortField = "disk" | "size";
export interface DiskSort {
  field: DiskSortField;
  direction: "asc" | "desc";
}

/** The device order: the disk column, ascending, in natural order (1.3). */
export const DEVICE_ORDER: DiskSort = { field: "disk", direction: "asc" };

/** The next sort after a header press: the same column turns over; another starts ascending. */
export const nextDiskSort = (
  current: DiskSort,
  field: DiskSortField,
): DiskSort =>
  current.field === field
    ? { field, direction: current.direction === "asc" ? "desc" : "asc" }
    : { field, direction: "asc" };

/** The rows in the chosen order; equal sizes keep the device order. */
export function sortDisks<
  T extends Pick<DiskDevice, "canonicaldevicefile" | "size">,
>(disks: readonly T[], sort: DiskSort): T[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const byDevice = (a: T, b: T) =>
    naturalCompare(a.canonicaldevicefile, b.canonicaldevicefile);
  return [...disks].sort((a, b) => {
    if (sort.field === "size") {
      const diff =
        (parseByteCount(a.size) ?? -1) - (parseByteCount(b.size) ?? -1);
      return diff === 0 ? byDevice(a, b) : sign * Math.sign(diff);
    }
    return sign * byDevice(a, b);
  });
}

/** The disks a rescan found: devices of the fresh read that the read before it did not list. */
export function newDisks(
  before: readonly string[],
  after: readonly Pick<DiskDevice, "canonicaldevicefile">[],
): string[] {
  const known = new Set(before);
  return after
    .map((d) => d.canonicaldevicefile)
    .filter((device) => !known.has(device));
}

/** A file system's name in the "Used for" words: its label, else its type and device (1.3.1). */
export function fsName(
  fs: FsRef,
):
  | { kind: "label"; label: string }
  | { kind: "device"; type: string; device: string } {
  return fs.label !== ""
    ? { kind: "label", label: fs.label }
    : { kind: "device", type: fs.type, device: fs.device };
}

/** A mark put in place of a value, so a translated sentence can be split around it. */
export const SLOT = "\u0001";

/**
 * A translated sentence cut at its slots, in order: the plain parts and the slots it contains (the
 * SLOT mark, or a component tag such as "<device></device>"). The caller renders a slot as an element
 * whose text is a prop, so a value from the server never passes through markup parsing (UI-2).
 */
export function splitSlots(
  sentence: string,
  slots: readonly string[],
): ({ text: string } | { slot: string })[] {
  const parts: ({ text: string } | { slot: string })[] = [];
  let rest = sentence;
  for (;;) {
    let at = -1;
    let found = "";
    for (const slot of slots) {
      const index = rest.indexOf(slot);
      if (index >= 0 && (at < 0 || index < at)) {
        at = index;
        found = slot;
      }
    }
    if (at < 0) {
      if (rest !== "") {
        parts.push({ text: rest });
      }
      return parts;
    }
    if (at > 0) {
      parts.push({ text: rest.slice(0, at) });
    }
    parts.push({ slot: found });
    rest = rest.slice(at + found.length);
  }
}
