// SPDX-License-Identifier: GPL-3.0-or-later
// Flow D, "Set up disk monitoring", in the production build, under the snippet's headers (UI-1,
// Trusted Types enforced), on the contract's examples (the test VM's disks, monitoring off): reached
// from the Overview, it reads no disk until "Check disk health" is pressed, and its form leads to the
// summary by keyboard without writing anything. Any CSP or Trusted Types violation, console error, page
// error or request to another origin fails a test (support/fixtures.ts). The run itself writes and
// reads back, so it is proven in the Testing Library suite, where the mock can remember the writes.
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

/** The page does not scroll sideways at 320 CSS px. */
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

test("set up disk monitoring: from the Overview to the summary by keyboard, waking no disk first", async ({
  page,
  rpc,
}) => {
  await signIn(page);
  await page.goto("/ui/storage/smart/overview");
  await page
    .getByRole("link", { name: copy.smart.overview.setUp })
    .first()
    .click();
  await expect(page).toHaveURL(/\/ui\/storage\/smart\/set-up$/);
  await expect(
    page.getByRole("heading", { level: 2, name: copy.smart.setup.title }),
  ).toBeVisible();
  await expect(page).toHaveTitle(
    `${copy.smart.setup.documentTitle} – openmediavault`,
  );
  await expect(page.getByText(copy.smart.setup.needCheck)).toBeVisible();
  expect(rpc.calls).not.toContain("Smart.getListBg");
  await expectNoSidewaysScroll(page);

  const check = page.getByRole("button", { name: copy.diskCheck.check });
  await check.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(/^Using the disk health checked at /),
  ).toBeVisible();
  expect(rpc.calls.filter((c) => c === "Smart.getListBg")).toHaveLength(1);

  // The NVMe disk is offered and ticked; the virtual SATA disks report no health and start unticked.
  const disks = page.getByRole("group", { name: copy.smart.setup.disks });
  await expect(
    disks.getByRole("checkbox", { name: /\/dev\/nvme0n1/ }),
  ).toBeChecked();
  await expect(
    disks.getByRole("checkbox", { name: /\/dev\/sda/ }),
  ).not.toBeChecked();
  await expectNoSidewaysScroll(page);

  const next = page.getByRole("button", { name: copy.smart.setup.continue });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(copy.smart.setup.summaryTitle)).toBeVisible();
  await expect(page.getByText(copy.smart.setup.sum.globalOn)).toBeVisible();
  // Tab from the summary reaches its two buttons.
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: copy.smart.setup.back }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: copy.smart.setup.confirm }),
  ).toBeFocused();
  await expectNoSidewaysScroll(page);
  // Nothing was written: the form and the summary only decide (R2).
  expect(rpc.calls.filter((c) => /\.(set|apply|revert)/i.test(c))).toEqual([]);
});
