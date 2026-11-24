// SPDX-License-Identifier: GPL-3.0-or-later
// The generator's guards. That generated/tokens.css matches design/tokens.css is `tokens.mjs --check`,
// which `pnpm test` runs first.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generate } from "../scripts/tokens.mjs";

const source = (
  dark = "--theme-page: #000000;",
  primitives = "",
  compact = "--density-card: 1rem; --text-body: 0.8125rem;",
) => `
@theme { --color-slate-100: #f1f4f7; --text-body: 0.9375rem; ${primitives} }
:root { --density-card: 1.5rem; }
:root {
  --theme-page: var(--color-slate-100);
  --theme-shadow-raised: 0 1px 2px rgb(0 0 0 / 0.1);
  --theme-ambient: color-mix(in srgb, #5dacdf 12%, transparent);
}
[data-density="compact"] { ${compact} }
.dark { ${dark} }
@media (prefers-reduced-motion: reduce) { :root { --duration-fast: 0ms; } }
`;

describe("tokens.mjs", () => {
  it("derives the OS-preference block, the .light block and the role utilities", () => {
    const out = generate(source());
    assert.match(
      out,
      /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\.light\) \{\n {4}--theme-page: #000000;/,
    );
    assert.match(
      out,
      /\.light \{\n {2}--theme-page: var\(--color-slate-100\);\n\}/,
    );
    assert.match(out, /--color-page: var\(--theme-page\);/);
    assert.match(out, /--shadow-raised: var\(--theme-shadow-raised\);/);
  });

  it("derives comfortable density from the defaults on :root and in @theme", () => {
    assert.match(
      generate(source()),
      /\[data-density="comfortable"\] \{\n {2}--density-card: 1\.5rem;\n {2}--text-body: 0\.9375rem;\n\}/,
    );
  });

  it("refuses a compact value with no default", () => {
    assert.throws(
      () => generate(source(undefined, "", "--density-new: 1px;")),
      /no default/,
    );
  });

  it("makes no utility for the ambient light's stops", () => {
    assert.doesNotMatch(generate(source()), /--color-ambient/);
  });

  it("refuses a dark value with no light value", () => {
    assert.throws(
      () => generate(source("--theme-new: #000000;")),
      /no light value/,
    );
  });

  it("refuses a primitive that shares its name with a role's utility", () => {
    assert.throws(
      () => generate(source(undefined, "--color-page: #ffffff;")),
      /rename the primitive/,
    );
  });

  it("refuses a source without exactly one .dark block", () => {
    assert.throws(
      () => generate("@theme { } :root { --theme-page: #fff; }"),
      /one top-level \.dark/,
    );
  });
});
