// SPDX-License-Identifier: GPL-3.0-or-later
// The browser test's fixtures:
// - `server` (per worker): the production build behind the snippet's headers, on a free port.
// - `rpc` (per test): rpc.php answered from the contract's examples, in the browser.
// - `observed` (per test, automatic): every CSP violation (enforced or report-only), console error,
//   uncaught page error and request to another origin (support/observer.ts, shared with the VM
//   test). Any of them fails the test.
// - `extraAllowances` (option): console errors a test's own failing replies cause, each with its
//   reason; none by default.
// - `openedAt` (option): the host the page is opened at, such as a network story's address
//   ("192.0.2.10"); null (the default) opens it at the server's own loopback origin. The production
//   build reads where it was opened from `location` only (src/network/pageLocation.ts), so the network
//   pages need a real address: the browser then reaches the server as its HTTP proxy, and the page's
//   origin is `http://<openedAt>`. Nothing leaves the computer: every request goes to the server.
import { test as base, expect } from "@playwright/test";
import {
  COOP_IGNORED_OVER_HTTP,
  expectNothingObserved,
  observe,
  RPC_401,
  RPC_404_NO_PLUGIN,
  type ConsoleAllowance,
  type Observed,
} from "./observer.ts";
import { RpcMock } from "./rpcMock.ts";
import {
  readSnippet,
  startSnippetServer,
  type RunningServer,
} from "./snippetServer.ts";

export type { Observed };

interface WorkerFixtures {
  server: RunningServer;
}

interface TestFixtures {
  rpc: RpcMock;
  observed: Observed;
  extraAllowances: { list: readonly ConsoleAllowance[] };
  openedAt: string | null;
  /** The page's origin: the server's, or `http://<openedAt>`. */
  pageOrigin: string;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  server: [
    async ({ browserName: _browser }, provide) => {
      const server = await startSnippetServer(readSnippet());
      await provide(server);
      await server.close();
    },
    { scope: "worker" },
  ],

  openedAt: [null, { option: true }],

  pageOrigin: async ({ server, openedAt }, provide) => {
    await provide(openedAt === null ? server.origin : `http://${openedAt}`);
  },

  proxy: async ({ server, openedAt }, provide) => {
    await provide(openedAt === null ? undefined : { server: server.origin });
  },

  baseURL: async ({ pageOrigin }, provide) => {
    await provide(pageOrigin);
  },

  rpc: async ({ page, pageOrigin }, provide) => {
    const rpc = new RpcMock();
    await rpc.install(page, pageOrigin);
    await provide(rpc);
    expect.soft(rpc.problems, "requests to rpc.php").toEqual([]);
  },

  extraAllowances: [{ list: [] }, { option: true }],

  observed: [
    async ({ page, pageOrigin, openedAt, extraAllowances }, provide) => {
      const observed = await observe(page, pageOrigin, [
        RPC_401,
        RPC_404_NO_PLUGIN,
        ...(openedAt === null ? [] : [COOP_IGNORED_OVER_HTTP]),
        ...extraAllowances.list,
      ]);
      await provide(observed);
      expectNothingObserved(observed);
    },
    { auto: true },
  ],
});

export { expect };
