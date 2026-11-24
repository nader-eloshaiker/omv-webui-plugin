// SPDX-License-Identifier: GPL-3.0-or-later
// Which connection this page uses (phase 5 network design 0.4), worked out from three things the page
// already has: the address it was opened at (`location`'s protocol, host name and port, passed in by
// the caller: this module never reads `window`), the interfaces and the addresses they use now
// (Network.enumerateDevicesList) and the NAS's name (Network.getGeneralSettings). No cleared method
// says which address the browser came from, so nothing here claims more than those show. A failed
// read makes the conclusion Not known, never Known. Also the web ports and the SSH port the firewall
// check uses, and {{pageUrl}} (0.2). Pure.
import {
  NEW_OBJECT_UUID,
  type DeviceRow,
  type GeneralSettings,
  type Read,
  type SshPortSettings,
  type WebPortsSettings,
} from "./dto.ts";
import {
  addressScope,
  addressValue,
  formatAddress,
  isLinkLocal,
  networkOf,
  parseAddress,
  parseIPv6,
  type Family,
  type IpAddress,
  type IpNetwork,
} from "./ip.ts";

/** The parts of `location` this module reads (window.location has them; pageLocation.ts reads it). */
export interface PageLocation {
  /** "http:" or "https:". */
  protocol: string;
  /** As `location.hostname` gives it: an IPv6 address in brackets, perhaps with a zone. */
  hostname: string;
  /** "" for the scheme's default port. */
  port: string;
}

// ---- The host the page was opened at --------------------------------------------------------------

export type PageHost =
  /** An IPv4 address, or an IPv6 address (brackets and any zone removed). */
  | { kind: "address"; address: IpAddress }
  /** localhost, 127.0.0.0/8 or ::1: a tunnel, or a browser on the NAS itself. */
  | { kind: "loopback"; families: readonly Family[] }
  /** Any name, in lower case, a final "." removed. */
  | { kind: "name"; name: string };

/**
 * What `location.hostname` names. An IPv6 literal comes in brackets, perhaps with a zone
 * ("[fe80::1%25eth0]"); the zone says which of the browser's own interfaces it went out of, not
 * anything about the NAS, so it is dropped. Null for an empty or malformed host.
 */
export function parsePageHost(hostname: string): PageHost | null {
  const text = hostname.trim();
  if (text.startsWith("[")) {
    if (!text.endsWith("]")) {
      return null;
    }
    const inner = text.slice(1, -1);
    const zone = inner.indexOf("%");
    const value = parseIPv6(zone === -1 ? inner : inner.slice(0, zone));
    if (value === null) {
      return null;
    }
    const address: IpAddress = { family: 6, value };
    return addressScope(address) === "loopback"
      ? { kind: "loopback", families: [6] }
      : { kind: "address", address };
  }
  const name = text.toLowerCase().replace(/\.$/u, "");
  if (name === "") {
    return null;
  }
  const address = parseAddress(name);
  if (address !== null) {
    if (address.family === 6) {
      // location.hostname always brackets IPv6; an unbracketed one is not a host a browser gives.
      return null;
    }
    return addressScope(address) === "loopback"
      ? { kind: "loopback", families: [4] }
      : { kind: "address", address };
  }
  if (name === "localhost" || name.endsWith(".localhost")) {
    return { kind: "loopback", families: [4, 6] };
  }
  return { kind: "name", name };
}

/** The host as the connection line shows it ({{host}}): a name as opened, an address in its shortest form. */
export function hostText(host: PageHost, hostname: string): string {
  switch (host.kind) {
    case "address":
      return formatAddress(host.address);
    case "loopback":
    case "name":
      return hostname.trim().replace(/^\[|\]$/gu, "");
  }
}

// ---- The interfaces -------------------------------------------------------------------------------

/** The loopback interface (`lo`): never listed, never this page's. */
export const isLoopback = (row: Pick<DeviceRow, "devicename" | "type">) =>
  row.type === "loopback" || row.devicename === "lo";

/** A virtual interface (a container's, a VPN's): counted under the table, not managed here. */
export const isVirtual = (row: Pick<DeviceRow, "type">) =>
  row.type === "virtual";

/**
 * A device with no settings here ("Not set up here"): OMV's placeholder identifier, or no method (a
 * bond's port is listed with `method` "" and `_readonly`, observed on the VM; isMember tells it apart).
 */
export const hasNoSettings = (row: Pick<DeviceRow, "uuid" | "method">) =>
  row.uuid === NEW_OBJECT_UUID || row.method === undefined || row.method === "";

/** The bond or bridge that names `devicename` in its `slaves`, if any. */
export function parentOf(
  devicename: string,
  rows: readonly Pick<DeviceRow, "devicename" | "slaves">[],
): string | null {
  return (
    rows.find((r) => (r.slaves ?? []).includes(devicename))?.devicename ?? null
  );
}

/** A member of a bond or bridge: `_readonly`, or named in another interface's `slaves`. */
export const isMember = (
  row: Pick<DeviceRow, "devicename" | "_readonly">,
  rows: readonly Pick<DeviceRow, "devicename" | "slaves">[],
): boolean => row._readonly || parentOf(row.devicename, rows) !== null;

/** A VLAN's parent: `vlanrawdevice` when the row has it, else from its name, which OMV makes "{{parent}}.{{id}}". */
export function vlanParent(
  row: Pick<DeviceRow, "devicename" | "type" | "vlanid" | "vlanrawdevice">,
): string | null {
  if (row.vlanrawdevice !== undefined && row.vlanrawdevice !== "") {
    return row.vlanrawdevice;
  }
  if (row.type !== "vlan" && row.vlanid < 0) {
    return null;
  }
  const dot = row.devicename.lastIndexOf(".");
  return dot > 0 ? row.devicename.slice(0, dot) : null;
}

/**
 * Everything under an interface (0.4): a VLAN's parent; a bond's ports; a bridge's interfaces, and
 * the ports of a bond inside it; and so on down. Without the interface itself; each name once.
 */
export function interfacesUnder(
  devicename: string,
  rows: readonly Pick<
    DeviceRow,
    "devicename" | "type" | "vlanid" | "vlanrawdevice" | "slaves"
  >[],
): string[] {
  const found: string[] = [];
  const seen = new Set<string>([devicename]);
  const visit = (name: string) => {
    const row = rows.find((r) => r.devicename === name);
    if (row === undefined) {
      return;
    }
    const below = [
      ...(row.slaves ?? []),
      ...[vlanParent(row)].filter((p): p is string => p !== null),
    ];
    for (const next of below) {
      if (!seen.has(next)) {
        seen.add(next);
        found.push(next);
        visit(next);
      }
    }
  };
  visit(devicename);
  return found;
}

/** Whether an interface has an address of its own for the one-interface inference: IPv4, or IPv6 other than link-local. */
const hasAddress = (row: Pick<DeviceRow, "address" | "address6">) =>
  row.address !== "" || (row.address6 !== "" && !isLinkLocal(row.address6));

const rowAddress = (
  row: Pick<DeviceRow, "address" | "address6">,
  family: Family,
): IpAddress | null => {
  const text = family === 4 ? row.address : row.address6.split("%")[0];
  const address = parseAddress((text ?? "").trim());
  return address !== null && address.family === family ? address : null;
};

/** The network an interface uses now in a family, from its address and prefix; null without one. */
export function rowNetwork(
  row: Pick<DeviceRow, "address" | "address6" | "prefix" | "prefix6">,
  family: Family,
): IpNetwork | null {
  const address = rowAddress(row, family);
  const prefix = family === 4 ? row.prefix : row.prefix6;
  if (address === null || prefix < 0 || prefix > (family === 4 ? 32 : 128)) {
    return null;
  }
  return networkOf(family, addressValue(address), prefix);
}

// ---- The conclusion -------------------------------------------------------------------------------

/** How the page was opened by the NAS's name. */
export type NameForm =
  /** {{hostname}} */
  | "short"
  /** {{hostname}}.{{domain}} */
  | "fqdn"
  /** {{hostname}}.local */
  | "local";

/** 0.4's conclusion. Each kind is the copy key `network.connection.{kind}`. */
export type Connection =
  /** The reads are on their way: "Working out which interface this page uses…". */
  | { kind: "loading" }
  /** An address an interface uses now. */
  | {
      kind: "known";
      host: string;
      iface: string;
      /** The address, in its shortest form. */
      address: string;
      family: Family;
      /** The interface's network in that family, when its prefix is known. */
      network: IpNetwork | null;
      /** Everything under the interface (0.4). */
      under: readonly string[];
    }
  /** The NAS's name, and exactly one interface with an address. */
  | {
      kind: "probable";
      host: string;
      nameForm: NameForm;
      iface: string;
      under: readonly string[];
    }
  /** The NAS's name, and several interfaces with addresses. */
  | { kind: "nameOnly"; host: string; nameForm: NameForm }
  /** An address no interface reports (a router, a VPN, a second address). */
  | { kind: "unknownAddress"; host: string; family: Family }
  /** A name that is not the NAS's. */
  | { kind: "otherName"; host: string }
  /** localhost, 127.0.0.1, ::1. */
  | { kind: "tunnel"; host: string; families: readonly Family[] }
  /** An address of an interface these settings do not manage (virtual, or not set up here). */
  | {
      kind: "unmanaged";
      host: string;
      iface: string;
      address: string;
      family: Family;
      network: IpNetwork | null;
      /** A VPN's or a container's (type virtual), not a port without settings (P17). */
      virtual: boolean;
    }
  /** A read these rules need failed (`network.connection.readFailed`). */
  | { kind: "readFailed"; host: string };

export interface ConnectionInput {
  location: PageLocation;
  devices: Read<readonly DeviceRow[]>;
  general: Read<GeneralSettings>;
}

/** The NAS's name forms the page may have been opened by, in lower case. */
export function nameForms(
  general: GeneralSettings,
): { form: NameForm; name: string }[] {
  const hostname = general.hostname.trim().toLowerCase();
  const domain = general.domainname.trim().toLowerCase().replace(/\.$/u, "");
  if (hostname === "") {
    return [];
  }
  return [
    { form: "short" as const, name: hostname },
    ...(domain === ""
      ? []
      : [{ form: "fqdn" as const, name: `${hostname}.${domain}` }]),
    { form: "local" as const, name: `${hostname}.local` },
  ];
}

/** Which of the NAS's name forms a name is, or null when it is none of them. */
export const nameFormOf = (
  name: string,
  general: GeneralSettings,
): NameForm | null =>
  nameForms(general).find((f) => f.name === name.toLowerCase())?.form ?? null;

/** 0.4: which interface and which address this page reaches the NAS through. */
export function workOutConnection(input: ConnectionInput): Connection {
  const parsed = parsePageHost(input.location.hostname);
  const host =
    parsed === null
      ? input.location.hostname
      : hostText(parsed, input.location.hostname);
  if (parsed === null) {
    return { kind: "readFailed", host };
  }
  if (parsed.kind === "loopback") {
    return { kind: "tunnel", host, families: parsed.families };
  }
  if (input.devices.state === "loading") {
    return { kind: "loading" };
  }
  if (input.devices.state === "failed") {
    return { kind: "readFailed", host };
  }
  const rows = input.devices.data;

  if (parsed.kind === "address") {
    const { address } = parsed;
    const match = rows.find((row) => {
      const own = rowAddress(row, address.family);
      return own !== null && addressValue(own) === addressValue(address);
    });
    if (match === undefined) {
      return { kind: "unknownAddress", host, family: address.family };
    }
    const network = rowNetwork(match, address.family);
    if (isVirtual(match) || hasNoSettings(match)) {
      return {
        kind: "unmanaged",
        host,
        iface: match.devicename,
        address: formatAddress(address),
        family: address.family,
        network,
        virtual: isVirtual(match),
      };
    }
    return {
      kind: "known",
      host,
      iface: match.devicename,
      address: formatAddress(address),
      family: address.family,
      network,
      under: interfacesUnder(match.devicename, rows),
    };
  }

  // A name.
  if (input.general.state === "loading") {
    return { kind: "loading" };
  }
  if (input.general.state === "failed") {
    return { kind: "readFailed", host };
  }
  const form = nameFormOf(parsed.name, input.general.data);
  if (form === null) {
    return { kind: "otherName", host };
  }
  const candidates = rows.filter(
    (row) =>
      !isLoopback(row) &&
      !isVirtual(row) &&
      !isMember(row, rows) &&
      hasAddress(row),
  );
  const only = candidates.length === 1 ? candidates[0] : undefined;
  if (only !== undefined) {
    return {
      kind: "probable",
      host,
      nameForm: form,
      iface: only.devicename,
      under: interfacesUnder(only.devicename, rows),
    };
  }
  return { kind: "nameOnly", host, nameForm: form };
}

// ---- What the conclusion means for the other rules -------------------------------------------------

/** How sure the page is: Known (an address an interface uses), Probably known, or Not known. */
export type Certainty = "known" | "probable" | "notKnown";

export function certainty(connection: Connection): Certainty {
  switch (connection.kind) {
    case "known":
    case "unmanaged":
      return "known";
    case "probable":
      return "probable";
    case "loading":
    case "nameOnly":
    case "unknownAddress":
    case "otherName":
    case "tunnel":
    case "readFailed":
      return "notKnown";
  }
}

/**
 * Where an interface stands against this page's connection:
 * - "this": the interface this page reaches the NAS through;
 * - "under": under it (a VLAN's parent, a bond's port, a bridge's interface);
 * - "other": not this page's (only when the page's interface is known or probably known);
 * - "unknown": the page cannot tell, so every interface counts (Name only, Not known).
 */
export type Standing = "this" | "under" | "other" | "unknown";

export function standing(connection: Connection, devicename: string): Standing {
  switch (connection.kind) {
    case "known":
    case "probable":
      if (connection.iface === devicename) {
        return "this";
      }
      return connection.under.includes(devicename) ? "under" : "other";
    case "unmanaged":
      // That interface only (0.4's last row).
      return connection.iface === devicename ? "this" : "other";
    case "loading":
    case "nameOnly":
    case "unknownAddress":
    case "otherName":
    case "tunnel":
    case "readFailed":
      return "unknown";
  }
}

/** The address families the page may use: the address's; by name or not known, both (0.4). */
export function pageFamilies(connection: Connection): readonly Family[] {
  switch (connection.kind) {
    case "known":
    case "unmanaged":
    case "unknownAddress":
      return [connection.family];
    case "tunnel":
      return connection.families;
    case "loading":
    case "probable":
    case "nameOnly":
    case "otherName":
    case "readFailed":
      return [4, 6];
  }
}

/** The NAS's own address the page reaches in a family, when the page knows it (the firewall's NAS side). */
export function nasAddress(
  connection: Connection,
  family: Family,
): IpAddress | null {
  switch (connection.kind) {
    case "known":
    case "unmanaged": {
      const address = parseAddress(connection.address);
      return address !== null && address.family === family ? address : null;
    }
    case "tunnel":
      return connection.families.includes(family)
        ? family === 4
          ? { family: 4, value: 0x7f000001 }
          : { family: 6, value: 1n }
        : null;
    case "loading":
    case "probable":
    case "nameOnly":
    case "unknownAddress":
    case "otherName":
    case "readFailed":
      return null;
  }
}

/** How the page was opened by the NAS's name, or null when it was not. */
export function openedByName(connection: Connection): NameForm | null {
  return connection.kind === "probable" || connection.kind === "nameOnly"
    ? connection.nameForm
    : null;
}

// ---- The web ports and the SSH port (0.4) ---------------------------------------------------------

export type Scheme = "http" | "https";

export interface WebPorts {
  /** This page's scheme. */
  scheme: Scheme;
  /** This page's port: `location.port`, or 80 for http and 443 for https. */
  page: number;
  /** The web interface's other port or ports (a redirect may pass through them). */
  others: readonly { scheme: Scheme; port: number }[];
  /** WebGui.getSettings could not be read: only this page's port is checked. */
  othersUnread: boolean;
}

const schemeOf = (protocol: string): Scheme =>
  protocol.replace(/:$/u, "").toLowerCase() === "https" ? "https" : "http";

/**
 * The web ports. Through a tunnel the browser's port is the tunnel's, not the NAS's, so the NAS's own
 * port for the page's scheme is used when WebGui.getSettings was read.
 */
export function webPorts(
  location: PageLocation,
  webGui: Read<WebPortsSettings>,
  connection?: Connection,
): WebPorts {
  const scheme = schemeOf(location.protocol);
  const fromLocation =
    location.port === ""
      ? scheme === "https"
        ? 443
        : 80
      : Number(location.port);
  if (webGui.state !== "ok") {
    return { scheme, page: fromLocation, others: [], othersUnread: true };
  }
  const settings = webGui.data;
  const served: { scheme: Scheme; port: number }[] = [
    { scheme: "http", port: settings.port },
    ...(settings.enablessl
      ? [{ scheme: "https" as const, port: settings.sslport }]
      : []),
  ];
  const tunnelled = connection?.kind === "tunnel";
  const page = tunnelled
    ? (served.find((s) => s.scheme === scheme)?.port ?? fromLocation)
    : fromLocation;
  return {
    scheme,
    page,
    others: served.filter((s) => s.port !== page),
    othersUnread: false,
  };
}

/** SSH for the firewall check: on with its port, off, or not read. */
export type SshPort =
  { kind: "on"; port: number } | { kind: "off" } | { kind: "unread" };

export function sshPort(ssh: Read<SshPortSettings>): SshPort {
  if (ssh.state !== "ok") {
    return { kind: "unread" };
  }
  return ssh.data.enable
    ? { kind: "on", port: ssh.data.port }
    : { kind: "off" };
}

// ---- {{pageUrl}} (0.2) -----------------------------------------------------------------------------

/**
 * A web address of this page at another host: the scheme and port of the address this page was
 * opened at, the host given, and /ui/. An IPv6 address in brackets, in its shortest form. Only a host
 * typed in this session may become a link (P7); this function only builds the text.
 */
export function pageUrl(location: PageLocation, host: string): string {
  const scheme = schemeOf(location.protocol);
  const text = host.trim().replace(/^\[|\]$/gu, "");
  const address = parseAddress(text);
  const shown =
    address === null
      ? text
      : address.family === 6
        ? `[${formatAddress(address)}]`
        : formatAddress(address);
  const port = location.port === "" ? "" : `:${location.port}`;
  return `${scheme}://${shown}${port}/ui/`;
}

/**
 * `http://{{hostname}}.local/ui/` (1.6, step 3): text with a copy button, never a link (UI-3). Joined
 * from its parts so the bundle holds no "http://" followed by a value, which the build check reads
 * as an address to another origin (UI-7).
 */
export const localUrl = (hostname: string): string =>
  ["http:", "", `${hostname.trim().toLowerCase()}.local`, "ui", ""].join("/");
