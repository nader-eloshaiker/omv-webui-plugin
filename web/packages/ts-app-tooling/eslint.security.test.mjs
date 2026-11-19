// SPDX-License-Identifier: GPL-3.0-or-later
// The UI-* lint rules catch what they must and allow what each exemption allows. Runs the real
// workspace config (web/eslint.config.js) over source text at chosen paths.
import { ESLint } from "eslint";
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cwd = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const eslint = new ESLint({ cwd });

const PAGE = "apps/omv-web-app/src/pages/Example.tsx";
const TRANSPORT = "packages/react-api-omv/src/transport/rpcClient.ts";
const STORE = "apps/omv-web-app/src/stores/useThemeStore.ts";
const MOCK = "apps/omv-web-app/src/mocks/browser.ts";

const SECURITY_RULES = new Set([
  "no-eval",
  "no-implied-eval",
  "no-new-func",
  "no-script-url",
  "no-restricted-globals",
  "no-restricted-properties",
  "no-restricted-syntax",
  "no-restricted-imports",
]);

async function securityMessages(code, filePath) {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(cwd, filePath),
  });
  return result.messages.filter((m) => SECURITY_RULES.has(m.ruleId) || m.fatal);
}

const forbidden = [
  [
    "UI-2 dangerouslySetInnerHTML",
    'export const X = () => <div dangerouslySetInnerHTML={{ __html: "" }} />;\n',
  ],
  ["UI-2 innerHTML", 'document.body.innerHTML = "x";\n'],
  ["UI-2 outerHTML read", "export const x = document.body.outerHTML;\n"],
  [
    "UI-2 insertAdjacentHTML",
    'document.body.insertAdjacentHTML("beforeend", "x");\n',
  ],
  ["UI-2 document.write", 'document.write("x");\n'],
  ["UI-2 eval", 'eval("1");\n'],
  ["UI-2 new Function", 'export const f = new Function("return 1");\n'],
  ["UI-2 string timer", 'setTimeout("alert(1)", 1);\n'],
  [
    "UI-2 markdown import",
    'import { marked } from "marked";\nexport const m = marked;\n',
  ],
  ["UI-3 location assignment", 'window.location = "/x";\n'],
  ["UI-3 href assignment", 'window.location.href = "/x";\n'],
  ["UI-3 location.assign", 'location.assign("/x");\n'],
  ["UI-3 location.replace", 'window.location.replace("/x");\n'],
  ["UI-3 window.open", 'window.open("/x");\n'],
  ["UI-3 open global", 'open("/x");\n'],
  ["UI-3 returnUrl", 'export const returnUrl = "/x";\n'],
  [
    "UI-3 redirecturl",
    "export const f = (r: { redirecturl: string }) => r.redirecturl;\n",
  ],
  ["UI-3 javascript: URL", 'export const u = "javascript:void(0)";\n'],
  [
    "UI-6 sessionid",
    "export const f = (r: { sessionid: string }) => r.sessionid;\n",
  ],
  ["UI-6 document.cookie", "export const c = document.cookie;\n"],
  ["UI-10 fetch", 'fetch("/rpc.php");\n'],
  ["UI-10 window.fetch", 'window.fetch("/rpc.php");\n'],
  ["UI-10 XMLHttpRequest", "export const x = new XMLHttpRequest();\n"],
  ["UI-10 WebSocket", 'export const w = new WebSocket("wss://x");\n'],
  ["UI-10 EventSource", 'export const e = new EventSource("/x");\n'],
  ["UI-10 sendBeacon", 'navigator.sendBeacon("/x");\n'],
  ["UI-13 localStorage", 'localStorage.setItem("k", "v");\n'],
  ["UI-13 sessionStorage", 'window.sessionStorage.setItem("k", "v");\n'],
  [
    "UI-11 msw outside mocks",
    'import { http } from "msw";\nexport const h = http;\n',
  ],
];

for (const [name, code] of forbidden) {
  test(`forbidden in a page: ${name}`, async () => {
    const messages = await securityMessages(code, PAGE);
    assert.ok(messages.length > 0, `expected a UI-* finding for: ${code}`);
    assert.ok(
      !messages.some((m) => m.fatal),
      messages.map((m) => m.message).join("\n"),
    );
  });
}

test("the transport may call fetch, and nothing else is relaxed there", async () => {
  assert.deepEqual(
    await securityMessages('export const r = fetch("/rpc.php");\n', TRANSPORT),
    [],
  );
  assert.ok(
    (await securityMessages('localStorage.setItem("k", "v");\n', TRANSPORT))
      .length > 0,
  );
  assert.ok(
    (
      await securityMessages(
        "export const x = new XMLHttpRequest();\n",
        TRANSPORT,
      )
    ).length > 0,
  );
});

test("a preference store may use localStorage, and may not fetch", async () => {
  assert.deepEqual(
    await securityMessages("export const s = () => localStorage;\n", STORE),
    [],
  );
  assert.ok((await securityMessages('fetch("/x");\n', STORE)).length > 0);
  assert.ok(
    (await securityMessages("export const c = document.cookie;\n", STORE))
      .length > 0,
  );
});

test("mock code may import msw, and may not fetch", async () => {
  assert.deepEqual(
    await securityMessages(
      'import { http } from "msw";\nexport const h = http;\n',
      MOCK,
    ),
    [],
  );
  assert.ok((await securityMessages('fetch("/x");\n', MOCK)).length > 0);
});

test("a rule cannot be switched off by a comment", async () => {
  const code =
    '// eslint-disable-next-line no-restricted-globals\nfetch("/rpc.php");\n';
  assert.ok((await securityMessages(code, PAGE)).length > 0);
});

test("ordinary code passes", async () => {
  const code =
    'export const isHttps = (): boolean => window.location.protocol === "https:";\n';
  assert.deepEqual(await securityMessages(code, PAGE), []);
});
