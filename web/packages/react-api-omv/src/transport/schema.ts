// SPDX-License-Identifier: GPL-3.0-or-later
// Walks a reply against its schema from the operation table (docs/03, "Quirks the transport
// normalises"): normalise() fixes the known wire quirks, only where the schema says so;
// validate() reports where a reply does not match (development and test builds only).
import type { Schema, SchemaTable } from "../contract/types.ts";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function resolve(schema: Schema, schemas: SchemaTable): Schema {
  let s = schema;
  for (let depth = 0; s.$ref !== undefined; depth++) {
    const next = schemas[s.$ref];
    if (!next || depth > 32) {
      throw new Error(`Unknown schema reference ${s.$ref}`);
    }
    s = next;
  }
  return s;
}

/** The alternative of a oneOf/anyOf that a value belongs to, if one can be told. */
function pickAlternative(
  value: unknown,
  schema: Schema,
  schemas: SchemaTable,
): Schema | undefined {
  const alternatives = schema.oneOf ?? schema.anyOf ?? [];
  const d = schema.discriminator;
  if (d && isPlainObject(value)) {
    const tag = value[d.propertyName];
    const name =
      typeof tag === "string" ? (d.mapping?.[tag] ?? tag) : undefined;
    const match = alternatives.find((alt) => alt.$ref === name);
    if (match) {
      return match;
    }
  }
  return (
    alternatives.find((alt) => validate(value, alt, schemas).length === 0) ??
    alternatives.find(
      (alt) =>
        validate(normalise(value, alt, schemas), alt, schemas).length === 0,
    )
  );
}

function coerce(value: unknown, type: Schema["type"]): unknown {
  switch (type) {
    case "boolean":
      if (value === 0 || value === "0" || value === "false") {
        return false;
      }
      if (value === 1 || value === "1" || value === "true") {
        return true;
      }
      return value;
    case "integer":
    case "number":
      if (
        typeof value === "string" &&
        value.trim() !== "" &&
        Number.isFinite(Number(value))
      ) {
        return Number(value);
      }
      return value;
    case "string":
      return typeof value === "number" ? String(value) : value;
    default:
      return value;
  }
}

/**
 * Return the reply as its type says. Unknown fields pass through (response schemas are open),
 * except with `prune`, which keeps only the fields the schema lists.
 */
export function normalise(
  value: unknown,
  schemaIn: Schema,
  schemas: SchemaTable,
  prune = false,
): unknown {
  const schema = resolve(schemaIn, schemas);
  if (value === null) {
    return null;
  }
  if (schema.oneOf || schema.anyOf) {
    const alt = pickAlternative(value, schema, schemas);
    return alt ? normalise(value, alt, schemas, prune) : value;
  }
  let v: unknown = value;
  if (schema["x-omv-coerce"]) {
    v = coerce(v, schema.type);
  }
  if (schema["x-omv-int64"] && typeof v === "number") {
    // Already parsed as a number by JSON.parse; precision above 2^53 is lost on the wire.
    v = Number.isSafeInteger(v) ? String(v) : v;
  }
  if (
    schema.type === "object" ||
    schema.properties ||
    schema.additionalProperties
  ) {
    // PHP encodes an empty map as [].
    if (Array.isArray(v) && v.length === 0) {
      return {};
    }
    if (!isPlainObject(v)) {
      return v;
    }
    const out: Record<string, unknown> = {};
    const props = schema.properties ?? {};
    const extra =
      typeof schema.additionalProperties === "object"
        ? schema.additionalProperties
        : undefined;
    for (const [k, item] of Object.entries(v)) {
      const sub = props[k] ?? extra;
      if (sub) {
        out[k] = normalise(item, sub, schemas, prune);
      } else if (!prune) {
        out[k] = item;
      }
    }
    return out;
  }
  if (schema.type === "array" && Array.isArray(v) && schema.items) {
    const items = schema.items;
    return v.map((item) => normalise(item, items, schemas, prune));
  }
  return v;
}

const typeOf = (v: unknown): string => {
  if (v === null) {
    return "null";
  }
  if (Array.isArray(v)) {
    return "array";
  }
  if (typeof v === "number") {
    return Number.isInteger(v) ? "integer" : "number";
  }
  return typeof v;
};

/** Where a value does not match its schema, as "path: problem". Empty means it matches. */
export function validate(
  value: unknown,
  schemaIn: Schema,
  schemas: SchemaTable,
  path = "$",
): string[] {
  const schema = resolve(schemaIn, schemas);
  if (value === null) {
    return schema.nullable || (!schema.type && !schema.oneOf && !schema.anyOf)
      ? []
      : [`${path}: null is not allowed`];
  }
  if (schema.oneOf || schema.anyOf) {
    const alternatives = schema.oneOf ?? schema.anyOf ?? [];
    const matches = alternatives.filter(
      (alt) => validate(value, alt, schemas, path).length === 0,
    ).length;
    if (matches === 0 || (schema.oneOf && matches > 1)) {
      return [
        `${path}: matches ${matches} of the ${schema.oneOf ? "oneOf" : "anyOf"} alternatives`,
      ];
    }
    return [];
  }
  const problems: string[] = [];
  for (const sub of schema.allOf ?? []) {
    problems.push(...validate(value, sub, schemas, path));
  }
  const actual = typeOf(value);
  if (schema.type) {
    const ok =
      schema.type === actual ||
      (schema.type === "number" && actual === "integer");
    if (!ok) {
      return [...problems, `${path}: expected ${schema.type}, got ${actual}`];
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    problems.push(`${path}: not one of the allowed values`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      problems.push(`${path}: below ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      problems.push(`${path}: above ${schema.maximum}`);
    }
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      problems.push(`${path}: shorter than ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      problems.push(`${path}: longer than ${schema.maxLength}`);
    }
    if (
      schema.pattern !== undefined &&
      !new RegExp(schema.pattern, "u").test(value)
    ) {
      problems.push(`${path}: does not match the pattern`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      problems.push(`${path}: fewer than ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      problems.push(`${path}: more than ${schema.maxItems} items`);
    }
    if (schema.items) {
      const items = schema.items;
      value.forEach((item, i) =>
        problems.push(...validate(item, items, schemas, `${path}[${i}]`)),
      );
    }
  }
  if (isPlainObject(value)) {
    for (const name of schema.required ?? []) {
      if (!(name in value)) {
        problems.push(`${path}: missing ${name}`);
      }
    }
    const props = schema.properties ?? {};
    for (const [k, item] of Object.entries(value)) {
      const sub =
        props[k] ??
        (typeof schema.additionalProperties === "object"
          ? schema.additionalProperties
          : undefined);
      if (sub) {
        problems.push(...validate(item, sub, schemas, `${path}.${k}`));
      } else if (schema.additionalProperties === false) {
        problems.push(`${path}: unexpected field ${k}`);
      }
    }
  }
  return problems;
}
