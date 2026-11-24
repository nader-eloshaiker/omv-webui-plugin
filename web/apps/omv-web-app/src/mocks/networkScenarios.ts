// SPDX-License-Identifier: GPL-3.0-or-later
// The network scenarios of the mock (phase 5 network design 17): the name of this NAS, its interfaces,
// the firewall and the proxy. Development and test code only (UI-11).
//
// In these stories the answers REMEMBER what the reader did, as the services mock does, so the journeys
// of the design can be walked on `pnpm dev:mock`: the stored settings and, apart from them, what each
// interface uses now (the kernel's side, Network.getInformation's shape), the firewall lists, the proxy,
// the pending modules, apply and undo, and the connection going and coming back. What the answers do is
// what OMV does, read from source and, where the test VM showed it, as captured (the examples under
// spec-api-omv/src/examples, OMV 8.6.1):
// - enumerateDevicesList merges each device with its stored settings: the stored fields, then what it
//   uses now (addresses, network sizes, router addresses, packet size as text, VLAN ID, state). A device
//   with no settings has OMV's placeholder UUID and no `method`; a bond's port is `_used` and
//   `_readonly` with an empty `method`; settings for a device the system lacks are not listed;
// - getInterfaceList lists the stored settings with the name servers and search domains separated by
//   spaces and the ports as a list (a bond's ports are not rows); getInterface separates them by commas;
//   every set…Iface and deleteInterface answers the stored shape, the ports as one comma-separated
//   string; every one of them carries `wpapsk` ("" for a kind without one);
// - set…Iface refuses a second interface of the same kind and name, a bond port already in a bond, and
//   a bond in mode 1, 5 or 6 without a main port, in OMV's words; setWirelessIface refuses a request
//   without `wpapsk` (400) and stores an empty one; setBondIface chooses the bond's name; a VLAN is
//   named after what it runs on and its ID;
// - setRules and setRules6 replace the whole list and give every rule a new UUID; setRule with
//   rulenum -1 adds the rule after the last one; deleteRule answers the removed rule;
// - setGeneralSettings refuses the domains local, example, invalid and test (as sent, in lower case);
// - getProxy answers fifteen flattened fields with `http`, `https` and `ftp` empty ([]); setProxy answers
//   the nested stored shape; every stored password is "EXAMPLE-PASSWORD" (UI-6: the transport removes
//   or replaces it, which these stories prove);
// - pending modules (0.7, observed on the test VM): the name avahi hostname hosts postfix samba
//   systemd-networkd; an interface set up avahi collectd halt hosts issue systemd-networkd; one changed
//   the same without collectd; removed the first set and task; the firewall iptables; the proxy apt and
//   profile; Blink its light nothing;
// - removing an interface's settings queues a job that switches it off and clears its addresses (and
//   takes a bond, VLAN or bridge away). Undo brings the settings back and clears the pending list but
//   keeps the job, which runs at the next apply that includes `task` (10.4, observed). An apply runs the
//   queued jobs first, then sets the network up from the stored settings: a fixed address becomes the
//   address in use, an automatic one keeps the address it has (or gets one from the router), Off clears
//   it.
//
// The connection (1.5): in the networkApply stories an apply that sets the network up cuts the
// connection. Every rpc.php call then fails with no reply at all (the transport's `network` kind): for
// NETWORK_LOSS_MS, after which the NAS answers again (networkApply); for ever (networkApplyNever); or for
// NETWORK_LOSS_MS, after which the session is gone and every call answers 401 (networkApplySignIn).
// networkApplyOldAddress never loses the connection, and the change does not take effect: the NAS keeps
// the addresses it had.
//
// The page's apparent address (D17): `pnpm dev:mock` runs at localhost, which design 0.4 reads as a
// tunnel, so each story says where the page appears to be opened (networkPageAddress). The mock's
// bootstrap hands it to the one accessor the network code reads (src/network/pageLocation.ts), only in
// development and test builds.
//
// Everything here is written by hand in the shapes of the captured examples; networkScenarios.test.ts
// checks every reply against the contract's schemas. No value comes from a real system: addresses from
// 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 and 2001:db8::/32, hardware addresses from
// 00:00:5e:00:53:00/24, the NAS "nas", the domain example.org, UUIDs documentation values.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import * as F from "@omv-webui/react-api-omv/forms";
import type {
  IptablesRule,
  NetworkDeviceInformation,
  NetworkDeviceStats,
  NetworkGeneralSettings,
  NetworkInterfaceStored,
  NetworkProxyServerStored,
} from "@omv-webui/react-api-omv/generated";
import type {
  Answer,
  Answers,
  FixedAnswer,
} from "@omv-webui/react-api-omv/mocks";
import type { PageLocation } from "../network/connection.ts";
import { NEW_OBJECT, SHARES_MODULES } from "./sharesScenarios.ts";

export { NEW_OBJECT };

export const NETWORK_SCENARIOS = [
  "networkOne",
  "networkTwo",
  "networkByName",
  "networkByNameTwo",
  "networkUnknown",
  "networkVpn",
  "networkUnmanaged",
  "networkLayers",
  "networkWifi",
  "networkPending",
  "networkApply",
  "networkApplyNever",
  "networkApplySignIn",
  "networkApplyOldAddress",
  "networkReadFails",
  "networkReadFailsName",
  "networkReadFailsList",
  "networkReadFailsInterface",
  "networkReadFailsFirewall",
  "networkReadFailsProxy",
  "networkReadFailsPorts",
  "firewallNone",
  "firewallSome",
  "firewallAllowlist",
  "firewallClassic",
  "firewallBlocksPage",
  "firewallBlocksReplies",
  "firewallMany",
  "proxySet",
  "networkHostile",
] as const;
export type NetworkScenarioName = (typeof NETWORK_SCENARIOS)[number];

export const isNetworkScenario = (name: string): name is NetworkScenarioName =>
  (NETWORK_SCENARIOS as readonly string[]).includes(name);

/** What each story shows, for the picker. Development words, not the interface's. */
export const NETWORK_SCENARIO_LABELS: Record<NetworkScenarioName, string> = {
  networkOne:
    "Network: one port, automatic IPv4 and IPv6, page at its IPv4 address (hand-written)",
  networkTwo:
    "Network: a port with a fixed address and one not set up, page at the fixed one (hand-written)",
  networkByName:
    "Network: page opened by name, one interface with an address (probable) (hand-written)",
  networkByNameTwo:
    "Network: page opened by name, two interfaces with addresses (name only) (hand-written)",
  networkUnknown:
    "Network: page at an address no interface reports (hand-written)",
  networkVpn: "Network: page reached through a VPN's interface (hand-written)",
  networkUnmanaged:
    "Network: the page's port has no settings here (hand-written)",
  networkLayers:
    "Network: a bond with a VLAN on it, a bridge, page on the VLAN (hand-written)",
  networkWifi:
    "Network: page over Wi-Fi with a stored password, another Wi-Fi device free (hand-written)",
  networkPending:
    "Network: settings not in use yet, a pending firewall list that blocks the page, a pending removal (hand-written)",
  networkApply:
    "Network: applying loses the connection for 8 s, then the NAS answers (hand-written)",
  networkApplyNever:
    "Network: applying loses the connection for good (hand-written)",
  networkApplySignIn:
    "Network: after applying the NAS answers, but asks to sign in again (hand-written)",
  networkApplyOldAddress:
    "Network: applying changes nothing, the NAS keeps its old address (hand-written)",
  networkReadFails:
    "Network: reading the interfaces in use fails (hand-written)",
  networkReadFailsName:
    "Network: reading the name of this NAS fails (hand-written)",
  networkReadFailsList:
    "Network: reading the interfaces' settings fails (hand-written)",
  networkReadFailsInterface:
    "Network: reading one interface's settings and what it uses fails (hand-written)",
  networkReadFailsFirewall:
    "Network: reading the firewall rules fails (hand-written)",
  networkReadFailsProxy: "Network: reading the proxy fails (hand-written)",
  networkReadFailsPorts:
    "Network: reading the web interface's and SSH's ports fails (hand-written)",
  firewallNone: "Firewall: no rules",
  firewallSome:
    "Firewall: a handful of plain rules, IPv4 and IPv6 (hand-written)",
  firewallAllowlist:
    "Firewall: allow 192.0.2.0/24, then Block everything else (hand-written)",
  firewallClassic:
    "Firewall: rules from the classic interface: not, port ranges, other options, count only (hand-written)",
  firewallBlocksPage:
    "Firewall: a pending list that refuses the web ports for every computer (hand-written)",
  firewallBlocksReplies:
    "Firewall: a pending list that drops every reply going out (hand-written)",
  firewallMany: "Firewall: 200 rules (generated)",
  proxySet: "Proxy: three proxies, two with stored passwords",
  networkHostile:
    "Network: 200-character, right-to-left and markup-looking notes and names, 15-character interface names (hand-written)",
};

// ---- Modules --------------------------------------------------------------------------------------

/** OMV's descriptions of the modules the network methods mark dirty; "" where none is captured. */
export const NETWORK_MODULES = {
  "systemd-networkd": "",
  hosts: "",
  hostname: "",
  avahi: SHARES_MODULES.avahi,
  postfix: "",
  samba: SHARES_MODULES.samba,
  halt: "",
  issue: "",
  collectd: "Statistics collection and monitoring daemon.",
  task: SHARES_MODULES.task,
  iptables: "",
  apt: "",
  profile: "",
} as const;
export type NetworkModule = keyof typeof NETWORK_MODULES;

/** What each write marks pending (design 0.7; observed on the test VM). */
export const NETWORK_DIRTY = {
  name: ["avahi", "hostname", "hosts", "postfix", "samba", "systemd-networkd"],
  ifaceNew: ["avahi", "collectd", "halt", "hosts", "issue", "systemd-networkd"],
  ifaceChanged: ["avahi", "halt", "hosts", "issue", "systemd-networkd"],
  ifaceRemoved: [
    "avahi",
    "collectd",
    "halt",
    "hosts",
    "issue",
    "systemd-networkd",
    "task",
  ],
  firewall: ["iptables"],
  proxy: ["apt", "profile"],
} as const satisfies Record<string, readonly NetworkModule[]>;

// ---- The stored and live shapes -------------------------------------------------------------------

/**
 * An interface's settings as OMV stores them (conf.system.network.interface), with the Wi-Fi password
 * the replies carry (the transport removes or replaces it, UI-6). The name servers, search domains and
 * ports are lists here; each reply writes them as its method does.
 */
export type StoredIface = Omit<
  NetworkInterfaceStored,
  "slaves" | "dnsnameservers" | "dnssearch"
> & {
  slaves: string[];
  dnsnameservers: string[];
  dnssearch: string[];
  wpapsk: string;
};

/** What a device uses now, as the kernel reports it (Network.getInformation's shape). */
export interface LiveDevice extends Omit<
  NetworkDeviceInformation,
  "type" | "stats"
> {
  type: string;
  /** null for a device with no counters yet, which OMV sends as []. */
  stats: NetworkDeviceStats | null;
}

/** One proxy as stored, with the password the replies carry (the transport removes it, UI-6). */
export type StoredProxy = NetworkProxyServerStored & { password: string };

const PROXIES = ["http", "https", "ftp"] as const;
type ProxyKind = (typeof PROXIES)[number];

interface NetworkConfig {
  general: NetworkGeneralSettings;
  ifaces: StoredIface[];
  /** Both families' rules, in the order stored. */
  rules: IptablesRule[];
  proxy: Record<ProxyKind, StoredProxy>;
}

/** A Blink its light task (Network.identify), followed through Exec.*. */
export interface BlinkTask {
  devicename: string;
  startedAt: number;
  seconds: number;
  /** The last poll's failure, for a device whose light cannot blink. */
  failure?: string;
  state: "running" | "stopped" | "gone";
}

export type ApplyBehaviour = "back" | "never" | "signIn" | "oldAddress";

export interface NetworkMockState {
  name: NetworkScenarioName;
  /** The address the page appears to be opened at (D17). */
  page: PageLocation;
  /** As saved. */
  config: NetworkConfig;
  /** As last applied: what an undo brings back. */
  applied: NetworkConfig;
  /** What the devices use now. */
  devices: LiveDevice[];
  /** The modules this story's writes left pending since the last apply or undo. */
  pending: NetworkModule[];
  /** The devices the queued switch-off jobs act on (tasks.sls); they outlive an undo (10.4). */
  queued: string[];
  /** The apply under way, as Config.applyChangesBg was asked for it. */
  applying: { modules: string[]; force: boolean } | null;
  /** The connection is lost until this time (null: for good), and then the session may be gone. */
  lost: { until: number | null; signIn: boolean } | null;
  tasks: Map<string, BlinkTask>;
  /** UUIDs handed out so far. */
  made: number;
  /** Tasks started so far. */
  started: number;
  /**
   * Hold every write to the contract's request schema first (src/test/networkAnswers.ts turns it on
   * for page tests): a body the contract refuses answers 500 naming the problem. Off by default, so the
   * stories answer as OMV does.
   */
  strict: boolean;
  now: () => number;
}

// ---- Small helpers --------------------------------------------------------------------------------

const ok = (value: unknown): FixedAnswer => ({ status: 200, value });
const fail = (status: number, message: string): FixedAnswer => ({
  status,
  message,
  code: 0,
});
const clone = <T>(value: T): T => structuredClone(value);
const param = (params: unknown, key: string): unknown =>
  typeof params === "object" && params !== null
    ? (params as Record<string, unknown>)[key]
    : undefined;
const text = (params: unknown, key: string, fallback = ""): string => {
  const value = param(params, key);
  return typeof value === "string" ? value : fallback;
};
const int = (params: unknown, key: string, fallback: number): number => {
  const value = param(params, key);
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : fallback;
};
const bool = (params: unknown, key: string, fallback: boolean): boolean => {
  const value = param(params, key);
  return typeof value === "boolean" ? value : fallback;
};
const strings = (params: unknown, key: string): string[] => {
  const value = param(params, key);
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return typeof value === "string" && value !== "" ? value.split(",") : [];
};
/** A name-server or search-domain list as sent: commas, "; " or spaces, stored as a list. */
const listOf = (params: unknown, key: string): string[] =>
  text(params, key)
    .split(/[\s,;]+/u)
    .filter((s) => s !== "");
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const hex2 = (n: number) => n.toString(16).padStart(2, "0");
const byName = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true });

/** The network size of a dotted netmask, -1 when it is not one. */
export function prefixOf(netmask: string): number {
  const parts = netmask.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !(p >= 0 && p <= 255))) {
    return -1;
  }
  const bits = parts.map((p) => p.toString(2).padStart(8, "0")).join("");
  if (!/^1*0*$/u.test(bits)) {
    return -1;
  }
  const zero = bits.indexOf("0");
  return zero === -1 ? 32 : zero;
}
export function netmaskOf(prefix: number): string {
  const bits = "1".repeat(prefix).padEnd(32, "0");
  return [0, 8, 16, 24]
    .map((i) => String(parseInt(bits.slice(i, i + 8), 2)))
    .join(".");
}
/** The IPv6 netmask in the full colon form OMV reports. */
export function netmask6Of(prefix: number): string {
  const bits = "1".repeat(prefix).padEnd(128, "0");
  return Array.from({ length: 8 }, (_, i) =>
    parseInt(bits.slice(i * 16, i * 16 + 16), 2)
      .toString(16)
      .padStart(4, "0"),
  ).join(":");
}
/** The link-local address a device makes from its hardware address (EUI-64). */
export function linkLocalOf(ether: string): string {
  const b = ether.split(":").map((h) => parseInt(h, 16));
  if (b.length !== 6 || b.some((n) => Number.isNaN(n))) {
    return "";
  }
  const word = (hi: number, lo: number) => ((hi << 8) | lo).toString(16);
  return `fe80::${word((b[0] ?? 0) ^ 2, b[1] ?? 0)}:${word(b[2] ?? 0, 0xff)}:${word(0xfe, b[3] ?? 0)}:${word(b[4] ?? 0, b[5] ?? 0)}`;
}

// ---- Building the stories -------------------------------------------------------------------------

/** The documentation hardware address 00:00:5e:00:53:<n>. */
export const etherOf = (n: number) => `00:00:5e:00:53:${hex2(n)}`;

const COUNTERS: NetworkDeviceStats = {
  rx_bytes: "106928701",
  rx_packets: "142669",
  rx_errors: "0",
  rx_dropped: "0",
  rx_fifo_errors: "0",
  rx_frame_errors: "0",
  rx_compressed: "0",
  rx_multicast: "0",
  tx_bytes: "158236022",
  tx_packets: "140516",
  tx_errors: "0",
  tx_dropped: "0",
  tx_fifo_errors: "0",
  tx_collisions: "0",
  tx_carrier_errors: "0",
  tx_compressed: "0",
};

const NO_ADDRESS = {
  gateway: "",
  gateway6: "",
  address: "",
  address6: "",
  prefix: -1,
  prefix6: -1,
  netmask: "",
  netmask6: "",
} as const;

/** A device as the kernel reports it, up with a link at 1 Gbit/s and no address. */
function device(
  devicename: string,
  type: string,
  ether: string,
  over: Partial<LiveDevice> = {},
): LiveDevice {
  return {
    devicename,
    ...NO_ADDRESS,
    ether,
    mtu: "1500",
    state: "UP",
    link: true,
    vlan: false,
    vlanid: -1,
    speed: 1000,
    description: ether === "" ? devicename : `${devicename} [${ether}]`,
    stats: { ...COUNTERS },
    type,
    ...over,
  };
}
/** A port with no cable: down, no link, no speed, no counters yet. */
const unplugged = (devicename: string, n: number): LiveDevice =>
  device(devicename, "ethernet", etherOf(n), {
    state: "DOWN",
    link: false,
    speed: -1,
    stats: null,
  });
const LOOPBACK: LiveDevice = device("lo", "loopback", "00:00:00:00:00:00", {
  mtu: "65536",
  state: "UNKNOWN",
  speed: -1,
});

const LINK_LOCAL = "link-local";

/**
 * Addresses in use: an IPv4 address with its size ("192.0.2.10/24") and router address, and an IPv6
 * one ("2001:db8::10/64"), or LINK_LOCAL for the address the device makes itself, or none.
 */
function using(
  live: LiveDevice,
  v4: string,
  gateway = "",
  v6 = "",
  gateway6 = "",
): LiveDevice {
  const [address = "", size = "24"] = v4.split("/");
  const [given = "", size6 = "64"] = v6.split("/");
  const address6 = given === LINK_LOCAL ? linkLocalOf(live.ether) : given;
  const prefix = address === "" ? -1 : Number(size);
  const prefix6 = address6 === "" ? -1 : Number(size6);
  return {
    ...live,
    address,
    prefix,
    netmask: address === "" ? "" : netmaskOf(prefix),
    gateway,
    address6,
    prefix6,
    netmask6: address6 === "" ? "" : netmask6Of(prefix6),
    gateway6,
  };
}
const STORED_DEFAULTS = {
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
  dnsnameservers: [] as string[],
  dnssearch: [] as string[],
  mtu: 0,
  wol: false,
  comment: "",
  altmacaddress: "",
  slaves: [] as string[],
  bondprimary: "",
  bondmode: 1,
  bondmiimon: 0,
  bonddowndelay: 0,
  bondupdelay: 0,
  bondtransmithashpolicy: "layer2",
  vlanid: 1,
  vlanrawdevice: "",
  band: "auto",
  wpassid: "",
  wpapsk: "",
  keymanagement: "psk",
  hidden: false,
} satisfies Omit<StoredIface, "uuid" | "type" | "devicename">;

function stored(
  id: string,
  type: string,
  devicename: string,
  over: Partial<StoredIface> = {},
): StoredIface {
  return {
    uuid: id,
    type,
    devicename,
    ...clone(STORED_DEFAULTS),
    ...over,
  };
}
const fixed = (
  address: string,
  netmask = "255.255.255.0",
  gateway = "",
): Partial<StoredIface> => ({
  method: "static",
  address,
  netmask,
  gateway,
});

/** The stories' interfaces' UUIDs, for tests. */
export const NETWORK_IFACES = {
  enp2s0: uuid(0x2101),
  enp3s0: uuid(0x2102),
  enp26s0: uuid(0x2103),
  wlp3s0: uuid(0x2104),
  bond0: uuid(0x2105),
  vlan: uuid(0x2106),
  br0: uuid(0x2107),
  hostilePort: uuid(0x2108),
  hostileWifi: uuid(0x2109),
} as const;

const NO_PROXY: Record<ProxyKind, StoredProxy> = {
  http: { enable: false, host: "", port: 8080, username: "", password: "" },
  https: { enable: false, host: "", port: 8080, username: "", password: "" },
  ftp: { enable: false, host: "", port: 8080, username: "", password: "" },
};

export const EXAMPLE_PASSWORD = "EXAMPLE-PASSWORD";

/** One firewall rule as stored; `n` makes its UUID. */
function rule(
  n: number,
  family: "inet" | "inet6",
  rulenum: number,
  over: Partial<IptablesRule> = {},
): IptablesRule {
  return {
    uuid: uuid(0x3000 + n),
    family,
    rulenum,
    chain: "INPUT",
    action: "ACCEPT",
    source: "",
    sport: "",
    destination: "",
    dport: "",
    protocol: "tcp",
    extraoptions: "",
    comment: "",
    ...over,
  };
}
const capturedRules = (rules: readonly IptablesRule[]): IptablesRule[] =>
  rules.map((r) => ({ ...r }));

/** Text of exactly `length` characters: right-to-left, markup-looking, and long. */
export function hostileText(length: number, seed: string): string {
  const start = `‮${seed} <img src=x onerror="alert(1)"> שלום مرحبا <script>alert(2)</script> `;
  return (start + "x".repeat(length)).slice(0, length);
}
/** A Wi-Fi network name of exactly 32 bytes, right-to-left and markup-looking. */
export const HOSTILE_SSID = "<i>שלום</i>‮EXAMPLE-NET-01";
/** A domain of exactly 200 characters (each label at most 63). */
export const HOSTILE_DOMAIN = `${"d".repeat(63)}.${"e".repeat(63)}.${"f".repeat(60)}.example.org`;

interface Start {
  page: PageLocation;
  general: NetworkGeneralSettings;
  ifaces: StoredIface[];
  devices: LiveDevice[];
  rules?: IptablesRule[];
  proxy?: Record<ProxyKind, StoredProxy>;
  /** What differs between the stored settings and what was last applied; nothing by default. */
  applied?: Partial<NetworkConfig>;
  pending?: NetworkModule[];
  queued?: string[];
}

const at = (hostname: string, protocol = "http:", port = ""): PageLocation => ({
  protocol,
  hostname,
  port,
});
const NAS: NetworkGeneralSettings = { hostname: "nas", domainname: "" };

/** enp2s0 at 192.0.2.10/24, IPv6 as given. */
const enp2s0At = (v6 = ""): LiveDevice =>
  using(
    device("enp2s0", "ethernet", etherOf(1)),
    "192.0.2.10/24",
    "192.0.2.1",
    v6,
    v6 === "" ? "" : "fe80::1",
  );
/** enp2s0 with a fixed address, 192.0.2.10/24. */
const ENP2S0_FIXED = (): StoredIface =>
  stored(
    NETWORK_IFACES.enp2s0,
    "ethernet",
    "enp2s0",
    fixed("192.0.2.10", "255.255.255.0", "192.0.2.1"),
  );

/** One port, automatic IPv4 and IPv6. */
function onePort(): Pick<Start, "ifaces" | "devices"> {
  return {
    ifaces: [
      stored(NETWORK_IFACES.enp2s0, "ethernet", "enp2s0", { method6: "auto" }),
    ],
    devices: [enp2s0At("2001:db8::10/64"), LOOPBACK],
  };
}
/** A port with a fixed address, and one not set up. */
function twoPorts(): Pick<Start, "ifaces" | "devices"> {
  return {
    ifaces: [ENP2S0_FIXED()],
    devices: [enp2s0At(), unplugged("enp3s0", 2), LOOPBACK],
  };
}

const READ_FAILURE = {
  devices:
    "Failed to execute command 'export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin; export LC_ALL=C.UTF-8; export LANGUAGE=; ip -details -json address show 2>&1' with exit code '1': Cannot open netlink socket: Too many open files",
  name: "Failed to execute XPath query '//system/network/dns'.",
  list: "Failed to execute XPath query '//system/network/interfaces/interface'.",
  firewall: "Failed to execute XPath query '//system/network/iptables/rule'.",
  proxy: "Failed to execute XPath query '//system/network/proxy'.",
  webGui: "Failed to execute XPath query '//webadmin'.",
  ssh: "Failed to execute XPath query '//services/ssh'.",
} as const;

/** The reads that fail in each networkReadFails story, with the failure. */
const READ_FAILS: Partial<
  Record<NetworkScenarioName, Partial<Record<NetworkOperation, FixedAnswer>>>
> = {
  networkReadFails: {
    networkEnumerateDevicesList: fail(500, READ_FAILURE.devices),
  },
  networkReadFailsName: {
    networkGetGeneralSettings: fail(500, READ_FAILURE.name),
  },
  networkReadFailsList: {
    networkGetInterfaceList: fail(500, READ_FAILURE.list),
  },
  networkReadFailsInterface: {
    networkGetInterface: fail(500, READ_FAILURE.list),
    networkGetInformation: fail(500, READ_FAILURE.devices),
  },
  networkReadFailsFirewall: {
    iptablesGetRules: fail(500, READ_FAILURE.firewall),
    iptablesGetRules6: fail(500, READ_FAILURE.firewall),
    iptablesGetRule: fail(500, READ_FAILURE.firewall),
  },
  networkReadFailsProxy: { networkGetProxy: fail(500, READ_FAILURE.proxy) },
  networkReadFailsPorts: {
    webGuiGetSettings: fail(500, READ_FAILURE.webGui),
    sshGet: fail(500, READ_FAILURE.ssh),
  },
};

/** The rules that refuse the web ports for every computer, and that drop every reply going out. */
const BLOCKS_PAGE = CONTRACT_EXAMPLES.iptablesGetRules.blocksPage.value;

function start(name: NetworkScenarioName): Start {
  switch (name) {
    case "networkOne":
    case "firewallNone":
      return { page: at("192.0.2.10"), general: NAS, ...onePort() };
    case "networkTwo":
    case "networkReadFails":
    case "networkReadFailsName":
    case "networkReadFailsList":
    case "networkReadFailsInterface":
    case "networkReadFailsFirewall":
    case "networkReadFailsProxy":
    case "networkReadFailsPorts":
      return { page: at("192.0.2.10"), general: NAS, ...twoPorts() };
    case "networkByName":
      return {
        page: at("nas.example.org"),
        general: { hostname: "nas", domainname: "example.org" },
        ...onePort(),
      };
    case "networkByNameTwo":
      return {
        page: at("nas.local"),
        general: NAS,
        ifaces: [
          ENP2S0_FIXED(),
          stored(
            NETWORK_IFACES.enp3s0,
            "ethernet",
            "enp3s0",
            fixed("203.0.113.10"),
          ),
        ],
        devices: [
          enp2s0At(),
          using(device("enp3s0", "ethernet", etherOf(2)), "203.0.113.10/24"),
          LOOPBACK,
        ],
      };
    case "networkUnknown":
      return { page: at("198.51.100.77"), general: NAS, ...onePort() };
    case "networkVpn": {
      const one = onePort();
      return {
        page: at("198.51.100.1"),
        general: NAS,
        ifaces: one.ifaces,
        devices: [
          ...one.devices,
          using(
            device("wg0", "virtual", "", { speed: -1, mtu: "1420" }),
            "198.51.100.1/24",
          ),
        ],
      };
    }
    case "networkUnmanaged":
      // The page's port got its address outside these settings (the installer's), so it has none here.
      return {
        page: at("192.0.2.10"),
        general: NAS,
        ifaces: [
          stored(
            NETWORK_IFACES.enp3s0,
            "ethernet",
            "enp3s0",
            fixed("203.0.113.10"),
          ),
        ],
        devices: [
          enp2s0At(),
          using(device("enp3s0", "ethernet", etherOf(2)), "203.0.113.10/24"),
          LOOPBACK,
        ],
      };
    case "networkLayers": {
      const bondEther = etherOf(4);
      return {
        page: at("203.0.113.20"),
        general: NAS,
        ifaces: [
          stored(NETWORK_IFACES.enp2s0, "ethernet", "enp2s0", {
            method6: "dhcp",
          }),
          stored(NETWORK_IFACES.bond0, "bond", "bond0", {
            comment: "Example bond",
            slaves: ["enp3s0", "enp26s0"],
            bondprimary: "enp3s0",
            bondmiimon: 100,
          }),
          stored(NETWORK_IFACES.vlan, "vlan", "bond0.10", {
            ...fixed("203.0.113.20"),
            comment: "Example VLAN",
            vlanid: 10,
            vlanrawdevice: "bond0",
          }),
          stored(NETWORK_IFACES.br0, "bridge", "br0", {
            comment: "Example bridge",
            slaves: ["enp4s0"],
          }),
        ],
        devices: [
          using(
            device("enp2s0", "ethernet", etherOf(1)),
            "192.0.2.128/24",
            "192.0.2.2",
            LINK_LOCAL,
          ),
          device("enp3s0", "ethernet", bondEther),
          device("enp26s0", "ethernet", bondEther),
          device("enp4s0", "ethernet", etherOf(5)),
          using(device("bond0", "bond", bondEther), "198.51.100.128/24"),
          using(
            device("bond0.10", "vlan", bondEther, { vlan: true, vlanid: 10 }),
            "203.0.113.20/24",
          ),
          using(
            device("br0", "bridge", etherOf(5)),
            "192.0.2.140/24",
            "192.0.2.2",
          ),
          LOOPBACK,
        ],
      };
    }
    case "networkWifi":
      return {
        page: at("192.0.2.30"),
        general: NAS,
        ifaces: [
          stored(NETWORK_IFACES.enp2s0, "ethernet", "enp2s0", {
            method6: "auto",
          }),
          stored(NETWORK_IFACES.wlp3s0, "wifi", "wlp3s0", {
            method6: "auto",
            wpassid: "EXAMPLE-NETWORK",
            wpapsk: EXAMPLE_PASSWORD,
          }),
        ],
        devices: [
          enp2s0At(LINK_LOCAL),
          using(
            device("wlp3s0", "wifi", etherOf(6), { speed: -1 }),
            "192.0.2.30/24",
            "192.0.2.1",
            LINK_LOCAL,
          ),
          device("wlp4s0", "wifi", etherOf(0x10), {
            state: "DOWN",
            link: false,
            speed: -1,
            stats: null,
          }),
          LOOPBACK,
        ],
      };
    case "networkPending": {
      // In use: enp2s0 (the page's), enp3s0 at 203.0.113.10, enp26s0 at 198.51.100.10. Saved since:
      // enp3s0 at 203.0.113.11, enp26s0's settings removed, a firewall list that refuses the web ports.
      const enp3 = stored(
        NETWORK_IFACES.enp3s0,
        "ethernet",
        "enp3s0",
        fixed("203.0.113.10"),
      );
      const enp26 = stored(NETWORK_IFACES.enp26s0, "ethernet", "enp26s0", {
        ...fixed("198.51.100.10"),
        comment: "Backup network",
      });
      const enp2 = stored(NETWORK_IFACES.enp2s0, "ethernet", "enp2s0", {
        method6: "auto",
      });
      return {
        page: at("192.0.2.10"),
        general: NAS,
        ifaces: [enp2, { ...enp3, address: "203.0.113.11" }],
        devices: [
          enp2s0At(LINK_LOCAL),
          using(device("enp3s0", "ethernet", etherOf(2)), "203.0.113.10/24"),
          using(device("enp26s0", "ethernet", etherOf(3)), "198.51.100.10/24"),
          LOOPBACK,
        ],
        rules: capturedRules(BLOCKS_PAGE.slice(0, 2)),
        applied: { ifaces: [enp2, enp3, enp26], rules: [] },
        pending: [
          ...new Set([
            ...NETWORK_DIRTY.ifaceRemoved,
            ...NETWORK_DIRTY.firewall,
          ]),
        ],
        queued: ["enp26s0"],
      };
    }
    case "networkApply":
    case "networkApplyNever":
    case "networkApplySignIn":
    case "networkApplyOldAddress": {
      // enp3s0 just set up with a fixed address, not applied yet.
      return {
        page: at("192.0.2.10"),
        general: NAS,
        ifaces: [
          ENP2S0_FIXED(),
          stored(
            NETWORK_IFACES.enp3s0,
            "ethernet",
            "enp3s0",
            fixed("203.0.113.10"),
          ),
        ],
        devices: [
          enp2s0At(),
          device("enp3s0", "ethernet", etherOf(2)),
          LOOPBACK,
        ],
        applied: { ifaces: [ENP2S0_FIXED()] },
        pending: [...NETWORK_DIRTY.ifaceNew],
      };
    }
    case "firewallSome":
      return {
        page: at("192.0.2.10"),
        general: NAS,
        ...onePort(),
        rules: [
          rule(1, "inet", 0, {
            source: "192.0.2.0/24",
            dport: "22",
            comment: "SSH from the office network",
          }),
          rule(2, "inet", 1, {
            action: "REJECT",
            source: "203.0.113.0/24",
            dport: "445",
            comment: "No file sharing for the guest network",
          }),
          rule(3, "inet", 2, {
            action: "DROP",
            source: "198.51.100.7",
            protocol: "all",
          }),
          rule(4, "inet", 3, {
            protocol: "udp",
            dport: "53",
            comment: "Name lookups",
          }),
          ...capturedRules(CONTRACT_EXAMPLES.iptablesGetRules6.two.value),
        ],
      };
    case "firewallAllowlist":
      return {
        page: at("192.0.2.10"),
        general: NAS,
        ...onePort(),
        rules: capturedRules(
          CONTRACT_EXAMPLES.iptablesGetRules.allowlist.value,
        ),
      };
    case "firewallClassic":
      return {
        page: at("192.0.2.10"),
        general: NAS,
        ...onePort(),
        rules: capturedRules(CONTRACT_EXAMPLES.iptablesGetRules.classic.value),
      };
    case "firewallBlocksPage":
    case "firewallBlocksReplies":
      return {
        page: at("192.0.2.10"),
        general: NAS,
        ...onePort(),
        rules: capturedRules(
          name === "firewallBlocksPage"
            ? BLOCKS_PAGE.slice(0, 2)
            : BLOCKS_PAGE.slice(2),
        ),
        applied: { rules: [] },
        pending: [...NETWORK_DIRTY.firewall],
      };
    case "firewallMany":
      return {
        page: at("192.0.2.10"),
        general: NAS,
        ...onePort(),
        rules: Array.from({ length: 200 }, (_, i) =>
          rule(0x100 + i, "inet", i, {
            action: i % 7 === 6 ? "REJECT" : "ACCEPT",
            source:
              [
                `192.0.2.${String(i + 1)}`,
                `198.51.100.${String(i + 1)}/32`,
                "",
              ][i % 3] ?? "",
            dport: String(1024 + i),
            protocol: i % 2 === 0 ? "tcp" : "udp",
            comment: `Rule ${String(i + 1)}`,
          }),
        ),
      };
    case "proxySet": {
      const set = CONTRACT_EXAMPLES.networkSetProxy.saved.value;
      return {
        page: at("192.0.2.10"),
        general: NAS,
        ...onePort(),
        proxy: {
          http: { ...set.http },
          https: { ...set.https },
          ftp: { ...set.ftp },
        },
      };
    }
    case "networkHostile": {
      const portName = "enx00005e005301";
      const wifiName = "wlx00005e005302";
      return {
        page: at("192.0.2.10"),
        general: { hostname: "nas", domainname: HOSTILE_DOMAIN },
        ifaces: [
          stored(NETWORK_IFACES.hostilePort, "ethernet", portName, {
            ...fixed("192.0.2.10", "255.255.255.0", "192.0.2.1"),
            comment: hostileText(200, "port"),
            dnssearch: [HOSTILE_DOMAIN],
          }),
          stored(NETWORK_IFACES.hostileWifi, "wifi", wifiName, {
            comment: hostileText(200, "wifi"),
            wpassid: HOSTILE_SSID,
            wpapsk: EXAMPLE_PASSWORD,
          }),
        ],
        devices: [
          using(
            device(portName, "ethernet", etherOf(1)),
            "192.0.2.10/24",
            "192.0.2.1",
          ),
          using(
            device(wifiName, "wifi", etherOf(2), { speed: -1 }),
            "192.0.2.31/24",
            "192.0.2.1",
          ),
          unplugged("enx00005e005303", 3),
          LOOPBACK,
        ],
        rules: [
          rule(0x500, "inet", 0, {
            source: "192.0.2.0/24",
            dport: "22",
            comment: hostileText(200, "rule"),
          }),
          rule(0x501, "inet6", 0, {
            source: "2001:db8::/32",
            dport: "443",
            comment: hostileText(200, "rule6"),
          }),
        ],
        proxy: {
          ...NO_PROXY,
          http: {
            enable: true,
            host: `${"p".repeat(63)}.${"q".repeat(63)}.${"r".repeat(60)}.example.org`,
            port: 3128,
            username: hostileText(64, "user"),
            password: EXAMPLE_PASSWORD,
          },
        },
      };
    }
  }
}

/** The address the page appears to be opened at in a network story (D17), or null outside them. */
export function networkPageAddress(name: string): PageLocation | null {
  return isNetworkScenario(name) ? { ...start(name).page } : null;
}

export function newNetworkMockState(
  name: NetworkScenarioName,
  options: { now?: () => number } = {},
): NetworkMockState {
  const s = start(name);
  const config: NetworkConfig = {
    general: { ...s.general },
    ifaces: clone(s.ifaces),
    rules: clone(s.rules ?? []),
    proxy: clone(s.proxy ?? NO_PROXY),
  };
  return {
    name,
    page: { ...s.page },
    config,
    applied: { ...clone(config), ...clone(s.applied ?? {}) },
    devices: clone(s.devices),
    pending: [...(s.pending ?? [])],
    queued: [...(s.queued ?? [])],
    applying: null,
    lost: null,
    tasks: new Map(),
    made: 0,
    started: 0,
    strict: false,
    now: options.now ?? Date.now,
  };
}

/** How an apply behaves in a networkApply story; null in the others (it just works). */
export function applyBehaviour(
  name: NetworkScenarioName,
): ApplyBehaviour | null {
  switch (name) {
    case "networkApply":
      return "back";
    case "networkApplyNever":
      return "never";
    case "networkApplySignIn":
      return "signIn";
    case "networkApplyOldAddress":
      return "oldAddress";
    default:
      return null;
  }
}

// ---- The reply shapes -----------------------------------------------------------------------------

type StoredForm = "stored" | "get" | "list";

/**
 * An interface's settings in the shape of a reply: `stored` as set…Iface and deleteInterface answer
 * (spaces, the ports as one string), `get` as getInterface (commas, the ports as a list), `list` as a
 * row of getInterfaceList (spaces, the ports as a list, with OMV's two computed fields).
 */
function storedShape(
  s: StoredIface,
  form: StoredForm,
): Record<string, unknown> {
  const join = form === "get" ? "," : " ";
  return {
    uuid: s.uuid,
    type: s.type,
    devicename: s.devicename,
    method: s.method,
    address: s.address,
    netmask: s.netmask,
    gateway: s.gateway,
    routemetric: s.routemetric,
    method6: s.method6,
    address6: s.address6,
    netmask6: s.netmask6,
    gateway6: s.gateway6,
    routemetric6: s.routemetric6,
    dnsnameservers: s.dnsnameservers.join(join),
    dnssearch: s.dnssearch.join(join),
    mtu: s.mtu,
    wol: s.wol,
    comment: s.comment,
    altmacaddress: s.altmacaddress,
    slaves: form === "stored" ? s.slaves.join(",") : [...s.slaves],
    bondprimary: s.bondprimary,
    bondmode: s.bondmode,
    bondmiimon: s.bondmiimon,
    bonddowndelay: s.bonddowndelay,
    bondupdelay: s.bondupdelay,
    bondtransmithashpolicy: s.bondtransmithashpolicy,
    vlanid: s.vlanid,
    vlanrawdevice: s.vlanrawdevice,
    band: s.band,
    wpassid: s.wpassid,
    wpapsk: s.wpapsk,
    keymanagement: s.keymanagement,
    hidden: s.hidden,
    ...(form === "list" ? { _used: false, _readonly: false } : {}),
  };
}

/** What a device uses now, in Network.getInformation's shape and order. */
function information(d: LiveDevice): Record<string, unknown> {
  return {
    devicename: d.devicename,
    gateway: d.gateway,
    gateway6: d.gateway6,
    address: d.address,
    address6: d.address6,
    prefix: d.prefix,
    prefix6: d.prefix6,
    netmask: d.netmask,
    netmask6: d.netmask6,
    ether: d.ether,
    mtu: d.mtu,
    state: d.state,
    link: d.link,
    vlan: d.vlan,
    vlanid: d.vlanid,
    speed: d.speed,
    description: d.description,
    stats: d.stats ?? [],
    type: d.type,
  };
}
/** Network.getInformation for a name the system does not have (networkGetInformation.missing). */
const missingDevice = (devicename: string): Record<string, unknown> => ({
  devicename,
  ...NO_ADDRESS,
  ether: "",
  mtu: "",
  state: "UNKNOWN",
  link: false,
  vlan: false,
  vlanid: -1,
  speed: -1,
  description: "",
  stats: [],
});

/** The devices that are ports of a stored bond. */
const bondPorts = (state: NetworkMockState): Set<string> =>
  new Set(
    state.config.ifaces
      .filter((i) => i.type === "bond")
      .flatMap((i) => i.slaves),
  );
/** The devices in a stored bond or bridge. */
const members = (state: NetworkMockState): Set<string> =>
  new Set(
    state.config.ifaces
      .filter((i) => i.type === "bond" || i.type === "bridge")
      .flatMap((i) => i.slaves),
  );
const storedFor = (state: NetworkMockState, devicename: string) =>
  state.config.ifaces.find((i) => i.devicename === devicename);
const liveOf = (state: NetworkMockState, devicename: string) =>
  state.devices.find((d) => d.devicename === devicename);

/** One row of Network.enumerateDevicesList. */
function deviceRow(
  state: NetworkMockState,
  d: LiveDevice,
): Record<string, unknown> {
  const s = storedFor(state, d.devicename);
  if (s === undefined) {
    const port = bondPorts(state).has(d.devicename);
    const { type: _type, ...info } = information(d);
    return {
      uuid: NEW_OBJECT,
      comment: "",
      _used: port,
      _readonly: port,
      ...info,
      type: d.type,
      ...(port ? { method: "", method6: "" } : {}),
    };
  }
  const shape = storedShape(s, "stored");
  return {
    uuid: s.uuid,
    comment: s.comment,
    _used: false,
    _readonly: false,
    type: s.type,
    devicename: s.devicename,
    method: s.method,
    address: d.address,
    netmask: d.netmask,
    gateway: d.gateway,
    routemetric: s.routemetric,
    method6: s.method6,
    address6: d.address6,
    netmask6: d.netmask6,
    gateway6: d.gateway6,
    routemetric6: s.routemetric6,
    dnsnameservers: shape.dnsnameservers,
    dnssearch: shape.dnssearch,
    mtu: d.mtu,
    wol: s.wol,
    altmacaddress: s.altmacaddress,
    slaves: [...s.slaves],
    bondprimary: s.bondprimary,
    bondmode: s.bondmode,
    bondmiimon: s.bondmiimon,
    bonddowndelay: s.bonddowndelay,
    bondupdelay: s.bondupdelay,
    bondtransmithashpolicy: s.bondtransmithashpolicy,
    vlanid: d.vlanid,
    vlanrawdevice: s.vlanrawdevice,
    band: s.band,
    wpassid: s.wpassid,
    wpapsk: s.wpapsk,
    keymanagement: s.keymanagement,
    hidden: s.hidden,
    prefix: d.prefix,
    prefix6: d.prefix6,
    ether: d.ether,
    state: d.state,
    link: d.link,
    vlan: d.vlan,
    speed: d.speed,
    description: d.description,
    stats: d.stats ?? [],
  };
}

/** A page of a list, as OMV's getlist methods answer: `total` is every row. */
function page(rows: unknown[], params: unknown): FixedAnswer {
  const from = Math.max(0, int(params, "start", 0));
  const limit = param(params, "limit");
  const data =
    typeof limit === "number" && limit >= 0
      ? rows.slice(from, from + limit)
      : rows.slice(from);
  return ok({ total: rows.length, data });
}

function proxyFlat(p: Record<ProxyKind, StoredProxy>): Record<string, unknown> {
  const out: Record<string, unknown> = { http: [], https: [], ftp: [] };
  for (const kind of PROXIES) {
    out[`${kind}enable`] = p[kind].enable;
    out[`${kind}host`] = p[kind].host;
    out[`${kind}port`] = p[kind].port;
    out[`${kind}username`] = p[kind].username;
    out[`${kind}password`] = p[kind].password;
  }
  return out;
}

// ---- Messages -------------------------------------------------------------------------------------

/** OMV's messages, as captured where the VM showed them. */
export const NETWORK_MSG = {
  // networkSetEthernetIface.sameName (captured).
  notUnique: (type: string, devicename: string) =>
    `The configuration object 'conf.system.network.interface' with the filter '{"operator":"and","arg0":{"operator":"stringEquals","arg0":"type","arg1":"${type}"},"arg1":{"operator":"stringEquals","arg0":"devicename","arg1":"${devicename}"}}' is not unique.`,
  // networkSetBondIface.portInBond (captured).
  portInBond: (port: string) =>
    `The interface '${port}' is already used by a bonding interface.`,
  // networkSetBondIface.noPrimary (captured).
  noPrimary: "The parameters 'bondprimary' and 'bondmode' are invalid.",
  // networkSetWirelessIface.noPassword (captured).
  noPassword: ": Missing 'required' attribute 'wpapsk'.",
  // networkSetGeneralSettings.domainLocal (captured).
  domain: (value: string) =>
    `domainname: The value "${value}" must not match the schema {"enum":["local","example","invalid","test"]}.`,
  // Written by hand in OMV's words for a missing object.
  notFound: (what: string, id: string) =>
    `The configuration object '${what}' with the identifier '${id}' does not exist.`,
  // execGetOutput.rsyncStopped (captured): the handle of a stopped or finished task is gone.
  gone: (handle: string) => `Failed to open file (filename=${handle}, mode=r).`,
  // Written by hand: ethtool on a device whose driver cannot blink its light.
  cannotBlink: (devicename: string, seconds: number) =>
    `Failed to execute command 'export PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin; export LC_ALL=C.UTF-8; export LANGUAGE=; ethtool --identify ${devicename} ${String(seconds)} 2>&1' with exit code '94': Cannot identify NIC: Operation not supported`,
};
const IFACE = "conf.system.network.interface";
const RULE = "conf.system.network.iptables.rule";
const REFUSED_DOMAINS = new Set(["local", "example", "invalid", "test"]);

// ---- Tasks ----------------------------------------------------------------------------------------

/** The handle prefix of this mock's Blink tasks; OMV's are /tmp/bgstatus and random letters. */
const TASK_PREFIX = "/tmp/bgstatusNetBlink";
const isOwnHandle = (handle: unknown): handle is string =>
  typeof handle === "string" && handle.startsWith(TASK_PREFIX);

/**
 * Exec.getOutput for a Blink task: running while the light blinks, then empty output (observed); a
 * device whose light cannot blink fails at the end with ethtool's words. Undefined for other handles.
 */
export function networkTaskOutput(
  state: NetworkMockState,
  params: unknown,
): FixedAnswer | undefined {
  const handle = param(params, "filename");
  if (!isOwnHandle(handle)) {
    return undefined;
  }
  const task = state.tasks.get(handle);
  if (task === undefined || task.state !== "running") {
    return fail(500, NETWORK_MSG.gone(handle));
  }
  const pos = Math.max(0, int(params, "pos", 0));
  const reply = (running: boolean) =>
    ok({ filename: handle, pos, output: "", pendingOutput: false, running });
  if (state.now() < task.startedAt + task.seconds * 1000) {
    return reply(true);
  }
  task.state = "gone";
  return task.failure === undefined ? reply(false) : fail(500, task.failure);
}

/** Exec.isRunning for a Blink task; undefined for other handles. */
export function networkTaskRunning(
  state: NetworkMockState,
  params: unknown,
): FixedAnswer | undefined {
  const handle = param(params, "filename");
  if (!isOwnHandle(handle)) {
    return undefined;
  }
  const task = state.tasks.get(handle);
  if (task === undefined || task.state === "gone") {
    return fail(500, NETWORK_MSG.gone(handle));
  }
  return ok({
    filename: handle,
    running:
      task.state === "running" &&
      state.now() < task.startedAt + task.seconds * 1000,
  });
}

/** Exec.stop for a Blink task: the light stops; undefined for other handles. */
export function networkTaskStop(
  state: NetworkMockState,
  params: unknown,
): FixedAnswer | undefined {
  const handle = param(params, "filename");
  if (!isOwnHandle(handle)) {
    return undefined;
  }
  const task = state.tasks.get(handle);
  if (task === undefined || task.state === "gone") {
    return fail(500, NETWORK_MSG.gone(handle));
  }
  task.state = "stopped";
  return ok(null);
}

// ---- Apply, undo and the connection -------------------------------------------------------------

/** How long the networkApply stories lose the connection after an apply that sets the network up. */
export const NETWORK_LOSS_MS = 8_000;

/** No reply at all: the transport's `network` kind. */
export const NO_REPLY: FixedAnswer = { status: 0, networkError: true };

/** The modules an apply deploys: those asked for (or every pending one), the pending ones unless forced. */
function deployed(
  state: NetworkMockState,
  run: { modules: readonly string[]; force: boolean },
): Set<string> {
  if (run.modules.length === 0) {
    return new Set(run.force ? Object.keys(NETWORK_MODULES) : state.pending);
  }
  return new Set(
    run.force
      ? run.modules
      : run.modules.filter((m) => (state.pending as string[]).includes(m)),
  );
}

/** Config.applyChangesBg was called: remember what it deploys, and cut the connection if the story does. */
export function networkApplyStarted(
  state: NetworkMockState,
  params: unknown,
): void {
  const run = {
    modules: strings(params, "modules"),
    force: bool(params, "force", false),
  };
  state.applying = run;
  const behaviour = applyBehaviour(state.name);
  if (
    behaviour === null ||
    behaviour === "oldAddress" ||
    !deployed(state, run).has("systemd-networkd")
  ) {
    return;
  }
  state.lost = {
    until: behaviour === "never" ? null : state.now() + NETWORK_LOSS_MS,
    signIn: behaviour === "signIn",
  };
}

/**
 * Before every rpc.php call in a network story: no reply while the connection is lost. The first call
 * after the loss ends finds the apply done (`applied`), and in networkApplySignIn the session gone
 * (`signOut`); it then answers as usual.
 */
export function networkConnection(
  state: NetworkMockState,
  hooks: { applied: () => void; signOut: () => void },
): FixedAnswer | undefined {
  const lost = state.lost;
  if (lost === null) {
    return undefined;
  }
  if (lost.until === null || state.now() < lost.until) {
    return NO_REPLY;
  }
  state.lost = null;
  networkApplied(state);
  hooks.applied();
  if (lost.signIn) {
    hooks.signOut();
  }
  return undefined;
}

/** The queued jobs run: each device switched off with its addresses cleared; a bond, VLAN or bridge goes. */
function runQueued(state: NetworkMockState): void {
  for (const name of state.queued) {
    const live = liveOf(state, name);
    if (live === undefined) {
      continue;
    }
    if (
      live.type === "bond" ||
      live.type === "vlan" ||
      live.type === "bridge"
    ) {
      state.devices = state.devices.filter(
        (d) => d.devicename !== name && !d.devicename.startsWith(`${name}.`),
      );
    } else {
      Object.assign(live, NO_ADDRESS, { state: "DOWN" });
    }
  }
  state.queued = [];
}

/** The address the router gives a device that has none: the first free one from 192.0.2.100. */
function routerGives(state: NetworkMockState): string {
  const taken = new Set(state.devices.map((d) => d.address));
  let n = 100;
  while (taken.has(`192.0.2.${String(n)}`)) {
    n += 1;
  }
  return `192.0.2.${String(n)}`;
}

/** The network set up from the stored settings: what each interface uses from now on. */
function setUpNetwork(state: NetworkMockState): void {
  const ports = members(state);
  for (const s of state.config.ifaces) {
    let live = liveOf(state, s.devicename);
    if (live === undefined) {
      const first = liveOf(
        state,
        s.type === "vlan" ? s.vlanrawdevice : (s.slaves[0] ?? ""),
      );
      if (first === undefined || !["bond", "vlan", "bridge"].includes(s.type)) {
        // Settings for a device the system does not have: nothing to set up.
        continue;
      }
      live = device(s.devicename, s.type, first.ether, {
        vlan: s.type === "vlan",
        vlanid: s.type === "vlan" ? s.vlanid : -1,
        speed: first.speed,
        link: first.link,
        state: first.link ? "UP" : "DOWN",
      });
      state.devices.push(live);
    }
    const target = live;
    target.state = target.link ? "UP" : "DOWN";
    if (s.method === "static") {
      const prefix = prefixOf(s.netmask);
      Object.assign(target, {
        address: s.address,
        prefix,
        netmask: prefix < 0 ? "" : s.netmask,
        gateway: s.gateway,
      });
    } else if (s.method === "dhcp" && target.link) {
      // Most routers give the same address back; a device with none gets the next free one.
      if (target.address === "") {
        Object.assign(target, {
          address: routerGives(state),
          prefix: 24,
          netmask: "255.255.255.0",
          gateway: "192.0.2.1",
        });
      }
    } else {
      Object.assign(target, {
        address: "",
        prefix: -1,
        netmask: "",
        gateway: "",
      });
    }
    if (s.method6 === "static") {
      Object.assign(target, {
        address6: s.address6,
        prefix6: s.netmask6,
        netmask6: netmask6Of(s.netmask6),
        gateway6: s.gateway6,
      });
    } else if ((s.method6 === "auto" || s.method6 === "dhcp") && target.link) {
      if (target.address6 === "") {
        Object.assign(target, {
          address6: linkLocalOf(target.ether),
          prefix6: 64,
          netmask6: netmask6Of(64),
        });
      }
    } else {
      Object.assign(target, {
        address6: "",
        prefix6: -1,
        netmask6: "",
        gateway6: "",
      });
    }
  }
  // A bond's or bridge's members carry no address of their own.
  for (const d of state.devices) {
    if (ports.has(d.devicename)) {
      Object.assign(d, NO_ADDRESS);
    }
  }
}

/**
 * A finished apply: the queued jobs run when `task` is deployed, then the network is set up from the
 * stored settings when `systemd-networkd` is (in networkApplyOldAddress the NAS keeps its addresses).
 * Everything saved counts as applied from now on, and nothing is pending.
 */
export function networkApplied(state: NetworkMockState): void {
  const run = state.applying ?? { modules: [], force: false };
  state.applying = null;
  const modules = deployed(state, run);
  if (modules.has("task")) {
    runQueued(state);
  }
  if (
    modules.has("systemd-networkd") &&
    applyBehaviour(state.name) !== "oldAddress"
  ) {
    setUpNetwork(state);
  }
  state.applied = clone(state.config);
  state.pending = [];
}

/** A finished undo: the settings as last applied come back; the queued jobs stay (10.4). */
export function networkReverted(state: NetworkMockState): void {
  state.config = clone(state.applied);
  state.pending = [];
}

/**
 * Every answer of a story behind the connection: while it is lost, no reply at all. Each entry answers
 * what it did before, or the cut.
 */
export function behindConnection(
  answers: Answers,
  cut: () => FixedAnswer | undefined,
): Answers {
  const wrapped: Record<string, Answer> = {};
  for (const [operationId, answer] of Object.entries(answers) as [
    string,
    Answer | undefined,
  ][]) {
    if (answer === undefined) {
      continue;
    }
    wrapped[operationId] = (call) =>
      cut() ?? (typeof answer === "function" ? answer(call) : answer);
  }
  // The same keys as `answers`, each answering an example name of its own operation, or the cut.
  return wrapped as Answers;
}

// ---- The answers ----------------------------------------------------------------------------------

interface Call {
  params: unknown;
}
export type NetworkReply = (call: Call) => FixedAnswer;

export const NETWORK_OPERATIONS = [
  "networkGetGeneralSettings",
  "networkSetGeneralSettings",
  "networkEnumerateDevicesList",
  "networkGetInterfaceList",
  "networkGetInterface",
  "networkGetInformation",
  "networkIdentify",
  "networkGetEthernetCandidates",
  "networkGetWirelessCandidates",
  "networkGetVlanCandidates",
  "networkEnumerateBondSlaves",
  "networkEnumerateBridgeSlaves",
  "networkSetEthernetIface",
  "networkSetWirelessIface",
  "networkSetBondIface",
  "networkSetVlanIface",
  "networkSetBridgeIface",
  "networkDeleteInterface",
  "networkGetProxy",
  "networkSetProxy",
  "iptablesGetRules",
  "iptablesGetRules6",
  "iptablesGetRule",
  "iptablesSetRule",
  "iptablesSetRules",
  "iptablesSetRules6",
  "iptablesDeleteRule",
  "webGuiGetSettings",
  "sshGet",
] as const;
export type NetworkOperation = (typeof NETWORK_OPERATIONS)[number];

type IfaceKind = "ethernet" | "wifi" | "bond" | "vlan" | "bridge";

/** The fields each set…Iface request carries beyond the common ones (the rest keep OMV's defaults). */
const KIND_FIELDS: Record<IfaceKind, readonly (keyof StoredIface)[]> = {
  ethernet: ["altmacaddress"],
  wifi: [
    "altmacaddress",
    "band",
    "wpassid",
    "wpapsk",
    "keymanagement",
    "hidden",
  ],
  bond: [
    "slaves",
    "bondprimary",
    "bondmode",
    "bondmiimon",
    "bonddowndelay",
    "bondupdelay",
    "bondtransmithashpolicy",
  ],
  vlan: ["altmacaddress", "vlanid", "vlanrawdevice"],
  bridge: ["slaves"],
};

/** A set…Iface request as OMV stores it: every field the kind has from the request, the rest defaults. */
function fromRequest(
  kind: IfaceKind,
  params: unknown,
  id: string,
  devicename: string,
): StoredIface {
  const d = STORED_DEFAULTS;
  const own = new Set<keyof StoredIface>(KIND_FIELDS[kind]);
  const pick = <K extends keyof StoredIface>(key: K, value: StoredIface[K]) =>
    own.has(key) ? value : (clone(d[key as keyof typeof d]) as StoredIface[K]);
  return {
    uuid: id,
    type: kind,
    devicename,
    method: text(params, "method", d.method),
    address: text(params, "address"),
    netmask: text(params, "netmask"),
    gateway: text(params, "gateway"),
    routemetric: int(params, "routemetric", d.routemetric),
    method6: text(params, "method6", d.method6),
    address6: text(params, "address6"),
    netmask6: int(params, "netmask6", d.netmask6),
    gateway6: text(params, "gateway6"),
    routemetric6: int(params, "routemetric6", d.routemetric6),
    dnsnameservers: listOf(params, "dnsnameservers"),
    dnssearch: listOf(params, "dnssearch"),
    mtu: int(params, "mtu", d.mtu),
    wol: bool(params, "wol", d.wol),
    comment: text(params, "comment"),
    altmacaddress: pick("altmacaddress", text(params, "altmacaddress")),
    slaves: pick("slaves", strings(params, "slaves")),
    bondprimary: pick("bondprimary", text(params, "bondprimary")),
    bondmode: pick("bondmode", int(params, "bondmode", d.bondmode)),
    bondmiimon: pick("bondmiimon", int(params, "bondmiimon", d.bondmiimon)),
    bonddowndelay: pick(
      "bonddowndelay",
      int(params, "bonddowndelay", d.bonddowndelay),
    ),
    bondupdelay: pick("bondupdelay", int(params, "bondupdelay", d.bondupdelay)),
    bondtransmithashpolicy: pick(
      "bondtransmithashpolicy",
      text(params, "bondtransmithashpolicy", d.bondtransmithashpolicy),
    ),
    vlanid: pick("vlanid", int(params, "vlanid", d.vlanid)),
    vlanrawdevice: pick("vlanrawdevice", text(params, "vlanrawdevice")),
    band: pick("band", text(params, "band", d.band)),
    wpassid: pick("wpassid", text(params, "wpassid")),
    wpapsk: pick("wpapsk", text(params, "wpapsk")),
    keymanagement: pick(
      "keymanagement",
      text(params, "keymanagement", d.keymanagement),
    ),
    hidden: pick("hidden", bool(params, "hidden", d.hidden)),
  };
}

interface RequestSchema {
  "~standard": {
    validate: (value: unknown) => unknown;
  };
}
/** Each write's request schema in the contract, for the strict mode. */
const WRITE_SCHEMAS: Partial<Record<NetworkOperation, RequestSchema>> = {
  networkSetGeneralSettings: F.NetworkSetGeneralSettingsRequestSchema,
  networkSetEthernetIface: F.NetworkSetEthernetIfaceRequestSchema,
  networkSetWirelessIface: F.NetworkSetWirelessIfaceRequestSchema,
  networkSetBondIface: F.NetworkSetBondIfaceRequestSchema,
  networkSetVlanIface: F.NetworkSetVlanIfaceRequestSchema,
  networkSetBridgeIface: F.NetworkSetBridgeIfaceRequestSchema,
  networkDeleteInterface: F.NetworkDeleteInterfaceRequestSchema,
  networkSetProxy: F.NetworkSetProxyRequestSchema,
  iptablesSetRule: F.IptablesSetRuleRequestSchema,
  iptablesSetRules: F.IptablesSetRulesRequestSchema,
  iptablesSetRules6: F.IptablesSetRules6RequestSchema,
  iptablesDeleteRule: F.IptablesDeleteRuleRequestSchema,
};

/** What the contract finds wrong with a request, or null. */
export function contractProblem(
  operationId: NetworkOperation,
  params: unknown,
): string | null {
  const schema = WRITE_SCHEMAS[operationId];
  if (schema === undefined) {
    return null;
  }
  // The forms' schemas are synchronous valibot schemas: a result with optional issues.
  const result = schema["~standard"].validate(params) as {
    issues?: readonly { message: string; path?: readonly unknown[] }[];
  };
  return result.issues === undefined
    ? null
    : `contract refused: ${result.issues.map((i) => i.message).join("; ")}`;
}

/**
 * The remembering answers of a network story. `dirty` receives the modules a write marks pending, which
 * the caller adds to what System.getInformation and Config.isDirty report.
 */
export function networkAnswers(
  state: NetworkMockState,
  hooks: { dirty: (modules: readonly NetworkModule[]) => void },
): Record<NetworkOperation, NetworkReply> {
  const dirty = (modules: readonly NetworkModule[]) => {
    for (const m of modules) {
      if (!state.pending.includes(m)) {
        state.pending.push(m);
      }
    }
    hooks.dirty(modules);
  };
  const newUuid = () => uuid(0x2800 + ++state.made);
  const fails = READ_FAILS[state.name] ?? {};
  /** A read, unless it fails in this story. */
  const read =
    (operationId: NetworkOperation, reply: NetworkReply): NetworkReply =>
    (call) =>
      fails[operationId] ?? reply(call);
  const rulesOf = (family: "inet" | "inet6") =>
    state.config.rules.filter((r) => r.family === family);

  /** A set…Iface: OMV's refusals, then the settings stored and answered in the stored shape. */
  const setIface =
    (kind: IfaceKind): NetworkReply =>
    ({ params }) => {
      if (kind === "wifi" && param(params, "wpapsk") === undefined) {
        return fail(400, NETWORK_MSG.noPassword);
      }
      const id = text(params, "uuid");
      const isNew = id === NEW_OBJECT;
      const existing = state.config.ifaces.find((i) => i.uuid === id);
      if (!isNew && existing === undefined) {
        return fail(500, NETWORK_MSG.notFound(IFACE, id));
      }
      let devicename = text(params, "devicename");
      if (kind === "bond") {
        if (isNew) {
          let n = 0;
          while (storedFor(state, `bond${String(n)}`) !== undefined) {
            n += 1;
          }
          devicename = `bond${String(n)}`;
        } else {
          devicename = existing?.devicename ?? devicename;
        }
        const ports = strings(params, "slaves");
        const inOther = state.config.ifaces
          .filter((i) => i.type === "bond" && i.uuid !== id)
          .flatMap((i) => i.slaves);
        const taken = ports.find((p) => inOther.includes(p));
        if (taken !== undefined) {
          return fail(500, NETWORK_MSG.portInBond(taken));
        }
        if (
          [1, 5, 6].includes(int(params, "bondmode", 1)) &&
          text(params, "bondprimary") === ""
        ) {
          return fail(500, NETWORK_MSG.noPrimary);
        }
      } else if (kind === "vlan") {
        devicename = `${text(params, "vlanrawdevice")}.${String(int(params, "vlanid", 1))}`;
      } else if (kind === "bridge" && devicename === "") {
        let n = 0;
        while (storedFor(state, `br${String(n)}`) !== undefined) {
          n += 1;
        }
        devicename = `br${String(n)}`;
      }
      const twin = state.config.ifaces.find(
        (i) => i.type === kind && i.devicename === devicename && i.uuid !== id,
      );
      if (twin !== undefined) {
        return fail(500, NETWORK_MSG.notUnique(kind, devicename));
      }
      const next = fromRequest(
        kind,
        params,
        isNew ? newUuid() : id,
        devicename,
      );
      if (isNew) {
        state.config.ifaces.push(next);
      } else {
        state.config.ifaces = state.config.ifaces.map((i) =>
          i.uuid === id ? next : i,
        );
      }
      dirty(isNew ? NETWORK_DIRTY.ifaceNew : NETWORK_DIRTY.ifaceChanged);
      return ok(storedShape(next, "stored"));
    };

  /** What a list of devices uses now, sorted as OMV sorts them. */
  const infos = (devices: readonly LiveDevice[]) =>
    ok(
      [...devices]
        .sort((a, b) => byName(a.devicename, b.devicename))
        .map(information),
    );
  /** Ethernet ports with no settings that are in no bond, bridge or VLAN. */
  const freePorts = () => {
    const used = members(state);
    const vlanParents = new Set(
      state.config.ifaces
        .filter((i) => i.type === "vlan")
        .map((i) => i.vlanrawdevice),
    );
    return state.devices.filter(
      (d) =>
        d.type === "ethernet" &&
        storedFor(state, d.devicename) === undefined &&
        !used.has(d.devicename) &&
        !vlanParents.has(d.devicename),
    );
  };
  const ownSlaves = (params: unknown, type: "bond" | "bridge") => {
    const own = state.config.ifaces.find(
      (i) => i.uuid === text(params, "uuid") && i.type === type,
    );
    return (own?.slaves ?? [])
      .map((n) => liveOf(state, n))
      .filter((d): d is LiveDevice => d !== undefined);
  };

  /** setRules and setRules6: the whole list replaced, every rule with a new UUID. */
  const setRules =
    (family: "inet" | "inet6"): NetworkReply =>
    ({ params }) => {
      const sent = Array.isArray(params) ? (params as unknown[]) : [];
      const next = sent.map((r): IptablesRule => ({
        uuid: newUuid(),
        family,
        rulenum: int(r, "rulenum", 0),
        chain: text(r, "chain", "INPUT"),
        action: text(r, "action"),
        source: text(r, "source"),
        sport: text(r, "sport"),
        destination: text(r, "destination"),
        dport: text(r, "dport"),
        protocol: text(r, "protocol", "all"),
        extraoptions: text(r, "extraoptions"),
        comment: text(r, "comment"),
      }));
      state.config.rules = [
        ...state.config.rules.filter((r) => r.family !== family),
        ...next,
      ];
      dirty(NETWORK_DIRTY.firewall);
      return ok(clone(next));
    };

  const answers: Record<NetworkOperation, NetworkReply> = {
    networkGetGeneralSettings: read("networkGetGeneralSettings", () =>
      ok({ ...state.config.general }),
    ),
    networkSetGeneralSettings: ({ params }) => {
      const general = {
        hostname: text(params, "hostname"),
        domainname: text(params, "domainname"),
      };
      if (REFUSED_DOMAINS.has(general.domainname)) {
        return fail(500, NETWORK_MSG.domain(general.domainname));
      }
      state.config.general = general;
      dirty(NETWORK_DIRTY.name);
      return ok({ ...general });
    },
    networkEnumerateDevicesList: read(
      "networkEnumerateDevicesList",
      ({ params }) =>
        page(
          [...state.devices]
            .sort((a, b) => byName(a.devicename, b.devicename))
            .map((d) => deviceRow(state, d)),
          params,
        ),
    ),
    networkGetInterfaceList: read("networkGetInterfaceList", ({ params }) =>
      page(
        [...state.config.ifaces]
          .sort((a, b) => byName(a.devicename, b.devicename))
          .map((s) => storedShape(s, "list")),
        params,
      ),
    ),
    networkGetInterface: read("networkGetInterface", ({ params }) => {
      const id = text(params, "uuid");
      const found = state.config.ifaces.find((i) => i.uuid === id);
      return found === undefined
        ? fail(500, NETWORK_MSG.notFound(IFACE, id))
        : ok(storedShape(found, "get"));
    }),
    networkGetInformation: read("networkGetInformation", ({ params }) => {
      const name = text(params, "devicename");
      const live = liveOf(state, name);
      return ok(live === undefined ? missingDevice(name) : information(live));
    }),
    networkIdentify: ({ params }) => {
      const devicename = text(params, "devicename");
      const seconds = int(params, "seconds", 10);
      state.started += 1;
      const handle = `${TASK_PREFIX}${String(state.started)}`;
      const live = liveOf(state, devicename);
      state.tasks.set(handle, {
        devicename,
        seconds,
        startedAt: state.now(),
        state: "running",
        ...(live?.type === "ethernet"
          ? {}
          : { failure: NETWORK_MSG.cannotBlink(devicename, seconds) }),
      });
      return ok(handle);
    },
    networkGetEthernetCandidates: () => infos(freePorts()),
    networkGetWirelessCandidates: () =>
      infos(
        state.devices.filter(
          (d) =>
            d.type === "wifi" && storedFor(state, d.devicename) === undefined,
        ),
      ),
    networkGetVlanCandidates: () =>
      infos(
        state.config.ifaces
          .filter((i) => i.type === "ethernet" || i.type === "bond")
          .map((i) => liveOf(state, i.devicename))
          .filter((d): d is LiveDevice => d !== undefined),
      ),
    networkEnumerateBondSlaves: ({ params }) =>
      infos([...freePorts(), ...ownSlaves(params, "bond")]),
    networkEnumerateBridgeSlaves: ({ params }) => {
      // A bond with settings, or the VLAN on it instead (observed), may join a bridge.
      const bridged = members(state);
      const bonds = state.config.ifaces
        .filter((i) => i.type === "bond" && !bridged.has(i.devicename))
        .map((b) => {
          const vlan = state.config.ifaces.find(
            (i) => i.type === "vlan" && i.vlanrawdevice === b.devicename,
          );
          return liveOf(state, vlan?.devicename ?? b.devicename);
        })
        .filter((d): d is LiveDevice => d !== undefined);
      return infos([...freePorts(), ...bonds, ...ownSlaves(params, "bridge")]);
    },
    networkSetEthernetIface: setIface("ethernet"),
    networkSetWirelessIface: setIface("wifi"),
    networkSetBondIface: setIface("bond"),
    networkSetVlanIface: setIface("vlan"),
    networkSetBridgeIface: setIface("bridge"),
    networkDeleteInterface: ({ params }) => {
      const id = text(params, "uuid");
      const found = state.config.ifaces.find((i) => i.uuid === id);
      if (found === undefined) {
        return fail(500, NETWORK_MSG.notFound(IFACE, id));
      }
      state.config.ifaces = state.config.ifaces.filter((i) => i.uuid !== id);
      if (!state.queued.includes(found.devicename)) {
        state.queued.push(found.devicename);
      }
      dirty(NETWORK_DIRTY.ifaceRemoved);
      return ok(storedShape(found, "stored"));
    },
    networkGetProxy: read("networkGetProxy", () =>
      ok(proxyFlat(state.config.proxy)),
    ),
    networkSetProxy: ({ params }) => {
      const next = Object.fromEntries(
        PROXIES.map((kind) => [
          kind,
          {
            enable: bool(params, `${kind}enable`, false),
            host: text(params, `${kind}host`),
            port: int(params, `${kind}port`, 8080),
            username: text(params, `${kind}username`),
            password: text(params, `${kind}password`),
          },
        ]),
      ) as Record<ProxyKind, StoredProxy>;
      state.config.proxy = next;
      dirty(NETWORK_DIRTY.proxy);
      return ok(clone(next));
    },
    iptablesGetRules: read("iptablesGetRules", () =>
      ok(clone(rulesOf("inet"))),
    ),
    iptablesGetRules6: read("iptablesGetRules6", () =>
      ok(clone(rulesOf("inet6"))),
    ),
    iptablesGetRule: read("iptablesGetRule", ({ params }) => {
      const id = text(params, "uuid");
      const found = state.config.rules.find((r) => r.uuid === id);
      return found === undefined
        ? fail(500, NETWORK_MSG.notFound(RULE, id))
        : ok({ ...found });
    }),
    iptablesSetRule: ({ params }) => {
      const id = text(params, "uuid");
      const family = text(params, "family") === "inet6" ? "inet6" : "inet";
      const isNew = id === NEW_OBJECT;
      if (!isNew && !state.config.rules.some((r) => r.uuid === id)) {
        return fail(500, NETWORK_MSG.notFound(RULE, id));
      }
      const sent = int(params, "rulenum", -1);
      // rulenum -1 adds the rule after the last one of its family.
      const rulenum =
        sent >= 0
          ? sent
          : rulesOf(family).reduce((max, r) => Math.max(max, r.rulenum), -1) +
            1;
      const next: IptablesRule = {
        uuid: isNew ? newUuid() : id,
        family,
        rulenum,
        chain: text(params, "chain", "INPUT"),
        action: text(params, "action"),
        source: text(params, "source"),
        sport: text(params, "sport"),
        destination: text(params, "destination"),
        dport: text(params, "dport"),
        protocol: text(params, "protocol", "all"),
        extraoptions: text(params, "extraoptions"),
        comment: text(params, "comment"),
      };
      state.config.rules = isNew
        ? [...state.config.rules, next]
        : state.config.rules.map((r) => (r.uuid === id ? next : r));
      dirty(NETWORK_DIRTY.firewall);
      return ok({ ...next });
    },
    iptablesSetRules: setRules("inet"),
    iptablesSetRules6: setRules("inet6"),
    iptablesDeleteRule: ({ params }) => {
      const id = text(params, "uuid");
      const found = state.config.rules.find((r) => r.uuid === id);
      if (found === undefined) {
        return fail(500, NETWORK_MSG.notFound(RULE, id));
      }
      state.config.rules = state.config.rules.filter((r) => r.uuid !== id);
      dirty(NETWORK_DIRTY.firewall);
      return ok({ ...found });
    },
    // The ports the firewall check needs (0.4), as captured.
    webGuiGetSettings: read("webGuiGetSettings", () =>
      ok({ ...CONTRACT_EXAMPLES.webGuiGetSettings.http.value }),
    ),
    sshGet: read("sshGet", () =>
      ok({ ...CONTRACT_EXAMPLES.sshGet.defaults.value }),
    ),
  };
  for (const operationId of Object.keys(WRITE_SCHEMAS) as NetworkOperation[]) {
    const write = answers[operationId];
    answers[operationId] = (call) => {
      const problem = state.strict
        ? contractProblem(operationId, call.params)
        : null;
      return problem === null ? write(call) : fail(500, problem);
    };
  }
  return answers;
}

/** The name of this NAS as last applied, for System.getInformation. */
export const networkHostname = (state: NetworkMockState): string =>
  state.applied.general.hostname;
