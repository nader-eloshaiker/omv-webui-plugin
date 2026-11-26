// SPDX-License-Identifier: GPL-3.0-or-later
// The three kinds of disk drawn as what they are (owner, round three): a 3.5" hard disk seen from
// above with its platter, spindle and head arm; a 2.5" SSD with its flash chips, controller and SATA
// connector; an M.2 NVMe stick with its contact fingers and key notch at one end and the half-round
// mounting cut-out at the other. They follow the library's disk-hdd, disk-ssd and disk-nvme icons.
//
// Each comes in three sizes, each drawn for its size on a pixel grid (the viewBox is the size), not
// scaled from one drawing: the marker on the temperature scale, the tile on the Disks page and the
// large one for a key or a disk's own page. Lines and fills are the neutral inks only (charts.css,
// .dp-*): the shape says the kind, so no kind takes a colour, and no drive has a light. JSX from
// props, never an SVG string (UI-2). Decorative: the kind is always said in text beside it.
// Development only (UI-11).
import type { DriveKind, DriveSize } from "./model.ts";
import { DRIVE_BOX, MARKER_BOX } from "./model.ts";

const STROKE: Record<DriveSize, number> = {
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
      className="dp-faint"
    />
  ));
}

// ─── Hard disk: a 3.5" body seen from above ─────────────────────────────────────────────────────

function HardDisk({ size }: { size: DriveSize }) {
  const { w, h } = DRIVE_BOX[size].hdd;
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
          className="dp-body"
          strokeWidth={sw}
        />
        <circle
          cx={cx}
          cy={cy}
          r={4.3}
          className="dp-platter"
          strokeWidth={sw}
        />
        <path d="M9.6 12.7 6.5 8.4" className="dp-arm" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={1.1} className="dp-ink" />
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
        className="dp-body"
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
          className="dp-faint"
        />
      ) : null}
      <circle cx={cx} cy={cy} r={r} className="dp-platter" strokeWidth={sw} />
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.62}
        className="dp-ring"
        strokeWidth={large ? 1.25 : 1}
      />
      <circle
        cx={cx}
        cy={cy}
        r={large ? 4.5 : 3.4}
        className="dp-hub"
        strokeWidth={sw}
      />
      <circle cx={cx} cy={cy} r={large ? 1.4 : 1.1} className="dp-ink" />
      <path
        d={`M${String(pivot.x)} ${String(pivot.y)}L${String(head.x)} ${String(head.y)}`}
        className="dp-arm"
        strokeWidth={large ? 3 : 2.5}
      />
      <rect
        x={head.x - (large ? 2 : 1.6)}
        y={head.y - (large ? 2 : 1.6)}
        width={large ? 4 : 3.2}
        height={large ? 4 : 3.2}
        rx={0.6}
        className="dp-ink"
      />
      <circle
        cx={pivot.x}
        cy={pivot.y}
        r={large ? 4.5 : 3.5}
        className="dp-hub"
        strokeWidth={sw}
      />
      <circle
        cx={pivot.x}
        cy={pivot.y}
        r={large ? 1.3 : 1}
        className="dp-ink"
      />
    </>
  );
}

// ─── SSD: a 2.5" slab of chips with the SATA connector on its edge ──────────────────────────────

function Ssd({ size }: { size: DriveSize }) {
  const { w, h } = DRIVE_BOX[size].ssd;
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
          className="dp-body"
          strokeWidth={sw}
        />
        <rect
          x={2.4}
          y={2.4}
          width={5.2}
          height={3.4}
          rx={0.5}
          className="dp-ink"
        />
        <rect
          x={2.4}
          y={6.7}
          width={5.2}
          height={3.1}
          rx={0.5}
          className="dp-chip"
        />
        <rect x={2.4} y={10.9} width={5.2} height={2.1} className="dp-chip" />
      </>
    );
  }
  const large = size === "large";
  // The connector: the short data part and the long power part, with the key gap between them.
  const conn = large
    ? { y: h - 7, data: [5, 12.5], power: [14.5, 32] }
    : { y: h - 5.5, data: [4, 10], power: [12, 25] };
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
        rx={large ? 3 : 2.5}
        className="dp-body"
        strokeWidth={sw}
      />
      {large ? (
        <>
          <rect
            x={5.5}
            y={5.5}
            width={11}
            height={11}
            rx={1}
            className="dp-ink"
          />
          <rect
            x={19.5}
            y={5.5}
            width={12}
            height={6}
            rx={0.75}
            className="dp-chip"
          />
          <rect
            x={19.5}
            y={13}
            width={5}
            height={3.5}
            rx={0.5}
            className="dp-faint"
          />
          <rect
            x={26.5}
            y={13}
            width={5}
            height={3.5}
            rx={0.5}
            className="dp-faint"
          />
          <rect
            x={5.5}
            y={19.5}
            width={12}
            height={10}
            rx={0.75}
            className="dp-chip"
          />
          <rect
            x={19.5}
            y={19.5}
            width={12}
            height={10}
            rx={0.75}
            className="dp-chip"
          />
          <rect
            x={5.5}
            y={31.5}
            width={12}
            height={10}
            rx={0.75}
            className="dp-chip"
          />
          <rect
            x={19.5}
            y={31.5}
            width={12}
            height={10}
            rx={0.75}
            className="dp-chip"
          />
        </>
      ) : (
        <>
          <rect
            x={4.5}
            y={4.5}
            width={9}
            height={9}
            rx={1}
            className="dp-ink"
          />
          <rect
            x={15.5}
            y={4.5}
            width={9}
            height={5.5}
            rx={0.75}
            className="dp-chip"
          />
          <rect
            x={4.5}
            y={16}
            width={9}
            height={13.5}
            rx={0.75}
            className="dp-chip"
          />
          <rect
            x={15.5}
            y={16}
            width={9}
            height={13.5}
            rx={0.75}
            className="dp-chip"
          />
        </>
      )}
      <rect
        x={conn.data[0]}
        y={conn.y}
        width={(conn.data[1] ?? 0) - (conn.data[0] ?? 0)}
        height={h - conn.y}
        className="dp-conn"
        strokeWidth={1}
      />
      <rect
        x={conn.power[0]}
        y={conn.y}
        width={(conn.power[1] ?? 0) - (conn.power[0] ?? 0)}
        height={h - conn.y}
        className="dp-conn"
        strokeWidth={1}
      />
      {large ? (
        <path
          d={
            pins(conn.data[0] ?? 0, conn.data[1] ?? 0) +
            pins(conn.power[0] ?? 0, conn.power[1] ?? 0)
          }
          className="dp-pin"
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

function NvmeStick({ size }: { size: DriveSize }) {
  const { w, h } = DRIVE_BOX[size].nvme;
  const sw = STROKE[size] * (size === "marker" ? 0.95 : 0.85);
  if (size === "marker") {
    return (
      <>
        <path
          d={stickPath(w, h, sw, { y: 1.1, h: 1.2, depth: 2 }, 1.3)}
          className="dp-body"
          strokeWidth={sw}
        />
        <rect
          x={4}
          y={1.5}
          width={3.6}
          height={3}
          rx={0.4}
          className="dp-ink"
        />
        <rect
          x={8.6}
          y={1.5}
          width={3.4}
          height={3}
          rx={0.4}
          className="dp-chip"
        />
      </>
    );
  }
  const large = size === "large";
  const notch = large
    ? { y: 5, h: 2.2, depth: 6 }
    : { y: 3.3, h: 1.6, depth: 4.2 };
  const fingers = large ? 6.5 : 4.5;
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
        d={stickPath(w, h, sw, notch, large ? 3.6 : 2.4)}
        className="dp-body"
        strokeWidth={sw}
      />
      <path
        d={lines.join("")}
        className="dp-pin"
        strokeWidth={large ? 1 : 0.9}
      />
      <path
        d={`M${String(fingers + 0.75)} ${String(sw)}V${String(h - sw)}`}
        className="dp-pin"
        strokeWidth={0.75}
      />
      {large ? (
        <>
          <rect x={13} y={5} width={14} height={14} rx={1} className="dp-ink" />
          <rect
            x={30}
            y={5}
            width={8}
            height={7}
            rx={0.6}
            className="dp-chip"
          />
          <rect x={30} y={14} width={3.2} height={2.4} className="dp-faint" />
          <rect x={34.8} y={14} width={3.2} height={2.4} className="dp-faint" />
          <rect
            x={41}
            y={4}
            width={16}
            height={16}
            rx={0.9}
            className="dp-chip"
          />
          <rect
            x={60}
            y={4}
            width={16}
            height={16}
            rx={0.9}
            className="dp-chip"
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
            className="dp-ink"
          />
          <rect
            x={21.5}
            y={2.5}
            width={12}
            height={11}
            rx={0.8}
            className="dp-chip"
          />
          <rect
            x={35.5}
            y={2.5}
            width={12}
            height={11}
            rx={0.8}
            className="dp-chip"
          />
        </>
      )}
    </>
  );
}

function Drawing({ kind, size }: { kind: DriveKind; size: DriveSize }) {
  if (kind === "ssd") {
    return <Ssd size={size} />;
  }
  if (kind === "nvme") {
    return <NvmeStick size={size} />;
  }
  return <HardDisk size={size} />;
}

/** A drive's picture on its own, at its size. Decorative: the kind is said in text beside it. */
export function DrivePicture({
  kind,
  size,
  className,
}: {
  kind: DriveKind;
  size: DriveSize;
  className?: string;
}) {
  const { w, h } = DRIVE_BOX[size][kind];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className === undefined ? "ch-dp" : `ch-dp ${className}`}
      data-kind={kind}
      data-size={size}
      width={w}
      height={h}
      viewBox={`0 0 ${String(w)} ${String(h)}`}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <Drawing kind={kind} size={size} />
    </svg>
  );
}

/**
 * A drive's marker inside a chart's own SVG, centred on the chart's origin and drawn at `k` times its
 * size (1 unless the chart's degrees are closer than a marker is wide).
 */
export function DriveMarker({ kind, k }: { kind: DriveKind; k: number }) {
  const { w, h } = MARKER_BOX[kind];
  return (
    <svg
      className="ch-dp"
      data-kind={kind}
      data-size="marker"
      x={(-w * k) / 2}
      y={(-h * k) / 2}
      width={w * k}
      height={h * k}
      viewBox={`0 0 ${String(w)} ${String(h)}`}
      overflow="visible"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <Drawing kind={kind} size="marker" />
    </svg>
  );
}
