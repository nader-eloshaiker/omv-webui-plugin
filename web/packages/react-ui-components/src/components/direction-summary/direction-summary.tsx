// SPDX-License-Identifier: GPL-3.0-or-later
import { ArrowRight } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

interface DirectionSummaryProps extends Omit<
  React.ComponentProps<"div">,
  "children"
> {
  /**
   * The whole direction in one sentence, with "from" and "to" in it, built by the caller's
   * translation so the language keeps its own word order: "Copies Photos from this NAS to
   * /srv/copies/photos on backup.example.org." It is what a screen reader relies on, and it is shown
   * in full under the line.
   */
  sentence: React.ReactNode;
  /** The side copied from: a shared folder's router link, or "path on host" in `Identifier`. */
  from: React.ReactNode;
  /** The side copied to, in the same forms. */
  to: React.ReactNode;
  /**
   * Short words before each side on the line, such as "From" and "To", so the line says its
   * direction in words as well as by the arrow and position (design 0.6). Recommended.
   */
  fromLabel?: React.ReactNode;
  toLabel?: React.ReactNode;
}

/**
 * A copy's direction (phase 5 services design 0.6, 18.2): a line "from → to" with the two sides,
 * then the caller's full sentence. The arrow is decorative (`aria-hidden`) and follows the text
 * direction, so in a right-to-left page it points left, from the side read first to the one read
 * second; the words carry the meaning, never the arrow, a colour or a position alone. Each side is
 * the caller's node (isolate a name with `dir="auto"`). The line wraps like text and nothing is cut
 * short, at 320px or with 200-character names. Pass `role="status"` to have a changing summary
 * announced.
 */
function DirectionSummary({
  sentence,
  from,
  to,
  fromLabel,
  toLabel,
  className,
  ...props
}: DirectionSummaryProps) {
  return (
    <div
      data-slot="direction-summary"
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    >
      <p
        data-slot="direction-summary-line"
        className="text-base font-medium [overflow-wrap:anywhere] text-foreground"
      >
        {fromLabel ? (
          <>
            <span className="font-regular text-muted-foreground">
              {fromLabel}
            </span>{" "}
          </>
        ) : null}
        <span data-slot="direction-summary-from">{from}</span>
        {/* Inline, so the line wraps as text does; a space each side keeps the break points. */}{" "}
        <ArrowRight
          aria-hidden="true"
          data-slot="direction-summary-arrow"
          className="mx-1 inline-block size-4 align-[-0.125em] text-muted-foreground rtl:-scale-x-100"
        />{" "}
        {toLabel ? (
          <>
            <span className="font-regular text-muted-foreground">
              {toLabel}
            </span>{" "}
          </>
        ) : null}
        <span data-slot="direction-summary-to">{to}</span>
      </p>
      <p
        data-slot="direction-summary-sentence"
        className="text-base [overflow-wrap:anywhere] text-foreground"
      >
        {sentence}
      </p>
    </div>
  );
}

export { DirectionSummary };
export type { DirectionSummaryProps };
