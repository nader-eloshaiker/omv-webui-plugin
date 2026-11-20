# 08 — Test and verification

## Layers

| Layer | Runs against | Purpose |
|-------|--------------|---------|
| Static | Source and the production bundle | Lint, types, the forbidden-API rules (`UI-*` marked `L`), contract lint, bundle checks |
| Unit | Pure code: transport, normaliser, task helper, form schemas, formatters | Table-driven cases |
| Component | Components and pages with MSW serving contract examples | Behaviour, states, accessibility |
| Contract | The contract, an OMV source tree | Lint, drift |
| Integration | A disposable OMV 8 virtual machine | Every operation against a real backend; development-build response validation |
| Browser | The packaged plugin on the VM | Journeys, headers, CSP violations, both roles, both themes |
| Colour | `design/tokens.css` | `node tools/colour-audit.mjs` |
| Manual | Release checklist | The `R` items and what automation cannot see |

## Security tests

Each row is a family the implementer expands into cases. Rule IDs are from [05](05-security.md).

| Rule | Test | Expected |
|------|------|----------|
| UI-1 | Response headers for `/ui/`, `/ui/index.html`, an asset, a deep link, a missing file | Exactly the headers of UI-1 |
| UI-1 | Browser journey with CSP violation reporting captured | Zero violations |
| UI-1 | Scan `index.html` and the bundle | No inline `<script>` content, no `<style>` element, no `style=` attribute in static markup |
| UI-1 | Embed `/ui/` in a frame from another origin | Blocked |
| UI-2 | Lint over the workspace | No forbidden sink; rule cannot be disabled inline without a recorded owner approval |
| UI-2 | Seed, through mocks, strings containing markup, script, template syntax, `javascript:` addresses and bidirectional control characters into every text field of every example; render every page | All shown as inert text; no element or attribute created from data |
| UI-3 | Lint: no `window.location` assignment, `window.open`, `<a href>` or `navigate` with a non-literal external target; no `returnUrl` | Clean |
| UI-3 | Mock a login reply with a hostile `redirecturl` | Ignored |
| UI-4 | Open deep links with crafted paths, query strings and fragments, signed in and signed out | No backend call other than the page's own fixed queries; no mutation on load |
| UI-4 | Unit: call the transport with a `url` not in the operation table | Throws; no request |
| UI-4 | Unit: the download path with an operation not marked `x-omv-download` | Throws; no request |
| UI-5, UI-6, UI-13 | After a full journey, dump `localStorage`, `sessionStorage`, cookies visible to script, the URL history of the tab and the console log | Only preferences; no password, code, session identifier, task handle, user name or server data |
| UI-6 | Mock a settings reply that includes a value for a secret field | Field renders empty and masked |
| UI-7 | Network log of a full journey | Requests only to the page's own origin |
| UI-8 | For every operation marked `x-omv-destructive: data` (generated test) | The page's action opens the typed-name confirmation; the mutation is not sent until it matches |
| UI-9 | Mock an error reply with a `trace` | Trace absent from the DOM, the error object exposed to pages, and the console in a production build |
| UI-10 | Lint: `fetch`, `XMLHttpRequest`, `EventSource`, `WebSocket`, `sendBeacon` outside the transport | Clean |
| UI-10 | Unit: every request the transport makes | `POST`, JSON content type, same-origin credentials, fixed endpoint |
| UI-11 | Bundle scan | No MSW, no test utilities, no example data, no source maps with sources in the package |
| UI-12 | Load over HTTP on the VM | Notice shown; over HTTPS, absent |
| UI-14 | Background polling during an idle period on the VM | Session still expires at OMV's timeout |
| UI-14 | Failing login and failing mutation in mocks | Exactly one request each |

## Functional tests that matter most

- **Transport normalisation:** `[]` for an empty object; large integers preserved; coercion only where marked; open response objects pass unknown fields.
- **Session:** 401 on any call returns the user to login exactly once, cancels in-flight queries and clears cached server data; after signing in again as a different user no data of the previous user is shown.
- **Tasks:** output accumulates in order; back-off; a failed task surfaces its message; stop works; moving to another page keeps following the task (it stays reachable from the top bar); polling stops when the task ends or the session ends.
- **Pending changes:** the banner appears after a dirtying mutation, clears after apply, and a "configuration is dirty" read error is shown as guidance, not as a failure.
- **Tables:** paging, sorting and search map to backend parameters; empty and error states.
- **Roles:** a user-role session never requests an administrator-only operation (asserted from the contract's `x-omv-role` against the requests seen in a user journey).
- **Forms:** validation generated from the contract matches the backend's (the rejected examples of each OMV format are rejected in the form).

## Accessibility

WCAG 2.2 AA, per the style guide: automated checks (axe) on every page in both themes; keyboard-only journeys for login, a settings form, a table and a destructive confirmation; visible focus; reduced-motion honoured; no information by colour alone (greyscale screenshots of the status components still tell states apart).

## Release gate

A release is cut only when:

1. Static, unit, component and contract checks are green.
2. Integration and browser suites are green against a freshly installed OMV 8 virtual machine at the lowest and highest supported OMV versions.
3. `tools/contract-drift` is clean against both versions.
4. `pnpm audit` is clean or each finding is triaged in writing.
5. `node tools/colour-audit.mjs` exits 0.
6. Install, upgrade, remove and purge tests pass; the stock interface is unaffected (`tools/package-test`, on the VM at each supported OMV version).
7. Review items signed by the owner:
   - Routes reviewed for UI-3 and UI-4.
   - Destructive flows reviewed for UI-8.
   - Runtime dependency list reviewed (UI-11).
   - `web/packages/spec-api-omv/EXCLUDED.md` reviewed.
   - The "what this does not change about security" statement in the user documentation is present and current.
8. No journal entry is marked blocking.

## What this does not prove

That OMV's backend or web layer is safe. The tests show the interface behaves as specified and adds no weakness of its own; the properties listed under "Inherited and not fixable here" in [05](05-security.md#inherited-and-not-fixable-here) are untouched by anything here.
