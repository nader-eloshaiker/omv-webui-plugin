# Journal

Dated entries: each verified assumption (Phase 0 `A1`–`A11`), each owner decision, each surprise. Newest last. Observations only: no host names, addresses, user names, credentials, or request sequences that reproduce a weakness of OMV (those go to the owner privately).

Status values for assumptions: **confirmed**, **false** (needs an owner decision), **partly** (what holds and what does not is stated), **preliminary** (observed outside the test VM; to be repeated on it).

## 2026-11-19 — Owner decisions before Phase 0

- The design documents were committed to `main` as handed over; Phase 0 runs on branch `phase-0`.
- `apps/wheelhub-web-app` is the template for technology selection. Differences recorded under D7 in [01](01-decisions.md#d7-the-stack-mirrors-the-reference-application): the transport is written on `fetch` (no axios); a seventh package `ts-app-tooling`; the contract lives inside `spec-api-omv`; the package scope is `@omv-webui/`.
- Agent instructions follow the reference's provider-neutral layout (`.agents/` with symlinks from `.claude/`): D13.
- Throwaway scripts live in the git-ignored `scratch/`.

Design clarifications made with these, open to the owner's correction:

- Tasks are followed by one registry for the whole application, so a task survives moving between pages; polling stops when the task or the session ends ([02](02-architecture.md#cross-cutting-behaviour), [08](08-test-and-verification.md)).
- No correlation identifier is shown with errors; `rpc.php` has none (style guide 7).
- `A4` no longer asks for a large virtual disk: a disk cannot reach 2^53 bytes. It asks instead which fields arrive as strings or `0`/`1` and whether any 64-bit counter is served.
- Form validation schemas (valibot) are written by a script of our own from the contract; orval emits zod only ([04](04-api-contract.md#the-pipeline)).
- The theme follows `prefers-color-scheme` with no script; a class on `<html>` records only an explicit choice ([02](02-architecture.md#cross-cutting-behaviour)).
- Squircle corners (`corner-shape: squircle`) as a progressive enhancement on controls, cards and dialogs; pills, dots and meters stay round (style guide 4.3).

## 2026-11-19 — A9 (preliminary): the UI-1 policy against the reference stack

**Status: partly; preliminary** (local static server with exactly the UI-1 headers, Chromium; repeat through the A1 snippet on the test VM).

Set-up: a throwaway production build (`scratch/phase0/a9-csp/`, Vite 8, React 19.3, TanStack Router 1.170 and Query 5.104, Tailwind 4.3, radix-ui 1.6.7, Base UI 1.8.0, sonner 2.0.8, recharts 3.10.1, versions from the reference catalog) served at `/ui/` with the UI-1 policy enforced and `require-trusted-types-for 'script'` in report-only. Each component was opened in a fresh page load and violations were collected from `securitypolicyviolation` events and the policy's report endpoint.

| Part of the stack | Enforced UI-1 policy | Trusted Types (report-only) | Effect |
|---|---|---|---|
| Vite build output (`index.html`) | Clean: one external script, one external stylesheet, nothing inline | — | — |
| React 19 `style` props, Tailwind stylesheet, TanStack Router (incl. a deep link), TanStack Query | Clean | Clean | — |
| recharts | Clean (sizes set through `element.style`, which CSP allows) | Clean | — |
| sonner | 2 violations at module load: it inserts its stylesheet as a `<style>` element | Clean | Toasts lose their styling; the violation fires on every page load, even with no toast shown |
| Radix Dialog, Popover, DropdownMenu, Select | 1 violation each on open: the scroll lock (`react-style-singleton`) inserts a `<style>` element | Clean | Page scrolling is not locked behind the dialog or menu |
| Radix Select and ScrollArea | 1 violation each: they render a `<style>` element to hide the native scrollbar | 1 report each (`innerHTML` through `dangerouslySetInnerHTML`) | The native scrollbar shows; under enforced Trusted Types the component would throw |
| Base UI (Dialog, Select, Popover, Menu, Tooltip, Toast, ScrollArea), default | 1 violation: one shared `.base-ui-disable-scrollbar` `<style>` | Clean | Native scrollbar shows in its scroll areas |
| Base UI inside `CSPProvider disableStyleElements` | **Clean** | **Clean** | Scroll lock works (set through `element.style`); every component opened. The one rule Base UI would have inserted goes into our own stylesheet instead |

Reading: UI-1 can be met with no change to the policy, but not with the reference's component mix. Radix (for Dialog, Popover, Menu, Select, ScrollArea) and sonner add violations and lose behaviour. Base UI with `disableStyleElements`, plus a Base UI toast, passes, and Trusted Types look enforceable on that stack. This needs an owner decision (primitive library and toast), recorded below when made.

## 2026-11-19 — Owner decision on A9: Base UI only

The component library uses Base UI only, inside `CSPProvider disableStyleElements`, and Base UI's toast; no Radix and no sonner. UI-1 stays as written. Recorded under D7 in [01](01-decisions.md#d7-the-stack-mirrors-the-reference-application). `require-trusted-types-for 'script'` is to be tried enforced once the Phase 2 shell exists; A9 is repeated through the A1 snippet on the test system.

## 2026-11-19 — Owner decision: test credentials

The rule "agents never type passwords" is softened. Test credentials live in an env file outside the repository (`$OMV_WEBUI_ENV`, by default `~/.config/omv-webui/test.env`, readable only by the owner). Scripts and tests read it. Before an agent types a password or one-time code into a page, it checks the credential is in that file, names the account and target, and asks the owner; a yes covers that session only. Recorded in [07](07-implementation-plan.md) ground rule 2, `AGENTS.md` rule 8 and the agent rules.

A disposable OMV 8 virtual machine exists for Phase 0: VMware Fusion on Apple silicon, Debian 13 arm64, OMV 8.6.1, four empty data disks, snapshots before and after the test accounts were created. Its address is `NAS_HOST` in the env file.
