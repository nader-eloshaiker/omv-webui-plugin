// SPDX-License-Identifier: GPL-3.0-or-later
// Reading an openmediavault source tree (or an installed system's /usr/share/openmediavault):
// datamodels by id, and which methods each RPC service registers. In a source tree, the plugins
// built from it (deb/openmediavault-md and the others) count too, as they do once installed. A
// plugin kept in a repository of its own (openmediavault-zfs, from OMV-Extras) is read as a second
// tree and merged in, as it is merged into OMV once installed.
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
  // The plugins of a source tree: deb/openmediavault-*/usr/share/openmediavault.
  const deb = path.join(root, "deb");
  const plugins = fs.existsSync(deb)
    ? fs
        .readdirSync(deb)
        .filter((d) => d.startsWith("openmediavault-"))
        .sort()
        .map((d) => path.join(deb, d, "usr/share/openmediavault"))
    : [];
  const rpcDirs = [
    path.join(share, "engined/rpc"),
    path.join(base, "var/www/openmediavault/rpc"),
    ...plugins.map((p) => path.join(p, "engined/rpc")),
  ].filter((d) => fs.existsSync(d));
  const datamodelDirs = [
    path.join(share, "datamodels"),
    ...plugins.map((p) => path.join(p, "datamodels")),
  ].filter((d) => fs.existsSync(d));
  return { datamodels: path.join(share, "datamodels"), datamodelDirs, rpcDirs };
}

/** Every datamodel in the tree, by id. A file holds one model or a list of them. */
export function readDatamodels(root) {
  const byId = new Map();
  for (const dir of omvLayout(root).datamodelDirs) {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      for (const model of Array.isArray(parsed) ? parsed : [parsed]) {
        if (model?.id) {
          byId.set(model.id, { ...model, file });
        }
      }
    }
  }
  return byId;
}

/**
 * Service name -> registered method names, from the PHP service classes of one file. A file may
 * hold more than one service class (notification.inc holds Notification and EmailNotification), so
 * each class is read on its own.
 */
export function servicesOf(text) {
  const services = new Map();
  for (const chunk of text.split(/^(?=\s*(?:final\s+|abstract\s+)?class\s)/m)) {
    const name =
      /function\s+getName\s*\(\s*\)\s*(?::\s*\w+\s*)?\{\s*return\s+["']([^"']+)["']/.exec(
        chunk,
      )?.[1];
    if (!name) {
      continue;
    }
    const methods = services.get(name) ?? new Set();
    for (const m of chunk.matchAll(/registerMethod\(\s*["']([^"']+)["']/g)) {
      methods.add(m[1]);
    }
    services.set(name, methods);
  }
  return services;
}

/** Service name -> set of registered method names, from the PHP service classes. */
export function readServices(root) {
  const services = new Map();
  for (const dir of omvLayout(root).rpcDirs) {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".inc"))) {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      for (const [name, methods] of servicesOf(text)) {
        const known = services.get(name) ?? new Set();
        services.set(name, new Set([...known, ...methods]));
      }
    }
  }
  return services;
}

/**
 * The datamodels and services of OMV's tree with those of plugin trees merged in, as once the
 * plugins are installed. A plugin's datamodel id or service that OMV's tree (or an earlier plugin)
 * already has is an error: an installed plugin cannot replace one either.
 * @param {string} root OMV's source tree
 * @param {string[]} pluginRoots trees of plugins kept outside it
 */
export function readTrees(root, pluginRoots = []) {
  const datamodels = readDatamodels(root);
  const services = readServices(root);
  for (const plugin of pluginRoots) {
    for (const [id, model] of readDatamodels(plugin)) {
      if (datamodels.has(id)) {
        throw new Error(`${plugin} redefines the datamodel ${id}`);
      }
      datamodels.set(id, model);
    }
    for (const [name, methods] of readServices(plugin)) {
      if (
        [...services.keys()].some((k) => k.toLowerCase() === name.toLowerCase())
      ) {
        throw new Error(`${plugin} redefines the RPC service ${name}`);
      }
      services.set(name, methods);
    }
  }
  return { datamodels, services };
}
