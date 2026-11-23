// SPDX-License-Identifier: GPL-3.0-or-later
// network/impact.ts: both tables of phase 5 network design 0.5 (the classes, and every change on this
// page's interface and on another), the Name only / Not known row, the VPN paragraph, 5.5, 5.6, 10.3,
// and the band's check from the server's state (1.8).
import { describe, expect, it } from "vitest";
import type { Connection } from "./connection.ts";
import { failed, ok, type GeneralSettings, type IfaceSettings } from "./dto.ts";
import { checkBothLists, checkList } from "./firewallCheck.ts";
import {
  bare,
  device,
  KNOWN,
  loc,
  rules,
  settings,
} from "./fixtures.testing.ts";
import {
  bandCheck,
  bandChecks,
  blinkAffectsPage,
  bothOffLine,
  classifyFirewall,
  classifyIfaceChange,
  classifyNameChange,
  classifyProxy,
  classifyRemoval,
  familyRefusal,
  otherEffects,
  worstClass,
  type BandInput,
  type IfaceAfter,
} from "./impact.ts";

// The page at 192.0.2.10 through enp2s0, which has a fixed address; enp3s0 is another port.
const LIVE = device("enp2s0", {
  method: "static",
  address: "192.0.2.10",
  netmask: "255.255.255.0",
  prefix: 24,
  gateway: "192.0.2.1",
  address6: "fe80::10",
  prefix6: 64,
});
const STATIC = settings("enp2s0", {
  method: "static",
  address: "192.0.2.10",
  netmask: "255.255.255.0",
  gateway: "192.0.2.1",
  dnsnameservers: "192.0.2.1",
});
const DHCP = settings("enp2s0", { method: "dhcp" });
const OTHER = settings("enp3s0", {
  method: "static",
  address: "198.51.100.20",
  netmask: "255.255.255.0",
});
const OTHER_LIVE = device("enp3s0", { address: "198.51.100.20", prefix: 24 });

const NAME_ONLY: Connection = {
  kind: "nameOnly",
  host: "nas-host",
  nameForm: "short",
};
const NOT_KNOWN: Connection = {
  kind: "unknownAddress",
  host: "203.0.113.9",
  family: 4,
};
const TUNNEL: Connection = {
  kind: "tunnel",
  host: "localhost",
  families: [4, 6],
};
const PROBABLE: Connection = {
  kind: "probable",
  host: "nas-host",
  nameForm: "short",
  iface: "enp2s0",
  under: [],
};
const VPN: Connection = {
  kind: "unmanaged",
  host: "203.0.113.5",
  iface: "wg0",
  address: "203.0.113.5",
  family: 4,
  network: null,
  virtual: true,
};
const UNSET_PORT: Connection = {
  kind: "unmanaged",
  host: "203.0.113.50",
  iface: "enp4s0",
  address: "203.0.113.50",
  family: 4,
  network: null,
  virtual: false,
};

const after = (
  before: IfaceSettings,
  over: Partial<IfaceAfter>,
): IfaceAfter => ({
  ...before,
  ...over,
});

const classify = (
  connection: Connection,
  before: IfaceSettings,
  over: Partial<IfaceAfter>,
  live = before.devicename === "enp2s0" ? LIVE : OTHER_LIVE,
) =>
  classifyIfaceChange({
    connection,
    devicename: before.devicename,
    before,
    after: after(before, over),
    live,
  });

describe("0.5: the classes", () => {
  it.each([
    [[], "none"],
    [["brief", "none"], "brief"],
    [["brief", "moves"], "moves"],
    [["moves", "mayCut", "brief"], "mayCut"],
    [["mayCut", "refused"], "refused"],
  ] as const)("the worst of %o is %s", (classes, expected) => {
    expect(worstClass(classes)).toBe(expected);
  });
});

describe("0.5: a change on this page's interface, and on another", () => {
  it.each<[string, IfaceSettings, Partial<IfaceAfter>, string, string]>([
    [
      "a fixed address changed",
      STATIC,
      { address: "192.0.2.20" },
      "moves",
      "none",
    ],
    [
      "automatic to fixed, a new address",
      DHCP,
      {
        method: "static",
        address: "192.0.2.20",
        netmask: "255.255.255.0",
        gateway: "192.0.2.1",
      },
      "moves",
      "none",
    ],
    [
      "automatic to fixed, the address in use",
      DHCP,
      {
        method: "static",
        address: "192.0.2.10",
        netmask: "255.255.255.0",
        gateway: "192.0.2.1",
      },
      "brief",
      "none",
    ],
    [
      "automatic to fixed, without the router the interface uses now",
      DHCP,
      { method: "static", address: "192.0.2.10", netmask: "255.255.255.0" },
      "mayCut",
      "none",
    ],
    [
      "automatic to fixed, another size than in use",
      DHCP,
      {
        method: "static",
        address: "192.0.2.10",
        netmask: "255.255.0.0",
        gateway: "192.0.2.1",
      },
      "mayCut",
      "none",
    ],
    ["fixed to automatic", STATIC, { method: "dhcp" }, "mayCut", "none"],
    [
      "a new hardware address",
      STATIC,
      { altmacaddress: "00:00:5e:00:53:99" },
      "mayCut",
      "none",
    ],
    ["the page's family off", STATIC, { method: "manual" }, "refused", "none"],
    [
      "both families off",
      STATIC,
      { method: "manual", method6: "manual" },
      "refused",
      "none",
    ],
    [
      "the router address",
      STATIC,
      { gateway: "192.0.2.254" },
      "mayCut",
      "none",
    ],
    [
      "the network size",
      STATIC,
      { netmask: "255.255.254.0" },
      "mayCut",
      "none",
    ],
    ["name servers", STATIC, { dnsnameservers: "192.0.2.53" }, "brief", "none"],
    ["search domains", STATIC, { dnssearch: "example.org" }, "brief", "none"],
    ["route priority", STATIC, { routemetric: 5 }, "brief", "none"],
    ["Wake-on-LAN", STATIC, { wol: true }, "brief", "none"],
    ["the note", STATIC, { comment: "Upstairs" }, "brief", "none"],
    ["packet size", STATIC, { mtu: 9000 }, "mayCut", "none"],
    [
      "the other family's settings (IPv6 when the page uses IPv4)",
      STATIC,
      { method6: "static", address6: "2001:db8::10", netmask6: 64 },
      "brief",
      "none",
    ],
    ["nothing changed", STATIC, {}, "none", "none"],
    [
      "the lists written another way",
      settings("enp2s0", { dnsnameservers: "192.0.2.1 192.0.2.2" }),
      { dnsnameservers: "192.0.2.1,192.0.2.2" },
      "none",
      "none",
    ],
  ])(
    "%s: %s here, %s on another interface",
    (_what, before, over, here, elsewhere) => {
      expect(classify(KNOWN, before, over).class).toBe(here);
      const other = { ...before, devicename: "enp3s0", uuid: OTHER.uuid };
      expect(classify(KNOWN, other, over, OTHER_LIVE).class).toBe(elsewhere);
    },
  );

  it.each<[string, Partial<IfaceSettings>, Partial<IfaceAfter>]>([
    [
      "the network name",
      {
        type: "wifi",
        wpassid: "EXAMPLE-NETWORK",
        keymanagement: "psk",
        band: "auto",
        hidden: false,
      },
      { wpassid: "OTHER-NETWORK" },
    ],
    [
      "the security",
      { type: "wifi", wpassid: "EXAMPLE-NETWORK", keymanagement: "psk" },
      { keymanagement: "sae" },
    ],
    [
      "the frequency",
      { type: "wifi", wpassid: "EXAMPLE-NETWORK", band: "auto" },
      { band: "5GHz" },
    ],
    [
      "the password, typed again on every save",
      { type: "wifi", wpassid: "EXAMPLE-NETWORK" },
      {},
    ],
  ])(
    "Wi-Fi %s: May cut here, Not affected elsewhere",
    (_what, stored, over) => {
      const before = settings("enp2s0", { ...stored, method: "dhcp" });
      const here = classify(KNOWN, before, { ...over, type: "wifi" });
      expect(here.class).toBe("mayCut");
      expect(here.findings).toContainEqual({
        class: "mayCut",
        effect: "netChange.effect.wifi",
      });
      const other = { ...before, devicename: "wlan1" };
      expect(
        classify(
          KNOWN,
          other,
          { ...over, type: "wifi", devicename: "wlan1" },
          OTHER_LIVE,
        ).class,
      ).toBe("none");
    },
  );

  it("a moved address says from where to where", () => {
    expect(
      classify(KNOWN, STATIC, { address: "192.0.2.20" }).findings,
    ).toContainEqual({
      class: "moves",
      effect: "netChange.effect.newAddress",
      family: 4,
      old: "192.0.2.10",
      new: "192.0.2.20",
    });
  });

  it.each([
    [{ method: "dhcp" }, "netChange.effect.automatic"],
    [{ gateway: "192.0.2.254" }, "netChange.effect.gateway"],
    [{ mtu: 9000 }, "netChange.effect.mtu"],
  ] as const)("the specific line for %o", (over, effect) => {
    expect(
      classify(KNOWN, STATIC, over).findings.map((f) =>
        f.class === "mayCut" ? f.effect : null,
      ),
    ).toContain(effect);
  });

  it("the refusal of turning the page's family off names the family and the interface (5.5)", () => {
    const change = {
      connection: KNOWN,
      devicename: "enp2s0",
      before: STATIC,
      after: after(STATIC, { method: "manual" }),
      live: LIVE,
    };
    expect(familyRefusal(change)).toEqual({
      code: "ifaceForm.refusedFamily",
      family: "IPv4",
      iface: "enp2s0",
      otherWay: true,
    });
  });

  it("turning IPv6 off when the page uses IPv4 is not refused", () => {
    const before = { ...STATIC, method6: "auto" as const };
    expect(classify(KNOWN, before, { method6: "manual" }).class).toBe("brief");
  });

  it("both families off on another interface is allowed, with its line (5.5)", () => {
    expect(
      bothOffLine(KNOWN, "enp3s0", { method: "manual", method6: "manual" }),
    ).toEqual({ code: "ifaceForm.bothOff", iface: "enp3s0" });
    expect(
      bothOffLine(KNOWN, "enp2s0", { method: "manual", method6: "manual" }),
    ).toBeNull();
    expect(
      bothOffLine(KNOWN, "enp3s0", { method: "dhcp", method6: "manual" }),
    ).toBeNull();
  });
});

describe("0.5: Name only or Not known, never Refused on a guess", () => {
  it.each([
    ["Name only", NAME_ONLY],
    ["an address no interface reports", NOT_KNOWN],
    ["a tunnel", TUNNEL],
    ["a failed read", { kind: "readFailed", host: "nas-host" } as Connection],
  ])("%s: every interface change is May cut", (_what, connection) => {
    expect(
      classify(connection, STATIC, { dnsnameservers: "192.0.2.53" }).class,
    ).toBe("mayCut");
    expect(
      classify(connection, STATIC, { method: "manual", method6: "manual" })
        .class,
    ).toBe("mayCut");
    expect(
      classify(connection, OTHER, { address: "198.51.100.21" }, OTHER_LIVE)
        .class,
    ).toBe("mayCut");
    expect(
      classifyRemoval({
        connection,
        devicename: "enp2s0",
        devices: [LIVE],
        stored: [STATIC],
      }).class,
    ).toBe("mayCut");
    expect(classifyProxy().class).toBe("none");
  });

  it("the firewall: blocking for anyone is May cut; for every computer whatever the address, Refused", () => {
    const context = {
      connection: NAME_ONLY,
      ports: {
        scheme: "http" as const,
        page: 80,
        others: [],
        othersUnread: false,
      },
      ssh: { kind: "off" as const },
    };
    expect(
      classifyFirewall(
        checkList(
          rules({ action: "REJECT", destination: "192.0.2.10" }),
          4,
          context,
        ),
      ).class,
    ).toBe("mayCut");
    expect(
      classifyFirewall(
        checkList(rules({ action: "REJECT", dport: "80" }), 4, context),
      ).class,
    ).toBe("refused");
    expect(
      classifyFirewall(
        checkList(rules({ action: "REJECT", dport: "22" }), 4, context),
      ).class,
    ).toBe("none");
  });
});

describe("0.5: Probably known", () => {
  it("the page's family off is Refused", () => {
    expect(classify(PROBABLE, STATIC, { method: "manual" }).class).toBe(
      "refused",
    );
  });

  it("a family without an address now is not the page's", () => {
    expect(
      classify(PROBABLE, { ...STATIC, method6: "auto" }, { method6: "manual" })
        .class,
    ).toBe("brief");
  });

  it("a fixed address changed is May cut: the name may follow it, or not", () => {
    expect(classify(PROBABLE, STATIC, { address: "192.0.2.20" }).class).toBe(
      "mayCut",
    );
  });
});

describe("0.5: Known, outside the network settings", () => {
  it("a VPN: interface changes are Brief interruption at most", () => {
    expect(
      classify(VPN, STATIC, { method: "manual", method6: "manual" }).class,
    ).toBe("brief");
    expect(
      classifyRemoval({
        connection: VPN,
        devicename: "enp2s0",
        devices: [LIVE],
        stored: [STATIC],
      }).class,
    ).toBe("brief");
  });

  it("a port without settings (P17): it keeps its address across the apply (18.2 #7), so other changes are Not affected", () => {
    expect(
      classify(UNSET_PORT, STATIC, { dnsnameservers: "192.0.2.53" }).class,
    ).toBe("none");
    expect(classify(UNSET_PORT, STATIC, { mtu: 9000 }).class).toBe("none");
    expect(
      classifyRemoval({
        connection: UNSET_PORT,
        devicename: "enp2s0",
        devices: [LIVE],
        stored: [STATIC],
      }).class,
    ).toBe("none");
  });

  it.each<[string, Partial<IfaceAfter>, string]>([
    [
      "set up as it is now",
      { method: "static", address: "203.0.113.50", netmask: "255.255.255.0" },
      "brief",
    ],
    [
      "set up with another address",
      { method: "static", address: "203.0.113.51", netmask: "255.255.255.0" },
      "moves",
    ],
    ["set up automatic", { method: "dhcp" }, "mayCut"],
    ["set up with IPv4 off", { method: "manual" }, "refused"],
  ])("this page's port without settings %s: %s", (_what, over, expected) => {
    const live = bare("enp4s0", { address: "203.0.113.50", prefix: 24 });
    const base = { ...settings("enp4s0"), method6: "auto" as const };
    const impact = classifyIfaceChange({
      connection: UNSET_PORT,
      devicename: "enp4s0",
      before: null,
      after: { ...base, ...over },
      live,
    });
    expect(impact.class).toBe(expected);
  });
});

describe("0.5: new interfaces, bonds, bridges and VLANs", () => {
  const newIface = (connection: Connection, over: Partial<IfaceAfter>) =>
    classifyIfaceChange({
      connection,
      devicename: over.devicename ?? "",
      before: null,
      after: { ...settings(over.devicename ?? ""), ...over },
      live: null,
    });

  it("a VLAN added on this page's interface: Brief interruption", () => {
    expect(
      newIface(KNOWN, {
        type: "vlan",
        devicename: "enp2s0.10",
        vlanrawdevice: "enp2s0",
        vlanid: 10,
      }).class,
    ).toBe("brief");
  });

  it("this page's interface made part of a new bond or bridge: Refused", () => {
    expect(
      newIface(KNOWN, { type: "bond", slaves: ["enp2s0", "enp3s0"] }),
    ).toMatchObject({
      class: "refused",
      findings: [
        {
          class: "refused",
          refusal: {
            code: "bond.thisPagePort",
            iface: "enp2s0",
            otherWay: true,
          },
        },
      ],
    });
    expect(newIface(KNOWN, { type: "bridge", slaves: ["enp2s0"] }).class).toBe(
      "refused",
    );
  });

  it("other ports in a new bond: allowed, and Not affected (18.2 #4)", () => {
    expect(
      newIface(KNOWN, { type: "bond", slaves: ["enp3s0", "enp4s0"] }).class,
    ).toBe("none");
  });

  it("a VLAN added on another interface: Not affected (18.2 #4)", () => {
    expect(
      newIface(KNOWN, {
        type: "vlan",
        devicename: "enp3s0.10",
        vlanrawdevice: "enp3s0",
        vlanid: 10,
      }).class,
    ).toBe("none");
  });

  it("by name, a new bond is May cut, not Refused", () => {
    expect(
      newIface(NAME_ONLY, { type: "bond", slaves: ["enp2s0"] }).class,
    ).toBe("mayCut");
  });

  it("on an interface under this page's one (a VLAN's parent): what changes how it carries traffic is May cut", () => {
    const vlanPage: Connection = {
      ...KNOWN,
      iface: "enp2s0.10",
      under: ["enp2s0"],
    } as Connection;
    expect(classify(vlanPage, STATIC, { mtu: 1400 }).class).toBe("mayCut");
    expect(classify(vlanPage, STATIC, { comment: "x" }).class).toBe("brief");
  });
});

describe("10.1, 10.3: removing settings", () => {
  const vlan = settings("enp3s0.10", {
    type: "vlan",
    vlanrawdevice: "enp3s0",
    vlanid: 10,
  });

  it.each<[string, Connection, string, IfaceSettings[], string]>([
    ["this page's interface", KNOWN, "enp2s0", [STATIC], "refused"],
    [
      "under this page's interface",
      { ...KNOWN, iface: "enp2s0.10", under: ["enp2s0"] } as Connection,
      "enp2s0",
      [STATIC],
      "refused",
    ],
    ["one a VLAN runs on", KNOWN, "enp3s0", [STATIC, OTHER, vlan], "refused"],
    ["another interface (18.2 #4)", KNOWN, "enp3s0", [STATIC, OTHER], "none"],
    [
      "a VLAN on this page's interface",
      KNOWN,
      "enp2s0.10",
      [
        STATIC,
        settings("enp2s0.10", {
          type: "vlan",
          vlanrawdevice: "enp2s0",
          vlanid: 10,
        }),
      ],
      "brief",
    ],
    [
      "a VLAN on another interface (18.2 #4)",
      KNOWN,
      "enp3s0.10",
      [STATIC, OTHER, vlan],
      "none",
    ],
  ])("%s: %s", (_what, connection, devicename, stored, expected) => {
    expect(
      classifyRemoval({
        connection,
        devicename,
        devices: [LIVE, OTHER_LIVE],
        stored,
      }).class,
    ).toBe(expected);
  });
});

describe("the name of this NAS (0.5's first rows)", () => {
  const STORED: GeneralSettings = {
    hostname: "nas-host",
    domainname: "example.org",
  };

  it.each<[string, Connection, GeneralSettings, string, string | null]>([
    [
      "opened by the old name, the name changed",
      { ...PROBABLE, nameForm: "short" } as Connection,
      { hostname: "new-nas", domainname: "example.org" },
      "moves",
      "new-nas",
    ],
    [
      "opened by .local, the name changed",
      { ...PROBABLE, host: "nas-host.local", nameForm: "local" } as Connection,
      { hostname: "new-nas", domainname: "example.org" },
      "moves",
      "new-nas.local",
    ],
    [
      "opened with the domain, the domain changed",
      {
        ...NAME_ONLY,
        host: "nas-host.example.org",
        nameForm: "fqdn",
      } as Connection,
      { hostname: "nas-host", domainname: "example.net" },
      "moves",
      "nas-host.example.net",
    ],
    [
      "opened by the short name, the domain changed",
      PROBABLE,
      { hostname: "nas-host", domainname: "example.net" },
      "none",
      null,
    ],
    [
      "opened at an address, the name changed",
      KNOWN,
      { hostname: "new-nas", domainname: "example.org" },
      "none",
      null,
    ],
    [
      "opened by another name",
      { kind: "otherName", host: "files.example.org" },
      { hostname: "new-nas", domainname: "" },
      "none",
      null,
    ],
    [
      "only the case changed",
      PROBABLE,
      { hostname: "NAS-HOST", domainname: "example.org" },
      "none",
      null,
    ],
  ])("%s: %s", (_what, connection, draft, expected, next) => {
    const impact = classifyNameChange(connection, STORED, draft);
    expect(impact.class).toBe(expected);
    if (next !== null) {
      expect(impact.findings[0]).toMatchObject({
        effect: "netChange.effect.newName",
        new: next,
      });
    }
  });
});

describe("blinking a port (4.4)", () => {
  it.each([
    [KNOWN, "enp2s0", true],
    [KNOWN, "enp3s0", false],
    [
      { ...KNOWN, under: ["enp2s0"], iface: "bond0" } as Connection,
      "enp2s0",
      true,
    ],
    [NAME_ONLY, "enp3s0", true],
  ])("%o %s", (connection, devicename, expected) => {
    expect(blinkAffectsPage(connection, devicename)).toBe(expected);
  });
});

describe("5.6, 7.2: what it does to other computers", () => {
  it.each<[string, IfaceSettings | null, Partial<IfaceAfter>, string[]]>([
    [
      "a fixed address changed",
      STATIC,
      { address: "192.0.2.20" },
      ["ifaceForm.other.address"],
    ],
    [
      "automatic to fixed",
      DHCP,
      { method: "static", address: "192.0.2.20" },
      ["ifaceForm.other.dhcpPool"],
    ],
    [
      "a hardware address set",
      STATIC,
      { altmacaddress: "00:00:5e:00:53:99" },
      ["ifaceForm.other.mac"],
    ],
    [
      "Wake-on-LAN turned off",
      { ...STATIC, wol: true },
      { wol: false },
      ["ifaceForm.other.wol"],
    ],
    ["a new bond", null, { type: "bond" }, ["bond.newMac"]],
    ["a new bridge", null, { type: "bridge" }, ["bridge.newMac"]],
    ["the name servers", STATIC, { dnsnameservers: "192.0.2.53" }, []],
  ])("%s", (_what, before, over, codes) => {
    const base = before ?? settings("");
    expect(
      otherEffects("enp2s0", before, { ...base, ...over }).map((e) => e.code),
    ).toEqual(codes);
  });

  it("an address change says from where to where", () => {
    expect(
      otherEffects("enp2s0", STATIC, { ...STATIC, address: "192.0.2.20" }),
    ).toEqual([
      { code: "ifaceForm.other.address", old: "192.0.2.10", new: "192.0.2.20" },
    ]);
  });
});

describe("1.8: the band's check from the server's state", () => {
  const base = (over: Partial<BandInput> = {}): BandInput => ({
    pending: ["systemd-networkd"],
    location: loc("192.0.2.10"),
    connection: KNOWN,
    devices: ok([LIVE, OTHER_LIVE]),
    stored: ok([STATIC, OTHER]),
    general: ok({ hostname: "nas-host", domainname: "" }),
    firewall: null,
    ...over,
  });

  it.each([
    [["systemd-networkd"], true],
    [["hosts"], true],
    [["hostname"], true],
    [["iptables"], true],
    [["samba", "nfs"], false],
  ])("runs when %o is pending: %s", (pending, expected) => {
    expect(bandChecks(pending)).toBe(expected);
  });

  it.each<[string, Partial<BandInput>, string, string[]]>([
    [
      "nothing differs on this page's interface: Brief",
      {},
      "brief",
      ["netApply.lineBrief"],
    ],
    [
      "a stored fixed address different from the one in use: Moves",
      { stored: ok([{ ...STATIC, address: "192.0.2.20" }, OTHER]) },
      "moves",
      ["netApply.lineMoves"],
    ],
    [
      "stored Off for the page's family: Refused",
      { stored: ok([{ ...STATIC, method: "manual" }, OTHER]) },
      "refused",
      ["netApply.refusedIface"],
    ],
    [
      "no stored settings at all: Refused",
      { stored: ok([OTHER]) },
      "refused",
      ["netApply.refusedIface"],
    ],
    [
      "a stored automatic method while it has an address: May cut",
      { stored: ok([DHCP, OTHER]) },
      "mayCut",
      ["netApply.lineMayCut"],
    ],
    [
      "a stored packet size different from the one in use: May cut",
      { stored: ok([{ ...STATIC, mtu: 9000 }, OTHER]) },
      "mayCut",
      ["netApply.lineMayCut"],
    ],
    [
      "a stored hardware address different: May cut",
      {
        stored: ok([{ ...STATIC, altmacaddress: "00:00:5e:00:53:99" }, OTHER]),
      },
      "mayCut",
      ["netApply.lineMayCut"],
    ],
    [
      "a Wi-Fi interface: May cut",
      { stored: ok([{ ...STATIC, type: "wifi" }, OTHER]) },
      "mayCut",
      ["netApply.lineMayCut"],
    ],
    [
      "a stored router address different: May cut",
      { stored: ok([{ ...STATIC, gateway: "192.0.2.254" }, OTHER]) },
      "mayCut",
      ["netApply.lineMayCut"],
    ],
    [
      "this page's interface not known: May cut",
      { connection: NAME_ONLY },
      "mayCut",
      ["network.impact.mayCut"],
    ],
    [
      "a read failed: May cut",
      { stored: failed },
      "mayCut",
      ["network.impact.mayCut"],
    ],
    ["a VPN: Brief", { connection: VPN }, "brief", ["netApply.lineBrief"]],
    [
      "a port without settings here: Brief (18.2 #7)",
      { connection: UNSET_PORT },
      "brief",
      ["netApply.lineBrief"],
    ],
    ["nothing network pending: nothing", { pending: ["samba"] }, "none", []],
  ])("%s", (_what, over, expected, codes) => {
    const result = bandCheck(base(over));
    expect(result.class).toBe(expected);
    expect(result.lines.map((l) => l.code)).toEqual(codes);
  });

  it("escalates: ordinary for Brief, typed for Moves and May cut, unavailable for Refused", () => {
    expect(bandCheck(base()).confirmation).toBe("ordinary");
    expect(bandCheck(base({ stored: ok([DHCP, OTHER]) })).confirmation).toBe(
      "typed",
    );
    expect(bandCheck(base({ stored: ok([OTHER]) })).confirmation).toBe(
      "unavailable",
    );
  });

  it("the moved line names the interface and both addresses", () => {
    expect(
      bandCheck(
        base({ stored: ok([{ ...STATIC, address: "192.0.2.20" }, OTHER]) }),
      ).lines,
    ).toEqual([
      {
        code: "netApply.lineMoves",
        class: "moves",
        iface: "enp2s0",
        old: "192.0.2.10",
        new: "192.0.2.20",
      },
    ]);
  });

  describe("the name", () => {
    const byName = (over: Partial<BandInput>) =>
      bandCheck(
        base({
          pending: ["hostname"],
          location: loc("nas-host"),
          connection: { kind: "otherName", host: "nas-host" },
          general: ok({ hostname: "new-nas", domainname: "" }),
          ...over,
        }),
      );

    it("opened by the name in effect, a new name stored: Moves", () => {
      expect(byName({ appliedHostname: "nas-host" }).lines).toEqual([
        {
          code: "network.impact.moves",
          class: "moves",
          old: "nas-host",
          new: "new-nas",
        },
      ]);
    });

    it("the name in effect with its domain", () => {
      expect(
        byName({
          appliedHostname: "nas-host.example.org",
          location: loc("nas-host.example.org"),
          general: ok({ hostname: "nas-host", domainname: "example.net" }),
        }).lines,
      ).toEqual([
        {
          code: "network.impact.moves",
          class: "moves",
          old: "nas-host.example.org",
          new: "nas-host.example.net",
        },
      ]);
    });

    it("opened by another name altogether: nothing", () => {
      expect(
        byName({ appliedHostname: "other", location: loc("files.example.org") })
          .lines,
      ).toEqual([]);
    });

    it("the name in effect not known: May cut", () => {
      expect(byName({}).class).toBe("mayCut");
    });

    it("opened by the stored name: nothing", () => {
      expect(byName({ location: loc("new-nas") }).lines).toEqual([]);
    });

    it("opened at an address: nothing", () => {
      expect(byName({ location: loc("192.0.2.10") }).lines).toEqual([]);
    });
  });

  describe("the firewall", () => {
    const context = {
      connection: KNOWN,
      ports: {
        scheme: "http" as const,
        page: 80,
        others: [],
        othersUnread: false,
      },
      ssh: { kind: "off" as const },
    };
    const fw = (list: ReturnType<typeof rules>) =>
      bandCheck(
        base({
          pending: ["iptables"],
          firewall: checkBothLists({ 4: ok(list), 6: ok([]) }, context),
        }),
      );

    it.each([
      [
        rules({ action: "REJECT", dport: "80" }),
        "refused",
        ["netApply.refusedFirewall"],
      ],
      [
        rules(
          { action: "ACCEPT", source: "192.0.2.0/24" },
          { action: "REJECT" },
        ),
        "mayCut",
        ["netApply.lineFirewall"],
      ],
      [rules({ action: "REJECT", dport: "445" }), "none", []],
    ])("%o", (list, expected, codes) => {
      const result = fw(list);
      expect(result.class).toBe(expected);
      expect(result.lines.map((l) => l.code)).toEqual(codes);
    });

    it("the rules not read: May cut", () => {
      expect(
        bandCheck(base({ pending: ["iptables"], firewall: null })).class,
      ).toBe("mayCut");
    });
  });
});
