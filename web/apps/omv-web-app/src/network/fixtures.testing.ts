// SPDX-License-Identifier: GPL-3.0-or-later
// Builders for the network modules' tests only (never imported by the app). Documentation values
// only: 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 2001:db8::/32, 00:00:5e:00:53:xx, NAS_HOST.
import type { Connection, PageLocation } from "./connection.ts";
import type { DeviceRow, FirewallRule, IfaceSettings } from "./dto.ts";
import { blankSettings } from "./ifaceModel.ts";

let counter = 0;
const uuid = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
};

/** A row of enumerateDevicesList: an Ethernet port with settings, up, no address. */
export const device = (
  devicename: string,
  over: Partial<DeviceRow> = {},
): DeviceRow => ({
  uuid: uuid(),
  devicename,
  type: "ethernet",
  method: "dhcp",
  method6: "manual",
  address: "",
  netmask: "",
  prefix: -1,
  gateway: "",
  address6: "",
  prefix6: -1,
  gateway6: "",
  ether: "00:00:5e:00:53:01",
  mtu: "1500",
  state: "UP",
  link: true,
  speed: 1000,
  vlanid: -1,
  _readonly: false,
  slaves: [],
  ...over,
});

/** A device without settings ("Not set up here"). */
export const bare = (
  devicename: string,
  over: Partial<DeviceRow> = {},
): DeviceRow => {
  const {
    method: _method,
    method6: _method6,
    ...rest
  } = device(devicename, over);
  return { ...rest, uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4", ...over };
};

/** Stored settings (getInterface): an Ethernet port, IPv4 automatic, IPv6 off, the classic defaults. */
export const settings = (
  devicename: string,
  over: Partial<IfaceSettings> = {},
): IfaceSettings => ({
  ...blankSettings(devicename, "ethernet"),
  uuid: uuid(),
  ...over,
});

export const loc = (
  hostname: string,
  protocol = "http:",
  port = "",
): PageLocation => ({ protocol, hostname, port });

/** A firewall rule: coming in, any kind, any port, any computer, no action. */
export const rule = (over: Partial<FirewallRule> = {}): FirewallRule => ({
  uuid: uuid(),
  rulenum: 0,
  chain: "INPUT",
  action: "ACCEPT",
  family: "inet",
  source: "",
  sport: "",
  destination: "",
  dport: "",
  protocol: "tcp",
  extraoptions: "",
  comment: "",
  ...over,
});

/** A numbered list of rules, in order. */
export const rules = (...list: Partial<FirewallRule>[]): FirewallRule[] =>
  list.map((over, rulenum) => rule({ rulenum, ...over }));

/** A Known connection at 192.0.2.10 through enp2s0 on 192.0.2.0/24. */
export const KNOWN: Connection = {
  kind: "known",
  host: "192.0.2.10",
  iface: "enp2s0",
  address: "192.0.2.10",
  family: 4,
  network: { family: 4, start: 0xc0000200n, prefix: 24 },
  under: [],
};
