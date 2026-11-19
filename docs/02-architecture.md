# 02 — Architecture

## Runtime

The plugin is static files plus one nginx rule. There is no server-side code of its own.

```
/var/www/openmediavault-webui/          the built interface (index.html, assets/)
/etc/nginx/openmediavault-webgui.d/     one snippet: serve the directory above at /ui/, with its own headers
```

The browser loads `/ui/`, and the application calls `/rpc.php` on the same origin with the OMV session cookie. Detail of the snippet is in [06](06-plugin-packaging.md#nginx-snippet).

## Layers of the application

```
pages / routes            TanStack Router; typed, static route tree
   │  use
feature hooks             thin wrappers where a page needs to combine or adapt queries
   │  use
generated hooks           react-api-omv/src/generated   (orval; one hook per operation)
   │  call
transport module          react-api-omv/src/transport   (hand-written; the ONLY code that knows rpc.php)
   │  POST /rpc.php
OMV
```

Rules:

- **Dependencies point down only.** A page never imports the transport module; it uses hooks.
- **The transport module is the seam (D5).** Its public surface is one function with the signature orval's mutator expects. Everything specific to `rpc.php` is inside it: the request body shape, error decoding, response normalisation, session-expiry handling, task polling, downloads.
- **Server state lives in TanStack Query**, keyed by operation and parameters. Client state (theme, table preferences) lives in small zustand stores. No server data is copied into client stores.
- **Types come from the contract.** `ts-api-omv` has the DTOs; nothing else declares the shape of a request or response.

## Workspace

A pnpm workspace under `web/`, mirroring the reference application.

| Package | Contents | Depends on |
|---------|----------|------------|
| `@omv-webui/spec-api-omv` | The contract itself: OpenAPI source, examples, Redocly lint rules, bundle script; exports `generated/openapi.json` | — |
| `@omv-webui/ts-api-omv` | Generated DTOs (types and enum constants). Committed. No dependencies | — |
| `@omv-webui/react-api-omv` | Generated TanStack Query hooks (committed); the transport module (on `fetch`); the task helper; example data for mocks | `ts-api-omv`, React, TanStack Query |
| `@omv-webui/css-ui-style` | Tailwind entry stylesheet built from `design/tokens.css` | — |
| `@omv-webui/react-ui-components` | Shared components (button, field, table, pill, meter, dialog, task log, banner…) with Storybook | `css-ui-style` |
| `@omv-webui/ts-app-tooling` | Shared ESLint (including the `UI-*` forbidden-API rules), Prettier and tsconfig base | — (dev only) |
| `omv-web-app` | The interface: routes, pages, feature hooks, i18n catalogues, mocks wiring | all of the above |

Technology choices and versions follow the reference application's pnpm catalog, with the differences listed under D7 in [01](01-decisions.md#d7-the-stack-mirrors-the-reference-application).

There is exactly one orval run, configured in `react-api-omv`, which writes hooks there and DTOs into `ts-api-omv` (as in the reference application). `spec-api-omv`, `ts-api-omv` and `react-api-omv` have no dependency on the application or the component library, so another interface can use them alone (D12).

## Repository

```
web/                                the workspace above
  packages/spec-api-omv/            the contract
    src/index.yaml                  OpenAPI root
    src/operations/<Service>/       one file per operation
    src/schemas/                    shared schemas
    src/examples/                   captured, scrubbed example responses
    redocly-plugins/, redocly.yaml  lint rules
    generated/openapi.json          bundled (committed)
    EXCLUDED.md                     backend methods deliberately not in the contract, with reasons
.agents/                            agent instructions: rules, skills, subagents, hooks (D13)
.claude/                            symlinks into .agents/ for Claude Code, plus its project settings
debian/                             packaging
etc/nginx/openmediavault-webgui.d/  the snippet
usr/share/openmediavault/workbench/navigation.d/   a link to the new interface in the stock one
design/                             tokens.css, preview.html
tools/
  colour-audit.mjs
  contract-bootstrap/               OMV rpc.* datamodel → draft request schema
  contract-drift/                   compare contract with an OMV source tree or install
  contract-capture/                 record real responses from a test VM as examples
docs/
```

## Routing

- Path-based routing under the base path `/ui/`. The nginx snippet falls back to `/ui/index.html` for unknown paths under `/ui/`.
- The route tree is static and typed. Route parameters are identifiers of the thing being viewed (a share's UUID, a disk's device name), validated before use. A route never names a backend service, method or arbitrary parameters (UI-4).
- Unauthenticated users see only the login routes. After login the application goes to a fixed route, or back to the in-application route the user was on when the session expired, held in memory (never taken from the URL).

## Cross-cutting behaviour

| Concern | Where | Behaviour |
|---------|-------|-----------|
| Session | transport + a session store | `Session.login` / `verify` / `logout`; a 401 from any call clears state and shows login; an idle-warning before OMV's timeout |
| Role | session store, route guards | Administrator-only routes are hidden from users. This is presentation only; the backend enforces |
| Pending changes | a query on `Config.isDirty`, refetched after every mutation marked `x-omv-dirty` | The banner of the style guide; apply and revert are tasks |
| Tasks | the task helper in `react-api-omv`, and one task registry for the whole application | Start, poll `Exec.getOutput`, expose output and state to a hook; stop. The registry holds running tasks in memory, so a task keeps being followed when the user moves to another page and stays reachable from the top bar (style guide 5.7). Polling stops when the task ends, when the user signs out or the session ends, or when the tab closes |
| Errors | transport | One error type with `status`, `message`, `code`; never a stack trace on screen (UI-9) |
| Polling | TanStack Query `refetchInterval` per page | Sent with `options.updatelastaccess: false` so background polling does not keep a session alive |
| Mocks | MSW in development and tests | Serve the contract's examples; excluded from the production bundle |
| i18n | i18next, typed keys | English catalogue first; no user-facing string in code |
| Theme | `prefers-color-scheme` in the stylesheet, a `.dark` / `.light` class on `<html>` only for an explicit choice | The OS preference applies from the first paint with no script (UI-1 forbids an inline script). The user's choice is set by the entry module before the first render, so at most a stored choice that differs from the OS shows the OS theme for a moment |

## What is deliberately absent

- No server component, no service worker, no offline mode.
- No third-party requests of any kind: fonts, icons and scripts are in the package.
- No generic "call any method" hook exposed to pages. The transport module accepts only operations the generated client knows.
