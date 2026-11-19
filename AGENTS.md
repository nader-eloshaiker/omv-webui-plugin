# AGENTS.md

openmediavault-webui: an openmediavault 8 plugin that gives OMV a new web interface. It is a static single-page application (React, TanStack Router and Query, Tailwind) served from OMV's own web server, calling OMV's existing `rpc.php` with the user's existing session. A hand-written OpenAPI contract in this repository generates the typed client. Nothing in openmediavault is modified.

The design is in `docs/` (start at `README.md` for the reading order). The phases and acceptance criteria are in `docs/07-implementation-plan.md`. The rules in `docs/05-security.md` (`UI-*`) are binding.

`docs/later-gateway/` is a parked design for a separate backend gateway. **Do not build it and do not follow its requirements** unless the owner says so. The one thing taken from it now is the seam described in `docs/02-architecture.md`: only the transport module knows about `rpc.php`.

## Rules that always apply

1. **No AI attribution anywhere**: no `Co-Authored-By`, session links or "generated with" lines in commits, pull requests, code or docs.
2. **No personal data in the repo**: no IP addresses, host names, user names or serial numbers from a real system. Use `NAS_HOST` and documentation addresses. Captured example responses are scrubbed before commit.
3. **No exploit detail for unfixed upstream issues.** Some weaknesses of OMV's web layer are known privately and not yet disclosed upstream. Refer to them by class and review ID only (`H1`, `M9`, ...). Never add reproduction steps, payloads or request sequences.
4. **Do not modify openmediavault.** The plugin installs beside it: no patching of files owned by another package, no direct edits to `config.xml`.
5. **The `UI-*` security rules are not negotiable by an implementer.** If one seems wrong or impossible, stop and ask the owner.
6. **Only the transport module talks to the backend.** No component, hook or page calls `fetch`, builds a `{service, method}` pair, or touches `rpc.php` or `download.php` directly. Everything goes through the generated client.
7. **The contract is the source of types.** Never hand-write a request or response type that the contract should own; add or fix the operation in the contract (`web/packages/spec-api-omv/src/`) and regenerate.
8. **Verify on a test system before building on an assumption.** `docs/07-implementation-plan.md` lists the facts read from source and not yet observed. Phase 0 checks them. Never test against a production NAS; use a disposable OMV 8 virtual machine. Test credentials come from the env file (see `docs/07-implementation-plan.md`, ground rule 2); before typing a password or one-time code into a page, an agent asks the owner once per session.
9. **Colour and visual changes go through the audit.** Run `node tools/colour-audit.mjs` before changing `design/tokens.css`; see `docs/design/style-guide.md`.
10. **Mirror the reference application's structure**, not its domain code: the owner's `wheelhub-web-app` workspace (spec package, DTO package, React client package, component package).
11. **Plain words in the interface.** No Linux knowledge assumed; destructive actions say exactly what will be lost.
12. **Changes reach `main` only through a pull request.** Work on a branch (one phase per branch, or `repo/<topic>` for repository housekeeping), commit only when the owner asks, sign off with `git commit -s`, and open a pull request. Never push to `main` directly; the ruleset refuses it.

## Layout (target)

```
web/               pnpm workspace (package scope @omv-webui/)
  packages/spec-api-omv/          the contract: OpenAPI source, examples, lint rules; generated/openapi.json
  packages/ts-api-omv/            generated DTOs, no dependencies
  packages/react-api-omv/         generated hooks + the transport module (the only rpc.php code)
  packages/css-ui-style/          built from design/tokens.css
  packages/react-ui-components/   shared components
  packages/ts-app-tooling/        shared ESLint, Prettier and tsconfig settings
  apps/omv-web-app/               the interface
debian/            Debian packaging
etc/, usr/share/openmediavault/   nginx snippet, link entry in the stock interface
design/            tokens.css (colour source of truth), preview.html
tools/             colour-audit.mjs, contract tooling
docs/              the design
```

## Rules

The rules live in [`.agents/rules/`](.agents/rules/). Read the one that matches the work before starting it. Where a rule and a design document disagree, the design document wins; the `UI-*` rules in `docs/05-security.md` win over both.

| Rule | Read it before |
| ---- | -------------- |
| [frontend-architecture.md](.agents/rules/frontend-architecture.md) | adding a route, a query, a store, a task or a test |
| [frontend-contract.md](.agents/rules/frontend-contract.md) | changing the contract, regenerating the client, touching the transport module, adding an example or a mock |
| [verification.md](.agents/rules/verification.md) | reporting any change as done: the TypeScript battery, contract checks, the colour audit, built-output checks for UI-1/UI-7/UI-11, browser verification on the mock or the test VM only |

How the agent files are organised, and what each neutral term ("frontier model tier", "the browser tool") means for a given assistant, is in [`.agents/README.md`](.agents/README.md) (decision D13). Skills and subagents are real files in `.agents/`; `.claude/skills/` and `.claude/agents/` hold symlinks only, never real files.

## Available project skills

| Skill | Use it for |
| ----- | ---------- |
| `react` | React code and review in `web/apps/omv-web-app` and `web/packages/react-*` |
| `typescript` | Type design, the transport module, the task helper, contract tooling, `web/packages/ts-*` |
| `design-system` | `design/tokens.css`, `css-ui-style`, `react-ui-components`, Storybook, theming, CSP limits on styling |
| `colour-theory` | Choosing or changing any colour; running and reading `tools/colour-audit.mjs` |
| `uiux-design` | Designing or reviewing a screen, its states and its copy |
| `openapi-spec-reviewer` | Adding or reviewing operations in `web/packages/spec-api-omv/src` |

## Subagents

| Subagent | Model | Use it for |
| -------- | ----- | ---------- |
| `react-developer` | inherit | Building pages, components, hooks and their tests |
| `typescript-developer` | inherit | The transport module, task helper, orval scripts, `tools/contract-*`, lint rules |
| `design-system-engineer` | inherit | Any change to tokens, `css-ui-style` or `react-ui-components` |
| `uiux-designer` | inherit | Designing and reviewing screens and copy, proactively when a surface changes |
| `browser-verifier` | fast tier | Seeing a change on the mock or the test VM: both themes, states, headers, CSP violations |
| `omv-source-reader` | fast tier, read-only | What an OMV `service.method` accepts, returns and requires, before writing its contract entry. Reads the OMV checkout named in the request or in `$OMV_SOURCE_DIR` |

## When you are unsure

Ask. Record each answered question as a dated entry in `docs/journal.md`.
