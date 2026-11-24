// SPDX-License-Identifier: GPL-3.0-or-later
// The live tile is in the main entry and draws no chart: its plot is a slot, filled from the
// `/charts` entry (a lazy chunk on the page), so Recharts never enters the main barrel (UI-11).
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import { Skeleton } from "../skeleton/skeleton";

const tileClass = cva("grid min-w-0 gap-x-4 gap-y-1", {
  variants: {
    layout: {
      // The name and the figure above the plot, the sub-line under it.
      stacked: "grid-cols-1",
      // The name and the figure at the start, the plot filling the rest, the sub-line under both.
      row: "grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] items-center [&>[data-part=plot]]:row-span-2",
      // Stacked, and a row once the tile itself is 20rem wide (a tile in a narrow column of a wide
      // page); the tile's own container decides, not the window.
      auto: "grid-cols-1 @xs/tile:grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] @xs/tile:items-center @xs/tile:[&>[data-part=plot]]:row-span-2",
    },
  },
  defaultVariants: { layout: "auto" },
});

interface LiveTileProps
  extends
    Omit<React.ComponentProps<"div">, "children">,
    VariantProps<typeof tileClass> {
  /** What is measured, the tile's name: "Processor", "Network · enp2s0". */
  name: React.ReactNode;
  /** The newest reading: one `LiveFigure`, or two `size="readout"` side by side for In and Out. */
  figure: React.ReactNode;
  /**
   * The plot: a `LiveChart size="tile"` from `@omv-webui/react-ui-components/charts`, loaded lazily,
   * in a `Suspense` whose fallback is a `LivePlotSkeleton`, so nothing moves when the chunk lands.
   */
  plot: React.ReactNode;
  /** One quiet line under the plot: "Average load 0.23 · 0.09 · 0.02", or a key and a disclosure. */
  children?: React.ReactNode;
}

/**
 * One live reading on a dashboard (foundation 7.2): its name, the figure that glides to each reading,
 * the plot, and one quiet sub-line. A group named by its name. `layout="auto"` (the default) stacks
 * the parts in a narrow tile and sets the name and figure beside the plot once the tile is 20rem
 * wide; `stacked` and `row` force one. Draws no chart itself: the plot is the caller's.
 */
function LiveTile({
  name,
  figure,
  plot,
  layout,
  className,
  children,
  ...props
}: LiveTileProps) {
  const nameId = React.useId();
  return (
    <div
      role="group"
      aria-labelledby={nameId}
      data-slot="live-tile"
      className={cn("@container/tile min-w-0", className)}
      {...props}
    >
      <div className={tileClass({ layout })}>
        <div data-part="reading" className="flex min-w-0 flex-col gap-1">
          <p id={nameId} className="text-sm font-medium text-muted-foreground">
            {name}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {figure}
          </div>
        </div>
        <div data-part="plot" className="min-w-0">
          {plot}
        </div>
        {children ? (
          <div
            data-part="sub"
            className="min-w-0 text-caption text-tertiary-foreground"
          >
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const plotSkeletonClass = cva("", {
  variants: {
    size: {
      // As `LiveChart`'s plot heights: 104px on a tile, 240px on a page of its own.
      tile: "h-26",
      large: "h-60",
    },
  },
  defaultVariants: { size: "tile" },
});

interface LivePlotSkeletonProps
  extends
    Omit<React.ComponentProps<"div">, "children">,
    VariantProps<typeof plotSkeletonClass> {
  /** `line` (the default) also stands in for the chart's one-line caption; `none` when it has none. */
  caption?: "line" | "none";
}

/**
 * A `LiveChart` while its chunk loads: the plot's exact height (and its caption line), breathing, so
 * the tile does not move when the chart lands. The `Suspense` fallback for a lazy plot. Hidden from
 * assistive technology; the tile's name and figure are already there.
 */
function LivePlotSkeleton({
  size,
  caption = "line",
  className,
  ...props
}: LivePlotSkeletonProps) {
  return (
    <div
      data-slot="live-plot-skeleton"
      aria-hidden="true"
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
      {...props}
    >
      <Skeleton shape="block" className={plotSkeletonClass({ size })} />
      {caption === "line" ? (
        <Skeleton className="w-40 max-w-full text-caption" />
      ) : null}
    </div>
  );
}

export { LivePlotSkeleton, LiveTile };
export type { LivePlotSkeletonProps, LiveTileProps };
