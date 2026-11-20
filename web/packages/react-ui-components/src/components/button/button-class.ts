// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";

// Heights are the style guide's (4.2): 28px in table toolbars, 32px by default, 40px on the sign-in
// form. Every size clears the 24px target minimum (WCAG 2.5.8).
/** The button look, for Base UI parts that render their own button (a toast action). */
export const buttonClass = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control border font-medium whitespace-nowrap select-none transition-colors " +
    "data-disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The one filled blue per view (style guide 2.1).
        primary:
          "border-transparent bg-primary text-primary-foreground hover:bg-action-hover " +
          "data-disabled:bg-muted data-disabled:text-subtle-foreground",
        // A neutral control: the edge is the control token, so it clears 3:1 on every ground.
        neutral:
          "border-input bg-surface text-foreground hover:bg-muted " +
          "data-disabled:border-transparent data-disabled:bg-muted data-disabled:text-subtle-foreground",
        // An action in place: blue words, a neutral hover.
        ghost:
          "border-transparent bg-transparent text-action-label hover:bg-muted " +
          "data-disabled:bg-transparent data-disabled:text-subtle-foreground",
        // Only the confirm button of an irreversible act (style guide 3.6), with a verb.
        destructive:
          "border-transparent bg-destructive text-destructive-foreground " +
          "data-disabled:bg-muted data-disabled:text-subtle-foreground",
        // On the pending band: outlined in the coffee ink, the yellow stays the ground (5.8). The
        // hover inverts the pair (yellow on coffee, the same 8.31:1), so no unaudited tint appears.
        onPending:
          "border-pending-foreground bg-transparent text-pending-foreground hover:bg-pending-foreground hover:text-pending " +
          "focus-visible:outline-pending-foreground data-disabled:opacity-60 data-disabled:hover:bg-transparent data-disabled:hover:text-pending-foreground",
      },
      size: {
        sm: "h-7 px-2.5 text-sm",
        md: "h-8 px-3 text-base",
        lg: "h-10 px-4 text-base",
        "icon-sm": "size-7",
        icon: "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
