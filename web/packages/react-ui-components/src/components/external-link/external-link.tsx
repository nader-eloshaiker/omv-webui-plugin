// SPDX-License-Identifier: GPL-3.0-or-later
import { ExternalLink as ExternalIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

interface ExternalLinkProps extends Omit<
  React.ComponentProps<"a">,
  "target" | "rel"
> {
  /** A fixed address written in the app's code, never one from the server or the URL (UI-3). */
  href: string;
  /** Appended to the link's name for assistive technology: "(opens in a new tab)". */
  newTabLabel: string;
}

/**
 * A link that leaves the interface (the classic interface, upstream documentation). It opens in a new
 * tab with `rel="noopener noreferrer"` and says so twice: the external mark for the eye and
 * `newTabLabel` for assistive technology (style guide 7.3).
 */
function ExternalLink({
  newTabLabel,
  className,
  children,
  ...props
}: ExternalLinkProps) {
  return (
    <a
      data-slot="external-link"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-sm text-action-label underline underline-offset-2 hover:no-underline",
        className,
      )}
      {...props}
    >
      {children}
      <ExternalIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="sr-only">{newTabLabel}</span>
    </a>
  );
}

export { ExternalLink };
export type { ExternalLinkProps };
