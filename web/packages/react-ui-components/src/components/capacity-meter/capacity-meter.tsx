// SPDX-License-Identifier: GPL-3.0-or-later
import { Meter } from "@base-ui/react/meter";
import { cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../utils";
import { filledCells, ratioOf } from "../chart-model/chart-model";
import { StatusIcon, StatusLabel } from "../status/status";

interface CapacityThreshold {
  /** Which admin-configured threshold was crossed. */
  status: "warning" | "critical";
  /** The status word: "Warning", "Critical". */
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
  /** Set when a configured threshold is crossed: a status label beside the figure, and only then the status colour on the amount. */
  threshold?: CapacityThreshold;
  /**
   * In compact density (`data-density="compact"`) the bar is drawn as cells, so the amount can be
   * counted (foundation 8): 40 by default, 24 in the `compact` variant. Pass 24 or 40 to choose.
   */
  cells?: 24 | 40;
  /**
   * `default`: the label with the figure and any status beside it, the bar under them, for a card or a
   * details page.
   * `compact`: for a table cell in a 36px row. The label is visually hidden but still names the
   * meter (the column header shows it), the bar and the figure share one line with the status beside
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
      default: "flex-col gap-2",
      compact: "flex-col gap-1 sm:flex-row sm:items-center sm:gap-3",
    },
  },
  defaultVariants: { variant: "default" },
});

// Filled, never outlined (style guide 5.6): the rest of the whole is the `usage-empty` slate, which
// clears 3:1 against the amount, and there is no edge round it. In compact density the track gives way
// to its cells, the empty ones in the same slate, a little taller.
const trackClass = cva(
  "relative h-2 w-full overflow-hidden rounded-full bg-usage-empty " +
    "compact:h-2.5 compact:overflow-visible compact:rounded-none compact:bg-transparent",
  {
    variants: {
      // On one line with the figure, the bar takes the room the figure leaves, and never less than 4rem.
      variant: { default: "", compact: "sm:min-w-16 sm:flex-1" },
    },
    defaultVariants: { variant: "default" },
  },
);

// The figure, and in compact form the status beside it. Beside the bar it keeps its own width while
// there is room, and wraps (the status first) rather than push the cell wider when there is not.
const figureRowClass = "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1";

// The amount: the usage blue, or past a threshold the status stroke, only with its status label. The
// stroke, not the fill: the warning fill falls under 3:1 on the empty part in light and the critical
// fill in dark. It grows from zero on entrance and glides to a new value (foundation 7.2); both land
// at once under reduced motion.
const fillClass = cva(
  "h-full rounded-full transition-[width] duration-glide ease-standard animate-grow-x ltr:origin-left rtl:origin-right compact:hidden",
  {
    variants: {
      tone: {
        usage: "bg-usage",
        warning: "bg-warning-stroke",
        critical: "bg-critical-stroke",
      },
    },
    defaultVariants: { tone: "usage" },
  },
);

const cellClass = cva("h-full min-w-0 flex-1 rounded-[1px]", {
  variants: {
    tone: {
      usage: "bg-usage",
      warning: "bg-warning-stroke",
      critical: "bg-critical-stroke",
      empty: "bg-usage-empty",
    },
  },
});

/** The segmented form, shown only in compact density: whole cells, so the amount can be counted. */
function MeterCells({
  ratio,
  cells,
  tone,
}: {
  ratio: number;
  cells: number;
  tone: "usage" | "warning" | "critical";
}) {
  const filled = filledCells(ratio, cells);
  return (
    <span
      aria-hidden="true"
      data-slot="capacity-meter-cells"
      className="absolute inset-0 hidden gap-0.5 compact:flex"
    >
      {Array.from({ length: cells }, (_, i) => (
        <span
          key={i}
          className={cellClass({ tone: i < filled ? tone : "empty" })}
        />
      ))}
    </span>
  );
}

/**
 * How full something is (style guide 5.6, foundation 8), on Base UI's Meter (`role="meter"` with its
 * values). Filled, never outlined: the amount is the usage blue, the rest the `usage-empty` slate. Crossing
 * a threshold adds a Warning or Critical status label, and only with that label does the amount take
 * the status colour. The numbers are always beside it. In compact density it is segmented into cells.
 */
function CapacityMeter({
  label,
  value,
  max,
  valueText,
  loading = false,
  threshold,
  cells,
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
            // Loading: the skeleton step, still, so it never reads as empty. No reading: hollow and
            // dashed in the Unknown stroke, as the ring and the Unknown icon, never an empty track.
            loading
              ? "bg-muted-strong compact:bg-muted-strong"
              : "border border-dashed border-unknown-stroke bg-transparent",
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
  const statusLabel = threshold ? (
    <StatusLabel status={threshold.status}>{threshold.label}</StatusLabel>
  ) : null;
  const figure = (
    <p className="text-sm text-muted-foreground tabular-nums">{valueText}</p>
  );
  const tone = threshold?.status ?? "usage";
  const content = (
    <>
      {compact ? (
        <Meter.Label className={labelClass({ variant })}>{label}</Meter.Label>
      ) : (
        // The numbers beside the label (foundation 8), the status between them; they wrap under the
        // label when the card is narrow.
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Meter.Label className={labelClass({ variant })}>{label}</Meter.Label>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {statusLabel}
            {figure}
          </div>
        </div>
      )}
      <Meter.Track className={trackClass({ variant })}>
        <Meter.Indicator className={fillClass({ tone })} />
        <MeterCells
          ratio={ratioOf(value, max)}
          cells={cells ?? (compact ? 24 : 40)}
          tone={tone}
        />
      </Meter.Track>
      {compact ? (
        <div className={figureRowClass}>
          {figure}
          {statusLabel}
        </div>
      ) : null}
    </>
  );
  return (
    <Meter.Root
      data-slot="capacity-meter"
      data-variant={variant}
      value={value}
      max={max}
      getAriaValueText={() => valueText}
      className={cn(rootClass({ variant }), className)}
      // Base UI appends a visually hidden `<span role="presentation">x</span>` after the children so
      // that NVDA announces the label of a meter holding no visible text of its own. This meter always
      // holds visible text that is not its label (the figure), so the span only adds an "x" to the
      // accessibility tree and to the text content. Rendering the element with these children, and
      // not the ones Base UI composed, keeps every ARIA attribute and drops the span.
      render={(props) => <div {...props}>{content}</div>}
    />
  );
}

export { CapacityMeter };
export type { CapacityMeterProps, CapacityThreshold };
