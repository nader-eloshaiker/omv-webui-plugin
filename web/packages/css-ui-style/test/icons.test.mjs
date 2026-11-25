// SPDX-License-Identifier: GPL-3.0-or-later
// The icon set's second tone and the motions of its action icons (src/icons.css, rethink 5.2 and
// 7.7): the plane takes its token, every motion runs on the motion tokens once per cause, only
// inside the control that will act, and lands on its end state under reduced motion.
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
  css = compiler.build([]);
});

describe("the icon set", () => {
  it("fills the one plane from the art-plane token, with no stroke", () => {
    assert.match(
      css,
      /\[data-slot="icon"\] \[data-part="plane"\] \{\s*fill: var\(--theme-art-plane\);\s*stroke: none;/,
    );
  });

  it("moves an action icon only inside a button or menu item that can act, after the intent delay", () => {
    const hover = [
      ...css.matchAll(
        /:is\(button, \[role="menuitem"\]\):not\(:disabled, \[data-disabled\]\):is\(\s*:hover,\s*:focus-visible\s*\) \[data-slot="icon"\]\[data-motion="auto"\]:not\(\[data-state="done"\]\)[^{]*\{([^}]*)\}/g,
      ),
    ];
    assert.ok(hover.length >= 10, "the hover motions are compiled");
    for (const [, body] of hover) {
      assert.match(body, /var\(--ease-(standard|settle)\) 80ms both/);
    }
  });

  it("runs every motion on the motion tokens, once: no literal duration, never a loop", () => {
    const animations = [
      ...css.matchAll(/\[data-slot="icon[^{]*\{[^}]*?animation: ([^;]+);/g),
    ].map((m) => m[1]);
    assert.ok(animations.length > 20, "the action motions are present");
    for (const value of animations) {
      assert.match(
        value,
        /var\(--duration-(press|fast|base|slow|glide)\)/,
        value,
      );
      assert.doesNotMatch(value, /infinite|\b\d+(\.\d+)?s\b/, value);
    }
  });

  it("gives wipe no hover motion: no playfulness on a destructive entry point", () => {
    assert.match(css, /:focus-visible\s*\)[^{]*\[data-icon="share"\]/);
    assert.doesNotMatch(css, /:focus-visible\s*\)[^{]*\[data-icon="wipe"\]/);
    assert.match(css, /\[data-state="done"\]\[data-icon="wipe"\]/);
  });

  it("lands each keyframe on the resting drawing (from-only or back at rest)", () => {
    const keyframes = [
      ...css.matchAll(/@keyframes (icon-[\w-]+) \{([\s\S]*?)\n\}/g),
    ];
    assert.ok(keyframes.length >= 12, "the icon keyframes are compiled");
    for (const [, name, body] of keyframes) {
      assert.doesNotMatch(
        body,
        /\bto \{[^}]*(translate|rotate)/,
        `${name} ends at rest`,
      );
    }
  });
});
