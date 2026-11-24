// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";

// Heights follow the density (foundation 5): 28, 32 and 40px comfortable, 24, 28 and 36px compact,
// through `min-h-control-*`. A label wraps instead of overflowing at 320px or at 200% zoom (WCAG
// 1.4.10), so a long translation grows the button rather than spilling out of it. Every size clears
// the 24px target minimum (WCAG 2.5.8).
//
// Pressable looks pressable at rest (foundation 13): filled or outlined, with the resting depth of
// `shadow-control`. Pressing sinks it by a pixel in `duration-press`; under reduced motion every
// duration is 0, so the state changes without travel.
/** The button look, also for Base UI parts that render their own button (a toast action). */
export const buttonClass = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control border text-start font-medium select-none " +
    "transition-[color,background-color,border-color,box-shadow,translate,scale,background-size] duration-fast ease-standard " +
    "active:not-data-disabled:translate-y-px active:not-data-disabled:scale-[0.985] active:duration-press " +
    "data-disabled:cursor-not-allowed data-disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The one filled blue per view (style guide 2.1).
        primary:
          "border-transparent bg-primary text-primary-foreground shadow-control hover:bg-action-hover " +
          "data-disabled:bg-muted-strong data-disabled:text-subtle-foreground",
        // A neutral control: the edge is the control token, so it clears 3:1 on every ground.
        neutral:
          "border-input bg-surface text-foreground shadow-control hover:bg-muted-strong " +
          "data-popup-open:bg-muted-strong " +
          "data-disabled:border-transparent data-disabled:bg-muted-strong data-disabled:text-subtle-foreground",
        // An action in place: blue words, a neutral hover.
        ghost:
          "border-transparent bg-transparent text-action-label hover:bg-muted-strong data-popup-open:bg-muted-strong " +
          "data-disabled:bg-transparent data-disabled:text-subtle-foreground",
        // Only the confirm button of an irreversible act (style guide 3.6), with a verb. The red is a
        // fill painted as a background image, so the moment the act becomes possible (a typed name
        // matches) it fills from the start edge (foundation 7.2, destructive arm); unavailable, it is
        // an outline. Reduced motion: the fill appears.
        destructive:
          "border-transparent text-destructive-foreground shadow-control " +
          "bg-[linear-gradient(var(--theme-destructive),var(--theme-destructive))] bg-no-repeat bg-size-[100%_100%] bg-left rtl:bg-right duration-slow " +
          "data-disabled:border-input data-disabled:bg-size-[0%_100%] data-disabled:text-muted-foreground",
        // On the pending band: outlined in the coffee ink, the yellow stays the ground (5.8). The
        // hover inverts the pair (yellow on coffee, the same 8.31:1), so no unaudited tint appears.
        onPending:
          "border-pending-foreground bg-transparent text-pending-foreground hover:bg-pending-foreground hover:text-pending " +
          "focus-visible:outline-pending-foreground data-disabled:opacity-60 data-disabled:hover:bg-transparent data-disabled:hover:text-pending-foreground",
        // A control in ink with no fill: the top bar's indicators and menus, and other places where
        // a row of controls must stay quiet. Secondary ink at rest, a neutral ground on hover and
        // while its menu is open. It replaces the identity bar's variant (the bar is gone,
        // foundation 3.2).
        quiet:
          "border-transparent bg-transparent text-muted-foreground hover:bg-muted-strong hover:text-foreground " +
          "data-popup-open:bg-muted-strong data-popup-open:text-foreground data-disabled:opacity-60 data-disabled:hover:bg-transparent",
      },
      size: {
        sm: "min-h-control-sm px-2.5 py-0.5 text-sm",
        md: "min-h-control px-3.5 py-1 text-base",
        lg: "min-h-control-lg px-4 py-1.5 text-base",
        "icon-sm": "size-control-sm",
        icon: "size-control",
        "icon-lg": "size-control-lg",
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
