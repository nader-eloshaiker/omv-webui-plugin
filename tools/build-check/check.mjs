#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Checks the production bundle for the UI-* rules that only the built output can prove
// (docs/05-security.md, .agents/rules/verification.md, "Built output"):
//
//   UI-1   index.html has no inline <script> content, no <style> element, no style= attribute and no
//          event-handler attribute.
//   UI-7   every script, stylesheet, CSS url() and font is a file of the bundle under /ui/, and no
//          absolute http(s), ws(s) or protocol-relative URL appears in a script, stylesheet or page
//          unless it is one of the inert strings in ALLOWED_URLS.
//   UI-11  no mock, MSW, example data, test or development-server code, and no source map.
//
//   node tools/build-check/check.mjs web/apps/omv-web-app/dist
//
// It reads every file itself (no grep: dist/ is git-ignored, and a harness may skip such files), and
// says how much it looked at, because a check that finds nothing is only evidence if it looked.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The page's URL prefix (Vite `base`), and a stand-in origin to resolve references against. */
const BASE = "/ui/";
const ORIGIN = "https://nas.invalid";

/**
 * Absolute URLs allowed in the bundle, exactly as written, each with why it is inert: an XML
 * namespace identifier or text inside an error message or comment. None is a request target. A new
 * entry needs the same proof: the place it occurs, and that nothing fetches, loads or navigates to it.
 */
export const ALLOWED_URLS = new Map([
  [
    "http://www.w3.org/2000/svg",
    "SVG namespace name (React DOM, lucide): an identifier, never fetched",
  ],
  ["http://www.w3.org/1999/xlink", "XLink namespace name (React DOM)"],
  ["http://www.w3.org/1998/Math/MathML", "MathML namespace name (React DOM)"],
  ["http://www.w3.org/XML/1998/namespace", "XML namespace name (React DOM)"],
  [
    "https://react.dev/errors/",
    'React\'s production error text: "visit <url> for the full message"',
  ],
  [
    "https://base-ui.com/production-error",
    "Base UI's production error text, the same pattern",
  ],
  [
    "https://react.i18next.com/latest/usetranslation-hook",
    "react-i18next's error text",
  ],
  [
    "https://tailwindcss.com",
    "Tailwind's licence comment at the top of the stylesheet",
  ],
  [
    "https://www.openmediavault.org/",
    "The About dialog's fixed link to the upstream project (UI-3: an external link written in code, opened only by the reader's click in a new tab with rel=\"noopener noreferrer\"); nothing fetches or loads it",
  ],
  [
    "http://localhost",
    'TanStack Router\'s stand-in origin for parsing paths when window.origin is "null"; it builds URL objects, never a request',
  ],
  [
    "https://",
    'The set-up checklist\'s sentence "Open this page with an address that starts with https://." (catalogue key checklist.https.secureNoLink): words shown to the reader, with no host; the item builds no link (owner, 2026-11-20), and nothing fetches, loads or navigates to it',
  ],
]);

/**
 * Strings that only mock, test or development code contains. Each names where it comes from, so a
 * hit says what leaked into the bundle.
 */
export const FORBIDDEN_MARKERS = [
  { text: "mockServiceWorker", what: "the MSW worker (UI-11)" },
  { text: "MOCK_ACTIVATE", what: "the MSW client (UI-11)" },
  { text: "INTEGRITY_CHECK_REQUEST", what: "the MSW client (UI-11)" },
  { text: "[MSW]", what: "MSW's console messages (UI-11)" },
  {
    text: "must never be shown",
    what: "the mock's error trace, @omv-webui/react-api-omv/mocks (UI-11)",
  },
  {
    text: "EXAMPLE-SESSION-ID",
    what: "the contract examples, @omv-webui/react-api-omv/examples (UI-11)",
  },
  { text: "EXAMPLE-SERIAL-", what: "scrubbed example data (UI-11)" },
  { text: "nas.example.org", what: "scrubbed example data (UI-11)" },
  { text: "data-testid", what: "a test id (UI-11)" },
  { text: "TestingLibraryElementError", what: "Testing Library (UI-11)" },
  { text: "__vitest_", what: "Vitest (UI-11)" },
  { text: "/@vite/client", what: "the Vite dev server client (UI-11)" },
  { text: "$RefreshReg$", what: "React Refresh, development only (UI-11)" },
];

const TEXT_TYPES = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".svg",
  ".txt",
  ".xml",
  ".webmanifest",
]);
const FORBIDDEN_ELEMENTS = new Map([
  ["style", { rule: "UI-1", message: "a <style> element" }],
  ["base", { rule: "UI-1", message: "a <base> element" }],
  ["iframe", { rule: "UI-7", message: "an <iframe>" }],
  ["object", { rule: "UI-7", message: "an <object>" }],
  ["embed", { rule: "UI-7", message: "an <embed>" }],
]);
const URL_ATTRIBUTES = new Set([
  "src",
  "href",
  "action",
  "formaction",
  "poster",
  "data",
  "srcset",
  "imagesrcset",
]);

const ABSOLUTE_URL = /\b(?:https?|wss?|ftp):\/\/[^\s"'`<>()\\{}|^[\]]+/gi;
// A protocol-relative address at the start of a string or a CSS url(): "//host.tld/...".
const PROTOCOL_RELATIVE =
  /(?<=["'`]|url\(\s*)\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

/** @typedef {{ rule: string, file: string, message: string }} Finding */

/** @param {string} dir @returns {string[]} files relative to dir, with forward slashes */
function listFiles(dir) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ d) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else {
        out.push(relative(dir, path).split(sep).join("/"));
      }
    }
  };
  walk(dir);
  return out.sort();
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decode the character references an attribute value may use, so `&#106;avascript:` is seen as it is. */
function decodeEntities(/** @type {string} */ value) {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref) => {
    if (ref[0] === "#") {
      const code =
        ref[1] === "x" || ref[1] === "X"
          ? parseInt(ref.slice(2), 16)
          : parseInt(ref.slice(1), 10);
      return String.fromCodePoint(code);
    }
    const named =
      ENTITIES[/** @type {keyof typeof ENTITIES} */ (ref.toLowerCase())];
    if (named === undefined) {
      throw new Error(`unknown character reference ${whole}`);
    }
    return named;
  });
}

/**
 * Where a reference from `fromFile` (a dist path) lands, if it is a file of this bundle under /ui/.
 * @returns {string | null} the dist path, or null when it leaves /ui/ or the origin
 */
function bundlePath(
  /** @type {string} */ reference,
  /** @type {string} */ fromFile,
) {
  let url;
  try {
    url = new URL(reference, `${ORIGIN}${BASE}${fromFile}`);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN || !url.pathname.startsWith(BASE)) {
    return null;
  }
  return decodeURIComponent(url.pathname.slice(BASE.length));
}

/** @param {string} html @returns {{ name: string, closing: boolean, attributes: [string, string][], content: string }[]} */
function htmlElements(html) {
  // Comments are inert, so they are dropped; an unterminated one would hide everything after it.
  // A scan rather than a regular-expression replace: one pass, and nothing it removes can join
  // the text around it into a new comment opener.
  let text = "";
  let from = 0;
  for (;;) {
    const open = html.indexOf("<!--", from);
    if (open === -1) {
      text += html.slice(from);
      break;
    }
    const close = html.indexOf("-->", open + 4);
    if (close === -1) {
      throw new Error("an unterminated <!-- comment");
    }
    text += html.slice(from, open);
    from = close + 3;
  }
  const tag = /<(\/?)([a-z][a-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const attribute =
    /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const out = [];
  let match;
  while ((match = tag.exec(text)) !== null) {
    const [, slash, rawName, rawAttributes] = match;
    const name = rawName.toLowerCase();
    /** @type {[string, string][]} */
    const attributes = [];
    for (const a of rawAttributes.matchAll(attribute)) {
      attributes.push([
        a[1].toLowerCase(),
        decodeEntities(a[2] ?? a[3] ?? a[4] ?? ""),
      ]);
    }
    let content = "";
    if (
      !slash &&
      (name === "script" || name === "style") &&
      !rawAttributes.trimEnd().endsWith("/")
    ) {
      const end = text.toLowerCase().indexOf(`</${name}`, tag.lastIndex);
      if (end === -1) {
        throw new Error(`a <${name}> element is not closed`);
      }
      content = text.slice(tag.lastIndex, end);
      tag.lastIndex = end;
    }
    out.push({ name, closing: slash === "/", attributes, content });
  }
  return out;
}

/**
 * Check a built bundle.
 * @param {string} dist  the build's output directory
 * @returns {{ findings: Finding[], summary: { files: number, scanned: number, references: number, allowedUrls: Map<string, number> } }}
 */
export function checkDist(dist) {
  /** @type {Finding[]} */
  const findings = [];
  const report = (
    /** @type {string} */ rule,
    /** @type {string} */ file,
    /** @type {string} */ message,
  ) => findings.push({ rule, file, message });
  const files = listFiles(dist);
  const present = new Set(files);
  /** @type {Map<string, number>} */
  const allowedUrls = new Map();
  let scanned = 0;
  let references = 0;

  const reference = (
    /** @type {string} */ rule,
    /** @type {string} */ file,
    /** @type {string} */ value,
    /** @type {string} */ what,
  ) => {
    references += 1;
    const target = bundlePath(value, file);
    if (target === null) {
      report(
        rule,
        file,
        `${what} "${value}" is not a file of the bundle under ${BASE}`,
      );
    } else if (!present.has(target)) {
      report(
        rule,
        file,
        `${what} "${value}" names ${target || "the directory"}, which is not a file of the bundle`,
      );
    }
  };

  if (!present.has("index.html")) {
    report("build", "index.html", "missing: is this a build output directory?");
  }
  if (!files.some((f) => f.endsWith(".js"))) {
    report(
      "build",
      ".",
      "no JavaScript file: is this a build output directory?",
    );
  }

  for (const file of files) {
    if (file.endsWith(".map")) {
      report("UI-11", file, "a source map");
    }
    if (/(^|\/)mockServiceWorker\.js$/.test(file)) {
      report("UI-11", file, "the MSW worker script");
    }
    if (/\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(file)) {
      report("UI-11", file, "a test or story file");
    }
    if (!TEXT_TYPES.has(extname(file).toLowerCase())) {
      continue;
    }
    scanned += 1;
    const text = readFileSync(join(dist, file), "utf8");

    for (const { text: marker, what } of FORBIDDEN_MARKERS) {
      if (text.includes(marker)) {
        report("UI-11", file, `contains "${marker}": ${what}`);
      }
    }
    if (/[#@]\s*sourceMappingURL=/.test(text)) {
      report("UI-11", file, "a sourceMappingURL comment");
    }
    for (const [url] of text.matchAll(ABSOLUTE_URL)) {
      const trimmed = url.replace(/[.,;:]+$/, "");
      if (ALLOWED_URLS.has(trimmed)) {
        allowedUrls.set(trimmed, (allowedUrls.get(trimmed) ?? 0) + 1);
      } else {
        report(
          "UI-7",
          file,
          `absolute URL "${trimmed}" is not in the allow list`,
        );
      }
    }
    for (const [url] of text.matchAll(PROTOCOL_RELATIVE)) {
      report("UI-7", file, `protocol-relative URL "${url}"`);
    }

    if (file.endsWith(".css")) {
      const css = text.replace(/\/\*[^]*?\*\//g, "");
      for (const m of css.matchAll(
        /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi,
      )) {
        reference("UI-7", file, m[1] ?? m[2] ?? m[3] ?? "", "url()");
      }
      for (const m of css.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
        reference("UI-7", file, m[1] ?? m[2] ?? "", "@import");
      }
    }

    if (file.endsWith(".html")) {
      let elements;
      try {
        elements = htmlElements(text);
      } catch (error) {
        report(
          "UI-1",
          file,
          `cannot be read: ${/** @type {Error} */ (error).message}`,
        );
        continue;
      }
      for (const element of elements.filter((e) => !e.closing)) {
        const forbidden = FORBIDDEN_ELEMENTS.get(element.name);
        if (forbidden) {
          report(forbidden.rule, file, forbidden.message);
        }
        const attrs = new Map(element.attributes);
        if (element.name === "script") {
          if (!attrs.has("src")) {
            report("UI-1", file, "a <script> without src");
          }
          if (element.content.trim() !== "") {
            report("UI-1", file, "inline <script> content");
          }
        }
        if (
          element.name === "meta" &&
          attrs.get("http-equiv")?.toLowerCase() === "refresh"
        ) {
          report("UI-3", file, "a <meta http-equiv=refresh>");
        }
        for (const [name, value] of element.attributes) {
          if (name === "style") {
            report("UI-1", file, `a style= attribute on <${element.name}>`);
          } else if (name.startsWith("on")) {
            report(
              "UI-1",
              file,
              `an event-handler attribute ${name}= on <${element.name}>`,
            );
          } else if (URL_ATTRIBUTES.has(name)) {
            const values = name.endsWith("srcset")
              ? value.split(",").map((s) => s.trim().split(/\s+/)[0])
              : [value];
            for (const v of values) {
              reference("UI-7", file, v, `<${element.name} ${name}>`);
            }
          }
        }
      }
    }
  }
  return {
    findings,
    summary: { files: files.length, scanned, references, allowedUrls },
  };
}

function main(/** @type {string[]} */ argv) {
  const dist = argv[0];
  if (!dist || argv.length !== 1) {
    process.stderr.write(
      "usage: node tools/build-check/check.mjs <dist directory>\n",
    );
    return 2;
  }
  if (!statSync(dist, { throwIfNoEntry: false })?.isDirectory()) {
    process.stderr.write(
      `build-check: ${dist} is not a directory; run the build first\n`,
    );
    return 2;
  }
  const { findings, summary } = checkDist(dist);
  const allowed =
    [...summary.allowedUrls].map(([u, n]) => `${u} (${n})`).join(", ") ||
    "none";
  process.stdout.write(
    `build-check: ${summary.files} files, ${summary.scanned} read as text, ${summary.references} references followed; allowed URLs seen: ${allowed}\n`,
  );
  for (const f of findings) {
    process.stdout.write(`  ${f.rule}  ${f.file}: ${f.message}\n`);
  }
  if (findings.length > 0) {
    process.stdout.write(`build-check: ${findings.length} problem(s)\n`);
    return 1;
  }
  process.stdout.write(
    "build-check: UI-1, UI-7 and UI-11 hold for this bundle\n",
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
