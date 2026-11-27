// SPDX-License-Identifier: GPL-3.0-or-later
// The drive pictures on their own, so the owner can judge them apart from the charts: each kind at
// its three sizes, side by side, with its name. Development only (UI-11).
import { DrivePicture } from "./DrivePicture.tsx";
import type { DriveKind, DriveSize } from "./model.ts";
import { KIND_NAME } from "./model.ts";

const KINDS: readonly DriveKind[] = ["hdd", "ssd", "nvme"];

const SIZES: readonly { size: DriveSize; name: string }[] = [
  { size: "marker", name: "Marker" },
  { size: "tile", name: "Tile" },
  { size: "large", name: "Large" },
];

export function DriveSheet() {
  return (
    <ul className="ch-dp-sheet">
      {KINDS.map((kind) => (
        <li key={kind} className="ch-dp-kind">
          <span className="ch-dp-name">{KIND_NAME[kind]}</span>
          <span className="ch-dp-sizes">
            {SIZES.map((s) => (
              <span key={s.size} className="ch-dp-size">
                <span className="ch-dp-frame">
                  <DrivePicture kind={kind} size={s.size} />
                </span>
                <span className="ch-dp-size-name">{s.name}</span>
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
