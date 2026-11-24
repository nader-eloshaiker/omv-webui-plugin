// SPDX-License-Identifier: GPL-3.0-or-later
// network/ip.ts: parsing and printing (RFC 5952), sizes from a prefix or a mask, first and last
// addresses, membership in a network or a range, what an address is, and computer names.
import { describe, expect, it } from "vitest";
import {
  addressCount,
  addressScope,
  canonicalAddress,
  firstAddress,
  formatBits,
  formatIPv6,
  formatNetwork,
  hostRange,
  inNetwork,
  inRange,
  isComputerName,
  isLinkLocal,
  lastAddress,
  maskText,
  networkOf,
  networkWithin,
  parseAddress,
  parseIPv4,
  parseIPv6,
  parseNetwork,
  parseNetworkSize,
  parsePrefix6,
  parseRange,
  prefixFromMask,
  sameAddress,
} from "./ip.ts";

const v4 = (text: string) => {
  const a = parseAddress(text);
  if (a === null) {
    throw new Error(text);
  }
  return a;
};
const net = (text: string) => {
  const n = parseNetwork(text);
  if (n === null) {
    throw new Error(text);
  }
  return networkOf(n.family, n.address, n.prefix);
};

describe("IPv4 and IPv6 addresses", () => {
  it.each([
    ["192.0.2.10", 0xc000020a],
    ["0.0.0.0", 0],
    ["255.255.255.255", 0xffffffff],
  ])("reads %s", (text, value) => {
    expect(parseIPv4(text)).toBe(value);
  });

  it.each([
    "192.0.2.256",
    "192.0.2",
    "192.0.2.010",
    " 192.0.2.1",
    "192.0.2.1/24",
    "",
  ])("refuses IPv4 %j", (text) => {
    expect(parseIPv4(text)).toBeNull();
  });

  it.each([
    ["2001:DB8:0:0:0:0:0:1", "2001:db8::1"],
    ["2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::ff00:42:8329"],
    ["2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1"],
    ["2001:db8:0:1:1:1:1:1", "2001:db8:0:1:1:1:1:1"],
    ["2001:db8::", "2001:db8::"],
    ["::1", "::1"],
    ["::", "::"],
    ["fe80:0:0:0:0:0:0:1", "fe80::1"],
  ])("prints %s in its shortest form %s (RFC 5952)", (text, shortest) => {
    expect(formatIPv6(parseIPv6(text) ?? -1n)).toBe(shortest);
    expect(canonicalAddress(text)).toBe(shortest);
  });

  it.each([
    "2001:db8::1::2",
    "fe80::1%eth0",
    "::ffff:192.0.2.1",
    "2001:db8::g",
    ":",
  ])("refuses IPv6 %j", (text) => {
    expect(parseIPv6(text)).toBeNull();
  });

  it.each([
    ["2001:DB8::1", "2001:db8:0:0:0:0:0:1", true],
    ["192.0.2.10", " 192.0.2.10 ", true],
    ["192.0.2.10", "192.0.2.11", false],
    ["192.0.2.10", "not an address", false],
    ["::1", "0.0.0.1", false],
  ])("sameAddress(%j, %j) is %s", (a, b, expected) => {
    expect(sameAddress(a, b)).toBe(expected);
  });
});

describe("what an address is (5.3's reserved addresses)", () => {
  it.each([
    ["0.0.0.0", "unspecified"],
    ["127.0.0.1", "loopback"],
    ["127.255.0.9", "loopback"],
    ["224.0.0.1", "multicast"],
    ["239.255.255.250", "multicast"],
    ["169.254.10.1", "linkLocal"],
    ["255.255.255.255", "broadcast"],
    ["192.0.2.10", "other"],
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["ff02::1", "multicast"],
    ["fe80::1", "linkLocal"],
    ["febf::1", "linkLocal"],
    ["fec0::1", "other"],
    ["2001:db8::10", "other"],
  ])("%s is %s", (text, scope) => {
    expect(addressScope(v4(text))).toBe(scope);
  });

  it.each([
    ["fe80::1", true],
    ["2001:db8::1", false],
    ["192.0.2.1", false],
    ["", false],
  ])("isLinkLocal(%j) is %s", (text, expected) => {
    expect(isLinkLocal(text)).toBe(expected);
  });
});

describe("network sizes from a prefix or a mask (5.2)", () => {
  it.each([
    ["24", 24],
    ["/24", 24],
    [" 24 ", 24],
    ["255.255.255.0", 24],
    ["255.255.255.252", 30],
    ["255.255.255.255", 32],
    ["255.0.0.0", 8],
    ["1", 1],
    ["32", 32],
    ["128.0.0.0", 1],
  ])("reads %j as /%i", (text, prefix) => {
    expect(parseNetworkSize(text)).toBe(prefix);
  });

  it.each([
    "0",
    "/0",
    "33",
    "024",
    "0.0.0.0",
    "255.0.255.0",
    "255.255.255",
    "/255.255.255.0",
    "",
    "x",
  ])("refuses %j", (text) => {
    expect(parseNetworkSize(text)).toBeNull();
  });

  it.each([
    [24, "255.255.255.0"],
    [16, "255.255.0.0"],
    [32, "255.255.255.255"],
    [0, "0.0.0.0"],
    [25, "255.255.255.128"],
  ])("/%i is the mask %s, and back", (prefix, mask) => {
    expect(maskText(prefix)).toBe(mask);
    expect(prefixFromMask(mask)).toBe(prefix);
  });

  it.each([
    ["64", 64],
    ["/64", 64],
    [128, 128],
    [1, 1],
  ])("an IPv6 prefix %j is %i", (text, prefix) => {
    expect(parsePrefix6(text)).toBe(prefix);
  });

  it.each(["0", "129", "064", "", "x"])(
    "refuses the IPv6 prefix %j",
    (text) => {
      expect(parsePrefix6(text)).toBeNull();
    },
  );
});

describe("networks: first and last, membership, printing", () => {
  it.each([
    ["192.0.2.10/24", "192.0.2.0/24", "192.0.2.0", "192.0.2.255"],
    ["198.51.100.77/25", "198.51.100.0/25", "198.51.100.0", "198.51.100.127"],
    ["203.0.113.5/32", "203.0.113.5/32", "203.0.113.5", "203.0.113.5"],
    [
      "2001:db8::10/64",
      "2001:db8::/64",
      "2001:db8::",
      "2001:db8::ffff:ffff:ffff:ffff",
    ],
  ])("%s is in %s, from %s to %s", (text, network, first, last) => {
    const n = net(text);
    expect(formatNetwork(n)).toBe(network);
    expect(formatBits(n.family, firstAddress(n))).toBe(first);
    expect(formatBits(n.family, lastAddress(n))).toBe(last);
  });

  it.each([
    ["192.0.2.0/24", "192.0.2.1", "192.0.2.254", 254n],
    ["192.0.2.0/30", "192.0.2.1", "192.0.2.2", 2n],
    ["192.0.2.0/31", "192.0.2.0", "192.0.2.1", 2n],
    ["192.0.2.7/32", "192.0.2.7", "192.0.2.7", 1n],
  ])(
    "the addresses devices may use in %s run from %s to %s (%i)",
    (text, first, last, count) => {
      const range = hostRange(net(text));
      expect(formatBits(4, range.first)).toBe(first);
      expect(formatBits(4, range.last)).toBe(last);
      expect(range.count).toBe(count);
    },
  );

  it.each([
    ["192.0.2.10", "192.0.2.0/24", true],
    ["192.0.2.10", "198.51.100.0/24", false],
    ["192.0.3.1", "192.0.2.0/23", true],
    ["2001:db8::10", "2001:db8::/64", true],
    ["2001:db8:1::10", "2001:db8::/64", false],
    ["192.0.2.10", "2001:db8::/64", false],
  ])("%s in %s: %s", (address, network, expected) => {
    expect(inNetwork(v4(address), net(network))).toBe(expected);
  });

  it.each([
    ["192.0.2.0/25", "192.0.2.0/24", true],
    ["192.0.2.0/24", "192.0.2.0/25", false],
    ["198.51.100.0/24", "192.0.2.0/24", false],
  ])("%s within %s: %s", (inner, outer, expected) => {
    expect(networkWithin(net(inner), net(outer))).toBe(expected);
  });

  it.each([
    ["192.0.2.10/24", 4, 24],
    ["2001:db8::/32", 6, 32],
    ["192.0.2.0/0", 4, 0],
  ])(
    "parseNetwork(%j) takes any prefix the family holds",
    (text, family, prefix) => {
      expect(parseNetwork(text)).toMatchObject({ family, prefix });
    },
  );

  it.each([
    "192.0.2.0/33",
    "2001:db8::/129",
    "192.0.2.0/024",
    "192.0.2.0",
    "192.0.2.0/24/1",
  ])("parseNetwork refuses %j", (text) => {
    expect(parseNetwork(text)).toBeNull();
  });
});

describe("ranges (11.2)", () => {
  it.each([
    ["192.0.2.10-192.0.2.20", "192.0.2.15", true],
    ["192.0.2.10-192.0.2.20", "192.0.2.10", true],
    ["192.0.2.10-192.0.2.20", "192.0.2.20", true],
    ["192.0.2.10-192.0.2.20", "192.0.2.21", false],
    ["192.0.2.10 - 192.0.2.10", "192.0.2.10", true],
    ["2001:db8::1-2001:db8::ff", "2001:db8::10", true],
  ])("%s holds %s: %s", (text, address, expected) => {
    const range = parseRange(text);
    expect(range.ok).toBe(true);
    if (range.ok) {
      expect(inRange(v4(address), range.range)).toBe(expected);
    }
  });

  it.each([
    ["192.0.2.20-192.0.2.10", "order"],
    ["192.0.2.10-2001:db8::1", "form"],
    ["192.0.2.10", "form"],
    ["192.0.2.10-192.0.2.20-192.0.2.30", "form"],
    ["a-b", "form"],
  ])("refuses %j (%s)", (text, reason) => {
    expect(parseRange(text)).toEqual({ ok: false, reason });
  });
});

describe("how many addresses (0.2)", () => {
  it.each([
    [4, 24, { kind: "count", count: 256 }],
    [4, 32, { kind: "count", count: 1 }],
    [6, 64, { kind: "huge" }],
    [6, 120, { kind: "count", count: 256 }],
  ] as const)("IPv%i /%i", (family, prefix, expected) => {
    expect(addressCount(family, prefix)).toEqual(expected);
  });
});

describe("computer names", () => {
  it.each([
    "nas",
    "NAS_HOST".toLowerCase().replace("_", "-"),
    "proxy.example.org",
    "a".repeat(63),
  ])("takes %s", (name) => {
    expect(isComputerName(name)).toBe(true);
  });
  it.each([
    "",
    "-nas",
    "nas-",
    "my_nas",
    "192.0.2.300",
    "a".repeat(64),
    "nas..example.org",
  ])("refuses %j", (name) => {
    expect(isComputerName(name)).toBe(false);
  });
});
