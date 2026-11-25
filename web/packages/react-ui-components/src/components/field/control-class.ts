// SPDX-License-Identifier: GPL-3.0-or-later
import { cva, type VariantProps } from "class-variance-authority";

// The look shared by text inputs and select triggers. The edge is the control token, which clears 3:1
// on every ground; a refused value also takes the critical stroke, beside its message (style guide 5.3).
// The height follows the density (`h-control`: 32px, 28px compact). A field is recessed, not raised,
// so it takes no resting shadow; hover darkens its edge toward the ink.
export const controlClass =
  "h-control w-full min-w-0 rounded-control border border-input bg-surface px-3 text-base text-foreground " +
  "transition-[border-color,background-color] duration-fast ease-standard hover:not-data-disabled:border-muted-foreground " +
  "placeholder:text-subtle-foreground data-invalid:border-critical-stroke aria-invalid:border-critical-stroke " +
  "data-disabled:cursor-not-allowed data-disabled:bg-muted data-disabled:text-subtle-foreground";

// Fields are sized to what they hold (owner, 2026-11-25: no long input for a short string). Each
// step is the width of its content in `ch` of the control's own font, plus its padding and edge
// (1.625rem), so the step reads as "this many characters". Never wider than its column, so on a
// narrow screen a field grows to the column and stops there. Only free text takes the column, and a
// form's column is itself capped at a readable measure (`FormColumn`, 640px).
//   code     10ch  a short code, a date or a time in its format: a VLAN ID, an MTU, 03:00, 2026-11-25
//   number    8ch  a number with its unit beside it: a port, a count, a percentage, a size
//   address  16ch  an IPv4 address or a netmask (255.255.255.255)
//   name     24ch  names, user names, passwords, a workgroup, a host name
//   wide     40ch  an IPv6 address, an email address, a domain or a web address
//   full           the column: descriptions, paths, comments, lists
export const fieldWidthClass = cva("max-w-full", {
  variants: {
    width: {
      code: "w-[calc(10ch+1.625rem)]",
      number: "w-[calc(8ch+1.625rem)]",
      address: "w-[calc(16ch+1.625rem)]",
      name: "w-[calc(24ch+1.625rem)]",
      wide: "w-[calc(40ch+1.625rem)]",
      full: "w-full",
    },
  },
  defaultVariants: { width: "full" },
});

/** How wide a field is, by what it holds. */
export type FieldWidth = NonNullable<
  VariantProps<typeof fieldWidthClass>["width"]
>;
