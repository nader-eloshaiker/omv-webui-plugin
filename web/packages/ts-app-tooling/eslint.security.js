// SPDX-License-Identifier: GPL-3.0-or-later
// The lint half of the UI-* rules in docs/05-security.md (the rows marked L). Each entry names its
// rule. The lists are built here once and composed per directory by eslint.config.js, because a flat
// config block that sets a rule replaces that rule's options for the files it matches: the transport
// override has to repeat every restriction except the network ones it is allowed.

// Directories with a narrower exemption, relative to the workspace root (web/).
export const TRANSPORT_FILES = [
  "packages/react-api-omv/src/transport/**/*.{ts,tsx}",
];
export const STORE_FILES = ["apps/omv-web-app/src/stores/**/*.{ts,tsx}"];
export const MOCK_FILES = [
  "**/src/mocks/**/*.{ts,tsx}",
  "**/src/test/**/*.{ts,tsx}",
  "**/*.test.{ts,tsx}",
  "**/vitest.setup.ts",
];

// UI-10: only the transport module performs network requests.
const networkGlobals = [
  {
    name: "fetch",
    message: "UI-10: only the transport module calls the network.",
  },
  {
    name: "XMLHttpRequest",
    message: "UI-10: only the transport module calls the network.",
  },
  { name: "EventSource", message: "UI-10: no other channel to the network." },
  { name: "WebSocket", message: "UI-10: no other channel to the network." },
];
const networkProperties = ["window", "globalThis", "self"].map((object) => ({
  object,
  property: "fetch",
  message: "UI-10: only the transport module calls the network.",
}));
const beaconProperty = {
  object: "navigator",
  property: "sendBeacon",
  message: "UI-10: no other channel to the network.",
};

// UI-13 and UI-6: browser storage only for preferences, from the preference stores.
const storageGlobals = [
  {
    name: "localStorage",
    message: "UI-13: storage is reached only from a preference store.",
  },
  {
    name: "sessionStorage",
    message: "UI-13: storage is reached only from a preference store.",
  },
  { name: "indexedDB", message: "UI-13: no browser database." },
];
const storageProperties = [
  ...["localStorage", "sessionStorage", "indexedDB"].flatMap((property) =>
    ["window", "globalThis", "self"].map((object) => ({
      object,
      property,
      message: "UI-13: storage is reached only from a preference store.",
    })),
  ),
  {
    object: "document",
    property: "cookie",
    message: "UI-6: the session lives only in OMV's HttpOnly cookie.",
  },
];

// UI-2: no markup from data.
const markupProperties = [
  { property: "innerHTML", message: "UI-2: render backend text as text." },
  { property: "outerHTML", message: "UI-2: render backend text as text." },
  {
    property: "insertAdjacentHTML",
    message: "UI-2: render backend text as text.",
  },
  {
    property: "createContextualFragment",
    message: "UI-2: no markup from data.",
  },
  { property: "setHTMLUnsafe", message: "UI-2: no markup from data." },
  { property: "srcdoc", message: "UI-2: no markup from data." },
  {
    object: "document",
    property: "write",
    message: "UI-2: no markup from data.",
  },
  {
    object: "document",
    property: "writeln",
    message: "UI-2: no markup from data.",
  },
];

// UI-3: no supplied targets.
const openProperties = ["window", "globalThis", "self"].map((object) => ({
  object,
  property: "open",
  message:
    'UI-3: external links are literal <a> elements with rel="noopener noreferrer".',
}));
const openGlobal = {
  name: "open",
  message:
    'UI-3: external links are literal <a> elements with rel="noopener noreferrer".',
};

const restrictedSyntax = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: "UI-2: no markup from data. Render backend text as text.",
  },
  {
    selector: "AssignmentExpression[left.name='location']",
    message: "UI-3: navigate with the router, never by assigning location.",
  },
  {
    selector: "AssignmentExpression[left.property.name=/^(location|href)$/]",
    message: "UI-3: navigate with the router, never by assigning location.",
  },
  {
    selector:
      "CallExpression[callee.property.name=/^(assign|replace)$/][callee.object.name='location'], CallExpression[callee.property.name=/^(assign|replace)$/][callee.object.property.name='location']",
    message: "UI-3: navigate with the router, never by assigning location.",
  },
  {
    selector: "Identifier[name=/^(return|redirect)(url|uri|to|path)$/i]",
    message:
      "UI-3: there is no return address. After sign-in the app goes to a fixed route.",
  },
  {
    selector:
      "MemberExpression[property.name='redirecturl'], Property[key.name='redirecturl']",
    message:
      "UI-3: the login reply's redirecturl is ignored; the interface maps the challenge kind to its own screen.",
  },
  {
    selector:
      "MemberExpression[property.name='sessionid'], Property[key.name='sessionid']",
    message:
      "UI-6: the sessionid in the login reply is never read, stored or sent.",
  },
];

// UI-2: no client-side template or Markdown rendering of data. UI-11: no mock code in the product.
const markupImports = [
  "marked",
  "markdown-it",
  "react-markdown",
  "remark",
  "rehype",
  "html-react-parser",
  "dompurify",
  "handlebars",
  "mustache",
  "ejs",
  "lodash/template",
  "lodash.template",
].map((name) => ({
  name,
  message: "UI-2: no template or Markdown rendering of data.",
}));
const mockImports = ["msw", "msw/browser", "msw/node"].map((name) => ({
  name,
  message:
    "UI-11: mock code lives only under src/mocks or src/test and in test files.",
}));

/**
 * The UI-* lint rules for a set of files, with the given exemptions.
 * @param {{network?: boolean, storage?: boolean, mocks?: boolean}} allow
 */
export function securityRules(allow = {}) {
  return {
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "no-script-url": "error",
    "no-restricted-globals": [
      "error",
      openGlobal,
      ...(allow.network
        ? networkGlobals.filter((g) => g.name !== "fetch")
        : networkGlobals),
      ...(allow.storage ? [] : storageGlobals),
    ],
    "no-restricted-properties": [
      "error",
      ...markupProperties,
      ...openProperties,
      beaconProperty,
      ...(allow.network ? [] : networkProperties),
      ...(allow.storage
        ? storageProperties.filter((p) => p.object === "document")
        : storageProperties),
    ],
    "no-restricted-syntax": ["error", ...restrictedSyntax],
    "no-restricted-imports": [
      "error",
      { paths: [...markupImports, ...(allow.mocks ? [] : mockImports)] },
    ],
  };
}
