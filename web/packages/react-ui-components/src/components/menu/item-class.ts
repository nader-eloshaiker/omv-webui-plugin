// SPDX-License-Identifier: GPL-3.0-or-later
// The highlighted item of a menu or select list, by keyboard or pointer: the neutral ground (shadcn
// `accent`) plus a 2px focus-ring outline drawn inside the item. The ground alone is 1.25:1 against
// the popup, which is not a visible focus indicator (style guide 4.6, WCAG 2.4.7); the ring clears 3:1
// on every ground.
export const itemHighlightClass =
  "outline-hidden data-highlighted:bg-accent data-highlighted:text-accent-foreground " +
  "data-highlighted:outline-2 data-highlighted:-outline-offset-2 data-highlighted:outline-focus-ring";
