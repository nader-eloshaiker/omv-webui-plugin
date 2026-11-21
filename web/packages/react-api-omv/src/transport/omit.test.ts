// SPDX-License-Identifier: GPL-3.0-or-later
// The x-omv-omit paths (UI-6): top-level fields and fields of each row, on every shape a reply can
// take. The transport tests prove the same through rpcClient for the operations that use it.
import { describe, expect, it } from "vitest";
import { withoutOmitted } from "./omit.ts";

const SECRET = "not-a-real-secret-41c9";

describe("withoutOmitted", () => {
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
      name: "a top-level field",
      value: { password: SECRET, username: "u" },
      paths: ["password"],
      want: { username: "u" },
    },
    {
      name: "a top-level field that is absent",
      value: { username: "u" },
      paths: ["password"],
      want: { username: "u" },
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
    { name: "null", value: null, paths: ["data[].wpapsk"], want: null },
    {
      name: "a field of every row",
      value: {
        total: 2,
        data: [
          { devicename: "wlan0", wpassid: "x", wpapsk: SECRET },
          { devicename: "eth0", wpapsk: "" },
        ],
      },
      paths: ["data[].wpapsk"],
      want: {
        total: 2,
        data: [{ devicename: "wlan0", wpassid: "x" }, { devicename: "eth0" }],
      },
    },
    {
      name: "rows sent as an object (a PHP list with gaps in its keys)",
      value: {
        data: { "0": { wpapsk: SECRET, a: 1 }, "2": { wpapsk: SECRET } },
      },
      paths: ["data[].wpapsk"],
      want: { data: { "0": { a: 1 }, "2": {} } },
    },
    {
      name: "rows that are not objects",
      value: { data: ["lo", 3, null, []] },
      paths: ["data[].wpapsk"],
      want: { data: ["lo", 3, null, []] },
    },
    {
      name: "no list where the path expects one",
      value: { total: 0, data: "none" },
      paths: ["data[].wpapsk"],
      want: { total: 0, data: "none" },
    },
    {
      name: "the list is absent",
      value: { total: 0 },
      paths: ["data[].wpapsk"],
      want: { total: 0 },
    },
    {
      name: "an empty list",
      value: { total: 0, data: [] },
      paths: ["data[].wpapsk"],
      want: { total: 0, data: [] },
    },
    {
      name: "a field inside one nested object",
      value: { smtp: { password: SECRET, port: 25 } },
      paths: ["smtp.password"],
      want: { smtp: { port: 25 } },
    },
    {
      name: "rows inside rows",
      value: { data: [{ peers: [{ key: SECRET, name: "a" }] }] },
      paths: ["data[].peers[].key"],
      want: { data: [{ peers: [{ name: "a" }] }] },
    },
    {
      name: "several paths",
      value: { password: SECRET, data: [{ wpapsk: SECRET, a: 1 }] },
      paths: ["password", "data[].wpapsk"],
      want: { data: [{ a: 1 }] },
    },
    {
      name: "a field of the same name outside the path",
      value: { wpapsk: "top", data: [{ wpapsk: SECRET }] },
      paths: ["data[].wpapsk"],
      want: { wpapsk: "top", data: [{}] },
    },
  ])("$name", ({ value, paths, want }) => {
    const out = withoutOmitted(value, paths);
    expect(out).toEqual(want);
    if (paths?.length) {
      expect(JSON.stringify(out) ?? "").not.toContain(SECRET);
    }
  });

  it("does not change its input", () => {
    const value = { data: [{ wpapsk: SECRET }] };
    withoutOmitted(value, ["data[].wpapsk"]);
    expect(value).toEqual({ data: [{ wpapsk: SECRET }] });
  });

  it.each(["", "data[]", "data[].", ".x", "data[][].x", "a b", "data.[].x"])(
    "refuses the malformed path %j",
    (path) => {
      expect(() => withoutOmitted({}, [path])).toThrow(/x-omv-omit path/);
    },
  );
});
