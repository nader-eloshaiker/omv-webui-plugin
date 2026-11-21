// SPDX-License-Identifier: GPL-3.0-or-later
import { Meter } from "@base-ui/react/meter";
import { cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../utils";
import { StatusIcon, StatusPill } from "../status/status";

interface CapacityThreshold {
  /** Which admin-configured threshold was crossed. */
  status: "warning" | "critical";
  /** The pill's word: "Warning", "Critical". */
  label: React.ReactNode;
}

interface CapacityMeterProps {
  /** What is measured: "File system: data". */
  label: React.ReactNode;
  /**
   * How much is used, out of `max`. `null` when there is no reading (a file system that is not
   * mounted, a source that could not be read): the meter then says so in the Unknown style and draws
   * no bar, so "no data" never looks like "empty".
   */
  value: number | null;
  max: number;
  /**
   * The numbers, always (style guide 5.6), formatted by the caller with units and tabular figures:
   * "2.2 TiB of 3.6 TiB (62%)". With `value: null`, the words for the missing reading: "No reading".
   * Also the meter's `aria-valuetext`.
   */
  valueText: string;
  /** The first reading has not arrived: a placeholder bar, and `valueText` says so ("Loading…"). */
  loading?: boolean;
  /** Set when a configured threshold is crossed: a pill beside the figure, and only then a status fill. */
  threshold?: CapacityThreshold;
  /**
   * `default`: the label above the bar, the figure under it, for a card or a details page.
   * `compact`: for a table cell in a 36px row. The label is visually hidden but still names the
   * meter (the column header shows it), the bar and the figure share one line with the pill beside
   * the figure, and below 640px the figure wraps under the bar.
   */
  variant?: "default" | "compact";
  className?: string;
}

const labelClass = cva("", {
  variants: {
    variant: {
      default: "text-base font-medium text-foreground",
      compact: "sr-only",
    },
  },
  defaultVariants: { variant: "default" },
});

const rootClass = cva("flex", {
  variants: {
    variant: {
      default: "flex-col gap-1.5",
      compact: "flex-col gap-1 sm:flex-row sm:items-center sm:gap-3",
    },
  },
  defaultVariants: { variant: "default" },
});

const trackClass = cva(
  "h-2 w-full overflow-hidden rounded-full border border-usage-track-edge bg-usage-track",
  {
    variants: {
      // On one line with the figure, the bar takes the room the figure leaves, and never less than 4rem.
      variant: { default: "", compact: "sm:min-w-16 sm:flex-1" },
    },
    defaultVariants: { variant: "default" },
  },
);

// The figure, and in compact form the pill beside it. Beside the bar it keeps its own width while
// there is room, and wraps (the pill first) rather than push the cell wider when there is not.
const figureRowClass = "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1";

/**
 * How full something is (style guide 5.6), on Base UI's Meter (`role="meter"` with its values). The
 * bar is the usage blue; crossing a threshold adds a Warning or Critical pill, and only with that pill
 * does the bar take the status fill.
 */
function CapacityMeter({
  label,
  value,
  max,
  valueText,
  loading = false,
  threshold,
  variant = "default",
  className,
}: CapacityMeterProps) {
  const compact = variant === "compact";
  if (loading || value === null) {
    // Not a meter: there is no value to report, so there is no `role="meter"` claiming one.
    return (
      <div
        data-slot="capacity-meter"
        data-state={loading ? "loading" : "unknown"}
        data-variant={variant}
        aria-busy={loading || undefined}
        className={cn(rootClass({ variant }), className)}
      >
        <p className={labelClass({ variant })}>{label}</p>
        <div
          aria-hidden="true"
          className={cn(
            trackClass({ variant }),
            loading ? "motion-safe:animate-pulse" : "border-dashed",
          )}
        />
        <p
          // In a table, a meter per row would announce "Loading…" once per row; the compact form
          // leaves that to the table's own loading state.
          role={loading && !compact ? "status" : undefined}
          className={cn(
            "flex items-center gap-1.5 text-sm",
            loading ? "text-muted-foreground" : "text-unknown-label",
          )}
        >
          {loading ? null : <StatusIcon status="unknown" />}
          {valueText}
        </p>
      </div>
    );
  }
  const pill = threshold ? (
    <StatusPill status={threshold.status}>{threshold.label}</StatusPill>
  ) : null;
  const figure = (
    <p className="text-sm text-muted-foreground tabular-nums">{valueText}</p>
  );
  return (
    <Meter.Root
      data-slot="capacity-meter"
      data-variant={variant}
      value={value}
      max={max}
      getAriaValueText={() => valueText}
      className={cn(rootClass({ variant }), className)}
    >
      {compact ? (
        <Meter.Label className={labelClass({ variant })}>{label}</Meter.Label>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Meter.Label className={labelClass({ variant })}>{label}</Meter.Label>
          {pill}
        </div>
      )}
      <Meter.Track className={trackClass({ variant })}>
        <Meter.Indicator
          className={cn(
            "h-full rounded-full",
            threshold === undefined && "bg-usage",
            threshold?.status === "warning" && "bg-warning",
            threshold?.status === "critical" && "bg-critical",
          )}
        />
      </Meter.Track>
      {compact ? (
        <div className={figureRowClass}>
          {figure}
          {pill}
        </div>
      ) : (
        figure
      )}
    </Meter.Root>
  );
}

export { CapacityMeter };
export type { CapacityMeterProps, CapacityThreshold };
