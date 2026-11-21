// SPDX-License-Identifier: GPL-3.0-or-later
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ChevronRight } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

/**
 * Where a page sits below the second level of the menu (style guide 5.1): a `nav` named by the
 * caller's translated "Breadcrumb", an ordered list of links to the pages above, and the current page
 * last, as text. The row wraps on a narrow screen; a long device path breaks anywhere.
 */
function Breadcrumbs({
  className,
  children,
  ...props
}: React.ComponentProps<"nav"> & { "aria-label": string }) {
  return (
    <nav data-slot="breadcrumbs" className={className} {...props}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        {children}
      </ol>
    </nav>
  );
}

interface BreadcrumbItemProps extends useRender.ComponentProps<"a"> {
  /** The page shown: plain text with `aria-current="page"`, not a link. */
  current?: boolean;
}

const linkClass =
  "rounded-sm text-action-label underline underline-offset-2 hover:no-underline [overflow-wrap:anywhere]";

/** One level. Renders an `<a>`; pass `render` to use the router's link. The current page is text. */
function BreadcrumbItem({
  current = false,
  render,
  className,
  children,
  ...props
}: BreadcrumbItemProps) {
  const element = useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      { className: cn(linkClass, className), children },
      props,
    ),
  });
  return (
    <li
      data-slot="breadcrumb-item"
      className="flex min-w-0 items-center gap-1.5"
    >
      {current ? (
        <span
          aria-current="page"
          className={cn(
            "min-w-0 text-foreground [overflow-wrap:anywhere]",
            className,
          )}
        >
          {children}
        </span>
      ) : (
        <>
          {element}
          <ChevronRight
            aria-hidden="true"
            data-slot="breadcrumb-separator"
            className="size-3.5 shrink-0"
          />
        </>
      )}
    </li>
  );
}

export { BreadcrumbItem, Breadcrumbs };
export type { BreadcrumbItemProps };
