# 09 — Implementation plan

Written for hand-off. Each phase has a goal, tasks, the requirements it must satisfy, and acceptance criteria that can be checked. Phases are ordered so that the riskiest unknowns are resolved first and so that nothing reachable from a network exists before the controls that guard it.

## Ground rules for the implementer

1. Read [AGENTS.md](../../AGENTS.md) and documents 00–08 before writing code. The `SR-*` requirements are binding.
2. **Work test-first for every `SR-*` marked `T`**: write the test from [10](10-test-and-verification.md), see it fail, implement, see it pass. A requirement is done when its verification is in CI, not when the code exists.
3. **Never test against a production NAS.** Use a disposable OMV 8 virtual machine. Agents do not type passwords; the owner provisions test credentials through environment variables on the test machine.
4. **Stop and ask** when: a requirement cannot be met as written; a Phase 0 assumption turns out false; a backend method behaves differently from the source reading; a dependency seems necessary; anything would widen the gateway user's access.
5. Keep a short `docs/journal.md`: dated entries for each verified assumption, each deviation approved by the owner, and each surprise. This is the memory between sessions.
6. One phase per branch, small commits, no AI attribution anywhere.
7. Do not start a later phase's work early "because it is easy". The order is a security property: for example no HTTP route may exist before the guard stages exist.

## Phase 0 — Verify the ground

**Goal:** turn every fact that was read from source into a fact observed on a running OMV 8 test system, and prove the isolation model works at all. No product code.

Deliver a throwaway spike under `spike/` (deleted at the end of the phase) and a filled-in table in `docs/journal.md`.

| ID | Assumption to verify | How |
|----|----------------------|-----|
| A1 | Wire framing and reply shape are as in [06](06-engined-protocol.md); a member of `openmediavault-engined` can call `System.getInformation` with an administrator context | A 50-line Go program run as a temporary test user in that group |
| A2 | What methods expect for "no parameters" (`null`, `[]` or `{}`), for a method with and without a parameter schema | Try each against two methods |
| A3 | No RPC service other than `Session` is local to the web process on a stock install with common plugins | List the web root's `rpc/` directory |
| A4 | Which fields in the first operations exceed 2^53 or arrive as strings/`0`/`1` | Capture replies; note per field |
| A5 | Cost of one backend call on the smallest supported hardware (median and p95), and behaviour at 8, 16, 32 concurrent calls | Measure with the spike |
| A6 | Behaviour when the client stalls mid-request and when it closes early: does the daemon block, exit, recover? | Reproduce deliberately on the test VM; record exactly |
| A7 | A process under `PrivateNetwork=yes` and `RestrictAddressFamilies=AF_UNIX` can accept on a systemd-passed unix socket and connect to engined's path socket bound read-only | `systemd-run` with those properties |
| A8 | Ownership and mode of the file `LogFile.getContent` returns, and whether a user outside `openmediavault-webgui` can read it | Inspect; decide per [07](07-api-contract.md#downloads-and-uploads) |
| A9 | An exact-match `location` in `openmediavault-webgui.d` overrides the stock PHP location; what the stock interface still needs from `download.php` and from `GET` | nginx test config; exercise the stock interface |
| A10 | The login sequence: `authUser` reply shapes for success, failure, inactive user, administrator, with and without each two-factor plugin; `verifyChallenge` parameter and reply shapes; what `getUser` returns as `name` for a differently-cased input under a case-insensitive name service | Call from the spike on the test VM with test accounts |
| A11 | Which PAM stack `authUser` uses and its lockout parameters on a stock install; whether a success resets the failure count | Read the PAM file on the VM; test with a throwaway account |
| A12 | How OMV resolves a certificate reference to file paths, and how a plugin's Salt state is triggered when the certificate changes | Read the stock nginx state; test |
| A13 | The administrator account name, administrator group name and factory default password as configured on the VM, and where a plugin's Salt state can read the first two | Inspect |
| A15 | Whether a plugin can serve the new interface on OMV's configured HTTPS port, with the stock pages no longer served there, using only the stock include directory (no edit to OMV's site file); what happens on OMV's nginx re-deploy | nginx test configuration on the VM |
| A14 | How to send a notification e-mail from an engined RPC service (for `Gateway.notifyLogin`) | Read OMV's notification code; prototype |

**Acceptance:** every row has an observed result and a date in the journal; any false assumption has an owner decision recorded; the spike is deleted. If A1, A7 or A10 fail in a way that breaks the design, stop: the design is revised before any code.

## Phase 1 — Gateway skeleton and backend client

**Goal:** a daemon that starts under the final systemd sandbox, adopts its socket, loads a contract with zero operations, and can make a backend call from a test harness. It serves only `GET /api/v1/health`.

Tasks:

1. Go module, vendoring, CI (build, `go vet`, `staticcheck`, `gosec`, `govulncheck`, race tests), reproducible build flags (SR-SUP-1, -2, -4).
2. `internal/config`: strict parse, every field validated, unknown fields rejected.
3. `internal/engined`: framing codec, deadlines, size caps, concurrency slots, typed errors, the scriptable fake server, the fuzz target (SR-ENG-1..4, SR-DOS-1..3, SR-SUP-6).
4. `internal/httpx`: server with limits, systemd socket adoption, readiness notification, error rendering, response header policy (SR-DOS-4, SR-OUT-5).
5. `internal/audit` and `internal/redact` (SR-AUD-1..4).
6. Lint rules: no dialler outside `engined`, no `os/exec`, no file writes (SR-ISO-4, SR-ISO-8).
7. Build tags for development mode and the start-up log line (SR-SUP-7).

**Acceptance:** the unit from [08](08-plugin-packaging.md#systemd-unit) runs the daemon on the test VM; `systemd-analyze security` score recorded; health answers through a hand-written nginx location; a test binary inside the same sandbox calls `System.getInformation` through `internal/engined`; all `SR-ENG-*`, `SR-DOS-1..4`, `SR-AUD-*` tests pass; fuzzers run clean for the CI budget.

## Phase 2 — Guard, sessions, login

**Goal:** the complete front door, with no business operations behind it yet. This phase is the heart of the security work and gets the most review.

Tasks:

1. `internal/guard`: the ordered stages of [02](02-architecture.md#request-lifecycle), each a small function with its own tests (SR-REQ-1..7, SR-AUTHZ-1..5).
2. `internal/session`: store, cookie handling, request token, limits, idle and absolute expiry, revalidation, revocation by effect (SR-SESS-1..10).
3. `internal/auth`: the login state machine, pending logins, rate limiters, canonical-name check, default-credential restriction, replay cache, step-up (SR-AUTH-1..12, SR-CTX-1..4).
4. Session endpoints of [05](05-authentication-and-sessions.md#endpoints), in the contract and in the gateway.
5. The plugin's `Gateway.notifyLogin` backend method, if A14 allows.
6. The security test suite for this phase from [10](10-test-and-verification.md), including the negative tests for every guard stage and the "internal context call sites" enumeration test.

**Acceptance:** every `T` verification for `SR-REQ`, `SR-SESS`, `SR-AUTH`, `SR-CTX`, `SR-AUTHZ-1..5` passes against the fake backend **and** the login flow passes end to end against the test VM with: an administrator, a normal user, an inactive user, a user with a time-based second factor, the factory default password. An independent review of this phase (a second reviewer who did not write it, human or a fresh agent given the code and document 04 but not the implementer's reasoning) reports no unresolved finding.

## Phase 3 — Contract pipeline and first operations

**Goal:** the path from an authored operation to a typed hook works, for one operation of each pattern.

Tasks:

1. `contract/`: structure, Redocly configuration, the custom `x-omv-*` lint rules (SR-CON-2..4, SR-AUTHZ-1, -3, -4).
2. `tools/contract-bootstrap`, `tools/contract-drift`, `tools/contract-capture` ([07](07-api-contract.md)).
3. `internal/contract` (load, route table, validators), `internal/normalise`, the strict JSON parser, the format implementations with their tables (SR-IN-1..6, SR-OUT-1..4, SR-CON-1).
4. The generic RPC handler.
5. First operations, in this order, each with captured examples and a response schema:
   - `System.getInformation` (read; `admin`)
   - `SSH.get`, `SSH.set` (configuration object; `set` is `elevated` and `x-omv-dirty`)
   - `Config.isDirty` / the pending-changes read, `Config.applyChanges` (task), `Config.revertChanges`
   - `ShareMgmt.getList` (paged list with computed fields)
   - `UserMgmt.getUserByContext` (first `user`-role operation, with its SR-AUTHZ-6 note)
6. `internal/tasks` and the task endpoints (SR-TASK-1..4).
7. Fragment loading (SR-CON-5..7) with a sample fragment in the tests.
8. `contract/EXCLUDED.md` started (SR-CON-8), listing at least the methods implicated by the private review as unsafe to expose.

**Acceptance:** the five operation groups work against the test VM through the real nginx site; the drift tool passes against the VM's OMV version; a request with an extra property, a wrong type, a control character, a trailing newline, a duplicate key or a NUL is rejected at the gateway for each operation; a user session receives 403 on every `admin` operation; `elevated` operations refuse without step-up; a task started by one user cannot be followed by another.

## Phase 4 — Packaging as a plugin

**Goal:** `apt install ./openmediavault-webui_*.deb` on a clean OMV 8 gives a working, disabled-by-default plugin that the administrator can enable from the stock interface in one step (including the one-click self-signed certificate), after which the settings page shows the address of the new interface.

Tasks:

1. Debian packaging, maintainer scripts, user creation ([08](08-plugin-packaging.md)).
2. Datamodels, `Gateway` RPC service, engined module, confdb script.
3. Salt states: `config.json`, nginx site and header snippet, units.
4. The settings page for the legacy workbench.
5. Prove the systemd unit line by line; record the final unit and score in [08](08-plugin-packaging.md#systemd-unit).
6. Package self-check script covering every `C` verification in [04](04-security-requirements.md); run in CI against a VM image.
7. Install, enable, disable, upgrade, remove and purge tests; verify the stock interface is byte-for-byte unaffected with the plugin disabled.

**Acceptance:** all `C` verifications pass on `amd64` and `arm64`; removal leaves no file, user or nginx rule behind; an OMV point-release upgrade with the plugin installed shows no conffile prompt.

## Phase 5 — Web interface foundation

**Goal:** the workspace, the design system and the authentication flows of the interface. No feature pages beyond what proves the stack.

Tasks:

1. `web/` workspace mirroring the reference application: `spec-api-omv`, `ts-api-omv`, `react-api-omv` (one orval run, the hand-written mutator), `css-ui-style` built from `design/tokens.css`, `react-ui-components`, `apps/omv-web-app` (Vite, React, TanStack Router and Query, i18n).
2. Lint rules for SR-UI-2..6; build checks for SR-UI-1 and SR-UI-7 (no inline script or style, no external origin, no mock code in the production bundle).
3. Login, second factor, restricted password change, step-up dialog, session expiry handling, the tab hand-over.
4. Application shell, navigation, the pending-changes banner, task progress view, error and empty states, per the [style guide](../design/style-guide.md).
5. Pages for the Phase 3 operations: system information, SSH settings, shared-folder list.
6. MSW mocks from contract examples; component and integration tests; an accessibility pass (keyboard, contrast via `tools/colour-audit.mjs`, reduced motion).

**Acceptance:** a full login → change SSH setting → step-up → apply changes → watch task → logout journey passes in a browser test against the test VM; the CSP produces no violation report during that journey; the colour audit exits 0; the production bundle contains no `sessionStorage` access outside the one token module and no forbidden sink.

## Phase 6 — Coverage, by domain

**Goal:** grow the contract and the interface domain by domain until the interface is usable for daily administration.

Suggested order (owner to confirm): dashboard and monitoring reads → storage (disks, SMART, file systems) → shared folders and permissions → users and groups → services (SMB, NFS, SSH, rsync) → network → system (time, notifications, certificates, updates, power) → plugins.

For each domain: read the backend methods in source; decide exclusions; bootstrap and review request schemas; capture examples; write response schemas; classify role and sensitivity; implement pages; add the domain's negative tests. A domain is done when its operations pass the same acceptance list as Phase 3.

Decide in this phase, with the owner: rendering of third-party plugin pages; page-level `/views/` endpoints where a page needs many calls; downloads (after A8); uploads (probably not in version 1).

## Phase 7 — Lockdown and release hardening

Tasks:

1. Legacy lockdown stages and the shell helper ([08](08-plugin-packaging.md#legacy-lockdown)), with tests that each stage blocks what it claims and that removal restores the stock behaviour.
2. The full release gate of [10](10-test-and-verification.md).
3. A manual penetration pass against the test VM following the threat list in [03](03-threat-model.md), by someone who did not build it.
4. SBOM, reproducibility check, release notes including the residual-risk statement.
5. User documentation: what the plugin protects, what it does not, how to enable lockdown, how to recover access.

**Acceptance:** release gate green; penetration findings resolved or accepted in writing by the owner; documentation reviewed.

## Dependencies between phases

```
0 ──▶ 1 ──▶ 2 ──▶ 3 ──▶ 4 ──▶ 6 ──▶ 7
                  └────▶ 5 ──▶ 6
```

Phase 5 can start once Phase 3 has produced a bundled contract with examples (the interface develops against mocks). Phases 4 and 5 can run in parallel.

## Hand-off notes

- **Design status:** complete for Phases 0–5; Phase 6 is a method to follow, not a finished specification; Phase 7 is specified by its tests.
- **Not yet verified on a running system:** everything in the Phase 0 table. The design was derived from OMV's source at 8.6.x.
- **The private security review** of the legacy web layer is not in this repository. Its findings are referenced by ID and class in [03](03-threat-model.md#how-the-legacy-findings-map). Some are undisclosed upstream; rule 3 of AGENTS.md applies.
- **Reference application** for frontend structure and conventions: the owner's `wheelhub-web-app` workspace (spec package, DTO package, React client package, component package, colour-theory rules). Mirror its structure; do not copy its domain code.
- **Open questions** are listed at the end of [01](01-solution-review.md#what-the-review-could-not-settle).
- **Where judgement is expected:** response schemas, exclusions, role and sensitivity classification of each new operation. Each is reviewed by the owner per domain.
- **Where judgement is not wanted:** anything in [04](04-security-requirements.md).
