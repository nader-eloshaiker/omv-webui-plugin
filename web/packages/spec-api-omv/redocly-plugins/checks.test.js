// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptEmptyArrayForObject,
  checkExampleCoverage,
  checkPathItem,
  checkSchema,
  operationIdOf,
} from "./checks.js";

const okOp = (over = {}) => ({
  post: {
    operationId: "sshGet",
    tags: ["SSH"],
    "x-omv-rpc": { service: "SSH", method: "get" },
    "x-omv-role": "admin",
    "x-omv-readonly": true,
    responses: { 200: { description: "ok" } },
    ...over,
  },
});

const messages = (findings) => findings.map((f) => f.message).join("\n");

test("operationIdOf follows <service><Method> in lower camel case", () => {
  assert.equal(operationIdOf("SSH", "get"), "sshGet");
  assert.equal(operationIdOf("ShareMgmt", "getList"), "shareMgmtGetList");
  assert.equal(
    operationIdOf("UserMgmt", "getUserByContext"),
    "userMgmtGetUserByContext",
  );
  assert.equal(
    operationIdOf("Config", "applyChangesBg"),
    "configApplyChangesBg",
  );
});

test("a well-formed operation passes", () => {
  assert.deepEqual(checkPathItem("/rpc/SSH/get", okOp()), []);
});

const cases = [
  ["path shape", "/v1/ssh", okOp(), "must be /rpc/{Service}/{method}"],
  ["not POST", "/rpc/SSH/get", { get: okOp().post }, "has no POST"],
  [
    "extra verb",
    "/rpc/SSH/get",
    { ...okOp(), get: {} },
    "Every operation is a POST",
  ],
  [
    "rpc missing",
    "/rpc/SSH/get",
    okOp({ "x-omv-rpc": undefined }),
    "x-omv-rpc {service, method} is required",
  ],
  [
    "rpc disagrees",
    "/rpc/SSH/get",
    okOp({ "x-omv-rpc": { service: "SSH", method: "set" } }),
    "must agree with the path",
  ],
  [
    "operationId",
    "/rpc/SSH/get",
    okOp({ operationId: "getSsh" }),
    'operationId must be "sshGet"',
  ],
  [
    "tags",
    "/rpc/SSH/get",
    okOp({ tags: ["Ssh"] }),
    'tags must be exactly ["SSH"]',
  ],
  [
    "role missing",
    "/rpc/SSH/get",
    okOp({ "x-omv-role": undefined }),
    "x-omv-role is required",
  ],
  [
    "role unknown",
    "/rpc/SSH/get",
    okOp({ "x-omv-role": "root" }),
    "x-omv-role is required",
  ],
  [
    "public elsewhere",
    "/rpc/SSH/get",
    okOp({ "x-omv-role": "public" }),
    '"public" is allowed only on',
  ],
  [
    "readonly missing",
    "/rpc/SSH/get",
    okOp({ "x-omv-readonly": undefined }),
    "x-omv-readonly is required",
  ],
  [
    "readonly and dirty",
    "/rpc/SSH/get",
    okOp({ "x-omv-dirty": true }),
    "cannot carry x-omv-dirty",
  ],
  [
    "readonly and task",
    "/rpc/SSH/get",
    okOp({ "x-omv-task": {} }),
    "cannot carry x-omv-task",
  ],
  [
    "dirty not boolean",
    "/rpc/SSH/get",
    okOp({ "x-omv-readonly": false, "x-omv-dirty": "yes" }),
    "x-omv-dirty must be a boolean",
  ],
  [
    "task shape",
    "/rpc/SSH/get",
    okOp({ "x-omv-readonly": false, "x-omv-task": { output: "x" } }),
    'has no field "output"',
  ],
  [
    "task result",
    "/rpc/SSH/get",
    okOp({ "x-omv-readonly": false, "x-omv-task": { result: "Nope" } }),
    "must name a schema",
  ],
  [
    "download",
    "/rpc/SSH/get",
    okOp({ "x-omv-readonly": false, "x-omv-download": {} }),
    "must be {contentType}",
  ],
  [
    "destructive",
    "/rpc/SSH/get",
    okOp({ "x-omv-readonly": false, "x-omv-destructive": "yes" }),
    "x-omv-destructive must be one of",
  ],
  [
    "source",
    "/rpc/SSH/get",
    okOp({ "x-omv-source": { datamodel: "rpc.ssh.set" } }),
    "must be {datamodel, omvVersion}",
  ],
  [
    "unknown extension",
    "/rpc/SSH/get",
    okOp({ "x-omv-cache": true }),
    "Unknown operation extension x-omv-cache",
  ],
  [
    "no 200",
    "/rpc/SSH/get",
    okOp({ responses: {} }),
    "A 200 response is required",
  ],
];

for (const [name, path, item, want] of cases) {
  test(`rejects: ${name}`, () => {
    const found = messages(checkPathItem(path, item, (n) => n === "Known"));
    assert.ok(found.includes(want), `want "${want}", got:\n${found}`);
  });
}

test("public is allowed on Session.login and Session.verify", () => {
  for (const method of ["login", "verify"]) {
    const item = okOp({
      operationId: operationIdOf("Session", method),
      tags: ["Session"],
      "x-omv-rpc": { service: "Session", method },
      "x-omv-role": "public",
      "x-omv-readonly": false,
    });
    assert.deepEqual(checkPathItem(`/rpc/Session/${method}`, item), []);
  }
});

test("a task naming a known schema passes", () => {
  const item = okOp({
    "x-omv-readonly": false,
    "x-omv-task": { result: "Known" },
  });
  assert.deepEqual(
    checkPathItem("/rpc/SSH/get", item, (n) => n === "Known"),
    [],
  );
});

test("example coverage", () => {
  const json = (examples) => ({
    responses: {
      200: { content: { "application/json": { schema: {}, examples } } },
    },
  });
  assert.deepEqual(checkExampleCoverage(json({ populated: { value: 1 } })), []);
  assert.match(
    messages(checkExampleCoverage(json({}))),
    /at least one example/,
  );
  assert.match(
    messages(checkExampleCoverage(json(undefined))),
    /at least one example/,
  );
  assert.match(
    messages(
      checkExampleCoverage({
        responses: { 200: { content: { "text/plain": {} } } },
      }),
    ),
    /exactly one body/,
  );
  // No body: the method returns null.
  assert.deepEqual(
    checkExampleCoverage({ responses: { 200: { description: "null" } } }),
    [],
  );
  // A $ref'd response is resolved first.
  const shared = json({ a: { value: 1 } }).responses[200];
  assert.deepEqual(
    checkExampleCoverage({ responses: { 200: { $ref: "#/x" } } }, () => shared),
    [],
  );
});

test("schema extensions", () => {
  assert.deepEqual(checkSchema({ type: "string", "x-omv-int64": true }), []);
  assert.deepEqual(
    checkSchema({ type: "string", "x-omv-format": "uuidv4" }),
    [],
  );
  assert.match(
    messages(checkSchema({ type: "integer", "x-omv-int64": true })),
    /must be string/,
  );
  assert.match(
    messages(checkSchema({ type: "string", "x-omv-format": "uuid" })),
    /not a known OMV format/,
  );
  assert.match(
    messages(checkSchema({ type: "integer", "x-omv-format": "uuidv4" })),
    /strings only/,
  );
  assert.match(
    messages(checkSchema({ type: "string", "x-omv-secret": "yes" })),
    /must be a boolean/,
  );
  assert.match(
    messages(checkSchema({ type: "string", "x-omv-hidden": true })),
    /Unknown schema extension/,
  );
});

test("lint restates an object schema to accept the empty array PHP sends for an empty map", () => {
  const schema = { type: "object", additionalProperties: { type: "string" } };
  assert.equal(acceptEmptyArrayForObject(schema), true);
  assert.deepEqual(schema.anyOf, [
    { type: "object", additionalProperties: { type: "string" } },
    { type: "array", maxItems: 0 },
  ]);
  assert.equal(acceptEmptyArrayForObject(schema), false, "only once");
  assert.equal(acceptEmptyArrayForObject({ type: "string" }), false);
});
