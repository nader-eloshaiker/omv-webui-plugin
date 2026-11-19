// SPDX-License-Identifier: GPL-3.0-or-later
// Redocly plugin "omv": the lint rules for the x-omv-* extensions. The checks themselves are pure
// functions in checks.js; this file adapts them to Redocly's visitors.
import {
  acceptEmptyArrayForObject,
  checkExampleCoverage,
  checkPathItem,
  checkSchema,
} from "./checks.js";

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

export default function omvPlugin() {
  return {
    id: "omv",
    preprocessors: {
      oas3: { "empty-object-as-array": EmptyObjectAsArray },
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
