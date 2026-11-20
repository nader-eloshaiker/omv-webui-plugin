// SPDX-License-Identifier: GPL-3.0-or-later
// On the contract's captured examples: an administrator's System.getInformation and a user's.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { SystemInformation } from "@omv-webui/react-api-omv/generated";
import { describe, expect, it } from "vitest";
import { roleOf } from "./role.ts";

const info = (name: keyof typeof CONTRACT_EXAMPLES.systemGetInformation) =>
  CONTRACT_EXAMPLES.systemGetInformation[name].value as SystemInformation;

describe("roleOf", () => {
  it("reads an administrator from the full answer", () => {
    expect(roleOf(info("admin"))).toBe("admin");
    expect(roleOf(info("adminPendingChanges"))).toBe("admin");
  });

  it("reads a user from the reduced answer", () => {
    expect(roleOf(info("user"))).toBe("user");
  });
});
