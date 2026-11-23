// SPDX-License-Identifier: GPL-3.0-or-later
// x-omv-presence through the transport (UI-6): a reply that carries a stored password reaches the
// caller with a boolean in its place, and the string reaches nothing else either: not normalisation,
// not the development-build validator or its console report. The operation table is extended with
// test operations shaped as the rsync replies are (a field of each row, a list inside each row, a
// list inside an object), so this does not depend on which operations the contract holds.
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { OperationEntry, Schema } from "../contract/types.ts";
import { rpcClient } from "./rpcClient.ts";

// Hoisted with vi.mock, which runs before the module's own top-level code.
const TEST_OPERATIONS = vi.hoisted(() => {
  const SIGN_IN: Schema = {
    type: "object",
    required: ["name", "password"],
    properties: { name: { type: "string" }, password: { type: "boolean" } },
  };

  const operations = {
    "/rpc/PresenceTest/getList": {
      operationId: "presenceTestGetList",
      service: "PresenceTest",
      method: "getList",
      role: "admin",
      readonly: true,
      dirty: false,
      presence: ["data[].password"],
      response: {
        type: "object",
        required: ["total", "data"],
        properties: {
          total: { type: "integer" },
          data: {
            type: "array",
            items: {
              type: "object",
              required: ["uuid", "password"],
              properties: {
                uuid: { type: "string" },
                port: { type: "integer" },
                password: { type: "boolean" },
              },
            },
          },
        },
      },
    },
    "/rpc/PresenceTest/getModuleList": {
      operationId: "presenceTestGetModuleList",
      service: "PresenceTest",
      method: "getModuleList",
      role: "admin",
      readonly: true,
      dirty: false,
      presence: ["data[].users[].password"],
      response: {
        type: "object",
        properties: {
          total: { type: "integer" },
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                users: { type: "array", items: SIGN_IN },
              },
            },
          },
        },
      },
    },
    "/rpc/PresenceTest/setModule": {
      operationId: "presenceTestSetModule",
      service: "PresenceTest",
      method: "setModule",
      role: "admin",
      readonly: false,
      dirty: false,
      omit: ["secret"],
      presence: ["users.user[].password"],
      response: {
        type: "object",
        properties: {
          uuid: { type: "string" },
          users: {
            type: "object",
            properties: { user: { type: "array", items: SIGN_IN } },
          },
        },
      },
    },
  } satisfies Record<string, OperationEntry>;
  return operations;
});

vi.mock(
  import("../contract/generated/operations.ts"),
  async (importOriginal) => {
    const original = await importOriginal();
    return {
      ...original,
      OPERATIONS: { ...original.OPERATIONS, ...TEST_OPERATIONS },
    };
  },
);

// A value no example contains, so finding it anywhere means the replacement failed.
const SECRET = "not-a-real-rsync-password-5d1c";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const reply = (response: unknown) =>
  server.use(
    http.post("*/rpc.php", () =>
      HttpResponse.json({ response, error: null }, { status: 200 }),
    ),
  );

const call = (url: keyof typeof TEST_OPERATIONS) =>
  rpcClient<unknown>({ url, method: "POST", data: {} });

describe("fields the contract replaces by whether they are set (x-omv-presence, UI-6)", () => {
  it.each<{
    name: string;
    url: keyof typeof TEST_OPERATIONS;
    raw: unknown;
    want: unknown;
  }>([
    {
      name: "a field of every row",
      url: "/rpc/PresenceTest/getList",
      raw: {
        total: 3,
        data: [
          { uuid: "a", password: SECRET },
          { uuid: "b", password: "" },
          { uuid: "c" },
        ],
      },
      want: {
        total: 3,
        data: [
          { uuid: "a", password: true },
          { uuid: "b", password: false },
          { uuid: "c", password: false },
        ],
      },
    },
    {
      name: "a list inside every row",
      url: "/rpc/PresenceTest/getModuleList",
      raw: {
        total: 2,
        data: [
          {
            name: "backup",
            users: [
              { name: "u", password: SECRET },
              { name: "v", password: "" },
            ],
          },
          { name: "media", users: [{ name: "w", password: SECRET }] },
        ],
      },
      want: {
        total: 2,
        data: [
          {
            name: "backup",
            users: [
              { name: "u", password: true },
              { name: "v", password: false },
            ],
          },
          { name: "media", users: [{ name: "w", password: true }] },
        ],
      },
    },
    {
      name: "a list inside an object, beside a field the contract omits",
      url: "/rpc/PresenceTest/setModule",
      raw: {
        uuid: "x",
        secret: SECRET,
        users: { user: [{ name: "u", password: SECRET }] },
      },
      want: { uuid: "x", users: { user: [{ name: "u", password: true }] } },
    },
  ])(
    "$name: the server's reply carries the password, the caller gets a boolean",
    async ({ url, raw, want }) => {
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      expect(JSON.stringify(raw)).toContain(SECRET);
      reply(raw);
      const value = await call(url);
      expect(value).toEqual(want);
      expect(JSON.stringify(value)).not.toContain(SECRET);
      // The replacement comes before development-build validation: a string where the schema says
      // boolean would have been reported.
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it("reaches PHP's object form of a list, at both levels", async () => {
    // The validator reports the object where the schema says list (normalisation does not turn it
    // into one); the report must not carry the password either.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    reply({
      total: 2,
      data: {
        "0": {
          name: "backup",
          users: { "1": { name: "w", password: SECRET } },
        },
        "2": { name: "media", users: [{ name: "v", password: "" }] },
      },
    });
    const value = await call("/rpc/PresenceTest/getModuleList");
    expect(value).toEqual({
      total: 2,
      data: {
        "0": { name: "backup", users: { "1": { name: "w", password: true } } },
        "2": { name: "media", users: [{ name: "v", password: false }] },
      },
    });
    expect(JSON.stringify(value)).not.toContain(SECRET);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
  });

  it("replaces the field before validation, so a mismatch report never carries it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    reply({
      total: 1,
      // A wrong type elsewhere in the row, so the mismatch report runs and is checked too.
      data: [{ uuid: "a", port: "873", password: SECRET }],
    });
    const value = await call("/rpc/PresenceTest/getList");
    expect(warn).toHaveBeenCalledWith(
      "[contract] presenceTestGetList: the reply does not match the contract",
      ["$.data[0].port: expected integer, got string"],
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
    expect(value).toEqual({
      total: 1,
      data: [{ uuid: "a", port: "873", password: true }],
    });
  });

  it.each([
    { name: "PHP's [] for an empty map", raw: [], want: {} },
    {
      name: "the object holding the list is absent",
      raw: { uuid: "x" },
      want: { uuid: "x" },
    },
    {
      name: "the object holding the list is PHP's []",
      raw: { uuid: "x", users: [] },
      want: { uuid: "x", users: {} },
    },
  ])(
    "creates nothing where the path finds nothing: $name",
    async ({ raw, want }) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      reply(raw);
      expect(await call("/rpc/PresenceTest/setModule")).toEqual(want);
    },
  );
});
