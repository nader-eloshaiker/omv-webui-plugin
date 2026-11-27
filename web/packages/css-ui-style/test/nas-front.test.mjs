// SPDX-License-Identifier: GPL-3.0-or-later
// The NAS front's motions (src/nas-front.css, journal 2026-11-27): each runs on the motion tokens,
// only in answer to a cause (the first visit, a check's result arriving), once, with no colour of its
// own, and lands at once under the reduced-motion preference.
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
  source = await readFile(path.join(PKG, "src/nas-front.css"), "utf8");
});

describe("the NAS front's motions", () => {
  it("are compiled into the stylesheet", () => {
    assert.match(css, /\[data-slot="nas-front"\]\[data-assemble="full"\]/);
    assert.match(css, /@keyframes nas-front-into-bay/);
    assert.match(css, /@keyframes nas-front-wipe/);
  });

  it("run only on a cause: the first visit or a check's result arriving", () => {
    for (const [, selector] of source.matchAll(
      /\n\s*([^{}@/]+)\{\s*\n\s*animation(?:-name)?:/g,
    )) {
      assert.match(
        selector,
        /data-assemble="full"|data-landed/,
        `an animation without a cause: ${selector.trim()}`,
      );
    }
  });

  it("take their durations and curves from the motion tokens, once", () => {
    for (const [, value] of source.matchAll(/animation:\s*([^;]+);/g)) {
      assert.doesNotMatch(value, /\d+(\.\d+)?s\b(?![^(]*\))/, value);
      assert.doesNotMatch(value, /infinite|alternate/, value);
      assert.match(
        value,
        /var\(--duration-[a-z]+\) var\(--ease-[a-z]+\)/,
        value,
      );
    }
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
  });

  it("keep every fade short: the fades run on --duration-fast", () => {
    const fades = [...source.matchAll(/fade-in (var\(--duration-[a-z]+\))/g)];
    assert.ok(fades.length > 0);
    for (const [, duration] of fades) {
      assert.equal(duration, "var(--duration-fast)");
    }
  });

  it("land at once under the reduced-motion preference", () => {
    assert.match(
      source,
      /\[data-motion="reduced"\] \[data-slot="nas-front"\] \*,\s*\[data-motion="reduced"\] \[data-slot="nas-front"\] ::after \{\s*animation-delay: 0ms !important;/,
    );
  });
});
