// SPDX-License-Identifier: GPL-3.0-or-later
// The drawings of the custom icon set (rethink 5.2 to 5.4), as JSX on a 24 by 24 grid with a 2px
// padding. Outlines inherit the root's `currentColor` stroke; the one inner plane of each icon is
// marked `data-part="plane"` and filled with the art-plane token by the stylesheet (css-ui-style
// src/icons.css), never by an attribute. A part that moves in an action's motion (rethink 7.7)
// carries its own `data-part` name, which the stylesheet animates. No SVG string is ever parsed
// (UI-2), nothing is fetched (UI-7), and no style attribute is written (UI-1).
import type * as React from "react";

/** What an icon pictures: a thing on the NAS, or something done to one. */
type IconKind = "object" | "action";

interface IconDrawing {
  kind: IconKind;
  /** The drawing at rest, planes first so the outline sits over them. */
  draw: () => React.ReactNode;
}

// A rounded folder whose tab is on the leading top edge, as a path from its box.
function folderPath(x: number, y: number, w: number, h: number): string {
  const r = 1.5;
  return (
    `M${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}` +
    `H${x + 3.4}L${x + 4.9} ${y + 1.6}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + 1.6 + r}` +
    `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}Z`
  );
}

// The front of that folder below its tab: the folder's plane.
function folderFrontPath(x: number, y: number, w: number, h: number): string {
  const r = 1.5;
  const top = y + 3.6;
  return (
    `M${x} ${top}H${x + w}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}Z`
  );
}

// A circle as a path, so a ring can be cut from it with the even-odd rule.
function circlePath(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

const FOLDER = folderPath(2.5, 4.5, 19, 15);
const SHARED_FOLDER = folderPath(2.5, 4.5, 14.5, 15);
const SHARED_FOLDER_FRONT = folderFrontPath(2.5, 4.5, 14.5, 15);

/** A small solid dot: a spindle, a light, a power point. */
function dot(cx: number, cy: number, r = 1) {
  return <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
}

/** The plain body of a 3.5-inch disk, shared by the disk-based actions. */
function diskBody() {
  return <rect x={4.5} y={2.5} width={15} height={19} rx={3} />;
}

/** The bar the apply and undo actions point into: the pending band's shape, never its gold. */
function bar() {
  return (
    <>
      <rect data-part="plane" x={3} y={16} width={18} height={4.5} rx={2.25} />
      <rect x={3} y={16} width={18} height={4.5} rx={2.25} />
    </>
  );
}

const OBJECTS = {
  "disk-hdd": {
    kind: "object",
    draw: () => (
      <>
        <circle data-part="plane" cx={12} cy={10} r={5} />
        {diskBody()}
        <circle cx={12} cy={10} r={5} />
        {dot(12, 10)}
        <path d="M15.5 18.5 12.9 12.4M7.5 18.5h3" />
      </>
    ),
  },
  "disk-ssd": {
    kind: "object",
    draw: () => (
      <>
        <rect data-part="plane" x={6.5} y={8} width={6} height={8} rx={1.5} />
        <rect x={3} y={4.5} width={18} height={15} rx={3} />
        <rect x={6.5} y={8} width={6} height={8} rx={1.5} />
        <path d="M15.5 9h2M15.5 12h2M15.5 15h2" />
      </>
    ),
  },
  "disk-nvme": {
    kind: "object",
    draw: () => (
      <>
        <rect data-part="plane" x={7} y={10} width={4} height={4} rx={0.75} />
        <rect
          data-part="plane"
          x={12.5}
          y={10}
          width={4}
          height={4}
          rx={0.75}
        />
        <path d="M4 8h16a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 20 16H4a1.5 1.5 0 0 1-1.5-1.5v-1.25H4v-2.5H2.5V9.5A1.5 1.5 0 0 1 4 8Z" />
        <rect x={7} y={10} width={4} height={4} rx={0.75} />
        <rect x={12.5} y={10} width={4} height={4} rx={0.75} />
      </>
    ),
  },
  "disk-usb": {
    kind: "object",
    draw: () => (
      <>
        <rect data-part="plane" x={11.5} y={9} width={7} height={6} rx={1.5} />
        <rect x={8.5} y={6} width={13} height={12} rx={3} />
        <rect x={11.5} y={9} width={7} height={6} rx={1.5} />
        <path d="M8.5 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h4.5M5 11h1.5M5 13h1.5" />
      </>
    ),
  },
  "disk-optical": {
    kind: "object",
    draw: () => (
      <>
        <path
          data-part="plane"
          fillRule="evenodd"
          d={`${circlePath(12, 9.75, 7.25)}${circlePath(12, 9.75, 2.25)}`}
        />
        <circle cx={12} cy={9.75} r={7.25} />
        <circle cx={12} cy={9.75} r={2.25} />
        <path d="M3 15.5v4.5A1.5 1.5 0 0 0 4.5 21.5h15A1.5 1.5 0 0 0 21 20v-4.5" />
      </>
    ),
  },
  // What the disk is is not known: a plain body that claims no kind (never guess, 5.3).
  disk: {
    kind: "object",
    draw: () => (
      <>
        <rect data-part="plane" x={7.5} y={5.5} width={9} height={9} rx={2} />
        {diskBody()}
        <path d="M9.5 18.5h5" />
      </>
    ),
  },
  "file-system": {
    kind: "object",
    draw: () => (
      <>
        <path
          data-part="plane"
          d="M2.5 11.5h19V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18Z"
        />
        <path d={FOLDER} />
        <path d="M2.5 11.5h19M6 15.5h5" />
        {dot(17.5, 15.5)}
      </>
    ),
  },
  "raid-array": {
    kind: "object",
    draw: () => (
      <>
        <rect data-part="plane" x={3} y={3} width={5} height={13} rx={1.5} />
        <rect data-part="plane" x={9.5} y={3} width={5} height={13} rx={1.5} />
        <rect data-part="plane" x={16} y={3} width={5} height={13} rx={1.5} />
        <rect x={3} y={3} width={5} height={13} rx={1.5} />
        <rect x={9.5} y={3} width={5} height={13} rx={1.5} />
        <rect x={16} y={3} width={5} height={13} rx={1.5} />
        <path d="M3 19v1.5h18V19M12 20.5V22" />
      </>
    ),
  },
  "zfs-pool": {
    kind: "object",
    draw: () => (
      <>
        <path
          data-part="plane"
          d="M2.5 13.5h19V17a4.5 4.5 0 0 1-4.5 4.5H7A4.5 4.5 0 0 1 2.5 17Z"
        />
        <path d="M2.5 11v6A4.5 4.5 0 0 0 7 21.5h10a4.5 4.5 0 0 0 4.5-4.5v-6" />
        <rect x={5.5} y={3} width={5.75} height={14} rx={1.5} />
        <rect x={12.75} y={3} width={5.75} height={14} rx={1.5} />
        {dot(8.4, 6.25, 0.85)}
        {dot(15.65, 6.25, 0.85)}
      </>
    ),
  },
  // The most used icon of the set: a folder with a ribbon out of it, which is what makes it shared.
  "shared-folder": {
    kind: "object",
    draw: () => (
      <>
        <path data-part="plane" d={SHARED_FOLDER_FRONT} />
        <path d={SHARED_FOLDER} />
        <path data-part="ribbon" d="M17 11.5h5l-1.75 2.25L22 16h-5" />
      </>
    ),
  },
  person: {
    kind: "object",
    draw: () => (
      <>
        <path
          data-part="plane"
          d="M4.5 21v-1a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v1Z"
        />
        <circle cx={12} cy={7.5} r={4} />
        <path d="M4.5 21v-1a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v1" />
      </>
    ),
  },
  group: {
    kind: "object",
    draw: () => (
      <>
        <path
          data-part="plane"
          d="M2.5 21v-.5A5.5 5.5 0 0 1 8 15h2a5.5 5.5 0 0 1 5.5 5.5v.5Z"
        />
        <circle cx={16.5} cy={7} r={3} />
        <path d="M17.5 12.5h.5a4 4 0 0 1 4 4v1" />
        <circle cx={9} cy={9} r={3.5} />
        <path d="M2.5 21v-.5A5.5 5.5 0 0 1 8 15h2a5.5 5.5 0 0 1 5.5 5.5v.5" />
      </>
    ),
  },
  // Windows and Mac sharing (SMB): a desktop screen and a laptop. No vendor logos (UI-7).
  "service-smb": {
    kind: "object",
    draw: () => (
      <>
        <rect data-part="plane" x={2.5} y={5} width={11} height={8} rx={1.5} />
        <rect data-part="plane" x={15} y={11.5} width={6.5} height={5} rx={1} />
        <rect x={2.5} y={5} width={11} height={8} rx={1.5} />
        <path d="M8 13v3.5M5.5 17h5" />
        <rect x={15} y={11.5} width={6.5} height={5} rx={1} />
        <path d="M14 19.5h8.5" />
      </>
    ),
  },
  // Linux and Unix sharing (NFS): a tower computer and a media box.
  "service-nfs": {
    kind: "object",
    draw: () => (
      <>
        <rect data-part="plane" x={13.5} y={11} width={8} height={8} rx={1.5} />
        <rect x={2.5} y={3} width={8} height={18} rx={2} />
        <path d="M5 6.5h3M5 9h3" />
        {dot(6.5, 17.5)}
        <rect x={13.5} y={11} width={8} height={8} rx={1.5} />
        <path d="M16.5 13.5v3l2.5-1.5Z" />
      </>
    ),
  },
  "service-rsync": {
    kind: "object",
    draw: () => (
      <>
        <path data-part="plane" d={folderFrontPath(13, 12.5, 8.5, 7.5)} />
        <path d={folderPath(2.5, 12.5, 8.5, 7.5)} />
        <path d={folderPath(13, 12.5, 8.5, 7.5)} />
        <path d="M6.75 10.5C6.75 5 17.25 5 17.25 10.5M4.75 8.5l2 2 2-2M15.25 8.5l2 2 2-2" />
      </>
    ),
  },
  "service-ssh": {
    kind: "object",
    draw: () => (
      <>
        <path
          data-part="plane"
          d="M2.5 8V6.5A2.5 2.5 0 0 1 5 4h14a2.5 2.5 0 0 1 2.5 2.5V8Z"
        />
        <rect x={2.5} y={4} width={19} height={15.5} rx={2.5} />
        <path d="M2.5 8h19M6 11.5l2.5 2-2.5 2" />
        <circle cx={14} cy={14.5} r={2} />
        <path d="M16 14.5h3.5M18.5 14.5v1.75" />
      </>
    ),
  },
  "net-ethernet": {
    kind: "object",
    draw: () => (
      <>
        <path data-part="plane" d="M7 8.5h10v7h-2.5v2h-5v-2H7Z" />
        <rect x={3} y={4} width={18} height={16} rx={3} />
        <path d="M7 8.5h10v7h-2.5v2h-5v-2H7ZM10 8.5v2.5M12 8.5v2.5M14 8.5v2.5" />
      </>
    ),
  },
  "net-wifi": {
    kind: "object",
    draw: () => (
      <>
        <path data-part="plane" d="M12 18.5 2.81 9.31a13 13 0 0 1 18.38 0Z" />
        <path d="M8.46 14.96a5 5 0 0 1 7.08 0M5.64 12.14a9 9 0 0 1 12.72 0M2.81 9.31a13 13 0 0 1 18.38 0" />
        {dot(12, 18.5, 1.25)}
      </>
    ),
  },
  "net-bond": {
    kind: "object",
    draw: () => (
      <>
        <rect data-part="plane" x={17} y={10} width={4.5} height={4} rx={1} />
        <rect x={2.5} y={5.5} width={3.5} height={3} rx={0.75} />
        <rect x={2.5} y={15.5} width={3.5} height={3} rx={0.75} />
        <path d="M6 7h1.5c3.5 0 3.5 5 7 5H17M6 17h1.5c3.5 0 3.5-5 7-5" />
        <rect x={17} y={10} width={4.5} height={4} rx={1} />
      </>
    ),
  },
  "net-vlan": {
    kind: "object",
    draw: () => (
      <>
        <path
          data-part="plane"
          d="M9 12h6v7.5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1Z"
        />
        <path d="M2.5 9h15" />
        <rect x={17.5} y={7} width={4} height={4} rx={1} />
        <path d="M12 9v3M9 12h6v7.5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1ZM10.75 17.5h2.5" />
        <circle cx={12} cy={14.5} r={0.9} />
      </>
    ),
  },
  "net-bridge": {
    kind: "object",
    draw: () => (
      <>
        <rect
          data-part="plane"
          x={2.5}
          y={13.5}
          width={6}
          height={7}
          rx={1.5}
        />
        <rect
          data-part="plane"
          x={15.5}
          y={13.5}
          width={6}
          height={7}
          rx={1.5}
        />
        <rect x={2.5} y={13.5} width={6} height={7} rx={1.5} />
        <rect x={15.5} y={13.5} width={6} height={7} rx={1.5} />
        <path d="M4.5 16.5h2v1.5h-2ZM17.5 16.5h2v1.5h-2Z" />
        <path d="M2.5 7h19M5.5 13.5V7M18.5 13.5V7M8.5 13.5a3.5 3.5 0 0 1 7 0" />
      </>
    ),
  },
  // A copy job: one folder to another, the way CopyDirection reads.
  "copy-job": {
    kind: "object",
    draw: () => (
      <>
        <path data-part="plane" d={folderFrontPath(10.5, 12.5, 11, 8.5)} />
        <path d={folderPath(2.5, 3, 11, 8.5)} />
        <path d={folderPath(10.5, 12.5, 11, 8.5)} />
        <path
          data-part="dash"
          d="M5.5 13.5v1.75a2 2 0 0 0 2 2H9M7.5 15.5l1.75 1.75L7.5 19"
        />
      </>
    ),
  },
  // A plugin, an add-on: a piece that fits into the rest.
  plugin: {
    kind: "object",
    draw: () => (
      <g transform="translate(0.75 -0.5)">
        <path
          data-part="plane"
          d="M4 9a1.5 1.5 0 0 1 1.5-1.5h3a2.5 2.5 0 0 1 5 0h2A1.5 1.5 0 0 1 17 9v3a2.5 2.5 0 0 1 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 19Z"
        />
        <path d="M4 9a1.5 1.5 0 0 1 1.5-1.5h3a2.5 2.5 0 0 1 5 0h2A1.5 1.5 0 0 1 17 9v3a2.5 2.5 0 0 1 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 19Z" />
      </g>
    ),
  },
  // The NAS itself: the product's own picture, and the map's anchor on the dashboard.
  nas: {
    kind: "object",
    draw: () => (
      <>
        <rect data-part="plane" x={6} y={6} width={12} height={3.5} rx={1} />
        <rect data-part="plane" x={6} y={11} width={12} height={3.5} rx={1} />
        <rect x={3} y={3} width={18} height={18} rx={3} />
        <rect x={6} y={6} width={12} height={3.5} rx={1} />
        <rect x={6} y={11} width={12} height={3.5} rx={1} />
        {dot(7.25, 17.75, 0.9)}
        {dot(10, 17.75, 0.9)}
        <circle cx={16.5} cy={17.75} r={1.25} />
      </>
    ),
  },
} satisfies Record<string, IconDrawing>;

// Actions: each is its object with an action mark (5.4), so the icon says both what and to what.
// The part that acts out the action (7.7) is named; its motion lives in the stylesheet.
const ACTIONS = {
  // Something new: an empty dashed body (the "new" treatment, dashed until it has a name) and a plus,
  // which turns on hover and becomes a check when the thing is made.
  create: {
    kind: "action",
    draw: () => (
      <>
        <rect
          x={3.5}
          y={3.5}
          width={17}
          height={17}
          rx={3}
          strokeDasharray="3 2.5"
        />
        <path data-part="mark" d="M12 8.25v7.5M8.25 12h7.5" />
        <path data-part="done" pathLength={1} d="M8.25 12.25l2.5 2.5 5-5.25" />
      </>
    ),
  },
  share: {
    kind: "action",
    draw: () => (
      <>
        <path data-part="plane" d={SHARED_FOLDER_FRONT} />
        <path d={SHARED_FOLDER} />
        <path data-part="ribbon" d="M17 11.5h3l2 2.25-2 2.25h-3" />
      </>
    ),
  },
  mount: {
    kind: "action",
    draw: () => (
      <>
        <path
          data-part="plane"
          d="M4 15h16v4.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z"
        />
        <rect x={7.5} y={2.5} width={9} height={6.5} rx={1.5} />
        {dot(14, 5.75, 0.85)}
        <path d="M4 15v4.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V15" />
        <path data-part="arrow" d="M12 10.5V17M9.5 14.5 12 17l2.5-2.5" />
        <path data-part="lid" pathLength={1} d="M4 15h16" />
      </>
    ),
  },
  unmount: {
    kind: "action",
    draw: () => (
      <>
        <path
          data-part="plane"
          d="M4 15h16v4.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z"
        />
        <rect x={7.5} y={2.5} width={9} height={6.5} rx={1.5} />
        {dot(14, 5.75, 0.85)}
        <path d="M4 15v4.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V15" />
        <path data-part="arrow" d="M12 17.5V11M9.5 13.5 12 11l2.5 2.5" />
      </>
    ),
  },
  mirror: {
    kind: "action",
    draw: () => (
      <>
        <rect data-part="plane" x={2.5} y={4} width={6} height={16} rx={1.75} />
        <rect
          data-part="plane"
          x={15.5}
          y={4}
          width={6}
          height={16}
          rx={1.75}
        />
        <rect x={2.5} y={4} width={6} height={16} rx={1.75} />
        <rect x={15.5} y={4} width={6} height={16} rx={1.75} />
        <path d="M4.5 16.5h2M17.5 16.5h2" />
        {dot(5.5, 7.5, 0.85)}
        {dot(18.5, 7.5, 0.85)}
        <path data-part="equals-top" d="M10.5 10.5h3" />
        <path data-part="equals-bottom" d="M10.5 13.5h3" />
      </>
    ),
  },
  // Wipe: nothing on hover (no playfulness on a destructive entry, 7.7); the sweep draws across
  // when the confirm button arms.
  wipe: {
    kind: "action",
    draw: () => (
      <>
        <rect data-part="plane" x={7} y={5} width={10} height={12} rx={2} />
        {diskBody()}
        <path data-part="sweep-1" pathLength={1} d="M7.75 11.25l3.5-3.5" />
        <path data-part="sweep-2" pathLength={1} d="M7.75 15.25l7.5-7.5" />
        <path data-part="sweep-3" pathLength={1} d="M11.75 15.25l3.5-3.5" />
        <path d="M9.5 18.5h5" />
      </>
    ),
  },
  // Apply: a check into the bar. The bar is the pending band's shape; the icon is ink, never gold.
  apply: {
    kind: "action",
    draw: () => (
      <>
        {bar()}
        <path data-part="check" d="M7.5 8.5l3 3 6-6.25" />
      </>
    ),
  },
  undo: {
    kind: "action",
    draw: () => (
      <>
        {bar()}
        <path
          data-part="arrow"
          d="M17 13v-2.5a4.5 4.5 0 0 0-9 0V13M5.75 10.75 8 13l2.25-2.25"
        />
      </>
    ),
  },
  "check-health": {
    kind: "action",
    draw: () => (
      <>
        <rect data-part="plane" x={2.5} y={5} width={19} height={14} rx={3} />
        <rect x={2.5} y={5} width={19} height={14} rx={3} />
        <path
          data-part="pulse"
          pathLength={1}
          d="M5.5 12h3l1.5-3.5 2.5 7 1.5-3.5h4.5"
        />
      </>
    ),
  },
  sleep: {
    kind: "action",
    draw: () => (
      <>
        <circle data-part="plane" cx={8.5} cy={12.5} r={3} />
        <rect x={3} y={5} width={11} height={16} rx={2.5} />
        <circle cx={8.5} cy={12.5} r={3} />
        <path
          data-part="moon"
          d="M21 8.25A4.25 4.25 0 1 1 16.25 3a3.25 3.25 0 0 0 4.75 5.25Z"
        />
      </>
    ),
  },
  wake: {
    kind: "action",
    draw: () => (
      <>
        <circle data-part="plane" cx={8.5} cy={12.5} r={3} />
        <rect x={3} y={5} width={11} height={16} rx={2.5} />
        <circle cx={8.5} cy={12.5} r={3} />
        <circle cx={17.5} cy={7} r={2} />
        <path
          data-part="rays"
          d="M17.5 3.75v-1M20.75 7h1M17.5 10.25v1M19.8 4.7l.7-.7M19.8 9.3l.7.7M15.2 4.7l-.7-.7"
        />
      </>
    ),
  },
  restart: {
    kind: "action",
    draw: () => (
      <>
        <circle data-part="plane" cx={12} cy={12.5} r={4.5} />
        <g data-part="loop">
          <path d="M19.5 12.5a7.5 7.5 0 1 1-2.2-5.3" />
          <path d="M17.3 2.95V7.2h-4.25" />
        </g>
        {dot(12, 12.5, 1.5)}
      </>
    ),
  },
} satisfies Record<string, IconDrawing>;

/** A thing on the NAS (5.3). */
type ObjectIconName = keyof typeof OBJECTS;
/** Something done to one (5.4), with the motion of 7.7 where it has one. */
type ActionIconName = keyof typeof ACTIONS;
type IconName = ObjectIconName | ActionIconName;

const ICONS: Record<IconName, IconDrawing> = { ...OBJECTS, ...ACTIONS };

/** Every name, objects first, in the order of the inventory: for the icon sheet and for tests. */
const OBJECT_ICON_NAMES = Object.keys(OBJECTS) as ObjectIconName[];
const ACTION_ICON_NAMES = Object.keys(ACTIONS) as ActionIconName[];

export { ACTION_ICON_NAMES, ICONS, OBJECT_ICON_NAMES };
export type { ActionIconName, IconDrawing, IconKind, IconName, ObjectIconName };
