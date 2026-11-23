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

/** An address family. */
export type Family = 4 | 6;

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

/** The longest computer name (DNS). */
export const NAME_MAX = 253;

// ---- Addresses -----------------------------------------------------------------------------------

const OCTET = "(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])";
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`, "u");
const HEX_GROUP = /^[0-9A-Fa-f]{1,4}$/u;
/** A prefix as written: digits, no leading zero (the contract's pattern takes none). */
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
export function parseAddress(
  text: string,
): { family: 4; value: number } | { family: 6; value: bigint } | null {
  const v4 = parseIPv4(text);
  if (v4 !== null) {
    return { family: 4, value: v4 };
  }
  const v6 = parseIPv6(text);
  return v6 === null ? null : { family: 6, value: v6 };
}

// ---- Names --------------------------------------------------------------------------------------

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

interface Network {
  family: Family;
  /** The address as written, before the prefix is applied. */
  address: bigint;
  prefix: number;
}

/** "address/prefix" of either family, with any prefix the family can hold; or null. */
function parseNetworkLoose(text: string): Network | null {
  const parts = text.split("/");
  if (parts.length !== 2 || !PREFIX_TEXT.test(parts[1] ?? "")) {
    return null;
  }
  const prefix = Number(parts[1]);
  const address = parseAddress(parts[0] ?? "");
  if (address === null) {
    return null;
  }
  const bits = address.family === 4 ? 32 : 128;
  if (prefix > bits) {
    return null;
  }
  return {
    family: address.family,
    address: BigInt(address.value),
    prefix,
  };
}

const maskOf = (family: Family, prefix: number): bigint => {
  const bits = BigInt(family === 4 ? 32 : 128);
  const all = (1n << bits) - 1n;
  return all ^ ((1n << (bits - BigInt(prefix))) - 1n);
};

const formatAddress = (family: Family, value: bigint): string =>
  family === 4 ? formatIPv4(Number(value)) : formatIPv6(value);

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

/** How many addresses a network holds: a count for IPv4, "huge" for IPv6 of /64 or wider. */
export function addressCount(
  family: Family,
  prefix: number,
): { kind: "count"; count: number } | { kind: "huge" } {
  if (family === 4) {
    return { kind: "count", count: 2 ** (32 - prefix) };
  }
  return prefix <= WIDE_IPV6_PREFIX
    ? { kind: "huge" }
    : { kind: "count", count: 2 ** (128 - prefix) };
}

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
