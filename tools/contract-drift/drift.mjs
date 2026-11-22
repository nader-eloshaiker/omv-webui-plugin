#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Compare the contract with an OMV source tree or install (docs/04, "Keeping it true").
//
//   node tools/contract-drift/drift.mjs [--omv <source tree>] [--zfs <plugin tree>]
//
// --zfs (or $OMV_ZFS_SOURCE_DIR) names a checkout of openmediavault-zfs, which is kept in its own
// repository (OMV-Extras) rather than in OMV's tree; its datamodels and its Zfs service are merged
// in, as they are once the plugin is installed. It is needed once the contract has Zfs operations.
//
// Exits 1 if a request schema is looser than OMV's datamodel, has diverged from it, or names a
// method or datamodel the tree does not have. Run in CI against a pinned OMV tree, and before
// declaring support for a new OMV version.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceTree } from "../contract-bootstrap/bootstrap.mjs";
import os from "node:os";
import { readTrees } from "../lib/omv-source.mjs";
import { checkContract } from "./compare.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const CONTRACT = path.join(
  ROOT,
  "web/packages/spec-api-omv/generated/openapi.json",
);

/** The openmediavault-zfs tree named with --zfs or $OMV_ZFS_SOURCE_DIR, if any. */
function zfsTree(argv) {
  const i = argv.indexOf("--zfs");
  const root = i >= 0 ? argv[i + 1] : process.env.OMV_ZFS_SOURCE_DIR;
  return root ? root.replace(/^~(?=\/)/, os.homedir()) : undefined;
}

function main() {
  const argv = process.argv.slice(2);
  const root = sourceTree(argv);
  const zfs = zfsTree(argv);
  const contract = JSON.parse(fs.readFileSync(CONTRACT, "utf8"));
  const usesZfs = Object.values(contract.paths).some(
    (item) => item.post?.["x-omv-rpc"]?.service.toLowerCase() === "zfs",
  );
  if (usesZfs && !zfs) {
    throw new Error(
      "The contract has Zfs operations: name the openmediavault-zfs tree with --zfs <dir> or $OMV_ZFS_SOURCE_DIR",
    );
  }
  const { datamodels, services } = readTrees(root, zfs ? [zfs] : []);
  const all = checkContract(contract, datamodels, services);
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
      `contract-drift: ${operations} operations agree with the OMV tree${zfs ? " and the openmediavault-zfs tree" : ""} (${accepted.length} accepted divergence).`,
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
