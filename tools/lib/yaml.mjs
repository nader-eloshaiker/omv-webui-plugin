// SPDX-License-Identifier: GPL-3.0-or-later
// A small YAML writer for plain JSON data (objects, arrays, strings, numbers, booleans, null), so
// the contract tools need no dependency. Strings are quoted whenever plain style could be misread.

const PLAIN = /^[A-Za-z_./][A-Za-z0-9_ ./()-]*$/;
const RESERVED = /^(true|false|yes|no|on|off|null|~|y|n)$/i;

function scalar(value) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  const s = String(value);
  if (
    s !== "" &&
    PLAIN.test(s) &&
    !RESERVED.test(s) &&
    !s.endsWith(" ") &&
    !/: | #/.test(s)
  ) {
    return s;
  }
  return JSON.stringify(s);
}

function key(k) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) && !RESERVED.test(k)
    ? k
    : JSON.stringify(k);
}

const isEmptyCollection = (v) =>
  (Array.isArray(v) && v.length === 0) ||
  (v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v).length === 0);

function emit(value, indent, lines) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && !isEmptyCollection(item)) {
        const sub = [];
        emit(item, indent + 2, sub);
        lines.push(`${pad}- ${sub[0].trimStart()}`, ...sub.slice(1));
      } else {
        lines.push(`${pad}- ${inline(item)}`);
      }
    }
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (v && typeof v === "object" && !isEmptyCollection(v)) {
      lines.push(`${pad}${key(k)}:`);
      emit(v, indent + 2, lines);
    } else {
      lines.push(`${pad}${key(k)}: ${inline(v)}`);
    }
  }
}

function inline(v) {
  if (Array.isArray(v)) {
    return "[]";
  }
  if (v && typeof v === "object") {
    return "{}";
  }
  return scalar(v);
}

/** Serialise plain data as block-style YAML, ending with a newline. */
export function toYaml(value) {
  if (value === null || typeof value !== "object" || isEmptyCollection(value)) {
    return `${inline(value)}\n`;
  }
  const lines = [];
  emit(value, 0, lines);
  return `${lines.join("\n")}\n`;
}
