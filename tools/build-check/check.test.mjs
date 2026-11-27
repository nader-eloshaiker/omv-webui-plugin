// SPDX-License-Identifier: GPL-3.0-or-later
// Each case starts from a clean bundle laid out as Vite writes it, changes or adds files, and states
// which findings the check must report. Every address used is a documentation name.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkDist,
  checkFirstLoadLazy,
  checkFirstLoadStrings,
  firstLoadScripts,
} from "./check.mjs";

const CHECK = fileURLToPath(new URL("./check.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "build-check-"));
after(() => rmSync(root, { recursive: true, force: true }));

const page = (head = "", body = "") => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>openmediavault</title>
    <!-- Nothing inline (UI-1). -->
    <script type="module" crossorigin src="/ui/assets/index-abc.js"></script>
    <link rel="modulepreload" crossorigin href="/ui/assets/chunk-def.js">
    <link rel="stylesheet" crossorigin href="/ui/assets/index-ghi.css">
    ${head}
  </head>
  <body>
    <div id="root"></div>
    ${body}
  </body>
</html>
`;

const CLEAN = {
  "index.html": page(),
  "assets/index-abc.js":
    'import{a}from"./chunk-def.js";const t=`https://react.dev/errors/`;document.createElementNS("http://www.w3.org/2000/svg","svg");import("./lazy-jkl.js");',
  "assets/chunk-def.js": "export const a=1;",
  "assets/lazy-jkl.js": "export default 2;",
  "assets/index-ghi.css":
    '/*! tailwindcss v4 | MIT License | https://tailwindcss.com */@font-face{font-family:Inter;src:url(/ui/assets/inter-mno.woff2)format("woff2")}.a{background:url(./icon-pqr.svg)}',
  "assets/inter-mno.woff2": Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0xff]),
  "assets/icon-pqr.svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
};

let n = 0;
function bundle(changes) {
  const dir = join(root, String((n += 1)));
  for (const [file, content] of Object.entries({ ...CLEAN, ...changes })) {
    if (content === null) {
      continue;
    }
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
  return dir;
}

const CASES = [
  { name: "a clean bundle", changes: {}, expected: [] },
  {
    name: "inline script content",
    changes: { "index.html": page("<script>window.x=1</script>") },
    expected: [
      ["UI-1", "a <script> without src"],
      ["UI-1", "inline <script> content"],
    ],
  },
  {
    name: "inline script beside a src",
    changes: {
      "index.html": page(
        '<script src="/ui/assets/chunk-def.js">alert(1)</script>',
      ),
    },
    expected: [["UI-1", "inline <script> content"]],
  },
  {
    name: "a style element",
    changes: { "index.html": page("<style>body{color:red}</style>") },
    expected: [["UI-1", "a <style> element"]],
  },
  {
    name: "a style attribute",
    changes: { "index.html": page("", '<div style="color:red"></div>') },
    expected: [["UI-1", "a style= attribute on <div>"]],
  },
  {
    name: "an event-handler attribute",
    changes: {
      "index.html": page(
        "",
        "<img src=/ui/assets/icon-pqr.svg onerror=alert(1)>",
      ),
    },
    expected: [["UI-1", "an event-handler attribute onerror= on <img>"]],
  },
  {
    name: "a javascript: address hidden behind a character reference",
    changes: {
      "index.html": page("", '<a href="&#106;avascript:alert(1)">x</a>'),
    },
    expected: [
      [
        "UI-7",
        '<a href> "javascript:alert(1)" is not a file of the bundle under /ui/',
      ],
    ],
  },
  {
    name: "a script from a CDN",
    changes: {
      "index.html": page(
        '<script src="https://cdn.example.com/lib.js"></script>',
      ),
    },
    expected: [
      [
        "UI-7",
        'absolute URL "https://cdn.example.com/lib.js" is not in the allow list',
      ],
      [
        "UI-7",
        '<script src> "https://cdn.example.com/lib.js" is not a file of the bundle under /ui/',
      ],
    ],
  },
  {
    name: "a protocol-relative stylesheet",
    changes: {
      "index.html": page(
        '<link rel="stylesheet" href="//cdn.example.com/a.css">',
      ),
    },
    expected: [
      ["UI-7", 'protocol-relative URL "//cdn.example.com"'],
      [
        "UI-7",
        '<link href> "//cdn.example.com/a.css" is not a file of the bundle under /ui/',
      ],
    ],
  },
  {
    name: "a same-origin file outside /ui/",
    changes: {
      "index.html": page('<link rel="stylesheet" href="/other/a.css">'),
    },
    expected: [
      [
        "UI-7",
        '<link href> "/other/a.css" is not a file of the bundle under /ui/',
      ],
    ],
  },
  {
    name: "a reference to a file the bundle lacks",
    changes: { "assets/chunk-def.js": null },
    expected: [
      [
        "UI-7",
        '<link href> "/ui/assets/chunk-def.js" names assets/chunk-def.js, which is not a file of the bundle',
      ],
    ],
  },
  {
    name: "a font from a font host",
    changes: {
      "assets/index-ghi.css":
        "@font-face{src:url(https://fonts.example.com/inter.woff2)}",
    },
    expected: [
      [
        "UI-7",
        'absolute URL "https://fonts.example.com/inter.woff2" is not in the allow list',
      ],
      [
        "UI-7",
        'url() "https://fonts.example.com/inter.woff2" is not a file of the bundle under /ui/',
      ],
    ],
  },
  {
    name: "a font inlined as a data: URL",
    changes: {
      "assets/index-ghi.css":
        '@font-face{src:url("data:font/woff2;base64,AAAA")}',
    },
    expected: [
      [
        "UI-7",
        'url() "data:font/woff2;base64,AAAA" is not a file of the bundle under /ui/',
      ],
    ],
  },
  {
    name: "a stylesheet @import from another origin",
    changes: {
      "assets/index-ghi.css": '@import "https://fonts.example.com/css";',
    },
    expected: [
      [
        "UI-7",
        'absolute URL "https://fonts.example.com/css" is not in the allow list',
      ],
      [
        "UI-7",
        '@import "https://fonts.example.com/css" is not a file of the bundle under /ui/',
      ],
    ],
  },
  {
    name: "a url() in a CSS comment is inert, but its address still counts as an absolute URL",
    changes: { "assets/index-ghi.css": "/* url(https://example.org/x) */.a{}" },
    expected: [
      ["UI-7", 'absolute URL "https://example.org/x" is not in the allow list'],
    ],
  },
  {
    name: "a request target in a script",
    changes: {
      "assets/chunk-def.js":
        'fetch("https://telemetry.example.com/v1",{method:"POST"});',
    },
    expected: [
      [
        "UI-7",
        'absolute URL "https://telemetry.example.com/v1" is not in the allow list',
      ],
    ],
  },
  {
    name: "a websocket in a script",
    changes: {
      "assets/chunk-def.js": "new WebSocket(`wss://updates.example.net/feed`);",
    },
    expected: [
      [
        "UI-7",
        'absolute URL "wss://updates.example.net/feed" is not in the allow list',
      ],
    ],
  },
  {
    name: "a protocol-relative address in a script string",
    changes: { "assets/chunk-def.js": 'const s="//cdn.example.com/x.js";' },
    expected: [["UI-7", 'protocol-relative URL "//cdn.example.com"']],
  },
  {
    name: "an allowed URL with a different path is not allowed",
    changes: { "assets/chunk-def.js": "const u=`https://react.dev/errors/x`;" },
    expected: [
      [
        "UI-7",
        'absolute URL "https://react.dev/errors/x" is not in the allow list',
      ],
    ],
  },
  {
    name: "a source map file",
    changes: { "assets/index-abc.js.map": "{}" },
    expected: [["UI-11", "a source map"]],
  },
  {
    name: "a sourceMappingURL comment",
    changes: {
      "assets/chunk-def.js":
        "export const a=1;\n//# sourceMappingURL=chunk-def.js.map",
    },
    expected: [["UI-11", "a sourceMappingURL comment"]],
  },
  {
    name: "the MSW worker file",
    changes: {
      "mockServiceWorker.js": "self.addEventListener('fetch',()=>{})",
    },
    expected: [["UI-11", "the MSW worker script"]],
  },
  {
    name: "the MSW client",
    changes: {
      "assets/chunk-def.js":
        'const w=navigator.serviceWorker.register("/ui/mockServiceWorker.js");post("MOCK_ACTIVATE");',
    },
    expected: [
      ["UI-11", 'contains "mockServiceWorker": the MSW worker (UI-11)'],
      ["UI-11", 'contains "MOCK_ACTIVATE": the MSW client (UI-11)'],
    ],
  },
  {
    name: "the contract examples",
    changes: {
      "assets/chunk-def.js": 'const e={sessionid:"EXAMPLE-SESSION-ID"};',
    },
    expected: [
      [
        "UI-11",
        'contains "EXAMPLE-SESSION-ID": the contract examples, @omv-webui/react-api-omv/examples (UI-11)',
      ],
    ],
  },
  {
    name: "the mock's apparent page address",
    changes: {
      "assets/chunk-def.js":
        'let a=null;function s(e){if(e.protocol!=="http:")throw new Error("mock apparent page address: the protocol must be http: or https:");a=e}',
    },
    expected: [
      [
        "UI-11",
        'contains "mock apparent page address": the mock\'s apparent page address, src/network/pageLocation.ts (D17, UI-11)',
      ],
    ],
  },
  {
    name: "a test id",
    changes: { "assets/chunk-def.js": 'h("div",{"data-testid":"x"});' },
    expected: [["UI-11", 'contains "data-testid": a test id (UI-11)']],
  },
  {
    name: "the Vite dev client",
    changes: {
      "index.html": page('<script type="module" src="/@vite/client"></script>'),
    },
    expected: [
      ["UI-11", 'contains "/@vite/client": the Vite dev server client (UI-11)'],
      [
        "UI-7",
        '<script src> "/@vite/client" is not a file of the bundle under /ui/',
      ],
    ],
  },
  {
    name: "a test file",
    changes: { "assets/session.test.js": "export {}" },
    expected: [["UI-11", "a test or story file"]],
  },
  {
    name: "a script hidden in a comment is inert",
    changes: { "index.html": page("<!-- <script>alert(1)</script> -->") },
    expected: [],
  },
  {
    name: "an unterminated comment",
    changes: { "index.html": page("<!-- <script>alert(1)</script>") },
    expected: [["UI-1", "cannot be read: an unterminated <!-- comment"]],
  },
  {
    name: "an unclosed script element",
    changes: {
      "index.html": '<!doctype html><script src="/ui/assets/index-abc.js">',
    },
    expected: [["UI-1", "cannot be read: a <script> element is not closed"]],
  },
  {
    name: "frames, base and refresh",
    changes: {
      "index.html": page(
        '<base href="/ui/"><meta http-equiv="refresh" content="0;url=/">',
        '<iframe src="/ui/index.html"></iframe>',
      ),
    },
    expected: [
      ["UI-1", "a <base> element"],
      [
        "UI-7",
        '<base href> "/ui/" names the directory, which is not a file of the bundle',
      ],
      ["UI-3", "a <meta http-equiv=refresh>"],
      ["UI-7", "an <iframe>"],
    ],
  },
  {
    name: "a directory that is not a build",
    changes: {
      "index.html": null,
      "assets/index-abc.js": null,
      "assets/chunk-def.js": null,
      "assets/lazy-jkl.js": null,
    },
    expected: [
      ["build", "missing: is this a build output directory?"],
      ["build", "no JavaScript file: is this a build output directory?"],
    ],
  },
];

for (const { name, changes, expected } of CASES) {
  test(`build-check: ${name}`, () => {
    const { findings } = checkDist(bundle(changes));
    assert.deepEqual(
      findings.map((f) => [f.rule, f.message]).sort(),
      [...expected].sort(),
    );
  });
}

test("build-check: counts what it looked at, so an empty result is evidence", () => {
  const { summary } = checkDist(bundle({}));
  assert.equal(summary.files, 7);
  assert.equal(summary.scanned, 6);
  assert.equal(summary.references, 5);
  assert.deepEqual(Object.fromEntries(summary.allowedUrls), {
    "https://react.dev/errors/": 1,
    "http://www.w3.org/2000/svg": 2,
    "https://tailwindcss.com": 1,
  });
});

const CLI = [
  {
    name: "a clean bundle passes",
    dir: () => bundle({}),
    status: 0,
    output: /UI-1, UI-7 and UI-11 hold/,
  },
  {
    name: "a bundle with an inline script fails",
    dir: () => bundle({ "index.html": page("<script>alert(1)</script>") }),
    status: 1,
    output: /UI-1 {2}index\.html: inline <script> content/,
  },
  {
    name: "a missing directory is a usage error",
    dir: () => join(root, "absent"),
    status: 2,
    output: /not a directory/,
  },
];

for (const { name, dir, status, output } of CLI) {
  test(`build-check CLI: ${name}`, () => {
    const run = spawnSync(process.execPath, [CHECK, dir()], {
      encoding: "utf8",
    });
    assert.equal(run.status, status, run.stdout + run.stderr);
    assert.match(run.stdout + run.stderr, output);
  });
}

// 1.6 of the network design: the recovery card's words are in a script the page loads first.
const RECOVERY = "This page cannot reach the NAS since the change.";

test("build-check 1.6: the first-loaded scripts follow static imports and preloads, not dynamic ones", () => {
  assert.deepEqual(firstLoadScripts(bundle({})), [
    "assets/chunk-def.js",
    "assets/index-abc.js",
  ]);
});

test('build-check 1.6: a sentence in the entry passes, also inside JSON.parse("…")', () => {
  const plain = bundle({
    "assets/chunk-def.js": `export const a={netRecover:{lost:${JSON.stringify(RECOVERY)}}};`,
  });
  assert.deepEqual(checkFirstLoadStrings(plain, [RECOVERY]), []);
  const parsed = bundle({
    "assets/chunk-def.js": `export const a=JSON.parse(${JSON.stringify(JSON.stringify({ lost: RECOVERY }))});`,
  });
  assert.deepEqual(checkFirstLoadStrings(parsed, [RECOVERY]), []);
});

test("build-check 1.6: a sentence only in a chunk loaded later fails", () => {
  const lazy = bundle({
    "assets/lazy-jkl.js": `export default ${JSON.stringify(RECOVERY)};`,
  });
  assert.deepEqual(
    checkFirstLoadStrings(lazy, [RECOVERY]).map((f) => [f.rule, f.message]),
    [
      [
        "1.6",
        `the recovery card's words are not in a script loaded first: "${RECOVERY}"`,
      ],
    ],
  );
});

// 8.1 of the dashboard spec: the chart library loads only in a chunk loaded later.
const RECHARTS =
  'const w="recharts-wrapper",s="recharts-surface";export default w+s;';

test("build-check 8.1: the chart library in a chunk loaded later passes", () => {
  const lazy = bundle({ "assets/lazy-jkl.js": RECHARTS });
  assert.deepEqual(checkFirstLoadLazy(lazy), { findings: [], scripts: 2 });
});

test("build-check 8.1: the chart library in a script loaded first fails, once per file", () => {
  const eager = bundle({
    "assets/chunk-def.js": `export const a=1;${RECHARTS}`,
  });
  assert.deepEqual(
    checkFirstLoadLazy(eager).findings.map((f) => [f.rule, f.file]),
    [["8.1", "assets/chunk-def.js"]],
  );
});
