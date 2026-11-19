# Frontend - app plumbing: routes, queries, stores and tests

Read this before adding a route, a query, a store or a test. The contract, the generated client, the
transport module and the mocks are in [frontend-contract.md](frontend-contract.md). The binding
design is [docs/02-architecture.md](../../docs/02-architecture.md) (layers, cross-cutting
behaviour) and [docs/05-security.md](../../docs/05-security.md) (`UI-*`); where this file and those
disagree, they win.

## How a page gets its data

```
route / page  ->  feature hook (only if a page must combine or adapt queries)
              ->  generated hook (@omv-webui/react-api-omv/generated)
              ->  transport module (react-api-omv/src/transport, the only code that knows rpc.php)
              ->  POST /rpc.php  (the test VM, or MSW serving the contract's examples)
```

Dependencies point down only. A page never imports the transport module, never calls `fetch`, and
never builds a `{service, method}` pair (UI-10, `AGENTS.md` rule 6). If a page needs a shape the
contract does not have, that is a contract change, not a client workaround.

## Routing - TanStack Router

- Routes live in `web/apps/omv-web-app/src/routes/`. The Vite plugin writes `routeTree.gen.ts`;
  **never edit it**.
- The app is served under the base path `/ui/`. Every route is relative to it; nothing hard-codes
  the origin.
- File naming: `$param.tsx` = path parameter, `index.tsx` = index route, `__root.tsx` = layout shell.
  Export `const Route = createFileRoute('...')({ component: ... })` with the path matching the file.
- **Routes are static and typed (UI-4).** A path parameter is only an identifier of the object being
  viewed (a share's UUID, a disk's device name) and is validated with a schema before use. No path,
  search parameter or fragment may name a service, a method or free-form parameters.
- **No state-changing call on page load (UI-4).** A mutation runs only from an explicit user action.
  A route loader may prefetch reads; it never writes.
- **No supplied targets (UI-3).** No `returnUrl`, no redirect to an address from the URL, a response
  or storage. After sign-in the app goes to a fixed route, or back to the in-app route held in memory
  when the session expired.
- Navigation is declarative (`Link`, `useNavigate`). Never assign `window.location` or call
  `window.open` with a computed address. External links are literals in code with
  `rel="noopener noreferrer"`.
- Read params by importing `Route` from the route file, not from `routeTree.gen.ts`.

## TanStack Query

- All server state lives in TanStack Query, through the generated hooks. Never `useEffect` + a
  network call, and never copy query data into `useState` or a store.
- Query keys come from the generated hooks. Invalidate through those keys or a shared predicate,
  never string literals scattered across pages.
- **Pending changes.** After any mutation whose operation carries `x-omv-dirty`, the pending-changes
  query (`Config.isDirty`) is invalidated. Do this in one place (a mutation-cache subscriber or the
  generated mutation wrapper driven by the operation table), not per page.
- **Background polling** (`refetchInterval`) is sent as a background call so it carries
  `options.updatelastaccess: false` and does not keep an idle session alive (UI-14).
- **Retries.** Queries may retry network failures, capped at 2. Mutations never retry automatically,
  and a failed login is never retried (UI-14). On a 5xx or network failure after a mutation, re-read
  state rather than assume the outcome.
- **Session expiry.** A 401 is handled once, in the transport: cancel queries, clear the cache, show
  sign-in. Pages do not handle 401 themselves.
- Every query-driven view designs four states: loading (skeleton of the right height), error (the
  backend's message as text, with retry), empty (style guide 5.9), populated. A "configuration is
  dirty" read error is shown as guidance, not as a failure.

## Tasks

Long work returns a task handle followed through the task helper in `react-api-omv`
([docs/03-rpc-transport.md](../../docs/03-rpc-transport.md#background-tasks)). Pages use the task
hook; they never call `Exec.*` directly. Handles stay in memory only: never in a URL, storage, a log
or the DOM as text (UI-5).

## Zustand - preferences only

- Zustand holds only non-sensitive preferences: theme, table column choices, language (UI-13). No
  server data, no identifiers, no user names, no handles.
- One file per concern in `web/apps/omv-web-app/src/stores/use<Name>Store.ts`. Use selectors
  (`useStore((s) => s.x)`), no async logic, `persist()` only for values UI-13 allows, each with a
  unique `name`.
- The session (user name, role, whether a session exists) is held in memory, never persisted
  (UI-6).

## Testing

- Tests sit next to the code they test. Pure functions (normaliser, formatters, the task helper's
  back-off) are unit-tested directly with table-driven cases.
- Components and pages: Testing Library (`getByRole`, `getByLabelText`, `userEvent`). Test behaviour,
  not implementation; a test id is a last resort.
- **The network is mocked at one boundary: MSW serving the contract's examples**, the same ones
  `pnpm dev:mock` serves. Never mock the generated hooks or the transport module in a page test.
- **A network guard fails any test whose request nothing answered.** A test states the answers it
  needs; it never reaches a real host.
- Seed hostile strings through the mocks (markup, script, `javascript:` addresses, bidirectional
  control characters) where a test covers rendering of backend text, and assert they render as inert
  text (UI-2, [docs/08](../../docs/08-test-and-verification.md#security-tests)).
- Environment: happy-dom by default; a file that needs jsdom pins it with a
  `// @vitest-environment jsdom` docblock naming the gap.
- A behaviour that needs a real backend (a write read back, a task finishing, the idle timeout) is
  proven in the integration or browser suite against the **test VM**, never a production NAS.
