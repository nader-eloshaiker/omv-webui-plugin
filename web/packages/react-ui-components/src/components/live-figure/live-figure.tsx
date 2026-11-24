// SPDX-License-Identifier: GPL-3.0-or-later
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../utils";
import { useGlide } from "../motion/motion";

const figureClass = cva(
  // `font-readout` is Inter, and Roboto Mono in compact density (foundation 4 and 5).
  "inline-flex items-baseline font-readout whitespace-nowrap text-foreground tabular-nums",
  {
    variants: {
      size: {
        /** The big live value of a tile or a capacity card: 30px, 26px compact. */
        figure: "text-figure",
        /** A readout in a table or a list. */
        readout: "text-lg font-semibold",
        /** A figure inside running text. */
        inline: "text-base font-medium",
      },
    },
    defaultVariants: { size: "figure" },
  },
);

const unitClass = cva(
  "ms-[0.3em] font-sans font-medium tracking-normal text-muted-foreground",
  {
    variants: {
      size: {
        figure: "text-caption",
        readout: "text-sm",
        inline: "text-sm",
      },
    },
    defaultVariants: { size: "figure" },
  },
);

interface LiveFigureProps
  extends
    Omit<React.ComponentProps<"span">, "children">,
    VariantProps<typeof figureClass> {
  /** The newest reading; `null` when the sample has none, which is said in words, never as 0. */
  value: number | null;
  /** The number as text, without its unit: `(v) => v.toFixed(1)`. Called for every glide frame. */
  format: (value: number) => string;
  /** The unit, smaller beside the figure: "MiB/s", "%". */
  unit?: React.ReactNode;
  /** The words for a missing reading: "No reading". */
  missing: React.ReactNode;
}

/**
 * A live number (foundation 7.2, "value glide"): tabular figures that ease to each new reading over
 * the glide token, so it says that it changed and by how much without jittering; at once under
 * reduced motion. A screen reader hears the reading itself, not the frames of the glide. Monospaced
 * in compact density.
 */
function LiveFigure({
  value,
  format,
  unit,
  missing,
  size,
  className,
  ...props
}: LiveFigureProps) {
  const shown = useGlide(value);
  if (value === null || shown === null) {
    return (
      <span
        data-slot="live-figure"
        data-state="missing"
        className={cn(
          "inline-flex items-baseline text-base font-medium text-muted-foreground",
          className,
        )}
        {...props}
      >
        {missing}
      </span>
    );
  }
  return (
    <span
      data-slot="live-figure"
      className={cn(figureClass({ size }), className)}
      {...props}
    >
      <span aria-hidden="true">
        {format(shown)}
        {unit ? <span className={unitClass({ size })}>{unit}</span> : null}
      </span>
      <span className="sr-only">
        {format(value)}
        {unit ? <> {unit}</> : null}
      </span>
    </span>
  );
}

export { LiveFigure };
export type { LiveFigureProps };
