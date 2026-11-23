// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptEmptyArrayForObject,
  acceptIntegerForInt64,
  acceptStringForPresence,
  checkExampleCoverage,
  checkOmit,
  checkPathItem,
  checkPresence,
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

const omitOp = (omit, schema) => ({
  "x-omv-omit": omit,
  responses: {
    200: { content: { "application/json": { schema } } },
  },
});

test("x-omv-omit: shape", () => {
  const ok = okOp({ "x-omv-omit": ["password"] });
  assert.deepEqual(checkPathItem("/rpc/SSH/get", ok), []);
  for (const good of [
    ["password"],
    ["data[].wpapsk"],
    ["a.b[].c", "d"],
    ["data[].users[].password"],
    ["users.user[].password"],
    ["users[].password"],
  ]) {
    assert.deepEqual(
      checkPathItem("/rpc/SSH/get", okOp({ "x-omv-omit": good })),
      [],
      JSON.stringify(good),
    );
  }
  for (const bad of [
    [],
    "password",
    [""],
    [1],
    null,
    ["data[]"],
    ["data[]."],
    [".x"],
    ["data[][].x"],
    ["a b"],
    ["data.[].x"],
  ]) {
    assert.match(
      messages(checkPathItem("/rpc/SSH/get", okOp({ "x-omv-omit": bad }))),
      /must be a non-empty list of response field paths/,
      JSON.stringify(bad),
    );
  }
  assert.match(
    messages(
      checkPathItem(
        "/rpc/SSH/get",
        okOp({ "x-omv-omit": ["password", "password"] }),
      ),
    ),
    /names a field twice/,
  );
});

const ROWS = () => ({
  type: "object",
  properties: {
    total: { type: "integer" },
    data: {
      type: "array",
      items: {
        type: "object",
        required: ["devicename"],
        properties: { devicename: { type: "string" } },
      },
    },
  },
});

const omitCases = [
  {
    name: "a field the schema does not describe",
    op: omitOp(["password"], {
      type: "object",
      required: ["username"],
      properties: { username: { type: "string" } },
    }),
    want: [],
  },
  {
    name: "a declared field",
    op: omitOp(["password"], {
      type: "object",
      properties: { password: { type: "string" } },
    }),
    want: ["must not declare it"],
  },
  {
    name: "a required field",
    op: omitOp(["password"], { type: "object", required: ["password"] }),
    want: ["must not require it"],
  },
  {
    name: "a reply that is not an object",
    op: omitOp(["password"], { type: "string" }),
    want: ["plain object schema"],
  },
  {
    name: "a union reply",
    op: omitOp(["password"], { oneOf: [{ type: "object" }] }),
    want: ["plain object schema"],
  },
  {
    name: "no reply body",
    op: { "x-omv-omit": ["password"], responses: { 200: {} } },
    want: ["plain object schema"],
  },
  {
    name: "a field of each row the schema does not describe",
    op: omitOp(["data[].wpapsk"], ROWS()),
    want: [],
  },
  {
    name: "a declared field of each row",
    op: omitOp(["data[].devicename"], ROWS()),
    want: ["must not declare it", "must not require it"],
  },
  {
    name: "rows the schema does not declare",
    op: omitOp(["rows[].wpapsk"], ROWS()),
    want: ['must declare "rows" as a list of objects'],
  },
  {
    name: "a list step on a field that is not a list",
    op: omitOp(["total[].x"], ROWS()),
    want: ['must declare "total" as a list of objects'],
  },
  {
    name: "an object step on a list",
    op: omitOp(["data.wpapsk"], ROWS()),
    want: ['must declare "data" as an object'],
  },
  {
    name: "a nested object field",
    op: omitOp(["smtp.password"], {
      type: "object",
      properties: {
        smtp: { type: "object", properties: { port: { type: "integer" } } },
      },
    }),
    want: [],
  },
  {
    name: "rows whose item schema is a union",
    op: omitOp(["data[].x"], {
      type: "object",
      properties: {
        data: { type: "array", items: { oneOf: [{ type: "object" }] } },
      },
    }),
    want: ['must declare "data" as a list of objects'],
  },
  {
    name: "no x-omv-omit",
    op: omitOp(undefined, { type: "string" }),
    want: [],
  },
];

for (const { name, op, want } of omitCases) {
  test(`x-omv-omit: ${name}`, () => {
    const found = checkOmit(op).map((f) => f.message);
    assert.equal(found.length, want.length, found.join("\n"));
    want.forEach((w, i) => assert.ok(found[i].includes(w), found[i]));
  });
}

test("x-omv-omit: the reply's schema is resolved first", () => {
  const schema = {
    type: "object",
    properties: { password: { type: "string" } },
  };
  const op = omitOp(["password"], { $ref: "#/x" });
  const resolve = (n) => (n.$ref ? schema : n);
  assert.match(messages(checkOmit(op, resolve)), /must not declare it/);
});

test("x-omv-omit: looks inside an object schema lint restated for PHP's empty array", () => {
  const schema = {
    type: "object",
    properties: { password: { type: "string" } },
  };
  acceptEmptyArrayForObject(schema);
  assert.match(
    messages(checkOmit(omitOp(["password"], schema))),
    /must not declare it/,
  );
});

test("x-omv-omit: looks inside row schemas lint restated for PHP's empty array", () => {
  const rows = ROWS();
  const item = rows.properties.data.items;
  item.properties.wpapsk = { type: "string" };
  acceptEmptyArrayForObject(item);
  acceptEmptyArrayForObject(rows);
  assert.match(
    messages(checkOmit(omitOp(["data[].wpapsk"], rows))),
    /removes "data\[\]\.wpapsk", so the response schema must not declare it/,
  );
});

test("lint restates an x-omv-int64 string to accept a JSON integer too, once", () => {
  const schema = { type: "string", "x-omv-int64": true, description: "Bytes." };
  assert.equal(acceptIntegerForInt64(schema), true);
  assert.deepEqual(schema.anyOf, [
    { type: "string", "x-omv-int64": true, description: "Bytes." },
    { type: "integer" },
  ]);
  assert.equal(acceptIntegerForInt64(schema), false, "only once");
  assert.equal(acceptIntegerForInt64({ type: "string" }), false);
  assert.equal(acceptIntegerForInt64({ type: "integer" }), false);
});

// ---- paths into lists inside rows (x-omv-omit and x-omv-presence share the grammar and the walk) ----

// Rsyncd.getModuleList: rows, each with a list of sign-ins.
const MODULE_ROWS = (signIn = { name: { type: "string" } }) => ({
  type: "object",
  properties: {
    total: { type: "integer" },
    data: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          users: {
            type: "array",
            items: { type: "object", properties: signIn },
          },
        },
      },
    },
  },
});

// Rsyncd.setModule: the stored shape, an object holding the list.
const STORED_MODULE = (signIn = { name: { type: "string" } }) => ({
  type: "object",
  properties: {
    uuid: { type: "string" },
    users: {
      type: "object",
      properties: {
        user: {
          type: "array",
          items: { type: "object", properties: signIn },
        },
      },
    },
  },
});

const nestedOmitCases = [
  {
    name: "a field of every item of a list inside every row",
    op: omitOp(["data[].users[].password"], MODULE_ROWS()),
    want: [],
  },
  {
    name: "a field of every item of a list inside an object",
    op: omitOp(["users.user[].password"], STORED_MODULE()),
    want: [],
  },
  {
    name: "a declared field of a list inside every row",
    op: omitOp(
      ["data[].users[].password"],
      MODULE_ROWS({ password: { type: "string" } }),
    ),
    want: [
      'removes "data[].users[].password", so the response schema must not declare it',
    ],
  },
  {
    name: "a list inside the rows that the schema does not declare",
    op: omitOp(["data[].peers[].password"], MODULE_ROWS()),
    want: ['"data[]" must declare "peers" as a list of objects'],
  },
  {
    name: "a list step on the object that holds the list",
    op: omitOp(["users[].password"], STORED_MODULE()),
    want: ['the reply must declare "users" as a list of objects'],
  },
  {
    name: "an object step on the list inside the object",
    op: omitOp(["users.user.password"], STORED_MODULE()),
    want: ['"users" must declare "user" as an object'],
  },
];

for (const { name, op, want } of nestedOmitCases) {
  test(`x-omv-omit: ${name}`, () => {
    const found = checkOmit(op).map((f) => f.message);
    assert.equal(found.length, want.length, found.join("\n"));
    want.forEach((w, i) => assert.ok(found[i].includes(w), found[i]));
  });
}

test("x-omv-omit: a list inside rows, both lint restated for PHP's empty array", () => {
  const rows = MODULE_ROWS({ password: { type: "string" } });
  const row = rows.properties.data.items;
  acceptEmptyArrayForObject(row.properties.users.items);
  acceptEmptyArrayForObject(row);
  acceptEmptyArrayForObject(rows);
  assert.match(
    messages(checkOmit(omitOp(["data[].users[].password"], rows))),
    /must not declare it/,
  );
});

// ---- x-omv-presence ----

const presenceOp = (presence, schema, over = {}) => ({
  "x-omv-presence": presence,
  responses: {
    200: { content: { "application/json": { schema } } },
  },
  ...over,
});

const BOOL = { password: { type: "boolean" } };

test("x-omv-presence: shape", () => {
  for (const good of [
    ["password"],
    ["data[].password"],
    ["data[].users[].password"],
    ["users.user[].password"],
  ]) {
    assert.deepEqual(
      checkPathItem("/rpc/SSH/get", okOp({ "x-omv-presence": good })),
      [],
      JSON.stringify(good),
    );
  }
  for (const bad of [
    [],
    "password",
    [""],
    [1],
    null,
    {},
    ["data[]"],
    ["data[]."],
    [".x"],
    ["data[][].x"],
    ["a b"],
    ["data.[].x"],
    ["users.user[]"],
  ]) {
    assert.match(
      messages(checkPathItem("/rpc/SSH/get", okOp({ "x-omv-presence": bad }))),
      /x-omv-presence must be a non-empty list of response field paths/,
      JSON.stringify(bad),
    );
  }
  assert.match(
    messages(
      checkPathItem(
        "/rpc/SSH/get",
        okOp({ "x-omv-presence": ["password", "password"] }),
      ),
    ),
    /x-omv-presence names a field twice/,
  );
});

test("x-omv-presence: a path cannot also be in x-omv-omit", () => {
  const found = checkPathItem(
    "/rpc/SSH/get",
    okOp({
      "x-omv-omit": ["secret", "data[].password"],
      "x-omv-presence": ["password", "data[].password"],
    }),
  );
  assert.equal(found.length, 1, messages(found));
  assert.match(
    found[0].message,
    /"data\[\]\.password" is in both x-omv-omit and x-omv-presence/,
  );
  assert.deepEqual(found[0].at, ["post", "x-omv-presence"]);
  // Disjoint lists pass.
  assert.deepEqual(
    checkPathItem(
      "/rpc/SSH/get",
      okOp({ "x-omv-omit": ["secret"], "x-omv-presence": ["password"] }),
    ),
    [],
  );
});

const presenceCases = [
  {
    name: "a top-level boolean",
    op: presenceOp(["password"], { type: "object", properties: BOOL }),
    want: [],
  },
  {
    name: "a required top-level boolean",
    op: presenceOp(["password"], {
      type: "object",
      required: ["password"],
      properties: BOOL,
    }),
    want: [],
  },
  {
    name: "a boolean of each row",
    op: presenceOp(["data[].password"], {
      type: "object",
      properties: {
        data: { type: "array", items: { type: "object", properties: BOOL } },
      },
    }),
    want: [],
  },
  {
    name: "a boolean of every item of a list inside every row",
    op: presenceOp(["data[].users[].password"], MODULE_ROWS(BOOL)),
    want: [],
  },
  {
    name: "a boolean of every item of a list inside an object",
    op: presenceOp(["users.user[].password"], STORED_MODULE(BOOL)),
    want: [],
  },
  {
    name: "a field the schema does not declare",
    op: presenceOp(["password"], {
      type: "object",
      properties: { username: { type: "string" } },
    }),
    want: [
      'replaces "password" by whether it is set, so the response schema must declare it',
    ],
  },
  {
    name: "a field declared as the string the server sends",
    op: presenceOp(["password"], {
      type: "object",
      properties: { password: { type: "string" } },
    }),
    want: ["must declare it as type: boolean"],
  },
  {
    name: "a nullable boolean",
    op: presenceOp(["password"], {
      type: "object",
      properties: { password: { type: "boolean", nullable: true } },
    }),
    want: ["must declare it as type: boolean"],
  },
  {
    name: "a boolean that allows one value only",
    op: presenceOp(["password"], {
      type: "object",
      properties: { password: { type: "boolean", enum: [true] } },
    }),
    want: ["must declare it as type: boolean"],
  },
  {
    name: "a union",
    op: presenceOp(["password"], {
      type: "object",
      properties: {
        password: { oneOf: [{ type: "boolean" }, { type: "string" }] },
      },
    }),
    want: ["must declare it as type: boolean"],
  },
  {
    name: "a field of a list inside the rows declared as a string",
    op: presenceOp(
      ["data[].users[].password"],
      MODULE_ROWS({ password: { type: "string" } }),
    ),
    want: ['replaces "data[].users[].password" by true or false'],
  },
  {
    name: "a list inside the rows the schema does not declare",
    op: presenceOp(["data[].peers[].password"], MODULE_ROWS(BOOL)),
    want: [
      'x-omv-presence "data[].peers[].password": "data[]" must declare "peers" as a list of objects',
    ],
  },
  {
    name: "a list step on the object that holds the list",
    op: presenceOp(["users[].password"], STORED_MODULE(BOOL)),
    want: ['the reply must declare "users" as a list of objects'],
  },
  {
    name: "a reply that is not an object",
    op: presenceOp(["password"], { type: "boolean" }),
    want: [
      "x-omv-presence applies only to an operation whose 200 reply is a plain object schema",
    ],
  },
  {
    name: "a union reply",
    op: presenceOp(["password"], {
      anyOf: [{ type: "object", properties: BOOL }],
    }),
    want: ["plain object schema"],
  },
  {
    name: "no reply body",
    op: { "x-omv-presence": ["password"], responses: { 200: {} } },
    want: ["plain object schema"],
  },
  {
    name: "no x-omv-presence",
    op: presenceOp(undefined, { type: "string" }),
    want: [],
  },
  {
    name: "several paths, each checked",
    op: presenceOp(["password", "other", "data[].x"], {
      type: "object",
      properties: { ...BOOL, other: { type: "integer" } },
    }),
    want: [
      '"other" by true or false',
      'x-omv-presence "data[].x": the reply must declare "data" as a list of objects',
    ],
  },
];

for (const { name, op, want } of presenceCases) {
  test(`x-omv-presence: ${name}`, () => {
    const found = checkPresence(op).map((f) => f.message);
    assert.equal(found.length, want.length, found.join("\n"));
    want.forEach((w, i) => assert.ok(found[i].includes(w), found[i]));
  });
}

test("x-omv-presence: the reply's schema and the leaf are resolved first", () => {
  const shared = { Bool: { type: "boolean" }, Str: { type: "string" } };
  const resolve = (n) =>
    n.$ref ? (n.$ref === "#/reply" ? reply : shared[n.$ref.slice(2)]) : n;
  let reply = { type: "object", properties: { password: { $ref: "#/Bool" } } };
  assert.deepEqual(
    checkPresence(presenceOp(["password"], { $ref: "#/reply" }), resolve),
    [],
  );
  reply = { type: "object", properties: { password: { $ref: "#/Str" } } };
  assert.match(
    messages(
      checkPresence(presenceOp(["password"], { $ref: "#/reply" }), resolve),
    ),
    /as type: boolean/,
  );
});

// ---- lint-time restating for x-omv-presence ----

test("lint restates a presence boolean to accept the string the server sends, once", () => {
  const schema = STORED_MODULE({
    name: { type: "string" },
    password: { type: "boolean", description: "Whether set." },
  });
  const op = presenceOp(["users.user[].password"], schema);
  assert.equal(acceptStringForPresence(op), 1);
  const signIn = schema.properties.users.properties.user.items.properties;
  assert.deepEqual(signIn.password, {
    anyOf: [
      { type: "boolean", description: "Whether set." },
      { type: "string" },
    ],
    "x-omv-lint-restated": true,
  });
  assert.deepEqual(signIn.name, { type: "string" }, "other fields untouched");
  assert.equal(acceptStringForPresence(op), 0, "only once");
  // The checks look inside the restated form: still a valid presence field.
  assert.deepEqual(checkPresence(op), []);
  // And x-omv-omit sees it as declared.
  assert.match(
    messages(checkOmit({ ...op, "x-omv-omit": ["users.user[].password"] })),
    /must not declare it/,
  );
});

test("lint restating of a presence field leaves a shared boolean schema alone", () => {
  const Bool = { type: "boolean" };
  const entry = { $ref: "#/Bool" };
  const schema = { type: "object", properties: { password: entry } };
  const resolve = (n) => (n.$ref === "#/Bool" ? Bool : n);
  assert.equal(
    acceptStringForPresence(presenceOp(["password"], schema), resolve),
    1,
  );
  assert.deepEqual(schema.properties.password, {
    anyOf: [entry, { type: "string" }],
    "x-omv-lint-restated": true,
  });
  assert.deepEqual(Bool, { type: "boolean" });
  assert.deepEqual(
    checkPresence(presenceOp(["password"], schema), resolve),
    [],
  );
});

test("lint restating of a presence field works through rows restated for PHP's empty array", () => {
  const rows = MODULE_ROWS({ password: { type: "boolean" } });
  const row = rows.properties.data.items;
  acceptEmptyArrayForObject(row.properties.users.items);
  acceptEmptyArrayForObject(row);
  acceptEmptyArrayForObject(rows);
  const op = presenceOp(["data[].users[].password"], rows);
  assert.equal(acceptStringForPresence(op), 1);
  assert.deepEqual(checkPresence(op), []);
  const signIn =
    rows.anyOf[0].properties.data.items.anyOf[0].properties.users.items.anyOf[0]
      .properties;
  assert.deepEqual(signIn.password.anyOf[1], { type: "string" });
});

test("lint restating of presence leaves everything checkPresence would report", () => {
  for (const op of [
    presenceOp(["password"], {
      type: "object",
      properties: { password: { type: "string" } },
    }),
    presenceOp(["password"], { type: "object", properties: {} }),
    presenceOp(["data[].password"], { type: "object", properties: BOOL }),
    presenceOp(["password"], { type: "boolean" }),
    presenceOp(["bad path"], { type: "object", properties: BOOL }),
    presenceOp("password", { type: "object", properties: BOOL }),
    { responses: {} },
  ]) {
    const before = JSON.stringify(op);
    assert.equal(acceptStringForPresence(op), 0, before);
    assert.equal(JSON.stringify(op), before);
  }
});

test("x-omv-presence is a known operation extension", () => {
  assert.doesNotMatch(
    messages(
      checkPathItem("/rpc/SSH/get", okOp({ "x-omv-presence": ["password"] })),
    ),
    /Unknown operation extension/,
  );
});
