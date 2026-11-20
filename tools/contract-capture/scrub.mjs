// SPDX-License-Identifier: GPL-3.0-or-later
// Scrubbing of captured replies (docs/04, "Response schemas", step 2). Host names, addresses, MAC
// addresses, e-mail addresses, serial numbers, UUIDs, user names, passwords and keys are replaced
// with fixed documentation values, consistently within one capture run, so a UUID referenced twice
// stays the same UUID.
//
// After scrubbing, verify() checks that nothing it should have caught is left. A capture that fails
// it is not written. Its errors name the rule and the location, never the value.
import { isIPv4, isIPv6 } from "node:net";

export const DOC = {
  hostname: "nas",
  domain: "example.org",
  fqdn: "nas.example.org",
  sshKey:
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl example-key",
  rfc4716Key:
    "---- BEGIN SSH2 PUBLIC KEY ----\nAAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n---- END SSH2 PUBLIC KEY ----",
};

const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const MAC = /\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/gi;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const IPV6_CANDIDATE =
  /(?<![\w:])[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}(?![\w:])/gi;
const SSH_KEY =
  /(?:sk-ssh-ed25519@openssh\.com|ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-nistp\d+) AAAA[0-9A-Za-z+/]+=*(?: [^\s"]+)?/g;
// An e-mail address. Its domain is kept only when it is a documentation domain (RFC 2606).
const EMAIL =
  /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*/g;
const DOC_EMAIL = /@(?:[a-z0-9-]+\.)*example\.(?:com|net|org)$/i;
const RFC4716 =
  /---- BEGIN SSH2 PUBLIC KEY ----[\s\S]*?---- END SSH2 PUBLIC KEY ----/g;

const HOST_KEYS = new Set(["hostname", "fqdn"]);
const DOMAIN_KEYS = new Set(["domainname", "domain"]);
const SERIAL_KEY = /serial/i;
const DROP_KEYS = new Set(["trace"]);
const SESSION_KEYS = new Set(["sessionid"]);
// Fields whose whole value is replaced when it is not empty, whatever it looks like. A capture entry
// may add its own (an SMTP user name is a name the scrubber cannot otherwise recognise).
export const KEY_PLACEHOLDERS = { password: "EXAMPLE-PASSWORD" };

const DOC_UUID = /^00000000-0000-4000-8000-[0-9a-f]{12}$/i;
const DOC_MAC = /^00:00:5e:00:53:[0-9a-f]{2}$/i;
const DOC_SERIAL = /^EXAMPLE-SERIAL-\d{4}$/;

// Not personal: loopback, unspecified, link-local, documentation ranges and netmasks.
function isKeptIPv4(ip) {
  if (
    /^(127\.|0\.0\.0\.0$|169\.254\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(
      ip,
    )
  ) {
    return true;
  }
  const bits = ip
    .split(".")
    .map((o) => Number(o).toString(2).padStart(8, "0"))
    .join("");
  return /^1+0*$/.test(bits) && bits.startsWith("1111"); // a netmask such as 255.255.255.0
}
const isKeptIPv6 = (ip) => /^(::1?|fe80:.*|2001:db8:.*)$/i.test(ip);

/**
 * A scrubber for one capture run.
 * @param {{names?: Record<string, string>, literals?: string[]}} known
 *   names: real user or host name -> placeholder; literals: values that must never appear (the
 *   host, passwords, secrets), replaced by a marker if found.
 * scrub() and verify() take, as a second argument, more field name -> placeholder rules for one
 * reply, on top of KEY_PLACEHOLDERS.
 */
export function createScrubber(known = {}) {
  const names = Object.entries(known.names ?? {})
    .filter(([real]) => real && real.length > 1)
    .sort((a, b) => b[0].length - a[0].length);
  const literals = (known.literals ?? []).filter((v) => v && v.length > 3);
  const uuids = new Map();
  const macs = new Map();
  const v4 = new Map();
  const v6 = new Map();
  const serials = new Map();
  const emails = new Map();
  const number = (map, value, make) => {
    if (!map.has(value)) {
      map.set(value, make(map.size + 1));
    }
    return map.get(value);
  };
  const hex = (n, width) => n.toString(16).padStart(width, "0");

  function scrubString(s) {
    let out = s;
    for (const literal of literals) {
      out = out.split(literal).join("NAS_HOST");
    }
    out = out.replace(EMAIL, (m) =>
      DOC_EMAIL.test(m)
        ? m
        : number(emails, m.toLowerCase(), (n) => `user${n}@example.com`),
    );
    out = out.replace(RFC4716, DOC.rfc4716Key);
    out = out.replace(SSH_KEY, DOC.sshKey);
    out = out.replace(UUID, (m) =>
      DOC_UUID.test(m)
        ? m
        : number(
            uuids,
            m.toLowerCase(),
            (n) => `00000000-0000-4000-8000-${hex(n, 12)}`,
          ),
    );
    out = out.replace(MAC, (m) =>
      DOC_MAC.test(m)
        ? m
        : number(macs, m.toLowerCase(), (n) => `00:00:5e:00:53:${hex(n, 2)}`),
    );
    out = out.replace(IPV4, (m) =>
      !isIPv4(m) || isKeptIPv4(m) ? m : number(v4, m, (n) => `192.0.2.${n}`),
    );
    out = out.replace(IPV6_CANDIDATE, (m) =>
      !isIPv6(m) || isKeptIPv6(m)
        ? m
        : number(v6, m.toLowerCase(), (n) => `2001:db8::${hex(n, 1)}`),
    );
    for (const [real, placeholder] of names) {
      out = out.replace(
        new RegExp(
          `(?<![\\w-])${real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`,
          "g",
        ),
        placeholder,
      );
    }
    return out;
  }

  function walk(value, keyName, keys) {
    if (Array.isArray(value)) {
      return value.map((v) => walk(v, keyName, keys));
    }
    if (value && typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (DROP_KEYS.has(k)) {
          continue;
        }
        out[scrubString(k)] = walk(v, k, keys);
      }
      return out;
    }
    if (typeof value !== "string") {
      return value;
    }
    if (keyName && SESSION_KEYS.has(keyName)) {
      return "EXAMPLE-SESSION-ID";
    }
    if (keyName && Object.hasOwn(keys, keyName) && value !== "") {
      return keys[keyName];
    }
    if (keyName && HOST_KEYS.has(keyName) && value !== "") {
      return value.includes(".") ? DOC.fqdn : DOC.hostname;
    }
    if (keyName && DOMAIN_KEYS.has(keyName) && value !== "") {
      return DOC.domain;
    }
    if (keyName && SERIAL_KEY.test(keyName) && value !== "") {
      return number(
        serials,
        value,
        (n) => `EXAMPLE-SERIAL-${String(n).padStart(4, "0")}`,
      );
    }
    return scrubString(value);
  }

  const keysWith = (extra) => ({ ...KEY_PLACEHOLDERS, ...extra });

  /** Scrub a parsed reply. Returns a new value; the input is untouched. */
  function scrub(value, extraKeys = {}) {
    return walk(value, undefined, keysWith(extraKeys));
  }

  /**
   * Check a scrubbed value: no known name or literal, and no address, MAC, UUID, serial or key that
   * is not a documentation value. Returns the failures as "rule at path"; empty means clean.
   */
  function verify(value, extraKeys = {}) {
    const keys = keysWith(extraKeys);
    const failures = [];
    const visit = (v, path, keyName) => {
      if (Array.isArray(v)) {
        v.forEach((item, i) => visit(item, `${path}[${i}]`, keyName));
        return;
      }
      if (v && typeof v === "object") {
        for (const [k, item] of Object.entries(v)) {
          checkString(k, `${path} (key)`);
          visit(item, `${path}.${k}`, k);
        }
        return;
      }
      if (typeof v !== "string") {
        return;
      }
      checkString(v, path);
      if (
        keyName &&
        Object.hasOwn(keys, keyName) &&
        v !== "" &&
        v !== keys[keyName]
      ) {
        failures.push(`${keyName} at ${path}`);
      }
      if (
        keyName &&
        SERIAL_KEY.test(keyName) &&
        v !== "" &&
        !DOC_SERIAL.test(v)
      ) {
        failures.push(`serial number at ${path}`);
      }
      if (
        keyName &&
        HOST_KEYS.has(keyName) &&
        v !== "" &&
        v !== DOC.hostname &&
        v !== DOC.fqdn
      ) {
        failures.push(`host name at ${path}`);
      }
    };
    const checkString = (s, path) => {
      for (const literal of literals) {
        if (s.includes(literal)) {
          failures.push(`a known secret or host at ${path}`);
        }
      }
      for (const [real] of names) {
        if (
          new RegExp(
            `(?<![\\w-])${real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`,
          ).test(s)
        ) {
          failures.push(`a known name at ${path}`);
        }
      }
      for (const m of s.match(UUID) ?? []) {
        if (!DOC_UUID.test(m)) {
          failures.push(`UUID at ${path}`);
        }
      }
      for (const m of s.match(MAC) ?? []) {
        if (!DOC_MAC.test(m)) {
          failures.push(`MAC address at ${path}`);
        }
      }
      for (const m of s.match(IPV4) ?? []) {
        if (isIPv4(m) && !isKeptIPv4(m)) {
          failures.push(`IPv4 address at ${path}`);
        }
      }
      for (const m of s.match(IPV6_CANDIDATE) ?? []) {
        if (isIPv6(m) && !isKeptIPv6(m)) {
          failures.push(`IPv6 address at ${path}`);
        }
      }
      for (const m of s.match(EMAIL) ?? []) {
        if (!DOC_EMAIL.test(m)) {
          failures.push(`e-mail address at ${path}`);
        }
      }
      for (const m of s.match(SSH_KEY) ?? []) {
        if (m !== DOC.sshKey) {
          failures.push(`SSH key at ${path}`);
        }
      }
    };
    visit(value, "$", undefined);
    return failures;
  }

  return { scrub, verify };
}
