// SPDX-License-Identifier: GPL-3.0-or-later
// Compiles index.css with Tailwind's own compiler and checks what the style guide and UI-1/UI-7 ask
// of it. The Vite plugin adds file scanning and URL rewriting on top of the same compiler.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(PKG, "package.json"));

/** Resolves an @import the way the Vite plugin does: relative paths, then packages' CSS entries. */
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

let build;
before(async () => {
  const tailwind = await import(require.resolve("tailwindcss"));
  const compile = tailwind.compile ?? tailwind.default.compile;
  const entry = path.join(PKG, "index.css");
  const compiler = await compile(await readFile(entry, "utf8"), {
    base: PKG,
    from: entry,
    loadStylesheet,
  });
  build = (candidates) => compiler.build(candidates);
});

/** The declarations of one utility class in the output, or null when it was not generated. */
function rule(css, selector) {
  const escaped = selector.replace(/[/:]/g, "\\\\$&");
  const match = css.match(
    new RegExp(`\\.${escaped}(?:[^{]*)\\{([\\s\\S]*?)\\n  \\}`, "m"),
  );
  return match ? match[1] : null;
}

describe("the token system", () => {
  it("maps the shadcn vocabulary onto the semantic tier (style guide 3.2)", () => {
    const css = build([
      "bg-background",
      "bg-card",
      "bg-popover",
      "bg-primary",
      "text-primary-foreground",
      "bg-secondary",
      "bg-accent",
      "border-input",
      "outline-ring",
    ]);
    const expected = {
      "bg-background": "var(--theme-page)",
      "bg-card": "var(--theme-surface)",
      "bg-popover": "var(--theme-surface)",
      "bg-primary": "var(--theme-action)",
      "text-primary-foreground": "var(--theme-action-foreground)",
      "bg-secondary": "var(--theme-muted)",
      "bg-accent": "var(--theme-muted)",
      "border-input": "var(--theme-border-control)",
      "outline-ring": "var(--theme-focus-ring)",
    };
    for (const [utility, value] of Object.entries(expected)) {
      assert.ok(rule(css, utility)?.includes(value), `${utility} -> ${value}`);
    }
  });

  it("gives every semantic role a utility that reads the role where it is used", () => {
    const css = build([
      "bg-page",
      "text-warning-label",
      "border-critical-stroke",
      "bg-pending",
      "text-pending-foreground",
      "bg-terminal",
      "stroke-series-3",
      "shadow-md",
    ]);
    assert.match(rule(css, "bg-page"), /var\(--theme-page\)/);
    assert.match(
      rule(css, "text-warning-label"),
      /var\(--theme-warning-label\)/,
    );
    assert.match(rule(css, "bg-pending"), /var\(--theme-pending\)/);
    assert.match(rule(css, "shadow-md"), /var\(--theme-shadow-md\)/);
  });

  it("has no Tailwind palette, white, black or off-system radius, shadow or size", () => {
    const css = build([
      "bg-blue-500",
      "text-red-600",
      "bg-white",
      "text-black",
      "rounded-xl",
      "shadow-2xl",
      "text-5xl",
      "ease-in-out",
    ]);
    assert.doesNotMatch(
      css,
      /\.(bg-blue-500|text-red-600|bg-white|text-black)\b/,
    );
    assert.doesNotMatch(
      css,
      /\.(rounded-xl|shadow-2xl|text-5xl|ease-in-out)\b/,
    );
    assert.doesNotMatch(css, /--color-(red|blue|gray|white|black)\b/);
  });

  it("keeps the type scale without Tailwind's per-size line heights", () => {
    const css = build(["text-sm", "text-base", "leading-tight"]);
    assert.doesNotMatch(css, /--text-sm--line-height/);
    assert.match(css, /--text-sm: 0\.8125rem/);
  });

  it("applies the dark theme from the class or the OS preference, with no script", () => {
    const css = build(["dark:bg-muted"]);
    assert.match(css, /\.dark\\:bg-muted:where\(\.dark, \.dark \*\)/);
    assert.match(
      css,
      /@media \(prefers-color-scheme: dark\) \{\s*\.dark\\:bg-muted:not\(:where\(\.light, \.light \*\)\)/,
    );
    assert.match(
      css,
      /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\.light\) \{\s*--theme-page: var\(--color-slate-950\)/,
    );
    assert.match(css, /\.light \{\s*--theme-page: var\(--color-slate-100\)/);
  });
});

describe("corners (style guide 4.3)", () => {
  it("draws squircles only inside @supports, with their own radii", () => {
    const css = build(["rounded-control", "rounded-card"]);
    for (const [utility, round, squircle] of [
      ["rounded-control", "--radius-md", "--radius-squircle-md"],
      ["rounded-card", "--radius-lg", "--radius-squircle-lg"],
    ]) {
      const body = rule(css, utility);
      assert.ok(body, `${utility} is generated`);
      const [outside, inside] = body.split(
        "@supports (corner-shape: squircle)",
      );
      assert.match(outside, new RegExp(`border-radius: var\\(${round}\\)`));
      assert.doesNotMatch(outside, /corner-shape/);
      assert.match(inside, /corner-shape: squircle/);
      assert.match(inside, new RegExp(`border-radius: var\\(${squircle}\\)`));
    }
    assert.match(css, /--radius-squircle-md: \d+px/);
    assert.match(css, /--radius-squircle-lg: \d+px/);
  });

  it("leaves pills, dots and meters round", () => {
    const css = build(["rounded-full"]);
    assert.match(
      rule(css, "rounded-full"),
      /border-radius: (calc\(infinity \* 1px\)|var\(--radius-full\))/,
    );
    assert.doesNotMatch(rule(css, "rounded-full"), /corner-shape/);
  });
});

describe("motion (style guide 4.5)", () => {
  it("reads the duration tokens, which reduced motion zeroes", () => {
    const css = build(["duration-base", "transition-colors"]);
    assert.match(rule(css, "duration-base"), /var\(--duration-base\)/);
    assert.match(
      rule(css, "transition-colors"),
      /var\(--tw-duration, var\(--duration-fast\)\)/,
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{\s*--duration-fast: 0ms;\s*--duration-base: 0ms;\s*--duration-slow: 0ms;/,
    );
  });
});

describe("the content security policy (UI-1) and local assets (UI-7)", () => {
  it("bundles Inter and Roboto Mono from the package, from no other origin", () => {
    const css = build(["font-sans", "font-mono", "tabular-nums"]);
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) =>
      m[1].replace(/["']/g, ""),
    );
    assert.ok(urls.length > 0, "the font faces are present");
    for (const url of urls) {
      assert.match(
        url,
        /^\.\/files\/[\w-]+\.woff2$/,
        `${url} is a packaged file`,
      );
    }
    for (const pkg of [
      "@fontsource-variable/inter",
      "@fontsource-variable/roboto-mono",
    ]) {
      const dir = path.dirname(require.resolve(pkg));
      const files = urls.filter((u) => u.includes(pkg.split("/")[1]));
      assert.ok(files.length > 0, `${pkg} is imported`);
      for (const file of files) {
        assert.ok(existsSync(path.join(dir, file)), `${pkg}/${file} exists`);
      }
    }
    assert.match(css, /font-family: 'Inter Variable'/);
    assert.match(css, /font-family: 'Roboto Mono Variable'/);
    assert.match(css, /--font-sans: "Inter Variable"/);
    assert.match(
      rule(css, "tabular-nums"),
      /--tw-numeric-spacing: tabular-nums/,
    );
    // Comments aside (the Tailwind banner names its home page), no address of another origin.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /https?:|url\(\s*["']?\/\//);
  });

  it("carries the Base UI scrollbar rule, so Base UI needs no style element", () => {
    const css = build([]);
    assert.match(
      css,
      /\.base-ui-disable-scrollbar \{\s*scrollbar-width: none;/,
    );
    assert.match(
      css,
      /\.base-ui-disable-scrollbar::-webkit-scrollbar \{\s*display: none;/,
    );
  });

  it("draws the focus ring from the token (style guide 4.6)", () => {
    const css = build([]);
    assert.match(
      css,
      /:focus-visible \{\s*outline: 2px solid var\(--theme-focus-ring\);\s*outline-offset: 2px;/,
    );
  });
});
