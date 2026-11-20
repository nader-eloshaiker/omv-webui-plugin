// SPDX-License-Identifier: GPL-3.0-or-later
import { RpcError } from "@omv-webui/react-api-omv/transport";
import { describe, expect, it } from "vitest";
import { signInProblemOf } from "./signInProblem.ts";

const rpcError = (status: number, message: string) =>
  new RpcError({ status, code: 0, message, operationId: "sessionLogin" });

describe("signInProblemOf", () => {
  it.each([
    [400, "Incorrect username or password.", "rejected"],
    [
      429,
      "Too many failed verification attempts. Please try again later.",
      "tooManyAttempts",
    ],
    [401, "No pending login or the login has expired.", "expired"],
    [0, "The server could not be reached.", "unreachable"],
    [500, "Something broke.", "unreachable"],
  ])("HTTP %i is %s", (status, message, kind) => {
    expect(signInProblemOf(rpcError(status, message))).toEqual({
      kind,
      message,
    });
  });

  it("keeps nothing of an error that is not the transport's", () => {
    expect(
      signInProblemOf(new Error("TypeError: secret detail")),
    ).toMatchObject({ kind: "unreachable" });
    expect(
      signInProblemOf(new Error("TypeError: secret detail")).message,
    ).not.toContain("secret");
  });
});
