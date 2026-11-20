// SPDX-License-Identifier: GPL-3.0-or-later
import { Meter } from "@base-ui/react/meter";
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
  className?: string;
}

const labelClass = "text-base font-medium text-foreground";
const trackClass =
  "h-2 w-full overflow-hidden rounded-full border border-usage-track-edge bg-usage-track";

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
  className,
}: CapacityMeterProps) {
  if (loading || value === null) {
    // Not a meter: there is no value to report, so there is no `role="meter"` claiming one.
    return (
      <div
        data-slot="capacity-meter"
        data-state={loading ? "loading" : "unknown"}
        aria-busy={loading || undefined}
        className={cn("flex flex-col gap-1.5", className)}
      >
        <p className={labelClass}>{label}</p>
        <div
          aria-hidden="true"
          className={cn(
            trackClass,
            loading ? "motion-safe:animate-pulse" : "border-dashed",
          )}
        />
        <p
          role={loading ? "status" : undefined}
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
  return (
    <Meter.Root
      data-slot="capacity-meter"
      value={value}
      max={max}
      getAriaValueText={() => valueText}
      className={cn("flex flex-col gap-1.5", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Meter.Label className={labelClass}>{label}</Meter.Label>
        {threshold ? (
          <StatusPill status={threshold.status}>{threshold.label}</StatusPill>
        ) : null}
      </div>
      <Meter.Track className={trackClass}>
        <Meter.Indicator
          className={cn(
            "h-full rounded-full",
            threshold === undefined && "bg-usage",
            threshold?.status === "warning" && "bg-warning",
            threshold?.status === "critical" && "bg-critical",
          )}
        />
      </Meter.Track>
      <p className="text-sm text-muted-foreground tabular-nums">{valueText}</p>
    </Meter.Root>
  );
}

export { CapacityMeter };
export type { CapacityMeterProps, CapacityThreshold };
