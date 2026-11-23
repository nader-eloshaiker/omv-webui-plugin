// SPDX-License-Identifier: GPL-3.0-or-later
// The field paths of x-omv-omit and x-omv-presence (docs/03, "Fields the transport removes"), and
// the one walk both use. A path is a top-level field ("password"), or steps then a field: `name.`
// steps into the one object a field holds, `name[].` into every item of a list. Steps chain, so
// "data[].users[].password" reaches a field of every item of the list inside every row, and
// "users.user[].password" one of every item of the list inside an object. Pure.

export type ReplyPathExtension = "x-omv-omit" | "x-omv-presence";

interface Step {
  readonly field: string;
  /** Step into every item of the field (a list of rows), not into the field itself. */
  readonly each: boolean;
}

/** A parsed path: the steps, then the field they lead to. */
export interface ReplyPath {
  readonly steps: readonly Step[];
  readonly leaf: string;
}

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// The lint rule (redocly-plugins/checks.js, REPLY_PATH) accepts only paths of this form, so every
// path in the operation table parses.
const PATH = /^(?:[A-Za-z_][A-Za-z0-9_]*(?:\[\])?\.)*[A-Za-z_][A-Za-z0-9_]*$/;

export function parseReplyPath(
  path: string,
  extension: ReplyPathExtension,
): ReplyPath {
  if (!PATH.test(path)) {
    throw new Error(`Not an ${extension} path: ${path}`);
  }
  const segments = path.split(".");
  // The pattern guarantees at least one segment, and that the last has no `[]`.
  const leaf = segments.pop() as string;
  return {
    steps: segments.map((segment) =>
      segment.endsWith("[]")
        ? { field: segment.slice(0, -2), each: true }
        : { field: segment, each: false },
    ),
    leaf,
  };
}

/** Replace one field of an object by a new value, keeping the order of the others. */
export const withField = (
  value: Record<string, unknown>,
  field: string,
  next: unknown,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === field ? next : item,
    ]),
  );

/**
 * A copy of `value` with `atLeaf` applied to every object the path's steps reach; everything else is
 * shared, and the input is not changed. Nothing is created: a missing step, a value that is not an
 * object where an object is expected (PHP's `[]` for an empty map, or a shape the contract does not
 * expect), or an item of a list that is not an object, is left as it is. PHP sends a list whose keys
 * have gaps as an object, so a `name[]` step also walks the values of an object, at every level.
 */
export function mapAtPath(
  value: unknown,
  path: ReplyPath,
  atLeaf: (object: Record<string, unknown>, field: string) => unknown,
): unknown {
  const walk = (node: unknown, depth: number): unknown => {
    if (!isPlainObject(node)) {
      return node;
    }
    const step = path.steps[depth];
    if (step === undefined) {
      return atLeaf(node, path.leaf);
    }
    if (!Object.hasOwn(node, step.field)) {
      return node;
    }
    const child = node[step.field];
    let next: unknown;
    if (!step.each) {
      next = walk(child, depth + 1);
    } else if (Array.isArray(child)) {
      next = child.map((item) => walk(item, depth + 1));
    } else if (isPlainObject(child)) {
      next = Object.fromEntries(
        Object.entries(child).map(([key, item]) => [
          key,
          walk(item, depth + 1),
        ]),
      );
    } else {
      return node;
    }
    return withField(node, step.field, next);
  };
  return walk(value, 0);
}
