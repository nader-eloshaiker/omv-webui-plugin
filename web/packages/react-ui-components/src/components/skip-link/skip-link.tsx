// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";

interface SkipLinkProps extends Omit<React.ComponentProps<"a">, "href"> {
  /** The id of the main content, which carries `tabIndex={-1}` so it can take focus. */
  targetId: string;
  /** "Skip to main content". */
  children: React.ReactNode;
}

/**
 * The first focusable element on every page (WCAG 2.4.1): hidden until it has keyboard focus, then
 * shown above the top bar, and it moves focus past the bar and the navigation to the main content.
 */
function SkipLink({ targetId, className, children, ...props }: SkipLinkProps) {
  return (
    <a
      data-slot="skip-link"
      href={`#${targetId}`}
      className={cn(
        "sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-2 focus-visible:top-2 focus-visible:z-70",
        "focus-visible:rounded-control focus-visible:bg-surface focus-visible:px-3 focus-visible:py-2 focus-visible:font-medium focus-visible:text-foreground focus-visible:shadow-floating",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export { SkipLink };
export type { SkipLinkProps };
