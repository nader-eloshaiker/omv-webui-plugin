// SPDX-License-Identifier: GPL-3.0-or-later
// UI-11: Recharts may load only in the route chunks that draw charts. It enters through the
// `/charts` entry alone: no file the main entry can reach imports it, or imports the chart folder.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = __dirname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sources(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) &&
      !/\.(test|stories)\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe("the chart entry point", () => {
  const files = sources(SRC).map((path) => ({
    path: relative(SRC, path),
    text: readFileSync(path, "utf8"),
  }));

  it("keeps Recharts inside components/charts", () => {
    const importers = files
      .filter((f) => /from "recharts"/.test(f.text))
      .map((f) => f.path);
    expect(importers.length).toBeGreaterThan(0);
    for (const path of importers) {
      expect(path).toMatch(/^components\/charts\//);
    }
  });

  it("is never reached from the main entry or another component", () => {
    for (const f of files) {
      if (f.path === "charts.ts" || f.path.startsWith("components/charts/")) {
        continue;
      }
      expect(f.text, f.path).not.toMatch(
        /components\/charts\/|from "\.\.\/charts\//,
      );
    }
  });
});
