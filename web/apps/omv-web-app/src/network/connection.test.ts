// SPDX-License-Identifier: GPL-3.0-or-later
// network/connection.ts: every row of phase 5 network design 0.4, the bullets under it (everything
// under an interface, the family, the web ports and the SSH port, a failed read) and {{pageUrl}}.
import { describe, expect, it } from "vitest";
import {
  certainty,
  interfacesUnder,
  localUrl,
  nasAddress,
  pageFamilies,
  pageUrl,
  parsePageHost,
  sshPort,
  standing,
  vlanParent,
  webPorts,
  workOutConnection,
  type Connection,
} from "./connection.ts";
import {
  failed,
  loading,
  ok,
  type DeviceRow,
  type GeneralSettings,
} from "./dto.ts";
import { bare, device, loc } from "./fixtures.testing.ts";

const GENERAL: GeneralSettings = {
  hostname: "nas-host",
  domainname: "example.org",
};

const enp2s0 = device("enp2s0", {
  address: "192.0.2.10",
  prefix: 24,
  netmask: "255.255.255.0",
  address6: "2001:db8::10",
  prefix6: 64,
});
const enp3s0 = device("enp3s0", { address: "198.51.100.20", prefix: 24 });
const lo = device("lo", {
  type: "loopback",
  address: "127.0.0.1",
  prefix: 8,
  address6: "::1",
});
const vpn = device("wg0", {
  type: "virtual",
  address: "203.0.113.5",
  prefix: 32,
});
const unset = bare("enp4s0", { address: "203.0.113.50", prefix: 24 });
const linkLocalOnly = device("enp5s0", { address6: "fe80::5", prefix6: 64 });

const work = (
  hostname: string,
  devices: readonly DeviceRow[],
  general: GeneralSettings = GENERAL,
) =>
  workOutConnection({
    location: loc(hostname),
    devices: ok(devices),
    general: ok(general),
  });

describe("0.4: which connection this page uses", () => {
  it.each<[string, string, readonly DeviceRow[], Partial<Connection>]>([
    [
      "an IPv4 address an interface uses now: Known",
      "192.0.2.10",
      [lo, enp2s0, enp3s0],
      { kind: "known", iface: "enp2s0", address: "192.0.2.10", family: 4 },
    ],
    [
      "an IPv6 literal in brackets: Known, IPv6",
      "[2001:db8::10]",
      [lo, enp2s0, enp3s0],
      { kind: "known", iface: "enp2s0", address: "2001:db8::10", family: 6 },
    ],
    [
      "an IPv6 literal written longer, in capitals: Known",
      "[2001:DB8:0:0:0:0:0:10]",
      [enp2s0],
      {
        kind: "known",
        iface: "enp2s0",
        address: "2001:db8::10",
        family: 6,
        host: "2001:db8::10",
      },
    ],
    [
      "a link-local literal with a zone: the zone is the browser's, dropped",
      "[fe80::5%25eth0]",
      [enp2s0, linkLocalOnly],
      { kind: "known", iface: "enp5s0", address: "fe80::5", family: 6 },
    ],
    [
      "the NAS's name with one interface with an address: Probably known",
      "nas-host",
      [lo, enp2s0, linkLocalOnly],
      {
        kind: "probable",
        iface: "enp2s0",
        nameForm: "short",
        host: "nas-host",
      },
    ],
    [
      "the name with its domain, in capitals: Probably known",
      "NAS-HOST.Example.ORG",
      [enp2s0],
      { kind: "probable", iface: "enp2s0", nameForm: "fqdn" },
    ],
    [
      "the .local name with a final dot: Probably known",
      "nas-host.local.",
      [enp2s0, vpn],
      { kind: "probable", iface: "enp2s0", nameForm: "local" },
    ],
    [
      "the name with several interfaces with addresses: Name only",
      "nas-host",
      [enp2s0, enp3s0],
      { kind: "nameOnly", nameForm: "short", host: "nas-host" },
    ],
    [
      "an address no interface reports: Not known",
      "203.0.113.99",
      [enp2s0, enp3s0],
      { kind: "unknownAddress", host: "203.0.113.99", family: 4 },
    ],
    [
      "an IPv6 address no interface reports (a privacy address): Not known",
      "[2001:db8::99]",
      [enp2s0],
      { kind: "unknownAddress", family: 6 },
    ],
    [
      "any other name: Not known, by name",
      "files.example.org",
      [enp2s0],
      { kind: "otherName", host: "files.example.org" },
    ],
    [
      "localhost: a tunnel",
      "localhost",
      [enp2s0],
      { kind: "tunnel", families: [4, 6] },
    ],
    [
      "LOCALHOST in capitals: a tunnel",
      "LOCALHOST",
      [enp2s0],
      { kind: "tunnel" },
    ],
    [
      "127.0.0.1: a tunnel",
      "127.0.0.1",
      [enp2s0],
      { kind: "tunnel", families: [4] },
    ],
    ["[::1]: a tunnel", "[::1]", [enp2s0], { kind: "tunnel", families: [6] }],
    [
      "a virtual interface's address: Known, outside the network settings",
      "203.0.113.5",
      [enp2s0, vpn],
      { kind: "unmanaged", iface: "wg0", virtual: true },
    ],
    [
      "a port without settings: Known, outside the network settings",
      "203.0.113.50",
      [enp2s0, unset],
      { kind: "unmanaged", iface: "enp4s0", virtual: false },
    ],
  ])("%s", (_what, hostname, devices, expected) => {
    expect(work(hostname, devices)).toMatchObject(expected);
  });

  it("does not count loopback, virtual interfaces, members or link-local-only ones for the one-interface inference", () => {
    const bond = device("bond0", {
      type: "bond",
      address: "192.0.2.30",
      prefix: 24,
      slaves: ["enp6s0", "enp7s0"],
    });
    const port1 = device("enp6s0", { _readonly: true, address: "192.0.2.31" });
    const port2 = device("enp7s0", { address: "192.0.2.32" });
    expect(
      work("nas-host", [lo, vpn, bond, port1, port2, linkLocalOnly]),
    ).toMatchObject({
      kind: "probable",
      iface: "bond0",
      under: ["enp6s0", "enp7s0"],
    });
  });

  it("a bond's port as enumerateDevicesList lists it (method empty, _readonly) is a member, not this page's", () => {
    const bond = device("bond0", {
      type: "bond",
      address: "192.0.2.30",
      prefix: 24,
      slaves: [],
    });
    const port = device("enp6s0", { method: "", _readonly: true, address: "" });
    expect(work("nas-host", [bond, port])).toMatchObject({
      kind: "probable",
      iface: "bond0",
    });
  });

  it("a name without any interface with an address is Name only, never Probably known", () => {
    expect(work("nas-host", [lo, linkLocalOnly])).toMatchObject({
      kind: "nameOnly",
    });
  });

  it("without a domain, the name with a domain is another name", () => {
    expect(
      work("nas-host.example.org", [enp2s0], {
        hostname: "nas-host",
        domainname: "",
      }),
    ).toMatchObject({
      kind: "otherName",
    });
  });

  it.each([
    ["the interfaces failed", "192.0.2.10", failed, ok(GENERAL)],
    ["the interfaces failed, by name", "nas-host", failed, ok(GENERAL)],
    ["the name failed, opened by name", "nas-host", ok([enp2s0]), failed],
  ] as const)(
    "a failed read makes it Not known, never Known: %s",
    (_what, hostname, devices, general) => {
      const c = workOutConnection({
        location: loc(hostname),
        devices,
        general,
      });
      expect(c.kind).toBe("readFailed");
      expect(certainty(c)).toBe("notKnown");
    },
  );

  it("opened at an address, the name's read is not needed", () => {
    const c = workOutConnection({
      location: loc("192.0.2.10"),
      devices: ok([enp2s0]),
      general: failed,
    });
    expect(c.kind).toBe("known");
  });

  it.each([
    ["the interfaces are on their way", loading, ok(GENERAL)],
    ["the name is on its way", ok([enp2s0]), loading],
  ] as const)("loading while %s", (_what, devices, general) => {
    expect(
      workOutConnection({ location: loc("nas-host"), devices, general }).kind,
    ).toBe("loading");
  });

  it.each(["", "[2001:db8::1", "[not-an-address]", "2001:db8::1"])(
    "a host a browser does not give (%j) is a failed read",
    (hostname) => {
      expect(parsePageHost(hostname)).toBeNull();
      expect(work(hostname, [enp2s0]).kind).toBe("readFailed");
    },
  );
});

describe("everything under an interface (0.4)", () => {
  const bond = device("bond0", { type: "bond", slaves: ["enp6s0", "enp7s0"] });
  const vlan = device("bond0.10", {
    type: "vlan",
    vlanid: 10,
    address: "192.0.2.40",
    prefix: 24,
  });
  const bridge = device("br0", {
    type: "bridge",
    slaves: ["bond0", "enp8s0"],
    address: "198.51.100.40",
    prefix: 24,
  });
  const rows = [
    bond,
    vlan,
    bridge,
    device("enp6s0"),
    device("enp7s0"),
    device("enp8s0"),
  ];

  it.each([
    [
      "a VLAN: its parent, and the bond's ports",
      "bond0.10",
      ["bond0", "enp6s0", "enp7s0"],
    ],
    [
      "a bridge: its interfaces, and the ports of a bond inside it",
      "br0",
      ["bond0", "enp6s0", "enp7s0", "enp8s0"],
    ],
    ["a bond: its ports", "bond0", ["enp6s0", "enp7s0"]],
    ["a port: nothing", "enp6s0", []],
  ])("%s", (_what, name, expected) => {
    expect(interfacesUnder(name, rows)).toEqual(expected);
  });

  it("a cycle in what the rows say is followed once", () => {
    const a = device("a", { slaves: ["b"] });
    const b = device("b", { slaves: ["a"] });
    expect(interfacesUnder("a", [a, b])).toEqual(["b"]);
  });

  it.each([
    [device("enp2s0.20", { type: "vlan", vlanid: 20 }), "enp2s0"],
    [
      device("v20", { type: "vlan", vlanid: 20, vlanrawdevice: "enp3s0" }),
      "enp3s0",
    ],
    [device("enp2s0"), null],
  ])("a VLAN's parent: %s", (row, parent) => {
    expect(vlanParent(row)).toBe(parent);
  });

  it("the page on a VLAN: the VLAN is this, its parent and the bond's ports are under, the bridge is other", () => {
    const c = work("192.0.2.40", rows);
    expect(c).toMatchObject({ kind: "known", iface: "bond0.10" });
    expect(standing(c, "bond0.10")).toBe("this");
    expect(standing(c, "bond0")).toBe("under");
    expect(standing(c, "enp6s0")).toBe("under");
    expect(standing(c, "br0")).toBe("other");
  });
});

describe("what the conclusion means", () => {
  const known = work("192.0.2.10", [enp2s0, enp3s0]);
  const probable = work("nas-host", [enp2s0]);
  const nameOnly = work("nas-host", [enp2s0, enp3s0]);
  const vpnPage = work("203.0.113.5", [enp2s0, vpn]);
  const tunnel = work("localhost", [enp2s0]);

  it.each([
    [known, "known", [4]],
    [probable, "probable", [4, 6]],
    [nameOnly, "notKnown", [4, 6]],
    [vpnPage, "known", [4]],
    [tunnel, "notKnown", [4, 6]],
    [work("[2001:db8::10]", [enp2s0]), "known", [6]],
  ] as const)("%o: certainty and families", (c, sure, families) => {
    expect(certainty(c)).toBe(sure);
    expect(pageFamilies(c)).toEqual(families);
  });

  it.each([
    [known, "enp2s0", "this"],
    [known, "enp3s0", "other"],
    [probable, "enp2s0", "this"],
    [nameOnly, "enp2s0", "unknown"],
    [nameOnly, "enp3s0", "unknown"],
    [vpnPage, "wg0", "this"],
    [vpnPage, "enp2s0", "other"],
    [tunnel, "enp2s0", "unknown"],
  ] as const)("standing of %s", (c, name, expected) => {
    expect(standing(c, name)).toBe(expected);
  });

  it("the NAS's address is known only for Known, or loopback through a tunnel", () => {
    expect(nasAddress(known, 4)).toEqual({ family: 4, value: 0xc000020a });
    expect(nasAddress(known, 6)).toBeNull();
    expect(nasAddress(probable, 4)).toBeNull();
    expect(nasAddress(tunnel, 4)).toEqual({ family: 4, value: 0x7f000001 });
    expect(nasAddress(tunnel, 6)).toEqual({ family: 6, value: 1n });
  });

  it("Known keeps the interface's network for the same-network hint", () => {
    expect(known).toMatchObject({
      network: { family: 4, start: 0xc0000200n, prefix: 24 },
    });
  });
});

describe("the web ports and the SSH port (0.4)", () => {
  const gui = { port: 80, enablessl: true, sslport: 443, forcesslonly: false };

  it.each([
    [
      "http, default port",
      loc("192.0.2.10", "http:"),
      ok(gui),
      { scheme: "http", page: 80, others: [{ scheme: "https", port: 443 }] },
    ],
    [
      "https, default port",
      loc("192.0.2.10", "https:"),
      ok(gui),
      { scheme: "https", page: 443, others: [{ scheme: "http", port: 80 }] },
    ],
    [
      "http on 8080",
      loc("192.0.2.10", "http:", "8080"),
      ok({ ...gui, port: 8080, enablessl: false }),
      { page: 8080, others: [] },
    ],
    [
      "a port neither of the web interface's",
      loc("192.0.2.10", "https:", "8443"),
      ok(gui),
      {
        page: 8443,
        others: [
          { scheme: "http", port: 80 },
          { scheme: "https", port: 443 },
        ],
      },
    ],
    [
      "WebGui.getSettings failed: this page's port only",
      loc("192.0.2.10", "https:"),
      failed,
      { page: 443, others: [], othersUnread: true },
    ],
  ] as const)("%s", (_what, location, webGui, expected) => {
    expect(webPorts(location, webGui)).toMatchObject(expected);
  });

  it("through a tunnel, the NAS's own port for the page's scheme", () => {
    const tunnel = work("localhost", [enp2s0]);
    expect(
      webPorts(loc("localhost", "http:", "8080"), ok(gui), tunnel),
    ).toMatchObject({ page: 80 });
  });

  it.each([
    [ok({ enable: true, port: 2222 }), { kind: "on", port: 2222 }],
    [ok({ enable: false, port: 22 }), { kind: "off" }],
    [failed, { kind: "unread" }],
  ] as const)("SSH %o", (read, expected) => {
    expect(sshPort(read)).toEqual(expected);
  });
});

describe("{{pageUrl}} (0.2)", () => {
  it.each([
    [loc("192.0.2.10", "http:"), "192.0.2.20", "http://192.0.2.20/ui/"],
    [
      loc("192.0.2.10", "https:", "8443"),
      "192.0.2.20",
      "https://192.0.2.20:8443/ui/",
    ],
    [
      loc("192.0.2.10", "http:"),
      "2001:DB8:0:0:0:0:0:20",
      "http://[2001:db8::20]/ui/",
    ],
    [loc("192.0.2.10", "http:"), "[2001:db8::20]", "http://[2001:db8::20]/ui/"],
    [loc("nas-host", "https:"), "new-name", "https://new-name/ui/"],
  ])("%o at %s", (location, host, expected) => {
    expect(pageUrl(location, host)).toBe(expected);
  });

  it("the .local address is built from the name, in lower case", () => {
    expect(localUrl("NAS-Host")).toBe("http://nas-host.local/ui/");
  });
});
