// SPDX-License-Identifier: GPL-3.0-or-later
// The integration run against the disposable test VM (docs/08, "Integration"): `pnpm test:vm`.
// Never part of `pnpm test`, and never pointed at the owner's server. The page's origin is the VM,
// so the transport's relative /rpc.php reaches it, with the session cookie, as in a browser.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

const envFile =
  process.env.OMV_WEBUI_ENV ?? join(homedir(), ".config/omv-webui/test.env");
const host = /^NAS_HOST=(.*)$/m
  .exec(readFileSync(envFile, "utf8"))?.[1]
  ?.trim();
if (!host) {
  throw new Error(`NAS_HOST is not set in ${envFile}`);
}

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    environmentOptions: { happyDOM: { url: `http://${host}/ui/` } },
    include: ["vm/**/*.vm.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
