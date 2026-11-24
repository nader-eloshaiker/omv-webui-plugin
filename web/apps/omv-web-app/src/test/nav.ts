// SPDX-License-Identifier: GPL-3.0-or-later
// The side navigation folds its groups (foundation 10): only the current page's group starts open, so
// a test opens the group of a page before following its link, as a reader does.
import { fireEvent, screen, within } from "@testing-library/react";

/** The side navigation beside the content (the drawer's copy is not mounted until it opens). */
export const mainNav = (): HTMLElement =>
  screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;

/** Opens a folded group of the side navigation by its name ("Storage"); nothing if it is open. */
export function openNavGroup(name: string, nav: HTMLElement = mainNav()): void {
  const head = within(nav).getByRole("button", { name });
  if (head.getAttribute("aria-expanded") === "false") {
    fireEvent.click(head);
  }
}
