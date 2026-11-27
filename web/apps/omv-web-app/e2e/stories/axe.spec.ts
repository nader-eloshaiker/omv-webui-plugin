// SPDX-License-Identifier: GPL-3.0-or-later
// axe with the WCAG 2.2 AA rules over the stories of the dashboard's library pieces (journal,
// 2026-11-27): each story in light and dark, each loaded fresh so no colour is caught mid-transition,
// in both densities, at 1440 and 390 wide. Motion is reduced, so every story is checked at its end
// state at once. Any violation, console error or page error fails the story.
import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import {
  startStorybookServer,
  storiesIn,
  type StaticServer,
} from "./storybookStatic.ts";

/** The dashboard's pieces in react-ui-components/src/components (the composed stories are in nas-map). */
const FOLDERS = [
  "nas-map",
  "nas-answer",
  "attention-list",
  "first-steps",
  "segment-bar",
  "live-pair",
  "disk-temperatures",
  "drive-picture",
  "drive-bay",
  "nas-front",
  "scan-line",
  "panel",
] as const;

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const WIDTHS = [1440, 390] as const;

const test = base.extend<object, { server: StaticServer }>({
  server: [
    async ({ browserName: _browser }, provide) => {
      const server = await startStorybookServer();
      await provide(server);
      await server.close();
    },
    { scope: "worker" },
  ],
});

async function violations(page: Page) {
  const result = await new AxeBuilder({ page })
    .include("#storybook-root")
    .withTags(TAGS)
    .analyze();
  return result.violations.map(
    (v) =>
      `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`,
  );
}

for (const id of storiesIn(FOLDERS)) {
  for (const width of WIDTHS) {
    test(`${id} at ${String(width)}`, async ({ browser, server }) => {
      const found: string[] = [];
      for (const theme of ["Light", "Dark"] as const) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("console", (m) => {
          if (m.type() === "error") {
            errors.push(m.text());
          }
        });
        page.on("pageerror", (e) => {
          errors.push(String(e));
        });
        await page.goto(
          `${server.origin}/iframe.html?id=${id}&viewMode=story&globals=matrix:single;theme:${theme}`,
        );
        await expect(
          page.locator("#storybook-root > *").first(),
        ).toBeAttached();
        await page.waitForLoadState("networkidle");
        for (const density of ["comfortable", "compact"] as const) {
          await page.evaluate((d) => {
            if (d === "compact") {
              document.documentElement.setAttribute("data-density", "compact");
            } else {
              document.documentElement.removeAttribute("data-density");
            }
          }, density);
          await page.waitForTimeout(100);
          for (const v of await violations(page)) {
            found.push(`${theme}, ${density}: ${v}`);
          }
        }
        for (const e of errors) {
          found.push(`${theme}: console: ${e}`);
        }
        await context.close();
      }
      expect(found).toEqual([]);
    });
  }
}
