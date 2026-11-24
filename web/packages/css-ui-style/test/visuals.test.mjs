// SPDX-License-Identifier: GPL-3.0-or-later
// The motions of charts, meters, rings, the map and the drawings (src/visuals.css): each utility
// compiles from the motion tokens, and under prefers-reduced-motion the base rule lands every one of
// them on its end state at once (foundation 7.3).
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
before(async () => {
  const tailwind = await import(require.resolve("tailwindcss"));
  const compile = tailwind.compile ?? tailwind.default.compile;
  const entry = path.join(PKG, "index.css");
  const compiler = await compile(await readFile(entry, "utf8"), {
    base: PKG,
    from: entry,
    loadStylesheet,
  });
  css = compiler.build([
    "animate-grow-x",
    "animate-grow-y",
    "animate-ring-in",
    "animate-slot-in",
    "animate-arrive",
    "grow-box",
    "line-draw",
    "travel-dash",
  ]);
});

describe("the visual motions", () => {
  it("compiles each utility from the motion tokens, with its keyframes", () => {
    for (const [utility, keyframes, token] of [
      ["animate-grow-x", "grow-x", "--duration-glide"],
      ["animate-grow-y", "grow-y", "--duration-glide"],
      ["animate-ring-in", "ring-in", "--duration-glide"],
      ["animate-slot-in", "slot-in", "--duration-slow"],
      ["line-draw", "line-draw", "--duration-glide"],
    ]) {
      const rule = css.match(new RegExp(`\\.${utility} \\{([^}]*)\\}`));
      assert.ok(rule, `.${utility} is generated`);
      assert.match(rule[1], new RegExp(keyframes));
      assert.match(rule[1], new RegExp(token));
      assert.match(css, new RegExp(`@keyframes ${keyframes} \\{`));
    }
    assert.match(css, /\.grow-box \{\s*transform-box: fill-box;/);
  });

  it("never loops: the travelling dash runs twice and the arrival rings twice", () => {
    assert.match(css, /\.travel-dash \{[^}]*travel[^}]* 2 both/);
    assert.doesNotMatch(
      css,
      /\.(travel-dash|line-draw|animate-arrive)[^{]*\{[^}]*infinite/,
    );
  });

  it("lands every animation on its end state under reduced motion", () => {
    const reduced = css.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*::before,\s*::after \{([^}]*)\}/,
    );
    assert.ok(reduced, "the base rule for reduced motion is present");
    assert.match(
      reduced[1],
      /animation-duration: var\(--duration-fast\) !important/,
    );
    assert.match(reduced[1], /animation-iteration-count: 1 !important/);
    assert.match(reduced[1], /animation-delay: 0ms !important/);
    // Every keyframe used here only names where it starts (`from`), or ends at rest, so its end
    // state is the element's own value: the meter at its value, the line drawn, the ring full.
    for (const name of [
      "grow-x",
      "grow-y",
      "ring-in",
      "slot-in",
      "line-draw",
    ]) {
      const block = css.match(
        new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`),
      );
      assert.ok(block, name);
      assert.doesNotMatch(
        block[1],
        /\bto\b|100%/,
        `${name} has no end frame of its own`,
      );
    }
  });
});
