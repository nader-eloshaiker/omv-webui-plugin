// SPDX-License-Identifier: GPL-3.0-or-later
import { Collapsible } from "@base-ui/react/collapsible";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronRight } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

/**
 * Content shown on request: an "Advanced" part of a form, a full SSH key, a long comment. On Base UI's
 * Collapsible, which gives the trigger `aria-expanded` and `aria-controls` and opens with Enter and
 * Space. `open` / `defaultOpen` / `onOpenChange` as the primitive.
 */
function Disclosure({
  className,
  ...props
}: React.ComponentProps<typeof Collapsible.Root>) {
  return (
    <Collapsible.Root
      data-slot="disclosure"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

const triggerClass = cva(
  "inline-flex w-fit items-center gap-1 rounded-sm text-start select-none " +
    "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-fast " +
    "data-panel-open:[&_svg]:rotate-90 rtl:[&_svg]:-scale-x-100 rtl:data-panel-open:[&_svg]:-rotate-90 " +
    "data-disabled:cursor-not-allowed data-disabled:text-subtle-foreground",
  {
    variants: {
      variant: {
        // A part of a form or a page: "Advanced". Medium weight in the main ink; it acts in place, so
        // it hovers with the neutral step, not a colour (style guide 2.1).
        section:
          "-mx-1.5 min-h-7 rounded-control px-1.5 font-medium text-foreground hover:bg-muted",
        // A toggle inside running content: "Show full key", "Show all". The action blue, like a link.
        inline: "min-h-6 text-sm text-action-label hover:underline",
      },
    },
    defaultVariants: { variant: "section" },
  },
);

type DisclosureTriggerProps = React.ComponentProps<typeof Collapsible.Trigger> &
  VariantProps<typeof triggerClass>;

/**
 * The button that opens and closes it, with a chevron that turns. Its words say what is inside, and
 * any count goes in the words ("Advanced (2 lines set)"), so a closed part still says it holds
 * something. At least 24px tall (WCAG 2.5.8).
 */
function DisclosureTrigger({
  variant,
  className,
  children,
  ...props
}: DisclosureTriggerProps) {
  return (
    <Collapsible.Trigger
      data-slot="disclosure-trigger"
      className={cn(triggerClass({ variant }), className)}
      {...props}
    >
      <ChevronRight aria-hidden="true" />
      <span>{children}</span>
    </Collapsible.Trigger>
  );
}

/**
 * What it shows. Kept mounted while closed (hidden with the `hidden` attribute) by default, so a
 * form field inside keeps what was typed; pass `keepMounted={false}` for content that is costly to
 * render. There is no height animation: it would need `overflow: hidden`, which clips the focus ring
 * of the fields inside (style guide 4.6).
 */
function DisclosurePanel({
  className,
  keepMounted = true,
  ...props
}: React.ComponentProps<typeof Collapsible.Panel>) {
  return (
    <Collapsible.Panel
      data-slot="disclosure-panel"
      keepMounted={keepMounted}
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

export { Disclosure, DisclosurePanel, DisclosureTrigger };
export type { DisclosureTriggerProps };
