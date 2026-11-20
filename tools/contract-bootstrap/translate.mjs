// SPDX-License-Identifier: GPL-3.0-or-later
// OMV's datamodel dialect -> an OpenAPI 3.0.3 schema (docs/04, "Request schemas"). The result is a
// draft: findings name what a person must decide, and "any" is never translated.

// Patterns equivalent to OMV's own format checks (openmediavault PHP/datamodel/schema.inc and
// PHP/json/schema.inc). A format checked by a PHP filter rather than a regex has none here, and
// the draft says so.
export const FORMAT_PATTERNS = {
  username: "^[a-zA-Z0-9_.][a-zA-Z0-9_.-]*\\$?$",
  "no-multi-line": "^[^\\r\\n]*$",
  uuidv4:
    "^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$",
  devicefile: "^/dev(/disk/by-id)?/[a-zA-Z0-9/.:_+-]+$",
  sharename: '^(?! )[^"\\x00-\\x1F\\\\/\\[\\]:|<>+=;,*?]+(?<! )$',
  domainname:
    "^[a-zA-Z0-9]([-a-zA-Z0-9]{0,61}[a-zA-Z0-9])?([.][a-zA-Z0-9]([-a-zA-Z0-9]{0,61}[a-zA-Z0-9])?)*$",
  netbiosname: "^[\\w !#$%&'()\\-.@^_{}~]{1,15}$",
  hostname: "^[a-zA-Z0-9]([-a-zA-Z0-9]{0,61}[a-zA-Z0-9])?$",
  time: "^\\d{2}:\\d{2}:\\d{2}$",
  date: "^\\d{4}-\\d{2}-\\d{2}$",
};

const SCALARS = new Set(["string", "integer", "number", "boolean"]);

/**
 * Translate one OMV schema. Returns {schema, findings}; findings are "path: what to review".
 * @param {object} omv the OMV schema (a datamodel's `params` or a property)
 */
export function translate(omv, at = "$") {
  const findings = [];
  const schema = walk(omv, at, findings);
  return { schema, findings };
}

function walk(omv, at, findings) {
  if (omv.not !== undefined) {
    findings.push(
      `${at}: a "not" rule, which is not translated - the contract must reject what it rejects; review`,
    );
  }
  if (Array.isArray(omv.oneOf)) {
    // OMV writes "an e-mail address or empty" as a type plus oneOf alternatives. Each alternative
    // inherits the outer keywords it does not set itself.
    const { oneOf, not: _not, ...outer } = omv;
    findings.push(
      `${at}: oneOf alternatives - the contract may accept their union or less; review`,
    );
    const out = {
      oneOf: oneOf.map((alt, i) =>
        walk({ ...outer, ...alt }, `${at}|${i + 1}`, findings),
      ),
    };
    if (omv.description) {
      out.description = omv.description;
    }
    return out;
  }
  let types = Array.isArray(omv.type)
    ? [...omv.type]
    : omv.type === undefined
      ? []
      : [omv.type];
  const nullable = types.includes("null");
  types = types.filter((t) => t !== "null");

  if (types.includes("any") || types.length === 0) {
    findings.push(
      `${at}: type ${types.includes("any") ? '"any"' : "missing"} - read the method and write a real schema`,
    );
    return { description: "TODO: OMV declares no type here; read the method." };
  }

  let out;
  if (types.length > 1) {
    findings.push(
      `${at}: a union of ${types.join(", ")} - the contract may accept fewer; review`,
    );
    out = { oneOf: types.map((t) => walk({ ...omv, type: t }, at, [])) };
  } else {
    const [type] = types;
    out = { type };
    if (type === "object") {
      const required = [];
      out.properties = {};
      for (const [name, prop] of Object.entries(omv.properties ?? {})) {
        if (prop.required === true) {
          required.push(name);
        }
        const { required: _r, ...rest } = prop;
        out.properties[name] = walk(rest, `${at}.${name}`, findings);
      }
      if (required.length) {
        out.required = required;
      }
      if (!omv.properties || !Object.keys(omv.properties).length) {
        findings.push(
          `${at}: an object with no properties - OMV validates nothing here; give it an explicit schema`,
        );
      }
    } else if (type === "array") {
      if (omv.items) {
        out.items = walk(omv.items, `${at}[]`, findings);
      } else {
        findings.push(`${at}: an array with no item schema`);
      }
    } else if (!SCALARS.has(type)) {
      findings.push(`${at}: unknown type ${type}`);
    }
  }

  for (const key of [
    "minimum",
    "maximum",
    "enum",
    "pattern",
    "maxLength",
    "minLength",
    "default",
    "minItems",
    "maxItems",
  ]) {
    if (omv[key] !== undefined) {
      out[key] = omv[key];
    }
  }
  if (omv.format) {
    out["x-omv-format"] = omv.format;
    const pattern = FORMAT_PATTERNS[omv.format];
    if (pattern && !out.pattern) {
      out.pattern = pattern;
    } else if (!pattern) {
      findings.push(
        `${at}: OMV format "${omv.format}" has no equivalent pattern here (a PHP filter); review`,
      );
    }
  }
  if (omv.description) {
    out.description = omv.description;
  }
  if (nullable) {
    out.nullable = true;
  }
  return out;
}
