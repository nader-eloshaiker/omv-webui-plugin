// SPDX-License-Identifier: GPL-3.0-or-later
// The guard setup.ts installs, tested by sending what it exists to catch: a call nothing answered.
// The test takes the record itself, which stops setup's own afterEach failing it for the request it
// sent on purpose.
import { systemGetInformation } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it, vi } from "vitest";
import { takeLeakedRequests } from "./networkGuard.ts";
import { answer } from "./server.ts";

describe("the test network guard", () => {
  it("refuses a call nothing answered, and names it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(systemGetInformation()).rejects.toMatchObject({
      status: 0,
      kind: "network",
    });
    expect(takeLeakedRequests()).toEqual(["POST http://localhost/rpc.php"]);
  });

  it("lets a call MSW answered through untouched", async () => {
    answer();
    await expect(systemGetInformation()).resolves.toMatchObject({
      hostname: "nas",
    });
    expect(takeLeakedRequests()).toEqual([]);
  });
});
