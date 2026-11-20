// SPDX-License-Identifier: GPL-3.0-or-later
// The browser test's fixtures:
// - `headerVariant` (per project): the snippet's headers as they are, or with Trusted Types enforced.
// - `server` (per worker): the production build behind the snippet's headers, on a free port.
// - `rpc` (per test): rpc.php answered from the contract's examples, in the browser.
// - `observed` (per test, automatic): every CSP violation (enforced or report-only), console error,
//   uncaught page error and request to another origin. Any of them fails the test.
import { test as base, expect, type ConsoleMessage } from "@playwright/test";
import { RpcMock } from "./rpcMock.ts";
import {
  readSnippet,
  startSnippetServer,
  withVariant,
  type HeaderVariant,
  type RunningServer,
} from "./snippetServer.ts";

export interface Observed {
  violations: string[];
  consoleErrors: string[];
  pageErrors: string[];
  foreignRequests: string[];
}

interface WorkerFixtures {
  headerVariant: HeaderVariant;
  server: RunningServer;
}

interface TestFixtures {
  rpc: RpcMock;
  observed: Observed;
}

/** The name the page reports violations through; set up before any of the page's own scripts. */
const BINDING = "__omvReportViolation";

/**
 * Chromium logs every 4xx reply as a console error. A 401 from rpc.php is expected (the load-time
 * probe while signed out, docs/03 "Login"), and only that one is let through.
 */
function expectedConsoleError(message: ConsoleMessage, origin: string) {
  return (
    message.location().url === `${origin}/rpc.php` &&
    message
      .text()
      .startsWith(
        "Failed to load resource: the server responded with a status of 401",
      )
  );
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  headerVariant: ["snippet", { option: true, scope: "worker" }],

  server: [
    async ({ headerVariant }, provide) => {
      const server = await startSnippetServer(
        withVariant(readSnippet(), headerVariant),
      );
      await provide(server);
      await server.close();
    },
    { scope: "worker" },
  ],

  baseURL: async ({ server }, provide) => {
    await provide(server.origin);
  },

  rpc: async ({ page, server }, provide) => {
    const rpc = new RpcMock();
    await rpc.install(page, server.origin);
    await provide(rpc);
    expect.soft(rpc.problems, "requests to rpc.php").toEqual([]);
  },

  observed: [
    async ({ page, server }, provide) => {
      const observed: Observed = {
        violations: [],
        consoleErrors: [],
        pageErrors: [],
        foreignRequests: [],
      };
      await page.exposeBinding(BINDING, (_source, summary: unknown) => {
        observed.violations.push(String(summary));
      });
      await page.addInitScript((binding: string) => {
        document.addEventListener("securitypolicyviolation", (event) => {
          const report: unknown = Reflect.get(window, binding);
          if (typeof report === "function") {
            report(
              `${event.disposition} ${event.effectiveDirective}: blocked ${event.blockedURI || "(inline)"}` +
                ` at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}` +
                (event.sample ? ` sample "${event.sample}"` : ""),
            );
          }
        });
      }, BINDING);
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          !expectedConsoleError(message, server.origin)
        ) {
          observed.consoleErrors.push(
            `${message.text()} (${message.location().url})`,
          );
        }
      });
      page.on("pageerror", (error) => {
        observed.pageErrors.push(`${error.name}: ${error.message}`);
      });
      page.on("request", (request) => {
        if (new URL(request.url()).origin !== server.origin) {
          observed.foreignRequests.push(request.url());
        }
      });

      await provide(observed);

      expect.soft(observed.violations, "CSP violations").toEqual([]);
      expect.soft(observed.consoleErrors, "console errors").toEqual([]);
      expect.soft(observed.pageErrors, "uncaught page errors").toEqual([]);
      expect
        .soft(observed.foreignRequests, "requests to another origin (UI-7)")
        .toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
