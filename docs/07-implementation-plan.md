# 07 — Implementation plan

Written for hand-off. Each phase has a goal, tasks and acceptance criteria that can be checked.

## Ground rules

1. Read [AGENTS.md](../AGENTS.md) and documents 00–06 and the [style guide](design/style-guide.md) before writing code. The `UI-*` rules in [05](05-security.md) are binding.
2. **Test on a disposable OMV 8 virtual machine** (the OMV repository has a `vagrant/` set-up). The owner's own server is used only like this, and anything that does not fit goes to the VM:
   - read-only by default; any change is shown to the owner first and made only after a yes;
   - never a destructive, two-factor, failed-login (`M9`) or package-install test;
   - sign-in only with the account in `$OMV_WEBUI_OWNER_ENV`, which is the owner's administrator account (there is no separate account for the agent, so read-only matters all the more). The agent signs in from a fresh browser context of its own (Playwright), never the owner's browser profile, so it neither shares nor ends the owner's session. A first sign-in from a new browser makes OMV send its "new browser" notification;
   - raw captures stay in the git-ignored `scratch/` and are scrubbed before anything is committed;
   - its name and addresses never enter the repository; it is `NAS_HOST` like any other target.

   Test credentials live in env files outside the repository, readable only by the owner: `$OMV_WEBUI_ENV` (by default `~/.config/omv-webui/test.env`) for the VM and `$OMV_WEBUI_OWNER_ENV` (by default `~/.config/omv-webui/owner.env`) for the owner's server. They never go in the repository, a log, a commit or a chat. Scripts and tests read them from there. An agent may type a password or one-time code from these files into a sign-in page of the VM, or of the owner's server under this rule, without asking (owner, 2026-11-19), and never prints one. If the file or the credential is missing, or the target is neither, the agent stops and asks.

   **The mock first.** Screens and their states are verified on the mock (MSW serving the contract's examples). The VM is for what only a real backend can show: headers and CSP, sessions, tasks, writes read back, and the captures the examples are drafted from.
3. **Stop and ask** when: a Phase 0 assumption is false; a backend method behaves differently from what the contract says; a `UI-*` rule cannot be met; a new runtime dependency seems necessary; you notice a weakness in OMV itself (see [05](05-security.md#reporting-weaknesses-found-while-building)).
4. Keep `docs/journal.md`: dated entries for each verified assumption, each owner decision, each surprise. It is the memory between sessions.
5. One phase per branch; small commits; `make test` before every build; no AI attribution anywhere.
6. Generated code (`ts-api-omv/src/generated`, `react-api-omv/src/generated`, `spec-api-omv/generated`) is never edited by hand.
7. Mirror the reference application (`wheelhub-web-app` and its `packages/`) for structure, configuration, technology and conventions. When this plan is silent on a tooling detail, do what the reference does. The deliberate differences are listed under D7 in [01](01-decisions.md#d7-the-stack-mirrors-the-reference-application).
8. Throwaway scripts (Phase 0 and any later spike) live in `scratch/`, which is git-ignored. They read the test VM's address and credentials only from environment variables.

## Phase 0 — Verify the ground

**Goal:** turn facts read from source into facts observed on a running OMV 8 test system. No product code; throwaway scripts only.

| ID | Assumption | How to verify |
|----|------------|---------------|
| A1 | The nginx snippet in [06](06-plugin-packaging.md#nginx-snippet) serves a static directory at `/ui/` with its own headers, wins over the stock locations, supports deep links, and survives OMV re-deploying nginx | Install a hand-made snippet and a placeholder page; inspect response headers; change an OMV web setting and apply |
| A2 | What `rpc.php` expects when an operation has no parameters; the paging parameters for "all rows" | Call two methods each way |
| A3 | The session cookie's name and attributes; what a call without a session returns; the idle-timeout behaviour; the effect of `options.updatelastaccess: false` | Browser developer tools and scripted calls |
| A4 | Which fields in the first operations arrive as numeric strings, as `0` / `1`, or as numbers where a string is expected; whether any numeric field is a 64-bit counter that can pass 2^53 (byte and packet counters, statistics) and how such values are serialised. (A disk cannot reach 2^53 bytes, about 9 PB, so no large virtual disk is needed.) | Capture and inspect replies |
| A5 | How (or whether) a stock-interface navigation entry can link to `/ui/` | Try a manifest entry |
| A6 | Exact parameters and replies of `Config.isDirty`, `applyChangesBg`, `revertChangesBg`, and of `Exec.getOutput` / `isRunning` / `stop`; what a failed task looks like; what a "configuration is dirty" error looks like | Scripted calls, including a deliberately failing apply |
| A7 | What numeric data is available for charts (CPU, memory, network, disk usage over time) without using pre-rendered graph images | Read the `Rrd` / performance-statistics services; call them |
| A8 | HTTP status and error body for: wrong password, validation failure, forbidden for role, unknown method, backend exception | Scripted calls |
| A9 | The CSP of UI-1 works with the framework stack (React, Radix, Base UI, TanStack, Tailwind, the toast library) with no violation; whether `require-trusted-types-for 'script'` can be added. Known risk: libraries that insert `<style>` elements at run time (sonner; Radix Select and ScrollArea; the scroll lock used by Radix Dialog, Popover and Menu). List each violation by library and what breaks | A minimal build of the stack, first with the UI-1 headers on a local static server, then through the A1 snippet |
| A10 | `Session.login` / `verify` request and reply shapes with no second factor and with each two-factor plugin enabled; the 429 behaviour | Scripted calls with test accounts |
| A11 | The plugin's files and snippet survive `omv-mkworkbench`, an OMV package upgrade and removal of the plugin leaves nothing behind | Do each on the VM |

**Acceptance:** every row has an observed result and a date in the journal; the final nginx snippet is recorded in [06](06-plugin-packaging.md); any false assumption has an owner decision. If A1 or A9 fail in a way that breaks D3 or UI-1, stop and raise it.

## Phase 1 — Workspace, contract pipeline, transport

**Goal:** `pnpm generate` turns an authored operation into a typed hook that works against the VM and against mocks.

Tasks:

1. `web/` pnpm workspace with the seven packages of [02](02-architecture.md#workspace), scope `@omv-webui/`; pnpm catalogs, `allowBuilds` all false and `engine-strict` as in the reference; TypeScript, ESLint, Prettier, Vitest configured through `ts-app-tooling` as in the reference application.
2. The contract in `spec-api-omv`: structure, Redocly configuration, the `x-omv-*` lint rules, bundle script.
3. `tools/contract-bootstrap`, `tools/contract-drift`, `tools/contract-capture` (with scrubbing) per [04](04-api-contract.md).
4. orval configuration and the scripts around it (operation table, examples index, valibot form schemas).
5. The transport module per [03](03-rpc-transport.md): request building, error type, 401 handling, normalisation, development-build response validation.
6. The task helper.
7. The first operations of [04](04-api-contract.md#first-operations), each with request schema, captured examples and response schema.
8. MSW handlers generated from the examples.
9. Lint rules for UI-2, UI-3, UI-5, UI-6, UI-10, UI-13 (forbidden APIs and imports).
10. CI: lint, typecheck, unit tests, contract lint, drift check against a pinned OMV source tree, `pnpm audit`.

**Acceptance:** each first operation succeeds against the VM from a test script using the generated client; the same tests pass against mocks; contract lint and drift are clean; development-build validation reports no mismatch for the captured scenarios; a call with a `url` not in the operation table throws without a request.

## Phase 2 — Design system and application shell

**Goal:** the look and the skeleton, with authentication, before any feature page.

Tasks:

1. `css-ui-style` from `design/tokens.css`; fonts packaged locally; the squircle corners of style guide 4.3, with their radii tuned in `design/preview.html`.
2. `react-ui-components`: the components of the style guide section 5, with Storybook stories in both themes: button, field and form parts, table, status pill and dot, capacity meter, dialog and the confirmation variants, banner, toast, empty state, task log.
3. `omv-web-app`: Vite configuration with base `/ui/`, router, query client, i18n, theme switching.
4. Login, second factor (per kind found in A10), unsupported-kind fallback, logout, session expiry and the idle warning.
5. Shell: navigation, top bar, the pending-changes banner with apply and revert as tasks, the HTTP notice (UI-12), "Open the classic interface" link, error and not-found states.
6. Build checks for UI-1, UI-7 and UI-11 (no inline script or style, no external origin, no mock code in the production bundle).

**Acceptance:** sign in → see the shell → sign out works against the VM for an administrator and a normal user, with and without a second factor; the colour audit exits 0; Storybook shows every component in light and dark; keyboard-only operation of login and the shell; zero CSP violations in the browser test.

## Phase 3 — First pages

**Goal:** prove each page pattern end to end.

1. Dashboard start: system information.
2. A settings form: SSH (read, edit, save, pending-changes banner, apply, watch the task).
3. A data table: shared folders (paging, sorting, search, empty state).
4. An account page for a non-administrator (`UserMgmt.getUserByContext`).

**Acceptance:** the journey "sign in → change an SSH setting → apply → watch the task finish → see the new value" passes in a browser test against the VM; table state maps correctly to backend paging; a user-role session sees only what it may.

## Phase 4 — Packaging

**Goal:** `apt install ./openmediavault-webui_*.deb` on a clean OMV 8 gives a working interface at `/ui/` and a link to it.

Tasks: `debian/`, `Makefile`, maintainer scripts with the `nginx -t` guard, the navigation entry, install / upgrade / remove / purge tests on the VM, a check that the stock interface's responses are unchanged with the plugin installed.

**Acceptance:** all of [06](06-plugin-packaging.md) holds on the VM; removal leaves nothing; a deliberately broken snippet in a test build is rolled back by `postinst` without taking the stock interface down.

## Phase 5 — Coverage, by domain

**Goal:** grow until the interface serves daily administration.

Suggested order (owner to confirm): dashboard and monitoring → storage (disks, SMART, file systems) → shared folders and permissions → users and groups → services (SMB, NFS, SSH, rsync) → network → system (date and time, notifications, certificates, updates, power) → plugins list.

For each domain:

1. Read the backend methods in source; note quirks; check `EXCLUDED.md`.
2. Bootstrap and review request schemas; capture examples in the scenarios; write response schemas; classify role, `x-omv-dirty`, `x-omv-task`, `x-omv-destructive`.
3. Design the pages against the style guide; agree the design with the owner before building where the domain has destructive actions.
4. Build pages, tests and mocks.
5. Integration tests against the VM.

Decide with the owner during this phase: the open questions in [01](01-decisions.md#open-questions).

## Phase 6 — Release

1. The release gate of [08](08-test-and-verification.md).
2. An accessibility pass and a pass in both themes over every page.
3. User documentation: what the plugin is, how to open it, that it shares OMV's login, what it does not change about security.
4. Release notes, including the supported OMV versions.

## Dependencies between phases

```
0 ──▶ 1 ──▶ 2 ──▶ 3 ──▶ 5 ──▶ 6
                   └──▶ 4 ──┘
```

Phase 4 can run in parallel with Phase 5 once Phase 3 has produced a build.

## Hand-off notes

- **Design status:** complete for Phases 0–4. Phase 5 is a method to follow per domain, not a finished specification; page designs are produced there.
- **Not yet verified on a running system:** everything in the Phase 0 table. The design was derived from OMV's source at 8.6.x.
- **Reference application:** the owner's `wheelhub-web-app` workspace, for structure, tooling configuration, the orval set-up, the mutator pattern, MSW from contract examples, and the colour-theory rules.
- **OMV source:** the owner's local checkout of openmediavault. Backend methods are under `deb/openmediavault/usr/share/openmediavault/engined/rpc/`, datamodels under `…/datamodels/`, the web layer under `deb/openmediavault/var/www/openmediavault/` and `…/usr/share/php/openmediavault/`, the stock interface under `deb/openmediavault/workbench/`. Read it; do not modify it.
- **The private security review** of OMV's web layer is not in this repository. Its findings appear here by ID and class only ([05](05-security.md#inherited-and-not-fixable-here)).
- **`docs/later-gateway/`** is parked. Ignore it unless told otherwise.
- **Where judgement is expected:** response schemas, page design within the style guide, what to exclude.
- **Where it is not:** the `UI-*` rules, the layering rule (only the transport talks to the backend), and not modifying OMV.
