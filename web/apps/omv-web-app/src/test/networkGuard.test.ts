// SPDX-License-Identifier: GPL-3.0-or-later
// The guard setup.ts installs, tested by sending what it exists to catch: requests nothing answered,
// by every path the app or a library could take. Each test takes the record itself, which stops
// setup's own afterEach failing it for the request it sent on purpose. The refusals happen inside
// the process: the patched connect makes no syscall, so "ECONNREFUSED" here never touched a socket.
import { systemGetInformation } from "@omv-webui/react-api-omv/generated";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  failOnLeakedRequests,
  nodeConsole,
  takeLeakedRequests,
} from "./networkGuard.ts";
import { answer } from "./server.ts";

beforeEach(() => {
  // happy-dom prints each refusal through Node's console; here the refusal is the point.
  vi.spyOn(nodeConsole(), "error").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("a request nothing answered", () => {
  it("through the generated client is refused, and named", async () => {
    await expect(systemGetInformation()).rejects.toMatchObject({
      status: 0,
      kind: "network",
    });
    expect(takeLeakedRequests()).toEqual(["POST http://localhost/rpc.php"]);
  });

  it("by a library's own Node request, outside the browser APIs MSW serves, is refused", async () => {
    // Lint keeps fetch and XMLHttpRequest out of test code too (UI-10), so this path stands for
    // any dependency that opens a connection of its own.
    const http = (
      globalThis as unknown as {
        process: {
          getBuiltinModule(id: "node:http"): {
            get(
              url: string,
              callback: () => void,
            ): { on(event: "error", listener: (e: unknown) => void): void };
          };
        };
      }
    ).process.getBuiltinModule("node:http");
    const error = await new Promise<unknown>((resolve) => {
      http
        .get("http://localhost/ui/assets/font.woff2", () => resolve(null))
        .on("error", resolve);
    });
    expect(error).toMatchObject({ code: "ECONNREFUSED" });
    expect(takeLeakedRequests()).toEqual([
      "GET http://localhost/ui/assets/font.woff2",
    ]);
  });

  it("fails the test: the check setup.ts runs after every test throws, naming the request", async () => {
    await systemGetInformation().catch(() => undefined);
    expect(() => failOnLeakedRequests()).toThrow(
      /nothing answered[\s\S]*POST http:\/\/localhost\/rpc\.php/,
    );
    // The record is emptied, so this test itself ends clean.
    expect(() => failOnLeakedRequests()).not.toThrow();
  });
});

describe("a request MSW answered", () => {
  it("never reaches the guard", async () => {
    answer();
    await expect(systemGetInformation()).resolves.toMatchObject({
      hostname: "nas",
    });
    expect(takeLeakedRequests()).toEqual([]);
    expect(() => failOnLeakedRequests()).not.toThrow();
  });
});
