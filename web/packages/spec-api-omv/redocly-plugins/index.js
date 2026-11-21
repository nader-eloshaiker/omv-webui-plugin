// SPDX-License-Identifier: GPL-3.0-or-later
// Redocly plugin "omv": the lint rules for the x-omv-* extensions. The checks themselves are pure
// functions in checks.js; this file adapts them to Redocly's visitors.
import {
  acceptEmptyArrayForObject,
  acceptIntegerForInt64,
  checkExampleCoverage,
  checkOmit,
  checkPathItem,
  checkSchema,
} from "./checks.js";

/**
 * A resolver for checks that follow $refs beyond the operation's own file: each $ref is resolved
 * from the file it was written in, so a schema's relative reference to another schema resolves
 * as it does when bundling.
 */
function resolverFor(ctx) {
  const fileOf = new WeakMap();
  const mark = (node, file, seen = new Set()) => {
    if (!node || typeof node !== "object" || seen.has(node)) {
      return;
    }
    seen.add(node);
    if (!fileOf.has(node)) {
      fileOf.set(node, file);
    }
    if ("$ref" in node) {
      return;
    }
    for (const child of Object.values(node)) {
      mark(child, file, seen);
    }
  };
  return (node) => {
    if (!node || typeof node !== "object" || !("$ref" in node)) {
      return node;
    }
    const { node: target, location } = ctx.resolve(node, fileOf.get(node));
    if (target && location) {
      mark(target, location.source.absoluteRef);
    }
    return target;
  };
}

const reportAll = (ctx, findings, base) => {
  for (const { message, at } of findings) {
    ctx.report({ message, location: at.length ? base.child(at) : base });
  }
};

function Operation() {
  let schemaNames = new Set();
  return {
    Root: {
      enter(root) {
        schemaNames = new Set(Object.keys(root.components?.schemas ?? {}));
      },
    },
    PathItem: {
      enter(item, ctx) {
        reportAll(
          ctx,
          checkPathItem(String(ctx.key), item, (name) => schemaNames.has(name)),
          ctx.location,
        );
      },
    },
    Operation: {
      enter(op, ctx) {
        reportAll(ctx, checkOmit(op, resolverFor(ctx)), ctx.location);
      },
    },
  };
}

function ExampleCoverage() {
  return {
    Operation: {
      enter(op, ctx) {
        reportAll(
          ctx,
          checkExampleCoverage(op, (node) => ctx.resolve(node).node),
          ctx.location,
        );
      },
    },
  };
}

function SchemaExtensions() {
  return {
    Schema: {
      enter(schema, ctx) {
        reportAll(ctx, checkSchema(schema), ctx.location);
      },
    },
  };
}

function EmptyObjectAsArray() {
  return {
    Schema: {
      leave(schema) {
        acceptEmptyArrayForObject(schema);
      },
    },
  };
}

function Int64AsNumber() {
  return {
    Schema: {
      leave(schema) {
        acceptIntegerForInt64(schema);
      },
    },
  };
}

export default function omvPlugin() {
  return {
    id: "omv",
    preprocessors: {
      oas3: {
        "empty-object-as-array": EmptyObjectAsArray,
        "int64-as-number": Int64AsNumber,
      },
    },
    rules: {
      oas3: {
        operation: Operation,
        "example-coverage": ExampleCoverage,
        "schema-extensions": SchemaExtensions,
      },
    },
  };
}
