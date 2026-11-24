// SPDX-License-Identifier: GPL-3.0-or-later
// The network stories of the mock (phase 5 network design 17): every reply has the contract's shape
// once the transport has removed and replaced what the contract says (the stored passwords never get
// through), every request sent here passes the contract's form schema, the answers remember what the
// pages do with the pending modules of design 0.7, apply and undo behave as the test VM showed (the
// queued job outlives undo, 10.4), the networkApply stories lose the connection in their four ways
// (1.5), and each story says where the page appears to be opened (D17).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import * as F from "@omv-webui/react-api-omv/forms";
import { replyOf, type FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";
// Test code only: the contract's tables and the transport's own reply steps, to check every reply as
// the pages receive it.
import {
  OPERATIONS,
  SCHEMAS,
} from "../../../../packages/react-api-omv/src/contract/generated/operations.ts";
import type { OperationEntry } from "../../../../packages/react-api-omv/src/contract/types.ts";
import { withoutOmitted } from "../../../../packages/react-api-omv/src/transport/omit.ts";
import { withPresence } from "../../../../packages/react-api-omv/src/transport/presence.ts";
import {
  normalise,
  validate,
} from "../../../../packages/react-api-omv/src/transport/schema.ts";
import {
  readPageLocation,
  setApparentPageLocation,
} from "../network/pageLocation.ts";
import {
  EXAMPLE_PASSWORD,
  HOSTILE_DOMAIN,
  HOSTILE_SSID,
  linkLocalOf,
  netmask6Of,
  netmaskOf,
  NETWORK_DIRTY,
  NETWORK_IFACES,
  NETWORK_LOSS_MS,
  NETWORK_SCENARIOS,
  networkPageAddress,
  NEW_OBJECT,
  NO_REPLY,
  prefixOf,
  type NetworkScenarioName,
} from "./networkScenarios.ts";
import {
  newMockSession,
  SCENARIO_GROUPS,
  SCENARIO_LABELS,
  scenarioAnswers,
  type ScenarioName,
} from "./scenarios.ts";

type AnyAnswer =
  | string
  | FixedAnswer
  | ((call: { params: unknown; options: unknown }) => string | FixedAnswer);
type Row = Record<string, unknown>;
interface List {
  total: number;
  data: Row[];
}

const entryOf = (operationId: string): OperationEntry | undefined =>
  Object.values(OPERATIONS as Record<string, OperationEntry>).find(
    (e) => e.operationId === operationId,
  );

/** A reply as the transport hands it on: omitted fields removed, presence fields replaced, normalised. */
function delivered(operationId: string, value: unknown): unknown {
  const entry = entryOf(operationId);
  const schema = entry?.response;
  const stripped = withPresence(
    withoutOmitted(value, entry?.omit),
    entry?.presence,
  );
  return schema ? normalise(stripped, schema, SCHEMAS) : stripped;
}

function checked(
  operationId: string,
  answer: string | FixedAnswer | undefined,
): string | FixedAnswer | undefined {
  expect(answer, operationId).toBeDefined();
  if (typeof answer === "string" || answer === undefined) {
    return answer;
  }
  if (answer.networkError === true) {
    return answer;
  }
  if (answer.status === 200) {
    const schema = entryOf(operationId)?.response;
    if (schema === null || schema === undefined) {
      expect(answer.value ?? null, operationId).toBeNull();
    } else {
      expect(
        validate(delivered(operationId, answer.value), schema, SCHEMAS),
        operationId,
      ).toEqual([]);
    }
  } else {
    expect(answer.message, operationId).toEqual(expect.any(String));
  }
  return answer;
}

/** A request held first to the contract's form schema of its operation. */
function sent(
  schema: { "~standard": { validate: (value: unknown) => unknown } },
  params: unknown,
): unknown {
  const result = schema["~standard"].validate(params) as {
    issues?: readonly { message: string }[];
  };
  expect(
    result.issues?.map((i) => i.message),
    JSON.stringify(params),
  ).toBeUndefined();
  return params;
}

const ALL = {
  start: 0,
  limit: null,
  sortfield: null,
  sortdir: null,
  search: null,
};
const APPLY = CONTRACT_EXAMPLES.execGetOutput.appliedFinished.value.filename;
const REVERT = CONTRACT_EXAMPLES.configRevertChangesBg.reverted.value;
const sorted = (modules: readonly string[]) => [...new Set(modules)].sort();

/** An Ethernet port's settings to send, as the form sends them: every field. */
function ethernet(over: Row = {}): Row {
  return {
    uuid: NEW_OBJECT,
    devicename: "enp3s0",
    method: "static",
    address: "203.0.113.10",
    netmask: "255.255.255.0",
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
    ...over,
  };
}
function wifi(over: Row = {}): Row {
  const { altmacaddress: _mac, ...rest } = ethernet({
    devicename: "wlp4s0",
    method: "dhcp",
    address: "",
    netmask: "",
  });
  return {
    ...rest,
    altmacaddress: "",
    band: "auto",
    wpassid: "EXAMPLE-NETWORK",
    wpapsk: EXAMPLE_PASSWORD,
    keymanagement: "psk",
    hidden: false,
    ...over,
  };
}
function bond(over: Row = {}): Row {
  const { altmacaddress: _mac, ...rest } = ethernet({
    devicename: "",
    method: "dhcp",
    address: "",
    netmask: "",
  });
  return {
    ...rest,
    slaves: ["enp3s0", "enp26s0"],
    bondprimary: "enp3s0",
    bondmode: 1,
    bondmiimon: 100,
    bonddowndelay: 0,
    bondupdelay: 0,
    bondtransmithashpolicy: "layer2",
    ...over,
  };
}
function vlan(over: Row = {}): Row {
  return {
    ...ethernet({ devicename: "", address: "198.51.100.20" }),
    vlanid: 20,
    vlanrawdevice: "enp2s0",
    ...over,
  };
}
const RULE = {
  uuid: NEW_OBJECT,
  rulenum: -1,
  chain: "INPUT",
  action: "ACCEPT",
  family: "inet",
  source: "192.0.2.0/24",
  sport: "",
  destination: "",
  dport: "22",
  protocol: "tcp",
  extraoptions: "",
  comment: "SSH from the office network",
};
const PROXY = {
  httpenable: true,
  httphost: "proxy.example.org",
  httpport: 3128,
  httpusername: "example-user",
  httppassword: EXAMPLE_PASSWORD,
  httpsenable: false,
  httpshost: "",
  httpsport: 3129,
  httpsusername: "",
  httpspassword: "",
  ftpenable: false,
  ftphost: "",
  ftpport: 2121,
  ftpusername: "",
  ftppassword: "",
};

function story(scenario: ScenarioName) {
  const session = newMockSession(true);
  const answers: Readonly<Partial<Record<string, AnyAnswer>>> = scenarioAnswers(
    scenario,
    session,
  );
  const raw = (operationId: string, params: unknown = {}) => {
    const answer = answers[operationId];
    return typeof answer === "function"
      ? answer({ params, options: undefined })
      : answer;
  };
  const ask = (operationId: string, params: unknown = {}) =>
    checked(operationId, raw(operationId, params)) as FixedAnswer;
  /** The reply as OMV sends it (before the transport). */
  const value = <T>(operationId: string, params: unknown = {}): T => {
    const answer = ask(operationId, params);
    expect(answer, operationId).toMatchObject({ status: 200 });
    return answer.value as T;
  };
  /** The reply as the page receives it (after the transport). */
  const page = <T>(operationId: string, params: unknown = {}): T =>
    delivered(operationId, value(operationId, params)) as T;
  const failure = (operationId: string, params: unknown = {}) => {
    const answer = ask(operationId, params);
    expect(answer.status, operationId).not.toBe(200);
    return answer;
  };
  const pending = () =>
    Object.keys(
      value<{ dirtyModules: object }>("systemGetInformation").dirtyModules,
    ).sort();
  const devices = () => value<List>("networkEnumerateDevicesList", ALL).data;
  const deviceNamed = (name: string) =>
    devices().find((d) => d.devicename === name);
  const ifaces = () => value<List>("networkGetInterfaceList", ALL).data;
  const rules = () => value<Row[]>("iptablesGetRules");
  const rules6 = () => value<Row[]>("iptablesGetRules6");
  const applyAll = (modules: string[] = [], force = false) => {
    expect(ask("configApplyChangesBg", { modules, force })).toBe("applied");
    return raw("execGetOutput", { filename: APPLY, pos: 0 });
  };
  const undo = () => {
    expect(ask("configRevertChangesBg", {})).toBe("reverted");
    return raw("execGetOutput", { filename: REVERT, pos: 0 });
  };
  return {
    session,
    raw,
    ask,
    value,
    page,
    failure,
    pending,
    devices,
    deviceNamed,
    ifaces,
    rules,
    rules6,
    applyAll,
    undo,
  };
}

/** The reads every network page makes, and those of each interface and rule. */
const READS = [
  "networkGetGeneralSettings",
  "networkEnumerateDevicesList",
  "networkGetInterfaceList",
  "networkGetEthernetCandidates",
  "networkGetWirelessCandidates",
  "networkGetVlanCandidates",
  "networkGetProxy",
  "iptablesGetRules",
  "iptablesGetRules6",
  "webGuiGetSettings",
  "sshGet",
  "systemGetInformation",
  "configIsDirty",
] as const;

/** The reads that fail in each networkReadFails story. */
const FAILING: Partial<Record<NetworkScenarioName, readonly string[]>> = {
  networkReadFails: ["networkEnumerateDevicesList"],
  networkReadFailsName: ["networkGetGeneralSettings"],
  networkReadFailsList: ["networkGetInterfaceList"],
  networkReadFailsInterface: ["networkGetInterface", "networkGetInformation"],
  networkReadFailsFirewall: [
    "iptablesGetRules",
    "iptablesGetRules6",
    "iptablesGetRule",
  ],
  networkReadFailsProxy: ["networkGetProxy"],
  networkReadFailsPorts: ["webGuiGetSettings", "sshGet"],
};

afterEach(() => {
  vi.useRealTimers();
  setApparentPageLocation(null);
});

describe("the network stories of the mock", () => {
  it("are in the picker, in their own group, each with a label", () => {
    const group = SCENARIO_GROUPS.find((g) => g.names === NETWORK_SCENARIOS);
    expect(group?.names).toEqual(NETWORK_SCENARIOS);
    for (const name of NETWORK_SCENARIOS) {
      expect(SCENARIO_LABELS[name]).toMatch(/^(Network|Firewall|Proxy): /u);
    }
  });

  it.each(NETWORK_SCENARIOS)(
    "%s: every read has the contract's shape, and no stored password gets past the transport",
    (scenario) => {
      const s = story(scenario);
      const failing = FAILING[scenario] ?? [];
      const each = (operationId: string, params: unknown) => {
        if (failing.includes(operationId)) {
          expect(s.failure(operationId, params).status).toBe(500);
          return;
        }
        const answer = s.ask(operationId, params);
        if (typeof answer === "string") {
          return;
        }
        expect(answer.status, operationId).toBe(200);
        expect(
          JSON.stringify(delivered(operationId, answer.value)),
        ).not.toContain(EXAMPLE_PASSWORD);
      };
      for (const operationId of READS) {
        each(operationId, ALL);
      }
      each("networkEnumerateBondSlaves", { uuid: NEW_OBJECT, unused: true });
      each("networkEnumerateBridgeSlaves", { uuid: NEW_OBJECT, unused: true });
      if (!failing.includes("networkGetInterfaceList")) {
        for (const i of s.ifaces()) {
          each("networkGetInterface", { uuid: i.uuid });
        }
      }
      if (!failing.includes("networkEnumerateDevicesList")) {
        for (const d of s.devices()) {
          each("networkGetInformation", { devicename: d.devicename });
        }
      }
      if (!failing.includes("iptablesGetRules")) {
        for (const r of [...s.rules(), ...s.rules6()]) {
          each("iptablesGetRule", { uuid: r.uuid });
        }
      }
    },
  );

  it.each([
    { scenario: "networkOne", hostname: "192.0.2.10" },
    { scenario: "networkTwo", hostname: "192.0.2.10" },
    { scenario: "networkByName", hostname: "nas.example.org" },
    { scenario: "networkByNameTwo", hostname: "nas.local" },
    { scenario: "networkUnknown", hostname: "198.51.100.77" },
    { scenario: "networkVpn", hostname: "198.51.100.1" },
    { scenario: "networkUnmanaged", hostname: "192.0.2.10" },
    { scenario: "networkLayers", hostname: "203.0.113.20" },
    { scenario: "networkWifi", hostname: "192.0.2.30" },
    { scenario: "networkPending", hostname: "192.0.2.10" },
    { scenario: "networkApply", hostname: "192.0.2.10" },
  ] as const)(
    "$scenario appears opened at http://$hostname/",
    ({ scenario, hostname }) => {
      expect(networkPageAddress(scenario)).toEqual({
        protocol: "http:",
        hostname,
        port: "",
      });
    },
  );

  it("every network story has an apparent address; no other story has one", () => {
    for (const name of NETWORK_SCENARIOS) {
      expect(networkPageAddress(name)?.protocol).toBe("http:");
    }
    for (const name of ["admin", "servicesSome", "networkWifiDown"]) {
      expect(networkPageAddress(name)).toBeNull();
    }
  });
});

describe("what each story shows (design 17)", () => {
  /** The devices with an address, other than the loopback interface. */
  const addressed = (s: ReturnType<typeof story>) =>
    s.devices().filter((d) => d.type !== "loopback" && d.address !== "");

  it("networkOne: one port, automatic IPv4 and IPv6, at the page's address", () => {
    const s = story("networkOne");
    const [port] = s.ifaces();
    expect(port).toMatchObject({
      devicename: "enp2s0",
      method: "dhcp",
      method6: "auto",
    });
    expect(s.deviceNamed("enp2s0")).toMatchObject({
      address: "192.0.2.10",
      address6: "2001:db8::10",
      prefix6: 64,
    });
  });

  it("networkTwo: a fixed address and a port not set up", () => {
    const s = story("networkTwo");
    expect(s.ifaces().map((i) => [i.devicename, i.method])).toEqual([
      ["enp2s0", "static"],
    ]);
    const free = s.deviceNamed("enp3s0");
    expect(free).toMatchObject({
      uuid: NEW_OBJECT,
      state: "DOWN",
      link: false,
      stats: [],
    });
    expect(free).not.toHaveProperty("method");
    expect(
      s.value<Row[]>("networkGetEthernetCandidates").map((d) => d.devicename),
    ).toEqual(["enp3s0"]);
  });

  it.each([
    { scenario: "networkByName", count: 1, domain: "example.org" },
    { scenario: "networkByNameTwo", count: 2, domain: "" },
  ] as const)(
    "$scenario: opened by name with $count interface(s) that have an address",
    ({ scenario, count, domain }) => {
      const s = story(scenario);
      expect(addressed(s)).toHaveLength(count);
      expect(s.value("networkGetGeneralSettings")).toEqual({
        hostname: "nas",
        domainname: domain,
      });
    },
  );

  it("networkUnknown: no interface reports the page's address", () => {
    const s = story("networkUnknown");
    const all = s.devices().flatMap((d) => [d.address, d.address6]);
    expect(all).not.toContain("198.51.100.77");
  });

  it("networkVpn: the page's address is a virtual interface's, which has no settings here", () => {
    const s = story("networkVpn");
    expect(s.deviceNamed("wg0")).toMatchObject({
      uuid: NEW_OBJECT,
      type: "virtual",
      address: "198.51.100.1",
      speed: -1,
    });
    expect(s.ifaces().map((i) => i.devicename)).toEqual(["enp2s0"]);
  });

  it("networkUnmanaged: the page's port has an address but no settings here (P17)", () => {
    const s = story("networkUnmanaged");
    expect(s.deviceNamed("enp2s0")).toMatchObject({
      uuid: NEW_OBJECT,
      address: "192.0.2.10",
    });
    expect(s.ifaces().map((i) => i.devicename)).toEqual(["enp3s0"]);
  });

  it("networkLayers: a bond of two ports with a VLAN on it, a bridge with one interface", () => {
    const s = story("networkLayers");
    for (const port of ["enp3s0", "enp26s0"]) {
      expect(s.deviceNamed(port)).toMatchObject({
        uuid: NEW_OBJECT,
        _used: true,
        _readonly: true,
        method: "",
        method6: "",
      });
    }
    expect(s.deviceNamed("enp4s0")).toMatchObject({ _used: false });
    expect(s.deviceNamed("enp4s0")).not.toHaveProperty("method");
    expect(s.deviceNamed("bond0.10")).toMatchObject({
      type: "vlan",
      vlan: true,
      vlanid: 10,
      address: "203.0.113.20",
    });
    expect(s.deviceNamed("bond0")).toMatchObject({
      vlanid: -1,
      slaves: ["enp3s0", "enp26s0"],
    });
    expect(s.deviceNamed("br0")).toMatchObject({ slaves: ["enp4s0"] });
    // A bond's ports are not rows of the stored list.
    expect(s.ifaces().map((i) => i.devicename)).toEqual([
      "bond0",
      "bond0.10",
      "br0",
      "enp2s0",
    ]);
    expect(
      s
        .value<Row[]>("networkEnumerateBridgeSlaves", {
          uuid: NEW_OBJECT,
          unused: true,
        })
        .map((d) => d.devicename),
    ).toEqual(["bond0.10"]);
  });

  it("networkWifi: the stored password travels raw and arrives as whether it is set", () => {
    const s = story("networkWifi");
    const id = NETWORK_IFACES.wlp3s0;
    expect(s.value<Row>("networkGetInterface", { uuid: id }).wpapsk).toBe(
      EXAMPLE_PASSWORD,
    );
    expect(s.page<Row>("networkGetInterface", { uuid: id }).wpapsk).toBe(true);
    const row = s.deviceNamed("wlp3s0");
    expect(row).toMatchObject({
      wpapsk: EXAMPLE_PASSWORD,
      address: "192.0.2.30",
    });
    const pageRows = s.page<List>("networkEnumerateDevicesList", ALL).data;
    expect(pageRows.find((d) => d.devicename === "wlp3s0")).not.toHaveProperty(
      "wpapsk",
    );
    expect(
      s.value<Row[]>("networkGetWirelessCandidates").map((d) => d.devicename),
    ).toEqual(["wlp4s0"]);
  });

  it("networkPending: settings not in use, a pending list that blocks the page, a pending removal", () => {
    const s = story("networkPending");
    expect(s.pending()).toEqual(
      sorted([...NETWORK_DIRTY.ifaceRemoved, "iptables"]),
    );
    const enp3 = s.ifaces().find((i) => i.devicename === "enp3s0");
    expect(enp3?.address).toBe("203.0.113.11");
    expect(s.deviceNamed("enp3s0")?.address).toBe("203.0.113.10");
    // enp26s0's settings are removed, but it still uses its address until the queued job runs.
    expect(s.ifaces().map((i) => i.devicename)).not.toContain("enp26s0");
    expect(s.deviceNamed("enp26s0")).toMatchObject({
      uuid: NEW_OBJECT,
      address: "198.51.100.10",
    });
    expect(s.rules().map((r) => [r.action, r.dport])).toEqual([
      ["REJECT", "80"],
      ["REJECT", "443"],
    ]);
  });

  it.each([
    { scenario: "firewallNone", v4: 0, v6: 0 },
    { scenario: "firewallSome", v4: 4, v6: 2 },
    { scenario: "firewallAllowlist", v4: 4, v6: 0 },
    { scenario: "firewallClassic", v4: 6, v6: 0 },
    { scenario: "firewallBlocksPage", v4: 2, v6: 0 },
    { scenario: "firewallBlocksReplies", v4: 1, v6: 0 },
    { scenario: "firewallMany", v4: 200, v6: 0 },
  ] as const)(
    "$scenario: $v4 IPv4 rules and $v6 IPv6 rules",
    ({ scenario, v4, v6 }) => {
      const s = story(scenario);
      expect(s.rules()).toHaveLength(v4);
      expect(s.rules6()).toHaveLength(v6);
      expect(
        new Set([...s.rules(), ...s.rules6()].map((r) => r.uuid)).size,
      ).toBe(v4 + v6);
    },
  );

  it.each([
    {
      scenario: "firewallBlocksPage",
      want: [
        ["INPUT", "REJECT", "80", ""],
        ["INPUT", "REJECT", "443", ""],
      ],
    },
    { scenario: "firewallBlocksReplies", want: [["OUTPUT", "DROP", "", ""]] },
  ] as const)(
    "$scenario is pending and blocks every computer",
    ({ scenario, want }) => {
      const s = story(scenario);
      expect(s.pending()).toEqual(["iptables"]);
      expect(
        s.rules().map((r) => [r.chain, r.action, r.dport, r.source]),
      ).toEqual(want);
    },
  );

  it("firewallAllowlist ends with Block everything else's three rules", () => {
    expect(
      story("firewallAllowlist")
        .rules()
        .slice(1)
        .map((r) => [r.action, r.extraoptions]),
    ).toEqual([
      ["ACCEPT", "-i lo"],
      ["ACCEPT", "-m conntrack --ctstate ESTABLISHED,RELATED"],
      ["REJECT", ""],
    ]);
  });

  it("proxySet: three proxies, two with stored passwords, which arrive as whether they are set", () => {
    const s = story("proxySet");
    expect(s.value<Row>("networkGetProxy")).toMatchObject({
      http: [],
      https: [],
      ftp: [],
      httppassword: EXAMPLE_PASSWORD,
      httpspassword: EXAMPLE_PASSWORD,
      ftppassword: "",
    });
    expect(s.page<Row>("networkGetProxy")).toMatchObject({
      httpenable: true,
      httpsenable: true,
      ftpenable: true,
      httppassword: true,
      httpspassword: true,
      ftppassword: false,
    });
  });

  it("networkHostile: 200-character notes and names, a 32-byte Wi-Fi name, 15-character interface names", () => {
    const s = story("networkHostile");
    const rows = s.ifaces();
    for (const row of rows) {
      expect(String(row.comment)).toHaveLength(200);
      expect(String(row.comment)).toContain("<img src=x");
      expect(String(row.comment)).toContain("‮");
      expect(String(row.devicename)).toHaveLength(15);
    }
    const wifiRow = rows.find((r) => r.type === "wifi");
    expect(wifiRow?.wpassid).toBe(HOSTILE_SSID);
    expect(new TextEncoder().encode(HOSTILE_SSID)).toHaveLength(32);
    expect(HOSTILE_DOMAIN).toHaveLength(200);
    expect(s.value<Row>("networkGetGeneralSettings").domainname).toBe(
      HOSTILE_DOMAIN,
    );
    for (const r of [...s.rules(), ...s.rules6()]) {
      expect(String(r.comment)).toHaveLength(200);
    }
  });
});

describe("writes, as the test VM answered them", () => {
  it("a port set up: stored shape in the reply, spaces in the list, commas in getInterface", () => {
    const s = story("networkTwo");
    const reply = s.value<Row>(
      "networkSetEthernetIface",
      sent(
        F.NetworkSetEthernetIfaceRequestSchema,
        ethernet({
          dnsnameservers: "203.0.113.53,203.0.113.54",
          dnssearch: "example.org,example.net",
        }),
      ),
    );
    expect(reply).toMatchObject({
      devicename: "enp3s0",
      type: "ethernet",
      slaves: "",
      wpapsk: "",
      mtu: 0,
      netmask6: 64,
      dnsnameservers: "203.0.113.53 203.0.113.54",
      dnssearch: "example.org example.net",
    });
    expect(Object.keys(reply)).toEqual(
      Object.keys(CONTRACT_EXAMPLES.networkSetEthernetIface.changed.value),
    );
    const id = String(reply.uuid);
    expect(id).not.toBe(NEW_OBJECT);
    expect(s.value<Row>("networkGetInterface", { uuid: id })).toMatchObject({
      dnsnameservers: "203.0.113.53,203.0.113.54",
      dnssearch: "example.org,example.net",
      slaves: [],
    });
    expect(s.ifaces().find((i) => i.uuid === id)).toMatchObject({
      dnsnameservers: "203.0.113.53 203.0.113.54",
      _used: false,
      _readonly: false,
    });
    expect(s.pending()).toEqual(sorted(NETWORK_DIRTY.ifaceNew));
    // Stored, not in use until applied.
    expect(s.deviceNamed("enp3s0")).toMatchObject({
      uuid: id,
      method: "static",
      address: "",
    });
  });

  it.each([
    { sentAs: "203.0.113.53,203.0.113.54" },
    { sentAs: "203.0.113.53; 203.0.113.54" },
    { sentAs: "203.0.113.53 203.0.113.54" },
  ])(
    "name servers sent as '$sentAs' are stored and listed with spaces",
    ({ sentAs }) => {
      const s = story("networkTwo");
      const reply = s.value<Row>(
        "networkSetEthernetIface",
        ethernet({ dnsnameservers: sentAs }),
      );
      expect(reply.dnsnameservers).toBe("203.0.113.53 203.0.113.54");
    },
  );

  it("a port changed marks the changed set; the same kind and name again is refused in OMV's words", () => {
    const s = story("networkTwo");
    const id = NETWORK_IFACES.enp2s0;
    s.value(
      "networkSetEthernetIface",
      sent(
        F.NetworkSetEthernetIfaceRequestSchema,
        ethernet({
          uuid: id,
          devicename: "enp2s0",
          address: "192.0.2.11",
          gateway: "192.0.2.1",
        }),
      ),
    );
    expect(s.pending()).toEqual(sorted(NETWORK_DIRTY.ifaceChanged));
    const twin = s.failure(
      "networkSetEthernetIface",
      ethernet({ devicename: "enp2s0" }),
    );
    expect(twin).toMatchObject({
      status: 500,
      message:
        CONTRACT_EXAMPLES.networkSetEthernetIface.sameName.value.message.replace(
          "enp3s0",
          "enp2s0",
        ),
    });
    expect(s.failure("networkGetInterface", { uuid: NEW_OBJECT }).status).toBe(
      500,
    );
  });

  it("a bond: OMV names it, refuses a port already in one, and mode 1 without a main port", () => {
    const s = story("networkLayers");
    expect(
      s.failure("networkSetBondIface", bond({ slaves: ["enp3s0"] })),
    ).toMatchObject({
      status: 500,
      message: CONTRACT_EXAMPLES.networkSetBondIface.portInBond.value.message,
    });
    const t = story("networkTwo");
    expect(
      t.failure(
        "networkSetBondIface",
        bond({ slaves: ["enp3s0"], bondprimary: "" }),
      ),
    ).toMatchObject({
      status: 500,
      message: CONTRACT_EXAMPLES.networkSetBondIface.noPrimary.value.message,
    });
    const made = t.value<Row>(
      "networkSetBondIface",
      sent(
        F.NetworkSetBondIfaceRequestSchema,
        bond({ slaves: ["enp3s0"], bondprimary: "enp3s0" }),
      ),
    );
    expect(made).toMatchObject({
      devicename: "bond0",
      slaves: "enp3s0",
      type: "bond",
    });
  });

  it("a VLAN is named after what it runs on and its ID", () => {
    const s = story("networkTwo");
    const made = s.value<Row>(
      "networkSetVlanIface",
      sent(F.NetworkSetVlanIfaceRequestSchema, vlan()),
    );
    expect(made).toMatchObject({
      devicename: "enp2s0.20",
      vlanid: 20,
      vlanrawdevice: "enp2s0",
    });
  });

  it("Wi-Fi: no password is refused (400), an empty one is stored, and every reply carries it", () => {
    const s = story("networkWifi");
    const { wpapsk: _gone, ...without } = wifi();
    expect(s.failure("networkSetWirelessIface", without)).toMatchObject({
      status: 400,
      message:
        CONTRACT_EXAMPLES.networkSetWirelessIface.noPassword.value.message,
    });
    const made = s.value<Row>(
      "networkSetWirelessIface",
      sent(F.NetworkSetWirelessIfaceRequestSchema, wifi()),
    );
    expect(made).toMatchObject({
      wpapsk: EXAMPLE_PASSWORD,
      wpassid: "EXAMPLE-NETWORK",
    });
    expect(
      s.page<Row>("networkSetWirelessIface", wifi({ uuid: made.uuid })),
    ).not.toHaveProperty("wpapsk");
    const emptied = s.value<Row>(
      "networkSetWirelessIface",
      wifi({ uuid: made.uuid, wpapsk: "" }),
    );
    expect(emptied.wpapsk).toBe("");
    expect(s.page<Row>("networkGetInterface", { uuid: made.uuid }).wpapsk).toBe(
      false,
    );
  });

  it("removing settings answers what was removed, marks task too, and queues the job", () => {
    const s = story("networkTwo");
    const removed = s.value<Row>(
      "networkDeleteInterface",
      sent(F.NetworkDeleteInterfaceRequestSchema, {
        uuid: NETWORK_IFACES.enp2s0,
      }),
    );
    expect(removed).toMatchObject({
      devicename: "enp2s0",
      slaves: "",
      wpapsk: "",
    });
    expect(s.pending()).toEqual(sorted(NETWORK_DIRTY.ifaceRemoved));
    expect(s.ifaces()).toEqual([]);
    expect(s.deviceNamed("enp2s0")?.address).toBe("192.0.2.10");
    expect(s.session.network?.queued).toEqual(["enp2s0"]);
  });

  it("the name: saved as sent, the four reserved domains refused in OMV's words", () => {
    const s = story("networkOne");
    expect(
      s.value(
        "networkSetGeneralSettings",
        sent(F.NetworkSetGeneralSettingsRequestSchema, {
          hostname: "store",
          domainname: "example.org",
        }),
      ),
    ).toEqual({ hostname: "store", domainname: "example.org" });
    expect(s.pending()).toEqual(sorted(NETWORK_DIRTY.name));
    expect(s.value("networkGetGeneralSettings")).toEqual({
      hostname: "store",
      domainname: "example.org",
    });
    expect(
      s.failure("networkSetGeneralSettings", {
        hostname: "nas",
        domainname: "local",
      }),
    ).toMatchObject({
      status: 500,
      message:
        CONTRACT_EXAMPLES.networkSetGeneralSettings.domainLocal.value.message,
    });
  });

  it("firewall: rulenum -1 adds after the last, setRules gives every rule a new UUID, deleteRule answers the rule", () => {
    const s = story("firewallNone");
    const first = s.value<Row>(
      "iptablesSetRule",
      sent(F.IptablesSetRuleRequestSchema, RULE),
    );
    const second = s.value<Row>(
      "iptablesSetRule",
      sent(F.IptablesSetRuleRequestSchema, RULE),
    );
    expect([first.rulenum, second.rulenum]).toEqual([0, 1]);
    expect(s.pending()).toEqual(["iptables"]);
    const { uuid: _u, rulenum: _n, ...fields } = first;
    const reordered = [
      { ...fields, uuid: second.uuid, rulenum: 0 },
      { ...fields, uuid: first.uuid, rulenum: 1, dport: "80" },
    ];
    const stored = s.value<Row[]>(
      "iptablesSetRules",
      sent(F.IptablesSetRulesRequestSchema, reordered),
    );
    expect(stored.map((r) => r.rulenum)).toEqual([0, 1]);
    for (const r of stored) {
      expect([first.uuid, second.uuid]).not.toContain(r.uuid);
    }
    expect(s.rules()).toEqual(stored);
    const removed = s.value<Row>(
      "iptablesDeleteRule",
      sent(F.IptablesDeleteRuleRequestSchema, { uuid: stored[0]?.uuid }),
    );
    expect(removed).toEqual(stored[0]);
    expect(s.rules()).toEqual([stored[1]]);
    expect(s.failure("iptablesDeleteRule", { uuid: removed.uuid }).status).toBe(
      500,
    );
  });

  it("firewall: setRules6 replaces only the IPv6 list; setRules [] empties the IPv4 one", () => {
    const s = story("firewallSome");
    const v6 = s
      .rules6()
      .map(({ uuid: _u, ...r }) => ({ ...r, uuid: NEW_OBJECT }));
    s.value(
      "iptablesSetRules6",
      sent(F.IptablesSetRules6RequestSchema, v6.slice(0, 1)),
    );
    expect(s.rules6()).toHaveLength(1);
    expect(s.rules()).toHaveLength(4);
    s.value("iptablesSetRules", sent(F.IptablesSetRulesRequestSchema, []));
    expect(s.rules()).toEqual([]);
    expect(s.rules6()).toHaveLength(1);
  });

  it("the proxy: flat in getProxy with empty nests, nested in setProxy's reply", () => {
    const s = story("networkOne");
    const reply = s.value<Row>(
      "networkSetProxy",
      sent(F.NetworkSetProxyRequestSchema, PROXY),
    );
    expect(reply).toEqual({
      http: {
        enable: true,
        host: "proxy.example.org",
        port: 3128,
        username: "example-user",
        password: EXAMPLE_PASSWORD,
      },
      https: {
        enable: false,
        host: "",
        port: 3129,
        username: "",
        password: "",
      },
      ftp: { enable: false, host: "", port: 2121, username: "", password: "" },
    });
    expect(JSON.stringify(s.page("networkSetProxy", PROXY))).not.toContain(
      EXAMPLE_PASSWORD,
    );
    expect(s.pending()).toEqual(["apt", "profile"]);
    expect(s.page<Row>("networkGetProxy")).toMatchObject({
      httphost: "proxy.example.org",
      httppassword: true,
      httpspassword: false,
    });
  });

  it("strict mode refuses a body the contract refuses, and lets a good one through", () => {
    const s = story("networkTwo");
    const network = s.session.network;
    if (network === undefined) {
      throw new Error("no network state");
    }
    network.strict = true;
    expect(
      s.failure(
        "networkSetEthernetIface",
        ethernet({ dnsnameservers: "203.0.113.53; 203.0.113.54" }),
      ),
    ).toMatchObject({
      status: 500,
      message: expect.stringMatching(/^contract refused: /u),
    });
    expect(
      s.failure("iptablesSetRule", { ...RULE, source: "the office" }).status,
    ).toBe(500);
    expect(s.ask("networkSetEthernetIface", ethernet()).status).toBe(200);
  });

  it.each([
    {
      name: "the name",
      operationId: "networkSetGeneralSettings",
      params: { hostname: "nas", domainname: "" },
      modules: NETWORK_DIRTY.name,
    },
    {
      name: "a port set up",
      operationId: "networkSetEthernetIface",
      params: ethernet(),
      modules: NETWORK_DIRTY.ifaceNew,
    },
    {
      name: "a port changed",
      operationId: "networkSetEthernetIface",
      params: ethernet({ uuid: NETWORK_IFACES.enp2s0, devicename: "enp2s0" }),
      modules: NETWORK_DIRTY.ifaceChanged,
    },
    {
      name: "settings removed",
      operationId: "networkDeleteInterface",
      params: { uuid: NETWORK_IFACES.enp2s0 },
      modules: NETWORK_DIRTY.ifaceRemoved,
    },
    {
      name: "a rule",
      operationId: "iptablesSetRule",
      params: RULE,
      modules: NETWORK_DIRTY.firewall,
    },
    {
      name: "the IPv4 list",
      operationId: "iptablesSetRules",
      params: [],
      modules: NETWORK_DIRTY.firewall,
    },
    {
      name: "the IPv6 list",
      operationId: "iptablesSetRules6",
      params: [],
      modules: NETWORK_DIRTY.firewall,
    },
    {
      name: "the proxy",
      operationId: "networkSetProxy",
      params: PROXY,
      modules: NETWORK_DIRTY.proxy,
    },
    {
      name: "Blink its light",
      operationId: "networkIdentify",
      params: { devicename: "enp2s0", seconds: 5 },
      modules: [],
    },
  ] as const)(
    "$name marks $modules pending (design 0.7)",
    ({ operationId, params, modules }) => {
      const s = story("networkTwo");
      expect(s.pending()).toEqual([]);
      expect(s.ask(operationId, params).status).toBe(200);
      expect(s.pending()).toEqual(sorted(modules));
      expect(s.raw("configIsDirty")).toBe(
        modules.length > 0 ? "dirty" : "clean",
      );
    },
  );
});

describe("apply, undo and the queued job (1.5, 10.4)", () => {
  it("an apply puts the stored settings in use: a fixed address, an automatic one, Off", () => {
    const t = story("networkTwo");
    t.value("networkSetEthernetIface", ethernet({ address: "203.0.113.10" }));
    t.value(
      "networkSetEthernetIface",
      ethernet({
        uuid: NETWORK_IFACES.enp2s0,
        devicename: "enp2s0",
        method: "dhcp",
        address: "",
        netmask: "",
        method6: "auto",
      }),
    );
    expect(t.applyAll()).toBe("appliedFinished");
    expect(t.pending()).toEqual([]);
    // enp3s0 has no cable: its fixed address is set all the same.
    expect(t.deviceNamed("enp3s0")).toMatchObject({
      address: "203.0.113.10",
      prefix: 24,
    });
    // The router gives enp2s0 the address it had; it makes its own IPv6 link-local address.
    expect(t.deviceNamed("enp2s0")).toMatchObject({
      address: "192.0.2.10",
      address6: linkLocalOf("00:00:5e:00:53:01"),
      prefix6: 64,
    });
    t.value(
      "networkSetEthernetIface",
      ethernet({
        uuid: NETWORK_IFACES.enp2s0,
        devicename: "enp2s0",
        method: "manual",
        address: "",
        netmask: "",
      }),
    );
    t.applyAll();
    expect(t.deviceNamed("enp2s0")).toMatchObject({
      address: "",
      prefix: -1,
      address6: "",
    });
  });

  it("a bond, a VLAN and a bridge come into being when applied", () => {
    const s = story("networkTwo");
    s.value("networkSetVlanIface", vlan());
    s.applyAll();
    expect(s.deviceNamed("enp2s0.20")).toMatchObject({
      type: "vlan",
      vlan: true,
      vlanid: 20,
      address: "198.51.100.20",
      ether: "00:00:5e:00:53:01",
    });
  });

  it("undo brings the settings back; the queued job stays and runs at the next apply that includes task", () => {
    const s = story("networkPending");
    expect(s.undo()).toBe("revertedFinished");
    expect(s.pending()).toEqual([]);
    expect(s.ifaces().map((i) => [i.devicename, i.address])).toEqual([
      ["enp2s0", ""],
      ["enp3s0", "203.0.113.10"],
      ["enp26s0", "198.51.100.10"],
    ]);
    expect(s.rules()).toEqual([]);
    expect(s.session.network?.queued).toEqual(["enp26s0"]);
    // An apply without task leaves it queued.
    s.value("iptablesSetRules", []);
    s.applyAll();
    expect(s.deviceNamed("enp26s0")?.address).toBe("198.51.100.10");
    expect(s.session.network?.queued).toEqual(["enp26s0"]);
    // A later, unrelated apply that includes task switches the restored interface off.
    s.applyAll(["task"], true);
    expect(s.deviceNamed("enp26s0")).toMatchObject({
      address: "",
      state: "DOWN",
    });
    expect(s.session.network?.queued).toEqual([]);
  });

  it("10.4's forced apply of task and the network switches the restored interface off and on again", () => {
    const s = story("networkPending");
    s.undo();
    s.applyAll(["task", "systemd-networkd"], true);
    expect(s.deviceNamed("enp26s0")).toMatchObject({
      address: "198.51.100.10",
      state: "UP",
    });
    expect(s.session.network?.queued).toEqual([]);
  });

  it("an apply that includes task takes a removed bond away and frees its ports", () => {
    const s = story("networkLayers");
    s.value("networkDeleteInterface", { uuid: NETWORK_IFACES.vlan });
    s.value("networkDeleteInterface", { uuid: NETWORK_IFACES.bond0 });
    s.applyAll();
    expect(s.deviceNamed("bond0")).toBeUndefined();
    expect(s.deviceNamed("bond0.10")).toBeUndefined();
    expect(s.deviceNamed("enp3s0")).toMatchObject({ _used: false });
    expect(s.deviceNamed("enp3s0")).not.toHaveProperty("method");
  });
});

describe("networkApply: the connection after an apply (1.5)", () => {
  /** Apply what the story has pending, then ask for the pending modules at `ms` after the start. */
  function applyThenRead(scenario: NetworkScenarioName) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    const s = story(scenario);
    expect(s.pending()).toEqual(sorted(NETWORK_DIRTY.ifaceNew));
    expect(s.ask("configApplyChangesBg", { modules: [], force: false })).toBe(
      "applied",
    );
    const at = (ms: number) => {
      vi.setSystemTime(new Date(Date.parse("2026-11-23T10:00:00Z") + ms));
      return s.raw("systemGetInformation") as FixedAnswer;
    };
    return { s, at };
  }

  it("networkApply: no reply for 8 seconds, then the NAS answers with the change applied", () => {
    const { s, at } = applyThenRead("networkApply");
    for (const ms of [0, 2_000, NETWORK_LOSS_MS - 1]) {
      expect(at(ms)).toEqual(NO_REPLY);
    }
    expect(s.raw("execGetOutput", { filename: APPLY, pos: 0 })).toEqual(
      NO_REPLY,
    );
    expect(at(NETWORK_LOSS_MS)).toMatchObject({ status: 200 });
    expect(s.pending()).toEqual([]);
    expect(s.raw("execGetOutput", { filename: APPLY, pos: 0 })).toBe(
      "appliedFinished",
    );
    expect(s.deviceNamed("enp3s0")?.address).toBe("203.0.113.10");
  });

  it("networkApplyNever: no reply, for good", () => {
    const { s, at } = applyThenRead("networkApplyNever");
    for (const ms of [0, NETWORK_LOSS_MS, 120_000, 3_600_000]) {
      expect(at(ms)).toEqual(NO_REPLY);
    }
    expect(s.raw("sessionLogin", { username: "admin", password: "x" })).toEqual(
      NO_REPLY,
    );
  });

  it("networkApplySignIn: after the loss the NAS answers 401 until signed in again, the change applied", () => {
    const { s, at } = applyThenRead("networkApplySignIn");
    expect(at(1_000)).toEqual(NO_REPLY);
    expect(at(NETWORK_LOSS_MS)).toMatchObject({
      status: 401,
      message: "Session expired.",
    });
    expect(at(NETWORK_LOSS_MS + 2_000)).toMatchObject({ status: 401 });
    expect(s.raw("sessionLogin", { username: "admin", password: "x" })).toBe(
      "authenticated",
    );
    expect(s.pending()).toEqual([]);
    expect(s.deviceNamed("enp3s0")?.address).toBe("203.0.113.10");
  });

  it("networkApplyOldAddress: the connection holds and the NAS keeps the addresses it had", () => {
    const { s, at } = applyThenRead("networkApplyOldAddress");
    expect(at(0)).toMatchObject({ status: 200 });
    expect(s.raw("execGetOutput", { filename: APPLY, pos: 0 })).toBe(
      "appliedFinished",
    );
    expect(s.pending()).toEqual([]);
    expect(s.deviceNamed("enp3s0")?.address).toBe("");
  });

  it("an apply of the firewall alone does not cut the connection", () => {
    vi.useFakeTimers();
    const s = story("networkApply");
    s.undo();
    s.value("iptablesSetRules", []);
    expect(s.ask("configApplyChangesBg", { modules: [], force: false })).toBe(
      "applied",
    );
    expect(s.raw("systemGetInformation")).toMatchObject({ status: 200 });
  });

  it("no reply is a network error on the wire, not an HTTP status", () => {
    expect(replyOf(NO_REPLY).type).toBe("error");
  });
});

describe("Blink its light (a task)", () => {
  it("runs while the light blinks, then ends with no output; the handle is then gone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    const s = story("networkTwo");
    const handle = s.value<string>("networkIdentify", {
      devicename: "enp2s0",
      seconds: 5,
    });
    expect(handle).toMatch(/^\/tmp\/bgstatus/u);
    expect(
      s.value<Row>("execGetOutput", { filename: handle, pos: 0 }),
    ).toMatchObject({ running: true });
    expect(s.value<Row>("execIsRunning", { filename: handle })).toMatchObject({
      running: true,
    });
    vi.advanceTimersByTime(5_000);
    expect(
      s.value<Row>("execGetOutput", { filename: handle, pos: 0 }),
    ).toMatchObject({
      running: false,
      output: "",
    });
    expect(
      s.failure("execGetOutput", { filename: handle, pos: 0 }).status,
    ).toBe(500);
  });

  it("fails at the end on a device whose light cannot blink, and can be stopped", () => {
    vi.useFakeTimers();
    const s = story("networkWifi");
    const handle = s.value<string>("networkIdentify", {
      devicename: "wlp3s0",
      seconds: 5,
    });
    vi.advanceTimersByTime(5_000);
    expect(
      s.failure("execGetOutput", { filename: handle, pos: 0 }).message,
    ).toContain("Operation not supported");
    const other = s.value<string>("networkIdentify", {
      devicename: "enp2s0",
      seconds: 30,
    });
    expect(s.ask("execStop", { filename: other }).status).toBe(200);
    expect(s.value<Row>("execIsRunning", { filename: other })).toMatchObject({
      running: false,
    });
  });
});

describe("the apparent page address (D17)", () => {
  it("is what the mock says in development and tests, and the page's own address otherwise", () => {
    expect(readPageLocation().hostname).toBe("localhost");
    setApparentPageLocation({
      protocol: "http:",
      hostname: "192.0.2.10",
      port: "",
    });
    expect(readPageLocation()).toEqual({
      protocol: "http:",
      hostname: "192.0.2.10",
      port: "",
    });
    setApparentPageLocation(null);
    expect(readPageLocation().hostname).toBe("localhost");
  });

  it.each(["data:", "file:", "", "ftp:", "HTTP:"])(
    "refuses the protocol %j",
    (protocol) => {
      expect(() => {
        setApparentPageLocation({ protocol, hostname: "192.0.2.10", port: "" });
      }).toThrow(/protocol/u);
    },
  );
});

describe("address helpers", () => {
  it.each([
    { netmask: "255.255.255.0", prefix: 24 },
    { netmask: "255.255.0.0", prefix: 16 },
    { netmask: "255.255.255.255", prefix: 32 },
    { netmask: "0.0.0.0", prefix: 0 },
    { netmask: "255.0.255.0", prefix: -1 },
    { netmask: "255.255.255", prefix: -1 },
    { netmask: "", prefix: -1 },
    { netmask: "255.255.255.256", prefix: -1 },
  ])("prefixOf($netmask) is $prefix", ({ netmask, prefix }) => {
    expect(prefixOf(netmask)).toBe(prefix);
    if (prefix >= 0) {
      expect(netmaskOf(prefix)).toBe(netmask);
    }
  });

  it.each([
    { prefix: 64, want: "ffff:ffff:ffff:ffff:0000:0000:0000:0000" },
    { prefix: 48, want: "ffff:ffff:ffff:0000:0000:0000:0000:0000" },
    { prefix: 128, want: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff" },
  ])("netmask6Of($prefix)", ({ prefix, want }) => {
    expect(netmask6Of(prefix)).toBe(want);
  });

  it.each([
    { ether: "00:00:5e:00:53:01", want: "fe80::200:5eff:fe00:5301" },
    { ether: "02:00:5e:00:53:10", want: "fe80::0:5eff:fe00:5310" },
    { ether: "", want: "" },
    { ether: "zz:00:5e:00:53:01", want: "" },
  ])("linkLocalOf($ether) is $want", ({ ether, want }) => {
    expect(linkLocalOf(ether)).toBe(want);
  });
});
