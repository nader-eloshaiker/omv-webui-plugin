// SPDX-License-Identifier: GPL-3.0-or-later
// The NAS map's motions (src/nas-map.css, rethink 6.8, 7.2, 7.6, 7.10): each runs on the motion
// tokens, only in answer to a cause (the first visit, a problem arriving, a ghost becoming real),
// once, and with no colour of its own.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(PKG, "package.json"));

async function loadStylesheet(id, base) {
  let file;
  if (id.startsWith(".") || id.startsWith("/")) {
    file = path.resolve(base, id);
  } else if (id === "tailwindcss") {
    file = require.resolve("tailwindcss/index.css");
  } else {
    file = createRequire(path.join(base, "index.js")).resolve(id);
  }
  return {
    path: file,
    base: path.dirname(file),
    content: await readFile(file, "utf8"),
  };
}

let css;
let source;
before(async () => {
  const tailwind = await import(require.resolve("tailwindcss"));
  const compile = tailwind.compile ?? tailwind.default.compile;
  const entry = path.join(PKG, "index.css");
  const compiler = await compile(await readFile(entry, "utf8"), {
    base: PKG,
    from: entry,
    loadStylesheet,
  });
  css = compiler.build([]);
  source = await readFile(path.join(PKG, "src/nas-map.css"), "utf8");
});

/** Every `animation` declaration in the map's rules. */
function animations() {
  return [...source.matchAll(/animation(?:-[a-z]+)?:\s*([^;]+);/g)].map(
    (m) => m[1],
  );
}

describe("the NAS map's motions", () => {
  it("are compiled into the stylesheet", () => {
    assert.match(css, /\[data-slot="nas-map"\]\[data-assemble="full"\]/);
    assert.match(css, /@keyframes nas-map-rise/);
  });

  it("run only on a cause: the first visit, a problem arriving or a ghost becoming real", () => {
    for (const [, selector] of source.matchAll(
      /\n\s*([^{}@/]+)\{\s*\n\s*animation:/g,
    )) {
      assert.match(
        selector,
        /data-assemble="full"|data-arrival|data-fresh/,
        `an animation without a cause: ${selector.trim()}`,
      );
    }
  });

  it("take their durations and curves from the motion tokens, once", () => {
    for (const value of animations()) {
      if (/^(calc|var)\(/.test(value.trim()) && !/ /.test(value.trim())) {
        continue;
      }
      if (/^\s*(grow-y)\s*$/.test(value)) {
        continue;
      }
      assert.doesNotMatch(value, /\d+(\.\d+)?s\b(?![^(]*\))/, value);
      assert.doesNotMatch(value, /infinite|alternate/, value);
    }
    assert.match(source, /var\(--duration-fast\)/);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
  });

  it("keep every fade short: the fades run on --duration-fast", () => {
    for (const [, line] of source.matchAll(
      /fade-in (var\(--duration-[a-z]+\))/g,
    )) {
      assert.equal(line, "var(--duration-fast)");
    }
  });
});
