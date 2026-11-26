// SPDX-License-Identifier: GPL-3.0-or-later
// The library's tips, help popovers and motion helpers under the plugin snippet's headers (UI-1,
// Trusted Types enforced), as the guidance prototype and the motion reel use them: the welcome tip
// ended with Got it, the (?) and a glossary term opened (Base UI's Popover) and closed, and every
// motion of the reel run by its own check. Any CSP or Trusted Types violation, console error, page
// error or request to another origin fails the test; the canary proves the policy is enforced.
import { test as base, expect } from "@playwright/test";
import {
  breakThePolicy,
  CANARY_VIOLATIONS,
  expectNothingObserved,
  observe,
  type Observed,
} from "../support/observer.ts";
import {
  readSnippet,
  startSnippetServer,
  type RunningServer,
} from "../support/snippetServer.ts";
import { LAB_DIST } from "./labDist.ts";

const test = base.extend<{ observed: Observed }, { server: RunningServer }>({
  server: [
    async ({ browserName: _browser }, provide) => {
      const server = await startSnippetServer(readSnippet(), LAB_DIST);
      await provide(server);
      await server.close();
    },
    { scope: "worker" },
  ],
  baseURL: async ({ server }, provide) => {
    await provide(server.origin);
  },
  observed: [
    async ({ page, server }, provide) => {
      const observed = await observe(page, server.origin, []);
      await provide(observed);
      expectNothingObserved(observed);
    },
    { auto: true },
  ],
});

for (const theme of ["dark", "light"] as const) {
  test(`guidance ${theme}: a tip ends on Got it, and the help popovers open and close`, async ({
    page,
  }) => {
    await page.goto(`/ui/lab?screen=guidance&theme=${theme}&chrome=0`);
    const gotIt = page.getByRole("button", {
      name: "Got it, hide the tip about the new interface",
    });
    await expect(gotIt).toBeVisible();
    await gotIt.click();
    await expect(gotIt).toHaveCount(0);

    const workgroup = page.getByRole("button", {
      name: "What is a workgroup?",
    });
    await workgroup.scrollIntoViewIfNeeded();
    await workgroup.click();
    await expect(workgroup).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByText("The name Windows computers use to find each other"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(workgroup).toHaveAttribute("aria-expanded", "false");

    const smb = page.getByRole("button", { name: "SMB, what it means" });
    await smb.click();
    await expect(page.getByRole("dialog", { name: "SMB" })).toBeVisible();
    // No style element is created at run time (UI-1): the page has none of its own.
    expect(await page.locator("style").count()).toBe(0);
    await page.mouse.click(2, 2);
    await expect(page.getByRole("dialog", { name: "SMB" })).toHaveCount(0);
  });
}

test("motion reel: every motion passes its own check", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/ui/lab?screen=motion&theme=dark");
  await page.getByRole("button", { name: "Check every motion" }).click();
  await expect(page.getByText(/^Every motion passed/)).toBeVisible({
    timeout: 170_000,
  });
  expect(await page.locator("style").count()).toBe(0);
});

test("the canary: the policy is enforced on the lab's pages", async ({
  page,
  observed,
}) => {
  await page.goto("/ui/lab?screen=guidance&theme=dark&chrome=0");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await breakThePolicy(page);
  for (const expected of CANARY_VIOLATIONS) {
    await expect
      .poll(() => observed.violations)
      .toContainEqual(expect.stringMatching(expected));
  }
  observed.violations.length = 0;
  observed.consoleErrors.length = 0;
});
