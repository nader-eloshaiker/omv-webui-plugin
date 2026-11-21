// SPDX-License-Identifier: GPL-3.0-or-later
// The three Disk health pages in the production build, under the snippet's headers (UI-1, Trusted
// Types enforced), on the contract's examples: reached from the menu, walked tab by tab with the
// keyboard, the self-tests table with its Actions menu, and no read that wakes a disk unless asked.
// Each page is also shown at 320 CSS px without sideways scroll. Any CSP or Trusted Types violation,
// console error, page error or request to another origin fails a test (support/fixtures.ts).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import { expect, test } from "./support/fixtures.ts";

// Typed into the mock only; no real system is involved.
const PASSWORD = "not-a-real-password";

/** The reads that run smartctl and can wake a sleeping disk. */
const WAKING = [
  "Smart.getListBg",
  "Smart.getInformation",
  "Smart.getAttributes",
  "Smart.getSelfTestLogs",
  "Smart.getExtendedInformation",
  "Smart.executeScheduledTest",
  "Smart.enumerateDevices",
  "Smart.enumerateMonitoredDevices",
];

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

/** Answer Smart.getScheduleList with the contract's several-tests example; everything else falls back. */
async function withScheduledTests(page: Page) {
  await page.route("**/rpc.php", async (route) => {
    const body = route.request().postDataJSON() as {
      service?: unknown;
      method?: unknown;
    } | null;
    if (body?.service === "Smart" && body.method === "getScheduleList") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          response: CONTRACT_EXAMPLES.smartGetScheduleList.several.value,
          error: null,
        }),
      });
      return;
    }
    await route.fallback();
  });
}

test("the Disk health pages, tab by tab with the keyboard, without waking a disk", async ({
  page,
  rpc,
}) => {
  await withScheduledTests(page);
  await signIn(page);
  await page
    .getByRole("navigation", { name: copy.app.navigation })
    .getByRole("link", { name: copy.nav.items.storage.smart })
    .click();
  await expect(page).toHaveURL(/\/ui\/storage\/smart\/overview$/);
  await expect(
    page.getByRole("heading", { level: 1, name: copy.smart.title }),
  ).toBeVisible();
  await expect(page.getByText(copy.smart.overview.off)).toBeVisible();
  await expect(
    page.getByRole("table", { name: copy.smart.overview.tableLabel }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);

  const tabs = page.getByRole("navigation", { name: copy.smart.tabs });
  await tabs.getByRole("link", { name: copy.smart.tab.overview }).focus();
  await page.keyboard.press("Tab");
  await expect(
    tabs.getByRole("link", { name: copy.smart.tab.selfTests }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ui\/storage\/smart\/self-tests$/);
  const table = page.getByRole("table", { name: copy.smart.tests.tableLabel });
  await expect(table.getByText("Nightly short test")).toBeVisible();
  await table
    .getByRole("button", { name: /^Actions for the long self-test of/ })
    .click();
  await expect(
    page.getByRole("menuitem", { name: copy.smart.tests.edit }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expectNoSidewaysScroll(page);

  await tabs.getByRole("link", { name: copy.smart.tab.selfTests }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/ui\/storage\/smart\/settings$/);
  await expect(
    page.getByRole("checkbox", { name: copy.smart.settings.watch }),
  ).toBeVisible();
  await expect(
    page.getByRole("radiogroup", { name: copy.smart.settings.asleep }),
  ).toBeVisible();
  await expectNoSidewaysScroll(page);

  for (const call of WAKING) {
    expect(rpc.calls).not.toContain(call);
  }
});
