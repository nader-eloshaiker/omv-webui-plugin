// SPDX-License-Identifier: GPL-3.0-or-later
import { Dialog } from "@base-ui/react/dialog";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ExternalLink as ExternalIcon, X } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { IconButton } from "../button/button";
import { backdropClass } from "../dialog/dialog-classes";

/**
 * The side navigation (style guide 5.1), on `page`, grouped as OMV groups it. From 1024px it sits
 * beside the content; under 1024px the same groups go in a `SideNavDrawer`.
 */
function SideNav({
  className,
  ...props
}: React.ComponentProps<"nav"> & { "aria-label": string }) {
  return (
    <nav
      data-slot="side-nav"
      className={cn("flex flex-col gap-4 bg-page px-2 py-3", className)}
      {...props}
    />
  );
}

/** One group: System, Network, Storage, Services, Users, Diagnostics. */
function SideNavGroup({
  label,
  className,
  children,
}: {
  label: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div
      data-slot="side-nav-group"
      role="group"
      aria-labelledby={id}
      className={className}
    >
      <p
        id={id}
        className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

interface SideNavItemProps extends useRender.ComponentProps<"a"> {
  /** This item's page is the one shown: the blue tint, `action-label`, a leading bar, medium weight. */
  current?: boolean;
  /**
   * The page exists only in the classic interface for now: a short word ("Classic") and the external
   * mark, so the reader knows before following it that it leaves this interface.
   */
  classicOnly?: { label: string };
  /** A 16px icon before the label, decorative. */
  icon?: React.ReactElement;
}

const itemClass =
  "relative flex min-h-9 items-center gap-2 rounded-control px-3 py-1.5 text-base text-foreground hover:bg-muted " +
  "aria-[current=page]:bg-action/10 aria-[current=page]:font-medium aria-[current=page]:text-action-label " +
  "aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-1.5 aria-[current=page]:before:start-0 " +
  "aria-[current=page]:before:w-0.5 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-action aria-[current=page]:before:content-[''] " +
  "[&_svg]:size-4 [&_svg]:shrink-0";

/**
 * One destination. Renders an `<a>`; pass `render` to use the router's link. The current item carries
 * `aria-current="page"` and four cues besides colour (3.10, 5.1).
 */
function SideNavItem({
  current = false,
  classicOnly,
  icon,
  render,
  className,
  children,
  ...props
}: SideNavItemProps) {
  const element = useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        "aria-current": current ? "page" : undefined,
        className: cn(itemClass, className),
        children: (
          <>
            {icon ? (
              <span aria-hidden="true" className="flex">
                {icon}
              </span>
            ) : null}
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              {children}
            </span>
            {classicOnly ? (
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                {classicOnly.label}
                <ExternalIcon aria-hidden="true" className="size-3.5" />
              </span>
            ) : null}
          </>
        ),
      },
      props,
    ),
  });
  return <li data-slot="side-nav-item">{element}</li>;
}

interface SideNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The drawer's name: "Navigation". */
  label: string;
  /** The close control's name: "Close navigation". */
  closeLabel: string;
  /** The same `SideNavGroup`s as the wide layout. */
  children: React.ReactNode;
}

/**
 * The side navigation under 1024px: a modal drawer from the leading edge, on Base UI's Dialog, so
 * focus moves into it and back to the toggle, Escape closes it, and the page behind is inert. Focus
 * opens on the current page's item, or the first item: not on the close button, whose tooltip would
 * then take the first Escape.
 */
function SideNavDrawer({
  open,
  onOpenChange,
  label,
  closeLabel,
  children,
}: SideNavDrawerProps) {
  const navRef = React.useRef<HTMLElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={backdropClass} />
        <Dialog.Popup
          data-slot="side-nav-drawer"
          aria-label={label}
          initialFocus={() => {
            const nav = navRef.current;
            return (
              nav?.querySelector<HTMLElement>('[aria-current="page"]') ??
              nav?.querySelector<HTMLElement>("a[href], button") ??
              true
            );
          }}
          className={cn(
            "fixed inset-y-0 start-0 z-50 flex w-[min(18rem,85vw)] flex-col overflow-y-auto border-e border-border bg-page shadow-lg outline-hidden",
            "transition-transform duration-slow data-ending-style:-translate-x-full data-starting-style:-translate-x-full rtl:data-ending-style:translate-x-full rtl:data-starting-style:translate-x-full",
          )}
        >
          <div className="flex justify-end p-2">
            <Dialog.Close
              render={
                <IconButton label={closeLabel} icon={<X />} variant="ghost" />
              }
            />
          </div>
          <SideNav ref={navRef} aria-label={label} className="pt-0">
            {children}
          </SideNav>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { SideNav, SideNavDrawer, SideNavGroup, SideNavItem };
export type { SideNavDrawerProps, SideNavItemProps };
