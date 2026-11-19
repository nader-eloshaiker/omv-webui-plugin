# 01 — Decisions

Every decision that shapes the build, with its reason. Dated entries were decided by the owner on that date.

## D1. The interface talks to `rpc.php`

*2026-11-19.* The interface uses OMV's existing endpoint, login and session. It does not ship its own backend.

**Considered:** a Go API gateway in front of `omv-engined`, replacing `rpc.php` for the new interface. Fully designed in [later-gateway](later-gateway/README.md).

**Why not now:**

- The goal is a better interface. The gateway solves a different problem (the security of OMV's web layer) at several times the cost: a root-equivalent daemon to get exactly right, compiled binaries for three architectures, a sandbox to prove, a second login.
- It works against simple installation: a second port, a certificate step, a separate session.
- Weaknesses in OMV's web layer are better fixed upstream, where every OMV user benefits, than worked around for people who install one plugin.
- Every backend method, including other plugins', is reachable through `rpc.php` without an allow-list to maintain.

**Accepted knowingly:** the interface is exactly as secure as OMV's web layer. See [05](05-security.md#inherited-and-not-fixable-here).

**Kept open:** D5.

## D2. One plugin, named for what the user gets

*2026-11-19.* Package `openmediavault-webui`, repository `omv-webui-plugin`, described as "A new web interface for openmediavault". One package, never split into pieces a user must choose between.

## D3. Served from OMV's own site, under `/ui/`

*2026-11-19 (owner asked for the already configured port).* Same host, same port, same session cookie. No extra port, no certificate step, no settings. The stock interface stays at `/`.

Consequences:

- The new interface shares an origin with the stock one. Script running in either can act in the other. The stock interface has known places where untrusted content can become script (review IDs `M11`, `M12`); those reach the new interface's session too. This is the same exposure a stock OMV already has; the plugin does not add to it.
- The interface serves over whatever OMV is configured for, including plain HTTP on a default install. It shows a persistent notice when not on HTTPS.

## D4. A hand-written contract generates the client

The contract is an OpenAPI 3.0.3 document in the `spec-api-omv` package (`web/packages/spec-api-omv/src/`, see D7). Request schemas are bootstrapped from OMV's `rpc.*` datamodels by a tool and then reviewed; response schemas are written from captured real responses. One orval run produces DTOs and TanStack Query hooks. Detail in [04](04-api-contract.md).

Nothing on the server enforces the contract. Drift is caught by: a drift tool comparing request schemas with the installed OMV's datamodels; response validation against the schema in development and test builds; captured examples that must validate.

## D5. The backend is behind a seam

Operations are addressed as `POST /rpc/{Service}/{method}` in the contract. The transport module turns that into an `rpc.php` request. No other code knows the wire format. Replacing the endpoint later (for the parked gateway or anything else) means replacing that one module.

## D6. RPC-shaped operations, no GraphQL

The backend computes whole responses and forks a process per call; nested resolvers would multiply calls; OMV's schema dialect maps poorly to GraphQL's types; the reference stack is OpenAPI. Page-level aggregation, where needed, is done in the client with parallel queries.

## D7. The stack mirrors the reference application

React, TypeScript, Vite, TanStack Router and Query, Tailwind v4, shadcn-style components on Base UI, lucide icons, react-hook-form with valibot, i18next, MSW for mocks, Vitest and Playwright. pnpm workspace with the package split of the owner's `wheelhub-web-app`: spec, DTOs, React client, styles, components, tooling, app.

*2026-11-19.* The owner chose `apps/wheelhub-web-app` as the template for technology selection. When this design is silent on a tool, a version or a configuration detail, take the reference's choice. Versions start from the reference's pnpm catalog. The deliberate differences:

| Topic | Reference | Here | Why |
|-------|-----------|------|-----|
| HTTP client | axios, inside the hand-written mutator | `fetch`, inside the transport module, with the same mutator signature | The generated hooks never import the HTTP library, so nothing else changes. One less runtime dependency (UI-11) and exactly one network call site (UI-10) |
| Contract location | Inside the spec package | Same: `web/packages/spec-api-omv/src/`, bundled to `web/packages/spec-api-omv/generated/openapi.json` | Mirrors the reference; no separate top-level folder and no re-export layer |
| Shared tooling | `ts-app-tooling` package (ESLint, Prettier, tsconfig base) | Same: `@omv-webui/ts-app-tooling` | Mirrors the reference |
| Package scope | `@wheelhub/` | `@omv-webui/` | `@omv/` is not ours to claim on npm, and D12 keeps publishing open |
| Not taken | Cognito / OIDC / jose, Stripe, d3, embla, QR codes, date picker, TanStack Start, runtime `config.js`, the mock-identity packages | — | No use here; the endpoints are constants (UI-3) |
| Fonts | Fontsource package | Fontsource packages for Inter and Roboto Mono | Bundled in the package (UI-7); SIL Open Font License |
| Example responses | Written; the schema decides and a capture only drafts | Captured from a test VM, scrubbed, then reviewed | The backend is not ours, so a capture is the only evidence of its shape. Taken from the reference: a capture drafts an example and is never re-run over committed ones |
| Component primitives | radix-ui and Base UI | **Base UI only**, inside `CSPProvider disableStyleElements` | *2026-11-19, owner, after `A9`.* Radix Dialog, Popover, Menu, Select and ScrollArea insert `<style>` elements, which UI-1 blocks (scroll lock and scrollbar hiding break) and Trusted Types reject. Base UI with style elements disabled passes both. The one rule it would insert (`.base-ui-disable-scrollbar`) lives in `css-ui-style` |
| Toasts | sonner | **Base UI Toast** | *2026-11-19, owner, after `A9`.* sonner inserts its stylesheet as a `<style>` element on every page load |

A new primitive or upgrade is checked the same way: open it under the UI-1 policy and look for violations (see the `design-system` skill).

## D13. Agent instructions are provider-neutral

*2026-11-19.* As in the reference application: everything that tells an AI coding agent how to work here lives in `.agents/` (rules, skills, subagents, hooks), written so it reads the same whichever assistant runs it. A harness that discovers files only in its own folder gets symlinks into `.agents/` (Claude Code: `.claude/skills/`, `.claude/agents/`), never copies. `CLAUDE.md` is a one-line import of `AGENTS.md`. The map from neutral terms to each harness is in `.agents/README.md`.

## D8. Visual design follows the style guide

[design/style-guide.md](design/style-guide.md) and `design/tokens.css`. OMV's sky blue is kept as identity; a deeper blue of the same hue does actions; yellow means pending configuration changes and nothing else; warning is orange. The colour audit gates changes.

## D9. The interface's own security rules are strict even though the backend is unchanged

The interface cannot fix the web layer, but it must not add to its problems. No markup from data, no navigation to supplied targets, no API call derived from a URL, a strict Content Security Policy for `/ui/`. Rules `UI-*` in [05](05-security.md).

## D10. The new-browser login e-mail is unchanged

OMV e-mails a user when their account logs in from a browser it has not seen. That happens inside `Session.login`, which the interface calls as-is, so the behaviour is kept with no work. (The earlier question about it applied only to the gateway design.)

## D11. Licence

*2026-11-19.* GPL-3.0-or-later for the whole repository. Source files carry `SPDX-License-Identifier: GPL-3.0-or-later`.

## D12. Separable by design

*2026-11-19.* The contract and the generated client packages have no dependency on the application. Someone building a different interface can consume `spec-api-omv`, `ts-api-omv` and `react-api-omv` on their own. The packages are structured so they could be published separately later.

## Open questions

None blocks the build. Each is decided by the owner when its phase arrives.

1. **Other plugins' pages.** Plugins describe their settings pages in YAML manifests for the stock interface. Version 1 links to the stock interface for them. Whether to render those manifests natively is a later decision (Phase 5). Two plugins are an exception, decided on 2026-11-20: version 1 covers the storage tasks of the RAID plugin (`openmediavault-md`) and the ZFS plugin (`openmediavault-zfs`) with its own pages, shown only when the plugin is installed ([UX audit](design/ux-audit.md), Q8).
2. **Languages.** The plan builds with i18next from the start and ships English first. Reusing OMV's existing translations is to be investigated in Phase 5.
3. **Making the new interface the default landing page.** Possible later as an opt-in setting; not in version 1.
4. **Order of domains** in Phase 5: a suggested order is in [07](07-implementation-plan.md#phase-5--coverage-by-domain).
