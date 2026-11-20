// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";

// Heights are minimums from the style guide (4.2): 28px in table toolbars, 32px by default, 40px on
// the sign-in form. A label wraps instead of overflowing at 320px or at 200% zoom (WCAG 1.4.10), so a
// long translation grows the button rather than spilling out of it. Every size clears the 24px
// target minimum (WCAG 2.5.8).
/** The button look, also for Base UI parts that render their own button (a toast action). */
export const buttonClass = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control border text-start font-medium select-none transition-colors " +
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
        // On the top bar: never a filled button (5.1). Ink on the identity ground (6.91:1 light,
        // 9.48:1 dark), an edge in the same ink on hover, and the bar's own focus ring.
        onIdentity:
          "border-transparent bg-transparent text-identity-foreground hover:border-identity-foreground " +
          "focus-visible:outline-focus-ring-on-identity data-popup-open:border-identity-foreground data-disabled:opacity-60",
      },
      size: {
        sm: "min-h-7 px-2.5 py-0.5 text-sm",
        md: "min-h-8 px-3 py-1 text-base",
        lg: "min-h-10 px-4 py-1.5 text-base",
        "icon-sm": "size-7",
        icon: "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

/**
 * A row of buttons: stacked full width under 640px, side by side from there (WCAG 1.4.10). DOM order
 * is reading and focus order, so Cancel comes before the act in both layouts.
 */
export const buttonRowClass =
  "flex flex-col gap-2 *:w-full sm:flex-row sm:flex-wrap sm:*:w-auto";
