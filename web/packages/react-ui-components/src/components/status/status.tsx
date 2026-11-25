// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import {
  Ban,
  CircleCheck,
  CircleDashed,
  History,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { Tooltip } from "../tooltip/tooltip";
import {
  STATUS_DRAWING,
  type RollUpStatus,
  type Status,
  type StatusIconName,
} from "./status-kinds";

const ICONS: Record<
  StatusIconName,
  React.ComponentType<{ className?: string }>
> = {
  check: CircleCheck,
  triangle: TriangleAlert,
  octagon: OctagonX,
  dashed: CircleDashed,
  slash: Ban,
  clock: History,
  spinner: LoaderCircle,
};

/** The status's own icon shape, decorative: the word beside it is what is read. */
function StatusIcon({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const name = STATUS_DRAWING[status].icon;
  const Icon = ICONS[name];
  return (
    <span aria-hidden="true" data-icon={name} className="inline-flex">
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          name === "spinner" && "motion-safe:animate-spin",
          className,
        )}
      />
    </span>
  );
}

// The status is its icon and its word in the family's -label ink (5.5): no capsule, no wash, no
// edge (style guide 10). Running is work, not health, so it is in the body ink.
const labelVariants = cva(
  "inline-flex max-w-full items-center gap-1 text-sm font-medium",
  {
    variants: {
      tone: {
        ok: "text-ok-label",
        warning: "text-warning-label",
        critical: "text-critical-label",
        unknown: "text-unknown-label",
        pending: "text-pending-label",
        neutral: "text-foreground",
      },
    },
  },
);

interface StatusLabelProps extends React.ComponentProps<"span"> {
  status: Status;
  /** The word: OK, Warning, Critical, Unknown, Disabled, Stopped, Waiting, ... from the catalogue. */
  children: React.ReactNode;
}

/**
 * A status (style guide 5.5): its own icon shape and its word, both in the family's label ink, on
 * every surface. Never a pill: a capsule is kept for a removable filter token or a count badge
 * (style guide 10). Its `data-slot` is still `status-pill`, so queries written before the rename
 * keep their meaning.
 */
function StatusLabel({
  status,
  className,
  children,
  ...props
}: StatusLabelProps) {
  const { tone } = STATUS_DRAWING[status];
  return (
    <span
      data-slot="status-pill"
      data-status={status}
      className={cn(labelVariants({ tone }), className)}
      {...props}
    >
      <StatusIcon status={status} />
      <span className="[overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}

/**
 * @deprecated Use `StatusLabel`. The same component under its old name: a status is no longer drawn
 * as a pill (style guide 10), and the name stays only so existing callers compile.
 */
const StatusPill = StatusLabel;
/** @deprecated Use `StatusLabelProps`. */
type StatusPillProps = StatusLabelProps;

/** Pending and running have no mark of their own here: pending is the band or a label, running a label. */
type DotStatus = RollUpStatus;

interface StatusDotProps {
  status: DotStatus;
  /** The word. Read by assistive technology, and shown as a tooltip unless `showLabel`. */
  label: string;
  /** Show the word beside the mark instead of only in its name. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Where a label does not fit (a compact tile): the status's icon alone, in its label ink, with its
 * word in reach (beside it with `showLabel`, otherwise in hidden text and a tooltip). It was a
 * coloured disc; a disc reads as a "live dot" and says less than a shape (style guide 10), so it
 * draws the same icon as `StatusLabel`. A healthy thing usually needs no mark at all.
 */
function StatusDot({
  status,
  label,
  showLabel = false,
  className,
}: StatusDotProps) {
  const { tone } = STATUS_DRAWING[status];
  const mark = (
    <span
      data-slot="status-dot"
      data-status={status}
      aria-hidden="true"
      className={labelVariants({ tone })}
    >
      <StatusIcon status={status} />
    </span>
  );
  if (showLabel) {
    return (
      <span className={cn(labelVariants({ tone }), "gap-1.5", className)}>
        {mark}
        <span>{label}</span>
      </span>
    );
  }
  // Not a tab stop: the word is in hidden text for assistive technology, and the tooltip is a
  // convenience for pointers. A keyboard reader reaches the word with the surrounding content.
  return (
    <Tooltip content={label}>
      <span className={cn("inline-flex p-1", className)}>
        {mark}
        <span className="sr-only">{label}</span>
      </span>
    </Tooltip>
  );
}

export { StatusDot, StatusIcon, StatusLabel, StatusPill };
export type { DotStatus, StatusDotProps, StatusLabelProps, StatusPillProps };
