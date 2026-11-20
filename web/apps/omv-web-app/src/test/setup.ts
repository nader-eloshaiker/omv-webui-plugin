// SPDX-License-Identifier: GPL-3.0-or-later
// Runs before every test file: Testing Library's matchers and clean-up, the MSW server on the
// contract's examples, and the network guard that fails any test whose request nothing answered.
import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { installNetworkGuard, takeLeakedRequests } from "./networkGuard.ts";
import { seenCalls, server } from "./server.ts";

configure({ asyncUtilTimeout: 3000 });

installNetworkGuard();

beforeAll(() => {
  // "bypass": a request no handler answers goes on to the network guard below, which refuses it.
  server.listen({ onUnhandledFrame: "bypass" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  seenCalls.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  const leaked = takeLeakedRequests();
  if (leaked.length > 0) {
    throw new Error(
      `This test sent ${leaked.length} request(s) that nothing answered; the network guard refused them. ` +
        `Answer them through MSW (src/test/server.ts):\n\n${[...new Set(leaked)].join("\n")}`,
    );
  }
});

afterAll(() => {
  server.close();
});
