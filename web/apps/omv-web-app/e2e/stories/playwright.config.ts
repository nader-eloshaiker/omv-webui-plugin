// SPDX-License-Identifier: GPL-3.0-or-later
// The accessibility test of the dashboard's library pieces: axe with the WCAG 2.2 AA rules over their
// stories in the library's built Storybook, in both themes, both densities and at 1440 and 390 wide
// (journal, 2026-11-27).
//
//   pnpm test:browser:stories        (in web/) builds Storybook, then runs this
//
// Not part of `pnpm test` or `pnpm test:browser`: it needs a Storybook build and takes minutes. Two
// workers at most (the machine is shared; see .agents/rules/verification.md).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "../../test-results/e2e-stories",
  globalSetup: "./globalSetup.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "stories" }],
});
