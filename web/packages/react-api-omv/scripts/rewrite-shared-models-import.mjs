// SPDX-License-Identifier: GPL-3.0-or-later
// orval re-exports the DTOs from src/generated/index.ts by relative path into the types package.
// Point it at the package specifier instead, so this package never reaches into another's files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INDEX = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/generated/index.ts",
);
const text = fs.readFileSync(INDEX, "utf8");
const rewritten = text.replace(
  /export \* from ['"](?:\.\.\/)+ts-api-omv\/src\/generated\/models['"];?/,
  'export * from "@omv-webui/ts-api-omv";',
);
if (!rewritten.includes('export * from "@omv-webui/ts-api-omv";')) {
  console.error(
    "rewrite-shared-models-import: no DTO re-export found in src/generated/index.ts",
  );
  process.exit(1);
}
fs.writeFileSync(INDEX, rewritten);
