// SPDX-License-Identifier: GPL-3.0-or-later
// Who may connect (phase 5 services design 0.4): the checks this interface makes before it sends a
// computer or a network to the NAS, for NFS entries and for rsync server folders. Pure.
//
// OMV stores the choice as free text and writes it into the server's configuration as it is; this
// interface only ever sends one of three forms, each also the contract's pattern (NetworkClient):
// - one computer: one IPv4 or IPv6 address, or one computer's name (letters, digits, "." and "-", at
//   most 253 characters, no wildcard);
// - one network: an IPv4 network from /8 to /32 or an IPv6 network from /16 to /128, written with
//   its first address (a pattern cannot check that; this file does, and suggests the right one);
// - any computer: "*".
// A stored value that is none of these (a wildcard, a netgroup, several entries) is "classic": shown
// as stored and replaced only when the reader chooses one of the three.

import {
  addressCount,
  formatBits,
  isComputerName,
  maskOf,
  parseAddress,
  parseNetwork,
  type Family,
} from "../network/ip.ts";

// The address and name parsing lives in network/ip.ts (phase 5 network design 16.3); these names
// stay exported here for the services pages that import them.
export {
  addressCount,
  formatIPv4,
  formatIPv6,
  isComputerName,
  NAME_MAX,
  parseAddress,
  parseIPv4,
  parseIPv6,
  type Family,
} from "../network/ip.ts";

/** The choices of the field (the library's ClientField), `null` while none is chosen. */
export type ClientChoice = "one" | "network" | "any" | "anyWithPassword";

export interface ClientValue {
  choice: ClientChoice | null;
  text: string;
}

/** Why a value is refused (0.4's checks); the page turns each into its sentence. */
export type ClientProblem =
  /** "Write one address, such as 192.0.2.10, or one computer name." */
  | { kind: "address" }
  /** "Write a network such as 192.0.2.0/24 or 2001:db8::/32." */
  | { kind: "network" }
  /** "Use a size from /8 to /32 for an IPv4 network, or /16 to /128 for IPv6." */
  | { kind: "prefix" }
  /** "A network of /0 is every computer. Choose Any computer instead." */
  | { kind: "zero" }
  /** "{{value}} is not the start of a network. Did you mean {{suggestion}}?" */
  | { kind: "start"; value: string; suggestion: string }
  /** Nothing is chosen (a value set in the classic interface, not yet replaced). */
  | { kind: "choose" };

/** What a valid value is. */
export type ClientForm =
  | { kind: "address"; family: Family }
  | { kind: "name" }
  | { kind: "network"; family: Family; prefix: number }
  | { kind: "any" }
  | { kind: "anyWithPassword" };

export type ClientCheck =
  | { ok: true; client: string; form: ClientForm }
  | { ok: false; problem: ClientProblem };

/** The prefix ranges 0.4 allows. */
export const PREFIX_RANGE = {
  4: { min: 8, max: 32 },
  6: { min: 16, max: 128 },
} as const satisfies Record<Family, { min: number; max: number }>;

// ---- Checks (on blur and on Save) -----------------------------------------------------------------

/** One computer: an address of either family, or a name. Surrounding spaces are not part of it. */
export function checkComputer(raw: string): ClientCheck {
  const text = raw.trim();
  const address = parseAddress(text);
  if (address !== null) {
    return {
      ok: true,
      client: text,
      form: { kind: "address", family: address.family },
    };
  }
  if (isComputerName(text)) {
    return { ok: true, client: text, form: { kind: "name" } };
  }
  return { ok: false, problem: { kind: "address" } };
}

/** "address/prefix" of either family, with any prefix the family can hold; or null. */
const parseNetworkLoose = parseNetwork;

const formatAddress = formatBits;

/** A prefix as written: digits, no leading zero (the contract's pattern takes none). */
const PREFIX_TEXT = /^(?:0|[1-9][0-9]{0,2})$/u;

/**
 * One network, written with its first address (0.4): the prefix in its family's range, not /0, and
 * no address bits set after the prefix (then the start of that network is suggested).
 */
export function checkNetwork(raw: string): ClientCheck {
  const text = raw.trim();
  const slash = text.split("/");
  if (slash.length === 2 && parseAddress(slash[0] ?? "") !== null) {
    const prefixText = slash[1] ?? "";
    if (prefixText === "0") {
      return { ok: false, problem: { kind: "zero" } };
    }
  }
  const network = parseNetworkLoose(text);
  if (network === null) {
    // A prefix of digits that the family cannot hold is a size out of range, not a malformed network.
    const address = parseAddress(slash[0] ?? "");
    return slash.length === 2 &&
      address !== null &&
      PREFIX_TEXT.test(slash[1] ?? "")
      ? { ok: false, problem: { kind: "prefix" } }
      : { ok: false, problem: { kind: "network" } };
  }
  const range = PREFIX_RANGE[network.family];
  if (network.prefix < range.min || network.prefix > range.max) {
    return { ok: false, problem: { kind: "prefix" } };
  }
  const start = network.address & maskOf(network.family, network.prefix);
  if (start !== network.address) {
    return {
      ok: false,
      problem: {
        kind: "start",
        value: text,
        suggestion: `${formatAddress(network.family, start)}/${String(network.prefix)}`,
      },
    };
  }
  return {
    ok: true,
    client: text,
    form: { kind: "network", family: network.family, prefix: network.prefix },
  };
}

/** The whole value of the field, as 0.4 checks it on blur and on Save. */
export function checkClient(value: ClientValue): ClientCheck {
  switch (value.choice) {
    case null:
      return { ok: false, problem: { kind: "choose" } };
    case "one":
      return checkComputer(value.text);
    case "network":
      return checkNetwork(value.text);
    case "any":
      return { ok: true, client: "*", form: { kind: "any" } };
    case "anyWithPassword":
      return { ok: true, client: "", form: { kind: "anyWithPassword" } };
  }
}

// ---- How wide a network is (0.2, 0.4) -----------------------------------------------------------

/** The IPv4 networks that hold more than this many addresses are warned about. */
export const WIDE_IPV4 = 256;
/** IPv6 networks shorter than this prefix are warned about; this one and shorter are "very large". */
export const WIDE_IPV6_PREFIX = 64;

/**
 * The wide-network warning (0.4) for a valid network: more than 256 IPv4 addresses, or an IPv6
 * network wider than /64; null otherwise, and for anything that is not a valid network.
 */
export function networkWarning(
  value: ClientValue,
): { kind: "count"; count: number } | { kind: "huge" } | null {
  if (value.choice !== "network") {
    return null;
  }
  const check = checkNetwork(value.text);
  if (!check.ok || check.form.kind !== "network") {
    return null;
  }
  const { family, prefix } = check.form;
  if (family === 4) {
    const count = 2 ** (32 - prefix);
    return count > WIDE_IPV4 ? { kind: "count", count } : null;
  }
  return prefix < WIDE_IPV6_PREFIX ? addressCount(6, prefix) : null;
}

// ---- A stored value (0.4, "values set in the classic interface") ----------------------------------

export type StoredClient =
  | { kind: "one"; value: string; form: ClientForm }
  | { kind: "network"; value: string }
  | { kind: "any" }
  /** The rsync server's empty `hostsallow`: any computer with the name and password. */
  | { kind: "anyWithPassword" }
  /** None of the three: shown as stored, "(set in the classic interface)". */
  | { kind: "classic"; value: string };

/**
 * What a stored value is. `empty` says what an empty value means: for NFS, any computer (OMV writes
 * it as "*"); for an rsync server folder, any computer with the name and password.
 */
export function classifyStored(
  stored: string,
  empty: "any" | "anyWithPassword" = "any",
): StoredClient {
  const text = stored.trim();
  if (text === "") {
    return { kind: empty };
  }
  if (text === "*") {
    return { kind: "any" };
  }
  const one = checkComputer(text);
  if (one.ok) {
    return { kind: "one", value: text, form: one.form };
  }
  if (checkNetwork(text).ok) {
    return { kind: "network", value: text };
  }
  return { kind: "classic", value: stored };
}

/** The field's first value for a stored one: its own choice, or none for a classic value. */
export function valueOfStored(stored: StoredClient): ClientValue {
  switch (stored.kind) {
    case "one":
      return { choice: "one", text: stored.value };
    case "network":
      return { choice: "network", text: stored.value };
    case "any":
      return { choice: "any", text: "" };
    case "anyWithPassword":
      return { choice: "anyWithPassword", text: "" };
    case "classic":
      return { choice: null, text: "" };
  }
}

// ---- The same computer or network (0.10) --------------------------------------------------------

/**
 * A key under which two values that let in the same computers are equal: text compared without case;
 * an address as its number (so "2001:DB8::1" is "2001:db8:0:0:0:0:0:1"), the same as a network of
 * just that address; a network by its start and prefix; "*" and an empty value as any computer.
 */
export function clientKey(stored: string): string {
  const text = stored.trim().toLowerCase();
  if (text === "" || text === "*") {
    return "any";
  }
  const address = parseAddress(text);
  if (address !== null) {
    return `${String(address.family)}:${BigInt(address.value).toString(16)}/${String(address.family === 4 ? 32 : 128)}`;
  }
  const network = parseNetworkLoose(text);
  if (network !== null) {
    const start = network.address & maskOf(network.family, network.prefix);
    return `${String(network.family)}:${start.toString(16)}/${String(network.prefix)}`;
  }
  return `text:${text}`;
}

/** Whether two values let in the same computers (0.10's duplicate check). */
export const sameClient = (a: string, b: string): boolean =>
  clientKey(a) === clientKey(b);
