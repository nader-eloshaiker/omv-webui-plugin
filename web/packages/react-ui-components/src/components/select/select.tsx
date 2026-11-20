// SPDX-License-Identifier: GPL-3.0-or-later
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { controlClass } from "../field/control-class";
import { itemHighlightClass } from "../menu/item-class";

// The floating surface shared by select and menu popups: raised (shadow-md), a card corner.
const popupClass =
  "rounded-card border border-border bg-popover p-1 text-popover-foreground shadow-md outline-hidden " +
  "transition-opacity duration-base data-ending-style:opacity-0 data-starting-style:opacity-0";

/**
 * A choice from a short fixed list, on Base UI's Select. Inside a `Field`, the field's label names it;
 * elsewhere use `SelectLabel`. Pass `items` so the trigger shows the chosen item's words.
 */
const Select = BaseSelect.Root;

/** Names the select when it is not inside a Field. */
function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof BaseSelect.Label>) {
  return (
    <BaseSelect.Label
      className={cn("text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

interface SelectTriggerProps extends React.ComponentProps<
  typeof BaseSelect.Trigger
> {
  /** Shown while nothing is chosen. An example, never the label (5.3). */
  placeholder?: React.ReactNode;
}

/** The closed select: looks like an input, opens the list. */
function SelectTrigger({
  className,
  placeholder,
  ...props
}: SelectTriggerProps) {
  return (
    <BaseSelect.Trigger
      data-slot="select-trigger"
      className={cn(
        controlClass,
        "flex items-center justify-between gap-2 text-start hover:bg-muted data-popup-open:bg-muted",
        className,
      )}
      {...props}
    >
      <BaseSelect.Value
        className="truncate data-placeholder:text-subtle-foreground"
        placeholder={placeholder}
      />
      <BaseSelect.Icon className="flex text-muted-foreground">
        <ChevronsUpDown aria-hidden="true" className="size-4" />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  );
}

/** The open list. */
function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseSelect.Popup>) {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner sideOffset={4} className="z-50 outline-hidden">
        <BaseSelect.Popup
          data-slot="select-content"
          className={cn(popupClass, "min-w-(--anchor-width)", className)}
          {...props}
        >
          <BaseSelect.List className="max-h-(--available-height) overflow-y-auto">
            {children}
          </BaseSelect.List>
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

/** One choice. The chosen one carries a check mark as well as its position. */
function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseSelect.Item>) {
  return (
    <BaseSelect.Item
      data-slot="select-item"
      className={cn(
        "grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-control py-1.5 ps-2 pe-3 text-base select-none",
        itemHighlightClass,
        "data-disabled:text-subtle-foreground",
        className,
      )}
      {...props}
    >
      <BaseSelect.ItemIndicator className="col-start-1 flex text-action-label">
        <Check aria-hidden="true" className="size-4" />
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText className="col-start-2">
        {children}
      </BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectLabel, SelectTrigger };
export type { SelectTriggerProps };
