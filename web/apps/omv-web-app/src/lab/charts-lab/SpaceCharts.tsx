// SPDX-License-Identifier: GPL-3.0-or-later
// Space used (owner: the waffle in round two, one row of segments since 2026-11-27): the space used
// on a file system (FileSystemMgmt.getList `percentage`, `available`, `size` and
// `usagewarnthreshold`) at the three sizes it is needed: a map row, a table cell in a 36 to 44px
// row, and the file system's own page. Development only (UI-11).
//
// The drawing is the component library's `SegmentBar`; this file only hands it the lab's reading
// and the lab's words, as a page will. The meter is a `meter` with its value, range and name, and
// its figures are written beside it. Only past the admin's mark, and only with "Almost full" beside
// it, do the used segments past the mark take the warning colour.
import {
  SegmentBar as LibrarySegmentBar,
  SEGMENT_SHARE,
  StatusLabel,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import type { Space } from "./model.ts";
import { NBSP, OVER_WORD, pct } from "./model.ts";

export type SpaceSize = "map" | "cell" | "page";

/** "Almost full" beside the figures; it fades in over `--duration-fast` only when a reading brings it. */
export function OverWord({
  over,
  className,
}: {
  over: boolean;
  className?: string;
}) {
  const [initial] = useState(over);
  if (!over) {
    return null;
  }
  const classes = [className, over !== initial ? "ch-arrive" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes === "" ? undefined : classes}>
      <StatusLabel status="warning">{OVER_WORD}</StatusLabel>
    </span>
  );
}

/** The lab's sizes by the library's names: a row of the NAS map is the segment bar's `row`. */
const SIZE = { map: "row", cell: "cell", page: "page" } as const;

/** The segment bar at one of the lab's sizes, with the lab's words. */
export function SegmentBar({ space, size }: { space: Space; size: SpaceSize }) {
  const share = String(SEGMENT_SHARE);
  return (
    <LibrarySegmentBar
      aria-label={space.label}
      size={SIZE[size]}
      value={space.used}
      mark={space.mark}
      markLabel={
        space.mark === null
          ? undefined
          : size === "page"
            ? `Warning at ${pct(space.mark)}`
            : pct(space.mark)
      }
      // A cell has no room for the word: the table's row shows it beside the name.
      threshold={
        space.over ? { status: "warning", label: OVER_WORD } : undefined
      }
      valueText={space.valueText}
      headline={`${pct(space.used)} used`}
      figures={
        size === "page" ? (
          `${space.free} free of ${space.total}`
        ) : (
          <>
            <strong>
              {size === "map" ? `${pct(space.used)} used` : pct(space.used)}
            </strong>
            , {space.free} free
          </>
        )
      }
      note={
        space.mark === null
          ? `Each segment is ${share}${NBSP}% of the drive, and no warning mark is set.`
          : `Each segment is ${share}${NBSP}% of the drive, and the rule is the warning mark at ${pct(space.mark)}.`
      }
    />
  );
}
