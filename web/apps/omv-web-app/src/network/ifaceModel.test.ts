// SPDX-License-Identifier: GPL-3.0-or-later
// network/ifaceModel.ts: the list's rows and attention lines (3.2), stored against in use (0.3, 1.8),
// "Set up…" (3.2 item 4), the address part's checks (5.3), bonds, VLANs, bridges and Wi-Fi (6 to 9),
// removing settings (10.1, 10.2), the note (1.4) and the bodies of 0.9.
import { describe, expect, it } from "vitest";
import type { Connection } from "./connection.ts";
import { failed, NEW_OBJECT_UUID, ok, type IfaceSettings } from "./dto.ts";
import { bare, device, KNOWN, settings } from "./fixtures.testing.ts";
import {
  addressDraftOf,
  adoptDraft,
  attentionLines,
  bondModeOf,
  bondRequest,
  bondWarnsOnePort,
  checkAddresses,
  checkBond,
  checkMac,
  checkVlan,
  checkWifi,
  commaList,
  connectionWord,
  currentSettingsNote,
  deleteRequest,
  differsFromInUse,
  ethernetRequest,
  hashPolicyOf,
  interfaceRows,
  memberRefusal,
  mtuOf,
  NEW_ADDRESS_DRAFT,
  otherAddresses,
  removalLosses,
  removalRefusal,
  restoreAsNew,
  restoreChanged,
  sameSettings,
  setUpMenu,
  sizeReadout,
  splitList,
  stateWord,
  vlanRequest,
  wifiRequest,
  type AddressDraft,
  type BondDraft,
} from "./ifaceModel.ts";

const fixed = (over: Partial<AddressDraft> = {}): AddressDraft => ({
  ...NEW_ADDRESS_DRAFT,
  method: "static",
  address: "192.0.2.20",
  size: "24",
  gateway: "192.0.2.1",
  dnsnameservers: "192.0.2.1",
  ...over,
});
const NO_OTHERS = { others: [] };
const codes = (
  draft: AddressDraft,
  context: Parameters<typeof checkAddresses>[1] = NO_OTHERS,
) => checkAddresses(draft, context).map((p) => p.code);

describe("words for what an interface does (0.3)", () => {
  it.each([
    [
      { link: true, speed: 1000 },
      { kind: "connected", speed: 1000 },
    ],
    [
      { link: true, speed: -1 },
      { kind: "connected", speed: null },
    ],
    [{ link: false, speed: -1 }, { kind: "notConnected" }],
  ])("%o", (row, expected) => {
    expect(connectionWord(row)).toEqual(expected);
  });

  it.each([
    ["UP", { key: "iface.state.up" }],
    ["DOWN", { key: "iface.state.down" }],
    ["LOWERLAYERDOWN", { key: "iface.state.lowerDown" }],
    ["DORMANT", { key: "iface.state.dormant" }],
    ["NOTPRESENT", { key: "iface.state.notPresent" }],
    ["TESTING", { key: "iface.state.testing" }],
    ["UNKNOWN", { key: "iface.state.unknown" }],
    ["SOMETHING", { key: null, value: "SOMETHING" }],
  ])("the state %s", (state, expected) => {
    expect(stateWord(state)).toEqual(expected);
  });
});

describe("stored settings against what is in use (0.3, 1.8)", () => {
  const live = device("enp2s0", {
    address: "192.0.2.10",
    prefix: 24,
    gateway: "192.0.2.1",
    mtu: "1500",
    ether: "00:00:5e:00:53:01",
  });
  const stored = settings("enp2s0", {
    method: "static",
    address: "192.0.2.10",
    netmask: "255.255.255.0",
    gateway: "192.0.2.1",
  });

  it.each<[string, Partial<IfaceSettings>, string[]]>([
    ["the same", {}, []],
    ["another fixed address", { address: "192.0.2.20" }, ["address"]],
    ["another size", { netmask: "255.255.0.0" }, ["netmask"]],
    ["another router", { gateway: "192.0.2.254" }, ["gateway"]],
    ["IPv4 off with an address", { method: "manual" }, ["method"]],
    ["automatic: not comparable", { method: "dhcp", address: "" }, []],
    ["another packet size", { mtu: 9000 }, ["mtu"]],
    ["Standard packet size", { mtu: 0 }, []],
    [
      "another hardware address",
      { altmacaddress: "00:00:5e:00:53:99" },
      ["altmacaddress"],
    ],
    [
      "the same hardware address in capitals",
      { altmacaddress: "00:00:5E:00:53:01" },
      [],
    ],
    [
      "IPv6 fixed, not in use",
      { method6: "static", address6: "2001:db8::10", netmask6: 64 },
      ["address6"],
    ],
  ])("%s", (_what, over, fields) => {
    expect(
      differsFromInUse({ ...stored, ...over }, live).map((d) => d.field),
    ).toEqual(fields);
  });

  it("an IPv6 fixed address in use, link-local ignored", () => {
    const live6 = device("enp2s0", { address6: "2001:db8::10", prefix6: 64 });
    const stored6 = settings("enp2s0", {
      method: "dhcp",
      method6: "static",
      address6: "2001:DB8:0:0:0:0:0:10",
      netmask6: 64,
    });
    expect(differsFromInUse(stored6, live6)).toEqual([]);
    expect(
      differsFromInUse(
        { ...stored6, method6: "manual" },
        device("enp2s0", { address6: "fe80::1" }),
      ),
    ).toEqual([]);
  });
});

describe("the list (3.2)", () => {
  const enp2s0 = device("enp2s0", {
    address: "192.0.2.10",
    prefix: 24,
    address6: "fe80::10",
    prefix6: 64,
  });
  const bond = device("bond0", {
    type: "bond",
    slaves: ["enp6s0", "enp7s0"],
    address: "198.51.100.5",
    prefix: 24,
  });
  const vlan = device("bond0.10", { type: "vlan", vlanid: 10, link: false });
  const ports = [device("enp6s0", { _readonly: true }), device("enp7s0")];
  const devices = [
    device("lo", { type: "loopback" }),
    enp2s0,
    ...ports,
    bond,
    vlan,
    device("veth1", { type: "virtual" }),
    device("veth2", { type: "virtual" }),
    bare("enp3s0"),
  ];
  const stored = [
    settings("enp2s0", {
      method: "static",
      address: "192.0.2.20",
      netmask: "255.255.255.0",
    }),
    settings("bond0", { type: "bond", slaves: ["enp6s0", "enp7s0"] }),
    settings("bond0.10", { type: "vlan", vlanrawdevice: "bond0", vlanid: 10 }),
  ];
  const list = interfaceRows({
    devices,
    stored: ok(stored),
    connection: KNOWN,
    savedThisSession: [],
    pending: [],
  });

  it("leaves loopback out, counts virtual ones, lists members under their bond", () => {
    expect(list.rows.map((r) => [r.devicename, r.depth])).toEqual([
      ["enp2s0", 0],
      ["bond0", 0],
      ["enp6s0", 1],
      ["enp7s0", 1],
      ["bond0.10", 0],
      ["enp3s0", 0],
    ]);
    expect(list.virtualHidden).toBe(2);
  });

  it("each row's words", () => {
    const row = (name: string) => list.rows.find((r) => r.devicename === name);
    expect(row("enp2s0")).toMatchObject({
      thisPage: true,
      ipv4: {
        how: "interfaces.how.static",
        inUse: { text: "192.0.2.10/24", linkLocal: false },
      },
      ipv6: {
        how: "interfaces.how.off",
        inUse: { text: "fe80::10/64", linkLocal: true },
      },
      notApplied: true,
    });
    expect(row("enp6s0")).toMatchObject({ partOf: "bond0", thisPage: false });
    expect(row("bond0.10")).toMatchObject({
      runsOn: "bond0",
      kind: "vlan",
      ipv4: { inUse: null },
    });
    expect(row("enp3s0")).toMatchObject({
      ipv4: { how: "interfaces.how.notSetUp" },
      settings: null,
    });
  });

  it("settings not read: Settings not read", () => {
    const unread = interfaceRows({
      devices,
      stored: failed,
      connection: KNOWN,
      savedThisSession: [],
      pending: [],
    });
    expect(unread.rows[0]?.ipv4.how).toBe("interfaces.how.unread");
  });

  it("the pending mark for what this session saved, while the network is pending", () => {
    const saved = stored[1]?.uuid ?? "";
    const marked = (pending: string[]) =>
      interfaceRows({
        devices,
        stored: ok(stored),
        connection: KNOWN,
        savedThisSession: [saved],
        pending,
      }).rows.find((r) => r.devicename === "bond0")?.notApplied;
    expect(marked(["systemd-networkd"])).toBe(true);
    expect(marked([])).toBe(false);
  });

  it("attention lines, worst first", () => {
    const unmanaged: Connection = {
      kind: "unmanaged",
      host: "203.0.113.50",
      iface: "enp3s0",
      address: "203.0.113.50",
      family: 4,
      network: null,
      virtual: false,
    };
    const noAddress = settings("bond0.10", {
      type: "vlan",
      method: "static",
      address: "192.0.2.40",
      netmask: "255.255.255.0",
    });
    const rows = interfaceRows({
      devices,
      stored: ok([stored[0]!, stored[1]!, noAddress]),
      connection: unmanaged,
      savedThisSession: [],
      pending: [],
    }).rows;
    expect(attentionLines(rows, devices, unmanaged)).toEqual([
      { code: "interfaces.attn.noAddress", iface: "bond0.10" },
      { code: "interfaces.attn.notConnected", iface: "bond0.10" },
      { code: "interfaces.attn.notApplied", iface: "enp2s0" },
      { code: "interfaces.attn.notApplied", iface: "bond0.10" },
      { code: "interfaces.attn.unmanaged", iface: "enp3s0" },
    ]);
  });

  it("no unmanaged line for a VPN", () => {
    const vpn: Connection = {
      kind: "unmanaged",
      host: "203.0.113.5",
      iface: "wg0",
      address: "203.0.113.5",
      family: 4,
      network: null,
      virtual: true,
    };
    expect(attentionLines([], devices, vpn)).toEqual([]);
  });
});

describe('"Set up…" (3.2 item 4)', () => {
  it.each([
    [
      "a free port",
      [bare("enp3s0")],
      [],
      { port: true, wifi: false, bond: true, vlan: false, bridge: true },
    ],
    [
      "free Wi-Fi",
      [bare("wlan0", { type: "wifi" })],
      [],
      { port: false, wifi: true, bond: false, vlan: false, bridge: false },
    ],
    [
      "an interface with settings",
      [device("enp2s0")],
      [settings("enp2s0")],
      { port: false, wifi: false, bond: false, vlan: true, bridge: false },
    ],
    [
      "a VLAN only",
      [device("enp2s0.10")],
      [settings("enp2s0.10", { type: "vlan" })],
      { port: false, wifi: false, bond: false, vlan: false, bridge: false },
    ],
  ] as const)("%s", (_what, devices, stored, expected) => {
    const menu = setUpMenu(ok(devices), ok(stored));
    expect(
      Object.fromEntries(
        Object.entries(menu).map(([k, v]) => [k, v.available]),
      ),
    ).toEqual(expected);
  });

  it("the reasons", () => {
    const menu = setUpMenu(ok([device("enp2s0")]), ok([settings("enp2s0")]));
    expect(menu.port).toEqual({
      available: false,
      code: "interfaces.add.noPort",
    });
    expect(menu.wifi).toEqual({
      available: false,
      code: "interfaces.add.noWifi",
    });
    expect(menu.bond).toEqual({
      available: false,
      code: "interfaces.add.noBond",
    });
    expect(menu.bridge).toEqual({
      available: false,
      code: "interfaces.add.noBridge",
    });
    expect(setUpMenu(ok([]), ok([])).vlan).toEqual({
      available: false,
      code: "interfaces.add.noVlan",
    });
  });

  it.each([
    [failed, ok([]), "interfaces.loadFailed"],
    [ok([]), failed, "interfaces.settingsFailed"],
  ] as const)(
    "a failed read makes every item unavailable",
    (devices, stored, code) => {
      expect(setUpMenu(devices, stored).port).toEqual({
        available: false,
        code,
      });
    },
  );
});

describe("5.3: the address part's checks", () => {
  it("a valid fixed address passes", () => {
    expect(codes(fixed())).toEqual([]);
  });

  it.each<[string, Partial<AddressDraft>, string[]]>([
    ["not an IPv4 address", { address: "192.0.2.300" }, ["ifaceForm.err.ipv4"]],
    [
      "an IPv6 address in the IPv4 field",
      { address: "2001:db8::1" },
      ["ifaceForm.err.ipv4"],
    ],
    [
      "the network's first address",
      { address: "192.0.2.0" },
      ["ifaceForm.err.networkAddress"],
    ],
    [
      "the network's last address",
      { address: "192.0.2.255" },
      ["ifaceForm.err.networkAddress"],
    ],
    ["0.0.0.0", { address: "0.0.0.0" }, ["ifaceForm.err.reserved"]],
    [
      "a loopback address",
      { address: "127.0.0.2" },
      ["ifaceForm.err.reserved"],
    ],
    [
      "a multicast address",
      { address: "224.0.0.5" },
      ["ifaceForm.err.reserved"],
    ],
    [
      "a link-local address",
      { address: "169.254.1.1" },
      ["ifaceForm.err.reserved"],
    ],
    ["a network size of /0", { size: "0" }, ["ifaceForm.err.size"]],
    ["a network size of 33", { size: "33" }, ["ifaceForm.err.size"]],
    ["a mask that is not one", { size: "255.0.255.0" }, ["ifaceForm.err.size"]],
    ["a size as a mask", { size: "255.255.255.0" }, []],
    ["a size as /24", { size: "/24" }, []],
    [
      "/31 with a router",
      { size: "31", address: "192.0.2.0", gateway: "192.0.2.1" },
      ["ifaceForm.err.gatewayNetwork"],
    ],
    [
      "/32 with a router",
      { size: "32", gateway: "192.0.2.1" },
      ["ifaceForm.err.gatewayNetwork"],
    ],
    [
      "/32 without a router",
      { size: "32", gateway: "", dnsnameservers: "" },
      [],
    ],
    [
      "a router not on the network",
      { gateway: "198.51.100.1" },
      ["ifaceForm.err.gatewayNetwork"],
    ],
    [
      "the router is the NAS",
      { gateway: "192.0.2.20" },
      ["ifaceForm.err.gatewaySelf"],
    ],
    [
      "a router that is not an address",
      { gateway: "router" },
      ["ifaceForm.err.ipv4"],
    ],
    [
      "a name server that is not an address",
      { dnsnameservers: "192.0.2.1\nns.example.org" },
      ["ifaceForm.err.dnsServer"],
    ],
    [
      "a fixed address with a router and no name server",
      { dnsnameservers: "" },
      ["ifaceForm.err.dnsNone"],
    ],
    [
      "a search domain that is not a domain",
      { dnssearch: "example.org, bad_domain" },
      ["ifaceForm.err.search"],
    ],
    ["a packet size of 575", { mtu: "575" }, ["ifaceForm.err.mtu"]],
    ["a packet size of 576 with IPv6 off", { mtu: "576" }, []],
    [
      "a packet size of 1279 with IPv6 on",
      { mtu: "1279", method6: "auto" },
      ["ifaceForm.err.mtu"],
    ],
    ["a packet size of 9216", { mtu: "9216" }, []],
    ["a packet size of 9217", { mtu: "9217" }, ["ifaceForm.err.mtu"]],
    [
      "a group hardware address",
      { altmacaddress: "01:00:5e:00:53:01" },
      ["ifaceForm.err.mac"],
    ],
    [
      "an all-zero hardware address",
      { altmacaddress: "00:00:00:00:00:00" },
      ["ifaceForm.err.mac"],
    ],
    [
      "a route priority of 65536",
      { routemetric: "65536" },
      ["ifaceForm.err.metric"],
    ],
  ])("%s", (_what, over, expected) => {
    expect(codes(fixed(over))).toEqual(expected);
  });

  it("the network's first and last say which addresses are free", () => {
    expect(
      checkAddresses(fixed({ address: "192.0.2.0" }), NO_OTHERS)[0],
    ).toEqual({
      field: "address",
      code: "ifaceForm.err.networkAddress",
      value: "192.0.2.0",
      first: "192.0.2.1",
      last: "192.0.2.254",
    });
  });

  it("an address another interface uses", () => {
    const others = otherAddresses(
      "enp3s0",
      [device("enp2s0", { address: "192.0.2.20" }), device("enp3s0")],
      [],
    );
    expect(checkAddresses(fixed(), { others })).toContainEqual({
      field: "address",
      code: "ifaceForm.err.duplicate",
      iface: "enp2s0",
      value: "192.0.2.20",
    });
  });

  it("an address another interface is set up with but does not use yet", () => {
    const others = otherAddresses(
      "enp3s0",
      [],
      [settings("enp2s0", { method: "static", address: "192.0.2.20" })],
    );
    expect(codes(fixed(), { others })).toContain("ifaceForm.err.duplicate");
  });

  it("the interface's own address is not a duplicate", () => {
    const others = otherAddresses(
      "enp2s0",
      [device("enp2s0", { address: "192.0.2.20" })],
      [],
    );
    expect(codes(fixed(), { others })).toEqual([]);
  });

  it.each<[string, Partial<AddressDraft>, string[]]>([
    ["a valid IPv6 fixed address", {}, []],
    ["not an IPv6 address", { address6: "192.0.2.1" }, ["ifaceForm.err.ipv6"]],
    [
      "a link-local fixed address",
      { address6: "fe80::1" },
      ["ifaceForm.err.reserved"],
    ],
    ["a prefix of 0", { prefix6: "0" }, ["ifaceForm.err.prefix"]],
    ["a prefix of 129", { prefix6: "129" }, ["ifaceForm.err.prefix"]],
    ["a link-local router is on every network", { gateway6: "fe80::1" }, []],
    [
      "a global router off the network",
      { gateway6: "2001:db8:1::1" },
      ["ifaceForm.err.gatewayNetwork"],
    ],
    [
      "the router is the NAS",
      { gateway6: "2001:db8::10" },
      ["ifaceForm.err.gatewaySelf"],
    ],
  ])("IPv6: %s", (_what, over, expected) => {
    const draft = {
      ...NEW_ADDRESS_DRAFT,
      method: "dhcp" as const,
      method6: "static" as const,
      address6: "2001:db8::10",
      prefix6: "64",
      gateway6: "2001:db8::1",
      ...over,
    };
    expect(codes(draft)).toEqual(expected);
  });

  it("a VLAN on its parent's network (8.1)", () => {
    const context = {
      others: [],
      vlanParent: {
        devicename: "enp2s0",
        networks: [{ family: 4 as const, start: 0xc0000200n, prefix: 24 }],
      },
    };
    expect(checkAddresses(fixed(), context)).toContainEqual({
      field: "address",
      code: "vlan.err.sameNetwork",
      parent: "enp2s0",
      network: "192.0.2.0/24",
    });
  });

  it("automatic needs no address", () => {
    expect(codes({ ...NEW_ADDRESS_DRAFT })).toEqual([]);
  });

  it.each([
    ["", "manual", 0],
    ["0", "auto", 0],
    ["9000", "auto", 9000],
    ["1280", "auto", 1280],
    ["1000", "manual", 1000],
    ["1000", "auto", null],
    ["abc", "manual", null],
    ["01500", "manual", null],
  ] as const)(
    "the packet size %j with IPv6 %s is %o",
    (text, method6, expected) => {
      expect(mtuOf(text, method6)).toBe(expected);
    },
  );

  it.each([
    ["00:00:5e:00:53:01", true],
    ["00:00:5E:00:53:01", true],
    ["02:00:5e:00:53:01", true],
    ["03:00:5e:00:53:01", false],
    ["00-00-5e-00-53-01", false],
    ["00:00:5e:00:53", false],
  ])("hardware address %s", (text, expected) => {
    expect(checkMac(text)).toBe(expected);
  });

  it("the network-size readout (5.2)", () => {
    expect(sizeReadout("192.0.2.10", "24")).toEqual({
      network: "192.0.2.0/24",
      first: "192.0.2.1",
      last: "192.0.2.254",
      count: 254,
    });
    expect(sizeReadout("192.0.2.10", "255.255.255.252")).toEqual({
      network: "192.0.2.8/30",
      first: "192.0.2.9",
      last: "192.0.2.10",
      count: 2,
    });
    expect(sizeReadout("x", "24")).toBeNull();
  });

  it.each([
    ["192.0.2.1, 192.0.2.2", ["192.0.2.1", "192.0.2.2"]],
    ["192.0.2.1\n192.0.2.2;192.0.2.1", ["192.0.2.1", "192.0.2.2"]],
    ["  ", []],
  ])("splitList(%j)", (text, expected) => {
    expect(splitList(text)).toEqual(expected);
  });
});

describe("bonds, VLANs, bridges and Wi-Fi", () => {
  const devices = [
    device("enp2s0", { address: "192.0.2.10" }),
    bare("enp3s0"),
    bare("enp4s0"),
    device("bond0", { type: "bond", slaves: ["enp5s0"] }),
    device("enp5s0", { _readonly: true }),
  ];
  const stored = [
    settings("enp2s0"),
    settings("bond0", { type: "bond", slaves: ["enp5s0"] }),
    settings("enp6s0"),
    settings("enp6s0.10", {
      type: "vlan",
      vlanrawdevice: "enp6s0",
      vlanid: 10,
    }),
  ];

  it.each([
    ["this page's port", "enp2s0", "bond.thisPagePort"],
    ["a port with settings", "enp6s0", "hasSettings"],
    ["a port in another bond", "enp5s0", "member"],
    ["a free port", "enp3s0", null],
  ])("as a member: %s", (_what, name, code) => {
    expect(
      memberRefusal(name, { connection: KNOWN, devices, stored })?.code ?? null,
    ).toBe(code);
  });

  it("a bond's own ports stay allowed when it is changed", () => {
    expect(
      memberRefusal("enp5s0", {
        connection: KNOWN,
        devices,
        stored,
        ownMembers: ["enp5s0"],
      }),
    ).toBeNull();
  });

  it("a port a VLAN runs on", () => {
    const vlanOnBare = [
      ...devices,
      device("enp4s0.20", { type: "vlan", vlanid: 20 }),
    ];
    expect(
      memberRefusal("enp4s0", {
        connection: KNOWN,
        devices: vlanOnBare,
        stored: [],
      }),
    ).toEqual({ code: "vlanOn", iface: "enp4s0", vlan: "enp4s0.20" });
  });

  it.each([
    [
      { slaves: [], bondmode: 1, bondprimary: "" },
      ["bond.err.noPort", "bond.err.primary"],
    ],
    [
      { slaves: ["enp3s0"], bondmode: 1, bondprimary: "" },
      ["bond.err.primary"],
    ],
    [
      { slaves: ["enp3s0"], bondmode: 6, bondprimary: "" },
      ["bond.err.primary"],
    ],
    [{ slaves: ["enp3s0"], bondmode: 4, bondprimary: "" }, []],
    [
      { slaves: ["enp3s0", "enp4s0"], bondmode: 1, bondprimary: "enp9s0" },
      ["bond.err.primary"],
    ],
    [{ slaves: ["enp3s0", "enp4s0"], bondmode: 1, bondprimary: "enp4s0" }, []],
  ] satisfies [BondDraft, string[]][])("a bond %o", (draft, expected) => {
    expect(checkBond(draft).map((p) => p.code)).toEqual(expected);
  });

  it("a bond of one port warns", () => {
    expect(
      bondWarnsOnePort({ slaves: ["enp3s0"], bondmode: 4, bondprimary: "" }),
    ).toBe(true);
    expect(
      bondWarnsOnePort({
        slaves: ["enp3s0", "enp4s0"],
        bondmode: 4,
        bondprimary: "",
      }),
    ).toBe(false);
  });

  it.each([
    ["1", []],
    ["4094", []],
    ["0", ["vlan.err.id"]],
    ["4095", ["vlan.err.id"]],
    ["01", ["vlan.err.id"]],
    ["x", ["vlan.err.id"]],
    ["10", ["vlan.err.taken"]],
  ])("the VLAN ID %j on enp6s0", (vlanid, expected) => {
    expect(
      checkVlan({ vlanrawdevice: "enp6s0", vlanid }, stored).map((p) => p.code),
    ).toEqual(expected);
  });

  it.each([
    [{ wpassid: "EXAMPLE-NETWORK", wpapsk: "EXAMPLE-PASSWORD" }, []],
    [{ wpassid: "", wpapsk: "EXAMPLE-PASSWORD" }, ["wifi.err.name"]],
    [
      { wpassid: "x".repeat(33), wpapsk: "EXAMPLE-PASSWORD" },
      ["wifi.err.name"],
    ],
    [
      { wpassid: "é".repeat(17), wpapsk: "EXAMPLE-PASSWORD" },
      ["wifi.err.name"],
    ],
    [{ wpassid: "x".repeat(32), wpapsk: "EXAMPLE-PASSWORD" }, []],
    [{ wpassid: "EXAMPLE-NETWORK", wpapsk: "short" }, ["wifi.err.password"]],
    [{ wpassid: "EXAMPLE-NETWORK", wpapsk: "x".repeat(63) }, []],
    [
      { wpassid: "EXAMPLE-NETWORK", wpapsk: "x".repeat(64) },
      ["wifi.err.password"],
    ],
    [{ wpassid: "EXAMPLE-NETWORK", wpapsk: "0123456789abcdef".repeat(4) }, []],
  ])("Wi-Fi %o", (draft, expected) => {
    expect(checkWifi(draft).map((p) => p.code)).toEqual(expected);
  });
});

describe("removing settings (10.1, 10.2)", () => {
  const devices = [
    device("enp2s0", { address: "192.0.2.10" }),
    device("enp3s0"),
    device("bond0", { type: "bond", slaves: ["enp5s0"] }),
    device("enp5s0", { _readonly: true }),
    bare("enp9s0"),
  ];
  const stored = [
    settings("enp2s0"),
    settings("enp3s0"),
    settings("enp3s0.10", {
      type: "vlan",
      vlanrawdevice: "enp3s0",
      vlanid: 10,
    }),
    settings("bond0", { type: "bond", slaves: ["enp5s0"] }),
  ];
  const probable: Connection = {
    kind: "probable",
    host: "nas-host",
    nameForm: "short",
    iface: "enp2s0",
    under: [],
  };
  const onVlan: Connection = {
    ...KNOWN,
    iface: "enp3s0.10",
    under: ["enp3s0"],
  } as Connection;
  const nameOnly: Connection = {
    kind: "nameOnly",
    host: "nas-host",
    nameForm: "short",
  };

  it.each<[string, Connection, string, unknown]>([
    [
      "this page's interface",
      KNOWN,
      "enp2s0",
      { code: "ifaceDelete.refusedThis", iface: "enp2s0" },
    ],
    [
      "this page's interface, probably",
      probable,
      "enp2s0",
      { code: "ifaceDelete.refusedThis", iface: "enp2s0" },
    ],
    [
      "under this page's interface",
      onVlan,
      "enp3s0",
      { code: "ifaceDelete.refusedUnder", top: "enp3s0.10", iface: "enp3s0" },
    ],
    [
      "one a VLAN runs on",
      KNOWN,
      "enp3s0",
      { code: "ifaceDelete.refusedVlan", vlan: "enp3s0.10", iface: "enp3s0" },
    ],
    [
      "a bond's port",
      KNOWN,
      "enp5s0",
      { code: "iface.member", iface: "enp5s0", parent: "bond0" },
    ],
    [
      "one without settings",
      KNOWN,
      "enp9s0",
      { code: "noSettings", iface: "enp9s0" },
    ],
    ["another interface", KNOWN, "bond0", null],
    ["by name only: never refused on a guess", nameOnly, "enp2s0", null],
  ])("%s", (_what, connection, name, expected) => {
    expect(removalRefusal(name, { connection, devices, stored })).toEqual(
      expected,
    );
  });

  it("a bridge's interface says bridge", () => {
    const withBridge = [
      device("br0", { type: "bridge", slaves: ["enp8s0"] }),
      device("enp8s0"),
    ];
    expect(
      removalRefusal("enp8s0", {
        connection: KNOWN,
        devices: withBridge,
        stored: [],
      })?.code,
    ).toBe("iface.memberBridge");
  });

  it.each<[string, IfaceSettings, string[]]>([
    [
      "a bond",
      settings("bond0", { type: "bond", slaves: ["enp5s0", "enp6s0"] }),
      ["ifaceDelete.usesNow", "ifaceDelete.bondPorts"],
    ],
    [
      "a bridge",
      settings("br0", { type: "bridge", slaves: ["enp8s0"] }),
      ["ifaceDelete.usesNow", "ifaceDelete.bridgeMembers"],
    ],
    [
      "Wi-Fi with Wake-on-LAN",
      settings("wlan0", { type: "wifi", wol: true }),
      ["ifaceDelete.usesNow", "ifaceDelete.wifi", "ifaceDelete.wol"],
    ],
    [
      "a fixed address",
      settings("enp2s0", { method: "static", address: "192.0.2.10" }),
      ["ifaceDelete.usesNow", "ifaceDelete.fixed"],
    ],
  ])("what removing %s loses", (_what, s, expected) => {
    expect(
      removalLosses(s, device("x", { address: "192.0.2.10", prefix: 24 })).map(
        (l) => l.code,
      ),
    ).toEqual(expected);
  });

  it("an interface with no address now says nothing of one", () => {
    expect(removalLosses(settings("enp3s0"), device("enp3s0"))).toEqual([]);
  });
});

describe('"Copy the current settings" (1.4)', () => {
  it("lists the settings that matter, never a password", () => {
    const s = settings("wlan0", {
      type: "wifi",
      wpapsk: true,
      method: "static",
      address: "192.0.2.20",
      netmask: "255.255.255.0",
      gateway: "192.0.2.1",
      dnsnameservers: "192.0.2.1 192.0.2.2",
      dnssearch: "example.org",
      mtu: 0,
    });
    const note = currentSettingsNote(s, device("wlan0", { mtu: "1500" }));
    expect(note).toEqual([
      { label: "iface", value: "wlan0" },
      { label: "ipv4How", value: "interfaces.how.static" },
      { label: "ipv4Address", value: "192.0.2.20/24" },
      { label: "ipv4Gateway", value: "192.0.2.1" },
      { label: "ipv6How", value: "interfaces.how.off" },
      { label: "dnsServers", value: "192.0.2.1, 192.0.2.2" },
      { label: "search", value: "example.org" },
      { label: "mtu", value: "0 (1500)" },
    ]);
    expect(JSON.stringify(note)).not.toContain("wpapsk");
  });

  it("an automatic address: the one in use", () => {
    const note = currentSettingsNote(
      settings("enp2s0"),
      device("enp2s0", {
        address: "192.0.2.10",
        prefix: 24,
        gateway: "192.0.2.1",
      }),
    );
    expect(note).toContainEqual({
      label: "ipv4Address",
      value: "192.0.2.10/24",
    });
  });
});

describe("writing back (0.9)", () => {
  const read = settings("enp2s0", {
    method: "static",
    address: "192.0.2.10",
    netmask: "255.255.255.0",
    gateway: "192.0.2.1",
    dnsnameservers: "192.0.2.1,192.0.2.2",
    dnssearch: "example.org",
    comment: "Upstairs",
    routemetric: 3,
  });

  it("a new port: the classic form's defaults and the new-object identifier", () => {
    expect(
      ethernetRequest(null, "enp3s0", NEW_ADDRESS_DRAFT, NO_OTHERS),
    ).toEqual({
      uuid: NEW_OBJECT_UUID,
      devicename: "enp3s0",
      method: "dhcp",
      address: "",
      netmask: "",
      gateway: "",
      routemetric: 0,
      method6: "manual",
      address6: "",
      netmask6: 64,
      gateway6: "",
      routemetric6: 1,
      dnsnameservers: "",
      dnssearch: "",
      mtu: 0,
      wol: false,
      comment: "",
      altmacaddress: "",
    });
  });

  it("an existing port: the object read with only the changed fields; the size sent dotted", () => {
    const draft = {
      ...addressDraftOf(read),
      address: "192.0.2.20",
      size: "/25",
    };
    const request = ethernetRequest(read, "enp2s0", draft, NO_OTHERS);
    expect(request).toMatchObject({
      uuid: read.uuid,
      devicename: "enp2s0",
      address: "192.0.2.20",
      netmask: "255.255.255.128",
      dnsnameservers: "192.0.2.1,192.0.2.2",
      dnssearch: "example.org",
      comment: "Upstairs",
      routemetric: 3,
    });
  });

  it("the lists are sent comma-separated without spaces, whatever was read", () => {
    const spaced = {
      ...read,
      dnsnameservers: "192.0.2.1 192.0.2.2",
      dnssearch: "example.org example.net",
    };
    const request = ethernetRequest(
      spaced,
      "enp2s0",
      addressDraftOf(spaced),
      NO_OTHERS,
    );
    expect(request.dnsnameservers).toBe("192.0.2.1,192.0.2.2");
    expect(request.dnssearch).toBe("example.org,example.net");
    expect(restoreChanged(spaced)).toMatchObject({
      request: { dnsnameservers: "192.0.2.1,192.0.2.2" },
    });
    expect(commaList("192.0.2.1 ,192.0.2.2;\n192.0.2.3")).toBe(
      "192.0.2.1,192.0.2.2,192.0.2.3",
    );
  });

  it.each([
    [undefined, "layer2"],
    ["", "layer2"],
    ["layer3+4", "layer3+4"],
    ["bogus", "layer2"],
  ])(
    "the transmit hash policy sent for %j is %s (required by OMV)",
    (read, expected) => {
      expect(hashPolicyOf(read)).toBe(expected);
    },
  );

  it.each([
    [1, 1],
    [6, 6],
    [7, null],
    [-1, null],
  ])("bond mode %i is %o", (mode, expected) => {
    expect(bondModeOf(mode)).toBe(expected);
  });

  it("a draft read back from the stored settings changes nothing", () => {
    const request = ethernetRequest(
      read,
      "enp2s0",
      addressDraftOf(read),
      NO_OTHERS,
    );
    const { altmacaddress: _a, ...fields } = request;
    expect(sameSettings({ ...read, ...fields }, read)).toBe(true);
  });

  it("refuses to write what did not pass its checks", () => {
    expect(() =>
      ethernetRequest(null, "enp3s0", fixed({ address: "x" }), NO_OTHERS),
    ).toThrow(Error);
  });

  it("a new bond: OMV names it; the classic form's timing (D5) and the hash policy", () => {
    const request = bondRequest(
      null,
      {
        ...NEW_ADDRESS_DRAFT,
        slaves: ["enp3s0", "enp4s0"],
        bondmode: 1,
        bondprimary: "enp3s0",
      },
      NO_OTHERS,
    );
    expect(request).toMatchObject({
      uuid: NEW_OBJECT_UUID,
      devicename: "",
      bondmiimon: 100,
      bonddowndelay: 0,
      bondupdelay: 0,
      bondtransmithashpolicy: "layer2",
      slaves: ["enp3s0", "enp4s0"],
    });
  });

  it("an existing bond keeps the timing and hash policy read", () => {
    const bond = settings("bond0", {
      type: "bond",
      slaves: ["enp3s0"],
      bondmode: 4,
      bondprimary: "",
      bondmiimon: 250,
      bondtransmithashpolicy: "layer3+4",
    });
    const request = bondRequest(
      bond,
      {
        ...addressDraftOf(bond),
        slaves: ["enp3s0"],
        bondmode: 4,
        bondprimary: "",
      },
      NO_OTHERS,
    );
    expect(request).toMatchObject({
      devicename: "bond0",
      bondmiimon: 250,
      bondtransmithashpolicy: "layer3+4",
    });
  });

  it("a new VLAN: named {{parent}}.{{id}}", () => {
    expect(
      vlanRequest(
        null,
        { ...NEW_ADDRESS_DRAFT, vlanrawdevice: "enp2s0", vlanid: "20" },
        NO_OTHERS,
        [],
      ),
    ).toMatchObject({
      devicename: "enp2s0.20",
      vlanid: 20,
      vlanrawdevice: "enp2s0",
      altmacaddress: "",
    });
  });

  it("Wi-Fi sends the password typed for this request", () => {
    const request = wifiRequest(
      null,
      "wlan0",
      {
        ...NEW_ADDRESS_DRAFT,
        wpassid: "EXAMPLE-NETWORK",
        wpapsk: "EXAMPLE-PASSWORD",
        keymanagement: "psk",
        band: "auto",
        hidden: false,
      },
      NO_OTHERS,
    );
    expect(request).toMatchObject({
      devicename: "wlan0",
      wpassid: "EXAMPLE-NETWORK",
      wpapsk: "EXAMPLE-PASSWORD",
    });
  });

  it("removing sends the uuid read", () => {
    expect(deleteRequest(read)).toEqual({ uuid: read.uuid });
  });

  it("put back a change: the object before, under its identifier; a removal: as new", () => {
    expect(restoreChanged(read)).toMatchObject({
      type: "ethernet",
      request: { uuid: read.uuid, address: "192.0.2.10" },
    });
    expect(restoreAsNew(read)).toMatchObject({
      type: "ethernet",
      request: { uuid: NEW_OBJECT_UUID, devicename: "enp2s0" },
    });
    const bond = settings("bond0", { type: "bond", slaves: ["enp3s0"] });
    expect(restoreAsNew(bond)).toMatchObject({
      type: "bond",
      request: { devicename: "", slaves: ["enp3s0"] },
    });
    expect(
      restoreAsNew(settings("wlan0", { type: "wifi", wpapsk: true })),
    ).toEqual({ type: "wifi" });
  });

  it("set it up as it is now (P17)", () => {
    expect(
      adoptDraft({
        address: "203.0.113.50",
        prefix: 24,
        gateway: "203.0.113.1",
      }),
    ).toMatchObject({
      method: "static",
      address: "203.0.113.50",
      size: "24",
      gateway: "203.0.113.1",
      method6: "auto",
    });
    expect(adoptDraft({ address: "", prefix: -1, gateway: "" })).toMatchObject({
      method: "dhcp",
      method6: "auto",
    });
  });
});

describe("sameSettings across the two reads (1.7's Put back check)", () => {
  it("ignores the list's flags and how the lists are separated", () => {
    const read = settings("enp2s0", {
      dnsnameservers: "192.0.2.1,192.0.2.2",
      dnssearch: "example.org",
    });
    const row = {
      ...read,
      dnsnameservers: "192.0.2.1 192.0.2.2",
      _used: false,
      _readonly: false,
    };
    expect(sameSettings(read, row)).toBe(true);
    expect(sameSettings(read, { ...row, dnsnameservers: "192.0.2.3" })).toBe(
      false,
    );
  });
});
