// SPDX-License-Identifier: GPL-3.0-or-later
// The browser test: the production build, served with the nginx snippet's headers, in Chromium.
//
//   pnpm test:browser            (in web/) builds, then runs this
//   pnpm test:browser:install    downloads the browser once; nothing is fetched at install time (UI-11)
//
// Not part of `pnpm test`: it needs the build and a downloaded browser. rpc.php is answered in the
// browser from the contract's examples (support/rpcMock.ts); nothing talks to a real backend.
//
// The headers are the snippet's, exactly; they enforce Trusted Types (UI-1), and the canary test
// proves that enforcement is in force.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  // The VM's own browser test (vm/) and the design lab's (lab/) have their own configurations.
  testIgnore: ["vm/**", "lab/**"],
  outputDir: "../test-results/e2e",
  globalSetup: "./support/globalSetup.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  fullyParallel: true,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "snippet-headers" }],
});
