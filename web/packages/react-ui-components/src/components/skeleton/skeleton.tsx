// SPDX-License-Identifier: GPL-3.0-or-later
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../utils";

// The neutral `muted` step on whatever ground it sits, as the table's skeleton rows. The pulse is
// `motion-safe:` only, and the base layer's reduced-motion rule stops any animation that slips
// through, so under `prefers-reduced-motion: reduce` the placeholder is static (style guide 4.5).
const skeletonClass = cva(
  "block rounded-sm bg-muted motion-safe:animate-pulse",
  {
    variants: {
      shape: {
        // One line of text at the line height of the text it stands in for: the box is `1lh` tall
        // and the bar is painted in its content box, so a skeleton row is as tall as the real row.
        line: "h-[1lh] w-full bg-clip-content py-[calc((1lh-0.75rem)/2)]",
        // A control, a meter or a picture: the caller sets the height (`h-8` for a text input).
        block: "w-full rounded-control",
      },
    },
    defaultVariants: { shape: "line" },
  },
);

type SkeletonProps = React.ComponentProps<"span"> &
  VariantProps<typeof skeletonClass>;

/**
 * A placeholder of the real size while the first read is in flight (style guide 5.2). Hidden from
 * assistive technology: the region it sits in carries `aria-busy` and a polite "Loading …" of its
 * own. Set the width of a `line` to the width of what it stands in for (`w-24` for a label).
 */
function Skeleton({ shape, className, ...props }: SkeletonProps) {
  return (
    <span
      data-slot="skeleton"
      data-shape={shape ?? "line"}
      aria-hidden="true"
      className={cn(skeletonClass({ shape }), className)}
      {...props}
    />
  );
}

export { Skeleton };
export type { SkeletonProps };
