// SPDX-License-Identifier: GPL-3.0-or-later
// The browser test's fixtures:
// - `headerVariant` (per project): the snippet's headers as they are, or with Trusted Types enforced.
// - `server` (per worker): the production build behind the snippet's headers, on a free port.
// - `rpc` (per test): rpc.php answered from the contract's examples, in the browser.
// - `observed` (per test, automatic): every CSP violation (enforced or report-only), console error,
//   uncaught page error and request to another origin (support/observer.ts, shared with the VM
//   test). Any of them fails the test.
import { test as base, expect } from "@playwright/test";
import {
  expectNothingObserved,
  observe,
  RPC_401,
  type Observed,
} from "./observer.ts";
import { RpcMock } from "./rpcMock.ts";
import {
  readSnippet,
  startSnippetServer,
  withVariant,
  type HeaderVariant,
  type RunningServer,
} from "./snippetServer.ts";

export type { Observed };

interface WorkerFixtures {
  headerVariant: HeaderVariant;
  server: RunningServer;
}

interface TestFixtures {
  rpc: RpcMock;
  observed: Observed;
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
      const observed = await observe(page, server.origin, [RPC_401]);
      await provide(observed);
      expectNothingObserved(observed);
    },
    { auto: true },
  ],
});

export { expect };
