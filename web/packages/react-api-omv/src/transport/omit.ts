// SPDX-License-Identifier: GPL-3.0-or-later
// The fields of a reply that the contract's x-omv-omit names, removed (docs/03, "Fields the
// transport removes"; UI-6). A path is a top-level field ("password"), or a field inside each row
// of a list ("data[].wpapsk"): `name[]` steps into every item of that field, `name` into the one
// object it holds. Pure, so the transport and its tests share it.

interface Step {
  readonly field: string;
  /** Step into every item of the field (a list of rows), not into the field itself. */
  readonly each: boolean;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// The lint rule (redocly-plugins/checks.js) accepts only paths of this form, so every path in the
// operation table parses.
const PATH = /^(?:[A-Za-z_][A-Za-z0-9_]*(?:\[\])?\.)*[A-Za-z_][A-Za-z0-9_]*$/;

function stepsOf(path: string): readonly Step[] {
  if (!PATH.test(path)) {
    throw new Error(`Not an x-omv-omit path: ${path}`);
  }
  return path
    .split(".")
    .map((segment) =>
      segment.endsWith("[]")
        ? { field: segment.slice(0, -2), each: true }
        : { field: segment, each: false },
    );
}

/** The items of a list field. PHP sends a list with gaps in its keys as an object: its values. */
function eachItem(value: unknown, rest: readonly Step[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => without(item, rest));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, item]) => [k, without(item, rest)]),
    );
  }
  return value;
}

function without(value: unknown, steps: readonly Step[]): unknown {
  const [step, ...rest] = steps;
  // Not an object (PHP's [] for an empty map, or a shape the contract does not expect): there is
  // no field to remove.
  if (step === undefined || !isPlainObject(value)) {
    return value;
  }
  if (rest.length === 0) {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== step.field),
    );
  }
  if (!Object.hasOwn(value, step.field)) {
    return value;
  }
  const child = value[step.field];
  const next = step.each ? eachItem(child, rest) : without(child, rest);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === step.field ? next : item,
    ]),
  );
}

/** The reply without the fields `paths` names. The input is not changed. */
export function withoutOmitted(
  value: unknown,
  paths: readonly string[] | undefined,
): unknown {
  let out = value;
  for (const path of paths ?? []) {
    out = without(out, stepsOf(path));
  }
  return out;
}
