// SPDX-License-Identifier: GPL-3.0-or-later
// The Phase 3 pages in the production build, under the snippet's headers (UI-1, Trusted Types
// enforced), on the contract's examples: the dashboard with the set-up checklist, the SSH form saved
// and applied, the shared-folders table, and a normal user's account. Each page is walked with the
// keyboard: its controls are reached by Tab in reading order. Any CSP or Trusted Types violation,
// console error, page error or request to another origin fails a test (support/fixtures.ts).
import type { Locator, Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import { expect, test } from "./support/fixtures.ts";
import { openNavGroup, revealPendingBand } from "./support/shell.ts";

// Typed into the mock only; no real system is involved.
const PASSWORD = "not-a-real-password";
const NEW_PASSWORD = "another-made-up-password";

const navigation = (page: Page) =>
  page.getByRole("navigation", { name: copy.app.navigation });

async function signIn(page: Page, username: string) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill(username);
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
}

/**
 * Tab from the page title through the main content, and return the accessible names reached, in
 * order, until focus leaves the main region.
 */
async function tabThroughMain(page: Page, limit = 120): Promise<string[]> {
  await page.locator("main h1").focus();
  const names: string[] = [];
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press("Tab");
    const reached = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || !element.closest("main")) {
        return null;
      }
      const label =
        element.getAttribute("aria-label") ??
        (element.id
          ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
              ?.textContent
          : null) ??
        element.closest("label")?.textContent ??
        element.textContent ??
        "";
      return label.replace(/\s+/g, " ").trim();
    });
    if (reached === null) {
      break;
    }
    names.push(reached);
  }
  return names;
}

/** `expected` appear in `names`, in this order (other stops may sit between them). */
function expectInOrder(
  names: string[],
  expected: readonly (string | RegExp)[],
) {
  let from = 0;
  for (const want of expected) {
    const at = names.findIndex(
      (name, i) =>
        i >= from &&
        (typeof want === "string" ? name === want : want.test(name)),
    );
    expect(
      at,
      `"${String(want)}" is reached by Tab, after the stops before it`,
    ).toBeGreaterThanOrEqual(0);
    from = at + 1;
  }
}

async function pressUntilFocused(page: Page, locator: Locator, limit = 60) {
  for (let i = 0; i < limit; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement)) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(locator).toBeFocused();
}

test("an administrator's dashboard: the cards and the set-up checklist, by keyboard", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("authenticated");
  await signIn(page, "example-admin");
  const checklist = page.getByRole("region", { name: copy.checklist.title });
  await expect(checklist).toBeVisible();
  await expect(checklist.getByRole("listitem")).toHaveCount(6);
  await expect(
    page.getByRole("region", { name: copy.dashboard.system.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: copy.dashboard.live.title }),
  ).toBeVisible();

  const names = await tabThroughMain(page);
  expectInOrder(names, [
    /^Check Date and time in the classic interface/,
    copy.checklist.hide,
    /^Open Web interface settings in the classic interface/,
    /^Open Notifications in the classic interface/,
    /^Open Updates in the classic interface/,
    /^Review updates in the classic interface/,
    copy.dashboard.system.technical,
  ]);

  // Hiding asks first, with focus on Cancel; Escape closes the dialog and nothing is sent.
  await pressUntilFocused(
    page,
    checklist.getByRole("button", { name: copy.checklist.hide }),
  );
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", {
    name: copy.checklist.hideTitle,
  });
  await expect(
    dialog.getByRole("button", { name: copy.checklist.hideCancel }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(rpc.calls).not.toContain("WebGui.dismissWelcomeMessage");
});

test("an administrator changes an SSH setting by keyboard, saves it and applies it", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("authenticated");
  await signIn(page, "example-admin");
  await openNavGroup(page, "services");
  await navigation(page)
    .getByRole("link", { name: copy.nav.items.services.ssh })
    .click();
  const title = page.getByRole("heading", { level: 1, name: copy.ssh.title });
  await expect(title).toBeFocused();

  const names = await tabThroughMain(page);
  expectInOrder(names, [
    copy.ssh.enable,
    copy.ssh.port,
    copy.ssh.password,
    copy.ssh.key,
    copy.ssh.root,
    copy.ssh.forwarding,
    copy.ssh.compression,
    copy.ssh.advanced,
    copy.common.save,
    copy.common.discard,
  ]);

  const compress = page.getByRole("checkbox", { name: copy.ssh.compression });
  await pressUntilFocused(page, compress);
  await page.keyboard.press("Space");
  await expect(compress).toBeChecked();
  await pressUntilFocused(
    page,
    page.getByRole("button", { name: copy.common.save, exact: true }),
  );
  await page.keyboard.press("Enter");
  await expect(page.getByText(copy.ssh.saved)).toBeVisible();
  expect(rpc.calls).toContain("SSH.set");
  await expect(page.getByText(copy.pending.itemMark)).toBeVisible();

  const band = page.getByRole("region", { name: copy.pending.label });
  const apply = copy.pending.apply_other.replace("{{count}}", "2");
  await revealPendingBand(page);
  await band.getByRole("button", { name: apply }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: apply })
    .click();
  await expect(band).toHaveCount(0);
  await expect(page.getByText(copy.pending.itemMark)).toHaveCount(0);
});

test("an administrator reads, sorts and searches the shared folders by keyboard", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("authenticated");
  await signIn(page, "example-admin");
  await openNavGroup(page, "storage");
  await navigation(page)
    .getByRole("link", { name: copy.nav.items.storage["shared-folders"] })
    .click();
  const table = page.getByRole("table", {
    name: copy.sharedFolders.tableLabel,
  });
  await expect(table.getByRole("row", { name: /a4share/ })).toBeVisible();

  const names = await tabThroughMain(page);
  expectInOrder(names, [
    copy.sharedFolders.search,
    /^Add a shared folder/,
    copy.sharedFolders.col.name,
    copy.sharedFolders.col.status,
    // The header's footnote marker follows its words.
    new RegExp(`^${copy.sharedFolders.col.used}`),
    copy.sharedFolders.copyPath.replace("{{name}}", "a4share"),
    copy.sharedFolders.refresh,
  ]);

  const status = table.getByRole("button", {
    name: copy.sharedFolders.col.status,
  });
  await pressUntilFocused(page, status);
  await page.keyboard.press("Enter");
  await expect(
    table.getByRole("columnheader", { name: copy.sharedFolders.col.status }),
  ).toHaveAttribute("aria-sort", "ascending");

  const search = page.getByRole("searchbox", {
    name: copy.sharedFolders.search,
  });
  await search.focus();
  await page.keyboard.type("nothing-like-this");
  await expect(
    page.getByText(
      copy.sharedFolders.filteredEmpty.replace(
        "{{search}}",
        "nothing-like-this",
      ),
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(table.getByRole("row", { name: /a4share/ })).toBeVisible();
});

test("a normal user changes their password on Your account, by keyboard", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("authenticatedUser");
  await signIn(page, "example-user");
  await openNavGroup(page, "account");
  await expect(
    navigation(page).getByRole("link", {
      name: copy.nav.items.account.settings,
    }),
  ).toBeVisible();
  await navigation(page)
    .getByRole("link", { name: copy.nav.items.account.settings })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.account.title }),
  ).toBeFocused();

  const names = await tabThroughMain(page);
  expectInOrder(names, [
    copy.account.comment,
    copy.account.email,
    copy.account.saveDetails,
    copy.common.discard,
    copy.account.newPassword,
    copy.account.showPassword,
    copy.account.repeatPassword,
    copy.account.showPassword,
    copy.account.changePassword,
  ]);

  const fresh = page.getByLabel(copy.account.newPassword, { exact: true });
  await pressUntilFocused(page, fresh);
  await page.keyboard.type(NEW_PASSWORD);
  await page.getByLabel(copy.account.repeatPassword).fill(NEW_PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page.getByText(copy.account.passwordChangedLine)).toBeVisible();
  await expect(fresh).toHaveValue("");
  expect(rpc.calls).toContain("UserMgmt.setPasswordByContext");
  expect(await page.content()).not.toContain(NEW_PASSWORD);

  // An administrator's page by its address: refused, and no call to it.
  await page.goto("/ui/storage/shared-folders");
  await expect(page.getByText(copy.adminOnly.body)).toBeVisible();
  expect(rpc.calls).not.toContain("ShareMgmt.getList");
});
