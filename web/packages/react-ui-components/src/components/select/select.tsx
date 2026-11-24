// SPDX-License-Identifier: GPL-3.0-or-later
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { controlClass } from "../field/control-class";
import { floatingListClass, itemHighlightClass } from "../menu/item-class";

// The floating surface shared by select and menu popups (menu/item-class.ts).
const popupClass = floatingListClass;

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
        "flex items-center justify-between gap-2 text-start shadow-control hover:bg-muted-strong data-popup-open:bg-muted-strong",
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
        "grid min-h-control cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-control py-1 ps-2.5 pe-3 text-base select-none",
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

/**
 * A named group of items, for a list long enough to need grouping (more than seven choices). The
 * group is labelled by its `SelectGroupLabel`, so assistive technology hears the group's name when
 * focus enters it. Arrow keys move through every group in order.
 */
function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof BaseSelect.Group>) {
  return (
    <BaseSelect.Group
      data-slot="select-group"
      className={cn(
        "flex flex-col not-first:mt-1 not-first:border-t not-first:border-border not-first:pt-1",
        className,
      )}
      {...props}
    />
  );
}

/** A group's heading: 12px capitals in the quiet ink, like a side-navigation group (4.1). */
function SelectGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof BaseSelect.GroupLabel>) {
  return (
    <BaseSelect.GroupLabel
      data-slot="select-group-label"
      className={cn(
        "px-2.5 pt-1.5 pb-1 text-xs font-semibold tracking-wide text-tertiary-foreground uppercase select-none",
        className,
      )}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectLabel,
  SelectTrigger,
};
export type { SelectTriggerProps };
