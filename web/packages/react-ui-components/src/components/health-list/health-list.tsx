// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";
import { Skeleton } from "../skeleton/skeleton";
import { StatusPill } from "../status/status";
import type { Status } from "../status/status-kinds";

/**
 * A short list of monitored things inside a card (disks, services, file systems), one item each with
 * its status pill, its name, a detail line and, for anything not fine, the reason in words beside the
 * pill (style guide 5.5: the status always stays beside its reason, never in a tooltip). Rows are not
 * focusable: there is nothing to open.
 */
function HealthList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="health-list"
      className={cn("flex flex-col divide-y divide-border", className)}
      {...props}
    />
  );
}

interface HealthListItemProps extends Omit<
  React.ComponentProps<"li">,
  "children"
> {
  /** The item's state. Omit it for an item that carries no claim (nothing is monitored). */
  status?: Status;
  /** The pill's word from the catalogue: OK, Warning, Critical, Unknown, Not applied yet. */
  statusLabel?: React.ReactNode;
  /** What the item is: a service's title, a disk's device. */
  name: React.ReactNode;
  /** `identifier` sets the name in the mono face and lets it break anywhere (a device path). */
  nameVariant?: "text" | "identifier";
  /** A second fact after the name, quieter: "VMware Virtual NVMe Disk, 20.0 GiB · 30 °C". */
  detail?: React.ReactNode;
  /** Why the state is what it is, as a sentence: "On, but not running." Shown for anything but OK. */
  reason?: React.ReactNode;
  /** A quiet remark that is advice, not a state: "Monitoring off". */
  note?: React.ReactNode;
}

/** One monitored thing. Its text reads in order: the pill's word, the name, the detail, the reason. */
function HealthListItem({
  status,
  statusLabel,
  name,
  nameVariant = "text",
  detail,
  reason,
  note,
  className,
  ...props
}: HealthListItemProps) {
  return (
    <li
      data-slot="health-list-item"
      data-status={status}
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0",
        className,
      )}
      {...props}
    >
      {status !== undefined && statusLabel !== undefined ? (
        <StatusPill status={status} className="mt-0.5 shrink-0">
          {statusLabel}
        </StatusPill>
      ) : null}
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span
            dir={nameVariant === "text" ? "auto" : undefined}
            className={cn(
              "min-w-0",
              nameVariant === "identifier"
                ? "font-mono text-sm [overflow-wrap:anywhere]"
                : "font-medium break-words",
            )}
          >
            {name}
          </span>
          {detail ? (
            <span className="min-w-0 text-sm text-muted-foreground tabular-nums break-words">
              {detail}
            </span>
          ) : null}
        </p>
        {reason ? (
          <p data-slot="health-list-reason" className="text-sm text-foreground">
            {reason}
          </p>
        ) : null}
        {note ? (
          <p
            data-slot="health-list-note"
            className="text-sm text-muted-foreground"
          >
            {note}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Placeholder rows of the real height while the first read is in flight. Hidden from assistive technology. */
function HealthListSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <ul
      data-slot="health-list-skeleton"
      aria-hidden="true"
      className={cn("flex flex-col divide-y divide-border", className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <li
          key={`skeleton-${String(i)}`}
          className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <Skeleton shape="block" className="h-5.5 w-16 rounded-full" />
          <Skeleton className={i % 2 === 0 ? "w-1/2" : "w-1/3"} />
        </li>
      ))}
    </ul>
  );
}

export { HealthList, HealthListItem, HealthListSkeleton };
export type { HealthListItemProps };
