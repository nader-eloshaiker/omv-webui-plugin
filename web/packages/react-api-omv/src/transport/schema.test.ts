// SPDX-License-Identifier: GPL-3.0-or-later
// The normaliser and validator, table-driven, and over every example of the contract.
import { describe, expect, it } from "vitest";
import { OPERATIONS, SCHEMAS } from "../contract/generated/operations.ts";
import type { OperationEntry, Schema } from "../contract/types.ts";
import { CONTRACT_EXAMPLES } from "../examples/generated/examples.ts";
import { normalise, validate } from "./schema.ts";

const none = {};

describe("normalise", () => {
  it.each<[string, Schema, unknown, unknown]>([
    [
      "[] for an empty map becomes {}",
      { type: "object", additionalProperties: { type: "string" } },
      [],
      {},
    ],
    [
      "a non-empty array where an object is expected is left alone",
      { type: "object" },
      [1],
      [1],
    ],
    [
      "[] stays [] where the schema says array",
      { type: "array", items: { type: "string" } },
      [],
      [],
    ],
    [
      "nested empty maps",
      { type: "object", properties: { m: { type: "object" } } },
      { m: [] },
      { m: {} },
    ],
    ["null stays null", { type: "object", nullable: true }, null, null],
    ["no coercion without x-omv-coerce", { type: "integer" }, "22", "22"],
    [
      "coerce a numeric string",
      { type: "integer", "x-omv-coerce": true },
      "22",
      22,
    ],
    [
      "coerce 0/1 to boolean",
      { type: "boolean", "x-omv-coerce": true },
      1,
      true,
    ],
    [
      "coerce '0' to boolean",
      { type: "boolean", "x-omv-coerce": true },
      "0",
      false,
    ],
    [
      "leave junk alone when coercing",
      { type: "integer", "x-omv-coerce": true },
      "x",
      "x",
    ],
    [
      "an int64 string stays a string",
      { type: "string", "x-omv-int64": true },
      "18446744073709551615",
      "18446744073709551615",
    ],
    [
      "a safe int64 number becomes its string",
      { type: "string", "x-omv-int64": true },
      4096,
      "4096",
    ],
    [
      "unknown fields pass through",
      { type: "object", properties: { a: { type: "string" } } },
      { a: "x", b: 1 },
      { a: "x", b: 1 },
    ],
  ])("%s", (_name, schema, input, output) => {
    expect(normalise(input, schema, none)).toEqual(output);
  });

  it("prunes to the listed fields when asked", () => {
    const schema: Schema = {
      type: "object",
      properties: {
        a: { type: "object", properties: { b: { type: "string" } } },
      },
    };
    expect(
      normalise({ a: { b: "x", secret: "y" }, other: 1 }, schema, none, true),
    ).toEqual({ a: { b: "x" } });
  });

  it("follows a discriminator to the right alternative", () => {
    const schemas = {
      A: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["a"] },
          m: { type: "object" },
        },
      },
      B: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["b"] },
          m: { type: "array" },
        },
      },
    } satisfies Record<string, Schema>;
    const schema: Schema = {
      oneOf: [{ $ref: "A" }, { $ref: "B" }],
      discriminator: { propertyName: "status", mapping: { a: "A", b: "B" } },
    };
    expect(normalise({ status: "a", m: [] }, schema, schemas)).toEqual({
      status: "a",
      m: {},
    });
    expect(normalise({ status: "b", m: [] }, schema, schemas)).toEqual({
      status: "b",
      m: [],
    });
  });

  it("does not change its input", () => {
    const input = { m: [] as unknown[] };
    normalise(
      input,
      { type: "object", properties: { m: { type: "object" } } },
      none,
    );
    expect(input).toEqual({ m: [] });
  });
});

describe("validate", () => {
  it.each<[string, Schema, unknown, string[]]>([
    [
      "a match",
      {
        type: "object",
        required: ["a"],
        properties: { a: { type: "integer" } },
      },
      { a: 1 },
      [],
    ],
    [
      "a missing field",
      { type: "object", required: ["a"] },
      {},
      ["$: missing a"],
    ],
    [
      "a wrong type",
      { type: "object", properties: { a: { type: "integer" } } },
      { a: "1" },
      ["$.a: expected integer, got string"],
    ],
    ["an integer is a number", { type: "number" }, 3, []],
    [
      "null where not nullable",
      { type: "string" },
      null,
      ["$: null is not allowed"],
    ],
    ["null where nullable", { type: "string", nullable: true }, null, []],
    [
      "an enum",
      { type: "string", enum: ["OK"] },
      "ENOENT",
      ["$: not one of the allowed values"],
    ],
    [
      "a range",
      { type: "integer", minimum: 1, maximum: 65535 },
      0,
      ["$: below 1"],
    ],
    [
      "a pattern",
      { type: "string", pattern: "^[0-9]{6}$" },
      "12a456",
      ["$: does not match the pattern"],
    ],
    [
      "array items",
      { type: "array", items: { type: "string" } },
      ["a", 2],
      ["$[1]: expected string, got integer"],
    ],
  ])("%s", (_name, schema, value, problems) => {
    expect(validate(value, schema, none)).toEqual(problems);
  });
});

describe("every example of the contract", () => {
  const byOperationId = new Map<string, OperationEntry>(
    Object.values(OPERATIONS).map((e) => [e.operationId, e]),
  );
  const cases = Object.entries(CONTRACT_EXAMPLES).flatMap(
    ([operationId, examples]) =>
      Object.entries(examples)
        .filter(([, ex]) => ex.status === 200)
        .map(
          ([name, ex]) =>
            [`${operationId}.${name}`, operationId, ex.value] as const,
        ),
  );

  it.each(cases)(
    "%s normalises to a value its schema accepts",
    (_label, operationId, value) => {
      const schema = byOperationId.get(operationId)?.response;
      if (!schema) {
        expect(value).toBeNull();
        return;
      }
      expect(
        validate(normalise(value, schema, SCHEMAS), schema, SCHEMAS),
      ).toEqual([]);
    },
  );
});
