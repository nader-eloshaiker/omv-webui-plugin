// SPDX-License-Identifier: GPL-3.0-or-later
// What the charts share: the tooltip, the swatch, the empty plot and the table equivalent. Part of
// the `/charts` entry only. None of it imports Recharts, but it is only ever drawn with a chart.
import type * as React from "react";
import { cn } from "../../utils";
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
} from "../disclosure/disclosure";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../table/table";
import { TONE_TEXT, type SeriesTone } from "./chart-theme";

/** The key for a series: a short stroke in its colour and dash, beside its name. */
export function Swatch({
  tone,
  dash,
}: {
  tone: SeriesTone;
  dash?: string | undefined;
}) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="8"
      viewBox="0 0 16 8"
      className={cn("shrink-0 overflow-visible", TONE_TEXT[tone])}
    >
      <path
        d="M1 4h14"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeDasharray={dash === undefined ? undefined : "4 3"}
      />
    </svg>
  );
}

/**
 * The tooltip's card: the exact value and the moment, in the text tokens, never a series colour
 * (style guide 3.9). Floating, so it reads above the plot in both themes.
 */
export function ChartTooltipCard({
  title,
  meta,
  children,
}: {
  /** The moment or the thing pointed at: "14:02:31", "sdb". */
  title: React.ReactNode;
  /** Quieter, beside the title: "12 s ago", "data". */
  meta?: React.ReactNode;
  /** The values: a list of `ChartTooltipRow`, or lines of text. */
  children: React.ReactNode;
}) {
  return (
    <div
      data-slot="chart-tooltip"
      className="min-w-36 rounded-control px-2.5 py-2 text-xs leading-relaxed text-foreground surface-floating"
    >
      <p className="flex justify-between gap-3 font-semibold tabular-nums">
        <span>{title}</span>
        {meta ? (
          <span className="font-medium text-tertiary-foreground">{meta}</span>
        ) : null}
      </p>
      <div className="mt-1 grid gap-0.5">{children}</div>
    </div>
  );
}

/** One value in the tooltip: the swatch, the name and the figure. */
export function ChartTooltipRow({
  tone,
  dash,
  name,
  value,
}: {
  tone: SeriesTone;
  dash?: string | undefined;
  name: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <p className="grid grid-cols-[auto_1fr_auto] items-center gap-1.5">
      <Swatch tone={tone} dash={dash} />
      <span className="text-muted-foreground">{name}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </p>
  );
}

/** Where the plot will be, before the first sample: a dashed outline and the words, at the chart's own height. */
export function EmptyPlot({
  height,
  children,
}: {
  height: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-slot="chart-empty"
      className={cn(
        "flex items-center justify-center rounded-control border border-dashed border-border-control px-4 text-center text-sm text-muted-foreground",
        height,
      )}
    >
      {children}
    </div>
  );
}

/** One column of the table equivalent. */
export interface ChartTableColumn<Row> {
  id: string;
  header: React.ReactNode;
  cell: (row: Row) => React.ReactNode;
  numeric?: boolean;
  mono?: boolean;
}

/** The words of the table equivalent: the disclosure's button and the table's caption. */
export interface ChartTableWords {
  /** The button that shows it: "Show the numbers as a table". */
  summary: React.ReactNode;
  /** The table's caption, for screen readers: "Readings sampled every 2 s over the last 58 s, newest first". */
  caption: string;
}

/** The numbers behind a chart, as a plain table (rows already in reading order). */
export function ChartTable<Row>({
  rows,
  rowKey,
  columns,
  caption,
}: {
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  columns: readonly ChartTableColumn<Row>[];
  caption: string;
}) {
  return (
    <Table frameLabel={caption} frameClassName="max-h-80 overflow-y-auto">
      <caption className="sr-only">{caption}</caption>
      <TableHeader className="sticky top-0 bg-muted">
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.id} numeric={column.numeric} scope="col">
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={rowKey(row)}>
            {columns.map((column, i) =>
              i === 0 ? (
                <th
                  key={column.id}
                  scope="row"
                  className={cn(
                    "h-9 px-3 text-start align-middle font-medium tabular-nums",
                    column.mono && "font-mono text-sm",
                  )}
                >
                  {column.cell(row)}
                </th>
              ) : (
                <TableCell
                  key={column.id}
                  numeric={column.numeric}
                  mono={column.mono}
                >
                  {column.cell(row)}
                </TableCell>
              ),
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The table one click away, under the chart. Not rendered until opened. */
export function ChartTableDisclosure({
  summary,
  children,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Disclosure>
      <DisclosureTrigger variant="inline">{summary}</DisclosureTrigger>
      <DisclosurePanel keepMounted={false}>{children}</DisclosurePanel>
    </Disclosure>
  );
}
