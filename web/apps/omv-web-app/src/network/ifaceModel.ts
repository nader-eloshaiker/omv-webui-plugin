// SPDX-License-Identifier: GPL-3.0-or-later
// Network interfaces (phase 5 network design 0.3, 0.8, 0.9, 3 to 10): the list's rows with what runs
// on what, the comparison of stored settings with what is in use, the attention lines, the "Set up…"
// menu, the address part's checks (5.3), the bond, VLAN, bridge and Wi-Fi checks, the refusals of
// removing settings (10.1) and what a removal loses (10.2), the "Copy the current settings" note
// (1.4), and the bodies of the five set…Iface methods and deleteInterface. What a change does to
// this page is in impact.ts. Pure.
import {
  type Connection,
  certainty,
  hasNoSettings,
  isLoopback,
  isMember,
  isVirtual,
  parentOf,
  standing,
  vlanParent,
} from "./connection.ts";
import {
  type BondMode,
  type DeleteInterfaceRequest,
  type DeviceRow,
  type HashPolicy,
  type IfaceSettings,
  type IfaceType,
  type KeyManagement,
  type Method4,
  type Method6,
  NEW_OBJECT_UUID,
  type Read,
  type SetBondIfaceRequest,
  type SetBridgeIfaceRequest,
  type SetEthernetIfaceRequest,
  type SetIfaceBase,
  type SetVlanIfaceRequest,
  type SetWirelessIfaceRequest,
  type WifiBand,
} from "./dto.ts";
import {
  type Family,
  type IpNetwork,
  addressScope,
  addressValue,
  canonicalAddress,
  firstAddress,
  formatAddress,
  formatBits,
  formatNetwork,
  hostRange,
  inNetwork,
  isComputerName,
  isLinkLocal,
  lastAddress,
  maskText,
  networkOf,
  parseAddress,
  parseNetworkSize,
  parsePrefix6,
  prefixFromMask,
  sameAddress,
} from "./ip.ts";

/** The pending module every interface change marks (0.7). */
export const NETWORK_MODULE = "systemd-networkd";

// ---- Words for what an interface is and does (0.3) -------------------------------------------------

export type KindKey =
  "ethernet" | "wifi" | "bond" | "vlan" | "bridge" | "virtual" | "other";

/** The kind word after an interface's name (0.2: "enp2s0 Network port"). */
export function kindOf(row: Pick<DeviceRow, "type" | "vlanid">): KindKey {
  switch (row.type) {
    case "ethernet":
    case "wifi":
    case "bond":
    case "vlan":
    case "bridge":
    case "virtual":
      return row.type;
    default:
      return row.vlanid >= 0 ? "vlan" : "other";
  }
}

export type ConnectionWord =
  /** "Connected at {{speed}}", or "Connected" when `speed` is null (-1). */
  { kind: "connected"; speed: number | null } | { kind: "notConnected" };

export const connectionWord = (
  row: Pick<DeviceRow, "link" | "speed">,
): ConnectionWord =>
  row.link
    ? { kind: "connected", speed: row.speed < 0 ? null : row.speed }
    : { kind: "notConnected" };

export type StateWord =
  | {
      key:
        | "iface.state.up"
        | "iface.state.down"
        | "iface.state.lowerDown"
        | "iface.state.dormant"
        | "iface.state.notPresent"
        | "iface.state.testing"
        | "iface.state.unknown";
    }
  /** Anything else, shown as received in `Identifier`. */
  | { key: null; value: string };

const STATE_KEYS = {
  UP: "iface.state.up",
  DOWN: "iface.state.down",
  LOWERLAYERDOWN: "iface.state.lowerDown",
  DORMANT: "iface.state.dormant",
  NOTPRESENT: "iface.state.notPresent",
  TESTING: "iface.state.testing",
  UNKNOWN: "iface.state.unknown",
} as const;

export function stateWord(state: string): StateWord {
  const key = STATE_KEYS[state.toUpperCase() as keyof typeof STATE_KEYS] as
    StateWord["key"] | undefined;
  return key === undefined || key === null
    ? { key: null, value: state }
    : { key };
}

export type HowKey =
  | "interfaces.how.dhcp"
  | "interfaces.how.auto"
  | "interfaces.how.dhcp6"
  | "interfaces.how.static"
  | "interfaces.how.off"
  | "interfaces.how.notSetUp"
  | "interfaces.how.unread";

export const howWord4 = (method: Method4): HowKey =>
  method === "dhcp"
    ? "interfaces.how.dhcp"
    : method === "static"
      ? "interfaces.how.static"
      : "interfaces.how.off";

export const howWord6 = (method: Method6): HowKey =>
  method === "auto"
    ? "interfaces.how.auto"
    : method === "dhcp"
      ? "interfaces.how.dhcp6"
      : method === "static"
        ? "interfaces.how.static"
        : "interfaces.how.off";

/** An address in use with its size ("192.0.2.10/24"), or null for "No address". */
export function addressInUse(
  row: Pick<DeviceRow, "address" | "prefix" | "address6" | "prefix6">,
  family: Family,
): { text: string; linkLocal: boolean } | null {
  const raw = (family === 4 ? row.address : row.address6.split("%")[0]) ?? "";
  const address = parseAddress(raw.trim());
  if (address === null || address.family !== family) {
    return null;
  }
  const prefix = family === 4 ? row.prefix : row.prefix6;
  const text =
    prefix >= 0
      ? `${formatAddress(address)}/${String(prefix)}`
      : formatAddress(address);
  return { text, linkLocal: family === 6 && isLinkLocal(raw) };
}

// ---- Stored settings against what is in use (0.3, 1.8, 4.2) -----------------------------------------

export type InUseField =
  | "method"
  | "address"
  | "netmask"
  | "gateway"
  | "method6"
  | "address6"
  | "netmask6"
  | "gateway6"
  | "mtu"
  | "altmacaddress";

export interface InUseDifference {
  field: InUseField;
  /** The stored value as the page shows it. */
  stored: string;
  /** What the interface uses now ("" for none). */
  inUse: string;
}

/** An address in its shortest form, or the text as stored when it is not one. */
const textOrEmpty = (text: string): string =>
  canonicalAddress(text) ?? text.trim();

/**
 * Where the stored settings differ from what the interface uses now. Only what can be compared is:
 * an automatic address cannot be (the router chooses it), Standard packet size neither.
 */
export function differsFromInUse(
  stored: IfaceSettings,
  live: Pick<
    DeviceRow,
    | "address"
    | "prefix"
    | "gateway"
    | "address6"
    | "prefix6"
    | "gateway6"
    | "mtu"
    | "ether"
  >,
): InUseDifference[] {
  const out: InUseDifference[] = [];
  const add = (field: InUseField, s: string, u: string) =>
    out.push({ field, stored: s, inUse: u });
  const live6 = (live.address6.split("%")[0] ?? "").trim();
  const global6 = live6 !== "" && !isLinkLocal(live6) ? live6 : "";

  if (stored.method === "static") {
    if (!sameAddress(stored.address, live.address)) {
      add("address", textOrEmpty(stored.address), textOrEmpty(live.address));
    }
    const prefix = prefixFromMask(stored.netmask);
    if (live.address !== "" && prefix !== null && prefix !== live.prefix) {
      add(
        "netmask",
        `/${String(prefix)}`,
        live.prefix < 0 ? "" : `/${String(live.prefix)}`,
      );
    }
    if (stored.gateway.trim() !== "" || live.gateway.trim() !== "") {
      if (!sameAddress(stored.gateway, live.gateway)) {
        add("gateway", textOrEmpty(stored.gateway), textOrEmpty(live.gateway));
      }
    }
  } else if (stored.method === "manual" && live.address.trim() !== "") {
    add("method", "manual", textOrEmpty(live.address));
  }

  if (stored.method6 === "static") {
    if (!sameAddress(stored.address6, global6)) {
      add("address6", textOrEmpty(stored.address6), textOrEmpty(global6));
    }
    if (global6 !== "" && stored.netmask6 !== live.prefix6) {
      add(
        "netmask6",
        `/${String(stored.netmask6)}`,
        live.prefix6 < 0 ? "" : `/${String(live.prefix6)}`,
      );
    }
    if (
      (stored.gateway6.trim() !== "" || live.gateway6.trim() !== "") &&
      !sameAddress(stored.gateway6, live.gateway6)
    ) {
      add("gateway6", textOrEmpty(stored.gateway6), textOrEmpty(live.gateway6));
    }
  } else if (stored.method6 === "manual" && global6 !== "") {
    add("method6", "manual", textOrEmpty(global6));
  }

  if (stored.mtu > 0 && String(stored.mtu) !== String(live.mtu).trim()) {
    add("mtu", String(stored.mtu), String(live.mtu).trim());
  }
  const mac = (stored.altmacaddress ?? "").trim().toLowerCase();
  if (mac !== "" && mac !== live.ether.trim().toLowerCase()) {
    add("altmacaddress", mac, live.ether.trim().toLowerCase());
  }
  return out;
}

// ---- The list (3.2 item 5) -------------------------------------------------------------------------

export interface IfaceListRow {
  devicename: string;
  kind: KindKey;
  /** 0 for a row of its own; 1 for a member under its bond or bridge; 2 for a bond's port inside a bridge. */
  depth: number;
  /** "This page uses it" (0.4). */
  thisPage: boolean;
  /** "Part of {{parent}}". */
  partOf: string | null;
  /** "Runs on {{parent}}", for a VLAN. */
  runsOn: string | null;
  connection: ConnectionWord;
  ipv4: { how: HowKey; inUse: ReturnType<typeof addressInUse> };
  ipv6: { how: HowKey; inUse: ReturnType<typeof addressInUse> };
  /** "Not applied yet" with the pending mark (0.3). */
  notApplied: boolean;
  /** The stored settings, when it has any and they were read. */
  settings: IfaceSettings | null;
}

export interface ListInput {
  devices: readonly DeviceRow[];
  /** Network.getInterfaceList. */
  stored: Read<readonly IfaceSettings[]>;
  connection: Connection;
  /** The interfaces (by `uuid`) this session saved since the last apply. */
  savedThisSession: readonly string[];
  /** The pending modules (System.getInformation's `dirtyModules`). */
  pending: readonly string[];
}

/** The stored settings of a device, by its name. */
export const storedFor = (
  stored: readonly IfaceSettings[],
  devicename: string,
): IfaceSettings | null =>
  stored.find((s) => s.devicename === devicename) ?? null;

/**
 * The table's rows (3.2 item 5): loopback left out, virtual interfaces counted rather than listed,
 * members under their bond or bridge, indented, in the order enumerateDevicesList gives them.
 */
export function interfaceRows(input: ListInput): {
  rows: IfaceListRow[];
  virtualHidden: number;
} {
  const { devices, stored, connection } = input;
  const storedList = stored.state === "ok" ? stored.data : [];
  const networkPending = input.pending.includes(NETWORK_MODULE);
  const shown = devices.filter((d) => !isLoopback(d) && !isVirtual(d));

  const rowOf = (device: DeviceRow, depth: number): IfaceListRow => {
    const settings = storedFor(storedList, device.devicename);
    const noSettings = hasNoSettings(device) && settings === null;
    const how = (family: Family): HowKey => {
      if (stored.state !== "ok") {
        return "interfaces.how.unread";
      }
      if (settings === null || noSettings) {
        return "interfaces.how.notSetUp";
      }
      return family === 4
        ? howWord4(settings.method)
        : howWord6(settings.method6);
    };
    const saved =
      settings !== null &&
      networkPending &&
      input.savedThisSession.includes(settings.uuid);
    return {
      devicename: device.devicename,
      kind: kindOf(device),
      depth,
      thisPage: standing(connection, device.devicename) === "this",
      partOf: parentOf(device.devicename, devices),
      runsOn: kindOf(device) === "vlan" ? vlanParent(device) : null,
      connection: connectionWord(device),
      ipv4: { how: how(4), inUse: addressInUse(device, 4) },
      ipv6: { how: how(6), inUse: addressInUse(device, 6) },
      notApplied:
        saved ||
        (settings !== null && differsFromInUse(settings, device).length > 0),
      settings,
    };
  };

  const rows: IfaceListRow[] = [];
  const placed = new Set<string>();
  const place = (device: DeviceRow, depth: number) => {
    if (placed.has(device.devicename)) {
      return;
    }
    placed.add(device.devicename);
    rows.push(rowOf(device, depth));
    for (const member of device.slaves ?? []) {
      const row = shown.find((d) => d.devicename === member);
      if (row !== undefined) {
        place(row, depth + 1);
      }
    }
  };
  for (const device of shown) {
    if (!isMember(device, devices)) {
      place(device, 0);
    }
  }
  // A member whose parent is not shown still gets a row.
  for (const device of shown) {
    place(device, 0);
  }
  return { rows, virtualHidden: devices.filter(isVirtual).length };
}

// ---- Attention lines (3.2 item 3) ------------------------------------------------------------------

export type AttentionLine =
  | { code: "interfaces.attn.noAddress"; iface: string }
  | { code: "interfaces.attn.notConnected"; iface: string }
  | { code: "interfaces.attn.notApplied"; iface: string }
  /** A plain line: such a port keeps its address across OMV's apply (VM fact 18.2 #7, P17). */
  | { code: "interfaces.attn.unmanaged"; iface: string };

/** The attention lines, worst first: each kind in turn, interfaces in list order. */
export function attentionLines(
  rows: readonly IfaceListRow[],
  devices: readonly DeviceRow[],
  connection: Connection,
): AttentionLine[] {
  const live = (name: string) => devices.find((d) => d.devicename === name);
  const noAddress: AttentionLine[] = [];
  const notConnected: AttentionLine[] = [];
  const notApplied: AttentionLine[] = [];
  for (const row of rows) {
    const s = row.settings;
    const device = live(row.devicename);
    if (s === null || device === undefined) {
      continue;
    }
    if (s.method === "static" && device.address.trim() === "") {
      noAddress.push({
        code: "interfaces.attn.noAddress",
        iface: row.devicename,
      });
    }
    const wifiOff = s.type === "wifi" && device.state.toUpperCase() === "DOWN";
    if (!device.link && !wifiOff) {
      notConnected.push({
        code: "interfaces.attn.notConnected",
        iface: row.devicename,
      });
    }
    if (row.notApplied) {
      notApplied.push({
        code: "interfaces.attn.notApplied",
        iface: row.devicename,
      });
    }
  }
  const unmanaged: AttentionLine[] =
    connection.kind === "unmanaged" && !connection.virtual
      ? [{ code: "interfaces.attn.unmanaged", iface: connection.iface }]
      : [];
  return [...noAddress, ...notConnected, ...notApplied, ...unmanaged];
}

// ---- "Set up…" (3.2 item 4) ------------------------------------------------------------------------

export type SetUpItem = "port" | "wifi" | "bond" | "vlan" | "bridge";

export type SetUpAvailability =
  | { available: true }
  | {
      available: false;
      code:
        | "interfaces.add.noPort"
        | "interfaces.add.noWifi"
        | "interfaces.add.noBond"
        | "interfaces.add.noVlan"
        | "interfaces.add.noBridge"
        | "interfaces.settingsFailed"
        | "interfaces.loadFailed";
    };

/** Whether each item of the "Set up…" menu has something to choose from. */
export function setUpMenu(
  devices: Read<readonly DeviceRow[]>,
  stored: Read<readonly IfaceSettings[]>,
): Record<SetUpItem, SetUpAvailability> {
  const all = (code: "interfaces.settingsFailed" | "interfaces.loadFailed") => {
    const off = { available: false, code } as const;
    return { port: off, wifi: off, bond: off, vlan: off, bridge: off };
  };
  if (devices.state !== "ok") {
    return all("interfaces.loadFailed");
  }
  if (stored.state !== "ok") {
    return all("interfaces.settingsFailed");
  }
  const rows = devices.data;
  const free = rows.filter(
    (d) =>
      !isLoopback(d) &&
      !isVirtual(d) &&
      !isMember(d, rows) &&
      storedFor(stored.data, d.devicename) === null &&
      hasNoSettings(d),
  );
  const freePorts = free.filter((d) => d.type === "ethernet");
  const freeWifi = free.filter((d) => d.type === "wifi");
  const vlanParents = stored.data.filter((s) => s.type !== "vlan");
  const bridgeable = free.filter(
    (d) => d.type !== "wifi" && d.type !== "bridge",
  );
  const yes = { available: true } as const;
  return {
    port:
      freePorts.length > 0
        ? yes
        : { available: false, code: "interfaces.add.noPort" },
    wifi:
      freeWifi.length > 0
        ? yes
        : { available: false, code: "interfaces.add.noWifi" },
    bond:
      freePorts.length > 0
        ? yes
        : { available: false, code: "interfaces.add.noBond" },
    vlan:
      vlanParents.length > 0
        ? yes
        : { available: false, code: "interfaces.add.noVlan" },
    bridge:
      bridgeable.length > 0
        ? yes
        : { available: false, code: "interfaces.add.noBridge" },
  };
}

// ---- The form's draft (5.2) ------------------------------------------------------------------------

/** The address part shared by every kind (5.2), as typed. */
export interface AddressDraft {
  method: Method4;
  address: string;
  /** "24", "/24" or "255.255.255.0". */
  size: string;
  gateway: string;
  method6: Method6;
  address6: string;
  prefix6: string;
  gateway6: string;
  /** One per line or separated by commas. */
  dnsnameservers: string;
  dnssearch: string;
  /** "" or "0" is Standard. */
  mtu: string;
  wol: boolean;
  /** Ethernet and Wi-Fi only; "" for none. */
  altmacaddress: string;
  routemetric: string;
  routemetric6: string;
  comment: string;
}

/** The classic form's defaults for a new interface (0.9, D4). */
export const NEW_ADDRESS_DRAFT: AddressDraft = {
  method: "dhcp",
  address: "",
  size: "",
  gateway: "",
  method6: "manual",
  address6: "",
  prefix6: "64",
  gateway6: "",
  dnsnameservers: "",
  dnssearch: "",
  mtu: "0",
  wol: false,
  altmacaddress: "",
  routemetric: "0",
  routemetric6: "1",
  comment: "",
};

/**
 * Stored settings for an interface that has none yet: the classic form's defaults (0.9, D4, D5), for
 * comparing a first set-up with what the interface uses now.
 */
export const blankSettings = (
  devicename: string,
  type: IfaceType,
): IfaceSettings => ({
  uuid: NEW_OBJECT_UUID,
  type,
  devicename,
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
  slaves: [],
  bondprimary: "",
  bondmode: 1,
  bondmiimon: 100,
  bonddowndelay: 0,
  bondupdelay: 0,
  bondtransmithashpolicy: "layer2",
  vlanid: 0,
  vlanrawdevice: "",
  band: "auto",
  wpassid: "",
  keymanagement: "psk",
  hidden: false,
});

/** A list as OMV accepts it (comma, semicolon or space separated), each item once, in order. */
export function splitList(text: string): string[] {
  return text
    .split(/[\s,;]+/u)
    .map((s) => s.trim())
    .filter((s, i, all) => s !== "" && all.indexOf(s) === i);
}

/** The draft for stored settings. */
export function addressDraftOf(settings: IfaceSettings): AddressDraft {
  const prefix = prefixFromMask(settings.netmask);
  return {
    method: settings.method,
    address: settings.address,
    size: prefix === null ? settings.netmask : String(prefix),
    gateway: settings.gateway,
    method6: settings.method6,
    address6: settings.address6,
    prefix6: String(settings.netmask6),
    gateway6: settings.gateway6,
    dnsnameservers: splitList(settings.dnsnameservers).join("\n"),
    dnssearch: splitList(settings.dnssearch).join("\n"),
    mtu: String(settings.mtu),
    wol: settings.wol,
    altmacaddress: settings.altmacaddress ?? "",
    routemetric: String(settings.routemetric),
    routemetric6: String(settings.routemetric6),
    comment: settings.comment,
  };
}

/**
 * "Set it up as it is now…" (4.2 item 5, P17): a fixed address equal to the one in use, its size and
 * router address, and IPv6 as Automatic.
 */
export function adoptDraft(
  live: Pick<DeviceRow, "address" | "prefix" | "gateway">,
): AddressDraft {
  const address = parseAddress(live.address.trim());
  return address === null || live.prefix < 1
    ? { ...NEW_ADDRESS_DRAFT, method6: "auto" }
    : {
        ...NEW_ADDRESS_DRAFT,
        method: "static",
        address: formatAddress(address),
        size: String(live.prefix),
        gateway: live.gateway.trim(),
        method6: "auto",
      };
}

// ---- The address part's checks (5.3) ---------------------------------------------------------------

export type AddressField = keyof AddressDraft;

/** One message of 5.3, `ifaceForm.err.*`, with the values its words need. */
export type AddressProblem =
  | { field: "address" | "gateway"; code: "ifaceForm.err.ipv4" }
  | {
      field: "address" | "address6";
      code: "ifaceForm.err.networkAddress";
      value: string;
      first: string;
      last: string;
    }
  | {
      field: "address" | "address6";
      code: "ifaceForm.err.reserved";
      value: string;
    }
  | { field: "size"; code: "ifaceForm.err.size" }
  | {
      field: "gateway" | "gateway6";
      code: "ifaceForm.err.gatewayNetwork";
      value: string;
      network: string;
    }
  | { field: "gateway" | "gateway6"; code: "ifaceForm.err.gatewaySelf" }
  | {
      field: "address" | "address6";
      code: "ifaceForm.err.duplicate";
      iface: string;
      value: string;
    }
  | { field: "address6" | "gateway6"; code: "ifaceForm.err.ipv6" }
  | { field: "prefix6"; code: "ifaceForm.err.prefix" }
  | { field: "dnsnameservers"; code: "ifaceForm.err.dnsServer"; value: string }
  | { field: "dnsnameservers"; code: "ifaceForm.err.dnsNone" }
  | { field: "dnssearch"; code: "ifaceForm.err.search"; value: string }
  | { field: "mtu"; code: "ifaceForm.err.mtu" }
  | { field: "altmacaddress"; code: "ifaceForm.err.mac" }
  /** Not in 5.3's list: a route priority outside 0 to 65535 (the NumberField's own bounds). */
  | { field: "routemetric" | "routemetric6"; code: "ifaceForm.err.metric" }
  /** A VLAN on its parent's network (8.1). */
  | {
      field: "address" | "address6";
      code: "vlan.err.sameNetwork";
      parent: string;
      network: string;
    };

/** The packet size bounds (D15). */
export const MTU = { min: 576, max: 9216, minWithIpv6: 1280 } as const;

const MAC = /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/u;

/** A hardware address: six pairs with colons, unicast (even first pair), not all zeros (0.8). */
export function checkMac(text: string): boolean {
  const mac = text.trim().toLowerCase();
  if (!MAC.test(mac)) {
    return false;
  }
  const first = Number.parseInt(mac.slice(0, 2), 16);
  return first % 2 === 0 && mac !== "00:00:00:00:00:00";
}

/** Another interface's addresses, for the duplicate check: what it uses now and its stored fixed ones. */
export interface OtherAddresses {
  devicename: string;
  addresses: readonly string[];
}

/** Every other interface's addresses (live and stored fixed), for checkAddresses. */
export function otherAddresses(
  devicename: string,
  devices: readonly DeviceRow[],
  stored: readonly IfaceSettings[],
): OtherAddresses[] {
  const names = new Set([
    ...devices.map((d) => d.devicename),
    ...stored.map((s) => s.devicename),
  ]);
  names.delete(devicename);
  return [...names]
    .filter((name) => {
      const d = devices.find((r) => r.devicename === name);
      return d === undefined || !isLoopback(d);
    })
    .map((name) => {
      const d = devices.find((r) => r.devicename === name);
      const s = storedFor(stored, name);
      return {
        devicename: name,
        addresses: [
          d?.address ?? "",
          (d?.address6 ?? "").split("%")[0] ?? "",
          s?.method === "static" ? s.address : "",
          s?.method6 === "static" ? s.address6 : "",
        ].filter((a) => a.trim() !== ""),
      };
    });
}

export interface AddressCheckContext {
  /** Every other interface's addresses. */
  others: readonly OtherAddresses[];
  /** A VLAN's parent and the networks it uses now, for 8.1's same-network check. */
  vlanParent?: { devicename: string; networks: readonly IpNetwork[] };
}

const ipv6On = (method6: Method6): boolean => method6 !== "manual";

/** Every check of 5.3 on the address part, in field order. */
export function checkAddresses(
  draft: AddressDraft,
  context: AddressCheckContext,
): AddressProblem[] {
  const problems: AddressProblem[] = [];
  const duplicate = (field: "address" | "address6", text: string) => {
    const other = context.others.find((o) =>
      o.addresses.some((a) => sameAddress(a, text)),
    );
    if (other !== undefined) {
      problems.push({
        field,
        code: "ifaceForm.err.duplicate",
        iface: other.devicename,
        value: text.trim(),
      });
    }
  };
  const sameAsParent = (
    field: "address" | "address6",
    value: bigint,
    family: Family,
  ) => {
    const parent = context.vlanParent;
    const network = parent?.networks.find(
      (n) =>
        n.family === family &&
        inNetwork(
          family === 4
            ? { family: 4, value: Number(value) }
            : { family: 6, value },
          n,
        ),
    );
    if (parent !== undefined && network !== undefined) {
      problems.push({
        field,
        code: "vlan.err.sameNetwork",
        parent: parent.devicename,
        network: formatNetwork(network),
      });
    }
  };

  if (draft.method === "static") {
    const address = parseAddress(draft.address.trim());
    const prefix = parseNetworkSize(draft.size);
    if (address === null || address.family !== 4) {
      problems.push({ field: "address", code: "ifaceForm.err.ipv4" });
    } else if (addressScope(address) !== "other") {
      problems.push({
        field: "address",
        code: "ifaceForm.err.reserved",
        value: draft.address.trim(),
      });
    }
    if (prefix === null) {
      problems.push({ field: "size", code: "ifaceForm.err.size" });
    }
    if (
      address !== null &&
      address.family === 4 &&
      addressScope(address) === "other" &&
      prefix !== null
    ) {
      const network = networkOf(4, addressValue(address), prefix);
      const value = addressValue(address);
      if (
        prefix <= 30 &&
        (value === firstAddress(network) || value === lastAddress(network))
      ) {
        const range = hostRange(network);
        problems.push({
          field: "address",
          code: "ifaceForm.err.networkAddress",
          value: formatAddress(address),
          first: formatBits(4, range.first),
          last: formatBits(4, range.last),
        });
      } else {
        duplicate("address", draft.address);
        sameAsParent("address", value, 4);
      }
      const gatewayText = draft.gateway.trim();
      if (gatewayText !== "") {
        const gateway = parseAddress(gatewayText);
        if (gateway === null || gateway.family !== 4) {
          problems.push({ field: "gateway", code: "ifaceForm.err.ipv4" });
        } else if (addressValue(gateway) === value) {
          problems.push({
            field: "gateway",
            code: "ifaceForm.err.gatewaySelf",
          });
        } else if (prefix >= 31 || !inNetwork(gateway, network)) {
          problems.push({
            field: "gateway",
            code: "ifaceForm.err.gatewayNetwork",
            value: gatewayText,
            network: formatNetwork(network),
          });
        }
      }
    } else if (
      draft.gateway.trim() !== "" &&
      parseAddress(draft.gateway.trim())?.family !== 4
    ) {
      problems.push({ field: "gateway", code: "ifaceForm.err.ipv4" });
    }
  }

  if (draft.method6 === "static") {
    const address = parseAddress(draft.address6.trim());
    const prefix = parsePrefix6(draft.prefix6);
    if (address === null || address.family !== 6) {
      problems.push({ field: "address6", code: "ifaceForm.err.ipv6" });
    } else if (addressScope(address) !== "other") {
      problems.push({
        field: "address6",
        code: "ifaceForm.err.reserved",
        value: draft.address6.trim(),
      });
    } else {
      duplicate("address6", draft.address6);
      sameAsParent("address6", address.value, 6);
    }
    if (prefix === null) {
      problems.push({ field: "prefix6", code: "ifaceForm.err.prefix" });
    }
    const gatewayText = draft.gateway6.trim();
    if (gatewayText !== "") {
      const gateway = parseAddress(gatewayText);
      if (gateway === null || gateway.family !== 6) {
        problems.push({ field: "gateway6", code: "ifaceForm.err.ipv6" });
      } else if (
        address !== null &&
        address.family === 6 &&
        gateway.value === address.value
      ) {
        problems.push({ field: "gateway6", code: "ifaceForm.err.gatewaySelf" });
      } else if (
        address !== null &&
        address.family === 6 &&
        addressScope(address) === "other" &&
        prefix !== null &&
        addressScope(gateway) !== "linkLocal" &&
        !inNetwork(gateway, networkOf(6, address.value, prefix))
      ) {
        // An IPv6 router is most often given by its link-local address, which is on every network.
        problems.push({
          field: "gateway6",
          code: "ifaceForm.err.gatewayNetwork",
          value: gatewayText,
          network: formatNetwork(networkOf(6, address.value, prefix)),
        });
      }
    }
  }

  const servers = splitList(draft.dnsnameservers);
  const badServer = servers.find((s) => parseAddress(s) === null);
  if (badServer !== undefined) {
    problems.push({
      field: "dnsnameservers",
      code: "ifaceForm.err.dnsServer",
      value: badServer,
    });
  } else if (
    draft.method === "static" &&
    draft.gateway.trim() !== "" &&
    servers.length === 0
  ) {
    problems.push({ field: "dnsnameservers", code: "ifaceForm.err.dnsNone" });
  }
  const badSearch = splitList(draft.dnssearch).find((s) => !isComputerName(s));
  if (badSearch !== undefined) {
    problems.push({
      field: "dnssearch",
      code: "ifaceForm.err.search",
      value: badSearch,
    });
  }

  if (mtuOf(draft.mtu, draft.method6) === null) {
    problems.push({ field: "mtu", code: "ifaceForm.err.mtu" });
  }
  if (draft.altmacaddress.trim() !== "" && !checkMac(draft.altmacaddress)) {
    problems.push({ field: "altmacaddress", code: "ifaceForm.err.mac" });
  }
  for (const field of ["routemetric", "routemetric6"] as const) {
    if (metricOf(draft[field]) === null) {
      problems.push({ field, code: "ifaceForm.err.metric" });
    }
  }
  return problems;
}

/** The packet size to send: 0 for Standard, 576 to 9216, at least 1280 with IPv6 on; null otherwise. */
export function mtuOf(text: string, method6: Method6): number | null {
  const t = text.trim();
  if (t === "" || t === "0") {
    return 0;
  }
  if (!/^[1-9][0-9]{2,3}$/u.test(t)) {
    return null;
  }
  const mtu = Number(t);
  const min = ipv6On(method6) ? MTU.minWithIpv6 : MTU.min;
  return mtu >= min && mtu <= MTU.max ? mtu : null;
}

const metricOf = (text: string): number | null => {
  const t = text.trim();
  if (!/^(?:0|[1-9][0-9]{0,4})$/u.test(t)) {
    return null;
  }
  const n = Number(t);
  return n <= 65535 ? n : null;
};

/** 5.2's readout under the network size: "Network {{network}}: {{first}} to {{last}}, {{count}} addresses for devices". */
export function sizeReadout(
  addressText: string,
  sizeText: string,
): { network: string; first: string; last: string; count: number } | null {
  const address = parseAddress(addressText.trim());
  const prefix = parseNetworkSize(sizeText);
  if (address === null || address.family !== 4 || prefix === null) {
    return null;
  }
  const network = networkOf(4, addressValue(address), prefix);
  const range = hostRange(network);
  return {
    network: formatNetwork(network),
    first: formatBits(4, range.first),
    last: formatBits(4, range.last),
    count: Number(range.count),
  };
}

// ---- Bonds, VLANs, bridges, Wi-Fi (7 to 9, 6) -------------------------------------------------------

/** Why an interface cannot be a bond's port or a bridge's interface (0.8's "Make a bond or bridge"). */
export type MemberRefusal =
  /** "This page reaches the NAS through it." with `network.impact.otherWay`. */
  | { code: "bond.thisPagePort"; iface: string }
  /** It has settings of its own (not offered). */
  | { code: "hasSettings"; iface: string }
  /** It is part of another bond or bridge (not offered). */
  | { code: "member"; iface: string; parent: string }
  /** A VLAN runs on it (not offered). */
  | { code: "vlanOn"; iface: string; vlan: string };

/** The VLANs that run on an interface, by their names. */
export function vlansOn(
  devicename: string,
  devices: readonly DeviceRow[],
  stored: readonly IfaceSettings[],
): string[] {
  const names = new Set<string>();
  for (const s of stored) {
    if (s.type === "vlan" && s.vlanrawdevice === devicename) {
      names.add(s.devicename);
    }
  }
  for (const d of devices) {
    if (kindOf(d) === "vlan" && vlanParent(d) === devicename) {
      names.add(d.devicename);
    }
  }
  return [...names];
}

export function memberRefusal(
  devicename: string,
  input: {
    connection: Connection;
    devices: readonly DeviceRow[];
    stored: readonly IfaceSettings[];
    /** The bond or bridge being changed, whose own members stay allowed. */
    ownMembers?: readonly string[];
  },
): MemberRefusal | null {
  const { connection, devices, stored } = input;
  const s = standing(connection, devicename);
  if (s === "this" || s === "under") {
    return { code: "bond.thisPagePort", iface: devicename };
  }
  if ((input.ownMembers ?? []).includes(devicename)) {
    return null;
  }
  if (storedFor(stored, devicename) !== null) {
    return { code: "hasSettings", iface: devicename };
  }
  const parent = parentOf(devicename, [
    ...devices,
    ...stored.map((x) => ({ devicename: x.devicename, slaves: x.slaves })),
  ]);
  if (parent !== null) {
    return { code: "member", iface: devicename, parent };
  }
  const vlan = vlansOn(devicename, devices, stored)[0];
  if (vlan !== undefined) {
    return { code: "vlanOn", iface: devicename, vlan };
  }
  return null;
}

/** The three bond modes offered (P3); any other is "set in the classic interface" and kept. */
export const BOND_MODES = {
  backup: 1,
  lacp: 4,
  alb: 6,
} as const satisfies Record<string, BondMode>;
/** The modes in which OMV refuses a bond without a main port. */
export const MODES_NEEDING_PRIMARY: readonly number[] = [1, 5, 6];
/** OMV's bond mode names, for a mode set in the classic interface (`bond.mode.classic`). */
export const BOND_MODE_NAMES: Readonly<Record<number, string>> = {
  0: "balance-rr",
  1: "active-backup",
  2: "balance-xor",
  3: "broadcast",
  4: "802.3ad",
  5: "balance-tlb",
  6: "balance-alb",
};

export interface BondDraft {
  slaves: readonly string[];
  bondmode: BondMode;
  bondprimary: string;
}

export type BondProblem =
  | { field: "slaves"; code: "bond.err.noPort" }
  | { field: "bondprimary"; code: "bond.err.primary" };

/** A bond's checks (0.8): a port at least; the main port among the ports, and chosen where OMV requires it. */
export function checkBond(draft: BondDraft): BondProblem[] {
  const problems: BondProblem[] = [];
  if (draft.slaves.length === 0) {
    problems.push({ field: "slaves", code: "bond.err.noPort" });
  }
  const primary = draft.bondprimary.trim();
  if (
    (primary === "" && MODES_NEEDING_PRIMARY.includes(draft.bondmode)) ||
    (primary !== "" && !draft.slaves.includes(primary))
  ) {
    problems.push({ field: "bondprimary", code: "bond.err.primary" });
  }
  return problems;
}

/** "A bond of one port does not protect against anything." (7.1 item 2) */
export const bondWarnsOnePort = (draft: BondDraft): boolean =>
  draft.slaves.length === 1;

export type VlanProblem =
  | { field: "vlanid"; code: "vlan.err.id" }
  | { field: "vlanid"; code: "vlan.err.taken"; parent: string; id: number };

/** A VLAN's checks (0.8): the ID 1 to 4094 (D14); the parent has no VLAN with that ID. */
export function checkVlan(
  draft: { vlanrawdevice: string; vlanid: string },
  stored: readonly IfaceSettings[],
): VlanProblem[] {
  const text = draft.vlanid.trim();
  if (!/^[1-9][0-9]{0,3}$/u.test(text) || Number(text) > 4094) {
    return [{ field: "vlanid", code: "vlan.err.id" }];
  }
  const id = Number(text);
  const taken = stored.some(
    (s) =>
      s.type === "vlan" &&
      s.vlanrawdevice === draft.vlanrawdevice &&
      s.vlanid === id,
  );
  return taken
    ? [
        {
          field: "vlanid",
          code: "vlan.err.taken",
          parent: draft.vlanrawdevice,
          id,
        },
      ]
    : [];
}

/** The name OMV gives a new VLAN (8.1 item 4). */
export const vlanName = (parent: string, id: number): string =>
  `${parent}.${String(id)}`;

export type WifiProblem =
  | { field: "wpassid"; code: "wifi.err.name" }
  | { field: "wpapsk"; code: "wifi.err.password" };

/** A Wi-Fi interface's checks (0.8): the name 1 to 32 bytes; the password 8 to 63 characters or 64 hexadecimal digits. */
export function checkWifi(draft: {
  wpassid: string;
  wpapsk: string;
}): WifiProblem[] {
  const problems: WifiProblem[] = [];
  const bytes = new TextEncoder().encode(draft.wpassid).length;
  if (draft.wpassid === "" || bytes > 32 || /\p{Cc}/u.test(draft.wpassid)) {
    problems.push({ field: "wpassid", code: "wifi.err.name" });
  }
  const length = [...draft.wpapsk].length;
  const hex = /^[0-9A-Fa-f]{64}$/u.test(draft.wpapsk);
  const passphrase =
    length >= 8 && length <= 63 && /^[\x20-\x7e]+$/u.test(draft.wpapsk);
  if (!hex && !passphrase) {
    problems.push({ field: "wpapsk", code: "wifi.err.password" });
  }
  return problems;
}

// ---- Removing an interface's settings (10) ---------------------------------------------------------

export type RemovalRefusal =
  /** "This page reaches the NAS through {{iface}}. Removing its settings would cut it off." + otherWay. */
  | { code: "ifaceDelete.refusedThis"; iface: string }
  /** "This page reaches the NAS through {{top}}, which runs on {{iface}}." + otherWay. */
  | { code: "ifaceDelete.refusedUnder"; top: string; iface: string }
  /** "The VLAN {{vlan}} runs on {{iface}}. Remove the VLAN first." */
  | { code: "ifaceDelete.refusedVlan"; vlan: string; iface: string }
  /** Part of a bond or bridge: it has no settings of its own (`iface.member` / `iface.memberBridge`). */
  | {
      code: "iface.member" | "iface.memberBridge";
      iface: string;
      parent: string;
    }
  /** It has no settings to remove. */
  | { code: "noSettings"; iface: string };

/**
 * 10.1. On this page's interface or under it, refused only when the page knows or probably knows its
 * interface: never on a guess (0.5); with Name only or Not known, removing is May cut (impact.ts).
 */
export function removalRefusal(
  devicename: string,
  input: {
    connection: Connection;
    devices: readonly DeviceRow[];
    stored: readonly IfaceSettings[];
  },
): RemovalRefusal | null {
  const { connection, devices, stored } = input;
  const settings = storedFor(stored, devicename);
  const device = devices.find((d) => d.devicename === devicename);
  const parent = parentOf(devicename, devices);
  if (parent !== null || (device?._readonly ?? false)) {
    const p = parent ?? "";
    const parentKind = devices.find((d) => d.devicename === p);
    return {
      code:
        parentKind?.type === "bridge" ? "iface.memberBridge" : "iface.member",
      iface: devicename,
      parent: p,
    };
  }
  if (settings === null) {
    return { code: "noSettings", iface: devicename };
  }
  if (certainty(connection) !== "notKnown" && connection.kind !== "unmanaged") {
    const s = standing(connection, devicename);
    if (s === "this") {
      return { code: "ifaceDelete.refusedThis", iface: devicename };
    }
    if (
      s === "under" &&
      (connection.kind === "known" || connection.kind === "probable")
    ) {
      return {
        code: "ifaceDelete.refusedUnder",
        top: connection.iface,
        iface: devicename,
      };
    }
  }
  const vlan = vlansOn(devicename, devices, stored)[0];
  if (vlan !== undefined) {
    return { code: "ifaceDelete.refusedVlan", vlan, iface: devicename };
  }
  return null;
}

export type RemovalLoss =
  | { code: "ifaceDelete.usesNow"; addresses: string[] }
  | { code: "ifaceDelete.bondPorts"; ports: string[] }
  | { code: "ifaceDelete.bridgeMembers"; members: string[] }
  | { code: "ifaceDelete.wifi" }
  | { code: "ifaceDelete.wol" }
  | { code: "ifaceDelete.fixed"; address: string };

/** What else is lost (10.2 items 2 and 3), each line when it applies. */
export function removalLosses(
  settings: IfaceSettings,
  live: Pick<DeviceRow, "address" | "prefix" | "address6" | "prefix6"> | null,
): RemovalLoss[] {
  const losses: RemovalLoss[] = [];
  const inUse =
    live === null
      ? []
      : [addressInUse(live, 4), addressInUse(live, 6)]
          .filter((a): a is NonNullable<typeof a> => a !== null)
          .map((a) => a.text);
  if (inUse.length > 0) {
    losses.push({ code: "ifaceDelete.usesNow", addresses: inUse });
  }
  if (settings.type === "bond") {
    losses.push({
      code: "ifaceDelete.bondPorts",
      ports: [...(settings.slaves ?? [])],
    });
  }
  if (settings.type === "bridge") {
    losses.push({
      code: "ifaceDelete.bridgeMembers",
      members: [...(settings.slaves ?? [])],
    });
  }
  if (settings.type === "wifi") {
    losses.push({ code: "ifaceDelete.wifi" });
  }
  if (settings.wol) {
    losses.push({ code: "ifaceDelete.wol" });
  }
  if (settings.method === "static" && settings.address.trim() !== "") {
    losses.push({
      code: "ifaceDelete.fixed",
      address: settings.address.trim(),
    });
  }
  if (settings.method6 === "static" && settings.address6.trim() !== "") {
    losses.push({
      code: "ifaceDelete.fixed",
      address: settings.address6.trim(),
    });
  }
  return losses;
}

// ---- "Copy the current settings" (1.4 step 2, item 5) ------------------------------------------------

export type NoteLabel =
  | "iface"
  | "ipv4How"
  | "ipv4Address"
  | "ipv4Gateway"
  | "ipv6How"
  | "ipv6Address"
  | "ipv6Gateway"
  | "dnsServers"
  | "search"
  | "mtu";

/**
 * The note's lines: the interface's name, how each family gets its address, the addresses with
 * their sizes, the router addresses, the name servers, the search domains and the packet size; never
 * a password. The page writes them as text, one "label: value" per line, in its language.
 */
export function currentSettingsNote(
  settings: IfaceSettings,
  live: Pick<
    DeviceRow,
    | "address"
    | "prefix"
    | "address6"
    | "prefix6"
    | "gateway"
    | "gateway6"
    | "mtu"
  > | null,
): { label: NoteLabel; value: string | HowKey }[] {
  const lines: { label: NoteLabel; value: string | HowKey }[] = [
    { label: "iface", value: settings.devicename },
    { label: "ipv4How", value: howWord4(settings.method) },
  ];
  const prefix = prefixFromMask(settings.netmask);
  if (settings.method === "static") {
    lines.push({
      label: "ipv4Address",
      value: `${settings.address.trim()}/${prefix === null ? settings.netmask : String(prefix)}`,
    });
    if (settings.gateway.trim() !== "") {
      lines.push({ label: "ipv4Gateway", value: settings.gateway.trim() });
    }
  } else if (live !== null) {
    const now = addressInUse(live, 4);
    if (now !== null) {
      lines.push({ label: "ipv4Address", value: now.text });
    }
    if (live.gateway.trim() !== "") {
      lines.push({ label: "ipv4Gateway", value: live.gateway.trim() });
    }
  }
  lines.push({ label: "ipv6How", value: howWord6(settings.method6) });
  if (settings.method6 === "static") {
    lines.push({
      label: "ipv6Address",
      value: `${settings.address6.trim()}/${String(settings.netmask6)}`,
    });
    if (settings.gateway6.trim() !== "") {
      lines.push({ label: "ipv6Gateway", value: settings.gateway6.trim() });
    }
  } else if (live !== null) {
    const now = addressInUse(live, 6);
    if (now !== null) {
      lines.push({ label: "ipv6Address", value: now.text });
    }
  }
  const servers = splitList(settings.dnsnameservers);
  if (servers.length > 0) {
    lines.push({ label: "dnsServers", value: servers.join(", ") });
  }
  const search = splitList(settings.dnssearch);
  if (search.length > 0) {
    lines.push({ label: "search", value: search.join(", ") });
  }
  lines.push({
    label: "mtu",
    value:
      settings.mtu > 0
        ? String(settings.mtu)
        : live === null
          ? "0"
          : `0 (${String(live.mtu)})`,
  });
  return lines;
}

// ---- Writing back (0.9) ----------------------------------------------------------------------------

/** Whether two reads of an interface's settings are the same (1.4's "changed since"). */
export function sameSettings(a: IfaceSettings, b: IfaceSettings): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<
    keyof IfaceSettings
  >;
  for (const key of keys) {
    // The list's own flags are not settings: getInterface has neither, getInterfaceList both.
    if (key === "_used" || key === "_readonly") {
      continue;
    }
    if (key === "dnsnameservers" || key === "dnssearch") {
      // getInterface returns the lists comma-separated, getInterfaceList with spaces (18.2 #2).
      if (splitList(a[key]).join(",") !== splitList(b[key]).join(",")) {
        return false;
      }
      continue;
    }
    const x = a[key];
    const y = b[key];
    if (Array.isArray(x) || Array.isArray(y)) {
      if (JSON.stringify(x ?? []) !== JSON.stringify(y ?? [])) {
        return false;
      }
    } else if (x !== y) {
      return false;
    }
  }
  return true;
}

/** Whether the address part changes anything against the stored settings, field by field (as sent). */
export function changedFields(
  before: IfaceSettings,
  after: SetIfaceBase & Partial<IfaceSettings>,
): (keyof IfaceSettings)[] {
  const keys: (keyof IfaceSettings)[] = [
    "method",
    "address",
    "netmask",
    "gateway",
    "routemetric",
    "method6",
    "address6",
    "netmask6",
    "gateway6",
    "routemetric6",
    "dnsnameservers",
    "dnssearch",
    "mtu",
    "wol",
    "comment",
    "altmacaddress",
    "slaves",
    "bondprimary",
    "bondmode",
    "vlanid",
    "vlanrawdevice",
    "wpassid",
    "keymanagement",
    "band",
    "hidden",
  ];
  const norm = (key: keyof IfaceSettings, value: unknown): string => {
    if (key === "dnsnameservers" || key === "dnssearch") {
      return splitList(String(value ?? "")).join(",");
    }
    if (
      key === "address" ||
      key === "address6" ||
      key === "gateway" ||
      key === "gateway6"
    ) {
      const text = String(value ?? "").trim();
      return canonicalAddress(text) ?? text;
    }
    if (key === "altmacaddress") {
      return String(value ?? "")
        .trim()
        .toLowerCase();
    }
    return JSON.stringify(value ?? null);
  };
  return keys.filter(
    (key) =>
      key in after &&
      norm(key, before[key]) !==
        norm(key, (after as Partial<IfaceSettings>)[key]),
  );
}

/**
 * The address part's fields as sent: the dotted mask OMV stores, `netmask6` an integer, the lists as
 * OMV accepts them. A field the reader did not change keeps the value read (read, change, write).
 */
export function addressFields(
  draft: AddressDraft,
  read: IfaceSettings | null,
): Omit<SetIfaceBase, "uuid" | "devicename"> {
  const prefix = parseNetworkSize(draft.size);
  const prefix6 = parsePrefix6(draft.prefix6);
  const mtu = mtuOf(draft.mtu, draft.method6);
  const keep = <K extends keyof SetIfaceBase>(
    key: K,
    value: SetIfaceBase[K],
  ): SetIfaceBase[K] =>
    read !== null && JSON.stringify(read[key]) === JSON.stringify(value)
      ? read[key]
      : value;
  // The contract takes the lists comma-separated without spaces only, whatever was read (getInterface
  // gives commas, getInterfaceList and the set…Iface replies spaces).
  const list = (text: string) => commaList(text);
  return {
    method: draft.method,
    address: draft.address.trim(),
    netmask:
      prefix === null
        ? (read?.netmask ?? "")
        : read !== null && prefixFromMask(read.netmask) === prefix
          ? read.netmask
          : maskText(prefix),
    gateway: draft.gateway.trim(),
    routemetric: keep("routemetric", metricOf(draft.routemetric) ?? 0),
    method6: draft.method6,
    address6: draft.address6.trim(),
    netmask6: prefix6 ?? read?.netmask6 ?? 64,
    gateway6: draft.gateway6.trim(),
    routemetric6: keep("routemetric6", metricOf(draft.routemetric6) ?? 1),
    dnsnameservers: list(draft.dnsnameservers),
    dnssearch: list(draft.dnssearch),
    mtu: mtu ?? 0,
    wol: draft.wol,
    comment: draft.comment,
  };
}

const assertChecked = (problems: readonly unknown[], what: string) => {
  if (problems.length > 0) {
    throw new Error(`${what} was written without passing its checks.`);
  }
};

const base = (read: IfaceSettings | null, devicename: string) => ({
  uuid: read?.uuid ?? NEW_OBJECT_UUID,
  devicename: read?.devicename ?? devicename,
});

/** Network.setEthernetIface: `read` is getInterface's object read just before, or null for a new port. */
export function ethernetRequest(
  read: IfaceSettings | null,
  devicename: string,
  draft: AddressDraft,
  context: AddressCheckContext,
): SetEthernetIfaceRequest {
  assertChecked(checkAddresses(draft, context), "A network port's settings");
  return {
    ...base(read, devicename),
    ...addressFields(draft, read),
    altmacaddress: draft.altmacaddress.trim().toLowerCase(),
  };
}

/** A list as the contract takes it: comma-separated, no spaces (VM fact: replies use spaces). */
export const commaList = (text: string): string => splitList(text).join(",");

const BOND_MODE_VALUES: readonly BondMode[] = [0, 1, 2, 3, 4, 5, 6];
const HASH_POLICIES: readonly HashPolicy[] = [
  "layer2",
  "layer2+3",
  "layer3+4",
  "encap2+3",
  "encap3+4",
];

/** A stored bond mode as the contract takes it, or null for one OMV does not write. */
export const bondModeOf = (mode: number): BondMode | null =>
  BOND_MODE_VALUES.find((m) => m === mode) ?? null;

/** The transmit hash policy to send: the one read when it is one of OMV's five, otherwise layer2. */
export const hashPolicyOf = (policy: string | undefined): HashPolicy =>
  HASH_POLICIES.find((p) => p === policy) ??
  NEW_BOND_TIMING.bondtransmithashpolicy;

/** The classic form's bond defaults for a new bond (0.9, D5). */
export const NEW_BOND_TIMING = {
  bondmiimon: 100,
  bonddowndelay: 0,
  bondupdelay: 0,
  bondtransmithashpolicy: "layer2",
} as const;

/** Network.setBondIface; a new bond's `devicename` is empty (OMV chooses the next bond name). */
export function bondRequest(
  read: IfaceSettings | null,
  draft: AddressDraft & BondDraft,
  context: AddressCheckContext,
): SetBondIfaceRequest {
  assertChecked(
    [...checkAddresses(draft, context), ...checkBond(draft)],
    "A bond's settings",
  );
  return {
    ...base(read, ""),
    ...addressFields(draft, read),
    slaves: [...draft.slaves],
    bondprimary: draft.bondprimary.trim(),
    bondmode: draft.bondmode,
    bondmiimon: read?.bondmiimon ?? NEW_BOND_TIMING.bondmiimon,
    bonddowndelay: read?.bonddowndelay ?? NEW_BOND_TIMING.bonddowndelay,
    bondupdelay: read?.bondupdelay ?? NEW_BOND_TIMING.bondupdelay,
    // Required: OMV refuses a bond without one (observed on the VM); a new bond sends layer2.
    bondtransmithashpolicy: hashPolicyOf(read?.bondtransmithashpolicy),
  };
}

/** Network.setVlanIface; OMV names it {{parent}}.{{id}} itself. */
export function vlanRequest(
  read: IfaceSettings | null,
  draft: AddressDraft & { vlanrawdevice: string; vlanid: string },
  context: AddressCheckContext,
  stored: readonly IfaceSettings[],
): SetVlanIfaceRequest {
  const others =
    read === null ? stored : stored.filter((s) => s.uuid !== read.uuid);
  assertChecked(
    [...checkAddresses(draft, context), ...checkVlan(draft, others)],
    "A VLAN's settings",
  );
  const vlanid = Number(draft.vlanid.trim());
  return {
    ...base(read, vlanName(draft.vlanrawdevice, vlanid)),
    ...addressFields(draft, read),
    altmacaddress: draft.altmacaddress.trim().toLowerCase(),
    vlanid: read?.vlanid ?? vlanid,
    vlanrawdevice: read?.vlanrawdevice ?? draft.vlanrawdevice,
  };
}

/** Network.setBridgeIface; a new bridge's `devicename` is empty (OMV chooses the next br name). */
export function bridgeRequest(
  read: IfaceSettings | null,
  draft: AddressDraft & { slaves: readonly string[] },
  context: AddressCheckContext,
): SetBridgeIfaceRequest {
  assertChecked(checkAddresses(draft, context), "A bridge's settings");
  return {
    ...base(read, ""),
    ...addressFields(draft, read),
    slaves: [...draft.slaves],
  };
}

export interface WifiDraft {
  wpassid: string;
  /** Typed in this request (0.6): never one held. */
  wpapsk: string;
  keymanagement: KeyManagement;
  band: WifiBand;
  hidden: boolean;
}

/** Network.setWirelessIface, with the password typed for this request (0.6, P8). */
export function wifiRequest(
  read: IfaceSettings | null,
  devicename: string,
  draft: AddressDraft & WifiDraft,
  context: AddressCheckContext,
): SetWirelessIfaceRequest {
  assertChecked(
    [...checkAddresses(draft, context), ...checkWifi(draft)],
    "A Wi-Fi interface's settings",
  );
  return {
    ...base(read, devicename),
    ...addressFields(draft, read),
    altmacaddress: draft.altmacaddress.trim().toLowerCase(),
    wpassid: draft.wpassid,
    wpapsk: draft.wpapsk,
    keymanagement: draft.keymanagement,
    band: draft.band,
    hidden: draft.hidden,
  };
}

/** Network.deleteInterface: the `uuid` read for that interface (0.9). */
export const deleteRequest = (
  read: Pick<IfaceSettings, "uuid">,
): DeleteInterfaceRequest => ({
  uuid: read.uuid,
});

/** A stored interface's settings as its set method's request, under the identifier given. */
export type StoredRequest =
  | { type: "ethernet"; request: SetEthernetIfaceRequest }
  | { type: "bond"; request: SetBondIfaceRequest }
  | { type: "vlan"; request: SetVlanIfaceRequest }
  | { type: "bridge"; request: SetBridgeIfaceRequest }
  /** A Wi-Fi interface is written by wifiRequest, with the password typed again (0.6). */
  | { type: "wifi" };

function requestFromSettings(
  before: IfaceSettings,
  uuid: string,
): StoredRequest {
  const fields: SetIfaceBase = {
    uuid,
    devicename: before.devicename,
    method: before.method,
    address: before.address,
    netmask: before.netmask,
    gateway: before.gateway,
    routemetric: before.routemetric,
    method6: before.method6,
    address6: before.address6,
    netmask6: before.netmask6,
    gateway6: before.gateway6,
    routemetric6: before.routemetric6,
    dnsnameservers: commaList(before.dnsnameservers),
    dnssearch: commaList(before.dnssearch),
    mtu: before.mtu,
    wol: before.wol,
    comment: before.comment,
  };
  switch (before.type) {
    case "ethernet":
      return {
        type: "ethernet",
        request: { ...fields, altmacaddress: before.altmacaddress },
      };
    case "bond":
      return {
        type: "bond",
        request: {
          ...fields,
          slaves: [...before.slaves],
          bondprimary: before.bondprimary,
          bondmode: bondModeOf(before.bondmode) ?? BOND_MODES.backup,
          bondmiimon: before.bondmiimon,
          bonddowndelay: before.bonddowndelay,
          bondupdelay: before.bondupdelay,
          bondtransmithashpolicy: hashPolicyOf(before.bondtransmithashpolicy),
        },
      };
    case "vlan":
      return {
        type: "vlan",
        request: {
          ...fields,
          altmacaddress: before.altmacaddress,
          vlanid: before.vlanid,
          vlanrawdevice: before.vlanrawdevice,
        },
      };
    case "bridge":
      return {
        type: "bridge",
        request: { ...fields, slaves: [...before.slaves] },
      };
    case "wifi":
      return { type: "wifi" };
  }
}

/**
 * Put back a changed interface (1.7, "An interface changed"): the object as it was read before the
 * change, under its identifier. Never a password: a Wi-Fi interface goes through wifiRequest.
 */
export const restoreChanged = (before: IfaceSettings): StoredRequest =>
  requestFromSettings(before, before.uuid);

/**
 * Put back an interface whose settings were removed (1.7): its old object as new (a new identifier).
 * A new bond or bridge is named by OMV, so its old name is kept only for a port, Wi-Fi or VLAN.
 */
export function restoreAsNew(before: IfaceSettings): StoredRequest {
  const restored = requestFromSettings(before, NEW_OBJECT_UUID);
  switch (restored.type) {
    case "bond":
      return { type: "bond", request: { ...restored.request, devicename: "" } };
    case "bridge":
      return {
        type: "bridge",
        request: { ...restored.request, devicename: "" },
      };
    case "ethernet":
    case "vlan":
    case "wifi":
      return restored;
  }
}

/** The family of an address field (for the page's "IPv4" / "IPv6" words). */
export const familyWord = (family: Family): "IPv4" | "IPv6" =>
  family === 4 ? "IPv4" : "IPv6";
