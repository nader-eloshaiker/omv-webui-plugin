// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's name for display in the shares slice (phase 5 shares design 0.2): the file-systems
// slice's name rule, with the label's or device's bidirectional controls shown as "�"
// (format/isolate.ts), so a label cannot pass for another name. Display only: rows are matched and
// addressed by their own fields, never by this. Pure.
import { fsName, type FsName } from "../filesystems/fsModel.ts";
import { inertBidi } from "../format/isolate.ts";

export function shownFsName(row: Parameters<typeof fsName>[0]): FsName {
  const name = fsName(row);
  return name.kind === "label"
    ? { kind: "label", text: inertBidi(name.text) }
    : { ...name, device: inertBidi(name.device) };
}
