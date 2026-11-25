// SPDX-License-Identifier: GPL-3.0-or-later
// The reel's map fixture: the dashboard lab's own NAS, cut to two storages so a pane holds the whole
// map. Development only (UI-11).
import type { Nas } from "../../dashboard/model.ts";
import { nasFor } from "../../dashboard/model.ts";

/** The dashboard lab's NAS with two of its storages, so a pane holds the whole map. */
export function twoRowNas(): Nas {
  const nas = nasFor("all-ok");
  const keep = new Set(["s:data", "s:backup"]);
  const storage = nas.storage.filter((s) => keep.has(s.id));
  const folders = new Set(storage.flatMap((s) => s.feeds));
  return {
    ...nas,
    storage,
    disks: nas.disks.filter(
      (d) => d.feeds.length === 0 || d.feeds.some((f) => keep.has(f)),
    ),
    folders: nas.folders.filter((f) => folders.has(f.id)),
    attention: [],
    addOns: [],
  };
}
