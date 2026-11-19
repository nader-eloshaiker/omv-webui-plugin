// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { test } from "node:test";
import { toYaml } from "./yaml.mjs";

test("block style for nested data, inline for empty collections", () => {
  const out = toYaml({
    a: 1,
    b: { c: true, d: null },
    e: ["x", { f: "why" }],
    g: [],
    h: {},
  });
  assert.equal(
    out,
    "a: 1\nb:\n  c: true\n  d: null\ne:\n  - x\n  - f: why\ng: []\nh: {}\n",
  );
});

test("strings that plain style would misread are quoted", () => {
  const out = toYaml({
    a: "true",
    b: "22",
    c: "",
    d: "x: y",
    e: "line\nbreak",
    f: "-1",
    g: "plain text",
  });
  assert.equal(
    out,
    'a: "true"\nb: "22"\nc: ""\nd: "x: y"\ne: "line\\nbreak"\nf: "-1"\ng: plain text\n',
  );
});

test("scalars and empties at the top", () => {
  assert.equal(toYaml(false), "false\n");
  assert.equal(toYaml([]), "[]\n");
  assert.equal(toYaml("x"), "x\n");
});
