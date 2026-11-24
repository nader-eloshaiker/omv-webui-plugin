// SPDX-License-Identifier: GPL-3.0-or-later
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Check } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { itemHighlightClass } from "./item-class";

/**
 * A list of actions on one object, on Base UI's Menu. Items are neutral: an item that destroys
 * something opens a confirmation, and only that dialog's button is red (style guide 3.6).
 */
const Menu = BaseMenu.Root;

/** The control that opens the menu. Pass `render` to use a `Button` or `IconButton`. */
const MenuTrigger = BaseMenu.Trigger;

/** The open menu. */
function MenuContent({
  className,
  align = "start",
  children,
  ...props
}: React.ComponentProps<typeof BaseMenu.Popup> & {
  align?: "start" | "center" | "end";
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        sideOffset={4}
        align={align}
        className="z-50 outline-hidden"
      >
        <BaseMenu.Popup
          data-slot="menu-content"
          className={cn(
            "min-w-44 rounded-card border border-border bg-popover p-1 text-popover-foreground shadow-floating outline-hidden",
            "transition-opacity duration-base data-ending-style:opacity-0 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

/** One action. Hover and keyboard highlight are the neutral `muted` step (shadcn `accent`). */
function MenuItem({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.Item>) {
  return (
    <BaseMenu.Item
      data-slot="menu-item"
      className={cn(
        "flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-base select-none",
        itemHighlightClass,
        "data-disabled:text-subtle-foreground",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.Separator>) {
  return (
    <BaseMenu.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

const MenuGroup = BaseMenu.Group;

function MenuGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.GroupLabel>) {
  return (
    <BaseMenu.GroupLabel
      className={cn(
        "px-2 py-1 text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

const itemLayoutClass =
  "flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-base select-none " +
  "data-disabled:text-subtle-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

/** An item that goes to an address (a fixed link written in code, UI-3). */
function MenuLinkItem({
  className,
  ...props
}: React.ComponentProps<typeof BaseMenu.LinkItem>) {
  return (
    <BaseMenu.LinkItem
      data-slot="menu-link-item"
      className={cn(itemLayoutClass, itemHighlightClass, className)}
      {...props}
    />
  );
}

/** One choice out of several (a preference such as the theme). Name it with a `MenuGroupLabel`. */
const MenuRadioGroup = BaseMenu.RadioGroup;

/** One choice in a `MenuRadioGroup`. The chosen one carries a check mark as well as `aria-checked`. */
function MenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseMenu.RadioItem>) {
  return (
    <BaseMenu.RadioItem
      data-slot="menu-radio-item"
      className={cn(
        itemLayoutClass,
        itemHighlightClass,
        "grid grid-cols-[1rem_1fr]",
        className,
      )}
      {...props}
    >
      <BaseMenu.RadioItemIndicator className="col-start-1 flex">
        <Check aria-hidden="true" className="text-action-label!" />
      </BaseMenu.RadioItemIndicator>
      <span className="col-start-2">{children}</span>
    </BaseMenu.RadioItem>
  );
}

export {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
};
