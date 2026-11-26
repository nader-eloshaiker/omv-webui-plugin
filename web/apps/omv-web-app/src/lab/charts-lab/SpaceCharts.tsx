// SPDX-License-Identifier: GPL-3.0-or-later
// Three ways to draw the space used on a file system (FileSystemMgmt.getList `percentage`,
// `available`, `size` and `usagewarnthreshold`), each at the three sizes it is needed: a map row, a
// table cell in a 40px row, and the file system's own page. Development only (UI-11).
//
// Every meter is a `meter` with its value, range and name, and its figures are written beside it.
// The fill is the usage blue, one hue; only past the admin's mark, and only with "Almost full"
// beside it, do the cells past the mark take the warning colour. A new reading glides the fill over
// `--duration-glide`; under reduced motion it is drawn at its value at once. Nothing moves on load.
import { StatusLabel } from "@omv-webui/react-ui-components";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useGlideValue } from "../reel/stage.ts";
import type { Drawing, Space } from "./model.ts";
import { cellsOf, NBSP, OVER_WORD, pct } from "./model.ts";
import { useSvgId } from "./svgId.ts";

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

// ─── A. The counted bar ───────────────────────────────────────────────────────────────────────

/**
 * A taller bar of equal cells (5 % each; 2.5 % on the page), the used share on its left and the
 * free amount written after it, and the admin's mark as a notch carrying its value.
 */
export function CountedBar({ space, size }: { space: Space; size: SpaceSize }) {
  const shown = useGlideValue(space.used);
  const count = size === "page" ? 40 : 20;
  const cells = cellsOf(shown, space.mark, count);
  const bar = (
    <span
      className="ch-cb-bar"
      {...meterProps(space)}
      style={space.mark === null ? undefined : v("--m", space.mark / 100)}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className="ch-cb-cell"
          data-zone={c.zone || undefined}
          data-over={(space.over && c.zone) || undefined}
        >
          <span className="ch-cb-fill" style={v("--f", c.fill)} />
        </span>
      ))}
      {space.mark !== null ? (
        <span className="ch-cb-notch" aria-hidden="true">
          {size === "cell" ? null : (
            <span className="ch-cb-notch-value">
              {size === "page"
                ? `Warning at ${pct(space.mark)}`
                : pct(space.mark)}
            </span>
          )}
        </span>
      ) : null}
    </span>
  );
  if (size === "page") {
    return (
      <div className="ch-cb" data-size="page">
        <p className="ch-page-figures">
          <span className="ch-page-big">{pct(space.used)} used</span>
          <span className="ch-page-aside">
            {space.free} free of {space.total}
          </span>
          <OverWord over={space.over} />
        </p>
        {bar}
      </div>
    );
  }
  return (
    <div className="ch-cb" data-size={size}>
      <span className="ch-cb-line">
        <span className="ch-cb-used">{pct(space.used)}</span>
        {bar}
        <span className="ch-cb-free">{space.free} free</span>
      </span>
      {size === "map" ? (
        <OverWord over={space.over} className="ch-over" />
      ) : null}
    </div>
  );
}

// ─── B. The waffle ────────────────────────────────────────────────────────────────────────────

const WAFFLE: Record<SpaceSize, { cols: number; rows: number }> = {
  map: { cols: 20, rows: 5 },
  cell: { cols: 25, rows: 2 },
  page: { cols: 25, rows: 4 },
};

/**
 * Squares that each stand for a fixed share of the drive (1 %; 2 % in a table cell), filled a
 * column at a time from the left, so it still reads as more to the right. The squares past the mark
 * are hollow, so the room left before the warning can be counted.
 */
export function Waffle({ space, size }: { space: Space; size: SpaceSize }) {
  const shown = useGlideValue(space.used);
  const { cols, rows } = WAFFLE[size];
  const cells = cellsOf(shown, space.mark, cols * rows);
  // Column by column, bottom to top: square i is column floor(i / rows), row from the bottom.
  const grid = (
    <span
      className="ch-wf-grid"
      {...meterProps(space)}
      style={{ ...v("--cols", cols), ...v("--rows", rows) }}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className="ch-wf-sq"
          data-zone={c.zone || undefined}
          data-over={(space.over && c.zone) || undefined}
          style={{
            ...v("--col", Math.floor(i / rows) + 1),
            ...v("--row", rows - (i % rows)),
          }}
        >
          <span className="ch-wf-fill" style={v("--f", c.fill)} />
        </span>
      ))}
    </span>
  );
  const share = size === "cell" ? "2" : "1";
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
  return (
    <div className="ch-wf" data-size={size}>
      {size === "page" ? (
        <p className="ch-page-figures">
          <span className="ch-page-big">{pct(space.used)} used</span>
          <span className="ch-page-aside">
            {space.free} free of {space.total}
          </span>
          <OverWord over={space.over} />
        </p>
      ) : null}
      {grid}
      {size === "map" ? (
        <span className="ch-wf-words">
          <span className="ch-strong">{pct(space.used)} used</span>,{" "}
          {space.free} free
        </span>
      ) : (
        <span className="ch-wf-words">
          {`Each square is ${share}${NBSP}% of the drive`}
          {space.mark === null
            ? "."
            : `; the hollow ones are past the warning mark at ${pct(space.mark)}.`}
        </span>
      )}
      {size === "map" ? (
        <OverWord over={space.over} className="ch-over" />
      ) : null}
    </div>
  );
}

// ─── C. The drive filling ─────────────────────────────────────────────────────────────────────

interface Body {
  /** The outline. */
  d: string;
  /** The inside the level fills, as a rectangle. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fills from the left (a stick lying down) rather than from the bottom. */
  across: boolean;
}

// The shapes, front view, in a 32 × 44 box (an NVMe stick lies across a 44 × 16 box).
const HDD: Body = {
  d: "M5 1.5h22a3.5 3.5 0 0 1 3.5 3.5v34a3.5 3.5 0 0 1-3.5 3.5H5A3.5 3.5 0 0 1 1.5 39V5A3.5 3.5 0 0 1 5 1.5Z",
  x: 4,
  y: 4,
  w: 24,
  h: 36,
  across: false,
};
const SSD: Body = {
  d: "M3.5 1.5h25a2 2 0 0 1 2 2v37a2 2 0 0 1-2 2h-25a2 2 0 0 1-2-2v-37a2 2 0 0 1 2-2Z",
  x: 4,
  y: 4,
  w: 24,
  h: 36,
  across: false,
};
const NVME: Body = {
  d: "M1.5 3.5a2 2 0 0 1 2-2h35v4h4v5h-4v4h-35a2 2 0 0 1-2-2Z",
  x: 4,
  y: 4,
  w: 32,
  h: 8,
  across: true,
};

function bodyOf(drawing: Drawing): Body {
  return drawing === "nvme" ? NVME : drawing === "ssd" ? SSD : HDD;
}

/** One drive's outline with its level: the used share in the usage blue, the mark as a dashed line. */
function DriveShape({
  body,
  used,
  mark,
  over,
  dx = 0,
  clipId,
}: {
  body: Body;
  used: number;
  mark: number | null;
  over: boolean;
  dx?: number;
  clipId: string;
}) {
  const k = Math.min(1, Math.max(0, used / 100));
  const m = mark === null ? null : mark / 100;
  // The level, and the part of it past the mark.
  const level = body.across
    ? { x: body.x, y: body.y, w: body.w * k, h: body.h }
    : { x: body.x, y: body.y + body.h * (1 - k), w: body.w, h: body.h * k };
  const past =
    m === null || !over || k <= m
      ? null
      : body.across
        ? { x: body.x + body.w * m, y: body.y, w: body.w * (k - m), h: body.h }
        : {
            x: body.x,
            y: body.y + body.h * (1 - k),
            w: body.w,
            h: body.h * (k - m),
          };
  return (
    <g transform={dx === 0 ? undefined : `translate(${String(dx)} 0)`}>
      <clipPath id={clipId}>
        <rect x={body.x} y={body.y} width={body.w} height={body.h} rx="1.5" />
      </clipPath>
      <path d={body.d} className="ch-dr-body" />
      <g clipPath={`url(#${clipId})`}>
        <rect
          x={body.x}
          y={body.y}
          width={body.w}
          height={body.h}
          className="ch-dr-track"
        />
        <rect
          x={level.x}
          y={level.y}
          width={level.w}
          height={level.h}
          className="ch-dr-level"
        />
        {past ? (
          <rect
            x={past.x}
            y={past.y}
            width={past.w}
            height={past.h}
            className="ch-dr-past"
          />
        ) : null}
      </g>
      {m === null ? null : body.across ? (
        <path
          d={`M${String(body.x + body.w * m)} ${String(body.y - 2)}V${String(body.y + body.h + 2)}`}
          className="ch-dr-mark"
        />
      ) : (
        <path
          d={`M${String(body.x - 2)} ${String(body.y + body.h * (1 - m))}H${String(body.x + body.w + 2)}`}
          className="ch-dr-mark"
        />
      )}
    </g>
  );
}

/**
 * The drive drawn from its kind (a disk, an SSD, an NVMe stick, or the two disks of a mirror, which
 * hold the same files), filling to its used share, with the mark as a dashed line across it.
 */
export function DriveFill({ space, size }: { space: Space; size: SpaceSize }) {
  const shown = useGlideValue(space.used);
  const clip = useSvgId("chdr");
  const body = bodyOf(space.drawing);
  const two = space.drawing === "mirror";
  const vbW = body.across ? 44 : two ? 70 : 32;
  const vbH = body.across ? 16 : 44;
  const picture = (
    <svg
      className="ch-dr-svg"
      data-across={body.across || undefined}
      data-two={two || undefined}
      viewBox={`0 0 ${String(vbW)} ${String(vbH)}`}
      {...meterProps(space)}
    >
      <DriveShape
        body={body}
        used={shown}
        mark={space.mark}
        over={space.over}
        clipId={`${clip}a`}
      />
      {two ? (
        <DriveShape
          body={body}
          used={shown}
          mark={space.mark}
          over={space.over}
          dx={38}
          clipId={`${clip}b`}
        />
      ) : null}
    </svg>
  );
  if (size === "cell") {
    return (
      <div className="ch-dr" data-size="cell">
        {picture}
        <span className="ch-dr-words">
          <span className="ch-strong">{pct(space.used)}</span>, {space.free}{" "}
          free
        </span>
      </div>
    );
  }
  return (
    <div className="ch-dr" data-size={size}>
      {picture}
      <span className="ch-dr-words">
        <span className={size === "page" ? "ch-page-big" : "ch-strong"}>
          {pct(space.used)} used
        </span>
        <span className="ch-dr-free">
          {space.free} free of {space.total}
        </span>
        {space.mark === null ? (
          <span className="ch-dr-note">No warning mark is set.</span>
        ) : size === "page" ? (
          <span className="ch-dr-note">
            The dashed line is the warning mark, {pct(space.mark)}.
          </span>
        ) : (
          <span className="ch-dr-note">Warning mark: {pct(space.mark)}</span>
        )}
        {two && size === "page" ? (
          <span className="ch-dr-note">
            Both disks hold the same files, so they fill together.
          </span>
        ) : null}
        <OverWord over={space.over} />
      </span>
    </div>
  );
}
