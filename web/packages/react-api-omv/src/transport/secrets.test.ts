// SPDX-License-Identifier: GPL-3.0-or-later
// Every stored secret the examples carry is reached by the contract's x-omv-omit or x-omv-presence
// (UI-6). The examples are raw replies, so a stored password in them is the documentation value
// EXAMPLE-PASSWORD (docs/04, "Response schemas"); after the transport's own removals, done with
// the same functions, no reply of any operation may still hold it. An operation whose reply
// carries a secret the contract does not name fails here, by name.
import { describe, expect, it } from "vitest";
import { OPERATIONS } from "../contract/generated/operations.ts";
import type { OperationEntry } from "../contract/types.ts";
import { CONTRACT_EXAMPLES } from "../examples/index.ts";
import { withoutOmitted } from "./omit.ts";
import { withPresence } from "./presence.ts";

const SECRET = "EXAMPLE-PASSWORD";
const examples: Readonly<
  Record<string, Readonly<Record<string, { status: number; value: unknown }>>>
> = CONTRACT_EXAMPLES;
const entries: readonly OperationEntry[] = Object.values(OPERATIONS);

const replies = entries.flatMap((op) =>
  Object.entries(examples[op.operationId] ?? {})
    .filter(([, example]) => example.status === 200)
    .map(([name, example]) => ({
      name: `${op.operationId}.${name}`,
      op,
      value: example.value,
    })),
);

describe("stored secrets in the examples", () => {
  it("the examples hold stored secrets to remove (so the sweep below proves something)", () => {
    const holding = replies.filter(({ value }) =>
      JSON.stringify(value).includes(SECRET),
    );
    expect(holding.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "networkGetInterfaceList.portAndWifi",
        "networkGetInterface.wifi",
        "networkSetWirelessIface.created",
        "networkGetProxy.set",
        "networkSetProxy.saved",
        "networkEnumerateDevicesList.wifi",
      ]),
    );
  });

  it.each(replies)("$name reaches the caller without one", ({ op, value }) => {
    const out = withPresence(withoutOmitted(value, op.omit), op.presence);
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it.each([
    ["networkGetInterface.wifi", "wpapsk", true],
    ["networkGetInterface.bond", "wpapsk", false],
    ["networkGetProxy.set", "httppassword", true],
    ["networkGetProxy.set", "ftppassword", false],
    ["networkGetProxy.none", "httpspassword", false],
  ] as const)("%s: %s is %s after the transport", (name, field, isSet) => {
    const reply = replies.find((r) => r.name === name);
    expect(reply).toBeDefined();
    const out = withPresence(
      withoutOmitted(reply?.value, reply?.op.omit),
      reply?.op.presence,
    ) as Record<string, unknown>;
    expect(out[field]).toBe(isSet);
  });

  it.each([
    ["networkSetWirelessIface.created", "wpapsk"],
    ["networkDeleteInterface.removed", "wpapsk"],
    ["networkSetProxy.saved", "http"],
  ] as const)(
    "%s: the stored secret is gone after the transport",
    (name, field) => {
      const reply = replies.find((r) => r.name === name);
      expect(reply).toBeDefined();
      const out = withoutOmitted(reply?.value, reply?.op.omit) as Record<
        string,
        unknown
      >;
      if (field === "http") {
        expect(out.http).not.toHaveProperty("password");
        expect(out.http).toHaveProperty("host", "proxy.example.org");
      } else {
        expect(out).not.toHaveProperty(field);
      }
    },
  );
});
