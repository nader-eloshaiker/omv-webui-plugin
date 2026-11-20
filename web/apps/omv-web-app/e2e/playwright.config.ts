// SPDX-License-Identifier: GPL-3.0-or-later
// The browser test: the production build, served with the nginx snippet's headers, in Chromium.
//
//   pnpm test:browser            (in web/) builds, then runs this
//   pnpm test:browser:install    downloads the browser once; nothing is fetched at install time (UI-11)
//
// Not part of `pnpm test`: it needs the build and a downloaded browser. rpc.php is answered in the
// browser from the contract's examples (support/rpcMock.ts); nothing talks to a real backend.
//
// Two projects run the same tests: with the snippet's headers exactly, and with
// `require-trusted-types-for 'script'` enforced on top (A9, Phase 2 acceptance).
import { defineConfig, devices } from "@playwright/test";
import type { HeaderVariant } from "./support/snippetServer.ts";

export default defineConfig<object, { headerVariant: HeaderVariant }>({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  // The VM's own browser test (vm/) has its own configuration and never runs here.
  testIgnore: "vm/**",
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
  projects: [
    {
      name: "snippet-headers",
      use: { headerVariant: "snippet" },
    },
    {
      name: "trusted-types-enforced",
      use: { headerVariant: "trustedTypesEnforced" },
    },
  ],
});
