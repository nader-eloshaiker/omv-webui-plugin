// SPDX-License-Identifier: GPL-3.0-or-later
// The Phase 5 dashboard and Diagnostics pages in the production build, under the snippet's headers
// (UI-1, Trusted Types enforced), on the contract's examples: the four new dashboard cards and a disk
// check on request, a log read and searched by keyboard, the process list paused, and the service
// tabs. Any CSP or Trusted Types violation, console error, page error or request to another origin
// fails a test (support/fixtures.ts). Each page is also shown at 320 CSS px without sideways scroll.
import type { Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import { expect, test } from "./support/fixtures.ts";

// Typed into the mock only; no real system is involved.
const PASSWORD = "not-a-real-password";

const navigation = (page: Page) =>
  page.getByRole("navigation", { name: copy.app.navigation });

async function signIn(page: Page) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
}

/** The page does not scroll sideways at 320 CSS px; wide content scrolls inside its own frame. */
async function expectNoSidewaysScroll(page: Page) {
  await page.setViewportSize({ width: 320, height: 800 });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, "the page scrolls sideways at 320px").toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 720 });
}

test("the dashboard's new cards, and disk health only when asked", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("authenticated");
  await signIn(page);
  for (const name of [
    copy.dashboard.storage.title,
    copy.dashboard.disks.title,
    copy.dashboard.services.title,
    copy.dashboard.network.title,
    copy.dashboard.usage.title,
    copy.dashboard.system.title,
  ]) {
    await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  }
  const storage = page.getByRole("region", {
    name: copy.dashboard.storage.title,
  });
  await expect(storage.getByRole("meter")).toHaveCount(2);
  await expect(
    page
      .getByRole("region", { name: copy.dashboard.network.title })
      .getByText("enp2s0"),
  ).toBeVisible();
  await expect(page.getByText(copy.dashboard.chart.notEnough)).toBeVisible();
  expect(rpc.calls).not.toContain("Smart.getListBg");

  const disks = page.getByRole("region", { name: copy.dashboard.disks.title });
  const check = disks.getByRole("button", { name: copy.dashboard.disks.check });
  await check.focus();
  await page.keyboard.press("Enter");
  await expect(
    disks.getByText("4 of 5 disks: Unknown", { exact: true }),
  ).toBeVisible();
  await expect(
    disks.getByRole("button", { name: copy.dashboard.disks.checkAgain }),
  ).toBeFocused();
  expect(rpc.calls.filter((c) => c === "Smart.getListBg")).toHaveLength(1);
  await expectNoSidewaysScroll(page);
});

test("an administrator chooses a log by keyboard, searches it, and reads it only once", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("authenticated");
  await signIn(page);
  await navigation(page)
    .getByRole("link", { name: copy.nav.items.diagnostics["system-logs"] })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.logs.title }),
  ).toBeFocused();
  expect(rpc.calls).not.toContain("LogFile.getList");

  const picker = page.getByRole("combobox", { name: copy.logs.picker });
  await picker.focus();
  await page.keyboard.press("Enter");
  // Arrowing through the list reads nothing; only the choice does.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect(rpc.calls).not.toContain("LogFile.getList");
  await page.getByRole("option", { name: copy.logs.id.syslog }).click();
  const table = page.getByRole("table", {
    name: copy.logs.tableLabel.replace("{{log}}", copy.logs.id.syslog),
  });
  await expect(table.getByRole("row")).toHaveCount(6);
  expect(rpc.calls.filter((c) => c === "LogFile.getList")).toHaveLength(1);

  const search = page.getByRole("searchbox", { name: copy.logs.search });
  await search.focus();
  await page.keyboard.type("no-such-words");
  await expect(
    page.getByText(
      copy.logs.filteredEmpty.replace("{{search}}", "no-such-words"),
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(table.getByRole("row")).toHaveCount(6);
  expect(rpc.calls.filter((c) => c === "LogFile.getList")).toHaveLength(1);

  // At 320px the message column keeps a readable width; the table's own frame scrolls sideways.
  await page.setViewportSize({ width: 320, height: 800 });
  const message = table.locator('tbody td [dir="auto"]').first();
  const width = await message.evaluate(
    (el) => el.getBoundingClientRect().width,
  );
  expect(width, "the message column at 320px").toBeGreaterThanOrEqual(280);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expectNoSidewaysScroll(page);
});

test("the process list, paused and resumed", async ({ page, rpc }) => {
  rpc.loginWith("authenticated");
  await signIn(page);
  await navigation(page)
    .getByRole("link", { name: copy.nav.items.diagnostics.processes })
    .click();
  const table = page.getByRole("table", { name: copy.processes.tableLabel });
  await expect(table.getByRole("row", { name: /systemd/ })).toBeVisible();
  const pause = page.getByRole("button", { name: copy.processes.pause });
  await pause.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: copy.processes.resume }),
  ).toBeFocused();
  await expect(page.getByText(/^Updates paused\./).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: copy.processes.pause }),
  ).toBeFocused();
  await expectNoSidewaysScroll(page);
});

test("the service tabs, each its own address, with the output read on opening", async ({
  page,
  rpc,
}) => {
  rpc.loginWith("authenticated");
  await signIn(page);
  await navigation(page)
    .getByRole("link", { name: copy.nav.items.diagnostics.services })
    .click();
  await expect(page).toHaveURL(/\/ui\/diagnostics\/services\/smb$/);
  const tabs = page.getByRole("navigation", { name: copy.serviceDetails.tabs });
  await expect(
    tabs.getByRole("link", { name: copy.serviceDetails.name.smb }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByText(
      copy.serviceDetails.disabled.replace("{{service}}", "SMB/CIFS"),
    ),
  ).toBeVisible();
  expect(rpc.calls).not.toContain("SMB.getStats");

  await tabs.getByRole("link", { name: copy.serviceDetails.name.ssh }).click();
  await expect(page).toHaveURL(/\/ui\/diagnostics\/services\/ssh$/);
  const output = page.getByRole("region", {
    name: copy.serviceDetails.outputLabel.replace("{{service}}", "SSH"),
  });
  await expect(output).toContainText("No users connected");
  await output.focus();
  await expect(output).toBeFocused();
  expect(rpc.calls).toContain("SSH.getStats");
  await expect(page).toHaveTitle("SSH – Services – openmediavault");
  await expectNoSidewaysScroll(page);
});
