// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";

interface CopyDirectionProps extends Omit<
  React.ComponentProps<"div">,
  "children"
> {
  /** Where files are copied from: a folder's name, or "path on host". */
  from: React.ReactNode;
  /** Where they go. */
  to: React.ReactNode;
  /**
   * The direction as one sentence, for screen readers, built by the caller's translation so the
   * language keeps its own order: "Copies Photos to backup.example.org".
   */
  sentence: string;
  /** When it runs, quieter, after the picture: "Every night at 02:00". */
  detail?: React.ReactNode;
}

/**
 * Which way a copy goes (foundation 9): from, an arrow, to. A dash travels from source to destination
 * twice on arrival, then rests as a plain arrow: the job is not running, so it never loops. At once
 * under reduced motion. The arrow is in the reading direction, and mirrored in right-to-left.
 */
function CopyDirection({
  from,
  to,
  sentence,
  detail,
  className,
  ...props
}: CopyDirectionProps) {
  const chip =
    "min-w-0 rounded-full bg-muted-strong px-2.5 py-0.5 font-semibold text-foreground [overflow-wrap:anywhere]";
  return (
    <div
      data-slot="copy-direction"
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1.5", className)}
      {...props}
    >
      <p className="sr-only">{sentence}</p>
      <span aria-hidden="true" className={chip}>
        {from}
      </span>
      <svg
        aria-hidden="true"
        width="64"
        height="16"
        viewBox="0 0 64 16"
        className="shrink-0 rtl:-scale-x-100"
        fill="none"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 8h56" className="stroke-art-line" />
        <path d="M2 8h56" className="travel-dash stroke-trace" />
        <path d="M52 3l7 5-7 5" className="stroke-art-line" />
      </svg>
      <span aria-hidden="true" className={chip}>
        {to}
      </span>
      {detail ? (
        <span className="text-caption text-tertiary-foreground">{detail}</span>
      ) : null}
    </div>
  );
}

export { CopyDirection };
export type { CopyDirectionProps };
