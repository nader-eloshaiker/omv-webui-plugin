#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Draft a request schema from an OMV rpc.* datamodel (docs/04, "Request schemas").
//
//   node tools/contract-bootstrap/bootstrap.mjs rpc.ssh.set [--omv <source tree>]
//
// Prints the draft as YAML, with what needs review as comments. The draft is reviewed against the
// method's source and committed by hand; this tool never writes into the contract.
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDatamodels } from "../lib/omv-source.mjs";
import { toYaml } from "../lib/yaml.mjs";
import { translate } from "./translate.mjs";

export function sourceTree(argv) {
  const i = argv.indexOf("--omv");
  const root = i >= 0 ? argv[i + 1] : process.env.OMV_SOURCE_DIR;
  if (!root) {
    throw new Error(
      "Name the OMV source tree with --omv <dir> or $OMV_SOURCE_DIR",
    );
  }
  return root.replace(/^~(?=\/)/, os.homedir());
}

function main() {
  const argv = process.argv.slice(2);
  const id = argv.find(
    (a, i) => !a.startsWith("--") && argv[i - 1] !== "--omv",
  );
  if (!id) {
    console.error(
      "usage: bootstrap.mjs <rpc.datamodel.id> [--omv <source tree>]",
    );
    process.exitCode = 2;
    return;
  }
  const models = readDatamodels(sourceTree(argv));
  const model = models.get(id);
  if (!model || model.type !== "rpc") {
    console.error(`No rpc datamodel "${id}" in the tree.`);
    process.exitCode = 1;
    return;
  }
  const { schema, findings } = translate(model.params ?? {});
  const lines = [
    `# Draft from ${id} (${model.file}). Review against the method's source before committing.`,
    ...findings.map((f) => `# REVIEW ${f}`),
    toYaml(schema).trimEnd(),
  ];
  console.log(lines.join("\n"));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
