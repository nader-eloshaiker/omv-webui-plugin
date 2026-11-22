// SPDX-License-Identifier: GPL-3.0-or-later
import { RpcError } from "@omv-webui/react-api-omv/transport";
import { describe, expect, it } from "vitest";
import { isMissing, readName } from "./nameFree.ts";

const error = (status: number, code: number | null, message: string) =>
  new RpcError({ status, code, message, operationId: "userMgmtGetGroup" });

describe("whether a name is free (0.11, observed on the test VM)", () => {
  it("is free only on that exact refusal, for that name", () => {
    expect(
      isMissing(
        "group",
        "kids",
        error(500, 0, "The group 'kids' does not exist."),
      ),
    ).toBe(true);
    expect(
      isMissing(
        "user",
        "kids",
        error(500, 0, "The user 'kids' does not exist."),
      ),
    ).toBe(true);
    // Another name, the other kind, another status or code, other words: not free.
    expect(
      isMissing(
        "group",
        "kids",
        error(500, 0, "The group 'kid' does not exist."),
      ),
    ).toBe(false);
    expect(
      isMissing(
        "group",
        "kids",
        error(500, 0, "The user 'kids' does not exist."),
      ),
    ).toBe(false);
    expect(
      isMissing(
        "group",
        "kids",
        error(400, 0, "The group 'kids' does not exist."),
      ),
    ).toBe(false);
    expect(
      isMissing(
        "group",
        "kids",
        error(500, 1, "The group 'kids' does not exist."),
      ),
    ).toBe(false);
    expect(isMissing("group", "kids", new Error("x"))).toBe(false);
  });

  it("reads a name as taken, free or not known", async () => {
    await expect(
      readName("group", "kids", () => Promise.resolve({ name: "kids" })),
    ).resolves.toEqual({ kind: "taken", value: { name: "kids" } });
    await expect(
      readName("group", "kids", () =>
        Promise.reject(error(500, 0, "The group 'kids' does not exist.")),
      ),
    ).resolves.toEqual({ kind: "free" });
    const cut = error(504, null, "Gateway Timeout");
    await expect(
      readName("group", "kids", () => Promise.reject(cut)),
    ).resolves.toEqual({ kind: "unknown", error: cut });
  });
});
