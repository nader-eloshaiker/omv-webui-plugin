// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { test } from "node:test";
import { translate } from "../contract-bootstrap/translate.mjs";
import { checkContract, compareSchemas } from "./compare.mjs";

const omv = {
  type: "object",
  properties: {
    port: { type: "integer", minimum: 1, maximum: 65535, required: true },
    mode: { type: "string", enum: ["a", "b"] },
    name: { type: "string", format: "username" },
    note: { type: ["string", "null"] },
    tags: { type: "array", items: { type: "string" } },
  },
};
const theirs = translate(omv).schema;
const contract = { components: { schemas: {} } };
const exact = translate(omv).schema;

const messages = (ours) =>
  compareSchemas(ours, theirs, contract).map(
    (p) => `${p.severity} ${p.at}: ${p.message}`,
  );

test("translate follows docs/04's table", () => {
  const { schema, findings } = translate({
    type: "object",
    properties: {
      a: { type: "string", required: true, format: "uuidv4" },
      b: { type: ["string", "null"] },
      c: { type: ["string", "integer", "null"] },
      d: { type: "any" },
      e: { type: "string", format: "email" },
    },
  });
  assert.deepEqual(schema.required, ["a"]);
  assert.equal(schema.properties.a["x-omv-format"], "uuidv4");
  assert.match(schema.properties.a.pattern, /\[a-fA-F0-9\]\{8\}/);
  assert.deepEqual(schema.properties.b, { type: "string", nullable: true });
  assert.deepEqual(schema.properties.c, {
    oneOf: [{ type: "string" }, { type: "integer" }],
    nullable: true,
  });
  const text = findings.join("\n");
  assert.match(text, /\$\.c: a union/);
  assert.match(text, /\$\.d: type "any"/);
  assert.match(text, /\$\.e: OMV format "email" has no equivalent pattern/);
});

test("an exact translation agrees", () => {
  assert.deepEqual(messages(exact), []);
});

test("stricter is allowed", () => {
  const ours = structuredClone(exact);
  ours.properties.port.maximum = 1024;
  ours.properties.mode.enum = ["a"];
  delete ours.properties.note.nullable;
  ours.required = ["port", "mode"];
  delete ours.properties.tags;
  assert.deepEqual(messages(ours), []);
});

const looser = [
  [
    "a dropped required field",
    (s) => (s.required = []),
    "looser $: does not require port; OMV does",
  ],
  [
    "a lower minimum",
    (s) => (s.properties.port.minimum = 0),
    "looser $.port: minimum 0; OMV's is 1",
  ],
  [
    "a missing maximum",
    (s) => delete s.properties.port.maximum,
    "looser $.port: maximum none; OMV's is 65535",
  ],
  [
    "an extra enum value",
    (s) => s.properties.mode.enum.push("c"),
    'looser $.mode: accepts "c", which OMV does not',
  ],
  [
    "no enum",
    (s) => delete s.properties.mode.enum,
    "looser $.mode: accepts any value",
  ],
  [
    "a wider type",
    (s) =>
      (s.properties.port = {
        oneOf: [{ type: "integer" }, { type: "string" }],
      }),
    "looser $.port: accepts type string",
  ],
  [
    "null allowed",
    (s) => (s.properties.port.nullable = true),
    "looser $.port: accepts null",
  ],
  [
    "no format",
    (s) => delete s.properties.name["x-omv-format"],
    'looser $.name: OMV checks format "username"',
  ],
  [
    "no pattern",
    (s) => delete s.properties.name.pattern,
    "looser $.name: has no pattern",
  ],
  [
    "a wider item type",
    (s) => (s.properties.tags.items = { type: "integer" }),
    "looser $.tags[]: accepts type integer",
  ],
  [
    "an unknown field",
    (s) => (s.properties.extra = { type: "string" }),
    "diverged $: has a field extra",
  ],
];

for (const [name, change, want] of looser) {
  test(`reports ${name}`, () => {
    const ours = structuredClone(exact);
    change(ours);
    const found = messages(ours).join("\n");
    assert.ok(found.includes(want), `want "${want}", got:\n${found}`);
  });
}

test("checkContract reports a missing method, a missing datamodel and an unchecked body", () => {
  const body = (schema) => ({ content: { "application/json": { schema } } });
  const c = {
    components: { schemas: {} },
    paths: {
      "/rpc/A/gone": {
        post: {
          operationId: "aGone",
          "x-omv-rpc": { service: "A", method: "gone" },
        },
      },
      "/rpc/A/x": {
        post: {
          operationId: "aX",
          "x-omv-rpc": { service: "A", method: "x" },
          "x-omv-source": { datamodel: "rpc.a.missing", omvVersion: "8" },
          requestBody: body({ type: "object" }),
        },
      },
      "/rpc/A/y": {
        post: {
          operationId: "aY",
          "x-omv-rpc": { service: "A", method: "y" },
          requestBody: body({ type: "object" }),
        },
      },
      "/rpc/A/z": {
        post: {
          operationId: "aZ",
          "x-omv-rpc": { service: "A", method: "z" },
          "x-omv-source": { datamodel: "rpc.a.z", omvVersion: "8" },
          requestBody: body(exact),
        },
      },
    },
  };
  const findings = checkContract(
    c,
    new Map([["rpc.a.z", { params: omv }]]),
    new Map([["A", new Set(["x", "y", "z"])]]),
  );
  assert.deepEqual(
    findings.map((f) => `${f.severity} ${f.where}`),
    ["missing aGone (A.gone)", "missing aX (A.x)", "unchecked aY (A.y)"],
  );
});

// OMV's "an e-mail address or empty" (rpc.usermgmt.setuserbycontext and others).
const emailOrEmpty = {
  type: "object",
  properties: {
    email: {
      type: "string",
      oneOf: [
        { type: "string", format: "email" },
        { type: "string", maxLength: 0 },
      ],
      required: true,
    },
  },
};

test("translate keeps oneOf alternatives instead of dropping them", () => {
  const { schema, findings } = translate(emailOrEmpty);
  assert.deepEqual(schema.properties.email, {
    oneOf: [
      { type: "string", "x-omv-format": "email" },
      { type: "string", maxLength: 0 },
    ],
  });
  assert.match(findings.join("\n"), /\$\.email: oneOf alternatives/);
});

test("translate flags a not rule it cannot carry over", () => {
  const { findings } = translate({ type: "string", not: { enum: ["local"] } });
  assert.match(findings.join("\n"), /"not" rule/);
});

const theirEmail = translate(emailOrEmpty).schema;
const emailRef = {
  type: "string",
  "x-omv-format": "email",
  pattern: "^[^@]+@[^@]+$",
};
const withRefs = { components: { schemas: { Email: emailRef } } };
const emailCases = [
  [
    "the same alternatives, one by reference",
    {
      oneOf: [
        { $ref: "#/components/schemas/Email" },
        { type: "string", maxLength: 0 },
      ],
    },
    [],
  ],
  ["only an e-mail address", { $ref: "#/components/schemas/Email" }, []],
  ["only empty", { type: "string", maxLength: 0 }, []],
  [
    "any string",
    { type: "string" },
    ["looser $.email: accepts values that none of OMV's alternatives accepts"],
  ],
  [
    "an alternative without the format",
    { oneOf: [{ type: "string" }, { type: "string", maxLength: 0 }] },
    [
      "looser $.email: alternative 1 accepts values that none of OMV's alternatives accepts",
    ],
  ],
  [
    "null as well",
    {
      oneOf: [
        { $ref: "#/components/schemas/Email" },
        { type: "string", maxLength: 0 },
      ],
      nullable: true,
    },
    ["looser $.email: accepts null, which OMV does not"],
  ],
];

for (const [name, email, want] of emailCases) {
  test(`oneOf: ${name}`, () => {
    const ours = { type: "object", required: ["email"], properties: { email } };
    assert.deepEqual(
      compareSchemas(ours, theirEmail, withRefs).map(
        (p) => `${p.severity} ${p.at}: ${p.message}`,
      ),
      want,
    );
  });
}
