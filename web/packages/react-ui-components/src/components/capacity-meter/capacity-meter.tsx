// SPDX-License-Identifier: GPL-3.0-or-later
import { Meter } from "@base-ui/react/meter";
import type * as React from "react";
import { cn } from "../../utils";
import { StatusPill } from "../status/status";

interface CapacityThreshold {
  /** Which admin-configured threshold was crossed. */
  status: "warning" | "critical";
  /** The pill's word: "Warning", "Critical". */
  label: React.ReactNode;
}

interface CapacityMeterProps {
  /** What is measured: "File system: data". */
  label: React.ReactNode;
  value: number;
  max: number;
  /**
   * The numbers, always (style guide 5.6), formatted by the caller with units and tabular figures:
   * "2.2 TiB of 3.6 TiB (62%)". Also the meter's `aria-valuetext`.
   */
  valueText: string;
  /** Set when a configured threshold is crossed: a pill beside the figure, and only then a status fill. */
  threshold?: CapacityThreshold;
  className?: string;
}

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
  threshold,
  className,
}: CapacityMeterProps) {
  return (
    <Meter.Root
      data-slot="capacity-meter"
      value={value}
      max={max}
      getAriaValueText={() => valueText}
      className={cn("flex flex-col gap-1.5", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <Meter.Label className="text-base font-medium text-foreground">
          {label}
        </Meter.Label>
        {threshold ? (
          <StatusPill status={threshold.status}>{threshold.label}</StatusPill>
        ) : null}
      </div>
      <Meter.Track className="h-2 w-full overflow-hidden rounded-full border border-usage-track-edge bg-usage-track">
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
