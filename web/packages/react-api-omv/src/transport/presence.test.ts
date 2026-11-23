// SPDX-License-Identifier: GPL-3.0-or-later
// The x-omv-presence paths (UI-6): a stored password becomes whether it is set, at the top level, in
// every row and in lists inside rows, on every shape a reply can take. The transport tests prove the
// same through rpcClient.
import { describe, expect, it } from "vitest";
import { withPresence } from "./presence.ts";

const SECRET = "not-a-real-secret-9b2e";

describe("withPresence", () => {
  it.each<{
    name: string;
    value: unknown;
    paths: readonly string[] | undefined;
    want: unknown;
  }>([
    {
      name: "no paths",
      value: { password: SECRET },
      paths: undefined,
      want: { password: SECRET },
    },
    {
      name: "an empty list of paths",
      value: { password: SECRET },
      paths: [],
      want: { password: SECRET },
    },
    {
      name: "a non-empty string is set",
      value: { password: SECRET, username: "u" },
      paths: ["password"],
      want: { password: true, username: "u" },
    },
    {
      name: "an empty string is not set",
      value: { password: "", username: "u" },
      paths: ["password"],
      want: { password: false, username: "u" },
    },
    {
      name: "an absent field is not set, and is added",
      value: { username: "u" },
      paths: ["password"],
      want: { username: "u", password: false },
    },
    ...[null, 0, 1, true, false, [], {}, [SECRET], { value: SECRET }].map(
      (password) => ({
        name: `a value that is not a string (${JSON.stringify(password)}) is not set`,
        value: { password },
        paths: ["password"],
        want: { password: false },
      }),
    ),
    {
      name: "a string of spaces is a string",
      value: { password: " " },
      paths: ["password"],
      want: { password: true },
    },
    {
      name: "the field keeps its place among the others",
      value: { a: 1, password: SECRET, b: 2 },
      paths: ["password"],
      want: { a: 1, password: true, b: 2 },
    },
    {
      name: "PHP's [] for an empty map",
      value: [],
      paths: ["password"],
      want: [],
    },
    {
      name: "a string reply",
      value: "text",
      paths: ["password"],
      want: "text",
    },
    { name: "null", value: null, paths: ["data[].password"], want: null },
    {
      name: "a field of every row (Rsync.getList)",
      value: {
        total: 3,
        data: [
          { uuid: "a", password: SECRET },
          { uuid: "b", password: "" },
          { uuid: "c" },
        ],
      },
      paths: ["data[].password"],
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
      name: "a list inside every row (Rsyncd.getModuleList)",
      value: {
        total: 2,
        data: [
          {
            name: "a",
            users: [
              { name: "u", password: SECRET },
              { name: "v", password: "" },
            ],
          },
          { name: "b", users: [] },
        ],
      },
      paths: ["data[].users[].password"],
      want: {
        total: 2,
        data: [
          {
            name: "a",
            users: [
              { name: "u", password: true },
              { name: "v", password: false },
            ],
          },
          { name: "b", users: [] },
        ],
      },
    },
    {
      name: "a list inside an object (Rsyncd.setModule's stored shape)",
      value: { uuid: "x", users: { user: [{ name: "u", password: SECRET }] } },
      paths: ["users.user[].password"],
      want: { uuid: "x", users: { user: [{ name: "u", password: true }] } },
    },
    {
      name: "PHP's object form of a list at both levels",
      value: {
        data: {
          "0": { users: { "2": { name: "u", password: SECRET } } },
          "4": { users: [{ password: "" }] },
        },
      },
      paths: ["data[].users[].password"],
      want: {
        data: {
          "0": { users: { "2": { name: "u", password: true } } },
          "4": { users: [{ password: false }] },
        },
      },
    },
    {
      name: "PHP's object form of the list inside an object",
      value: { users: { user: { "0": { password: SECRET }, "3": {} } } },
      paths: ["users.user[].password"],
      want: {
        users: { user: { "0": { password: true }, "3": { password: false } } },
      },
    },
    {
      name: "no row or object is created where the path finds none",
      value: {
        total: 0,
        a: { uuid: "x" },
        b: { users: [] },
        c: { users: null },
      },
      paths: [
        "data[].password",
        "a.users.user[].password",
        "b.users.user[].password",
        "c.users.user[].password",
      ],
      want: {
        total: 0,
        a: { uuid: "x" },
        b: { users: [] },
        c: { users: null },
      },
    },
    {
      name: "rows without the inner list, or with something else there",
      value: {
        data: [
          { name: "a" },
          { name: "b", users: "none" },
          { name: "c", users: { "0": { password: SECRET } } },
        ],
      },
      paths: ["data[].users[].password"],
      want: {
        data: [
          { name: "a" },
          { name: "b", users: "none" },
          { name: "c", users: { "0": { password: true } } },
        ],
      },
    },
    {
      name: "rows and inner items that are not objects are left as they are",
      value: {
        data: ["lo", 3, null, [], { users: [SECRET, null, [], {}] }],
      },
      paths: ["data[].users[].password"],
      want: {
        data: [
          "lo",
          3,
          null,
          [],
          { users: [SECRET, null, [], { password: false }] },
        ],
      },
    },
    {
      name: "a field inside one nested object",
      value: { remote: { password: SECRET, port: 873 } },
      paths: ["remote.password"],
      want: { remote: { password: true, port: 873 } },
    },
    {
      name: "a field of the same name outside the path",
      value: { password: "top", data: [{ password: SECRET }] },
      paths: ["data[].password"],
      want: { password: "top", data: [{ password: true }] },
    },
    {
      name: "several paths",
      value: { password: SECRET, data: [{ key: "" }] },
      paths: ["password", "data[].key"],
      want: { password: true, data: [{ key: false }] },
    },
  ])("$name", ({ value, paths, want }) => {
    const out = withPresence(value, paths);
    expect(out).toEqual(want);
  });

  it("leaves no stored string anywhere the paths reach", () => {
    const value = {
      password: SECRET,
      data: { "0": { password: SECRET, users: [{ password: SECRET }] } },
      users: { user: { "5": { password: SECRET } } },
    };
    const out = withPresence(value, [
      "password",
      "data[].password",
      "data[].users[].password",
      "users.user[].password",
    ]);
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it("does not change its input", () => {
    const value = { data: [{ users: [{ password: SECRET }] }, { name: "b" }] };
    const before = structuredClone(value);
    withPresence(value, ["data[].users[].password", "data[].password"]);
    expect(value).toEqual(before);
  });

  it.each([
    "",
    "data[]",
    "data[].",
    ".x",
    "data[][].x",
    "a b",
    "data.[].x",
    "x.y[]",
  ])("refuses the malformed path %j", (path) => {
    expect(() => withPresence({}, [path])).toThrow(/x-omv-presence path/);
  });
});
