// SPDX-License-Identifier: GPL-3.0-or-later
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";
import { cn } from "../../utils";

/**
 * Sub-navigation between the views of one page, each its own address (the Services page's SMB/CIFS,
 * NFS and SSH). Links, not ARIA tabs: each view is a route, so the browser's back button, a new tab
 * and a bookmark all work, and the current one says so with `aria-current="page"`. The row wraps on
 * a narrow screen rather than scrolling.
 */
function PageTabs({
  className,
  children,
  ...props
}: React.ComponentProps<"nav"> & { "aria-label": string }) {
  return (
    <nav data-slot="page-tabs" className={className} {...props}>
      <ul className="flex flex-wrap gap-x-1 gap-y-1 border-b border-border">
        {children}
      </ul>
    </nav>
  );
}

interface PageTabProps extends useRender.ComponentProps<"a"> {
  /** This view is the one shown: Sky's selected tint, `selected-label`, an underline bar and medium weight. */
  current?: boolean;
}

// The side navigation's current-item cues (5.1, 3.10), with its leading bar turned to an underline
// that sits on the row's own border. Hover is the neutral step. At least the density's control height.
const tabClass =
  "relative -mb-px flex min-h-control items-center rounded-t-control px-3.5 py-1.5 text-base text-muted-foreground " +
  "transition-colors duration-fast ease-standard hover:bg-muted-strong hover:text-foreground [overflow-wrap:anywhere] " +
  "aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:text-selected-label " +
  "aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-0 aria-[current=page]:after:bottom-0 " +
  "aria-[current=page]:after:h-0.5 aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-selected-mark aria-[current=page]:after:content-['']";

/** One view. Renders an `<a>`; pass `render` to use the router's link. */
function PageTab({
  current = false,
  render,
  className,
  ...props
}: PageTabProps) {
  const element = useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        "aria-current": current ? "page" : undefined,
        className: cn(tabClass, className),
      },
      props,
    ),
  });
  return <li data-slot="page-tab">{element}</li>;
}

export { PageTab, PageTabs };
export type { PageTabProps };
