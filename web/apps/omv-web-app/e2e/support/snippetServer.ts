// SPDX-License-Identifier: GPL-3.0-or-later
// A static server for the production build that answers as the plugin's nginx snippet does, with the
// response headers read from the snippet itself (etc/nginx/openmediavault-webgui.d/), so the browser
// test and the package can never send different headers. The routing is reproduced here; the
// snippet's routing directives are checked against it on start, so a change to one fails loudly
// instead of the two drifting apart.
import { readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  directiveArgs,
  findLocation,
  headersOf,
  parseNginxConf,
  type Header,
} from "../../../../../tools/lib/nginx-conf.mjs";

const REPOSITORY = fileURLToPath(new URL("../../../../../", import.meta.url));
export const SNIPPET = join(
  REPOSITORY,
  "etc/nginx/openmediavault-webgui.d/openmediavault-webui.conf",
);
export const DIST = fileURLToPath(new URL("../../dist/", import.meta.url));

/** What the snippet sends: the header set of each location that answers, and the missing reply. */
export interface SnippetReplies {
  /** `location ^~ /ui/`: index.html, deep links and any other file outside assets/. */
  app: readonly Header[];
  /** `location ^~ /ui/assets/`: a file of the bundle's assets/. */
  assets: readonly Header[];
  /** `location @openmediavault_webui_missing`: a missing asset. */
  missing: readonly Header[];
  missingBody: string;
}

/** The header variants the browser test runs under. */
export type HeaderVariant = "snippet" | "trustedTypesEnforced";

function expectArgs(actual: readonly string[], expected: readonly string[]) {
  if (
    actual.length !== expected.length ||
    actual.some((a, i) => a !== expected[i])
  ) {
    throw new Error(
      `The snippet's routing changed (${actual.join(" ")} instead of ${expected.join(" ")}): update the browser test's server to match.`,
    );
  }
}

/** Read the snippet, and refuse it if its routing is not what this server reproduces. */
export function readSnippet(path: string = SNIPPET): SnippetReplies {
  const tree = parseNginxConf(readFileSync(path, "utf8"));
  const app = findLocation(tree, ["^~", "/ui/"]);
  const assets = findLocation(tree, ["^~", "/ui/assets/"]);
  const missing = findLocation(tree, ["@openmediavault_webui_missing"]);
  expectArgs(directiveArgs(findLocation(tree, ["=", "/ui"]), "return"), [
    "301",
    "/ui/",
  ]);
  expectArgs(directiveArgs(app, "try_files"), ["$uri", "/ui/index.html"]);
  expectArgs(directiveArgs(assets, "try_files"), ["$uri", "=404"]);
  expectArgs(directiveArgs(assets, "error_page"), [
    "404",
    "@openmediavault_webui_missing",
  ]);
  const [status, body] = directiveArgs(missing, "return");
  expectArgs([status ?? ""], ["404"]);
  return {
    app: headersOf(app),
    assets: headersOf(assets),
    missing: headersOf(missing),
    missingBody: body ?? "",
  };
}

/** The snippet's replies with `require-trusted-types-for 'script'` added to every policy (A9). */
export function withVariant(
  replies: SnippetReplies,
  variant: HeaderVariant,
): SnippetReplies {
  switch (variant) {
    case "snippet":
      return replies;
    case "trustedTypesEnforced": {
      const enforce = (headers: readonly Header[]): Header[] =>
        headers.map((h) =>
          h.name.toLowerCase() === "content-security-policy"
            ? {
                name: h.name,
                value: `${h.value}; require-trusted-types-for 'script'`,
              }
            : h,
        );
      return {
        ...replies,
        app: enforce(replies.app),
        assets: enforce(replies.assets),
        missing: enforce(replies.missing),
      };
    }
    default: {
      const unknown: never = variant;
      throw new Error(`Unknown header variant ${String(unknown)}`);
    }
  }
}

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export interface RunningServer {
  origin: string;
  replies: SnippetReplies;
  close: () => Promise<void>;
}

/** A regular file of the bundle at `relative`, or null. Never a path outside the bundle. */
function bundleFile(dist: string, relative: string): string | null {
  const normal = posix.normalize(relative);
  if (normal.startsWith("..") || normal.includes("\0")) {
    return null;
  }
  const path = resolve(dist, normal);
  if (!path.startsWith(resolve(dist) + sep)) {
    return null;
  }
  return statSync(path, { throwIfNoEntry: false })?.isFile() ? path : null;
}

/** Serve `dist` on a free loopback port, answering as the snippet does. */
export function startSnippetServer(
  replies: SnippetReplies,
  dist: string = DIST,
): Promise<RunningServer> {
  const server = createServer((request, response) => {
    const send = (
      status: number,
      headers: readonly Header[],
      type: string,
      body: string | Buffer,
    ) => {
      for (const h of headers) {
        response.setHeader(h.name, h.value);
      }
      response.setHeader("Content-Type", type);
      response.writeHead(status);
      response.end(request.method === "HEAD" ? undefined : body);
    };
    const file = (headers: readonly Header[], path: string) =>
      send(
        200,
        headers,
        TYPES[extname(path)] ?? "application/octet-stream",
        readFileSync(path),
      );

    if (request.method !== "GET" && request.method !== "HEAD") {
      // Only rpc.php takes a POST, and the test answers it before it leaves the browser.
      send(405, [], "text/plain", "Method not allowed\n");
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent(
        new URL(request.url ?? "/", "http://localhost").pathname,
      );
    } catch {
      send(400, [], "text/plain", "Bad request\n");
      return;
    }
    if (path === "/ui") {
      response.writeHead(301, { Location: "/ui/" });
      response.end();
      return;
    }
    if (path.startsWith("/ui/assets/")) {
      const found = bundleFile(dist, path.slice("/ui/".length));
      if (found) {
        file(replies.assets, found);
      } else {
        send(404, replies.missing, "text/plain", replies.missingBody);
      }
      return;
    }
    if (path.startsWith("/ui/")) {
      const found =
        bundleFile(dist, path.slice("/ui/".length)) ??
        bundleFile(dist, "index.html");
      if (found) {
        file(replies.app, found);
      } else {
        send(500, [], "text/plain", `${dist} has no index.html\n`);
      }
      return;
    }
    // Outside the snippet: OMV's own site, which the test never loads.
    send(404, [], "text/plain", "Not part of the snippet\n");
  });
  return new Promise((resolveStart, rejectStart) => {
    server.once("error", rejectStart);
    server.listen(0, "127.0.0.1", () => {
      // listen() on a TCP port always reports an AddressInfo, never a pipe name.
      const { port } = server.address() as AddressInfo;
      resolveStart({
        origin: `http://127.0.0.1:${port}`,
        replies,
        close: () =>
          new Promise((done, fail) =>
            server.close((error) => (error ? fail(error) : done())),
          ),
      });
    });
  });
}
