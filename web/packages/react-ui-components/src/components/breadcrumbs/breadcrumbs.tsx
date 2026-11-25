// SPDX-License-Identifier: GPL-3.0-or-later
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import * as React from "react";
import { cn } from "../../utils";

interface BreadcrumbItemProps extends useRender.ComponentProps<"a"> {
  /**
   * @deprecated The current page is no longer shown: the page title says where you are, so an item
   * marked `current` renders nothing. Leave it out and pass only the parent page's item.
   */
  current?: boolean;
}

/** The nearest ancestor among the children: the last element child that is not marked `current`. */
function nearestAncestor(children: React.ReactNode) {
  const items = React.Children.toArray(children).filter(
    (child): child is React.ReactElement<BreadcrumbItemProps> =>
      React.isValidElement<BreadcrumbItemProps>(child) &&
      child.props.current !== true,
  );
  return items.at(-1);
}

/**
 * The way back up from a page below the second level of the menu (style guide 5.1): one plain link
 * to the parent page, above the page title ("Shared folders"). There is no separator and no
 * current-page crumb; the title below says where you are. It is a `nav` named by the caller's
 * translated "Breadcrumb".
 *
 * Pass the parent page as the one `BreadcrumbItem`. A caller that still passes a full trail compiles
 * and shows only its nearest ancestor: the items above it and an item marked `current` are not
 * rendered. Nothing is rendered when there is no ancestor to link to.
 */
function Breadcrumbs({
  className,
  children,
  ...props
}: React.ComponentProps<"nav"> & { "aria-label": string }) {
  const parent = nearestAncestor(children);
  if (parent === undefined) {
    return null;
  }
  return (
    <nav
      data-slot="breadcrumbs"
      className={cn("min-w-0 text-sm", className)}
      {...props}
    >
      {parent}
    </nav>
  );
}

const linkClass =
  "rounded-sm text-link underline underline-offset-2 hover:no-underline [overflow-wrap:anywhere]";

/**
 * The parent page's link. Renders an `<a>`; pass `render` to use the router's link. An item marked
 * `current` (deprecated) renders nothing.
 */
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
      {
        "data-slot": "breadcrumb-item",
        className: cn(linkClass, className),
        children,
      } as React.ComponentProps<"a">,
      props,
    ),
    enabled: !current,
  });
  return current ? null : element;
}

export { BreadcrumbItem, Breadcrumbs };
export type { BreadcrumbItemProps };
