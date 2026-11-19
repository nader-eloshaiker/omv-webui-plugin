#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Compare the contract with an OMV source tree or install (docs/04, "Keeping it true").
//
//   node tools/contract-drift/drift.mjs [--omv <source tree>]
//
// Exits 1 if a request schema is looser than OMV's datamodel, has diverged from it, or names a
// method or datamodel the tree does not have. Run in CI against a pinned OMV tree, and before
// declaring support for a new OMV version.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceTree } from "../contract-bootstrap/bootstrap.mjs";
import { readDatamodels, readServices } from "../lib/omv-source.mjs";
import { checkContract } from "./compare.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const CONTRACT = path.join(
  ROOT,
  "web/packages/spec-api-omv/generated/openapi.json",
);

function main() {
  const root = sourceTree(process.argv.slice(2));
  const contract = JSON.parse(fs.readFileSync(CONTRACT, "utf8"));
  const all = checkContract(contract, readDatamodels(root), readServices(root));
  // Divergences accepted with a reason. The list only shrinks: an entry that no longer occurs is
  // itself a finding, so the change that removes a divergence also removes its entry.
  const accepted = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "accepted.json"),
      "utf8",
    ),
  );
  const key = (f) => `${f.where}\u0000${f.message}`;
  const acceptedKeys = new Set(accepted.map(key));
  const findings = all.filter((f) => !acceptedKeys.has(key(f)));
  for (const entry of accepted) {
    if (!all.some((f) => key(f) === key(entry))) {
      findings.push({
        severity: "stale",
        where: entry.where,
        message: `accepted.json lists "${entry.message}", which no longer occurs`,
      });
    }
  }
  const operations = Object.keys(contract.paths).length;
  if (!findings.length) {
    console.log(
      `contract-drift: ${operations} operations agree with the OMV tree (${accepted.length} accepted divergence).`,
    );
    return;
  }
  for (const f of findings) {
    console.log(`${f.severity.padEnd(9)} ${f.where}: ${f.message}`);
  }
  console.log(
    `contract-drift: ${findings.length} finding(s) over ${operations} operations.`,
  );
  process.exitCode = 1;
}

try {
  main();
} catch (e) {
  console.error(`contract-drift: ${e.message}`);
  process.exitCode = 1;
}
