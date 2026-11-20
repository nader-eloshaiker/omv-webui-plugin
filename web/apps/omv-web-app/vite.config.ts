// SPDX-License-Identifier: GPL-3.0-or-later
// The interface's build, dev server and test run. Served at /ui/ beside OMV's own site (docs/02).
//
//   pnpm dev        the app against the test VM: rpc.php is proxied to NAS_HOST, read from the
//                   environment or the test env file ($OMV_WEBUI_ENV), never from the repository
//   pnpm dev:mock   the app on MSW, answering with the contract's examples (src/mocks)
//   pnpm build      the production bundle: no inline script or style, no other origin, no mock
//                   code (UI-1, UI-7, UI-11; checked on dist/ after every build)
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { createLogger, type Plugin, type ProxyOptions } from "vite";
import { defineConfig } from "vitest/config";

const BASE = "/ui/";

/** The test VM's address: $NAS_HOST, or NAS_HOST in the test env file. Never committed. */
function nasHost(): string | undefined {
  const fromEnv = process.env.NAS_HOST?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const file =
    process.env.OMV_WEBUI_ENV ?? join(homedir(), ".config/omv-webui/test.env");
  if (!existsSync(file)) {
    return undefined;
  }
  return /^NAS_HOST=(.*)$/m.exec(readFileSync(file, "utf8"))?.[1]?.trim();
}

/**
 * `pnpm dev` only: forward the two OMV endpoints to the test VM. The browser makes a same-origin
 * call to the dev server, which forwards it, so the session cookie behaves as it does under /ui/.
 * The address is not printed.
 */
function backendProxy(): Record<string, ProxyOptions> | undefined {
  const log = createLogger("info", { prefix: "[omv-proxy]" });
  const host = nasHost();
  if (!host) {
    log.warn(
      "NAS_HOST is not set (environment or $OMV_WEBUI_ENV): rpc.php has nowhere to go. Use pnpm dev:mock for the mock.",
      { timestamp: true },
    );
    return undefined;
  }
  log.info("/rpc.php and /download.php -> the test VM (NAS_HOST)", {
    timestamp: true,
  });
  const target = /^https?:\/\//.test(host) ? host : `http://${host}`;
  const options: ProxyOptions = { target, changeOrigin: true, secure: true };
  return { "/rpc.php": options, "/download.php": options };
}

/**
 * `pnpm dev:mock` only: serve MSW's worker script at /ui/mockServiceWorker.js from the msw package.
 * It is deliberately not in public/, which Vite copies into every build (UI-11).
 */
function mockServiceWorker(): Plugin {
  const script = createRequire(import.meta.url).resolve(
    "msw/mockServiceWorker.js",
  );
  return {
    name: "omv-mock-service-worker",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(`${BASE}mockServiceWorker.js`, (_req, res) => {
        res.setHeader("Content-Type", "text/javascript");
        res.setHeader("Service-Worker-Allowed", BASE);
        res.end(readFileSync(script));
      });
    },
  };
}

export default defineConfig(({ command, mode }) => ({
  base: BASE,
  clearScreen: false,
  server: {
    proxy:
      command === "serve" && mode === "development"
        ? backendProxy()
        : undefined,
  },
  build: {
    // Nothing is inlined as a data: URL: font-src is 'self' only (UI-1), and every asset is a file.
    assetsInlineLimit: 0,
    // Browsers that run this app support module preload; no polyfill code is emitted.
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      // No HMR code in a test run (the reference app's note: a stale router in a shared worker).
      codeSplittingOptions: { addHmr: mode !== "test" },
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    ...(mode === "mock" ? [mockServiceWorker()] : []),
  ],
  test: {
    globals: true,
    // happy-dom by default; a file that needs jsdom pins it with a docblock naming the gap.
    environment: "happy-dom",
    // The page's own origin under /ui/, so the transport's relative /rpc.php is same-origin. A
    // loopback host: a request nothing answered reaches the network guard's refused connect without
    // a DNS query leaving the machine first.
    environmentOptions: {
      happyDOM: { url: "http://localhost/ui/" },
      jsdom: { url: "http://localhost/ui/" },
    },
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 15_000,
  },
}));
