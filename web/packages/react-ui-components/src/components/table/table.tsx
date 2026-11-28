// SPDX-License-Identifier: GPL-3.0-or-later
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

interface TableProps extends React.ComponentProps<"table"> {
  /** Loading: set while skeleton rows stand in for data, so assistive technology hears it is busy. */
  busy?: boolean;
  /** Announced while "busy", since the skeleton rows are hidden from assistive technology: "Loading disks…". */
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

/*
 * A narrow table stacks (owner, 2026-11-28: columns squeezed to a word's width help no one). Under
 * "@max-[40rem]" (its frame narrower than 40rem: a phone, or a narrow column on a wide screen) the header
 * goes and each row becomes a block: its title cell at the top, an aside cell (a status) beside it,
 * and every other cell a line under them that says its column's word ("TableCell" "label") before
 * its value. A line with no value is left out. The roles are set explicitly, since a table drawn as
 * blocks loses them in some browsers.
 */
/**
 * A data table (style guide 5.2) in its own horizontal scroll region, so a wide table never makes the
 * page scroll sideways (6, reflow). Name it with "aria-label" or a "<caption>". Narrower than 40rem it
 * stacks (above): give every cell its "label" and its "narrow" place.
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
        // "relative" keeps absolutely placed text inside (a visually hidden label would otherwise
        // widen the page); "@container" lets a state row measure the visible width (TableStateRow).
        "@container relative w-full overflow-x-auto rounded-card surface-raised",
        frameClassName,
      )}
    >
      <span role="status" className="sr-only">
        {busy ? busyLabel : null}
      </span>
      <table
        data-slot="table"
        // The role is explicit: some browsers drop it when the table stacks as blocks.
        role="table"
        aria-busy={busy || undefined}
        className={cn(
          "w-full border-collapse text-base",
          "@max-[40rem]:block",
          className,
        )}
        {...props}
      />
    </div>
  );
}

/** Header on "muted", short labels in sentence case, regular weight, secondary ink (5.2, style guide 10). */
function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      // Stacked, every line says its column's word, so the header row goes, unless a column sorts:
      // then its sort buttons stay, in one row above the blocks.
      className={cn(
        "bg-muted",
        "@max-[40rem]:hidden @max-[40rem]:has-[th[aria-sort]]:block @max-[40rem]:[&>tr]:flex! @max-[40rem]:[&>tr]:flex-wrap @max-[40rem]:[&>tr]:gap-x-5",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      // The role is explicit: some browsers drop it when the table stacks as blocks.
      role="rowgroup"
      className={cn("@max-[40rem]:block", className)}
      {...props}
    />
  );
}

interface TableRowProps extends React.ComponentProps<"tr"> {
  /** The row is selected. The row also needs its checked checkbox: selection is never colour alone. */
  selected?: boolean;
  /** "touch": 44px, where the row is the main touch target on a narrow screen (style guide 4.2). */
  size?: "default" | "touch";
}

/**
 * Hover is the neutral step on body rows; selected is the "selected" tint (3.10). No zebra stripes.
 * Row height follows the density through the cells' "py-cell-y" (foundation 5); a cell's padding is
 * never overridden, so one disk stays apart from the next (spacing rule, style guide 4.7).
 */
function TableRow({
  selected,
  size = "default",
  className,
  ...props
}: TableRowProps) {
  return (
    <tr
      data-slot="table-row"
      // The role is explicit: some browsers drop it when the table stacks as blocks.
      role="row"
      data-selected={selected || undefined}
      data-size={size}
      className={cn(
        // Hover only on body rows: the header row is not a target.
        "border-t border-border first:border-t-0 transition-colors duration-fast ease-standard [tbody>&]:hover:bg-muted data-selected:bg-selected",
        "data-[size=touch]:*:h-11",
        // Stacked: the title and its aside on the first line, every other cell a line under them,
        // the row's own padding around the whole block.
        "@max-[40rem]:grid @max-[40rem]:grid-cols-[minmax(0,1fr)_auto] @max-[40rem]:gap-x-4 @max-[40rem]:gap-y-line @max-[40rem]:px-cell-x @max-[40rem]:py-cell-y @max-[40rem]:data-[size=touch]:*:h-auto",
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
   * Makes the column sortable: "none" when sortable but not the sort column, or the direction. The
   * header becomes a button, and "aria-sort" states the direction to assistive technology.
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
      // The role is explicit: some browsers drop it when the table stacks as blocks.
      role="columnheader"
      scope="col"
      aria-sort={sortable ? sort : undefined}
      className={cn(
        "px-cell-x py-head-y text-start align-middle text-sm font-normal whitespace-nowrap text-muted-foreground",
        numeric && "text-end",
        // Stacked, only a sortable column's button stays (TableHeader).
        "@max-[40rem]:p-0 @max-[40rem]:not-[[aria-sort]]:hidden",
        className,
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "-mx-1 inline-flex min-h-6 items-center gap-1 rounded-sm px-1 transition-colors duration-fast hover:text-foreground",
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

/** Where a cell goes when its table stacks ("Table"). */
type TableCellNarrow = "title" | "aside" | "line" | "hidden";

interface TableCellProps extends React.ComponentProps<"td"> {
  /** Right-aligned, tabular figures (5.2). */
  numeric?: boolean;
  /** Identifiers: device paths, UUIDs, addresses (4.1). */
  mono?: boolean;
  /**
   * The column's word, said before the value when the table stacks: the same word as its header.
   * Leave it out for a line that reads on its own (a row's actions).
   */
  label?: React.ReactNode;
  /**
   * Where the cell goes when the table stacks: "title" (the row's name, at the top), "aside" (a
   * status, beside the title), "line" (the default: a line under them, after its "label") or "hidden"
   * (said elsewhere in the row, or of no use on a narrow screen).
   */
  narrow?: TableCellNarrow;
}

/**
 * A cell. A second line inside it (a block under the first: a disk's serial under its model) sits a
 * line step under the first, so the lines of one cell read as one thing (style guide 4.7).
 */
function TableCell({
  numeric,
  mono,
  label,
  narrow = "line",
  className,
  children,
  ...props
}: TableCellProps) {
  const labelled = narrow === "line" && label !== undefined && label !== null;
  return (
    <td
      data-slot="table-cell"
      data-narrow={narrow}
      // The role is explicit: some browsers drop it when the table stacks as blocks.
      role="cell"
      className={cn(
        "px-cell-x py-cell-y align-middle [&>*+*]:mt-line [&>[data-slot=table-cell-value]>*+*]:mt-line",
        numeric && "text-end tabular-nums",
        mono && "font-mono text-sm",
        // Stacked: the row holds the padding; a line with no value, or an empty cell, is left out.
        "@max-[40rem]:block @max-[40rem]:p-0 @max-[40rem]:text-start @max-[40rem]:has-[>[data-slot=table-cell-value]:empty]:hidden @max-[40rem]:empty:hidden",
        narrow === "title" &&
          "@max-[40rem]:col-start-1 @max-[40rem]:row-start-1 @max-[40rem]:mb-[calc(var(--space-pair)-var(--space-line))]",
        narrow === "aside" &&
          "@max-[40rem]:col-start-2 @max-[40rem]:row-start-1 @max-[40rem]:justify-self-end",
        narrow === "line" && "@max-[40rem]:col-span-2",
        labelled &&
          "@max-[40rem]:grid @max-[40rem]:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] @max-[40rem]:gap-x-3",
        narrow === "hidden" && "@max-[40rem]:hidden",
        className,
      )}
      {...props}
    >
      {labelled ? (
        <span
          data-slot="table-cell-label"
          className={cn(
            // The sans face even in a mono cell: the word is the column's, not the value's.
            "hidden font-sans text-sm text-muted-foreground",
            "@max-[40rem]:block @max-[40rem]:pt-px",
          )}
        >
          {label}
        </span>
      ) : null}
      {labelled ? (
        <span
          data-slot="table-cell-value"
          // Wide, the cell's own content; stacked, one block in the value column.
          className="contents @max-[40rem]:block @max-[40rem]:min-w-0"
        >
          {children}
        </span>
      ) : (
        children
      )}
    </td>
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
    <tr data-slot="table-state-row" className={"@max-[40rem]:block"}>
      <td colSpan={colSpan} className={"@max-[40rem]:block"}>
        {/* As wide as the frame's visible part, and held there while the table scrolls sideways,
            so an empty or error state is never centred off-screen on a wide table. */}
        <div className="sticky start-0 w-[100cqw]">{children}</div>
      </td>
    </tr>
  );
}

interface TableGroupRowProps {
  /** The number of columns the heading spans: all of them. */
  colSpan: number;
  /** The group's words, e.g. "Mirror, 2 disks". */
  heading: React.ReactNode;
  /** A second line under the heading, e.g. the group's protection sentence. */
  description?: React.ReactNode;
  /** The header cell's id, for cells that name it with "headers". */
  id?: string;
  /** Classes for the row. */
  className?: string;
}

/**
 * A heading row inside a table body, spanning its columns, for rows that belong together (a pool's
 * disk groups). Put each group in its own "TableBody" with this row first: the heading is a row-group
 * header ("scope="rowgroup""), so assistive technology reads every row of the body with its group.
 */
function TableGroupRow({
  colSpan,
  heading,
  description,
  id,
  className,
}: TableGroupRowProps) {
  return (
    <tr
      data-slot="table-group-row"
      className={cn(
        // A line between groups, none under the header: the first body's group row opens the table.
        "border-t border-border [tbody:first-of-type>&]:border-t-0",
        "@max-[40rem]:block @max-[40rem]:*:block",
        className,
      )}
    >
      <th
        scope="rowgroup"
        colSpan={colSpan}
        id={id}
        className="p-0 text-start align-bottom font-regular"
      >
        {/* As TableStateRow's content: as wide as the frame's visible part and held there while the
            table scrolls sideways, so the heading wraps in view instead of running off a wide table. */}
        <div className="sticky start-0 flex w-[100cqw] flex-col gap-0.5 px-cell-x pt-3 pb-1.5">
          <span className="text-base font-semibold text-foreground [overflow-wrap:anywhere]">
            {heading}
          </span>
          {description ? (
            <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {description}
            </span>
          ) : null}
        </div>
      </th>
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
          className={cn(
            "border-t border-border first:border-t-0",
            "@max-[40rem]:flex @max-[40rem]:flex-col @max-[40rem]:gap-y-line @max-[40rem]:px-cell-x @max-[40rem]:py-cell-y",
          )}
        >
          {Array.from({ length: columns }, (_, column) => (
            <td
              key={`skeleton-${String(column)}`}
              className={cn(
                "px-cell-x py-cell-y",
                "@max-[40rem]:block @max-[40rem]:p-0",
                // Stacked, three lines stand for a row.
                column > 2 && "@max-[40rem]:hidden",
              )}
            >
              <div
                className={cn(
                  "h-[1lh] rounded-sm bg-muted-strong bg-clip-content py-[calc((1lh-0.75rem)/2)]",
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
 * destructive actions apart, at the end, with `className="ms-auto"` on their group (5.2). It belongs
 * to its table alone: put the two in a `PairStack`, a pair step apart (style guide 4.7).
 */
function TableToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-toolbar"
      role="toolbar"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

/**
 * When a table that is not live was last read, so a stale table never looks current (5.2). It sits
 * with its table in a `PairStack` (style guide 4.7). The words
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
        "flex items-center gap-2 text-xs text-muted-foreground tabular-nums",
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
  TableGroupRow,
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
  TableCellNarrow,
  TableCellProps,
  TableGroupRowProps,
  TableHeadProps,
  TableProps,
  TableRowProps,
};
