// SPDX-License-Identifier: GPL-3.0-or-later
// The waffle (owner, round two): the space used on a file system (FileSystemMgmt.getList
// `percentage`, `available`, `size` and `usagewarnthreshold`) at the three sizes it is needed: a
// map row, a table cell in a 36 to 44px row, and the file system's own page. Development only
// (UI-11).
//
// The drawing is the component library's `Waffle`; this file only hands it the lab's reading and the
// lab's words, as a page will. The meter is a `meter` with its value, range and name, and its figures
// are written beside it. Only past the admin's mark, and only with "Almost full" beside it, do the
// used squares past the mark take the warning colour.
import {
  Waffle as LibraryWaffle,
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

/** The lab's sizes by the library's names: a row of the NAS map is the waffle's `row`. */
const SIZE = { map: "row", cell: "cell", page: "page" } as const;

/** The waffle at one of the lab's sizes, with the lab's words. */
export function Waffle({ space, size }: { space: Space; size: SpaceSize }) {
  const squares = size === "cell" ? 40 : 100;
  const share = String(100 / squares);
  return (
    <LibraryWaffle
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
          ? `Each square is ${share}${NBSP}% of the drive, and no warning mark is set.`
          : `Each square is ${share}${NBSP}% of the drive, and the gap is the warning mark at ${pct(space.mark)}.`
      }
    />
  );
}
