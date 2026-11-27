// SPDX-License-Identifier: GPL-3.0-or-later
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../utils";

interface TopBarProps extends Omit<React.ComponentProps<"header">, "children"> {
  /** The product mark, name and host: a `TopBarBrand`. */
  brand: React.ReactNode;
  /** The control that opens the navigation drawer under 1024px. Hidden from 1024px. */
  navToggle?: React.ReactNode;
  /** "Go to or do…": the command palette's trigger (`CommandPaletteTrigger`). */
  search?: React.ReactNode;
  /** The density switch (`DensityToggle`). */
  density?: React.ReactNode;
  /** The pending pill (`PendingPill`), for administrators. */
  pending?: React.ReactNode;
  /** The tasks menu: running and recently ended tasks. */
  tasks?: React.ReactNode;
  /** The account menu. */
  user?: React.ReactNode;
}

/**
 * The top bar (foundation 10): on the solid page ground with a hairline under it, never painted sky
 * blue (3.2) and never frosted or blurred (style guide 10). It sticks to the top of the window, and
 * the solid ground keeps it legible over any content scrolling under it. Sky blue is only its
 * accent: the mark and the focus ring. Its controls are `variant="plain"`: ink with no fill, the
 * ordinary focus ring. It is named for the page-change view transition, so it stays still while the
 * page changes.
 */
function TopBar({
  brand,
  navToggle,
  search,
  density,
  pending,
  tasks,
  user,
  className,
  ...props
}: TopBarProps) {
  return (
    <header
      data-slot="top-bar"
      className={cn(
        "sticky top-0 z-40 flex h-15 items-center gap-2 border-b border-border bg-page px-2 text-foreground sm:gap-3 sm:px-4 lg:px-5 compact:h-13",
        "[view-transition-name:shell-top]",
        className,
      )}
      {...props}
    >
      {navToggle ? <div className="flex lg:hidden">{navToggle}</div> : null}
      {brand}
      <span className="flex-1" />
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        {search}
        {density}
        {pending}
        {tasks}
        {user}
      </div>
    </header>
  );
}

const brandNameClass = cva("shrink-0 text-section whitespace-nowrap", {
  variants: {
    /**
     * `bar`: in the top bar, where under 640px the mark stands for the name (it stays the link's
     * name for assistive technology). `panel`: the drawer's head, which has room for it.
     */
    layout: { bar: "sr-only sm:not-sr-only", panel: "" },
  },
  defaultVariants: { layout: "bar" },
});

interface TopBarBrandProps
  extends useRender.ComponentProps<"a">, VariantProps<typeof brandNameClass> {
  /** The product name, as text. */
  productName: React.ReactNode;
  /** The NAS's host name, from the backend, in the mono face and the secondary ink. Hidden under
   * 768px; truncates first. Plain text beside the name, not a chip. */
  hostName?: string;
}

/**
 * The product mark, name and host. Renders an `<a>` (to the dashboard); pass `render` to use the
 * router's link. The mark is a drawing of two drive caddies with their handles, in the brand blue on
 * its tint: generic, not the project's logo artwork (this is an unofficial community plugin).
 */
function TopBarBrand({
  productName,
  hostName,
  layout,
  render,
  className,
  ...props
}: TopBarBrandProps) {
  return useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        className: cn(
          "flex min-w-0 items-center gap-2.5 rounded-control py-1 pe-2 text-foreground no-underline",
          className,
        ),
        children: (
          <>
            <ProductMark />
            <span className={brandNameClass({ layout })}>{productName}</span>
            {hostName ? (
              <span className="hidden min-w-0 truncate font-mono text-sm text-muted-foreground md:inline">
                {hostName}
              </span>
            ) : null}
          </>
        ),
      },
      props,
    ),
  });
}

/** The mark: decorative, the name beside it says what it is. */
function ProductMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="product-mark"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-control bg-selected text-brand shadow-control",
        className,
      )}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="16" height="5" rx="1.6" />
        <rect x="2" y="12" width="16" height="5" rx="1.6" />
        <path d="M5.5 5.5h3M5.5 14.5h3" />
      </svg>
    </span>
  );
}

export { ProductMark, TopBar, TopBarBrand };
export type { TopBarBrandProps, TopBarProps };
