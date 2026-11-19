# 10 — Test and verification

How the security requirements are shown to hold. The rule throughout: **a control is real when a test fails without it.** For each `T` requirement the implementer first writes the test, runs it against code without the control, and records that it failed.

## Layers

| Layer | Runs against | Purpose |
|-------|--------------|---------|
| Unit | Pure functions (guard stages, parser, formats, normaliser, limiters, codec) | Exhaustive positive and negative cases; table-driven |
| Fuzz | Codec, strict JSON parser, normaliser, path validation, format matchers | Robustness against arbitrary bytes (SR-SUP-6) |
| Component | The gateway in-process with the scriptable fake backend | Every guard stage, session behaviour, login state machine, error mapping, limits |
| Integration | A disposable OMV 8 VM with the package installed | Real backend, real nginx, real systemd sandbox, real PAM |
| Package checks | The built `.deb` and the installed system | The `C` verifications: users, groups, modes, unit properties, nginx headers |
| Static | Source and built bundles | The `L` verifications: forbidden imports and sinks, contract lint |
| Browser | The interface against the VM and against mocks | Journeys, CSP violations, accessibility |
| Manual | Release checklist and penetration pass | The `R` verifications and what automation cannot see |

## Negative-test catalogue

These are the tests that matter most. Each row is a family; the implementer expands it into cases. The threat IDs are from [03](03-threat-model.md).

### Request authenticity (T-10..T-16)

| Case | Expected |
|------|----------|
| `GET`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS` on every operation path | 405; backend not called |
| `POST` with `Content-Type` missing, `text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`, `application/json; charset=utf-7`, `application/json` with trailing junk | 415 except the exact accepted forms; body not read |
| `Origin` missing; `null`; other scheme; other port; other host; host with trailing dot; upper-case host; origin with path | 403 |
| `Sec-Fetch-Site`: `cross-site`, `same-site`, `none` | 403 |
| Valid cookie, no token; valid token, no cookie; token of another session; token in query string; token in body; token in a cookie | 401 in every case, identical body to "no credential" |
| `Host`: unknown name; attacker name resolving to the NAS address; IP literal not equal to the arrival address; empty; two `Host` headers | 421 |
| Client-supplied `X-Real-IP`, `X-Server-Addr`, `X-Forwarded-*`, `Forwarded` through nginx | Overwritten or ignored; audit shows the true peer |
| Any response, any path, any error | No `Access-Control-*` header |
| Preflight (`OPTIONS` with `Access-Control-Request-Method`) | 405, no CORS headers |

### Sessions (T-06, T-13, T-17, T-18)

| Case | Expected |
|------|----------|
| Client sends a session cookie value it invented before login | Ignored; a fresh identifier is issued |
| Any header resembling the legacy session-identifier header | No effect |
| Identifier and token before and after login, and before and after step-up | All four differ |
| Cookie attributes on every `Set-Cookie` | Exactly as SR-SESS-4 |
| Idle expiry; absolute expiry; use at expiry boundary; event-stream keep-alive does not extend idle | 401 `session_expired` |
| Sixth session for a user; 101st session overall | Oldest revoked / refused as specified |
| Password change, second-factor change, deletion, administrator-group change for user X via the gateway | All of X's sessions revoked; others untouched |
| User deleted or demoted outside the gateway | Session revoked within the revalidation interval |
| Store contents after login | Only digests; no raw identifier or token in memory dumps of the store structure, logs or errors |
| Logout with cookie only | 401; session still valid for the real holder |

### Login (T-02..T-05, T-07..T-09)

| Case | Expected |
|------|----------|
| Unknown user, wrong password, inactive user, system account, malformed body | Byte-identical response; duration within the floor's band |
| 11th attempt from one address in 5 min | 429; fake backend records no call |
| Third failed attempt for one name within the window, from different addresses | 429; fake backend records exactly two failures for the name |
| All counters after their windows | Reset; login works. No path leaves a name unable to log in (property test over random event sequences) |
| Name differing from the canonical name by case, surrounding spaces, Unicode confusables | Refused as a wrong password; no pending login created |
| Backend returns a challenge with missing/invalid `kind`, extra fields, a `redirecturl` | Refused / fields never reach the client |
| `verify` without pre-auth cookie; after 300 s; with another pending login's cookie; two in parallel | 401 / 401 / 401 / one 429 |
| Failed verifications 1..n | Back-off exactly on the specified curve; discard at the maximum |
| Second successful `verify` with the same code within the replay window | Refused |
| Default administrator credentials | Session `restricted`; every operation but the permitted three answers 403 `password_change_required` |
| Scan of all log output of the whole suite for the test password, code, token and cookie values | No occurrence |

### Authorisation and the allow-list (T-01, T-20..T-24)

| Case | Expected |
|------|----------|
| For every operation in the contract (generated test): `user` session on an `admin` operation | 403; backend not called |
| For every `elevated` operation (generated): no step-up; expired step-up | 403 `step_up_required` |
| Paths not in the contract, including plausible backend names (`/rpc/Exec/attach`), case variants, encoded slashes, dot segments, trailing slash, double slash | 404 |
| Request body containing `service`, `method`, `context`, `username`, `role` properties | 400 (unknown property); backend not called |
| Enumeration test of every call site that builds a backend context | Only `FromSession` and the four internal operations |
| Contract without `x-omv-role`; with a fifth public operation; with path and `x-omv-rpc` disagreeing | Fails to load |
| Fragment: world-writable file; non-root owner; duplicate path; duplicate `(service, method)`; public operation; `user` operation with the setting off; invalid schema | Skipped as a whole; reported; core contract unaffected |
| Task follow/stop/list with another user's task identifier; with a guessed identifier; with a backend file name | 404; backend not called |

### Input and output (T-30..T-36, T-40, T-43)

| Case | Expected |
|------|----------|
| Invalid UTF-8; BOM; trailing bytes; depth 33; duplicate keys; `1e400`; integers beyond 2^63; NUL inside a string; lone surrogates | 400 `malformed_json` or `validation_failed` |
| For each format: the rejected set in [07](07-api-contract.md#formats) | 400 |
| Bytes sent to the fake backend vs. client bytes (different key order, whitespace, escapes, duplicate-free) | Backend receives the canonical re-serialisation |
| Backend reply with `trace`; with a 500; with a message containing a path | No trace in any response; 5xx message generic; correlation identifier present and found in the log |
| Backend reply sets `headers`, `filepath`, `unlink`, `redirecturl`, HTML in strings | No effect on response headers; no file opened; strings returned as JSON strings |
| Response containing a `writeOnly` / `x-omv-secret` property | Removed |
| Backend reply: truncated, no terminator, 65 MiB, not JSON, wrong top-level shape, invalid UTF-8 | 502 or 504; gateway memory bounded; no crash |
| `[]` where the schema says object and the reverse | Normalised as specified |

### Files (T-33, T-37)

Only once a file-mode download or an upload ships.

| Case | Expected |
|------|----------|
| Backend returns a path outside the declared root; with `..`; an absolute path elsewhere; a symlink inside the root pointing out; a symlink swapped in between check and open; a directory; a device; a FIFO; a file with the wrong owner; an oversized file | Refused; nothing read; nothing deleted |
| `ephemeral` deletion | Only the validated name in the validated directory is removed |
| Upload: wrong type; oversize; without step-up; as `user`; client file name with path separators, NUL, leading dash | Refused / sanitised; spool empty after the request in every outcome |

### Limits (T-50..T-54)

| Case | Expected |
|------|----------|
| 9th concurrent backend call; 4th for one session; a slot wait over 5 s | Queued then 503 with `Retry-After` |
| Slow headers; slow body; body one byte over the limit; header block over 16 KiB | Closed / 408 / 413 / 431 within the deadline |
| Flood of logins while authenticated traffic continues | Authenticated requests unaffected (reserved login slot) |
| Tables at capacity: pending logins, tasks, streams, limiter entries | Oldest evicted or refused as specified; memory flat |
| Fake backend stalls mid-reply | Client receives 504 at the deadline; connection closed; slot released |

### Isolation (T-42, T-60..T-64) — package checks on the VM

| Check | Expected |
|-------|----------|
| `id openmediavault-gateway` | Exactly the two groups |
| As the gateway user inside the unit's namespace: read `config.xml`, `/etc/shadow`, `/etc/ssl/private/*`, a file under `/srv` | All fail |
| Inside the unit: create an `AF_INET` socket; connect to loopback; resolve a name | All fail |
| Inside the unit: write anywhere outside the declared paths; execute a new program | Fail |
| `systemd-analyze security` | Score ≤ 2.0; output archived with the release |
| As an unprivileged local user: connect to the gateway's unix socket | Permission denied |
| `ss -lntp` and `ss -lxp` | The gateway owns no TCP listener and no abstract socket |
| The release binary's reported build mode | `release` |
| Two builds of the same commit | Identical checksums |

### Interface (T-11, T-15, T-16, T-35, T-36)

| Check | Expected |
|-------|----------|
| Response headers on `/`, `/index.html`, an asset, a 404 | CSP and companions exactly as SR-UI-1 |
| Static scan of the bundle and source | No forbidden sink (SR-UI-2); no `sessionStorage`/`localStorage` access outside the token module; no URL-derived operation or navigation target (SR-UI-3) |
| Browser journey with CSP reporting on | Zero violations |
| Network log of the journey | Requests only to the gateway origin |
| Stored strings containing markup, template syntax, `javascript:` URLs, bidirectional control characters, shown in every list and detail view (seeded through the fake backend) | Rendered as inert text |
| Framing the interface from another origin | Blocked |
| Opening the interface in a second tab | Login screen; no token obtained from the cookie |
| Deep link with crafted query and fragment | No API call derived from it |

### TLS

| Check | Expected |
|-------|----------|
| Plain HTTP to the gateway port | Connection fails or TLS alert; never a response with content |
| Protocol and cipher scan | TLS 1.2+ only; no weak suites |
| HSTS with OMV's force-HTTPS off / on | Absent / present |
| Plugin enabled without a certificate | Refused in settings; no listener |

## Property and model tests

- **Guard order.** A property test generates requests with a random subset of defects and asserts the response is that of the earliest failing stage, and that the fake backend was called if and only if no stage failed.
- **Limiter liveness.** Random sequences of failures, successes and time advances never produce a state in which a valid login is refused after all windows have elapsed (SR-AUTH-8).
- **Session state machine.** Model-based test of create, use, elevate, expire, revoke, revalidate against a simple reference model.
- **Normaliser idempotence.** Normalising a normalised reply changes nothing; a schema-valid reply is unchanged apart from the documented conversions.

## Review items (`R`)

Checked by a person at each release and signed in the release notes:

1. The internal operation set is unchanged or the change was approved (SR-CTX-3).
2. Every `user`-role operation has its SR-AUTHZ-6 note and the note is still true.
3. `contract/EXCLUDED.md` was reviewed against the OMV version supported (SR-CON-8).
4. No code path forwards client bytes to the backend (SR-IN-3) — confirmed by reading `internal/guard` and `internal/engined`.
5. Password and code buffers are not retained (SR-AUTH-1) — confirmed by reading `internal/auth`.
6. Direct dependency list reviewed; each addition since the last release justified (SR-SUP-1).
7. The interface's routes reviewed for SR-UI-3; destructive flows reviewed for SR-UI-8.
8. Residual-risk statement in the release notes is current.

## Release gate

A release is cut only when all of the following hold:

1. Unit, fuzz (fixed budget), component, static and package checks green on `amd64` and `arm64`.
2. Integration and browser suites green against a freshly installed OMV 8 VM at the lowest and the highest supported OMV versions.
3. `tools/contract-drift` clean against both versions.
4. `govulncheck`, `gosec`, `pnpm audit` clean, or each finding triaged in writing.
5. `tools/colour-audit.mjs` exits 0.
6. Review items signed.
7. For a release that changes `internal/guard`, `internal/session`, `internal/auth` or `internal/engined`: an independent review of the diff against [04](04-security-requirements.md).
8. No open question from the journal marked blocking.

## What testing here does not prove

- That engined's methods are safe. They are tested only as far as the contract's shapes go.
- That the legacy web layer is safe. It is out of scope; lockdown tests show only that the rules block what they say.
- Absence of unknown classes of flaw in the gateway. The independent review and the penetration pass exist because tests encode only the threats someone thought of.
