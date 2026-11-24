// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";

interface EmptyPendingPictureProps extends React.ComponentProps<"div"> {
  /**
   * The words that teach the next step, beside the picture: "Nothing is waiting. When you save a
   * setting, it waits here until you apply it, so you can change several things and apply them
   * together."
   */
  children: React.ReactNode;
}

/**
 * The empty state of pending changes (foundation 9): a form, an arrow, and the gold band where
 * saved settings wait. Decorative; the words beside it say the same. Yellow here means what it
 * always means: saved but not applied.
 */
function EmptyPendingPicture({
  children,
  className,
  ...props
}: EmptyPendingPictureProps) {
  return (
    <div
      data-slot="empty-pending-picture"
      className={cn(
        "flex flex-wrap items-center gap-4 text-muted-foreground",
        className,
      )}
      {...props}
    >
      <svg
        aria-hidden="true"
        width="120"
        height="64"
        viewBox="0 0 120 64"
        className="shrink-0 rtl:-scale-x-100"
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect
          x="6"
          y="10"
          width="44"
          height="44"
          rx="6"
          className="fill-art-surface stroke-art-line"
        />
        <path
          d="M14 24h26M14 32h20M14 40h24"
          className="stroke-tertiary-foreground"
        />
        <path
          d="M56 32h18M68 26l6 6-6 6"
          className="stroke-tertiary-foreground"
        />
        <rect
          x="80"
          y="22"
          width="34"
          height="20"
          rx="5"
          className="fill-pending stroke-pending-stroke"
        />
        <path d="M86 32h14" className="stroke-pending-foreground" />
      </svg>
      <p className="min-w-0 flex-[1_1_16rem]">{children}</p>
    </div>
  );
}

export { EmptyPendingPicture };
export type { EmptyPendingPictureProps };
