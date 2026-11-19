# 04 — The API contract

One OpenAPI 3.0.3 document, written in this repository, describing each backend method the interface uses. It generates the typed client. OpenAPI 3.0.3 matches the reference application's tooling (Redocly, orval); nullable values use `nullable: true`.

Nothing on the server reads the contract. It is a description that tooling keeps honest (see "Keeping it true").

## Shape

```
POST /rpc/{Service}/{method}        one path per backend method the interface uses
```

- `{Service}` and `{method}` are literal segments spelled as OMV spells them (`ShareMgmt`, `enumerateSharedFolders`); each operation is its own path entry. These paths are names for the generator. The transport module maps them to `rpc.php` requests ([03](03-rpc-transport.md)).
- The request body is the method's `params` object. The 200 response is the method's `response` value. The `{response, error}` envelope is the transport's business and does not appear in the contract.
- `operationId` is `<service><Method>` in lower camel case: `shareMgmtEnumerateSharedFolders` → hook `useShareMgmtEnumerateSharedFolders`.
- Tags group operations by OMV service (`tags-split` generation).
- Every operation is a `POST`. Reads carry `x-omv-readonly: true`, and the generator emits a query hook for those and a mutation hook for the rest.

## Extensions

Checked by lint rules under `web/packages/spec-api-omv/redocly-plugins/`.

| Extension | On | Values | Meaning |
|-----------|----|--------|---------|
| `x-omv-rpc` | operation | `{service, method}` | The backend call. Required; must agree with the path |
| `x-omv-role` | operation | `user` \| `admin` (and `public` for `Session.login` / `verify` only) | Required. What the backend demands; the interface uses it to hide what a user cannot do |
| `x-omv-readonly` | operation | boolean | Does not change state → query hook |
| `x-omv-dirty` | operation | boolean | Leaves configuration changes pending → invalidates the pending-changes query |
| `x-omv-task` | operation | `{result?: <schema ref>}` | Returns a task handle; follow with the task helper |
| `x-omv-download` | operation | `{contentType}` | Called through the download endpoint and saved as a file |
| `x-omv-destructive` | operation | `data` \| `access` \| `service` | Loses data, can lock the administrator out, or interrupts a service → the confirmation pattern of the style guide (UI-8) |
| `x-omv-secret` | schema property | boolean | Masked in forms, never echoed, never logged (UI-6). `format: password` implies it |
| `x-omv-int64` | schema (string) | boolean | A 64-bit integer carried as a decimal string |
| `x-omv-coerce` | schema | boolean | The transport may convert `0`/`1`/numeric strings to the declared type for this field |
| `x-omv-format` | schema (string) | an OMV format name | The OMV format this string must satisfy; drives form validation |
| `x-omv-source` | operation | `{datamodel, omvVersion}` | Where a bootstrapped request schema came from, for drift checks |

## Request schemas

Bootstrapped from OMV's `rpc.*` datamodels by `tools/contract-bootstrap`, then reviewed and committed. The tool translates OMV's dialect:

| OMV dialect | OpenAPI 3.0.3 |
|-------------|---------------|
| `"required": true` on a property | name added to the parent's `required` list |
| `"type": ["string", "null"]` | `type: string`, `nullable: true` |
| `"type": ["string", "integer", "null"]` | `oneOf` of the scalar types, `nullable: true`; flagged for review |
| `"type": "any"` | not translated; the author writes a real schema after reading the method |
| `"format": "uuidv4"` and other OMV formats | `x-omv-format` plus an equivalent `pattern` |
| `minimum`, `maximum`, `enum`, `pattern`, `maxLength`, `default` | carried over |

Rules for authors:

- The contract must accept exactly what OMV accepts, or less. Never looser.
- About 150 backend methods validate no parameters. Read each in source before adding it; give it an explicit schema (usually an empty object).
- Form validation in the interface is generated from these schemas (valibot), so what the form allows and what the backend accepts stay the same.

OMV formats needed early: `uuidv4`, `devicefile`, `fsuuid`, `username`, `sharename`, `hostname`, `domainname`, `netbiosname`, `dirpath`, `email`, `time`, `sshpubkey-openssh`. Each gets one shared schema with a pattern and a table of accepted and rejected examples in tests.

## Response schemas

OMV has none. They are written from evidence:

1. `tools/contract-capture` signs in to a **test** OMV virtual machine, calls each read operation in a set of seeded scenarios (fresh install; one disk; several disks and a RAID; several shares and users; a stopped service; pending changes), and writes the responses to `web/packages/spec-api-omv/src/examples/`. A capture drafts a new example. It is never re-run over committed examples to bring them "up to date": a difference between a new capture and a committed example is a finding to review, not a file to overwrite.
2. The capture is scrubbed: host names, addresses, MAC addresses, serial numbers, UUIDs, user names and keys are replaced with fixed documentation values. The tool fails if a scrub rule that should have matched did not.
3. The author writes the schema, starting from the related `conf.*` datamodel where the method returns a configuration object and adding the fields the method computes.
4. Lint requires every 200 response to have at least one example and every example to validate against its schema.

Conventions:

- Paged lists are `{total: integer, data: T[]}`: one generic envelope per item type.
- Response objects do not set `additionalProperties: false` (other plugins may add fields to core methods).
- Every property the interface reads is listed and typed; properties it does not need may be left undocumented.
- Fields the backend may omit are not in `required`. When a capture across scenarios always has a field, it is required.
- Server-formatted display text is typed `string` and described as display text.

Examples are also the mock data: MSW serves them in development and tests, as in the reference application. A drifted example is a broken mock, which is why lint validates them.

## Keeping it true

Because the server does not enforce the contract, four checks do:

| Check | Catches | Runs |
|-------|---------|------|
| Redocly lint with the `x-omv-*` rules | Missing role, path/`x-omv-rpc` disagreement, examples that do not validate, missing examples | CI |
| `tools/contract-drift` | A request schema that is looser than, or has diverged from, the OMV datamodel named in `x-omv-source`; a method that no longer exists | CI against a pinned OMV source tree; before declaring support for a new OMV version |
| Development-build response validation in the transport | A live response that does not match its schema | During development and in integration tests against the VM |
| Integration tests | Each operation called against a real OMV | Before release |

## The pipeline

```
spec-api-omv/src/**   (authored)   ── redocly lint ──▶ redocly bundle ──▶ spec-api-omv/generated/openapi.json (committed)
                                                                              │
                                              orval (one run, in web/packages/react-api-omv)
                                                 ├──▶ ts-api-omv/src/generated/models        DTOs
                                                 ├──▶ react-api-omv/src/generated            hooks
                                                 └──  mutator: react-api-omv/src/transport/rpcClient.ts
                                              + a small script writing the operation table the transport uses
                                              + a small script writing the examples index the mocks use
                                              + a small script writing valibot schemas for forms
```

All paths are under `web/packages/`.

Generated output is committed, so a change to the contract shows as a reviewable diff in the client.

orval configuration follows the reference application: `client: "react-query"`, `mode: "tags-split"`, a custom mutator, DTOs emitted into the separate types package, no generated mocks, query hooks forced for `x-omv-readonly` operations via the operations override (generated from the contract by a script, so it is not maintained by hand).

The mutator keeps the reference's config-object signature (`{url, method, data, signal}`), but the transport is written on `fetch`, not axios (D7). The reference's generated hooks import nothing from the HTTP library, only the mutator, so this changes no generated code. Check that this still holds after each orval upgrade.

orval generates zod, not valibot, schemas. The form schemas are written by a small script of our own from the bundled contract, carrying over `required`, `nullable`, `enum`, `minimum` / `maximum`, `maxLength`, `pattern` and the `x-omv-format` patterns. Their output is committed and never edited, like the rest of the generated code.

## First operations

Chosen to exercise each pattern once (Phase 1 and 2 of [07](07-implementation-plan.md)):

| Operation | Pattern |
|-----------|---------|
| `Session.login`, `verify`, `logout` | Authentication |
| `System.getInformation` | Simple read |
| `Config.isDirty`, `applyChangesBg`, `revertChangesBg` | Pending changes; tasks |
| `Exec.getOutput`, `isRunning`, `stop` | Task following (used by the helper, not by pages) |
| `SSH.get`, `SSH.set` | A configuration object; a mutation that dirties configuration |
| `ShareMgmt.getList` | A paged list with computed fields |
| `UserMgmt.getUserByContext` | A `user`-role operation |

## Excluded methods

`web/packages/spec-api-omv/EXCLUDED.md` lists backend methods that are deliberately not in the contract and why: for example methods the interface has no use for, internal methods, and methods implicated by the private security review whose use the interface should not encourage. Check it before adding an operation.

## Versioning

`info.version` follows the plugin version. The plugin declares which OMV versions it supports; `contract-drift` is run against each. A backend method that changes shape between supported OMV versions is described so that both shapes validate, or support for the older version is dropped.
