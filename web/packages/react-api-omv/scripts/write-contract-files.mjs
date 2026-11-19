// SPDX-License-Identifier: GPL-3.0-or-later
// After orval: write the files the transport, the mocks and the forms read from the contract.
//
//   src/contract/generated/operations.ts  the operation table: each url's service, method, role,
//                                          flags and response schema (docs/03, "The module's surface")
//   src/examples/generated/examples.ts    every example of the contract, by operation and name
//   src/forms/generated/*.ts              valibot schemas for request bodies (docs/04, "The pipeline")
//
//   node scripts/write-contract-files.mjs          write them
//   node scripts/write-contract-files.mjs --check  exit 1 if any is out of date
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import {
  buildExamples,
  buildForms,
  buildOperationTable,
} from "./contract-files.mjs";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = path.join(PKG, "../spec-api-omv/generated/openapi.json");
const check = process.argv.includes("--check");

const contract = JSON.parse(fs.readFileSync(CONTRACT, "utf8"));
const files = {
  "src/contract/generated/operations.ts": buildOperationTable(contract),
  "src/examples/generated/examples.ts": buildExamples(contract),
  ...Object.fromEntries(
    Object.entries(buildForms(contract)).map(([name, text]) => [
      `src/forms/generated/${name}`,
      text,
    ]),
  ),
};

const prettierConfig =
  (await prettier.resolveConfig(path.join(PKG, "package.json"))) ?? {};
let stale = 0;
const wanted = new Set();
for (const [rel, text] of Object.entries(files)) {
  const target = path.join(PKG, rel);
  wanted.add(target);
  const formatted = await prettier.format(text, {
    ...prettierConfig,
    filepath: target,
  });
  const current = fs.existsSync(target)
    ? fs.readFileSync(target, "utf8")
    : null;
  if (current === formatted) {
    continue;
  }
  stale++;
  if (check) {
    console.error(`out of date: ${rel}`);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, formatted);
  }
}
// A generated form file whose operation left the contract.
const formsDir = path.join(PKG, "src/forms/generated");
for (const name of fs.existsSync(formsDir) ? fs.readdirSync(formsDir) : []) {
  const target = path.join(formsDir, name);
  if (!wanted.has(target)) {
    stale++;
    if (check) {
      console.error(`no longer generated: src/forms/generated/${name}`);
    } else {
      fs.rmSync(target);
    }
  }
}
if (check && stale) {
  console.error("Run `pnpm api:react:build` and commit the result.");
  process.exitCode = 1;
}
