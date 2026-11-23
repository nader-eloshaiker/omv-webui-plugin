// SPDX-License-Identifier: GPL-3.0-or-later
// The network slice's form schemas accept what the contract accepts and refuse what it refuses,
// field by field (design phase-5-network 15.1, "Contract notes"; docs/04, "Request schemas").
// Every value is a documentation one.
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import {
  IptablesSetRuleRequestSchema,
  IptablesSetRules6RequestSchema,
  IptablesSetRulesRequestSchema,
  NetworkSetBondIfaceRequestSchema,
  NetworkSetBridgeIfaceRequestSchema,
  NetworkSetEthernetIfaceRequestSchema,
  NetworkSetGeneralSettingsRequestSchema,
  NetworkSetProxyRequestSchema,
  NetworkSetVlanIfaceRequestSchema,
  NetworkSetWirelessIfaceRequestSchema,
} from "./generated/index.ts";

const ok = (schema: v.GenericSchema, value: unknown) =>
  v.safeParse(schema, value).success;
const NEW = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";

// The classic form's defaults for a new interface (design 0.9).
const iface = {
  uuid: NEW,
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
};
const ethernet = { ...iface, altmacaddress: "" };

describe("the NAS's name and domain", () => {
  const name = (hostname: string, domainname = "") => ({
    hostname,
    domainname,
  });
  it.each(["nas", "nas-1", "1nas", "a", "a".repeat(63)])(
    "accepts the host name %s",
    (hostname) =>
      expect(ok(NetworkSetGeneralSettingsRequestSchema, name(hostname))).toBe(
        true,
      ),
  );
  it.each([
    "",
    "Nas",
    "NAS",
    "nas-",
    "-nas",
    "nas_1",
    "nas.example.org",
    "a".repeat(64),
    "nas\n",
  ])("refuses the host name %j", (hostname) =>
    expect(ok(NetworkSetGeneralSettingsRequestSchema, name(hostname))).toBe(
      false,
    ),
  );
  it.each(["", "example.org", "lan", "home.arpa", "Example.Org", "locally"])(
    "accepts the domain %j",
    (domain) =>
      expect(
        ok(NetworkSetGeneralSettingsRequestSchema, name("nas", domain)),
      ).toBe(true),
  );
  it.each([
    "local",
    "LOCAL",
    "example",
    "invalid",
    "Test",
    "-a.org",
    "a..org",
    "a_b.org",
    ".org",
    `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}`,
  ])("refuses the domain %j", (domain) =>
    expect(
      ok(NetworkSetGeneralSettingsRequestSchema, name("nas", domain)),
    ).toBe(false),
  );
  it("requires both fields and nothing else", () => {
    expect(
      ok(NetworkSetGeneralSettingsRequestSchema, { hostname: "nas" }),
    ).toBe(false);
    expect(
      ok(NetworkSetGeneralSettingsRequestSchema, { ...name("nas"), extra: 1 }),
    ).toBe(false);
  });
});

describe("a network port", () => {
  it("accepts the classic form's defaults, and a fixed address with its lists", () => {
    expect(ok(NetworkSetEthernetIfaceRequestSchema, ethernet)).toBe(true);
    expect(
      ok(NetworkSetEthernetIfaceRequestSchema, {
        ...ethernet,
        method: "static",
        address: "203.0.113.10",
        netmask: "255.255.255.0",
        gateway: "203.0.113.1",
        method6: "static",
        address6: "2001:db8::10",
        gateway6: "fe80::1",
        dnsnameservers: "203.0.113.53,2001:db8::53",
        dnssearch: "example.org,example.net",
        mtu: 9000,
        altmacaddress: "02:00:5e:00:53:01",
        comment: "Upstairs switch",
      }),
    ).toBe(true);
  });
  it.each([
    ["devicename", ""],
    ["devicename", "a/b"],
    ["devicename", "en p3s0"],
    ["devicename", "abcdefghijklmnop"],
    ["devicename", ".."],
    ["method", "auto"],
    ["address", "203.0.113"],
    ["address", "203.0.113.256"],
    ["address", "2001:db8::10"],
    ["netmask", "24"],
    ["netmask", "255.0.255.0"],
    ["gateway", "router.example.org"],
    ["address6", "203.0.113.10"],
    ["address6", "2001:db8:::1"],
    ["netmask6", 129],
    ["gateway6", "fe80::1%enp3s0"],
    ["routemetric", -1],
    ["dnsnameservers", "203.0.113.53, 203.0.113.54"],
    ["dnsnameservers", "203.0.113.53;203.0.113.54"],
    ["dnsnameservers", "dns.example.org"],
    ["dnssearch", "example.org example.net"],
    ["dnssearch", "-example.org"],
    ["mtu", 1],
    ["mtu", 575],
    ["mtu", 9217],
    ["mtu", 1500.5],
    ["wol", "false"],
    ["comment", "two\nlines"],
    ["comment", "a".repeat(256)],
    ["altmacaddress", "01:00:5e:00:53:01"],
    ["altmacaddress", "00:00:00:00:00:00"],
    ["altmacaddress", "00-00-5e-00-53-01"],
  ] as const)("refuses %s %j", (field, value) =>
    expect(
      ok(NetworkSetEthernetIfaceRequestSchema, { ...ethernet, [field]: value }),
    ).toBe(false),
  );
  it.each([0, 576, 1500, 9216])("accepts the packet size %d", (mtu) =>
    expect(ok(NetworkSetEthernetIfaceRequestSchema, { ...ethernet, mtu })).toBe(
      true,
    ),
  );
  it("refuses a missing field and an extra one", () => {
    const { altmacaddress: _left, ...missing } = ethernet;
    expect(ok(NetworkSetEthernetIfaceRequestSchema, missing)).toBe(false);
    expect(
      ok(NetworkSetEthernetIfaceRequestSchema, { ...ethernet, wpapsk: "x" }),
    ).toBe(false);
  });
});

describe("a bond", () => {
  const bond = {
    ...iface,
    devicename: "",
    slaves: ["enp3s0", "enp26s0"],
    bondprimary: "enp3s0",
    bondmode: 1,
    bondmiimon: 100,
    bonddowndelay: 0,
    bondupdelay: 0,
    bondtransmithashpolicy: "layer2",
  };
  it("accepts a new bond and an existing one", () => {
    expect(ok(NetworkSetBondIfaceRequestSchema, bond)).toBe(true);
    expect(
      ok(NetworkSetBondIfaceRequestSchema, {
        ...bond,
        devicename: "bond0",
        bondmode: 4,
        bondprimary: "",
        bondtransmithashpolicy: "layer3+4",
      }),
    ).toBe(true);
  });
  it.each([
    ["slaves", []],
    ["slaves", ["enp3s0", "enp3s0"]],
    ["slaves", ["bond1"]],
    ["slaves", ["wlan0"]],
    ["slaves", ["enp3s0abcdefghijk"]],
    ["bondprimary", "wlan0"],
    ["bondmode", 7],
    ["bondmiimon", -1],
    ["bondtransmithashpolicy", "layer4"],
    ["bondtransmithashpolicy", ""],
    ["devicename", "bond 0"],
    ["altmacaddress", ""],
  ] as const)("refuses %s %j", (field, value) =>
    expect(
      ok(NetworkSetBondIfaceRequestSchema, { ...bond, [field]: value }),
    ).toBe(false),
  );
  it("requires the transmit hash policy, which OMV's datamodel does not name", () => {
    const { bondtransmithashpolicy: _left, ...without } = bond;
    expect(ok(NetworkSetBondIfaceRequestSchema, without)).toBe(false);
  });
});

describe("a VLAN", () => {
  const vlan = {
    ...ethernet,
    devicename: "",
    vlanid: 10,
    vlanrawdevice: "bond0",
  };
  it.each([1, 10, 4094])("accepts the VLAN ID %d", (vlanid) =>
    expect(ok(NetworkSetVlanIfaceRequestSchema, { ...vlan, vlanid })).toBe(
      true,
    ),
  );
  it.each([
    ["vlanid", 0],
    ["vlanid", 4095],
    ["vlanrawdevice", ""],
    ["vlanrawdevice", "a/b"],
  ] as const)("refuses %s %j", (field, value) =>
    expect(
      ok(NetworkSetVlanIfaceRequestSchema, { ...vlan, [field]: value }),
    ).toBe(false),
  );
  it("takes an existing VLAN's name as read", () =>
    expect(
      ok(NetworkSetVlanIfaceRequestSchema, { ...vlan, devicename: "bond0.10" }),
    ).toBe(true));
});

describe("a Wi-Fi interface", () => {
  const wifi = {
    ...ethernet,
    devicename: "wlp3s0",
    band: "auto",
    wpassid: "EXAMPLE-NETWORK",
    wpapsk: "EXAMPLE-PASSWORD",
    keymanagement: "psk",
    hidden: false,
  };
  it.each([
    "12345678",
    "with spaces and symbols !$",
    "a".repeat(63),
    "0123456789abcdef".repeat(4),
  ])("accepts the password %j", (wpapsk) =>
    expect(ok(NetworkSetWirelessIfaceRequestSchema, { ...wifi, wpapsk })).toBe(
      true,
    ),
  );
  it.each([
    "",
    "1234567",
    "g".repeat(64),
    "a".repeat(65),
    "tab\there12",
    "ünïcode1",
  ])("refuses the password %j", (wpapsk) =>
    expect(ok(NetworkSetWirelessIfaceRequestSchema, { ...wifi, wpapsk })).toBe(
      false,
    ),
  );
  it.each(["EXAMPLE-NETWORK", "Café ☕", "x", "n".repeat(32)])(
    "accepts the network name %j",
    (wpassid) =>
      expect(
        ok(NetworkSetWirelessIfaceRequestSchema, { ...wifi, wpassid }),
      ).toBe(true),
  );
  it.each(["", "n".repeat(33), "two\nlines", "nul\u0000"])(
    "refuses the network name %j",
    (wpassid) =>
      expect(
        ok(NetworkSetWirelessIfaceRequestSchema, { ...wifi, wpassid }),
      ).toBe(false),
  );
  it("requires the password, as OMV does", () => {
    const { wpapsk: _left, ...without } = wifi;
    expect(ok(NetworkSetWirelessIfaceRequestSchema, without)).toBe(false);
  });
  it.each([
    ["band", "6GHz"],
    ["keymanagement", "wep"],
  ] as const)("refuses %s %j", (field, value) =>
    expect(
      ok(NetworkSetWirelessIfaceRequestSchema, { ...wifi, [field]: value }),
    ).toBe(false),
  );
});

describe("a bridge", () => {
  const bridge = { ...iface, devicename: "", slaves: ["enp3s0"] };
  it.each([
    ["", ["enp3s0"]],
    ["br0", ["bond0"]],
    ["br12", ["bond0.10", "enp26s0"]],
    ["", []],
  ] as const)("accepts %j with %j", (devicename, slaves) =>
    expect(
      ok(NetworkSetBridgeIfaceRequestSchema, {
        ...bridge,
        devicename,
        slaves,
      }),
    ).toBe(true),
  );
  it.each([
    ["devicename", "bond0"],
    ["devicename", "br"],
    ["slaves", ["wlan0"]],
    ["slaves", ["br0"]],
    ["slaves", ["enp3s0", "enp3s0"]],
  ] as const)("refuses %s %j", (field, value) =>
    expect(
      ok(NetworkSetBridgeIfaceRequestSchema, { ...bridge, [field]: value }),
    ).toBe(false),
  );
});

describe("the proxies", () => {
  const proxy = {
    httpenable: true,
    httphost: "proxy.example.org",
    httpport: 3128,
    httpusername: "example-user",
    httppassword: "EXAMPLE-PASSWORD",
    httpsenable: false,
    httpshost: "",
    httpsport: 4443,
    httpsusername: "",
    httpspassword: "",
    ftpenable: false,
    ftphost: "",
    ftpport: 2121,
    ftpusername: "",
    ftppassword: "",
  };
  it.each(["proxy.example.org", "192.0.2.8", "2001:db8::8", ""])(
    "accepts the host %j",
    (httphost) =>
      expect(ok(NetworkSetProxyRequestSchema, { ...proxy, httphost })).toBe(
        true,
      ),
  );
  it.each([
    ["httphost", "http://proxy.example.org"],
    ["httphost", "proxy.example.org:3128"],
    ["httphost", "two words"],
    ["httpport", 0],
    ["httpport", 65536],
    ["httppassword", "two\nlines"],
    ["ftppassword", "carriage\rreturn"],
  ] as const)("refuses %s %j", (field, value) =>
    expect(ok(NetworkSetProxyRequestSchema, { ...proxy, [field]: value })).toBe(
      false,
    ),
  );
  it("requires all fifteen fields", () => {
    const { ftppassword: _left, ...missing } = proxy;
    expect(ok(NetworkSetProxyRequestSchema, missing)).toBe(false);
  });
});

describe("firewall rules", () => {
  const rule = {
    uuid: NEW,
    rulenum: -1,
    chain: "INPUT",
    action: "ACCEPT",
    family: "inet",
    source: "192.0.2.0/24",
    sport: "",
    destination: "",
    dport: "443",
    protocol: "tcp",
    extraoptions: "",
    comment: "Office network",
  };
  const rule6 = { ...rule, family: "inet6", source: "2001:db8::/32" };
  it.each([
    ["source", ""],
    ["source", "192.0.2.10"],
    ["source", "!192.0.2.0/24"],
    ["source", "192.0.2.10-192.0.2.20"],
    ["source", "0.0.0.0/0"],
    ["destination", "!192.0.2.10-192.0.2.20"],
    ["dport", ""],
    ["dport", "!22"],
    ["dport", "1024-65535"],
    ["dport", "8000:8100"],
    ["sport", "53"],
    ["protocol", "udp"],
    ["protocol", "!tcp"],
    ["protocol", "icmp"],
    ["protocol", "all"],
    ["action", ""],
    ["action", "LOG"],
    ["chain", "OUTPUT"],
    ["extraoptions", "-m conntrack --ctstate ESTABLISHED,RELATED"],
  ] as const)("accepts an IPv4 rule with %s %j", (field, value) =>
    expect(ok(IptablesSetRuleRequestSchema, { ...rule, [field]: value })).toBe(
      true,
    ),
  );
  it.each([
    ["source", "192.0.2.0/33"],
    ["source", "!!192.0.2.1"],
    ["source", "2001:db8::1"],
    ["source", "nas.example.org"],
    ["source", "192.0.2.1;reboot"],
    ["source", "192.0.2.1 "],
    ["dport", "0"],
    ["dport", "65536"],
    ["dport", "22,80"],
    ["dport", "22-"],
    ["protocol", "icmpv6"],
    ["protocol", "sctp"],
    ["protocol", "tcpx"],
    ["protocol", "TCP"],
    ["protocol", ""],
    ["action", "ALLOW"],
    ["chain", "FORWARD"],
    ["rulenum", -2],
    ["family", "inet4"],
    ["comment", "two\nlines"],
  ] as const)("refuses an IPv4 rule with %s %j", (field, value) =>
    expect(ok(IptablesSetRuleRequestSchema, { ...rule, [field]: value })).toBe(
      false,
    ),
  );
  it.each([
    ["source", "!2001:db8::/32"],
    ["source", "2001:db8::10-2001:db8::20"],
    ["destination", "::/0"],
    ["protocol", "icmpv6"],
    ["protocol", "!udp"],
  ] as const)("accepts an IPv6 rule with %s %j", (field, value) =>
    expect(ok(IptablesSetRuleRequestSchema, { ...rule6, [field]: value })).toBe(
      true,
    ),
  );
  it.each([
    ["source", "192.0.2.0/24"],
    ["source", "2001:db8::/129"],
    ["protocol", "icmp"],
  ] as const)("refuses an IPv6 rule with %s %j", (field, value) =>
    expect(ok(IptablesSetRuleRequestSchema, { ...rule6, [field]: value })).toBe(
      false,
    ),
  );
  it("a whole IPv4 list takes no -1 and no IPv6 rule; the IPv6 list the reverse", () => {
    const listed = { ...rule, rulenum: 0 };
    const listed6 = { ...rule6, rulenum: 0 };
    expect(ok(IptablesSetRulesRequestSchema, [])).toBe(true);
    expect(
      ok(IptablesSetRulesRequestSchema, [listed, { ...listed, rulenum: 1 }]),
    ).toBe(true);
    expect(
      ok(IptablesSetRulesRequestSchema, [{ ...listed, rulenum: -1 }]),
    ).toBe(false);
    expect(ok(IptablesSetRulesRequestSchema, [listed6])).toBe(false);
    expect(ok(IptablesSetRules6RequestSchema, [listed6])).toBe(true);
    expect(ok(IptablesSetRules6RequestSchema, [listed])).toBe(false);
    expect(ok(IptablesSetRulesRequestSchema, { ...listed })).toBe(false);
  });
});
