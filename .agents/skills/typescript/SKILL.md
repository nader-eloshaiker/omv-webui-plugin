---
name: typescript
description: Guidelines, best practices and patterns for TypeScript design and code review across the web workspace. Triggers on TypeScript, .ts files, type design, generics, tsconfig, the transport module, the task helper, contract tooling scripts, and web/packages/ts-*.
---

# TypeScript development and review standards

The project's standard for TypeScript anywhere in `web/` and in the Node scripts under `tools/`.
The workspace runs strict TypeScript, ESM only, with packages consumed from source through their
`exports` maps.

---

## 1. Type philosophy

- **Types describe the domain**: a share, a device file, a task handle, a byte count carried as a
  decimal string.
- **Never duplicate generated types.** Anything server-shaped comes from `@omv-webui/ts-api-omv`
  (React code may take it through the `@omv-webui/react-api-omv/generated` barrel). A missing type is
  fixed in the contract and regenerated, never forked.
- **Make illegal states unrepresentable.** Discriminated unions over optional-field soups:
  `{ state: 'running' } | { state: 'done'; output: string } | { state: 'failed'; error: RpcError }`.
- Annotate exported signatures; let inference carry locals.

## 2. Strictness and escape hatches

- `strict: true` everywhere, inherited from `@omv-webui/ts-app-tooling`'s `tsconfig.base.json`.
  Never loosen a package's tsconfig to make an error go away.
- **No `any`.** Use `unknown` at untyped boundaries and narrow. A cast needs a comment stating the
  invariant that makes it safe; `as unknown as T` fails review.
- `@ts-expect-error` with a reason over `@ts-ignore`, and only for a known tooling limitation.
- Every `switch` over a union ends in a `never` check, so a new variant breaks the build.

## 3. Modern techniques, with restraint

- `satisfies` for tables that must conform but keep their narrow type (the operation table, token
  maps).
- `as const` for literal tables.
- Template literal types for constrained strings (the `/rpc/{Service}/{method}` paths).
- Branded types where confusion is plausible: a task handle is not a file path the UI may show
  (UI-5), an `Int64String` is not an arbitrary string.
- A generic earns its place by being inferred at call sites. Conditional and mapped types belong in
  library code with tests.

## 4. Runtime validation at boundaries

- The type system stops at the process edge. A backend reply, `localStorage`, a route parameter, an
  environment variable read by a tool: all `unknown` until validated.
- The backend boundary is the transport module. It normalises and (in development and test builds)
  validates replies against the contract's schema; downstream code trusts the DTO.
- Route parameters are validated with the route's schema before use (UI-4).
- Form validation comes from the contract's request schemas (valibot), so what a form allows and
  what the backend accepts stay the same. Never hand-write a looser form schema.
- Parsers return typed results or throw typed errors, never half-populated objects.

## 5. Errors

- Expected, recoverable outcomes are values or a domain union.
- Throw only for bugs and exceptional states. Thrown errors are `Error` subclasses with a `name`
  that survives minification. The transport throws exactly one error type, `RpcError`
  ([docs/03](../../../docs/03-rpc-transport.md#replies)).
- Never swallow: an empty `catch`, or one that only logs and continues, justifies itself in a
  comment.
- Never log or store a backend stack trace, a password, a one-time code, `sessionid` or a task
  handle (UI-5, UI-6, UI-9). In production builds the console gets nothing from errors.

## 6. Modules and packages

- Packages are named `{tech}-{category}-{domain}` under the `@omv-webui/` scope and consumed from
  source through `exports`. New public surface means a new `exports` entry; nothing deep-imports
  past it.
- Relative imports inside a package; `@omv-webui/*` across packages; `@app/*` for the app's own
  `src/`.
- Dependency direction: `ts-*` never imports React; `spec-api-omv`, `ts-api-omv` and `react-api-omv`
  never import the app or the component library (D12).
- No import-time side effects. Initialisation is an explicit call.
- Only the transport module imports `fetch` (UI-10). A lint rule enforces it.
- Every runtime dependency is pinned through the pnpm catalog and justified in its pull request,
  with its licence checked for GPL-3.0-or-later compatibility (UI-11).

## 7. Functions and data

- Pure functions by default; I/O at the edges.
- Accept the narrowest type (`readonly T[]`, a picked subset); return the most precise one.
- No boolean positional parameters; an options object once there are two optional knobs.
- Sizes: binary units (GiB, TiB); 64-bit values arrive as decimal strings (`x-omv-int64`) and are
  formatted with `BigInt`, never through `Number`.

## 8. Testing

- Vitest, colocated `*.test.ts`. Test the public surface.
- Table-driven cases (`it.each` over `{ name, input, expected }`) for the normaliser, formatters, the
  OMV format patterns (accepted and rejected examples for each) and the task helper's back-off.
- Every guard and schema gets negative cases.
- The transport has unit tests for every request property UI-10 fixes, for a `url` not in the
  operation table (throws, no request), and for a download through an operation not marked
  `x-omv-download` (throws, no request).

## 9. Playbook

1. Is there a generated DTO or an existing export? Only then define a new type, in the owning
   package.
2. Design the boundary: what enters as `unknown`, and where is it validated?
3. Model states as unions; annotate exports.
4. Expected failures as values; typed throws for bugs.
5. Test the surface, with negative cases.
6. Verify: [verification.md](../../rules/verification.md).

## 10. Reviewer checklist

1. [ ] No duplicate server types; new concepts in the owning package?
2. [ ] No `any`, unjustified casts or `@ts-ignore`; exhaustive switches?
3. [ ] Boundaries validated once; core logic free of defensive noise?
4. [ ] Errors: expected failures as values; one `RpcError`; nothing sensitive logged?
5. [ ] Exports respected, no deep imports, no `ts-*` to React, no import-time side effects?
6. [ ] No `fetch` outside the transport; new dependencies catalog-pinned and justified?
7. [ ] Table-driven tests, malformed input rejected?
