// SPDX-License-Identifier: GPL-3.0-or-later
import { Progress } from "@base-ui/react/progress";
import { cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../utils";

type ProgressBarSize = "default" | "compact";

/**
 * The bar's name: the visible `label`, or, when the surroundings already show what runs (a table row's
 * reason sentence), an `aria-label` or `aria-labelledby`. Exactly one, so a visible label is never
 * overridden by a different spoken one.
 */
type ProgressBarName =
  | {
      /** Visible label above the bar: "Synchronising RAID md0". */
      label: React.ReactNode;
      "aria-label"?: never;
      "aria-labelledby"?: never;
    }
  | { label?: never; "aria-label": string; "aria-labelledby"?: never }
  | { label?: never; "aria-label"?: never; "aria-labelledby": string };

type ProgressBarProps = Omit<
  React.ComponentProps<"div">,
  | "children"
  | "role"
  | "aria-label"
  | "aria-labelledby"
  | "aria-valuetext"
  | "aria-valuenow"
  | "aria-valuemin"
  | "aria-valuemax"
> &
  ProgressBarName & {
    /** `0..max`, or `null` for indeterminate (a check whose progress is not known). */
    value: number | null;
    /** Defaults to 100. */
    max?: number;
    /**
     * The figures in words, formatted by the caller: "45.0% done, about 2 hours left", or for an
     * indeterminate bar "Working…". Always shown as text under the bar (never in a tooltip) and used
     * as `aria-valuetext`.
     */
    valueText: string;
    /**
     * `default`: for a card, a page or a running job. `compact`: fits a 36px table row under the
     * reason sentence, with a thinner track and smaller figures.
     */
    size?: ProgressBarSize;
  };

const rootClass = cva("flex min-w-0 flex-col", {
  variants: { size: { default: "gap-1.5", compact: "gap-1" } },
  defaultVariants: { size: "default" },
});

const labelClass = cva("font-medium text-foreground", {
  variants: { size: { default: "text-base", compact: "text-sm" } },
  defaultVariants: { size: "default" },
});

const trackClass = cva(
  "w-full overflow-hidden rounded-full border border-usage-track-edge bg-usage-track",
  {
    variants: { size: { default: "h-2", compact: "h-1.5" } },
    defaultVariants: { size: "default" },
  },
);

const valueTextClass = cva(
  "min-w-0 text-muted-foreground tabular-nums [overflow-wrap:anywhere]",
  {
    variants: { size: { default: "text-sm", compact: "text-xs" } },
    defaultVariants: { size: "default" },
  },
);

/**
 * How far a task has got (style guide 5.7), on Base UI's Progress (`role="progressbar"` with its
 * values). The bar is the usage blue on the usage track, as the capacity meter's. With `value: null`
 * the bar is indeterminate: a third-width bar that pulses only when motion is allowed, and stands
 * still under `prefers-reduced-motion`. The figures are always visible as text.
 */
function ProgressBar({
  value,
  max = 100,
  valueText,
  label,
  size = "default",
  className,
  ...props
}: ProgressBarProps) {
  const content = (
    <>
      {label === undefined ? null : (
        <Progress.Label className={labelClass({ size })}>
          {label}
        </Progress.Label>
      )}
      <Progress.Track className={trackClass({ size })}>
        <Progress.Indicator className="h-full rounded-full bg-usage transition-[width] duration-glide ease-standard data-indeterminate:w-1/3 data-indeterminate:motion-safe:animate-breathe" />
      </Progress.Track>
      <span data-slot="progress-bar-value" className={valueTextClass({ size })}>
        {valueText}
      </span>
    </>
  );
  return (
    <Progress.Root
      data-slot="progress-bar"
      data-size={size}
      {...props}
      value={value}
      max={max}
      getAriaValueText={() => valueText}
      className={cn(rootClass({ size }), className)}
      // Base UI appends a visually hidden `<span role="presentation">x</span>` so that NVDA announces
      // the label of a bar holding no visible text of its own. This bar always holds its figures as
      // visible text, so the span would only add an "x" to the accessibility tree and the text
      // content. Rendering the element with these children keeps every ARIA attribute and drops it.
      render={(rootProps) => <div {...rootProps}>{content}</div>}
    />
  );
}

export { ProgressBar };
export type { ProgressBarProps, ProgressBarSize };
