// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disks and a disk's health details in the production build, under the snippet's headers
// (UI-1, Trusted Types enforced), on the contract's examples: the list reached from the menu and walked
// with the keyboard, a disk's page opened from its link, and no read that wakes a disk until the reader
// presses its button. Any CSP or Trusted Types violation, console error, page error or request to
// another origin fails a test (support/fixtures.ts). Each page is also shown at 320 CSS px without
// sideways scroll.
import type { Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import { expect, test } from "./support/fixtures.ts";

// Typed into the mock only; no real system is involved.
const PASSWORD = "not-a-real-password";

/** The reads that run smartctl and can wake a sleeping disk. */
const WAKING = new Set([
  "Smart.getListBg",
  "Smart.getInformation",
  "Smart.getAttributes",
  "Smart.getSelfTestLogs",
  "Smart.getExtendedInformation",
  "Smart.executeScheduledTest",
  "Smart.enumerateDevices",
  "Smart.enumerateMonitoredDevices",
]);

async function signIn(page: Page) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
}

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

/** Tab from the page title through the main content; the accessible names reached, in order. */
async function tabThroughMain(page: Page, limit = 60): Promise<string[]> {
  await page.locator("main h1").focus();
  const names: string[] = [];
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element?.closest("main")) {
        return null;
      }
      return (
        element.getAttribute("aria-label") ??
        element.textContent ??
        ""
      ).trim();
    });
    if (name === null) {
      break;
    }
    names.push(name);
  }
  return names;
}

test("the Disks list from the menu, by keyboard, with no waking read", async ({
  page,
  rpc,
}) => {
  await signIn(page);
  await page
    .getByRole("navigation", { name: copy.app.navigation })
    .getByRole("link", { name: copy.nav.items.storage.disks })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.disks.title }),
  ).toBeVisible();
  const table = page.getByRole("table", { name: copy.disks.tableLabel });
  await expect(
    table.getByRole("link", { name: "Open disk /dev/sdb" }),
  ).toBeVisible();
  await expect(table.getByText(copy.disks.use.system)).toBeVisible();
  await expect(page).toHaveTitle("Disks – openmediavault");

  const reached = await tabThroughMain(page);
  const order = [
    copy.diskCheck.check,
    copy.disks.rescan,
    copy.disks.refresh,
    copy.disks.col.disk,
    copy.disks.col.size,
    "Open disk /dev/nvme0n1",
    "Open disk /dev/sdb",
  ];
  let at = -1;
  for (const name of order) {
    const next = reached.findIndex((r, i) => i > at && r.startsWith(name));
    expect(next, `${name} is reached after the one before it`).toBeGreaterThan(
      at,
    );
    at = next;
  }
  expect(reached.at(-1)).toContain(copy.disks.classicLink);

  await page.getByRole("button", { name: copy.disks.refresh }).click();
  await expect(
    page.getByRole("button", { name: copy.disks.refresh }),
  ).toBeEnabled();
  await expectNoSidewaysScroll(page);
  expect(rpc.calls.filter((c) => WAKING.has(c))).toEqual([]);
});

test("a disk's health details, read only on the press", async ({
  page,
  rpc,
}) => {
  await signIn(page);
  await page.goto("/ui/storage/disks");
  await page
    .getByRole("table", { name: copy.disks.tableLabel })
    .getByRole("link", { name: "Open disk /dev/nvme0n1" })
    .click();
  const details = page.getByRole("region", { name: copy.disk.details.title });
  await expect(details).toBeVisible();
  await expect(details.getByText(copy.disk.details.intro)).toBeVisible();
  await expectNoSidewaysScroll(page);
  expect(rpc.calls.filter((c) => WAKING.has(c))).toEqual([]);

  const read = details.getByRole("button", { name: copy.disk.details.read });
  await read.focus();
  await page.keyboard.press("Enter");
  await expect(
    details.getByRole("button", { name: copy.disk.details.readAgain }),
  ).toBeFocused();
  await expect(details.getByText(copy.disk.details.noTable)).toBeVisible();
  expect(rpc.calls.filter((c) => WAKING.has(c)).sort()).toEqual([
    "Smart.getAttributes",
    "Smart.getInformation",
    "Smart.getSelfTestLogs",
  ]);

  await details
    .getByRole("button", { name: copy.disk.details.reportShow })
    .click();
  await expect(
    details.getByRole("region", {
      name: "Full health report of /dev/nvme0n1",
    }),
  ).toBeVisible();
  expect(
    rpc.calls.filter((c) => c === "Smart.getExtendedInformation"),
  ).toHaveLength(1);
  await expectNoSidewaysScroll(page);
});
