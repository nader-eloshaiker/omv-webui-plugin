// SPDX-License-Identifier: GPL-3.0-or-later
import { Collapsible } from "@base-ui/react/collapsible";
import { Dialog } from "@base-ui/react/dialog";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ChevronDown, ExternalLink as ExternalIcon, X } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { IconButton } from "../button/button";
import { backdropClass } from "../dialog/dialog-classes";
import { keepTabInside } from "../dialog/keep-tab-inside";

/**
 * The side navigation (foundation 10, Sky's sidebar): Overview, then OMV's groups as OMV groups them,
 * each a folding group. The current page's group is open and the others fold; any can be opened, so
 * the list scales to every page and to what plugins add without becoming one long column. From
 * 1024px it sits beside the content, sticky under the top bar; under 1024px the same groups go in a
 * `SideNavDrawer`. It is named for the page-change view transition, so it stays still.
 */
function SideNav({
  className,
  ...props
}: React.ComponentProps<"nav"> & { "aria-label": string }) {
  return (
    <nav
      data-slot="side-nav"
      className={cn("flex flex-col gap-1 px-3 py-2", className)}
      {...props}
    />
  );
}

/** A list of items outside any group: the Overview entry at the top, an "Add-ons" entry at the foot. */
function SideNavList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="side-nav-list"
      className={cn("flex flex-col gap-px", className)}
      {...props}
    />
  );
}

interface SideNavGroupProps {
  /** The group's name: System, Network, Storage, Services, Users, Diagnostics. */
  label: React.ReactNode;
  /** A 16px icon before the name, decorative. */
  icon?: React.ReactElement;
  /**
   * The current page is in this group: its name takes the selected blue, and it opens whenever it
   * becomes current and folds when it stops being current (the reader may open or fold it between).
   */
  current?: boolean;
  /**
   * Open even when not current, and when it stops being current (a role that sees only this group).
   */
  defaultOpen?: boolean;
  /** Controlled open state; leave out to let the group follow `current` and the reader. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  /** `SideNavItem`s. */
  children: React.ReactNode;
}

/**
 * One folding group, on Base UI's Collapsible: the name is a button with `aria-expanded` that opens
 * and folds the group's pages; the pages slide open on the soft spring. A folded group's pages stay
 * in the document as `hidden="until-found"`, so the browser's find in page still finds a page and
 * opens its group.
 */
function SideNavGroup({
  label,
  icon,
  current = false,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  className,
  children,
}: SideNavGroupProps) {
  const id = React.useId();
  const [own, setOwn] = React.useState(current || defaultOpen);
  const [wasCurrent, setWasCurrent] = React.useState(current);
  // Follow the current page: open when the group becomes current, fold when it stops (during
  // render, so the first frame after a navigation already shows it).
  if (current !== wasCurrent) {
    setWasCurrent(current);
    setOwn(current || defaultOpen);
  }
  const open = openProp ?? own;
  return (
    <Collapsible.Root
      data-slot="side-nav-group"
      data-current={current || undefined}
      open={open}
      onOpenChange={(next) => {
        setOwn(next);
        onOpenChange?.(next);
      }}
      role="group"
      aria-labelledby={id}
      className={cn("group/nav-group", className)}
    >
      <Collapsible.Trigger
        className={cn(
          "flex min-h-9 w-full items-center gap-2.5 rounded-control px-2.5 py-1.5 text-start font-semibold text-foreground compact:min-h-8 compact:py-1",
          "transition-colors hover:bg-muted-strong",
          "group-data-current/nav-group:text-selected-label",
          "[&_svg]:size-4 [&_svg]:shrink-0",
        )}
      >
        {icon ? (
          <span
            aria-hidden="true"
            className="flex text-muted-foreground group-data-current/nav-group:text-selected-label"
          >
            {icon}
          </span>
        ) : null}
        <span id={id} className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="text-tertiary-foreground transition-[rotate] duration-base ease-settle group-data-[open]/nav-group:rotate-180"
        />
      </Collapsible.Trigger>
      <Collapsible.Panel
        hiddenUntilFound
        className={cn(
          "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-slow ease-soft",
          "data-ending-style:h-0 data-starting-style:h-0 [&[hidden]:not([hidden='until-found'])]:hidden",
        )}
      >
        <ul className="ms-[1.1875rem] flex flex-col gap-px border-s border-border ps-2 pe-1 pt-1 pb-2">
          {children}
        </ul>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

interface SideNavItemProps extends useRender.ComponentProps<"a"> {
  /**
   * This item's page is the one shown: Sky's selected tint, `selected-label` and a heavier weight,
   * besides `aria-current` (style guide 3.10). No leading bar (style guide 10).
   */
  current?: boolean;
  /**
   * The page exists only in the classic interface for now: in the secondary ink, with a short word ("Classic")
   * and the external mark, so the reader knows before following it that it leaves this interface.
   */
  classicOnly?: { label: string };
  /** A 16px icon before the label, decorative. */
  icon?: React.ReactElement;
}

const itemClass =
  "relative flex min-h-8 items-center gap-2 rounded-control px-2.5 py-1 font-medium text-muted-foreground no-underline compact:min-h-7 compact:py-0.5 " +
  "transition-colors hover:bg-muted-strong hover:text-foreground " +
  "aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:text-selected-label " +
  "[&_svg]:size-4 [&_svg]:shrink-0";

/**
 * One destination. Renders an `<a>`; pass `render` to use the router's link. The current item carries
 * `aria-current="page"`.
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
        className: cn(
          itemClass,
          classicOnly && "text-tertiary-foreground hover:text-foreground",
          className,
        ),
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
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-tertiary-foreground">
                {classicOnly.label}
                <ExternalIcon aria-hidden="true" className="size-3" />
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
  /** Shown at the drawer's head beside the close control: the `TopBarBrand`. */
  brand?: React.ReactNode;
  /** The same groups as the wide layout. */
  children: React.ReactNode;
}

/**
 * The side navigation under 1024px: a modal drawer from the leading edge, on Base UI's Dialog, so
 * focus moves into it and back to the toggle, Tab and Shift+Tab cycle inside it (`keepTabInside`),
 * Escape closes it, and the page behind is hidden from assistive technology. Focus opens on the
 * current page's item, or the first item: not on the close button, whose tooltip would then take the
 * first Escape. It slides in on the enter curve and out on the exit curve.
 */
function SideNavDrawer({
  open,
  onOpenChange,
  label,
  closeLabel,
  brand,
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
          onKeyDown={keepTabInside}
          initialFocus={() => {
            const nav = navRef.current;
            return (
              nav?.querySelector<HTMLElement>('[aria-current="page"]') ??
              nav?.querySelector<HTMLElement>("a[href], button") ??
              true
            );
          }}
          className={cn(
            "fixed inset-y-0 start-0 z-50 flex w-[min(20rem,88vw)] flex-col overflow-y-auto rounded-e-card surface-floating outline-hidden",
            "transition-transform duration-slow ease-enter data-ending-style:-translate-x-full data-ending-style:duration-base data-ending-style:ease-exit data-starting-style:-translate-x-full",
            "rtl:data-ending-style:translate-x-full rtl:data-starting-style:translate-x-full",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
            {brand ?? <span />}
            <Dialog.Close
              render={
                <IconButton label={closeLabel} icon={<X />} variant="plain" />
              }
            />
          </div>
          <SideNav ref={navRef} aria-label={label} className="pb-6">
            {children}
          </SideNav>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { SideNav, SideNavDrawer, SideNavGroup, SideNavItem, SideNavList };
export type { SideNavDrawerProps, SideNavGroupProps, SideNavItemProps };
