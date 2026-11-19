# 07 — The API contract

The contract is one OpenAPI 3.0.3 document. It is three things at once:

1. **The allow-list.** The gateway routes only what it lists (SR-CON-1).
2. **The policy.** Role, sensitivity, limits and session effects are declared per operation and enforced by the gateway.
3. **The source of the typed client.** The web interface's DTOs and hooks are generated from it.

OpenAPI 3.0.3 is chosen to match the reference application's tooling (Redocly, orval). Nullable values use `nullable: true`.

## Shape of the API

```
GET  /api/v1/health                              the only GET
POST /api/v1/session/{login|verify|probe|logout|elevate|elevate/verify|changePassword}
POST /api/v1/rpc/{Service}/{method}              one per exposed backend method
POST /api/v1/tasks/{follow|stop|list}            background tasks
POST /api/v1/views/{name}                        later: page-level reads combining several calls
```

- `{Service}` and `{method}` are literal path segments, spelled as OMV spells them (`ShareMgmt`, `enumerateSharedFolders`). They are not parameters; each operation has its own path entry.
- The request body **is** the method's `params` object. There is no envelope on the way in.
- The success body **is** the method's response value, after normalisation. There is no `{response, error}` envelope on the way out; errors use the HTTP status and the error shape below.
- `operationId` is `<service><Method>` in lower camel case: `shareMgmtEnumerateSharedFolders`. The generated hook is then `useShareMgmtEnumerateSharedFolders`.
- Tags group operations by OMV service for generation (`tags-split`).

Every operation is a `POST` (SR-REQ-1). Reads are marked `x-omv-readonly: true`; the generator is configured to emit a query hook for those and a mutation hook for the rest.

## Extensions

All are checked by custom lint rules under `contract/plugins/` and read by the gateway at load.

| Extension | On | Values | Meaning |
|-----------|----|--------|---------|
| `x-omv-rpc` | operation | `{service, method}` | The backend call. Required for every `/rpc/` operation; must agree with the path |
| `x-omv-role` | operation | `public` \| `user` \| `admin` | Required. No default in the file; the lint demands it be written |
| `x-omv-sensitivity` | operation | `normal` \| `elevated` | Step-up required when `elevated` (SR-AUTHZ-4). Lint enforces the categories in [05](05-authentication-and-sessions.md#step-up) by service and method name patterns, with an explicit per-operation override that must carry a `reason` |
| `x-omv-readonly` | operation | boolean | Does not change state; query hook; not audit-logged at info level |
| `x-omv-timeout` | operation | seconds, 1–170 | Backend read deadline; default 30 |
| `x-omv-max-request` / `x-omv-max-response` | operation | bytes | Overrides of the size caps, within the ceilings in SR-ENG-3..4 |
| `x-omv-session-effect` | operation | `none` \| `revoke-user` \| `revoke-all`, plus `userFrom: <JSON pointer into the request>` | Session revocation on success (SR-SESS-8) |
| `x-omv-task` | operation | `{result: <schema ref>?}` | The method starts a background task; the public response is a task handle |
| `x-omv-download` | operation | `{mode: content \| file, contentType, root?, owner?, maxSize, ephemeral?}` | Declared download (SR-FILE-1..4) |
| `x-omv-upload` | operation | `{contentTypes, maxSize, param}` | Declared upload (SR-FILE-6..8) |
| `x-omv-dirty` | operation | list of module names, or `true` | The operation leaves configuration changes pending; the gateway adds the `X-OMV-Pending-Changes: 1` response header |
| `x-omv-secret` | schema property | boolean | Never returned (SR-OUT-4), always redacted in logs (SR-AUD-3). `writeOnly: true` and `format: password` imply it |
| `x-omv-multiline` | schema (string) | boolean | Permits `\n` and `\t` (SR-IN-6) |
| `x-omv-int64` | schema (string) | boolean | A 64-bit integer carried as a decimal string |
| `x-omv-coerce` | schema | boolean | The normaliser may convert `"1"`/`1`/`0` to the declared type for this field |
| `x-omv-format` | schema (string) | an OMV format name | Validated by the gateway's implementation of that format (below) |
| `x-omv-source` | operation | `{datamodel: "rpc.ssh.set", omvVersion: "8.6.1"}` | Provenance of a bootstrapped request schema, for drift checks |

## Request schemas

Bootstrapped from OMV's `rpc.*` datamodels by `tools/contract-bootstrap` at development time, then reviewed and committed (D1). The tool translates OMV's dialect:

| OMV dialect | OpenAPI 3.0.3 |
|-------------|---------------|
| `"required": true` on a property | name added to the parent's `required` list |
| `"type": ["string", "null"]` | `type: string`, `nullable: true` |
| `"type": ["string", "integer", "null"]` | `oneOf` of the scalar types, `nullable: true`; flagged for manual review |
| `"type": "any"` | **not translated**; the tool stops and the author writes a real schema or excludes the operation |
| `"format": "uuidv4"` etc. | `x-omv-format: uuidv4` plus an equivalent anchored `pattern` |
| no bounds | the tool inserts conservative `maxLength` / `maxItems` / integer bounds and marks them `x-omv-review: bounds` until a human confirms |
| object | `additionalProperties: false` |

Rules for authors:

- Tighter than OMV is fine and encouraged. Looser is forbidden: if OMV's schema rejects a value, the contract must reject it too. `tools/contract-drift` compares each operation with its `x-omv-source` datamodel on the installed OMV version and fails on a contract that is looser or on a datamodel that changed.
- A method that validates no parameters in OMV gets an explicit schema here: usually `{}` with `additionalProperties: false`.
- The roughly 150 OMV methods without a parameter datamodel are each read in source before being added.

### Formats

The gateway implements OMV's string formats itself, as anchored patterns that reject control characters and a trailing newline (SR-IN-6). OMV's own implementations use patterns without the "dollar matches only at the very end" modifier, so a value with a trailing newline can pass there; the gateway stops it first.

Formats implemented in version 1: `uuidv4`, `devicefile`, `fsuuid`, `username`, `sharename`, `hostname`, `domainname`, `netbiosname`, `dirpath`, `email`, `time`, `ipv4`, `ipv6`, `sshpubkey-openssh`, `sshpubkey-rfc4716`, `sshprivkey-pem`, `pgppubkey`. `email` is deliberately a strict subset (no quoted local parts, no whitespace or control characters), which closes the class behind review ID `M7` on the gateway path.

Each format has a table-driven test with accepted and rejected values, and the rejected set always includes: trailing `\n`, embedded `\r`, NUL, a leading option dash where the value ends up as a command argument, path traversal segments for path-like formats.

## Response schemas

OMV has none. They are written from evidence:

1. `tools/contract-capture` runs against a **test** OMV system with the development build of the gateway, calls each read operation in a set of seeded scenarios (empty system, one disk, RAID, several shares, a failed service, and so on), and stores the normalised responses under `contract/src/examples/`.
2. The author writes the schema, starting from the related `conf.*` datamodel where the method returns a configuration object, and adding the fields the method computes.
3. The lint requires every 2xx response to have at least one captured example and every example to validate against its schema. Examples are what the interface's mock layer serves, so a drifted example is a broken mock.
4. In development builds the gateway validates every live response against the schema and reports violations. Release builds do not validate responses (cost, and a backend quirk must not take the interface down); they normalise only.

Conventions:

- Lists that OMV pages return `{total: integer, data: T[]}`. One generic envelope schema per item type.
- Response objects are open to additional properties (response mutators and plugin additions exist; see [06](06-engined-protocol.md#response-mutators)).
- Text that OMV has already translated or formatted for display (`description` on some list items, the text block from `*.getStats`) is typed as plain string and documented as display text. The interface prefers raw fields and its own formatting; where only display text exists, it is rendered as text.
- Captured examples are scrubbed before commit: no real host names, addresses, serial numbers, user names or keys. The capture tool replaces them with documentation values and fails if a scrub rule matches nothing it expected.

## Errors

One shape for every non-2xx response:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The request is not valid.",
    "correlationId": "01JD…",
    "details": [ { "path": "/port", "rule": "maximum" } ]
  }
}
```

| Status | `code` values | When |
|--------|---------------|------|
| 400 | `validation_failed`, `malformed_json` | Stage 10 |
| 401 | `unauthenticated`, `invalid_credentials`, `no_pending_login`, `challenge_failed`, `session_expired` | Stages 6, login |
| 403 | `forbidden`, `origin_rejected`, `step_up_required`, `password_change_required` | Stages 5, 7, 8 |
| 404 / 405 / 415 / 421 | `not_found`, `method_not_allowed`, `unsupported_media_type`, `misdirected` | Stages 3–5 |
| 408 / 413 / 431 | `timeout`, `too_large` | Stage 2 |
| 409 | `conflict`, `config_dirty` | Backend reported a conflict; a read refused because changes are pending |
| 422 | `backend_rejected` | The backend rejected valid-looking input (its own 400-class answer) |
| 429 | `rate_limited` | With `Retry-After` |
| 500 | `backend_error` | Backend 5xx; message generic |
| 502 | `bad_backend_reply` | Malformed, oversized or non-UTF-8 reply |
| 503 | `busy`, `backend_unavailable` | No slot; socket not connectable |
| 504 | `backend_timeout` | Outcome unknown for mutations |

Mapping of the backend's `http_status_code`: 400 → 422, 401 → 500 (the gateway authenticates; a 401 from the backend is a context bug and is logged as an incident), 403 → 403, 404 → 404, 409 → 409, 429 → 429, everything else → 500. The backend's numeric `code` is logged, not exposed, until specific codes are catalogued and given stable names here.

`details` never contains values, only locations and rule names (SR-IN-2). `message` follows SR-OUT-2.

## Background tasks

An operation with `x-omv-task` returns:

```json
{ "taskId": "t_5q2…", "operationId": "aptUpgrade", "startedAt": "2026-11-19T10:00:00Z" }
```

`POST /api/v1/tasks/follow {taskId, fromSeq?}` answers with `Content-Type: text/event-stream` and these events:

| Event | Data |
|-------|------|
| `output` | `{seq, text}` — a chunk of the task's output, as text |
| `done` | `{seq, result?}` — finished successfully; `result` validates against the operation's declared result schema when there is one |
| `failed` | `{seq, error: {code, message}}` |
| `ping` | `{}` every 15 s |

The stream is read with `fetch`. `fromSeq` resumes after a dropped connection; the gateway buffers the last 256 KiB of output per task. `tasks/stop {taskId}` and `tasks/list {}` complete the set. All three enforce ownership (SR-TASK-2). A task record is kept for 10 minutes after it ends.

## Downloads and uploads

**Downloads.** `mode: content`: the backend returns the content in its reply; the gateway sends it as an attachment with the declared type, subject to the response cap. `mode: file`: the backend returns a path; SR-FILE-1..5 apply. The two known file-mode methods:

| Method | Root | Notes |
|--------|------|-------|
| `LogFile.getContent` | system temporary directory, name prefix `logfile` | `ephemeral: true`; owner as the backend sets it. Needs the gateway user to be able to read a file the backend creates for the legacy web user: see `A8`. If that cannot be had without widening the gateway's groups, the operation is implemented instead as a paged content read through `LogFile.getList` and the file mode is not used |
| `Rrd.getGraph` | OMV's RRD graph directory | Likely never exposed: the new interface draws charts from data |

No file-mode download is added to the contract until `A8` is resolved in a way that keeps SR-ISO-1..3 intact.

**Uploads.** Two backend methods take an uploaded file (package upload in `Apt` and `PluginMgmt`). Both install software as root. They are `admin`, `elevated`, last in the plan, and may be left out of version 1 entirely.

## Pending changes

Many OMV settings operations store configuration and mark a module "dirty"; nothing happens on the system until `Config.applyChanges` runs. The contract makes this visible:

- Operations that cause it carry `x-omv-dirty`.
- `Config.isDirty`-style reads and `Config.applyChanges` (a background task) and `Config.revertChanges` are among the first operations in the contract.
- The interface shows the pending state persistently; the style guide treats it as its own colour role.

## The pipeline

```
contract/src/**            (authored)            ── redocly lint (+ x-omv rules) ──┐
        │ redocly bundle                                                           │ CI gates
        ▼                                                                          │
contract/generated/openapi.json  (committed) ── tools/contract-drift vs OMV ───────┘
        │
        ├── go:embed ──▶ gateway (route table, validators, policy)
        │
        └── orval (one run, in web/packages/react-api-omv)
                 ├──▶ web/packages/ts-api-omv/src/generated/models   (DTOs, no dependencies)
                 └──▶ web/packages/react-api-omv/src/generated       (TanStack Query hooks)
                          └── mutator: src/mutator/gatewayClient.ts  (hand-written)
```

The hand-written mutator is small and security-relevant:

- Sends `POST` with `Content-Type: application/json`, `credentials: "same-origin"`, and the request token from `sessionStorage`.
- Base URL is the constant `/api/v1`. It is not configurable at run time and never derived from a URL or a response (SR-UI-3).
- On 401: clears the token and routes to login. On 403 `step_up_required`: opens the step-up dialog, then retries the one original request once. On 429/503: surfaces `Retry-After`; no automatic retry for mutations.
- Never logs request or response bodies.

Mocks for development and tests are served by MSW from the contract's examples, as in the reference application. The mock layer is not part of the production bundle; a build check asserts it.

## Versioning

- The path carries the major version (`/api/v1`). A breaking change to an operation is a new operation or a new major version.
- `info.version` follows the plugin version. The gateway reports it at `/api/v1/health` as the only datum there.
- The interface and the gateway ship in one package, so they cannot be out of step in normal operation; the interface still sends its contract version in `X-OMV-Contract` and the gateway answers 409 on a mismatch, which catches a stale cached bundle after an upgrade.

## Fragments from other plugins

A third-party plugin exposes operations by installing `contract.d/<package>.json`: a self-contained OpenAPI fragment (paths plus the schemas they reference), subject to SR-CON-5..7. The gateway serves them under the same `/api/v1/rpc/…` paths. Because the interface's typed client is generated at build time, fragment operations are reachable from the interface only through a generic, typed-as-unknown hook that takes an `operationId` present in the loaded contract (the gateway publishes the list of loaded fragment operation IDs to authenticated administrators). Whether and how the interface renders pages for them is deferred to Phase 6.

## First operations

The order in which the contract grows is in [09](09-implementation-plan.md#phase-3--contract-pipeline-and-first-operations). The first slice is chosen to exercise each pattern once: a configuration object (`SSH.get`/`set`), a paged list with computed fields (`ShareMgmt.getList`), pending changes (`Config.*`), a background task (`Config.applyChanges`), and a user-role operation (`UserMgmt.getUserByContext`).
