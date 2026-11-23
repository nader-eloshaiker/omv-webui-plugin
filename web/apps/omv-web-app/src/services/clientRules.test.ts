// SPDX-License-Identifier: GPL-3.0-or-later
// Every rule of phase 5 services design 0.4, table by table, and agreement with the contract's own
// pattern (NetworkClient): whatever the browser accepts, the contract accepts too.
import { NfsSetShareRequestSchema } from "@omv-webui/react-api-omv/forms";
import { describe, expect, it } from "vitest";
import {
  addressCount,
  checkClient,
  checkComputer,
  checkNetwork,
  classifyStored,
  clientKey,
  formatIPv6,
  isComputerName,
  networkWarning,
  parseIPv4,
  parseIPv6,
  sameClient,
  valueOfStored,
} from "./clientRules.ts";

/** Whether the contract's NetworkClient pattern takes the value (through NFS.setShare's schema). */
const contractTakes = (client: string) => {
  const result = NfsSetShareRequestSchema["~standard"].validate({
    uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
    sharedfolderref: "00000000-0000-4000-8000-000000000201",
    mntentref: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
    client,
    options: "ro",
    extraoptions: "subtree_check,insecure",
    comment: "",
  });
  return !(result instanceof Promise) && result.issues === undefined;
};

describe("IPv4 addresses", () => {
  it.each([
    ["192.0.2.10", 0xc000020a],
    ["0.0.0.0", 0],
    ["255.255.255.255", 0xffffffff],
    ["198.51.100.1", 0xc6336401],
  ])("reads %s", (text, value) => {
    expect(parseIPv4(text)).toBe(value);
  });

  it.each([
    "192.0.2.256",
    "192.0.2",
    "192.0.2.1.5",
    "192.0.2.010",
    "192.0.2.-1",
    " 192.0.2.1",
    "192.0.2.1/24",
    "",
  ])("refuses %j", (text) => {
    expect(parseIPv4(text)).toBeNull();
  });
});

describe("IPv6 addresses", () => {
  it.each([
    ["2001:db8::1", "2001:db8::1"],
    ["2001:DB8:0:0:0:0:0:1", "2001:db8::1"],
    ["2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::ff00:42:8329"],
    ["::1", "::1"],
    ["::", "::"],
    ["fe80::", "fe80::"],
    ["2001:db8:0:1:0:0:0:1", "2001:db8:0:1::1"],
    ["2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1"],
    ["1::2:3:4:5:6:7", "1:0:2:3:4:5:6:7"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2:3:4:5:6"],
  ])("reads %s (shortest form %s)", (text, shortest) => {
    const value = parseIPv6(text);
    expect(value).not.toBeNull();
    expect(formatIPv6(value ?? 0n)).toBe(shortest);
  });

  it.each([
    "2001:db8::1::2",
    "2001:db8:1:2:3:4:5:6:7",
    "2001:db8:1:2:3:4:5",
    "2001:db8::g",
    "2001:db8::12345",
    "1:2:3:4:5:6:7::",
    "::1:2:3:4:5:6:7",
    "::ffff:192.0.2.1",
    "fe80::1%eth0",
    ":",
    "",
  ])("refuses %j", (text) => {
    expect(parseIPv6(text)).toBeNull();
  });
});

describe("computer names", () => {
  it.each([
    "nas",
    "media-player",
    "backup.example.org",
    "a1.example.org",
    "x".repeat(63),
    `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
  ])("takes %s", (name) => {
    expect(isComputerName(name)).toBe(true);
  });

  it.each([
    ["a wildcard", "*.example.org"],
    ["a leading hyphen", "-nas"],
    ["a trailing hyphen", "nas-"],
    ["an underscore", "my_nas"],
    ["a space", "my nas"],
    ["an empty label", "nas..example.org"],
    ["a trailing dot", "nas.example.org."],
    ["a label of 64", "x".repeat(64)],
    [
      "254 characters",
      `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}`,
    ],
    ["a mistyped address", "192.0.2.300"],
    ["digits only", "12345"],
    ["a netgroup", "@trusted"],
    ["letters outside ASCII", "nås"],
    ["nothing", ""],
  ])("refuses %s", (_what, name) => {
    expect(isComputerName(name)).toBe(false);
  });
});

describe("one computer", () => {
  it.each([
    ["192.0.2.10", { kind: "address", family: 4 }],
    ["2001:db8::10", { kind: "address", family: 6 }],
    ["backup.example.org", { kind: "name" }],
    ["  192.0.2.10  ", { kind: "address", family: 4 }],
  ])("takes %j", (text, form) => {
    const check = checkComputer(text);
    expect(check).toEqual({ ok: true, client: text.trim(), form });
    expect(contractTakes(text.trim())).toBe(true);
  });

  it.each([
    "192.0.2.300",
    "192.0.2.0/24",
    "*",
    "*.example.org",
    "192.0.2.10 192.0.2.11",
    "192.0.2.10,192.0.2.11",
    "",
  ])("refuses %j", (text) => {
    expect(checkComputer(text)).toEqual({
      ok: false,
      problem: { kind: "address" },
    });
  });
});

describe("one network", () => {
  it.each([
    ["192.0.2.0/24", 4, 24],
    ["10.0.0.0/8", 4, 8],
    ["192.0.2.10/32", 4, 32],
    ["198.51.100.128/25", 4, 25],
    ["2001:db8::/32", 6, 32],
    ["2001::/16", 6, 16],
    ["2001:db8::1/128", 6, 128],
    ["2001:DB8:0:0::/64", 6, 64],
  ])("takes %s", (text, family, prefix) => {
    expect(checkNetwork(text)).toEqual({
      ok: true,
      client: text,
      form: { kind: "network", family, prefix },
    });
    expect(contractTakes(text)).toBe(true);
  });

  it.each([
    ["192.0.2.5/24", "192.0.2.0/24"],
    ["10.1.2.3/8", "10.0.0.0/8"],
    ["198.51.100.200/25", "198.51.100.128/25"],
    ["2001:db8::1/32", "2001:db8::/32"],
    ["2001:db8:1:2::1/64", "2001:db8:1:2::/64"],
    ["2001:db8:ffff::/33", "2001:db8:8000::/33"],
  ])(
    "refuses %s, which is not the start of a network, and suggests %s",
    (text, suggestion) => {
      expect(checkNetwork(text)).toEqual({
        ok: false,
        problem: { kind: "start", value: text, suggestion },
      });
      expect(checkNetwork(suggestion).ok).toBe(true);
    },
  );

  it.each(["0.0.0.0/0", "192.0.2.0/0", "::/0", "2001:db8::/0"])(
    "refuses %s: every computer",
    (text) => {
      expect(checkNetwork(text)).toEqual({
        ok: false,
        problem: { kind: "zero" },
      });
    },
  );

  it.each([
    "10.0.0.0/7",
    "0.0.0.0/1",
    "192.0.2.0/33",
    "2001:db8::/15",
    "2001:db8::/129",
    "192.0.2.0/999",
  ])("refuses %s: its size is out of range", (text) => {
    expect(checkNetwork(text)).toEqual({
      ok: false,
      problem: { kind: "prefix" },
    });
  });

  it.each([
    "192.0.2.0",
    "192.0.2.0/",
    "192.0.2.0/24/8",
    "192.0.2.0/024",
    "192.0.2.0/x",
    "backup.example.org/24",
    "192.0.2.300/24",
    "*",
    "",
  ])("refuses %j: not a network", (text) => {
    expect(checkNetwork(text)).toEqual({
      ok: false,
      problem: { kind: "network" },
    });
  });
});

describe("the whole field", () => {
  it("needs a choice", () => {
    expect(checkClient({ choice: null, text: "" })).toEqual({
      ok: false,
      problem: { kind: "choose" },
    });
  });

  it("stores any computer as *, which the contract takes", () => {
    expect(checkClient({ choice: "any", text: "192.0.2.10" })).toEqual({
      ok: true,
      client: "*",
      form: { kind: "any" },
    });
    expect(contractTakes("*")).toBe(true);
  });

  it("stores the rsync server's any computer with a sign-in as empty", () => {
    expect(checkClient({ choice: "anyWithPassword", text: "x" })).toEqual({
      ok: true,
      client: "",
      form: { kind: "anyWithPassword" },
    });
  });

  it("checks the text by the chosen choice", () => {
    expect(checkClient({ choice: "one", text: "192.0.2.0/24" }).ok).toBe(false);
    expect(checkClient({ choice: "network", text: "192.0.2.0/24" }).ok).toBe(
      true,
    );
    expect(checkClient({ choice: "network", text: "192.0.2.10" }).ok).toBe(
      false,
    );
  });
});

describe("how wide a network is", () => {
  it.each([
    [4, 24, { kind: "count", count: 256 }],
    [4, 16, { kind: "count", count: 65_536 }],
    [4, 8, { kind: "count", count: 16_777_216 }],
    [4, 32, { kind: "count", count: 1 }],
    [6, 64, { kind: "huge" }],
    [6, 32, { kind: "huge" }],
    [6, 120, { kind: "count", count: 256 }],
  ] as const)("IPv%i /%i", (family, prefix, count) => {
    expect(addressCount(family, prefix)).toEqual(count);
  });

  it.each([
    ["192.0.2.0/24", null],
    ["192.0.2.0/25", null],
    ["192.0.0.0/23", { kind: "count", count: 512 }],
    ["10.1.0.0/16", { kind: "count", count: 65_536 }],
    ["2001:db8:1:2::/64", null],
    ["2001:db8:1::/63", { kind: "huge" }],
    ["2001:db8::/32", { kind: "huge" }],
    ["192.0.2.5/16", null],
  ])("warns about %s: %j", (text, warning) => {
    expect(networkWarning({ choice: "network", text })).toEqual(warning);
  });

  it("warns only for a network", () => {
    expect(networkWarning({ choice: "one", text: "10.0.0.0/8" })).toBeNull();
  });
});

describe("a stored value", () => {
  it.each([
    [
      "192.0.2.10",
      {
        kind: "one",
        value: "192.0.2.10",
        form: { kind: "address", family: 4 },
      },
    ],
    [
      "backup.example.org",
      { kind: "one", value: "backup.example.org", form: { kind: "name" } },
    ],
    ["192.0.2.0/24", { kind: "network", value: "192.0.2.0/24" }],
    ["*", { kind: "any" }],
    ["", { kind: "any" }],
    ["*.example.org", { kind: "classic", value: "*.example.org" }],
    ["@trusted", { kind: "classic", value: "@trusted" }],
    [
      "192.0.2.10 192.0.2.11",
      { kind: "classic", value: "192.0.2.10 192.0.2.11" },
    ],
    ["192.0.2.5/24", { kind: "classic", value: "192.0.2.5/24" }],
    ["0.0.0.0/0", { kind: "classic", value: "0.0.0.0/0" }],
  ])("reads %j", (stored, kind) => {
    expect(classifyStored(stored)).toEqual(kind);
  });

  it("reads an empty rsync server value as any computer with a sign-in", () => {
    expect(classifyStored("", "anyWithPassword")).toEqual({
      kind: "anyWithPassword",
    });
  });

  it("opens the field on the stored choice, or on none for a classic value", () => {
    expect(valueOfStored(classifyStored("192.0.2.10"))).toEqual({
      choice: "one",
      text: "192.0.2.10",
    });
    expect(valueOfStored(classifyStored("192.0.2.0/24"))).toEqual({
      choice: "network",
      text: "192.0.2.0/24",
    });
    expect(valueOfStored(classifyStored("*"))).toEqual({
      choice: "any",
      text: "",
    });
    expect(valueOfStored(classifyStored("*.example.org"))).toEqual({
      choice: null,
      text: "",
    });
  });
});

describe("the same computer or network", () => {
  it.each([
    ["192.0.2.10", "192.0.2.10"],
    ["Backup.Example.org", "backup.example.org"],
    ["2001:DB8::1", "2001:db8:0:0:0:0:0:1"],
    ["192.0.2.0/24", "192.0.2.0/24"],
    ["192.0.2.0/24", "192.0.2.77/24"],
    ["2001:db8::/32", "2001:DB8:0::/32"],
    ["192.0.2.10", "192.0.2.10/32"],
    ["2001:db8::1", "2001:db8::1/128"],
    ["*", ""],
    [" 192.0.2.10 ", "192.0.2.10"],
    ["*.Example.org", "*.example.org"],
  ])("%j is %j", (a, b) => {
    expect(sameClient(a, b)).toBe(true);
    expect(clientKey(a)).toBe(clientKey(b));
  });

  it.each([
    ["192.0.2.10", "192.0.2.11"],
    ["192.0.2.0/24", "192.0.2.0/25"],
    ["192.0.2.0/24", "192.0.3.0/24"],
    ["192.0.2.10", "192.0.2.0/24"],
    ["2001:db8::/32", "2001:db8::/48"],
    ["*", "192.0.2.10"],
    ["backup.example.org", "backup"],
    ["192.0.2.10", "::ffff:c000:20a"],
  ])("%j is not %j", (a, b) => {
    expect(sameClient(a, b)).toBe(false);
  });
});
