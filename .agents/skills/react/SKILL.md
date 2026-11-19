---
name: react
description: Guidelines, best practices and patterns for React development and code review in the openmediavault web interface. Triggers on React, JSX/TSX, components, hooks, TanStack Router or Query, Zustand, and files under web/apps/omv-web-app or web/packages/react-*.
---

# React development and review standards

The project's standard for React. Use it when writing, refactoring or reviewing React code. It
assumes the workspace stack: React 19, Vite, TanStack Router and Query, Zustand for preferences,
Tailwind CSS v4, shadcn-style components on Base UI, MSW, Vitest and Testing Library.

Read the rule that matches the work:

| rule                                                                     | read it before                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [frontend-architecture.md](../../rules/frontend-architecture.md)         | a route, a query, a store, a task, a test                       |
| [frontend-contract.md](../../rules/frontend-contract.md)                 | the contract, the generated client, the transport, the mocks    |
| [docs/design/style-guide.md](../../../docs/design/style-guide.md)        | anything visual                                                 |
| [docs/05-security.md](../../../docs/05-security.md)                      | always; the `UI-*` rules are binding and win over this skill    |

---

## 1. Component architecture

Components in the app live under `src/components/` in tiers:

- **`atoms/`**: single-purpose pieces (a status pill that knows OMV's states). No data fetching, no
  routing.
- **`molecules/`**: small compositions with one job (a capacity figure with its meter).
- **`organisms/`**: self-contained blocks (the shares table, the task log panel). May own queries.
- **`templates/`**: page scaffolding; slots, no business logic.
- **`pages/`**: route targets; compose the tiers and wire route params to props.

Generic primitives (button, field, table, dialog, banner, toast, meter, pill anatomy) belong in
`@omv-webui/react-ui-components`, not in the app. Something that knows an OMV concept (a disk, a
share, a pending module) is an app atom composed from library primitives.

- Function components and hooks only. One component per file; the file, component and test share a
  base name.
- Props are explicit and minimal. Pass the fields a child needs, not whole query results or router
  objects.
- Prefer composition over boolean mode props. Three mode booleans on one component means split it.

## 2. State

Pick the narrowest tool that works:

1. **Local `useState` / `useReducer`**: transient UI state (open, draft input).
2. **Route path and search params**: which view, which object, table page and sort. A URL only ever
   **selects a view** (UI-4). It never names an operation or its arguments, never triggers a write,
   and never carries a secret, a handle or a returned address (UI-3, UI-5, UI-6).
3. **TanStack Query**: all server state. Never copy it into `useState` or a store; derive with
   `select` or a memoised computation.
4. **Zustand**: non-sensitive preferences only: theme, column choices, language (UI-13).

No global app store. Derive, don't sync: an effect that copies one state into another is a design
bug.

## 3. Data and the contract

- All server data flows through the generated hooks in `@omv-webui/react-api-omv/generated`. Never
  call `fetch`, never build a `{service, method}` pair, never import the transport module from a
  page (UI-10).
- Never declare a server-shaped type; import the generated DTO.
- A missing shape is a contract change (contract first, regenerate), not a workaround.
- App code never imports MSW, examples or mock helpers.
- Every query-driven view handles loading, error, empty and populated explicitly. "Could not read
  disks" and "no disks" are different states and look different.
- Mutations: no optimistic updates unless the rollback is implemented and tested. Never retry a
  mutation automatically (UI-14). After a mutation marked `x-omv-dirty`, the pending-changes banner
  must appear; that invalidation is central, not per page.
- Destructive operations (`x-omv-destructive`) go through the confirmation component of style guide
  5.4 (UI-8); `data`-destructive ones require typing the object's name.

## 4. Rendering backend data

- **Everything from the backend is rendered as text** (UI-2): names, comments, labels, log lines,
  task output, error messages. Never `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`,
  `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string timers, or any Markdown or
  template rendering of data. Lint enforces it; disabling the rule inline needs a recorded owner
  approval.
- Secret fields (`x-omv-secret`) are masked, never pre-filled from a response, and cleared from form
  state after submit (UI-6). An existing secret shows as "Set" with a "Change" control.
- Errors show `RpcError.message` as text and nothing else from the error (UI-9).

## 5. Routing

- File-based routes under base `/ui/`; route-level code splitting by default.
- Validate path and search params with the route's schema; components receive typed params and
  never parse `window.location`.
- Navigation is declarative (`Link`, `useNavigate`). External links are literals with
  `rel="noopener noreferrer"` and are visibly external.

## 6. Styling

- Semantic tokens only (`bg-surface`, `text-muted-foreground`, `text-ok-label`); never a primitive,
  a raw palette class (`bg-blue-500`) or a literal colour. Fills draw, `-label` tokens are read.
- **No inline style objects except for genuinely dynamic geometry** (a meter's width, chart
  coordinates). React applies those through the DOM's style API, which the Content Security Policy
  allows; a `<style>` element or a `style=` attribute in markup is not allowed (UI-1). A library that
  injects `<style>` elements at run time breaks UI-1: raise it before adding the library.
- Verify every visual change in both themes.

## 7. Performance

- Write plain code; add `useMemo`, `useCallback` or `memo` only for a measured hot path.
- Virtualise long lists past about 100 rows.
- Keep expensive derivations in pure functions outside components, so they are testable.
- Heavy dependencies (charts) load behind a route split or dynamic `import()`.

## 8. Accessibility

- Every interactive control is a real `button`, `a` or `input` with an accessible name. `div
  onClick` fails review.
- Keyboard first: focus order follows reading order; focus is visible (style guide 4.6); dialogs
  trap and restore focus; Escape closes overlays. Use the Base UI primitive rather than
  building behaviour by hand.
- Colour is never the only signal: every status has its word or a distinct icon shape.
- Respect `prefers-reduced-motion`; the base state is the finished state.
- Sign-in inputs carry the right `autocomplete` values; one-time codes use `one-time-code` and allow
  paste.

## 9. Testing

- Testing Library through the user's lens (`getByRole`, `getByLabelText`, `userEvent`).
- The network is mocked at MSW with the contract's examples; never mock the generated hooks.
- Conditional rendering gets tests for loading, error, empty and populated.
- Pure logic is extracted and unit-tested directly.

## 10. Playbook

1. **Place it**: the right tier; check `@omv-webui/react-ui-components` first.
2. **Type it**: generated DTOs for anything server-shaped; only view-local types by hand.
3. **Wire data**: generated hooks; decide URL, local or preference state deliberately.
4. **Style it**: semantic tokens, both themes, obvious affordance.
5. **Guard states**: loading, error, empty, populated.
6. **Test it**: Testing Library and MSW.
7. **Verify**: [verification.md](../../rules/verification.md).

## 11. Reviewer checklist

1. [ ] Right tier; existing primitives reused?
2. [ ] Generated DTOs imported; no parallel types?
3. [ ] Server state in Query only; preferences only in Zustand; no effect-driven syncing?
4. [ ] No network call outside the transport; no `{service, method}` in app code; no mock imports?
5. [ ] UI-2: backend text rendered as text; no forbidden sinks?
6. [ ] UI-3 / UI-4: no supplied targets; routes select views only; no write on load?
7. [ ] UI-5 / UI-6 / UI-13: no handle, secret or server data in a URL, storage or log?
8. [ ] UI-8: destructive actions confirm with the named object?
9. [ ] Semantic tokens only; both themes; no injected `<style>`?
10. [ ] Loading, error, empty and populated all handled?
11. [ ] Real elements, accessible names, keyboard path, non-colour signals?
12. [ ] Behaviour-level tests on MSW examples?
