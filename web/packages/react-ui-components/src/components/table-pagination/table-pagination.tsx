// SPDX-License-Identifier: GPL-3.0-or-later
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "../select/select";
import { Tooltip } from "../tooltip/tooltip";

interface PageStep {
  /** The button's words: "Previous page", "Next page". Visible from 640px, its name always. */
  label: string;
  /** Why it is unavailable at that end: "This is the first page." Shown and given as its description. */
  unavailableReason: string;
}

interface TablePaginationProps extends Omit<
  React.ComponentProps<"nav">,
  "children"
> {
  /** The region's name: "Pages of shared folders". */
  "aria-label": string;
  /** The current page, counted from 0. */
  page: number;
  /** How many pages there are; 0 or 1 when everything fits on one. */
  pageCount: number;
  onPageChange: (page: number) => void;
  /**
   * The rows shown, formatted by the caller with tabular figures: "1–25 of 132", "1–12 of 12 matching".
   * Announced politely when it changes, so a page change is heard while focus stays on the button.
   */
  range: React.ReactNode;
  pageSize: number;
  /** The sizes offered; the default is 10, 25, 50, 100. */
  pageSizeOptions?: readonly number[];
  /** Called with the new size. The caller goes back to the first page. */
  onPageSizeChange: (pageSize: number) => void;
  /** "Rows per page". */
  pageSizeLabel: React.ReactNode;
  previous: PageStep;
  next: PageStep;
}

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100] as const;

function StepButton({
  step,
  available,
  direction,
  onPress,
}: {
  step: PageStep;
  available: boolean;
  direction: "previous" | "next";
  onPress: () => void;
}) {
  const reasonId = React.useId();
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return (
    <>
      <Tooltip content={available ? step.label : step.unavailableReason}>
        <Button
          variant="neutral"
          size="sm"
          // Focusable when unavailable, so focus is not lost when the last press reaches an end and the
          // reason can be read (style guide 5.3).
          disabled={!available}
          focusableWhenDisabled
          aria-describedby={available ? undefined : reasonId}
          onClick={onPress}
          className={cn(
            "max-sm:size-control-sm max-sm:px-0",
            direction === "next" && "flex-row-reverse",
          )}
        >
          {/* Icon-only under 640px, where the words do not fit; from 640px the words alone, with no
              arrow beside them (style guide 10). */}
          <Icon aria-hidden="true" className="sm:hidden rtl:-scale-x-100" />
          {/* The name in both layouts: visible from 640px, for assistive technology only below. */}
          <span className="max-sm:sr-only">{step.label}</span>
        </Button>
      </Tooltip>
      {available ? null : (
        <span id={reasonId} className="sr-only">
          {step.unavailableReason}
        </span>
      )}
    </>
  );
}

/**
 * The paging bar under a server-paged table (phase 3 design 4.5): the range, a rows-per-page choice,
 * and previous and next buttons. It wraps on a narrow screen, where the buttons keep only their icon,
 * with their name and a tooltip. The caller keeps the page in range (a total that shrinks moves the
 * table to the last page that exists) and formats every number.
 */
function TablePagination({
  page,
  pageCount,
  onPageChange,
  range,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  onPageSizeChange,
  pageSizeLabel,
  previous,
  next,
  className,
  ...props
}: TablePaginationProps) {
  const items = pageSizeOptions.map((size) => ({
    value: size,
    label: String(size),
  }));
  const hasPrevious = page > 0;
  const hasNext = page < pageCount - 1;
  return (
    <nav
      data-slot="table-pagination"
      className={cn(
        "flex flex-wrap items-center justify-end gap-x-4 gap-y-2 pt-2 text-sm",
        className,
      )}
      {...props}
    >
      <p
        role="status"
        data-slot="table-pagination-range"
        className="me-auto text-muted-foreground tabular-nums"
      >
        {range}
      </p>
      <Select
        value={pageSize}
        items={items}
        onValueChange={(size) => {
          if (typeof size === "number") {
            onPageSizeChange(size);
          }
        }}
      >
        <div className="flex items-center gap-2">
          <SelectLabel className="text-sm font-regular text-muted-foreground">
            {pageSizeLabel}
          </SelectLabel>
          <SelectTrigger className="h-control-sm w-auto min-w-16 text-sm tabular-nums" />
        </div>
        <SelectContent>
          {items.map((item) => (
            <SelectItem
              key={item.value}
              value={item.value}
              className="tabular-nums"
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <StepButton
          step={previous}
          direction="previous"
          available={hasPrevious}
          onPress={() => onPageChange(page - 1)}
        />
        <StepButton
          step={next}
          direction="next"
          available={hasNext}
          onPress={() => onPageChange(page + 1)}
        />
      </div>
    </nav>
  );
}

export { TablePagination };
export type { PageStep, TablePaginationProps };
