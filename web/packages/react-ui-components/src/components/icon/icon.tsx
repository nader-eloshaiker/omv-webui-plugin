// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import { ICONS, type IconName } from "./icon-drawings";

/** The sizes of the set (5.2): 16 inline and in compact rows, 20 in rows and menus, 24 in headings. */
type IconSize = 16 | 20 | 24;

/** A badge on an object (5.2): its status, or that it has a pending change. */
type IconBadgeStatus = "ok" | "warning" | "critical" | "unknown" | "pending";

/** An action mark on an object (5.4): `create` is the object with a plus, "Add a person". */
type IconMark = "create";

// The stroke is 1.75px on screen at every size (lucide's is 2 at 24, so the two read as "object"
// and "control"). It is set in the drawing's own units per size rather than with
// `vector-effect: non-scaling-stroke`, so a path drawn along its length (`pathLength`) still draws.
const STROKE_PX = 1.75;
const BADGE_STROKE_PX = 1.25;
// The badge and the mark sit at the bottom right, cut out of the drawing with a 1.5 unit gap.
const CUT = { cx: 19, cy: 19, badge: 4.5, mark: 5, gap: 1.5 } as const;

const iconClass = cva("inline-block shrink-0", {
  variants: {
    size: { 16: "size-4", 20: "size-5", 24: "size-6" },
  },
  defaultVariants: { size: 20 },
});

type IconCut =
  | {
      /** The status of the thing pictured, as a badge. Not shown for OK unless a state changes. */
      badge?: IconBadgeStatus;
      mark?: never;
    }
  | {
      /** An action mark on the object: `create` for "Add a shared folder". */
      mark?: IconMark;
      badge?: never;
    };

type IconProps = Omit<
  React.ComponentProps<"svg">,
  "children" | "width" | "height" | "viewBox"
> &
  IconCut & {
    name: IconName;
    size?: IconSize;
    /**
     * The icon's name, when it stands alone and must be read ("Shared folder"). Without one the
     * icon is decorative and hidden from assistive technology, which is right beside a word.
     */
    label?: string;
    /**
     * `done` plays the action's success motion once (7.7) when it is set, and keeps the done
     * drawing where the action has one (the plus of `create` becomes a check). Set it back to
     * `rest` before the next cause.
     */
    state?: "rest" | "done";
    /**
     * `auto`: an action icon acts out its action on the hover or keyboard focus of the button or
     * menu item it sits in. `none` keeps it still (a second icon in the same view, a list).
     */
    motion?: "auto" | "none";
  };

/** A safe id for a fragment reference, from React's id (which may hold colons or guillemets). */
function useFragmentId(prefix: string): string {
  return `${prefix}-${React.useId().replace(/[^\w-]/g, "")}`;
}

/**
 * One icon of the custom set (rethink 5.2 to 5.4): a domain object or an action on one, drawn in
 * code on a 24 grid. The outline is `currentColor` and one inner plane takes the art-plane tint
 * (css-ui-style src/icons.css), so it reads on every ground and on a primary button, where the ink
 * is the button's own. Interface glyphs (chevrons, copy, close) stay lucide.
 *
 * Decorative by default (`aria-hidden`); with `label` it is an image with that name. A badge or a
 * mark is cut out of the drawing at the bottom right, never laid over it.
 */
function Icon({
  name,
  size = 20,
  label,
  badge,
  mark,
  state = "rest",
  motion = "auto",
  strokeWidth,
  className,
  ...props
}: IconProps) {
  const cutId = useFragmentId("icon-cut");
  const drawing = ICONS[name];
  const scale = 24 / size;
  const body = drawing.draw();
  const cutRadius = (badge ? CUT.badge : CUT.mark) + CUT.gap;
  const named = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };
  return (
    <svg
      data-slot="icon"
      data-icon={name}
      data-kind={drawing.kind}
      data-state={state}
      data-motion={motion}
      data-mark={mark}
      data-badge={badge}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? STROKE_PX * scale}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...named}
      className={cn(iconClass({ size }), className)}
      {...props}
    >
      {badge || mark ? (
        <>
          <defs>
            {/* Everything but a disc round the badge: the gap that sets the badge apart. */}
            <clipPath id={cutId}>
              <path
                clipRule="evenodd"
                d={`M-1 -1H25V25H-1Z M${CUT.cx - cutRadius} ${CUT.cy}a${cutRadius} ${cutRadius} 0 1 0 ${2 * cutRadius} 0a${cutRadius} ${cutRadius} 0 1 0 ${-2 * cutRadius} 0Z`}
              />
            </clipPath>
          </defs>
          <g clipPath={`url(#${cutId})`}>{body}</g>
          {badge ? (
            <IconBadge status={badge} strokeWidth={BADGE_STROKE_PX * scale} />
          ) : (
            <CreateMark />
          )}
        </>
      ) : (
        body
      )}
    </svg>
  );
}

/** The plus of an object's create mark, and the check it becomes when the thing is made. */
function CreateMark() {
  return (
    <g data-slot="icon-mark">
      <path data-part="mark" d="M19 15.75v6.5M15.75 19h6.5" />
      <path data-part="done" pathLength={1} d="M16 19.25l2 2 3.5-3.75" />
    </g>
  );
}

// Each status in its own shape (style guide 5.5), the fill ringed in its stroke like the status dot;
// Unknown is a hollow ring. Words travel elsewhere in the row (5.2).
const badgeShapeClass = cva("", {
  variants: {
    status: {
      ok: "fill-ok stroke-ok-stroke",
      warning: "fill-warning stroke-warning-stroke",
      critical: "fill-critical stroke-critical-stroke",
      unknown: "fill-none stroke-unknown-stroke",
      pending: "fill-pending stroke-pending-stroke",
    },
  },
});

/** The points of a regular polygon round a centre, the first at `start` degrees. */
function polygon(
  cx: number,
  cy: number,
  r: number,
  sides: number,
  start: number,
): string {
  return Array.from({ length: sides }, (_, i) => {
    const a = ((start + (360 / sides) * i) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

type IconBadgeProps = Omit<React.ComponentProps<"g">, "children"> & {
  status: IconBadgeStatus;
  /** The centre and radius in the drawing's units: the bottom right of a 24 grid by default. */
  cx?: number;
  cy?: number;
  r?: number;
};

/**
 * A status or pending badge for a drawing (5.2): an SVG group, so it also sits on the drive bay or a
 * map node. Inside `Icon`, use its `badge` prop, which also cuts the gap. When the status changes
 * after the first render the new shape crossfades in from 0.9 (7.7); it is drawn still at first.
 */
function IconBadge({
  status,
  cx = CUT.cx,
  cy = CUT.cy,
  r = CUT.badge,
  className,
  ...props
}: IconBadgeProps) {
  // Whether the status has changed since the first render, kept in state during render (no effect):
  // a badge that is there from the start is not news, so it does not move.
  const [initial] = React.useState(status);
  const [changed, setChanged] = React.useState(false);
  if (!changed && status !== initial) {
    setChanged(true);
  }
  const shape = badgeShapeClass({ status });
  return (
    <g
      key={status}
      data-slot="icon-badge"
      data-status={status}
      data-changed={changed || status !== initial ? "" : undefined}
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {status === "warning" ? (
        <polygon
          className={shape}
          points={`${cx},${cy - r} ${cx + r * 1.08},${cy + r * 0.82} ${cx - r * 1.08},${cy + r * 0.82}`}
        />
      ) : status === "critical" ? (
        <polygon className={shape} points={polygon(cx, cy, r, 8, 22.5)} />
      ) : (
        <circle className={shape} cx={cx} cy={cy} r={r * 0.92} />
      )}
      {status === "ok" ? (
        <path
          className="fill-none stroke-ok-foreground"
          d={`M${cx - r * 0.45} ${cy + r * 0.02}l${r * 0.3} ${r * 0.3} ${r * 0.6}-${r * 0.62}`}
        />
      ) : null}
      {status === "pending" ? (
        <path
          className="fill-none stroke-pending-foreground"
          d={`M${cx} ${cy - r * 0.5}V${cy}l${r * 0.38} ${r * 0.3}`}
        />
      ) : null}
    </g>
  );
}

type IconPlateProps = Omit<React.ComponentProps<"span">, "children"> &
  IconCut & {
    name: IconName;
    /** As on `Icon`: the name when the plate stands alone; decorative beside a title. */
    label?: string;
  };

/**
 * The 32px plate (5.2): the icon at 20 on a squircle of the inset ground, for page and form titles
 * ("Add a shared folder") and choice cards. The icon keeps the plate's ink (`text-foreground`).
 */
function IconPlate({
  name,
  label,
  badge,
  mark,
  className,
  ...props
}: IconPlateProps) {
  const cut = badge ? { badge } : { mark };
  return (
    <span
      data-slot="icon-plate"
      className={cn(
        "inline-grid size-8 shrink-0 place-items-center rounded-control bg-muted text-foreground ring-1 ring-border ring-inset",
        className,
      )}
      {...props}
    >
      <Icon name={name} size={20} label={label} motion="none" {...cut} />
    </span>
  );
}

export { ACTION_ICON_NAMES, OBJECT_ICON_NAMES } from "./icon-drawings";
export type { ActionIconName, IconName, ObjectIconName } from "./icon-drawings";
export { Icon, IconBadge, IconPlate };
export type { IconBadgeStatus, IconMark, IconPlateProps, IconProps, IconSize };
