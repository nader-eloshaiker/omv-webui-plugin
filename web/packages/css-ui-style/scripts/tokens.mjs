// SPDX-License-Identifier: GPL-3.0-or-later
// Writes generated/tokens.css from design/tokens.css, the single source of every colour, size and
// duration. `--check` writes nothing and exits 1 when the committed file is out of date; `pnpm test`
// runs it, so a token change that skipped this step fails the battery.
//
// The source is copied verbatim. What is derived from it, mechanically, and nothing else:
//   1. The `.dark` declarations again under `@media (prefers-color-scheme: dark)` for
//      `:root:not(.light)`, so the OS preference applies from the first paint with no script (UI-1,
//      docs/02-architecture.md "Theme"). Written by hand this would be a second copy of the dark theme
//      to drift from the first.
//   2. A `.light` rule resetting the same names to their light values, so an explicit light choice
//      also works on an element inside a dark one (a side-by-side story, say).
//   3. A `[data-density="comfortable"]` rule resetting every name the `[data-density="compact"]`
//      block sets to its default (from `:root` or `@theme`), so a comfortable subtree inside a compact
//      one also works, the way `.light` does for themes.
//   4. One Tailwind utility per semantic role, by its own name, with `@theme inline`: `--theme-page`
//      becomes `bg-page`, `--theme-warning-label` becomes `text-warning-label`,
//      `--theme-shadow-raised` becomes `shadow-raised`. `inline` makes each utility read the
//      `--theme-*` variable where it is used, so a `.dark` or `.light` subtree flips. The ambient
//      light's stops (`--theme-ambient*`) get none: they are read only by the `ambient-light`
//      utility, never as a flat fill. The shadcn names are mapped by hand in index.css.
//
// Kept out of design/tokens.css on purpose: tools/colour-audit.mjs reads that file and treats every
// block that is not `.dark` as the light theme, so a dark block under any other selector there would
// be audited as light.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const COMPACT = '[data-density="compact"]';
const COMFORTABLE = '[data-density="comfortable"]';
// Roles that are stops of a drawn light, not fills: no utility of their own.
const NO_UTILITY = /^--theme-ambient(-|$)/;
const SOURCE = path.resolve(here, "../../../../design/tokens.css");
const TARGET = path.resolve(here, "../generated/tokens.css");

/** Top-level blocks of a stylesheet with comments removed: `{ prelude, body }`, body unparsed. */
export function topLevelBlocks(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  let depth = 0;
  let start = 0;
  let bodyStart = 0;
  let prelude = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) {
        prelude = text.slice(start, i).trim();
        bodyStart = i + 1;
      }
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth < 0) {
        throw new Error("tokens.css: unbalanced braces");
      }
      if (depth === 0) {
        blocks.push({ prelude, body: text.slice(bodyStart, i) });
        start = i + 1;
      }
    }
  }
  if (depth !== 0) {
    throw new Error("tokens.css: unbalanced braces");
  }
  return blocks;
}

/** Custom property declarations of a flat block body, in order. */
export function declarations(body) {
  if (body.includes("{")) {
    throw new Error("tokens.css: a theme block must not contain nested rules");
  }
  return [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => ({
    name: m[1],
    value: m[2].replace(/\s+/g, " ").trim(),
  }));
}

export function generate(source) {
  const blocks = topLevelBlocks(source);
  const dark = blocks.filter((b) => b.prelude === ".dark");
  if (dark.length !== 1) {
    throw new Error(
      `tokens.css: expected one top-level .dark block, found ${dark.length}`,
    );
  }
  const light = new Map();
  for (const block of blocks.filter((b) => b.prelude === ":root")) {
    for (const d of declarations(block.body)) {
      light.set(d.name, d.value);
    }
  }
  const darkDecls = declarations(dark[0].body);
  for (const d of darkDecls) {
    if (!light.has(d.name)) {
      throw new Error(
        `tokens.css: ${d.name} is set in .dark but has no light value on :root`,
      );
    }
  }
  const roles = [...light.keys()].filter((n) => n.startsWith("--theme-"));

  // Density: the compact block, and the defaults every name in it resets to.
  const compact = blocks.filter((b) => b.prelude === COMPACT);
  if (compact.length > 1) {
    throw new Error(`tokens.css: expected at most one ${COMPACT} block`);
  }
  const defaults = new Map();
  for (const block of blocks.filter(
    (b) => b.prelude === ":root" || b.prelude === "@theme",
  )) {
    for (const d of declarations(block.body)) {
      defaults.set(d.name, d.value);
    }
  }
  const compactDecls = compact.length ? declarations(compact[0].body) : [];
  for (const d of compactDecls) {
    if (!defaults.has(d.name)) {
      throw new Error(
        `tokens.css: ${d.name} is set for compact density but has no default on :root or in @theme`,
      );
    }
  }

  const lines = (decls) => decls.map((d) => `    ${d.name}: ${d.value};`);
  // A primitive and a role must not share a utility name: `--color-x: var(--theme-x)` over a
  // primitive `--color-x` that `--theme-x` reads is a var() cycle, and both render transparent.
  const primitives = new Set(
    blocks
      .filter((b) => b.prelude === "@theme")
      .flatMap((b) => declarations(b.body).map((d) => d.name)),
  );
  const mapping = roles
    .filter((name) => !NO_UTILITY.test(name))
    .map((name) => {
      const role = name.slice("--theme-".length);
      const utility = role.startsWith("shadow-")
        ? `--${role}`
        : `--color-${role}`;
      if (primitives.has(utility)) {
        throw new Error(
          `tokens.css: the primitive ${utility} has the name the role ${name} needs as a utility; rename the primitive`,
        );
      }
      return `  ${utility}: var(${name});`;
    });

  return [
    "/* GENERATED from design/tokens.css by web/packages/css-ui-style/scripts/tokens.mjs. Do not edit:",
    "   change design/tokens.css and run `pnpm --filter @omv-webui/css-ui-style tokens`. The source is",
    "   copied verbatim first; the four derived blocks follow it. */",
    "",
    source.trimEnd(),
    "",
    "/* ─── Derived 1: the dark theme from the OS preference, unless <html> has .light ───────────── */",
    "@media (prefers-color-scheme: dark) {",
    "  :root:not(.light) {",
    ...lines(darkDecls),
    "  }",
    "}",
    "",
    "/* ─── Derived 2: an explicit light choice, also inside a dark subtree ──────────────────────── */",
    ".light {",
    ...lines(
      darkDecls.map((d) => ({ name: d.name, value: light.get(d.name) })),
    ).map((l) => l.slice(2)),
    "}",
    "",
    "/* ─── Derived 3: comfortable density, also inside a compact subtree ───────────────────────── */",
    `${COMFORTABLE} {`,
    ...lines(
      compactDecls.map((d) => ({ name: d.name, value: defaults.get(d.name) })),
    ).map((l) => l.slice(2)),
    "}",
    "",
    "/* ─── Derived 4: one utility per semantic role, by its own name ───────────────────────────── */",
    "@theme inline {",
    ...mapping,
    "}",
    "",
  ].join("\n");
}

function main() {
  const check = process.argv.includes("--check");
  const output = generate(readFileSync(SOURCE, "utf8"));
  if (check) {
    let current = "";
    try {
      current = readFileSync(TARGET, "utf8");
    } catch {
      // A missing file is drift like any other.
    }
    if (current !== output) {
      console.error(
        "css-ui-style: generated/tokens.css is out of date with design/tokens.css.\n" +
          "Run `pnpm --filter @omv-webui/css-ui-style tokens` and commit the result.",
      );
      process.exit(1);
    }
    return;
  }
  writeFileSync(TARGET, output);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
