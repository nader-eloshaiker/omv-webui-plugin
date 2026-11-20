// SPDX-License-Identifier: GPL-3.0-or-later
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  directiveArgs,
  findLocation,
  headersOf,
  locations,
  parseNginxConf,
} from "./nginx-conf.mjs";

const SNIPPET = new URL(
  "../../etc/nginx/openmediavault-webgui.d/openmediavault-webui.conf",
  import.meta.url,
);

test("parses directives, blocks, comments and quoted strings", () => {
  const tree = parseNginxConf(
    [
      "# a comment",
      "location ^~ /a/ {   # trailing comment",
      '  add_header X-One "a b; c" always;',
      "  add_header X-Two 'it''s' always;".replace("''", "\\'"),
      "  types { }",
      '  return 404 "Not found\\n";',
      "  location ^~ /a/b/ { try_files $uri =404; }",
      "}",
    ].join("\n"),
  );
  assert.equal(tree.length, 1);
  const a = findLocation(tree, ["^~", "/a/"]);
  assert.equal(a.line, 2);
  assert.deepEqual(headersOf(a), [
    { name: "X-One", value: "a b; c" },
    { name: "X-Two", value: "it's" },
  ]);
  assert.deepEqual(directiveArgs(a, "return"), ["404", "Not found\n"]);
  assert.deepEqual(directiveArgs(a, "types"), []);
  assert.deepEqual(
    directiveArgs(findLocation(tree, ["^~", "/a/b/"]), "try_files"),
    ["$uri", "=404"],
  );
  assert.deepEqual(
    [...locations(tree)].map((l) => l.args.join(" ")),
    ["^~ /a/", "^~ /a/b/"],
  );
});

const MALFORMED = [
  {
    name: "unterminated quote",
    input: 'add_header X "open;',
    error: /unterminated quoted string \(line 1\)/,
  },
  {
    name: "missing semicolon at the end",
    input: "listen 80",
    error: /"listen" is not terminated/,
  },
  {
    name: "missing semicolon before }",
    input: "location /a { root /x }",
    error: /"root" is not terminated/,
  },
  {
    name: "unclosed block",
    input: "location /a {\n root /x;",
    error: /"location" block is not closed \(line 1\)/,
  },
  {
    name: "stray closing brace",
    input: "root /x;\n}",
    error: /unexpected '}' \(line 2\)/,
  },
  { name: "stray semicolon", input: ";", error: /unexpected ';'/ },
  {
    name: "quote glued to a word",
    input: 'add_header X"y" z;',
    error: /a quote inside a word/,
  },
  {
    name: "word glued to a quote",
    input: 'add_header "X"y z;',
    error: /must be followed by a space/,
  },
  {
    name: "escape outside quotes",
    input: "return 200 a\\b;",
    error: /escape outside quotes/,
  },
];

for (const { name, input, error } of MALFORMED) {
  test(`rejects malformed input: ${name}`, () => {
    assert.throws(() => parseNginxConf(input), error);
  });
}

const HEADER_ERRORS = [
  { name: "no always", input: "location /a { add_header X y; }" },
  { name: "extra argument", input: "location /a { add_header X y z always; }" },
  { name: "name only", input: "location /a { add_header X always; }" },
];

for (const { name, input } of HEADER_ERRORS) {
  test(`headersOf refuses add_header with ${name}`, () => {
    const loc = findLocation(parseNginxConf(input), ["/a"]);
    assert.throws(
      () => headersOf(loc),
      /must be "add_header <name> <value> always"/,
    );
  });
}

test("findLocation and directiveArgs fail when the target is missing or repeated", () => {
  const tree = parseNginxConf(
    "location /a { root /x; root /y; } location /a { }",
  );
  assert.throws(
    () => findLocation(tree, ["/b"]),
    /expected one location \/b, found 0/,
  );
  assert.throws(() => findLocation(tree, ["/a"]), /found 2/);
  assert.throws(
    () => directiveArgs(tree[0], "root"),
    /expected one root .* found 2/,
  );
});

// --- The plugin's snippet: the UI-1 header set, the same in every location that answers. ---

const UI1_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
];
const UI1_FIXED = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const tree = parseNginxConf(readFileSync(SNIPPET, "utf8"));
const SERVING = {
  app: findLocation(tree, ["^~", "/ui/"]),
  assets: findLocation(tree, ["^~", "/ui/assets/"]),
  missing: findLocation(tree, ["@openmediavault_webui_missing"]),
};

for (const [which, location] of Object.entries(SERVING)) {
  test(`snippet: the ${which} location sends exactly the UI-1 headers`, () => {
    const headers = headersOf(location);
    const names = headers.map((h) => h.name.toLowerCase());
    assert.equal(new Set(names).size, names.length, "a header is set twice");
    const byName = Object.fromEntries(headers.map((h) => [h.name, h.value]));
    assert.deepEqual(
      byName["Content-Security-Policy"].split(";").map((d) => d.trim()),
      UI1_CSP,
    );
    for (const [name, value] of Object.entries(UI1_FIXED)) {
      assert.equal(byName[name], value, name);
    }
    const features = byName["Permissions-Policy"]
      .split(",")
      .map((f) => f.trim());
    assert.ok(features.length > 0);
    for (const feature of features) {
      assert.match(feature, /^[a-z-]+=\(\)$/, "every feature is denied");
    }
    assert.ok(byName["Cache-Control"], "a cache policy is set");
    assert.deepEqual(
      Object.keys(byName).sort(),
      [
        ...Object.keys(UI1_FIXED),
        "Content-Security-Policy",
        "Permissions-Policy",
        "Cache-Control",
      ].sort(),
      "no other header",
    );
  });
}

test("snippet: the security headers are the same in every location; only caching differs", () => {
  const security = (loc) =>
    headersOf(loc).filter((h) => h.name !== "Cache-Control");
  assert.deepEqual(security(SERVING.assets), security(SERVING.app));
  assert.deepEqual(security(SERVING.missing), security(SERVING.app));
});

test("snippet: routing is what the browser test's server reproduces", () => {
  const redirect = findLocation(tree, ["=", "/ui"]);
  assert.deepEqual(directiveArgs(redirect, "return"), ["301", "/ui/"]);
  assert.deepEqual(directiveArgs(SERVING.app, "try_files"), [
    "$uri",
    "/ui/index.html",
  ]);
  assert.deepEqual(directiveArgs(SERVING.assets, "try_files"), [
    "$uri",
    "=404",
  ]);
  assert.deepEqual(directiveArgs(SERVING.assets, "error_page"), [
    "404",
    "@openmediavault_webui_missing",
  ]);
  assert.deepEqual(directiveArgs(SERVING.missing, "return"), [
    "404",
    "Not found\n",
  ]);
});

test("snippet: no request variable in a header or a reply, and no proxying (docs/06)", () => {
  const all = [];
  const walk = (ds) => {
    for (const d of ds) {
      all.push(d);
      walk(d.block ?? []);
    }
  };
  walk(tree);
  assert.ok(
    !all.some((d) => /^(proxy_|fastcgi_|uwsgi_|scgi_|grpc_)/.test(d.name)),
  );
  for (const d of all.filter(
    (d) => d.name === "add_header" || d.name === "return",
  )) {
    assert.ok(
      !d.args.some((a) => a.includes("$")),
      `line ${d.line} uses a variable`,
    );
  }
});
