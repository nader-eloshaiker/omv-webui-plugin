// SPDX-License-Identifier: GPL-3.0-or-later
// The three kinds of disk drawn as what they are (owner, 2026-11-26): a 3.5" hard disk seen from above
// with its platter, spindle and head arm; a 2.5" SSD with its flash chips, controller and SATA
// connector; an M.2 NVMe stick with its contact fingers and key notch at one end and the half-round
// mounting cut-out at the other. They follow the icon set's disk-hdd, disk-ssd and disk-nvme. A disk
// whose kind was not read is drawn as a plain drive with a blank label, claiming none (2026-11-27).
// The stick lies flat where it sits on the mainboard, and stands upright beside the other drives in
// the temperatures (owner, 2026-11-27), its fingers at the foot.
//
// Each comes in three sizes, each drawn for its size on a pixel grid (the viewBox is the size), not
// scaled from one drawing: the marker for a key or a line of text, the tile in the temperatures and
// the large one for a disk's own page. Lines and fills are the neutral inks only: the shape says the
// kind, so no kind takes a colour, and no drive has a light (style guide 10, rule 10). JSX from
// props, never an SVG string (UI-2). Decorative: the kind is always said in text beside it.
import type * as React from "react";
import { Fragment } from "react";
import { cn } from "../../utils";
import {
  DRIVE_PICTURE_BOX,
  drivePictureBox,
  type DrivePictureOrientation,
  type DrivePictureShape,
  type DrivePictureSize,
} from "./drive-picture-model";

/** The inks of each part, from the text and divider tokens only. */
const PART = {
  body: "fill-muted stroke-muted-foreground",
  platter: "fill-border stroke-foreground",
  ring: "fill-none stroke-muted",
  hub: "fill-muted stroke-foreground",
  arm: "fill-none stroke-foreground",
  ink: "fill-foreground",
  chip: "fill-muted-foreground",
  faint: "fill-border",
  pin: "fill-none stroke-muted-foreground",
  conn: "fill-border stroke-muted-foreground",
} as const;

type Part = keyof typeof PART;

/** A part's ink and its name, for the drawing and for tests. */
function part(name: Part) {
  return { "data-part": name, className: PART[name] };
}

const STROKE: Record<DrivePictureSize, number> = {
  marker: 1.1,
  tile: 1.5,
  large: 1.75,
};

/** Four screw heads, one in each corner. */
function screws(w: number, h: number, inset: number, r: number) {
  return [
    [inset, inset],
    [w - inset, inset],
    [inset, h - inset],
    [w - inset, h - inset],
  ].map(([x, y]) => (
    <circle
      key={`${String(x)} ${String(y)}`}
      cx={x}
      cy={y}
      r={r}
      {...part("faint")}
    />
  ));
}

// ─── Hard disk: a 3.5" body seen from above ─────────────────────────────────────────────────────

function HardDisk({ size }: { size: DrivePictureSize }) {
  const { w, h } = DRIVE_PICTURE_BOX[size].hdd;
  const sw = STROKE[size];
  const i = sw / 2;
  // The platter sits towards one end, as in the drive; the head arm pivots below it at the side.
  const cx = w / 2;
  const cy = w / 2;
  if (size === "marker") {
    return (
      <>
        <rect
          x={i}
          y={i}
          width={w - sw}
          height={h - sw}
          rx={1.75}
          {...part("body")}
          strokeWidth={sw}
        />
        <circle cx={cx} cy={cy} r={4.3} {...part("platter")} strokeWidth={sw} />
        <path d="M9.6 12.7 6.5 8.4" {...part("arm")} strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={1.1} {...part("ink")} />
      </>
    );
  }
  const large = size === "large";
  const r = large ? 21.5 : 16.5;
  const pivot = large ? { x: 43, y: 60 } : { x: 33, y: 46 };
  const head = large ? { x: 21.5, y: 35 } : { x: 16.5, y: 27 };
  return (
    <>
      <rect
        x={i}
        y={i}
        width={w - sw}
        height={h - sw}
        rx={large ? 4.5 : 3.5}
        {...part("body")}
        strokeWidth={sw}
      />
      {screws(w, h, large ? 4.5 : 3.5, large ? 1.4 : 1.1)}
      {large ? (
        <rect
          x={35}
          y={53}
          width={14}
          height={15.5}
          rx={3}
          {...part("faint")}
        />
      ) : null}
      <circle cx={cx} cy={cy} r={r} {...part("platter")} strokeWidth={sw} />
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.62}
        {...part("ring")}
        strokeWidth={large ? 1.25 : 1}
      />
      <circle
        cx={cx}
        cy={cy}
        r={large ? 4.5 : 3.4}
        {...part("hub")}
        strokeWidth={sw}
      />
      <circle cx={cx} cy={cy} r={large ? 1.4 : 1.1} {...part("ink")} />
      <path
        d={`M${String(pivot.x)} ${String(pivot.y)}L${String(head.x)} ${String(head.y)}`}
        {...part("arm")}
        strokeWidth={large ? 3 : 2.5}
      />
      <rect
        x={head.x - (large ? 2 : 1.6)}
        y={head.y - (large ? 2 : 1.6)}
        width={large ? 4 : 3.2}
        height={large ? 4 : 3.2}
        rx={0.6}
        {...part("ink")}
      />
      <circle
        cx={pivot.x}
        cy={pivot.y}
        r={large ? 4.5 : 3.5}
        {...part("hub")}
        strokeWidth={sw}
      />
      <circle cx={pivot.x} cy={pivot.y} r={large ? 1.3 : 1} {...part("ink")} />
    </>
  );
}

// ─── SSD: a 2.5" slab of chips with the SATA connector on its edge ──────────────────────────────

function Ssd({ size }: { size: DrivePictureSize }) {
  const { w, h } = DRIVE_PICTURE_BOX[size].ssd;
  const sw = STROKE[size];
  const i = sw / 2;
  if (size === "marker") {
    return (
      <>
        <rect
          x={i}
          y={i}
          width={w - sw}
          height={h - sw}
          rx={1.5}
          {...part("body")}
          strokeWidth={sw}
        />
        <rect
          x={2.5}
          y={2.5}
          width={7}
          height={4.5}
          rx={0.5}
          {...part("ink")}
        />
        <rect x={2.5} y={8} width={7} height={3.5} rx={0.5} {...part("chip")} />
        <rect x={2.5} y={12.5} width={7} height={2.5} {...part("chip")} />
      </>
    );
  }
  const large = size === "large";
  // Laid out from the box, so the slab fills the hard disk's footprint: the controller and a cache
  // chip on top, two rows of two memory chips, and the connector at the foot, its short data part
  // and long power part either side of the key gap.
  const pad = large ? 6 : 4.5;
  const gap = large ? 2.5 : 2;
  const col = (w - 2 * pad - gap) / 2;
  const ink = col - 2;
  const connH = large ? 7 : 5.5;
  const conn = {
    y: h - connH,
    data: [w * 0.14, w * 0.345].map((n) => Math.round(n * 2) / 2),
    power: [w * 0.414, w * 0.862].map((n) => Math.round(n * 2) / 2),
  };
  const rowTop = pad + ink + 3;
  const rowH = (conn.y - 3 - rowTop - gap) / 2;
  const right = pad + col + gap;
  const faint = (col - 2) / 2;
  const pins = (from: number, to: number) => {
    const d: string[] = [];
    for (let x = from + 1.6; x < to - 0.8; x += 1.6) {
      d.push(
        `M${x.toFixed(1)} ${String(conn.y + 1.5)}v${String(h - conn.y - 3)}`,
      );
    }
    return d.join("");
  };
  return (
    <>
      <rect
        x={i}
        y={i}
        width={w - sw}
        height={h - sw}
        rx={large ? 3.5 : 3}
        {...part("body")}
        strokeWidth={sw}
      />
      <rect x={pad} y={pad} width={ink} height={ink} rx={1} {...part("ink")} />
      <rect
        x={right}
        y={pad}
        width={col}
        height={ink / 2}
        rx={0.75}
        {...part("chip")}
      />
      <rect
        x={right}
        y={pad + ink / 2 + 2}
        width={faint}
        height={ink / 2 - 2}
        rx={0.5}
        {...part("faint")}
      />
      <rect
        x={right + faint + 2}
        y={pad + ink / 2 + 2}
        width={faint}
        height={ink / 2 - 2}
        rx={0.5}
        {...part("faint")}
      />
      {[rowTop, rowTop + rowH + gap].map((y) => (
        <Fragment key={y}>
          <rect
            x={pad}
            y={y}
            width={col}
            height={rowH}
            rx={0.75}
            {...part("chip")}
          />
          <rect
            x={right}
            y={y}
            width={col}
            height={rowH}
            rx={0.75}
            {...part("chip")}
          />
        </Fragment>
      ))}
      <rect
        x={conn.data[0]}
        y={conn.y}
        width={(conn.data[1] ?? 0) - (conn.data[0] ?? 0)}
        height={h - conn.y}
        {...part("conn")}
        strokeWidth={1}
      />
      <rect
        x={conn.power[0]}
        y={conn.y}
        width={(conn.power[1] ?? 0) - (conn.power[0] ?? 0)}
        height={h - conn.y}
        {...part("conn")}
        strokeWidth={1}
      />
      {large ? (
        <path
          d={
            pins(conn.data[0] ?? 0, conn.data[1] ?? 0) +
            pins(conn.power[0] ?? 0, conn.power[1] ?? 0)
          }
          {...part("pin")}
          strokeWidth={0.75}
        />
      ) : null}
    </>
  );
}

// ─── NVMe SSD: an M.2 stick lying down ─────────────────────────────────────────────────────────

/** The board's outline: the key notch cut into the connector end, the half-round cut-out opposite. */
function stickPath(
  w: number,
  h: number,
  sw: number,
  notch: { y: number; h: number; depth: number },
  cut: number,
): string {
  const i = sw / 2;
  const cy = h / 2;
  const f = (n: number) => n.toFixed(2);
  return (
    `M${f(i)} ${f(i)}H${f(w - i)}V${f(cy - cut)}` +
    `A${f(cut)} ${f(cut)} 0 0 0 ${f(w - i)} ${f(cy + cut)}` +
    `V${f(h - i)}H${f(i)}V${f(notch.y + notch.h)}` +
    `H${f(i + notch.depth)}V${f(notch.y)}H${f(i)}Z`
  );
}

function NvmeStick({ size }: { size: DrivePictureSize }) {
  const { w, h } = DRIVE_PICTURE_BOX[size].nvme;
  const sw = STROKE[size] * (size === "marker" ? 0.95 : 0.85);
  if (size === "marker") {
    return (
      <>
        <path
          d={stickPath(w, h, sw, { y: 1.1, h: 1.2, depth: 2 }, 1.3)}
          {...part("body")}
          strokeWidth={sw}
        />
        <rect x={4} y={1.5} width={3.6} height={3} rx={0.4} {...part("ink")} />
        <rect
          x={8.6}
          y={1.5}
          width={3.4}
          height={3}
          rx={0.4}
          {...part("chip")}
        />
      </>
    );
  }
  const large = size === "large";
  const notch = large
    ? { y: 4, h: 2, depth: 5.5 }
    : { y: 3.3, h: 1.6, depth: 4.2 };
  const fingers = large ? 6 : 4.5;
  const pitch = large ? 2 : 1.8;
  const lines: string[] = [];
  for (let y = sw + 1; y < h - sw - 0.5; y += pitch) {
    if (y > notch.y - 0.8 && y < notch.y + notch.h + 0.8) {
      continue;
    }
    lines.push(
      `M${(sw / 2 + 0.6).toFixed(1)} ${y.toFixed(1)}h${String(fingers - 1.2)}`,
    );
  }
  return (
    <>
      <path
        d={stickPath(w, h, sw, notch, large ? 3 : 2.4)}
        {...part("body")}
        strokeWidth={sw}
      />
      <path d={lines.join("")} {...part("pin")} strokeWidth={large ? 1 : 0.9} />
      <path
        d={`M${String(fingers + 0.75)} ${String(sw)}V${String(h - sw)}`}
        {...part("pin")}
        strokeWidth={0.75}
      />
      {large ? (
        <>
          <rect x={11} y={4} width={12} height={12} rx={1} {...part("ink")} />
          <rect x={25} y={4} width={8} height={6} rx={0.6} {...part("chip")} />
          <rect x={25} y={12} width={3.4} height={2.4} {...part("faint")} />
          <rect x={29.6} y={12} width={3.4} height={2.4} {...part("faint")} />
          <rect
            x={36}
            y={3.5}
            width={14}
            height={13}
            rx={0.9}
            {...part("chip")}
          />
          <rect
            x={52}
            y={3.5}
            width={14}
            height={13}
            rx={0.9}
            {...part("chip")}
          />
        </>
      ) : (
        <>
          <rect
            x={8.5}
            y={3}
            width={10}
            height={10}
            rx={0.8}
            {...part("ink")}
          />
          <rect
            x={21.5}
            y={2.5}
            width={12}
            height={11}
            rx={0.8}
            {...part("chip")}
          />
          <rect
            x={35.5}
            y={2.5}
            width={12}
            height={11}
            rx={0.8}
            {...part("chip")}
          />
        </>
      )}
    </>
  );
}

// ─── A drive of no known kind: a plain body with a blank label ─────────────────────────────────

/**
 * The drive bay's `disk` seen from above: the body and a blank label plate with one line on it, and
 * nothing that says a kind (no platter, no chips, no connector, no stick). The hard disk's box, so it
 * stands where every upright tile has its picture.
 */
function PlainDisk({ size }: { size: DrivePictureSize }) {
  const { w, h } = DRIVE_PICTURE_BOX[size].disk;
  const sw = STROKE[size];
  const i = sw / 2;
  const plate =
    size === "marker"
      ? { x: 2.75, y: 2.75, w: 6.5, h: 7, rx: 0.75 }
      : size === "large"
        ? { x: 10, y: 13, w: 32, h: 40, rx: 2.5 }
        : { x: 8, y: 10, w: 24, h: 30, rx: 2 };
  return (
    <>
      <rect
        x={i}
        y={i}
        width={w - sw}
        height={h - sw}
        rx={size === "marker" ? 1.75 : size === "large" ? 4.5 : 3.5}
        {...part("body")}
        strokeWidth={sw}
      />
      <rect
        x={plate.x}
        y={plate.y}
        width={plate.w}
        height={plate.h}
        rx={plate.rx}
        {...part("faint")}
      />
      {size === "marker" ? null : (
        <path
          d={`M${String(plate.x + plate.w / 4)} ${String(plate.y + plate.h / 4)}h${String(plate.w / 2)}`}
          {...part("pin")}
          strokeWidth={sw}
        />
      )}
    </>
  );
}

function Drawing({
  kind,
  size,
}: {
  kind: DrivePictureShape;
  size: DrivePictureSize;
}) {
  if (kind === "disk") {
    return <PlainDisk size={size} />;
  }
  if (kind === "ssd") {
    return <Ssd size={size} />;
  }
  if (kind === "nvme") {
    return <NvmeStick size={size} />;
  }
  return <HardDisk size={size} />;
}

interface DrivePictureProps extends Omit<
  React.ComponentProps<"svg">,
  "children" | "width" | "height" | "viewBox"
> {
  /**
   * What the disk is: a hard disk, an SATA SSD or an NVMe SSD; or `disk`, a plain drive that claims
   * no kind, for a disk whose kind was not read (`driveKindOf` gave null).
   */
  kind: DrivePictureShape;
  /**
   * `marker`: beside a word or in a key, 12 to 16px. `tile`: in the temperatures, the scale's length
   * (56px) tall, or long for a stick lying flat. `large`: a disk's own page.
   */
  size?: DrivePictureSize;
  /**
   * The NVMe stick only: `lying` flat as it sits on the mainboard (the default), or `upright`, its
   * contact fingers at the foot, as tall as the other drives at its size. The other kinds always
   * stand upright and ignore it.
   */
  orientation?: DrivePictureOrientation;
}

/**
 * A drive's picture on its own, at its size. Decorative (`aria-hidden`): the kind is always said in
 * text beside it. The inks are the neutral text and divider tokens, in both themes.
 */
function DrivePicture({
  kind,
  size = "tile",
  orientation = "lying",
  className,
  ...props
}: DrivePictureProps) {
  const { w, h } = drivePictureBox(kind, size, orientation);
  // The stick standing up is the same drawing turned a quarter round, its fingers at the foot: a
  // transform in the drawing's own coordinates, not a style.
  const upright = kind === "nvme" && orientation === "upright";
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-slot="drive-picture"
      data-kind={kind}
      data-size={size}
      data-orientation={kind === "nvme" ? orientation : undefined}
      width={w}
      height={h}
      viewBox={`0 0 ${String(w)} ${String(h)}`}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={cn(
        "block flex-none overflow-visible",
        // The marker's body takes the body ink, so the small outline holds on every ground.
        size === "marker" && "[&_[data-part=body]]:stroke-foreground",
        className,
      )}
      {...props}
    >
      {upright ? (
        <g transform={`translate(0 ${String(h)}) rotate(-90)`}>
          <Drawing kind={kind} size={size} />
        </g>
      ) : (
        <Drawing kind={kind} size={size} />
      )}
    </svg>
  );
}

export { DrivePicture };
export type { DrivePictureProps };
