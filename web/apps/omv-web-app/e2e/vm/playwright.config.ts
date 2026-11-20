// SPDX-License-Identifier: GPL-3.0-or-later
// The VM browser test: the build deployed on the disposable test VM, behind the VM's own nginx and
// the plugin's snippet, against the VM's real rpc.php (docs/07, Phase 2 acceptance).
//
//   pnpm test:browser:vm         (in web/) runs it; deploy the build to the VM first
//
// Never part of CI, `pnpm test` or `make test`. Without the env file ($OMV_WEBUI_ENV, default
// ~/.config/omv-webui/test.env) every test is skipped. Never point it at the owner's server.
//
// Nothing that could hold a credential, a code, a user name or the VM's address is written inside
// the repository: no trace (it records typed values), and screenshots of a failure go to the system's
// temporary directory.
//
// The page gets the VM's headers exactly as nginx sends them; they enforce Trusted Types (UI-1), and
// the canary test proves that enforcement is in force. OMV_WEBUI_VM_SCHEME=https runs the same tests
// over HTTPS.
import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVmTarget } from "./support/vmTarget.ts";

const target = readVmTarget();

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.vm.spec.ts",
  outputDir: join(tmpdir(), "omv-webui-vm-browser"),
  forbidOnly: true,
  retries: 0,
  // One browser at a time: the tests share the VM's accounts and its sign-in rate limits.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: target?.origin,
    // The disposable VM's certificate is self-signed; only with OMV_WEBUI_VM_SCHEME=https.
    ignoreHTTPSErrors: target?.origin.startsWith("https:") ?? false,
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "vm" }],
});
