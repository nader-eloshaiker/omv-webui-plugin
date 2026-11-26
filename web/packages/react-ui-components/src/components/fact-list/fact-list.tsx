// SPDX-License-Identifier: GPL-3.0-or-later
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import { Skeleton } from "../skeleton/skeleton";

const listClass =
  "grid grid-cols-1 sm:grid-cols-[fit-content(40%)_minmax(0,1fr)] sm:gap-x-6";
const itemClass =
  "grid grid-cols-subgrid gap-y-0.5 border-t border-border py-row first:border-t-0 first:pt-0 last:pb-0 sm:col-span-2";

/**
 * `rows`, the default: label beside value from 640px. `grid`: a short set of facts in two columns,
 * each label over its value, every fact under a hairline (the dashboard's This NAS). A fact with
 * `span="full"` takes the whole width.
 */
type FactListLayout = "rows" | "grid";

const FactListLayoutContext = React.createContext<FactListLayout>("rows");

const layoutClass = cva("", {
  variants: {
    layout: {
      rows: listClass,
      grid: "grid grid-cols-2 gap-x-5",
    },
  },
  defaultVariants: { layout: "rows" },
});

type FactListProps = React.ComponentProps<"dl"> & { layout?: FactListLayout };

/**
 * Facts about one thing, as a description list (`dl`): label and value side by side from 640px, the
 * label above its value below that, so a long value never forces sideways scrolling (WCAG 1.4.10).
 * The label column is as wide as the longest label, up to 40% of the list.
 */
function FactList({ layout = "rows", className, ...props }: FactListProps) {
  return (
    <FactListLayoutContext value={layout}>
      <dl
        data-slot="fact-list"
        data-layout={layout}
        className={cn(layoutClass({ layout }), className)}
        {...props}
      />
    </FactListLayoutContext>
  );
}

const gridItemClass = cva(
  "flex min-w-0 flex-col gap-px border-t border-border py-2 compact:py-1",
  {
    variants: {
      span: { one: "", full: "col-span-full" },
    },
    defaultVariants: { span: "one" },
  },
);

type FactListItemProps = React.ComponentProps<"div"> & {
  /** In a `grid` list, take the whole width (a long value such as the add-ons). */
  span?: "one" | "full";
};

/** One label and its value. Rows are separated by the divider; the grid keeps the columns aligned. */
function FactListItem({ span, className, ...props }: FactListItemProps) {
  const layout = React.use(FactListLayoutContext);
  return (
    <div
      data-slot="fact-list-item"
      className={cn(
        layout === "grid" ? gridItemClass({ span }) : itemClass,
        className,
      )}
      {...props}
    />
  );
}

/** The label, in the secondary ink. */
function FactListLabel({ className, ...props }: React.ComponentProps<"dt">) {
  const layout = React.use(FactListLayoutContext);
  return (
    <dt
      data-slot="fact-list-label"
      className={cn(
        layout === "grid" ? "text-sm" : "text-base",
        "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

const valueClass = cva("min-w-0 text-base", {
  variants: {
    variant: {
      // Words, numbers and free text from the server. Long words wrap instead of overflowing.
      text: "text-foreground tabular-nums [overflow-wrap:anywhere]",
      // Something to copy or compare character by character: a host name, a path, a kernel release
      // (4.1). Breaks anywhere so a long path stays in its column.
      identifier: "font-mono text-sm text-foreground [overflow-wrap:anywhere]",
      // No value: the word ("Not reported", "None") in the secondary ink, never a dash alone.
      missing: "text-muted-foreground",
    },
  },
  defaultVariants: { variant: "text" },
});

type FactListValueProps = React.ComponentProps<"dd"> &
  VariantProps<typeof valueClass>;

/**
 * The value. `dir` defaults to `auto`, so a right-to-left name or comment keeps its own direction
 * without reordering the row. Server text is passed as children and rendered as text.
 */
function FactListValue({
  variant,
  className,
  dir = "auto",
  ...props
}: FactListValueProps) {
  const layout = React.use(FactListLayoutContext);
  return (
    <dd
      data-slot="fact-list-value"
      data-variant={variant ?? "text"}
      dir={dir}
      className={cn(
        valueClass({ variant }),
        layout === "grid" && "text-sm font-medium",
        className,
      )}
      {...props}
    />
  );
}

interface FactListSkeletonProps extends React.ComponentProps<"div"> {
  /** How many facts the loaded list will show, so the card keeps its height. */
  rows: number;
}

/**
 * The list's shape while its first read is in flight: label-width and value-width bars at the real
 * line height. Hidden from assistive technology; the region around it carries `aria-busy` and the
 * polite "Loading …".
 */
function FactListSkeleton({
  rows,
  className,
  ...props
}: FactListSkeletonProps) {
  return (
    // A plain grid, not a `dl`: it holds no terms or values, only placeholders.
    <div
      data-slot="fact-list-skeleton"
      aria-hidden="true"
      className={cn(listClass, className)}
      {...props}
    >
      {Array.from({ length: rows }, (_, row) => (
        <div key={`skeleton-${String(row)}`} className={itemClass}>
          <Skeleton className="w-28" />
          <Skeleton className={row % 2 === 0 ? "w-2/3" : "w-1/2"} />
        </div>
      ))}
    </div>
  );
}

export {
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
};
export type {
  FactListItemProps,
  FactListLayout,
  FactListProps,
  FactListSkeletonProps,
  FactListValueProps,
};
