// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import { Identifier } from "../text/identifier";

interface NowAfterRow {
  /** Stable key: the setting's name in the caller's model. */
  id: string;
  /** The setting, as the form names it: "IPv4 address", "Router address". */
  label: React.ReactNode;
  /**
   * The value now and after the change. A string is set in the `Identifier` style, left to right
   * (an address, a name, a size); pass a node for words ("Automatic (DHCP)") or a mix.
   */
  now: React.ReactNode;
  after: React.ReactNode;
  /** Whether the change alters this row. Unchanged rows are shown where they help (an address). */
  changed: boolean;
}

interface NowAfterTableLabels {
  /** The table's name for assistive technology: "What changes". */
  name: string;
  /** The row header column's title, read with each row: "Setting". */
  setting: string;
  /** "Now" and "After" (`netChange.now`, `netChange.after`). */
  now: string;
  after: string;
  /** Shown after the label of a row the change leaves as it is: "Unchanged". */
  unchanged: string;
}

interface NowAfterTableProps extends Omit<
  React.ComponentProps<"table">,
  "children"
> {
  rows: readonly NowAfterRow[];
  labels: NowAfterTableLabels;
}

function Value({ value }: { value: React.ReactNode }) {
  return typeof value === "string" ? (
    <Identifier dir="ltr">{value}</Identifier>
  ) : (
    <>{value}</>
  );
}

/**
 * What a change does to the settings (phase 5 network design 1.4): a "Now" and an "After" column,
 * one row per setting, the setting as the row header. A changed row's new value is in the medium
 * weight; an unchanged row says so in words beside its label, so neither depends on colour. Under
 * 640px the columns stack, "Now" first, each value with its column's word beside it, so nothing scrolls
 * sideways at 320px or 200% zoom.
 */
function NowAfterTable({
  rows,
  labels,
  className,
  ...props
}: NowAfterTableProps) {
  return (
    <table
      data-slot="now-after-table"
      aria-label={labels.name}
      className={cn("w-full border-collapse text-base max-sm:block", className)}
      {...props}
    >
      <thead className="max-sm:hidden">
        <tr className="border-b border-border">
          <th
            scope="col"
            className="pe-3 py-cell-y text-start text-xs font-semibold tracking-wide text-tertiary-foreground uppercase"
          >
            {labels.setting}
          </th>
          <th
            scope="col"
            className="px-3 py-cell-y text-start text-xs font-semibold tracking-wide text-tertiary-foreground uppercase"
          >
            {labels.now}
          </th>
          <th
            scope="col"
            className="ps-3 py-cell-y text-start text-xs font-semibold tracking-wide text-tertiary-foreground uppercase"
          >
            {labels.after}
          </th>
        </tr>
      </thead>
      <tbody className="max-sm:block">
        {rows.map((row) => (
          <tr
            key={row.id}
            data-slot="now-after-row"
            data-changed={row.changed || undefined}
            className="border-t border-border align-top first:border-t-0 max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:py-2.5"
          >
            <th
              scope="row"
              className="py-2 pe-3 text-start font-medium text-foreground max-sm:p-0 sm:w-1/4"
            >
              <span className="[overflow-wrap:anywhere]">{row.label}</span>
              {row.changed ? null : (
                <span className="block text-sm font-regular text-muted-foreground">
                  {labels.unchanged}
                </span>
              )}
            </th>
            <td className="px-3 py-2 text-foreground max-sm:flex max-sm:gap-2 max-sm:p-0">
              <span className="min-w-14 shrink-0 text-sm text-muted-foreground sm:hidden">
                {labels.now}
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <Value value={row.now} />
              </span>
            </td>
            <td
              className={cn(
                "ps-3 py-2 text-foreground max-sm:flex max-sm:gap-2 max-sm:p-0",
                row.changed && "font-medium",
              )}
            >
              <span className="min-w-14 shrink-0 text-sm font-regular text-muted-foreground sm:hidden">
                {labels.after}
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <Value value={row.after} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export { NowAfterTable };
export type { NowAfterRow, NowAfterTableLabels, NowAfterTableProps };
