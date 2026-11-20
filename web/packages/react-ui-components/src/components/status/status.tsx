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

// A 14% wash of the fill, a 1px stroke edge, the word in the -label member (5.5). Running is neutral.
const pillVariants = cva(
  "inline-flex h-5.5 max-w-full items-center gap-1 rounded-full border ps-1.5 pe-2 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        ok: "border-ok-stroke bg-ok/14 text-ok-label",
        warning: "border-warning-stroke bg-warning/14 text-warning-label",
        critical: "border-critical-stroke bg-critical/14 text-critical-label",
        unknown: "border-unknown-stroke bg-unknown/14 text-unknown-label",
        pending: "border-pending-stroke bg-pending/14 text-pending-label",
        neutral: "border-input bg-muted text-foreground",
      },
    },
  },
);

interface StatusPillProps extends React.ComponentProps<"span"> {
  status: Status;
  /** The word: OK, Warning, Critical, Unknown, Disabled, Stopped, Waiting, ... from the catalogue. */
  children: React.ReactNode;
}

/** The one status pill (style guide 5.5): icon and word, on every surface. */
function StatusPill({
  status,
  className,
  children,
  ...props
}: StatusPillProps) {
  const { tone } = STATUS_DRAWING[status];
  return (
    <span
      data-slot="status-pill"
      data-status={status}
      className={cn(pillVariants({ tone }), className)}
      {...props}
    >
      <StatusIcon status={status} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Pending and running have no dot: pending is a banner or a labelled pill (3.4), running a pill. */
type DotStatus = RollUpStatus;

// An 8-10px disc of the fill with a stroke ring. The Unknown family is a hollow ring (5.5, 3.4).
const dotVariants = cva(
  "inline-block size-2.5 shrink-0 rounded-full border-[1.5px]",
  {
    variants: {
      tone: {
        ok: "border-ok-stroke bg-ok",
        warning: "border-warning-stroke bg-warning",
        critical: "border-critical-stroke bg-critical",
        unknown: "border-unknown-stroke bg-transparent",
        pending: "",
        neutral: "",
      },
    },
  },
);

interface StatusDotProps {
  status: DotStatus;
  /** The word. Read by assistive technology, and shown as a tooltip unless `showLabel`. */
  label: string;
  /** Show the word beside the dot instead of only in its name. */
  showLabel?: boolean;
  className?: string;
}

/** Where a pill does not fit (a compact tile): a dot, always with its word in reach. */
function StatusDot({
  status,
  label,
  showLabel = false,
  className,
}: StatusDotProps) {
  const { tone } = STATUS_DRAWING[status];
  const dot = (
    <span
      data-slot="status-dot"
      data-status={status}
      className={cn(dotVariants({ tone }), !showLabel && className)}
    />
  );
  if (showLabel) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <span aria-hidden="true" className="inline-flex">
          {dot}
        </span>
        <span>{label}</span>
      </span>
    );
  }
  return (
    <Tooltip content={label}>
      <span
        role="img"
        aria-label={label}
        tabIndex={0}
        className="inline-flex rounded-full p-1"
      >
        {dot}
      </span>
    </Tooltip>
  );
}

export { StatusDot, StatusIcon, StatusPill };
export type { DotStatus, StatusDotProps, StatusPillProps };
