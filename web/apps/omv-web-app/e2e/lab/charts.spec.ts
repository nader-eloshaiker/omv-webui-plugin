// SPDX-License-Identifier: GPL-3.0-or-later
// The lab's charts under the snippet's real headers (UI-1, Trusted Types enforced): every direction
// and theme, the dashboard's live charts, the storage charts and the Performance page, pointed at,
// driven from the keyboard and left to update live. Any CSP or Trusted Types violation, console
// error, page error or request to another origin fails the test; the canary proves enforcement.
import { test as base, expect, type Page } from "@playwright/test";
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

const DIRS = ["instrument", "sky", "atlas"] as const;
const THEMES = ["dark", "light"] as const;

async function open(page: Page, query: string) {
  await page.goto(`/ui/lab?${query}&chrome=0`);
  await expect(
    page.locator(".lx-chart .recharts-surface").first(),
  ).toBeVisible();
}

/** Point at a chart and read its tooltip. */
async function pointAt(page: Page, chart: string) {
  const surface = page.locator(`${chart} .recharts-surface`).first();
  // To the middle of the window: Sky's pending dock covers the foot of it.
  await surface.evaluate((el) => {
    el.scrollIntoView({ block: "center" });
  });
  const box = await surface.boundingBox();
  if (!box) {
    throw new Error(`${chart} has no box`);
  }
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.45);
  await expect(page.locator(`${chart} .lx-chart-tip`).first()).toBeVisible();
  await page.mouse.move(0, 0);
}

for (const dir of DIRS) {
  for (const theme of THEMES) {
    test(`${dir} ${theme}: dashboard charts point, key and update live`, async ({
      page,
    }) => {
      await open(page, `dir=${dir}&theme=${theme}&screen=dashboard`);
      const tiles = page.locator(".lx-livetile .recharts-surface");
      await expect(tiles).toHaveCount(4);
      await pointAt(page, ".lx-livetile:nth-child(1)");
      await pointAt(page, ".lx-livetile:nth-child(3)");

      // The keyboard: tab focus on a chart, then the arrow keys move the tooltip.
      const temp = page.locator(".lx-livetile:nth-child(4) .recharts-surface");
      await temp.focus();
      await page.keyboard.press("ArrowLeft");
      await expect(
        page.locator(".lx-livetile:nth-child(4) .lx-chart-tip"),
      ).toBeVisible();
      await temp.blur();

      // Live: a new sample arrives every 2 s and the line glides one step (Web Animations API).
      const line = page.locator(
        ".lx-livetile:nth-child(1) .recharts-area-curve",
      );
      const before = await line.getAttribute("d");
      await expect
        .poll(() => line.getAttribute("d"), { timeout: 6000 })
        .not.toBe(before);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document
                .getAnimations()
                .filter(
                  (a) =>
                    a.effect instanceof KeyframeEffect &&
                    a.effect.target instanceof Element &&
                    a.effect.target.closest(".lx-glide") !== null,
                ).length,
          ),
        )
        .toBeGreaterThan(0);

      // The table equivalent.
      await page.getByText("Show the numbers as a table").click();
      await expect(page.locator(".lx-chart-table").first()).toBeVisible();
    });

    test(`${dir} ${theme}: storage charts point`, async ({ page }) => {
      await open(page, `dir=${dir}&theme=${theme}&screen=storage`);
      await expect(
        page.locator(".lx-chart--bars .recharts-surface"),
      ).toHaveCount(2);
      await pointAt(page, ".lx-chart--bars:not(.lx-chart--temps)");
      await pointAt(page, ".lx-chart--temps");
    });

    test(`${dir} ${theme}: Performance page`, async ({ page }) => {
      await open(page, `dir=${dir}&theme=${theme}&screen=activity`);
      await expect(page.locator(".lx-perf .recharts-surface")).toHaveCount(4);
      await pointAt(page, ".lx-perf:nth-child(3) .lx-chart");
      await page.getByRole("button", { name: "Last 10 min" }).click();
      await expect(
        page.getByRole("button", { name: "Last 10 min" }),
      ).toHaveAttribute("aria-pressed", "true");
      await pointAt(page, ".lx-perf:nth-child(1) .lx-chart");
    });
  }
}

test("reduced motion: live charts redraw in place, nothing glides", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "dir=sky&theme=dark&screen=dashboard");
  const line = page.locator(".lx-livetile:nth-child(1) .recharts-area-curve");
  const before = await line.getAttribute("d");
  await expect
    .poll(() => line.getAttribute("d"), { timeout: 6000 })
    .not.toBe(before);
  const gliding = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (a) =>
            a.effect instanceof KeyframeEffect &&
            a.effect.target instanceof Element &&
            a.effect.target.closest(".lx-chart") !== null,
        ).length,
  );
  expect(gliding).toBe(0);
});

test("the canary: the policy is enforced on the lab's pages", async ({
  page,
  observed,
}) => {
  await open(page, "dir=instrument&theme=dark&screen=dashboard");
  await breakThePolicy(page);
  for (const expected of CANARY_VIOLATIONS) {
    await expect
      .poll(() => observed.violations)
      .toContainEqual(expect.stringMatching(expected));
  }
  observed.violations.length = 0;
  observed.consoleErrors.length = 0;
});
