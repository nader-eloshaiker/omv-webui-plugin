// SPDX-License-Identifier: GPL-3.0-or-later
// Reading an openmediavault source tree (or an installed system's /usr/share/openmediavault):
// datamodels by id, and which methods each RPC service registers.
import fs from "node:fs";
import path from "node:path";

/** The directories under `root` that hold OMV's datamodels and RPC services. */
export function omvLayout(root) {
  const candidates = [
    path.join(root, "deb/openmediavault/usr/share/openmediavault"),
    path.join(root, "usr/share/openmediavault"),
    root,
  ];
  const share = candidates.find((c) =>
    fs.existsSync(path.join(c, "datamodels")),
  );
  if (!share) {
    throw new Error(`No openmediavault datamodels under ${root}`);
  }
  const base = share.endsWith("usr/share/openmediavault")
    ? path.resolve(share, "../../..")
    : root;
  const rpcDirs = [
    path.join(share, "engined/rpc"),
    path.join(base, "var/www/openmediavault/rpc"),
  ].filter((d) => fs.existsSync(d));
  return { datamodels: path.join(share, "datamodels"), rpcDirs };
}

/** Every datamodel in the tree, by id. A file holds one model or a list of them. */
export function readDatamodels(root) {
  const { datamodels } = omvLayout(root);
  const byId = new Map();
  for (const file of fs
    .readdirSync(datamodels)
    .filter((f) => f.endsWith(".json"))) {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(datamodels, file), "utf8"),
    );
    for (const model of Array.isArray(parsed) ? parsed : [parsed]) {
      if (model?.id) {
        byId.set(model.id, { ...model, file });
      }
    }
  }
  return byId;
}

/** Service name -> set of registered method names, from the PHP service classes. */
export function readServices(root) {
  const services = new Map();
  for (const dir of omvLayout(root).rpcDirs) {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".inc"))) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      const name =
        /function\s+getName\s*\(\s*\)\s*(?::\s*\w+\s*)?\{\s*return\s+["']([^"']+)["']/.exec(
          text,
        )?.[1];
      if (!name) {
        continue;
      }
      const methods = services.get(name) ?? new Set();
      for (const m of text.matchAll(/registerMethod\(\s*["']([^"']+)["']/g)) {
        methods.add(m[1]);
      }
      services.set(name, methods);
    }
  }
  return services;
}
