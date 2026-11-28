// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import { TriangleAlert } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

const noticeClass = cva(
  "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 text-foreground sm:px-6",
  {
    variants: {
      tone: {
        // A standing fact with no risk in it: the band is part of the frame.
        neutral: "border-b border-border bg-muted py-2",
        // A standing risk the person should act on (UI-12): on the raised ground, between two
        // rules in the warning stroke, with the warning icon and its first sentence in the warning
        // label, so it reads as a notice and not as the frame (owner, 2026-11-28). Its words and
        // marks are the warning family's pairs on the surface; there is no wash, since a wash is
        // never a status ground (style guide 3.10).
        warning: "border-y border-warning-stroke bg-surface py-3 compact:py-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

interface NoticeBannerProps extends Omit<
  React.ComponentProps<"section">,
  "title"
> {
  /** The landmark's name: "Connection notice". */
  label: string;
  /**
   * `neutral` (the default): a standing fact, part of the frame. `warning`: a standing risk the
   * person should act on, such as an unencrypted connection (UI-12).
   */
  tone?: "neutral" | "warning";
  /** The notice's first sentence, set apart: "This connection is not encrypted." */
  title?: React.ReactNode;
  /** The icon; the default is a triangle. A warning notice draws it in the warning stroke. */
  icon?: React.ReactElement;
  /** A control or fixed link that helps, such as the HTTPS setting. */
  action?: React.ReactNode;
}

/**
 * A persistent band under the top bar for a standing condition the reader should know about. It is
 * not dismissible. A `warning` notice carries the warning family's icon and label colour with its
 * words, never colour alone; a `neutral` one is plain words on the frame's ground.
 */
function NoticeBanner({
  label,
  tone = "neutral",
  title,
  icon,
  action,
  className,
  children,
  ...props
}: NoticeBannerProps) {
  const warning = tone === "warning";
  return (
    <section
      data-slot="notice-banner"
      data-tone={tone}
      aria-label={label}
      className={cn(noticeClass({ tone }), className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0",
          warning ? "text-warning-stroke [&_svg]:size-5" : "[&_svg]:size-4",
        )}
      >
        {icon ?? <TriangleAlert />}
      </span>
      {/* A floor on the sentence's width, as on the pending band: a short action wraps to its own
          line on a narrow screen instead of squeezing the sentence into a column of single words. */}
      <p className="min-w-0 flex-1 basis-48">
        {title ? (
          <>
            <span
              className={cn(
                "font-semibold",
                warning ? "text-warning-label" : "text-foreground",
              )}
            >
              {title}
            </span>{" "}
          </>
        ) : null}
        {children}
      </p>
      {action ? <div className="flex gap-2 font-medium">{action}</div> : null}
    </section>
  );
}

export { NoticeBanner };
export type { NoticeBannerProps };
