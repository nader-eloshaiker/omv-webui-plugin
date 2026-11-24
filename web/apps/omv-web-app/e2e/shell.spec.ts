// SPDX-License-Identifier: GPL-3.0-or-later
// The shell of the new look (foundation 10 and 13) under the snippet's headers (UI-1), which enforce
// Trusted Types: the command palette and jump keys (Base UI's Dialog and Autocomplete), the folding
// navigation (Collapsible), the density switch (Toggle), page changes in a view transition, the
// pending band shrinking into the pill and coming back, and the drawer at 390px. Any CSP violation,
// console error, page error or request to another origin fails a test (support/fixtures.ts).
import type { Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import { expect, test } from "./support/fixtures.ts";

// Typed into the mock only; no real system is involved.
const PASSWORD = "not-a-real-password";

async function signIn(page: Page) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
}

const navigation = (page: Page) =>
  page.getByRole("navigation", { name: copy.app.navigation });

test("the palette, the jump keys, the folding groups and density, by keyboard", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("authenticated");
  rpc.withPendingChanges();
  await signIn(page);

  // "/" opens the palette; typing narrows it; Enter goes, in a view transition where there is one.
  await page.keyboard.press("/");
  const input = page.getByRole("combobox", { name: copy.palette.input });
  await expect(input).toBeFocused();
  await expect(
    page.getByRole("option", {
      name: new RegExp(copy.palette.apply_other.replace("{{count}}", "2")),
    }),
  ).toBeVisible();
  await page.keyboard.type(copy.nav.items.storage.disks);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ui\/storage\/disks$/);
  await expect(
    page.getByRole("heading", { level: 1, name: copy.disks.title }),
  ).toBeFocused();
  // The current page's group opened by itself.
  await expect(
    navigation(page).getByRole("button", {
      name: copy.nav.groups.storage,
      exact: true,
    }),
  ).toHaveAttribute("aria-expanded", "true");

  // g then o: back to the dashboard; Storage folds again.
  await page.keyboard.press("g");
  await page.keyboard.press("o");
  await expect(page).toHaveURL(/\/ui\/$/);
  await expect(
    navigation(page).getByRole("button", {
      name: copy.nav.groups.storage,
      exact: true,
    }),
  ).toHaveAttribute("aria-expanded", "false");

  // Any group opens from its name.
  const services = navigation(page).getByRole("button", {
    name: copy.nav.groups.services,
    exact: true,
  });
  await services.focus();
  await page.keyboard.press("Enter");
  await expect(
    navigation(page).getByRole("link", { name: copy.nav.items.services.ssh }),
  ).toBeVisible();

  // Density: a stored preference, on <html>.
  const density = page.getByRole("button", { name: copy.density.label });
  await density.click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await density.click();
  await expect(page.locator("html")).not.toHaveAttribute("data-density");
});

test("the pending band shrinks into the pill while scrolling, and the pill brings it back", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("authenticated");
  rpc.withPendingChanges();
  await page.setViewportSize({ width: 1280, height: 480 });
  await signIn(page);
  const band = page.getByRole("region", { name: copy.pending.label });
  const pill = page.getByRole("button", {
    name: copy.pending.indicator_other.replace("{{count}}", "2"),
  });
  await expect(band).not.toHaveAttribute("data-shrunk");
  await page.mouse.wheel(0, 1200);
  await expect(band).toHaveAttribute("data-shrunk", "true");
  await pill.click();
  await expect(band).not.toHaveAttribute("data-shrunk");
  await expect(band).toBeFocused();
  await expect(
    band.getByRole("button", {
      name: copy.pending.apply_other.replace("{{count}}", "2"),
    }),
  ).toBeVisible();
});

test("at 390px the navigation is a drawer, opening on the current page's group", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("authenticated");
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole("button", { name: copy.app.openNav }).click();
  const drawer = page.getByRole("dialog", { name: copy.app.navigation });
  await expect(drawer).toBeVisible();
  await drawer
    .getByRole("button", { name: copy.nav.groups.storage, exact: true })
    .click();
  await drawer
    .getByRole("link", { name: copy.nav.items.storage["shared-folders"] })
    .click();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/\/ui\/storage\/shared-folders$/);
  await page.getByRole("button", { name: copy.app.openNav }).click();
  await expect(
    page
      .getByRole("dialog", { name: copy.app.navigation })
      .getByRole("link", { name: copy.nav.items.storage["shared-folders"] }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: copy.app.navigation }),
  ).toHaveCount(0);
});
