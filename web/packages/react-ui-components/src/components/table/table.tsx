// SPDX-License-Identifier: GPL-3.0-or-later
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

interface TableProps extends React.ComponentProps<"table"> {
  /** Loading: set while skeleton rows stand in for data, so assistive technology hears it is busy. */
  busy?: boolean;
  /** Announced while `busy`, since the skeleton rows are hidden from assistive technology: "Loading disks…". */
  busyLabel?: string;
  /** Classes for the scrolling frame around the table. */
  frameClassName?: string;
  /**
   * Names the scrolling frame and makes it a focusable region, so a keyboard can scroll a wide table
   * sideways inside it: "Entries of All system messages (syslog)". Use it where columns can outgrow a
   * narrow screen.
   */
  frameLabel?: string;
}

/**
 * A data table (style guide 5.2) in its own horizontal scroll region, so a wide table never makes the
 * page scroll sideways (6, reflow). Name it with `aria-label` or a `<caption>`.
 */
function Table({
  busy,
  busyLabel,
  frameClassName,
  frameLabel,
  className,
  ...props
}: TableProps) {
  return (
    <div
      data-slot="table-frame"
      role={frameLabel === undefined ? undefined : "region"}
      aria-label={frameLabel}
      tabIndex={frameLabel === undefined ? undefined : 0}
      className={cn(
        // `relative` keeps absolutely placed text inside (a visually hidden label would otherwise
        // widen the page); `@container` lets a state row measure the visible width (TableStateRow).
        "@container relative w-full overflow-x-auto rounded-card border border-border bg-surface",
        frameClassName,
      )}
    >
      <span role="status" className="sr-only">
        {busy ? busyLabel : null}
      </span>
      <table
        data-slot="table"
        aria-busy={busy || undefined}
        className={cn("w-full border-collapse text-base", className)}
        {...props}
      />
    </div>
  );
}

/** Header on `muted`, short labels in 12px capitals (4.1, 5.2). */
function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-muted", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

interface TableRowProps extends React.ComponentProps<"tr"> {
  /** The row is selected. The row also needs its checked checkbox: selection is never colour alone. */
  selected?: boolean;
  /** `touch`: 44px, where the row is the main touch target on a narrow screen (style guide 4.2). */
  size?: "default" | "touch";
}

/** Hover is the neutral step on body rows; selected is the 10% action tint (3.10). No zebra stripes. */
function TableRow({
  selected,
  size = "default",
  className,
  ...props
}: TableRowProps) {
  return (
    <tr
      data-slot="table-row"
      data-selected={selected || undefined}
      data-size={size}
      className={cn(
        // Hover only on body rows: the header row is not a target.
        "border-t border-border first:border-t-0 [tbody>&]:hover:bg-muted data-selected:bg-action/10",
        "data-[size=touch]:*:h-11",
        className,
      )}
      {...props}
    />
  );
}

type SortDirection = "ascending" | "descending";

interface TableHeadProps extends React.ComponentProps<"th"> {
  /** Right-aligns a numeric column. */
  numeric?: boolean;
  /**
   * Makes the column sortable: `none` when sortable but not the sort column, or the direction. The
   * header becomes a button, and `aria-sort` states the direction to assistive technology.
   */
  sort?: SortDirection | "none";
  /** Called when the sort button is pressed; the caller decides the next direction. */
  onSort?: () => void;
}

function TableHead({
  numeric,
  sort,
  onSort,
  className,
  children,
  ...props
}: TableHeadProps) {
  const sortable = sort !== undefined;
  const Arrow =
    sort === "ascending"
      ? ArrowUp
      : sort === "descending"
        ? ArrowDown
        : ArrowUpDown;
  return (
    <th
      data-slot="table-head"
      scope="col"
      aria-sort={sortable ? sort : undefined}
      className={cn(
        "h-8 px-3 text-start align-middle text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase",
        numeric && "text-end",
        className,
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 uppercase hover:text-foreground",
            numeric && "flex-row-reverse",
          )}
        >
          {children}
          <Arrow
            aria-hidden="true"
            className={cn(
              "size-3.5",
              sort === "none" && "text-subtle-foreground",
            )}
          />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

interface TableCellProps extends React.ComponentProps<"td"> {
  /** Right-aligned, tabular figures (5.2). */
  numeric?: boolean;
  /** Identifiers: device paths, UUIDs, addresses (4.1). */
  mono?: boolean;
}

function TableCell({ numeric, mono, className, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-9 px-3 align-middle",
        numeric && "text-end tabular-nums",
        mono && "font-mono text-sm",
        className,
      )}
      {...props}
    />
  );
}

/** A row that spans the table, for the empty, filtered-empty and error states (5.9). */
function TableStateRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr data-slot="table-state-row">
      <td colSpan={colSpan}>
        {/* As wide as the frame's visible part, and held there while the table scrolls sideways,
            so an empty or error state is never centred off-screen on a wide table. */}
        <div className="sticky start-0 w-[100cqw]">{children}</div>
      </td>
    </tr>
  );
}

/** Placeholder rows of the real height while the first page loads (5.2). Hidden from assistive tech. */
function TableSkeletonRows({
  rows = 5,
  columns,
}: {
  rows?: number;
  columns: number;
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr
          key={`skeleton-${String(row)}`}
          data-slot="table-skeleton-row"
          aria-hidden="true"
          className="border-t border-border first:border-t-0"
        >
          {Array.from({ length: columns }, (_, column) => (
            <td key={`skeleton-${String(column)}`} className="h-9 px-3">
              <div
                className={cn(
                  "h-3 rounded-sm bg-muted motion-safe:animate-pulse",
                  column === 0 ? "w-2/3" : "w-1/2",
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * The bar above a table: search, filters, and the actions that apply to the selection. Put
 * destructive actions apart, at the end, with `className="ms-auto"` on their group (5.2).
 */
function TableToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-toolbar"
      role="toolbar"
      className={cn("flex flex-wrap items-center gap-2 pb-2", className)}
      {...props}
    />
  );
}

/**
 * When a table that is not live was last read, so a stale table never looks current (5.2). The words
 * and the time come from the caller ("Last refreshed 12:04"); `action` is a refresh control.
 */
function TableLastRefreshed({
  action,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { action?: React.ReactNode }) {
  return (
    <div
      data-slot="table-last-refreshed"
      className={cn(
        "flex items-center gap-2 pt-2 text-xs text-muted-foreground tabular-nums",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {action}
    </div>
  );
}

export {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableLastRefreshed,
  TableRow,
  TableSkeletonRows,
  TableStateRow,
  TableToolbar,
};
export type {
  SortDirection,
  TableCellProps,
  TableHeadProps,
  TableProps,
  TableRowProps,
};
