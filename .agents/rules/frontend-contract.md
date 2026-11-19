# Frontend - the contract, the generated client, the transport and the mocks

Read this before changing the OpenAPI contract, regenerating the client, touching the transport
module, or adding an example. The routes, queries, stores and tests are in
[frontend-architecture.md](frontend-architecture.md). The binding design is
[docs/03-rpc-transport.md](../../docs/03-rpc-transport.md) and
[docs/04-api-contract.md](../../docs/04-api-contract.md); where this file and those disagree, they
win.

## Which package does what

| Package                          | Holds                                                                                                                                                                           | Edited by hand                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `@omv-webui/spec-api-omv`        | The contract: `src/index.yaml`, `src/operations/<Service>/`, `src/schemas/`, `src/examples/`, the `x-omv-*` lint plugins, `EXCLUDED.md`; the bundle in `generated/openapi.json` | `src/` yes; `generated/` never |
| `@omv-webui/ts-api-omv`          | Generated DTOs (`src/generated/models`). No dependencies                                                                                                                        | Never                          |
| `@omv-webui/react-api-omv`       | Generated hooks (`src/generated`), the operation table, the examples index; the hand-written **transport module** and task helper                                               | Transport and helper only      |
| `@omv-webui/css-ui-style`        | The Tailwind entry stylesheet built from `design/tokens.css`                                                                                                                    | Yes                            |
| `@omv-webui/react-ui-components` | Shared components with Storybook                                                                                                                                                | Yes                            |
| `@omv-webui/ts-app-tooling`      | Shared ESLint, Prettier and tsconfig base                                                                                                                                       | Yes                            |
| `omv-web-app`                    | The interface                                                                                                                                                                   | Yes                            |

`spec-api-omv`, `ts-api-omv` and `react-api-omv` never depend on the app or the component library
(D12). React code imports hooks and DTOs from `@omv-webui/react-api-omv/generated`; framework-free
code imports DTOs from `@omv-webui/ts-api-omv`.

## The contract

- OpenAPI 3.0.3, multi-file, bundled by Redocly. One path per backend method:
  `POST /rpc/{Service}/{method}`, spelled as OMV spells them. `operationId` is `<service><Method>` in
  lower camel case. Tags are OMV services.
- The request body is the method's `params`; the 200 response is the method's `response`. The
  `{response, error}` envelope is the transport's business and never appears in the contract.
- Every operation carries `x-omv-rpc` and `x-omv-role`, and where they apply `x-omv-readonly`,
  `x-omv-dirty`, `x-omv-task`, `x-omv-download`, `x-omv-destructive`, `x-omv-source`. Schema
  properties use `x-omv-secret`, `x-omv-int64`, `x-omv-coerce`, `x-omv-format`. Meanings and lint
  rules: [docs/04](../../docs/04-api-contract.md#extensions).
- **Request schemas accept exactly what OMV accepts, or less. Never looser.** They are bootstrapped
  from OMV's `rpc.*` datamodels by `tools/contract-bootstrap`, then reviewed against the method's
  source (the `omv-source-reader` subagent does the lookup).
- **Response schemas are open** (no `additionalProperties: false`): other plugins add fields to core
  methods.
- Check `EXCLUDED.md` before adding an operation. An excluded method is not added without the
  owner's decision.
- Commands: `pnpm api:spec:lint` (Redocly with the `x-omv-*` rules; every example validates), then
  `pnpm api:spec:build` (writes `generated/openapi.json`, committed).

## Examples are evidence, and they are the mocks

- Response shapes come from **captured** replies: `tools/contract-capture` signs in to a disposable
  **test VM**, or read-only methods on the owner's server under ground rule 2 of
  `docs/07-implementation-plan.md`, with credentials read from the env files (`$OMV_WEBUI_ENV`,
  `$OMV_WEBUI_OWNER_ENV`), never typed or printed. Raw captures stay in `scratch/`.
- **Every capture is scrubbed before it is written**: host names, addresses, MAC addresses, serial
  numbers, UUIDs, user names and keys become fixed documentation values. The tool fails if a scrub
  rule that should have matched did not. Re-read a capture before committing it.
- **A capture drafts an example; it is never re-run over committed ones.** Once committed, an
  example is source, edited by hand like any other, and the schema decides what is correct. To
  record a new state, capture it under a new name.
- Every 200 response has at least one example, and every example validates against its schema.
- The same examples are the MSW mocks in development and tests, so a drifted example is a broken
  mock.

## The generated client

- **One orval run**, configured in `react-api-omv`: `client: "react-query"`, `mode: "tags-split"`, a
  custom mutator (the transport module), DTOs written into `ts-api-omv` and imported from that
  package's specifier, no generated mocks, query hooks forced for `x-omv-readonly` operations by an
  overrides list that a script writes from the contract.
- After orval, small scripts write the **operation table** (operation id, service, method, response
  schema reference, flags) and the **examples index** the mocks read.
- `pnpm api:check` fails when the files written from the contract are out of date; CI also
  regenerates everything and fails on any diff. `pnpm test:vm` runs the first operations against
  the test VM through the generated client (never part of `pnpm test`).
- `pnpm api:react:build` runs all of it. A contract change always needs `pnpm api:spec:build` then
  `pnpm api:react:build`, and the regenerated output is committed in the same change.
- **Never edit generated code** (`spec-api-omv/generated`, `ts-api-omv/src/generated`,
  `react-api-omv/src/generated`). Fix the contract and regenerate.
- **Never hand-write a request or response type** the contract should own.

## The transport module - the only code that knows `rpc.php`

`web/packages/react-api-omv/src/transport/rpcClient.ts`, with the signature orval's mutator expects
(`{url, method, data, signal}`), implemented on the browser's `fetch`. No axios.

- It resolves `url` against the operation table; a `url` not in the table throws before any request
  is made.
- Always `POST`, `Content-Type: application/json`, `credentials: "same-origin"`, to the constant
  `/rpc.php` (or `/download.php` for `x-omv-download` operations only) (UI-3, UI-4, UI-10).
- It decodes errors into one `RpcError` and discards `trace` immediately (UI-9); handles 401 once;
  normalises the known quirks using the operation's schema (`[]` for empty objects, `x-omv-int64`,
  `x-omv-coerce` only where marked); and, in development and test builds only, validates responses
  against their schemas and reports mismatches.
- It ignores `sessionid` and `redirecturl` from `Session.login` (UI-3, UI-6).
- Nothing else in the workspace imports `fetch`, `XMLHttpRequest`, `EventSource`, `WebSocket` or
  `navigator.sendBeacon`. A lint rule enforces it.
- Replacing the backend later means reimplementing this file against the same signature (D5).

## The mock

The handlers live in `@omv-webui/react-api-omv/mocks` (`createRpcHandlers`): one handler for
`POST /rpc.php` that answers each operation with its default example, or a named example, a written
reply or a function of the call. Every error reply carries a trace, so a test proves it never
surfaces (UI-9). Examples are the raw replies, before the transport normalises them.

`pnpm dev:mock` serves the app on MSW answering every operation in the operation table with a named
example from the contract. It holds no state: a write answers with its example and changes nothing a
later read returns. A journey that writes and reads back runs against the test VM. A mock-only
scenario switch may exist in the mock build; MSW, examples and any scenario switch are absent from
the production bundle (UI-11), and the production build has no URL parameter that changes what the
app calls (UI-4).
