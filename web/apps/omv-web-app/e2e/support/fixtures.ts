// SPDX-License-Identifier: GPL-3.0-or-later
// The browser test's fixtures:
// - `server` (per worker): the production build behind the snippet's headers, on a free port.
// - `rpc` (per test): rpc.php answered from the contract's examples, in the browser.
// - `observed` (per test, automatic): every CSP violation (enforced or report-only), console error,
//   uncaught page error and request to another origin (support/observer.ts, shared with the VM
//   test). Any of them fails the test.
// - `extraAllowances` (option): console errors a test's own failing replies cause, each with its
//   reason; none by default.
import { test as base, expect } from "@playwright/test";
import {
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

  baseURL: async ({ server }, provide) => {
    await provide(server.origin);
  },

  rpc: async ({ page, server }, provide) => {
    const rpc = new RpcMock();
    await rpc.install(page, server.origin);
    await provide(rpc);
    expect.soft(rpc.problems, "requests to rpc.php").toEqual([]);
  },

  extraAllowances: [{ list: [] }, { option: true }],

  observed: [
    async ({ page, server, extraAllowances }, provide) => {
      const observed = await observe(page, server.origin, [
        RPC_401,
        RPC_404_NO_PLUGIN,
        ...extraAllowances.list,
      ]);
      await provide(observed);
      expectNothingObserved(observed);
    },
    { auto: true },
  ],
});

export { expect };
