// SPDX-License-Identifier: GPL-3.0-or-later
// The design lab's browser test: the lab's test-only build (dist-lab/, `pnpm build:lab`) served with
// the plugin snippet's headers, Trusted Types enforced, in Chromium. It proves that what the lab
// draws runs under the policy with no violation.
//
//   pnpm test:browser:lab        (in web/) builds the lab, then runs this
//
// Not part of `pnpm test` or `pnpm test:browser`. The lab is never in the production bundle; the
// production build is checked by tools/build-check, which fails on any trace of it.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "../../test-results/e2e-lab",
  globalSetup: "./globalSetup.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  fullyParallel: true,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "lab-snippet-headers" }],
});
