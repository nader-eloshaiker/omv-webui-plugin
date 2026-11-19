---
name: openapi-spec-reviewer
description: Reviews and designs operations in the hand-written OpenAPI contract that describes openmediavault's rpc.php methods - the RPC-shaped path convention, the x-omv-* extensions, request schemas no looser than OMV's datamodels, open response schemas from scrubbed captures, examples, and EXCLUDED.md. Use when adding, changing or reviewing anything under web/packages/spec-api-omv/src.
---

# OpenAPI contract reviewer

The contract is `web/packages/spec-api-omv/src/index.yaml` with operations under
`src/operations/<Service>/`, shared schemas under `src/schemas/`, examples under `src/examples/` and
lint plugins beside them. It is **not a REST API design**: it describes an existing RPC backend that
this project does not own, so the reviewer's job is fidelity to OMV, not REST style. The binding
design is [docs/04-api-contract.md](../../../docs/04-api-contract.md); the backend's behaviour is
[docs/03-rpc-transport.md](../../../docs/03-rpc-transport.md).

Verify a change with `pnpm api:spec:lint` and `pnpm api:spec:build`, then `pnpm api:react:build`.
Read the contract before asserting a convention.

## 1. Shape

- One path per backend method: `POST /rpc/{Service}/{method}`, literal segments spelled exactly as
  OMV spells them (`ShareMgmt`, `enumerateSharedFolders`). Every operation is a `POST`.
- `operationId` is `<service><Method>` in lower camel case. Tags are OMV services.
- The request body is the method's `params`; the 200 response is the method's `response`. The
  `{response, error}` envelope never appears in the contract.
- Errors are not modelled per operation; the transport turns every failure into `RpcError`.
- OpenAPI 3.0.3: nullable values use `nullable: true`.

## 2. Extensions (each checked by a lint rule)

- `x-omv-rpc {service, method}`: required; must agree with the path.
- `x-omv-role`: required; `user` or `admin`, and `public` only for `Session.login` and `verify`. It
  states what the backend demands, read from the method's source, not what the interface would like.
- `x-omv-readonly`: the method changes no state. Wrongly set, it turns a write into a query hook
  that can run on page load (UI-4), so it needs evidence from the source.
- `x-omv-dirty`: leaves configuration pending.
- `x-omv-task {result?}`: returns a task handle.
- `x-omv-download {contentType}`: only for the fixed list of downloads (initially the log file).
  Adding one widens UI-4's list and needs the owner's agreement.
- `x-omv-destructive`: `data`, `access` or `service`, driving the confirmation of UI-8. When unsure
  between levels, take the stronger.
- Schema properties: `x-omv-secret` (and `format: password`), `x-omv-int64`, `x-omv-coerce`,
  `x-omv-format`.
- `x-omv-source {datamodel, omvVersion}` on bootstrapped request schemas.

## 3. Request schemas: exactly what OMV accepts, or less

- Bootstrapped from the method's `rpc.*` datamodel by `tools/contract-bootstrap`, then reviewed
  against the method's source. A method that validates nothing gets an explicit schema written from
  its source, usually an empty object.
- **Never looser than OMV.** A missing `required`, a dropped `pattern`, a widened enum, or a
  `oneOf` that admits a type OMV rejects all fail review.
- OMV formats map to one shared schema each (`x-omv-format` plus an equivalent `pattern`), with
  accepted and rejected examples in tests.
- Form validation is generated from these schemas, so a wrong schema is a wrong form.

## 4. Response schemas: written from evidence

- From scrubbed captures on the **test VM** across the seeded scenarios, starting from the related
  `conf.*` datamodel where the method returns a configuration object.
- **Open**: no `additionalProperties: false`, because other plugins add fields to core methods.
- Every property the interface reads is listed and typed. A field is `required` only when every
  capture across scenarios has it.
- Large integers are strings with `x-omv-int64`; `0`/`1` or numeric strings are typed as what they
  mean, with `x-omv-coerce` only where the capture shows the quirk.
- Server-formatted display text is `string`, described as display text.

## 5. Examples

- Every 200 response has at least one example and every example validates.
- Examples are scrubbed: no real host names, addresses, MAC addresses, serial numbers, UUIDs, user
  names or keys. Look for anything that survived the scrubber.
- A committed example is source. It is edited by hand and never overwritten by a fresh capture.
- No example contains a stack trace, a password, a `sessionid` or a real task handle path.

## 6. What does not belong

- Methods listed in `EXCLUDED.md`, or any method the reviewer suspects belongs there, are not added
  without the owner's decision.
- A method that would only be useful through a generic "call anything" path. There is none.
- Any description, comment or example that documents how to misuse a backend method. Weaknesses are
  reported to the owner privately, never written into the contract.

## 7. Versioning

`info.version` follows the plugin version. A method whose shape differs between supported OMV
versions is described so both shapes validate, or support for the older version is dropped;
`tools/contract-drift` runs against each supported version.

## 8. Review checklist

1. [ ] Path, `operationId`, tag and `x-omv-rpc` agree with OMV's spelling?
2. [ ] `x-omv-role` matches the source; `readonly`, `dirty`, `task`, `destructive` justified?
3. [ ] Request schema no looser than OMV; `x-omv-source` set; formats shared?
4. [ ] Response schema open, from captures, required only where always present?
5. [ ] Secrets marked; 64-bit values as strings; coercion only where observed?
6. [ ] Examples present, valid, scrubbed?
7. [ ] Not in `EXCLUDED.md`; no misuse detail anywhere?
8. [ ] Lint, bundle and regeneration run, output committed?
