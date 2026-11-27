// SPDX-License-Identifier: GPL-3.0-or-later
// The component library's built Storybook (`pnpm build-storybook` in packages/react-ui-components),
// served from disk on a free port on 127.0.0.1 for the accessibility test. Files only: no directory
// listing, nothing outside the build.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const STORYBOOK_STATIC = fileURLToPath(
  new URL(
    "../../../../packages/react-ui-components/storybook-static/",
    import.meta.url,
  ),
);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
};

export interface StaticServer {
  origin: string;
  close: () => Promise<void>;
}

export function startStorybookServer(): Promise<StaticServer> {
  const root = normalize(STORYBOOK_STATIC);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(
      new URL(req.url ?? "/", "http://x").pathname,
    );
    const file = normalize(join(root, path === "/" ? "index.html" : path));
    if (
      !file.startsWith(root.endsWith(sep) ? root : root + sep) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        origin: `http://127.0.0.1:${String(port)}`,
        close: () =>
          new Promise((done) => {
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}

/** The ids of the stories whose file sits under one of `folders`, from the build's index. */
export function storiesIn(folders: readonly string[]): string[] {
  const file = join(STORYBOOK_STATIC, "index.json");
  if (!existsSync(file)) {
    // No build: the global setup says so.
    return [];
  }
  const index = JSON.parse(readFileSync(file, "utf8")) as {
    entries: Record<string, { type: string; importPath: string }>;
  };
  return Object.entries(index.entries)
    .filter(
      ([, e]) =>
        e.type === "story" &&
        folders.some((f) => e.importPath.includes(`/components/${f}/`)),
    )
    .map(([id]) => id);
}
