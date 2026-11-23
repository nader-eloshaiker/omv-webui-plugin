// SPDX-License-Identifier: GPL-3.0-or-later
// Addresses, networks, ranges and computer names (phase 5 network design 0.2, 5.3, 11.2, 16.3), shared
// with services/clientRules.ts, which keeps its own checks and uses these. Pure: no network, no window.
//
// - IPv4 is read without leading zeros ("010" is refused, as the contract's patterns do);
// - IPv6 is read as eight groups, or fewer with one "::"; no zone and no dotted IPv4 tail (a zone is
//   removed by the caller that knows it is one, such as the page's own address in connection.ts);
// - IPv6 is printed in its shortest form (RFC 5952): lower case, the longest run of two or more zero
//   groups as "::", the first of equal runs;
// - a network is "address/prefix" (the prefix as digits, no leading zero); a range is "first-last" of
//   one family with the first not after the last.

/** An address family. */
export type Family = 4 | 6;

/** An address of either family. IPv4 is held as a number, IPv6 as a bigint. */
export type IpAddress =
  { family: 4; value: number } | { family: 6; value: bigint };

/** A network: its first address and its prefix length. */
export interface IpNetwork {
  family: Family;
  start: bigint;
  prefix: number;
}

/** A range of addresses, first to last, both included. */
export interface IpRange {
  family: Family;
  first: bigint;
  last: bigint;
}

/** The number of bits of an address of a family. */
export const addressBits = (family: Family): 32 | 128 =>
  family === 4 ? 32 : 128;

// ---- Addresses -----------------------------------------------------------------------------------

const OCTET = "(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])";
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`, "u");
const HEX_GROUP = /^[0-9A-Fa-f]{1,4}$/u;
/** A prefix as written: digits, no leading zero. */
const PREFIX_TEXT = /^(?:0|[1-9][0-9]{0,2})$/u;

/** An IPv4 address as a number, or null. No leading zeros ("010" is refused, as the contract does). */
export function parseIPv4(text: string): number | null {
  if (!IPV4.test(text)) {
    return null;
  }
  return text
    .split(".")
    .reduce((value, octet) => value * 256 + Number(octet), 0);
}

/**
 * An IPv6 address as a number, or null: eight groups of one to four hexadecimal digits, or fewer
 * with one "::" standing for the groups of zeros left out. No zone and no dotted IPv4 tail (the
 * contract's pattern takes neither).
 */
export function parseIPv6(text: string): bigint | null {
  // At most eight fields, so at most seven colons ("1:2:3:4:5:6:7::" is refused, as the contract does).
  if (!/^[0-9A-Fa-f:]+$/u.test(text) || (text.match(/:/gu)?.length ?? 0) > 7) {
    return null;
  }
  const halves = text.split("::");
  if (halves.length > 2) {
    return null;
  }
  const split = (part: string | undefined) =>
    part === undefined || part === "" ? [] : part.split(":");
  const head = split(halves[0]);
  const tail = split(halves[1]);
  const groups = [...head, ...tail];
  if (!groups.every((g) => HEX_GROUP.test(g))) {
    return null;
  }
  if (halves.length === 1 ? groups.length !== 8 : groups.length > 7) {
    return null;
  }
  const all = [
    ...head,
    ...Array.from({ length: 8 - groups.length }, () => "0"),
    ...tail,
  ];
  return all.reduce(
    (value, group) => (value << 16n) | BigInt(Number.parseInt(group, 16)),
    0n,
  );
}

/** An IPv4 address written back in dotted form. */
export function formatIPv4(value: number): string {
  return [24, 16, 8, 0]
    .map((shift) => String(Math.floor(value / 2 ** shift) % 256))
    .join(".");
}

/** An IPv6 address in its shortest form (RFC 5952): lower case, the longest run of zeros as "::". */
export function formatIPv6(value: bigint): string {
  const groups = Array.from({ length: 8 }, (_, i) =>
    Number((value >> BigInt((7 - i) * 16)) & 0xffffn),
  );
  // The longest run of two or more zero groups, the first of equal runs.
  let best = { start: -1, length: 0 };
  let run = { start: -1, length: 0 };
  groups.forEach((group, i) => {
    if (group === 0) {
      run =
        run.start === -1
          ? { start: i, length: 1 }
          : { ...run, length: run.length + 1 };
      if (run.length > best.length) {
        best = run;
      }
    } else {
      run = { start: -1, length: 0 };
    }
  });
  const hex = groups.map((g) => g.toString(16));
  if (best.length < 2) {
    return hex.join(":");
  }
  const before = hex.slice(0, best.start).join(":");
  const after = hex.slice(best.start + best.length).join(":");
  return `${before}::${after}`;
}

/** An address of either family, or null. */
export function parseAddress(text: string): IpAddress | null {
  const v4 = parseIPv4(text);
  if (v4 !== null) {
    return { family: 4, value: v4 };
  }
  const v6 = parseIPv6(text);
  return v6 === null ? null : { family: 6, value: v6 };
}

/** An address of a family held as a bigint, printed (IPv6 in its shortest form). */
export const formatBits = (family: Family, value: bigint): string =>
  family === 4 ? formatIPv4(Number(value)) : formatIPv6(value);

/** An address printed in its canonical form (0.2). */
export const formatAddress = (address: IpAddress): string =>
  address.family === 4 ? formatIPv4(address.value) : formatIPv6(address.value);

/** An address's value as a bigint, whatever its family. */
export const addressValue = (address: IpAddress): bigint =>
  BigInt(address.value);

/** The address written in its canonical form, or null when it is not one (2001:DB8::1 → 2001:db8::1). */
export function canonicalAddress(text: string): string | null {
  const address = parseAddress(text.trim());
  return address === null ? null : formatAddress(address);
}

/** Whether two texts are the same address (case and IPv6 shortening aside); false when either is not one. */
export function sameAddress(a: string, b: string): boolean {
  const x = parseAddress(a.trim());
  const y = parseAddress(b.trim());
  return (
    x !== null &&
    y !== null &&
    x.family === y.family &&
    addressValue(x) === addressValue(y)
  );
}

// ---- What an address is (5.3's reserved addresses) ------------------------------------------------

export type AddressScope =
  /** 0.0.0.0 or :: */
  | "unspecified"
  /** 127.0.0.0/8 or ::1 */
  | "loopback"
  /** 224.0.0.0/4 or ff00::/8 */
  | "multicast"
  /** 169.254.0.0/16 or fe80::/10 */
  | "linkLocal"
  /** 255.255.255.255 */
  | "broadcast"
  /** Anything else, private networks included. */
  | "other";

const within = (value: bigint, family: Family, text: string, prefix: number) =>
  (value & maskOf(family, prefix)) ===
  (family === 4 ? BigInt(parseIPv4(text) ?? 0) : (parseIPv6(text) ?? 0n));

/** What kind of address this is. */
export function addressScope(address: IpAddress): AddressScope {
  const value = addressValue(address);
  if (address.family === 4) {
    if (value === 0n) {
      return "unspecified";
    }
    if (value === 0xffffffffn) {
      return "broadcast";
    }
    if (within(value, 4, "127.0.0.0", 8)) {
      return "loopback";
    }
    if (within(value, 4, "224.0.0.0", 4)) {
      return "multicast";
    }
    if (within(value, 4, "169.254.0.0", 16)) {
      return "linkLocal";
    }
    return "other";
  }
  if (value === 0n) {
    return "unspecified";
  }
  if (value === 1n) {
    return "loopback";
  }
  if (within(value, 6, "ff00::", 8)) {
    return "multicast";
  }
  if (within(value, 6, "fe80::", 10)) {
    return "linkLocal";
  }
  return "other";
}

/** Whether the text is an IPv6 link-local address (fe80::/10), labelled "(this network only)" (0.2). */
export function isLinkLocal(text: string): boolean {
  const address = parseAddress(text.trim());
  return address !== null && addressScope(address) === "linkLocal";
}

// ---- Networks ------------------------------------------------------------------------------------

/** The mask of a prefix as a number of the family's width. */
export function maskOf(family: Family, prefix: number): bigint {
  const bits = BigInt(addressBits(family));
  const all = (1n << bits) - 1n;
  return all ^ ((1n << (bits - BigInt(prefix))) - 1n);
}

/** The network an address belongs to at a prefix length. */
export const networkOf = (
  family: Family,
  value: bigint,
  prefix: number,
): IpNetwork => ({ family, start: value & maskOf(family, prefix), prefix });

/** "address/prefix" of either family with any prefix the family can hold, as written; or null. */
export function parseNetwork(
  text: string,
): { family: Family; address: bigint; prefix: number } | null {
  const parts = text.split("/");
  if (parts.length !== 2 || !PREFIX_TEXT.test(parts[1] ?? "")) {
    return null;
  }
  const prefix = Number(parts[1]);
  const address = parseAddress(parts[0] ?? "");
  if (address === null || prefix > addressBits(address.family)) {
    return null;
  }
  return { family: address.family, address: addressValue(address), prefix };
}

/** The network's first address. */
export const firstAddress = (network: IpNetwork): bigint => network.start;

/** The network's last address. */
export const lastAddress = (network: IpNetwork): bigint =>
  network.start |
  (((1n << BigInt(addressBits(network.family))) - 1n) ^
    maskOf(network.family, network.prefix));

/** "192.0.2.0/24" (0.2). */
export const formatNetwork = (network: IpNetwork): string =>
  `${formatBits(network.family, network.start)}/${String(network.prefix)}`;

/** Whether an address is in a network. */
export const inNetwork = (address: IpAddress, network: IpNetwork): boolean =>
  address.family === network.family &&
  (addressValue(address) & maskOf(network.family, network.prefix)) ===
    network.start;

/** Whether every address of `inner` is in `outer`. */
export const networkWithin = (inner: IpNetwork, outer: IpNetwork): boolean =>
  inner.family === outer.family &&
  inner.prefix >= outer.prefix &&
  (inner.start & maskOf(outer.family, outer.prefix)) === outer.start;

/**
 * The addresses of a network devices may use (5.2's readout, IPv4): between the network's own first
 * and last address for /30 and wider; both addresses of a /31; the one address of a /32. IPv6 has no
 * such addresses set aside here: every address of the network.
 */
export function hostRange(network: IpNetwork): {
  first: bigint;
  last: bigint;
  count: bigint;
} {
  const first = firstAddress(network);
  const last = lastAddress(network);
  if (network.family === 4 && network.prefix <= 30) {
    return { first: first + 1n, last: last - 1n, count: last - first - 1n };
  }
  return { first, last, count: last - first + 1n };
}

// ---- Network sizes (5.2: "24", "/24" or "255.255.255.0") ------------------------------------------

/** The prefix length of a dotted IPv4 mask, or null when the mask's ones are not contiguous. */
export function prefixFromMask(text: string): number | null {
  const value = parseIPv4(text);
  if (value === null) {
    return null;
  }
  const bits = BigInt(value);
  for (let prefix = 0; prefix <= 32; prefix += 1) {
    if (maskOf(4, prefix) === bits) {
      return prefix;
    }
  }
  return null;
}

/** The dotted IPv4 mask of a prefix length (OMV stores `netmask` so). */
export const maskText = (prefix: number): string =>
  formatIPv4(Number(maskOf(4, prefix)));

/** An IPv4 network size as typed: "24", "/24" or "255.255.255.0", from 1 to 32 (5.3); or null. */
export function parseNetworkSize(raw: string): number | null {
  const text = raw.trim();
  const digits = text.startsWith("/") ? text.slice(1) : text;
  if (/^[1-9][0-9]?$/u.test(digits)) {
    const prefix = Number(digits);
    return prefix <= 32 ? prefix : null;
  }
  if (text.startsWith("/")) {
    return null;
  }
  const prefix = prefixFromMask(text);
  return prefix === null || prefix === 0 ? null : prefix;
}

/** An IPv6 prefix length as typed, 1 to 128 (5.3); or null. */
export function parsePrefix6(raw: string | number): number | null {
  const text = String(raw).trim().replace(/^\//u, "");
  if (!/^[1-9][0-9]{0,2}$/u.test(text)) {
    return null;
  }
  const prefix = Number(text);
  return prefix <= 128 ? prefix : null;
}

// ---- Ranges --------------------------------------------------------------------------------------

export type RangeParse =
  | { ok: true; range: IpRange }
  /** Two addresses of one family, the first after the last ("fwRule.err.range"). */
  | { ok: false; reason: "order" }
  /** Not two addresses of one family separated by "-". */
  | { ok: false; reason: "form" };

/** "first-last" (11.2), both of one family, the first not after the last. */
export function parseRange(text: string): RangeParse {
  const parts = text.split("-");
  if (parts.length !== 2) {
    return { ok: false, reason: "form" };
  }
  const first = parseAddress((parts[0] ?? "").trim());
  const last = parseAddress((parts[1] ?? "").trim());
  if (first === null || last === null || first.family !== last.family) {
    return { ok: false, reason: "form" };
  }
  const a = addressValue(first);
  const b = addressValue(last);
  if (a > b) {
    return { ok: false, reason: "order" };
  }
  return { ok: true, range: { family: first.family, first: a, last: b } };
}

/** Whether an address is in a range. */
export const inRange = (address: IpAddress, range: IpRange): boolean =>
  address.family === range.family &&
  addressValue(address) >= range.first &&
  addressValue(address) <= range.last;

// ---- How many addresses (0.2's count) -------------------------------------------------------------

/** IPv6 networks of this prefix and wider are "very large" rather than counted. */
export const HUGE_IPV6_PREFIX = 64;

/** How many addresses a network holds: a count for IPv4, "huge" for IPv6 of /64 or wider. */
export function addressCount(
  family: Family,
  prefix: number,
): { kind: "count"; count: number } | { kind: "huge" } {
  if (family === 4) {
    return { kind: "count", count: 2 ** (32 - prefix) };
  }
  return prefix <= HUGE_IPV6_PREFIX
    ? { kind: "huge" }
    : { kind: "count", count: 2 ** (128 - prefix) };
}

// ---- Computer names ------------------------------------------------------------------------------

/** The longest computer name (DNS). */
export const NAME_MAX = 253;

const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;

/**
 * Whether `text` is one computer's name: labels of letters, digits and "-" (not at either end, at
 * most 63 each) separated by ".", at most 253 characters, no wildcard. A last label of digits only
 * is refused: no top-level domain is all digits, so "192.0.2.300" is a mistyped address, not a name.
 */
export function isComputerName(text: string): boolean {
  if (text === "" || text.length > NAME_MAX) {
    return false;
  }
  const labels = text.split(".");
  if (!labels.every((l) => LABEL.test(l))) {
    return false;
  }
  return !/^[0-9]+$/u.test(labels[labels.length - 1] ?? "");
}
