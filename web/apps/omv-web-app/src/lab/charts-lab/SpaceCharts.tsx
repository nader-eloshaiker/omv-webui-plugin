// SPDX-License-Identifier: GPL-3.0-or-later
// The waffle (owner, round two): the space used on a file system (FileSystemMgmt.getList
// `percentage`, `available`, `size` and `usagewarnthreshold`) at the three sizes it is needed: a
// map row, a table cell in a 36 to 44px row, and the file system's own page. Development only
// (UI-11).
//
// The meter is a `meter` with its value, range and name, and its figures are written beside it.
// Used squares are the usage blue; empty squares are solid, never outlines. The warning mark is a
// gap with a rule in it, its value written above in the map row and on the page. Only past the
// admin's mark, and only with "Almost full" beside it, do the used squares past the mark take the
// warning colour. A new reading glides the fill over `--duration-glide`; under reduced motion it is
// drawn at its value at once. Nothing moves on load.
import { StatusLabel } from "@omv-webui/react-ui-components";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useGlideValue } from "../reel/stage.ts";
import type { Space, WaffleShape, WaffleSize } from "./model.ts";
import { NBSP, OVER_WORD, pct, waffleDrawing, waffleOf } from "./model.ts";

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

function meterProps(space: Space) {
  return {
    role: "meter",
    "aria-label": space.label,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": space.used,
    "aria-valuetext": space.valueText,
  } as const;
}

const v = (name: string, value: number) =>
  ({ [name]: String(value) }) as CSSProperties;

/** Every column is 5 % at every size: 1 % squares five high, or 2.5 % squares two high in a cell. */
const WAFFLE_SHAPES: Record<SpaceSize, WaffleShape> = {
  map: { cols: 20, rows: 5 },
  cell: { cols: 20, rows: 2 },
  page: { cols: 20, rows: 5 },
};

const WAFFLE_SIZES: Record<SpaceSize, WaffleSize> = {
  map: { sq: 7, gap: 2, wide: 6, ext: 3 },
  cell: { sq: 5, gap: 1.5, wide: 4, ext: 3 },
  page: { sq: 18, gap: 4, wide: 14, ext: 6 },
};

const RADIUS: Record<SpaceSize, number> = { map: 1.5, cell: 1, page: 3 };

/**
 * Squares that each stand for a fixed share of the drive, filled a column at a time from the left,
 * with the warning mark as a gap and a rule between the squares before it and the squares past it.
 */
export function Waffle({ space, size }: { space: Space; size: SpaceSize }) {
  const shown = useGlideValue(space.used);
  const shape = WAFFLE_SHAPES[size];
  const box = WAFFLE_SIZES[size];
  const model = waffleOf(shown, space.mark, shape);
  const drawing = waffleDrawing(model, shape, box);
  const r = RADIUS[size];
  const markWords =
    space.mark === null || drawing.ruleX === null || size === "cell"
      ? null
      : size === "page"
        ? `Warning at ${pct(space.mark)}`
        : pct(space.mark);
  const grid = (
    <span
      className="ch-wf-grid"
      data-marked={markWords === null ? undefined : ""}
      {...meterProps(space)}
      style={v("--w", drawing.width)}
    >
      {markWords !== null && drawing.ruleX !== null ? (
        <span
          className="ch-wf-mark"
          aria-hidden="true"
          style={v("--x", drawing.ruleX / drawing.width)}
        >
          {markWords}
        </span>
      ) : null}
      <svg
        className="ch-wf-svg"
        viewBox={`0 0 ${String(drawing.width)} ${String(drawing.height)}`}
        aria-hidden="true"
        focusable="false"
      >
        {model.squares.map((s, i) => {
          const p = drawing.at[i] ?? { x: 0, y: 0 };
          return (
            <g
              key={`${String(s.col)}:${String(s.row)}`}
              data-past={s.past || undefined}
              data-over={(space.over && s.past) || undefined}
            >
              <rect
                className="ch-wf-empty"
                x={p.x}
                y={p.y}
                width={box.sq}
                height={box.sq}
                rx={r}
              />
              {s.fill > 0 ? (
                <rect
                  className="ch-wf-used"
                  x={p.x}
                  y={p.y + box.sq * (1 - s.fill)}
                  width={box.sq}
                  height={box.sq * s.fill}
                  rx={Math.min(r, (box.sq * s.fill) / 2)}
                />
              ) : null}
            </g>
          );
        })}
        {drawing.rule === null ? null : (
          <path d={drawing.rule} className="ch-wf-rule" />
        )}
      </svg>
    </span>
  );
  if (size === "cell") {
    return (
      <div className="ch-wf" data-size="cell">
        {grid}
        <span className="ch-wf-words">
          <span className="ch-strong">{pct(space.used)}</span>, {space.free}{" "}
          free
        </span>
      </div>
    );
  }
  if (size === "map") {
    return (
      <div className="ch-wf" data-size="map">
        {grid}
        <span className="ch-wf-words">
          <span className="ch-strong">{pct(space.used)} used</span>,{" "}
          {space.free} free
        </span>
        <OverWord over={space.over} className="ch-over" />
      </div>
    );
  }
  const share = String(model.share);
  return (
    <div className="ch-wf" data-size="page">
      <p className="ch-page-figures">
        <span className="ch-page-big">{pct(space.used)} used</span>
        <span className="ch-page-aside">
          {space.free} free of {space.total}
        </span>
        <OverWord over={space.over} />
      </p>
      {grid}
      <span className="ch-wf-words">
        {space.mark === null
          ? `Each square is ${share}${NBSP}% of the drive, and no warning mark is set.`
          : `Each square is ${share}${NBSP}% of the drive, and the gap is the warning mark at ${pct(space.mark)}.`}
      </span>
    </div>
  );
}
