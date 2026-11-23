// SPDX-License-Identifier: GPL-3.0-or-later
// The server shapes the network modules read and write (phase 5 network design 0.9, 15.1), all from
// the generated DTOs (@omv-webui/ts-api-omv through the react-api-omv barrel): a Pick of the fields
// these modules read, and the generated request types for what they send. The one boundary step is
// toIfaceSettings, which narrows a stored interface's `type`, `method` and `method6` (open strings in
// the reply) to the values OMV writes, so the rules below can switch on them exhaustively.
import type {
  IptablesRule,
  IptablesRulesInet6Item,
  IptablesRulesInetItem,
  IptablesSetRuleRequest,
  IptablesSetRules6Request,
  IptablesSetRulesRequest,
  NetworkDevice,
  NetworkGeneralSettings,
  NetworkInterface,
  NetworkInterfaceRow,
  NetworkProxy,
  NetworkSetBondIfaceRequest,
  NetworkSetBondIfaceRequestBondmode,
  NetworkSetBondIfaceRequestBondtransmithashpolicy,
  NetworkSetBridgeIfaceRequest,
  NetworkSetEthernetIfaceRequest,
  NetworkSetEthernetIfaceRequestMethod,
  NetworkSetEthernetIfaceRequestMethod6,
  NetworkSetGeneralSettingsRequest,
  NetworkSetProxyRequest,
  NetworkSetVlanIfaceRequest,
  NetworkSetWirelessIfaceRequest,
  NetworkSetWirelessIfaceRequestBand,
  NetworkSetWirelessIfaceRequestKeymanagement,
  ObjectUuidRequest,
  SshSettings,
  WebGuiSettings,
} from "@omv-webui/react-api-omv/generated";

/** OMV's placeholder UUID that asks a set method to create an object, and marks a device without settings. */
export const NEW_OBJECT_UUID = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";

// ---- Reads already in the contract ---------------------------------------------------------------

/** A row of Network.enumerateDevicesList: what an interface uses now, with its stored fields when it has any. */
export type DeviceRow = Pick<
  NetworkDevice,
  | "uuid"
  | "devicename"
  | "address"
  | "netmask"
  | "prefix"
  | "gateway"
  | "address6"
  | "prefix6"
  | "gateway6"
  | "ether"
  | "mtu"
  | "state"
  | "link"
  | "speed"
  | "vlanid"
  | "_readonly"
> &
  Partial<
    Pick<NetworkDevice, "type" | "method" | "method6" | "slaves" | "wol">
  > & {
    /** A VLAN's parent, when the row carries it (stored settings); otherwise read from the name. */
    vlanrawdevice?: string;
  };

/** Network.getGeneralSettings. */
export type GeneralSettings = Pick<
  NetworkGeneralSettings,
  "hostname" | "domainname"
>;

/** WebGui.getSettings: the web interface's ports (0.4). */
export type WebPortsSettings = Pick<
  WebGuiSettings,
  "port" | "enablessl" | "sslport" | "forcesslonly"
>;

/** SSH.get: whether SSH is on and its port (0.4). */
export type SshPortSettings = Pick<SshSettings, "enable" | "port">;

// ---- Interface settings --------------------------------------------------------------------------

/** `type` of a stored interface. */
export type IfaceType = "ethernet" | "wifi" | "bond" | "vlan" | "bridge";
const IFACE_TYPES: readonly IfaceType[] = [
  "ethernet",
  "wifi",
  "bond",
  "vlan",
  "bridge",
];

/** How IPv4 is set up: Automatic (DHCP), Fixed address, Off. */
export type Method4 = NetworkSetEthernetIfaceRequestMethod;
/** How IPv6 is set up: Automatic (router announcements), Automatic (DHCPv6), Fixed address, Off. */
export type Method6 = NetworkSetEthernetIfaceRequestMethod6;
const METHODS4: readonly Method4[] = ["dhcp", "static", "manual"];
const METHODS6: readonly Method6[] = ["auto", "dhcp", "static", "manual"];

export type BondMode = NetworkSetBondIfaceRequestBondmode;
export type HashPolicy = NetworkSetBondIfaceRequestBondtransmithashpolicy;
export type WifiBand = NetworkSetWirelessIfaceRequestBand;
export type KeyManagement = NetworkSetWirelessIfaceRequestKeymanagement;

/**
 * An interface's stored settings, as Network.getInterface (NetworkInterface) and getInterfaceList
 * (NetworkInterfaceRow) return them, the Wi-Fi password as whether it is set (x-omv-presence), with
 * `type` and the two methods narrowed by toIfaceSettings.
 */
export type IfaceSettings = Omit<
  NetworkInterface,
  "type" | "method" | "method6"
> &
  Partial<Pick<NetworkInterfaceRow, "_used" | "_readonly">> & {
    type: IfaceType;
    method: Method4;
    method6: Method6;
  };

/**
 * The boundary: a stored interface narrowed to the values OMV writes, or null for one this page
 * cannot handle (a type or method OMV does not write); the page then leaves it to the classic
 * interface rather than guess.
 */
export function toIfaceSettings(
  dto: NetworkInterface | NetworkInterfaceRow,
): IfaceSettings | null {
  const type = IFACE_TYPES.find((t) => t === dto.type);
  const method = METHODS4.find((m) => m === dto.method);
  const method6 = METHODS6.find((m) => m === dto.method6);
  if (type === undefined || method === undefined || method6 === undefined) {
    return null;
  }
  return { ...dto, type, method, method6 };
}

/** The fields every set…Iface request sends (0.9, 15.1). */
export type SetIfaceBase = Pick<
  NetworkSetEthernetIfaceRequest,
  | "uuid"
  | "devicename"
  | "method"
  | "address"
  | "netmask"
  | "gateway"
  | "routemetric"
  | "method6"
  | "address6"
  | "netmask6"
  | "gateway6"
  | "routemetric6"
  | "dnsnameservers"
  | "dnssearch"
  | "mtu"
  | "wol"
  | "comment"
>;

export type SetEthernetIfaceRequest = NetworkSetEthernetIfaceRequest;
export type SetBondIfaceRequest = NetworkSetBondIfaceRequest;
export type SetVlanIfaceRequest = NetworkSetVlanIfaceRequest;
export type SetBridgeIfaceRequest = NetworkSetBridgeIfaceRequest;
export type SetWirelessIfaceRequest = NetworkSetWirelessIfaceRequest;
export type DeleteInterfaceRequest = ObjectUuidRequest;

// ---- Firewall rules ------------------------------------------------------------------------------

/** One rule, as Iptables.getRules, getRules6 and getRule return it. */
export type FirewallRule = IptablesRule;

/** Iptables.setRule's request (`rulenum` -1 adds at the end), for either list. */
export type SetRuleRequest = IptablesSetRuleRequest;

/** An item of Iptables.setRules (IPv4) or setRules6 (IPv6). */
export type RulesItem = IptablesRulesInetItem | IptablesRulesInet6Item;
export type SetRulesRequest = IptablesSetRulesRequest;
export type SetRules6Request = IptablesSetRules6Request;

// ---- The proxy -----------------------------------------------------------------------------------

/** The three proxies. */
export type ProxyKind = "http" | "https" | "ftp";

/** Network.getProxy's fifteen flattened fields, each password as whether it is set (x-omv-presence). */
export type ProxySettings = Pick<
  NetworkProxy,
  | "httpenable"
  | "httphost"
  | "httpport"
  | "httpusername"
  | "httppassword"
  | "httpsenable"
  | "httpshost"
  | "httpsport"
  | "httpsusername"
  | "httpspassword"
  | "ftpenable"
  | "ftphost"
  | "ftpport"
  | "ftpusername"
  | "ftppassword"
>;

export type SetProxyRequest = NetworkSetProxyRequest;
export type SetGeneralSettingsRequest = NetworkSetGeneralSettingsRequest;

// ---- A read ---------------------------------------------------------------------------------------

/** A read the rules need: its data, or that it failed (0.4, 0.8: a failed read is never "safe"). */
export type Read<T> =
  | { state: "ok"; data: T }
  | { state: "failed" }
  /** Still on its way. */
  | { state: "loading" };

export const ok = <T>(data: T): Read<T> => ({ state: "ok", data });
export const failed: Read<never> = { state: "failed" };
export const loading: Read<never> = { state: "loading" };
