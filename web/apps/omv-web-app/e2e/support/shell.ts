// SPDX-License-Identifier: GPL-3.0-or-later
// The shell's folding navigation and shrinking pending band (foundation 10), for the browser tests:
// only the current page's group of the side navigation is open, so a test opens the group of a page
// before following its link, as a reader does; and the pending band shrinks into the top bar's pill
// once the page has scrolled, so a test brings it back, as a reader does, before using it. Shared by
// the mock and VM suites.
import { expect, type Page } from "@playwright/test";
import copy from "../../src/locales/en/common.json" with { type: "json" };

export type NavGroupKey = keyof typeof copy.nav.groups;

/** Opens a group of the side navigation if it is folded. */
export async function openNavGroup(page: Page, group: NavGroupKey) {
  const head = page
    .getByRole("navigation", { name: copy.app.navigation })
    .getByRole("button", { name: copy.nav.groups[group], exact: true });
  if ((await head.getAttribute("aria-expanded")) === "false") {
    await head.click();
  }
}

/**
 * Brings the pending band back out of the pill if the page had scrolled far enough to shrink it. Waits
 * for the band to be there first (up to `timeout`), since it appears after a save.
 */
export async function revealPendingBand(page: Page, timeout = 30_000) {
  const band = page.getByRole("region", { name: copy.pending.label });
  await band.waitFor({ state: "attached", timeout });
  if ((await band.getAttribute("data-shrunk")) !== null) {
    await page.locator('[data-slot="pending-pill"]').click();
    await expect(band).not.toHaveAttribute("data-shrunk");
  }
}
