// SPDX-License-Identifier: GPL-3.0-or-later
import { TriangleAlert } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

interface NoticeBannerProps extends React.ComponentProps<"section"> {
  /** The landmark's name: "Connection notice". */
  label: string;
  /** A neutral icon; the default is a triangle. There is no "info" colour (style guide 2.1). */
  icon?: React.ReactElement;
  /** A control or fixed link that helps, such as the HTTPS setting. */
  action?: React.ReactNode;
}

/**
 * A persistent, neutral band for a standing condition the reader should know about, such as an
 * unencrypted connection (UI-12). It is not dismissible and not a status: neutral ground, an icon,
 * plain words.
 */
function NoticeBanner({
  label,
  icon,
  action,
  className,
  children,
  ...props
}: NoticeBannerProps) {
  return (
    <section
      data-slot="notice-banner"
      aria-label={label}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-muted px-4 py-2 text-foreground sm:px-6",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="flex shrink-0 [&_svg]:size-4">
        {icon ?? <TriangleAlert />}
      </span>
      {/* A floor on the sentence's width, as on the pending band: a short action wraps to its own
          line on a narrow screen instead of squeezing the sentence into a column of single words. */}
      <p className="min-w-0 flex-1 basis-48">{children}</p>
      {action ? <div className="flex gap-2">{action}</div> : null}
    </section>
  );
}

export { NoticeBanner };
export type { NoticeBannerProps };
