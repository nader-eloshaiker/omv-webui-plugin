// SPDX-License-Identifier: GPL-3.0-or-later
// The highlighted item of a menu or select list, by keyboard or pointer: the neutral ground (shadcn
// `accent`) plus a 2px focus-ring outline drawn inside the item. The ground alone is not a visible
// focus indicator against the popup (style guide 4.6, WCAG 2.4.7); the ring clears 3:1 on every
// ground.
export const itemHighlightClass =
  "outline-hidden data-highlighted:bg-accent data-highlighted:text-accent-foreground " +
  "data-highlighted:outline-2 data-highlighted:-outline-offset-2 data-highlighted:outline-focus-ring";

// A floating list (menu, select): the floating surface with the card corner, opening from where it
// was pressed and settling in on the enter curve; it leaves faster than it came (foundation 7.1).
export const floatingListClass =
  "rounded-card surface-floating p-1.5 text-popover-foreground outline-hidden origin-(--transform-origin) " +
  "transition-[opacity,scale] duration-base ease-enter data-starting-style:scale-95 data-starting-style:opacity-0 " +
  "data-ending-style:scale-95 data-ending-style:opacity-0 data-ending-style:duration-fast data-ending-style:ease-exit";

// One row of a floating list: at least the control height of the density.
export const listItemClass =
  "flex min-h-control cursor-default items-center gap-2 rounded-control px-2.5 py-1 text-base select-none";
