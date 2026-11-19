# 04 — Security requirements

These requirements are normative. "Must" means the release gate in [10](10-test-and-verification.md) fails without it. Each requirement names how it is verified:

- **T** — an automated test that fails when the control is removed
- **L** — a lint or static rule enforced in CI
- **C** — a configuration or packaging check (scripted inspection of the built package or the running unit)
- **R** — a review item on the release checklist, for properties a test cannot show

An implementer may not weaken, skip or reinterpret a requirement. Raise conflicts with the owner.

Numbers given as defaults are configurable only where the text says so, and never below the stated floor.

---

## CTX — the backend context

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-CTX-1 | The `context` sent to engined is built only from the server-side session record. No request header, parameter, cookie value or body field can influence `username` or `role`. | T |
| SR-CTX-2 | `context.username` is the canonical user name established at login (SR-AUTH-9). `context.role` is the role established at login or at the last revalidation. | T |
| SR-CTX-3 | The administrator context without a user session is used only by the login state machine and the session revalidator, and only for the fixed operation set listed in [05](05-authentication-and-sessions.md#internal-operations). That set is a compile-time constant. | T, R |
| SR-CTX-4 | The `_SERVER` values forwarded in the context are limited to `REMOTE_ADDR` and `HTTP_USER_AGENT`, taken from the nginx-set headers, length-limited and stripped of control characters. | T |

## ISO — isolation of the gateway process

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-ISO-1 | The gateway runs as system user `openmediavault-gateway` with primary group of the same name and exactly one supplementary group, `openmediavault-engined`. | C |
| SR-ISO-2 | The gateway user is not a member of `openmediavault-config`, `openmediavault-webgui`, `www-data`, `sudo`, `shadow` or `adm`. | C |
| SR-ISO-3 | The gateway cannot read `/etc/openmediavault/config.xml`, `/etc/shadow`, private keys under `/etc/ssl/private`, or any home directory. | C |
| SR-ISO-4 | The gateway has no network: `PrivateNetwork=yes`, `RestrictAddressFamilies=AF_UNIX`, `IPAddressDeny=any`. The Go code does not import a dialler other than the unix dialler in `internal/engined`. | C, L |
| SR-ISO-5 | The systemd unit applies the sandbox in [08](08-plugin-packaging.md#systemd-unit) in full. `systemd-analyze security` reports an exposure score of 2.0 or lower. | C |
| SR-ISO-6 | The gateway and the new interface are served from an origin of their own (own port, own nginx server block). Nothing of the plugin's interface or API is served from the legacy origin. | C |
| SR-ISO-7 | The listening socket is created by systemd with mode `0660` and group `www-data`. The gateway trusts `X-Real-IP`, `X-Server-Addr` and `X-Forwarded-Proto` only; nginx is configured to overwrite all three. No other forwarding header is read. | C, T |
| SR-ISO-8 | The gateway executes no programs, loads no plugins or shared objects at run time, and writes no files. | L, C |

## TLS — transport

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-TLS-1 | The gateway origin is HTTPS only. There is no HTTP listener for it and no configuration that creates one. The plugin does not serve until a certificate is selected. | C, T |
| SR-TLS-2 | TLS 1.2 minimum, TLS 1.3 preferred; cipher configuration follows the Mozilla "intermediate" profile current at release. | C |
| SR-TLS-3 | `Strict-Transport-Security` is sent if and only if OMV's own interface is configured to force HTTPS. | T |

## REQ — request authenticity

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-REQ-1 | Every operation is `POST`, including reads, event streams and downloads. The only `GET` the API answers is the health check, which takes no input and returns no data about the system. `HEAD`, `OPTIONS` and every other method receive 405; there is no CORS preflight handling. | T |
| SR-REQ-2 | A `POST` must carry `Content-Type: application/json` (or the single type the operation declares, for uploads). Any other type, including a missing one, is rejected with 415 before the body is read. | T |
| SR-REQ-3 | Every `POST` must carry `Origin` equal to the gateway's own origin (scheme, host, port). A missing or different `Origin` is rejected with 403. | T |
| SR-REQ-4 | If `Sec-Fetch-Site` is present it must be `same-origin`. `none`, `same-site` and `cross-site` are rejected. | T |
| SR-REQ-5 | Every non-public request must carry the session's request token in the `X-OMV-Request-Token` header (see SR-SESS-3). There is no alternative carrier: not a query parameter, not a form field, not a cookie. The interface therefore uses `fetch` for event streams and downloads, never `EventSource` or navigation. | T |
| SR-REQ-6 | The gateway emits no `Access-Control-*` header under any circumstances. | T |
| SR-REQ-7 | `Host` must be one of the configured names, or an IP literal equal to `X-Server-Addr`. Anything else receives 421 and no other processing. | T |

## AUTH — login

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-AUTH-1 | The gateway never stores a password or second-factor code, in memory beyond the request that carries it, on disk, or in any log. Buffers holding them are zeroed after use where the language allows. | T (log scan), R |
| SR-AUTH-2 | Login is the state machine in [05](05-authentication-and-sessions.md#login-state-machine). No other path creates a session. | T |
| SR-AUTH-3 | The login response contains no data about the account beyond what [05](05-authentication-and-sessions.md#endpoints) specifies. The challenge data returned by the backend is held server-side; only `kind` is sent to the client. | T |
| SR-AUTH-4 | Failed logins are indistinguishable to the client: same status, same body, for unknown user, wrong password, inactive account and system account. Response time for a failure has a fixed floor (default 400 ms) with jitter. | T |
| SR-AUTH-5 | Per source address: at most 10 login attempts per 5 minutes; further attempts receive 429 with `Retry-After` and do not reach the backend. | T |
| SR-AUTH-6 | Globally: at most 30 login attempts per minute reach the backend; excess receives 429. | T |
| SR-AUTH-7 | Per user name: the number of *failed* first-factor attempts that reach the backend within the lockout window is capped at the configured PAM lockout threshold minus one (default cap 2 per 900 s, matching the shipped `deny=3`). Further attempts for that name receive 429 without reaching the backend. | T |
| SR-AUTH-8 | No throttle is permanent. Every counter expires on its own. There is no state in which a user name can no longer log in through the gateway until an administrator intervenes. | T |
| SR-AUTH-9 | After a successful first factor, the gateway resolves the user through the backend and refuses the login unless the returned name is byte-identical to the submitted name after trimming surrounding ASCII whitespace. The refusal is indistinguishable from a wrong password. | T |
| SR-AUTH-10 | Second factor: a pending login lives at most 300 s, is bound to a pre-authentication cookie, permits one verification in flight at a time, and backs off after the third failure (5 s doubling to 300 s; at the maximum the pending login is discarded). One successful verification consumes the pending login. A code that verified successfully is refused for the same user for the rest of its validity window. | T |
| SR-AUTH-11 | If the first factor succeeds with the factory default administrator credentials, the session is created in the `restricted: password_change_required` state. In that state only the password-change operation, the session probe and logout are permitted. | T |
| SR-AUTH-12 | Authentication events are audit-logged with outcome, user name as submitted (sanitised), source address and user agent (sanitised). | T |

## SESS — sessions

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-SESS-1 | Session identifiers and request tokens are 256 bits from the operating system's CSPRNG, encoded base64url. The store keeps only their SHA-256 digests. Comparison is constant-time. | T, R |
| SR-SESS-2 | Identifiers are generated by the gateway only, at successful login. No request input can supply, select or fix one. A fresh pair is issued at every login and at every step-up. | T |
| SR-SESS-3 | A session is presented as two values together: the cookie and the request token. Either alone is rejected exactly as no credential would be. | T |
| SR-SESS-4 | The cookie is `__Host-omvgw_sid`; attributes `Secure; HttpOnly; SameSite=Strict; Path=/`; no `Domain`; no `Expires`/`Max-Age` (session cookie). | T |
| SR-SESS-5 | The request token is returned exactly once, in the body of the response that creates or elevates the session. No operation returns it to a caller that presents only the cookie. The interface keeps it in `sessionStorage` and nowhere else. | T, L |
| SR-SESS-6 | Idle timeout default 15 min (configurable 1–60). Absolute lifetime default 12 h (configurable 1–24). Both are enforced server-side. | T |
| SR-SESS-7 | At most 5 concurrent sessions per user and 100 in total; the oldest of a user's sessions is revoked when the sixth is created. | T |
| SR-SESS-8 | Every session is revalidated against the backend at most 60 s after its last revalidation, on next use: the user must still exist, be active, and hold the same role. A change revokes the session. All sessions of a user are revoked when an operation with `x-omv-session-effect: revoke-user` succeeds for that user (password change, second-factor change, deletion, role change). | T |
| SR-SESS-9 | The pre-authentication cookie (`__Host-omvgw_pre`) has the same attributes as the session cookie, is unrelated to any session identifier, and is cleared when the pending login ends in any way. | T |
| SR-SESS-10 | Logout revokes the session server-side and clears both cookies. Logout requires the full credential (SR-SESS-3). | T |

## AUTHZ — authorisation

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-AUTHZ-1 | Every operation declares `x-omv-role`: `public`, `user` or `admin`. An operation without it does not load. | L, T |
| SR-AUTHZ-2 | The gateway enforces the declared role before the body is parsed. | T |
| SR-AUTHZ-3 | `public` is permitted only for the fixed set: health, session probe, login, verify. A contract or fragment declaring any other public operation fails to load. | L, T |
| SR-AUTHZ-4 | Operations declaring `x-omv-sensitivity: elevated` require a step-up no older than 5 min (configurable 1–15). The contract lint requires `elevated` on every operation in the categories listed in [05](05-authentication-and-sessions.md#step-up). | L, T |
| SR-AUTHZ-5 | There is no operation, parameter or header by which a caller names an engined service or method. | T, R |
| SR-AUTHZ-6 | A `user`-role operation may be added to the contract only with a written note, in the operation file, of why it is safe for a non-administrator, including that its response cannot be influenced into carrying another user's data. | R |

## CON — the contract as allow-list

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-CON-1 | The route table is built only from the embedded contract and loaded fragments. Unmatched requests receive 404. | T |
| SR-CON-2 | Each operation maps to exactly one `x-omv-rpc: {service, method}`; no wildcards, no templating from the path. The path segment and the extension must agree, checked at load. | L, T |
| SR-CON-3 | Every request schema sets `additionalProperties: false` at every object level, unless the operation file documents why not. | L |
| SR-CON-4 | Every string has `maxLength`; every array has `maxItems`; every integer has bounds. | L |
| SR-CON-5 | Fragments are loaded only from `/usr/share/openmediavault-gateway/contract.d/`, only if the file and every parent directory are owned by root and not group- or world-writable. | T |
| SR-CON-6 | A fragment cannot define an operation whose path, operation ID or `(service, method)` pair already exists, cannot declare a `public` operation, and cannot declare a `user` operation unless the administrator has enabled "allow plugin operations for non-administrators" (default off). | T |
| SR-CON-7 | A fragment that fails any check is skipped as a whole and reported in the journal and in the plugin's status. | T |
| SR-CON-8 | An operation whose backend method is known to trust client-supplied verification data, or to return data another user controls without filtering, is not added to the contract. The list of excluded methods and the reason for each is kept in `contract/EXCLUDED.md`. | R |

## IN — input handling

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-IN-1 | Bodies are parsed strictly: valid UTF-8, no byte-order mark, no trailing data, maximum nesting depth 32, duplicate object keys rejected, numbers kept exact. | T |
| SR-IN-2 | The parsed value is validated against the operation's request schema. Validation failure returns 400 with the failing location and never the offending value. | T |
| SR-IN-3 | The parameters sent to engined are a fresh serialisation of the validated value. The client's bytes are never forwarded. | T, R |
| SR-IN-4 | The serialisation is one JSON document with no embedded NUL byte, followed by the single terminating NUL. Strings containing U+0000 are rejected at validation. | T |
| SR-IN-5 | Path parameters are matched against the route table literally; there are no free-form path parameters in version 1. | T |
| SR-IN-6 | String formats are implemented in the gateway with anchored patterns that do not accept a trailing newline, and all strings reject C0 control characters unless the schema opts in with `x-omv-multiline: true` (which then permits `\n` and `\t` only). | T |

## OUT — output handling

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-OUT-1 | The backend's `trace` is never sent to a client. It is logged with the correlation identifier. | T |
| SR-OUT-2 | Error bodies follow the shape in [07](07-api-contract.md#errors). For unauthenticated callers the message is one of a fixed set of strings. For authenticated callers the backend's message is passed for 4xx and replaced by a generic text for 5xx. | T |
| SR-OUT-3 | No response header is derived from backend data, except `Content-Disposition` for declared downloads, whose file name is rebuilt from an allow-listed character set. | T |
| SR-OUT-4 | Properties marked `writeOnly` or `x-omv-secret` in the contract are removed from responses by the gateway, whatever the backend returns. | T |
| SR-OUT-5 | All API responses carry `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin` and a `Content-Type` fixed by the contract. | T |

## FILE — downloads and uploads

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-FILE-1 | The gateway opens a file only for an operation that declares `x-omv-download` with `mode: file`, and only beneath the directory that declaration names. | T |
| SR-FILE-2 | The open uses `openat2` with `RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS | RESOLVE_NO_MAGICLINKS`; the result must be a regular file, with the owner and maximum size the declaration states. | T |
| SR-FILE-3 | The backend's `headers`, `unlink` and any other response field are ignored for the purpose of serving. Deletion of a temporary file happens only when the declaration says `ephemeral: true`, and uses `unlinkat` on the already-validated directory handle and name. | T |
| SR-FILE-4 | Downloads are sent with `Content-Disposition: attachment`, the declared content type, and `X-Content-Type-Options: nosniff`. Nothing is served inline. | T |
| SR-FILE-5 | The directories readable for downloads are bound read-only into the unit's namespace explicitly; nothing else outside the unit's own directories is visible. | C |
| SR-FILE-6 | Uploads are accepted only by operations declaring `x-omv-upload`, require the `admin` role and step-up, and are limited to the declared size (floor: none; ceiling 512 MiB) and content type. | T |
| SR-FILE-7 | Uploaded content is written to a private spool directory with a gateway-chosen random name, mode `0640`, group readable by the backend only; the client's file name is passed to the backend as data after sanitising and is never used as a path. | T |
| SR-FILE-8 | The spool file is removed when the request ends, however it ends. | T |

## TASK — background tasks

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-TASK-1 | A background task is known to the client only by an opaque random identifier (128 bits minimum). Status-file names from the backend are kept server-side and never appear in a response, an event or a log at default level. | T |
| SR-TASK-2 | A task is bound to the user that started it. Only that user's sessions may follow or stop it. | T |
| SR-TASK-3 | The gateway passes to the `Exec` service only file names it received from the backend for a task in its own table. | T |
| SR-TASK-4 | Task output is delivered as text. It is never interpreted, and the interface renders it as text (SR-UI-2). | T |

## ENG — the backend connection

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-ENG-1 | Each backend call uses a new connection, writes the complete request with a write deadline (default 5 s), and never writes a partial request deliberately. | T |
| SR-ENG-2 | Each call has a read deadline from the operation's `x-omv-timeout` (default 30 s, ceiling 170 s). On expiry the connection is closed and the client receives 504. | T |
| SR-ENG-3 | Request size to the backend is capped (default 1 MiB, except uploads which pass a path). | T |
| SR-ENG-4 | Response size is capped (default 16 MiB, per-operation override up to 64 MiB). An oversized or malformed reply yields 502 and is not parsed further. | T |

## DOS — resource limits

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-DOS-1 | At most 8 backend calls run concurrently (configurable 2–32). | T |
| SR-DOS-2 | At most 3 backend calls run concurrently per session. | T |
| SR-DOS-3 | A request waits at most 5 s for a slot, then receives 503 with `Retry-After`. Unauthenticated requests never wait: login has its own single reserved slot and budget. | T |
| SR-DOS-4 | HTTP server limits: header read timeout 5 s, headers 16 KiB, body per SR-ENG-3, idle timeout 60 s. | T |
| SR-DOS-5 | nginx applies a per-address connection limit and request-rate limit to `/api/` as a first, coarser layer. | C |
| SR-DOS-6 | Per session: at most 600 requests per minute. | T |
| SR-DOS-7 | Bounded tables: sessions (SR-SESS-7), pending logins (1 per pre-auth cookie, 200 total, oldest evicted), tasks (20 per user), event streams (4 per session). | T |

## AUD — audit logging

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-AUD-1 | Every authentication event, every step-up, every denied request from stage 3 onwards, and every operation not marked `x-omv-readonly` is logged with: time, correlation identifier, user, role, source address, operation ID, outcome, duration. | T |
| SR-AUD-2 | Logs go to the journal with structured fields under a dedicated identifier. | C |
| SR-AUD-3 | Parameter values are logged only at debug level and only after redaction: properties marked `writeOnly`, `x-omv-secret` or `format: password` are replaced by a fixed marker. Request tokens, cookies and second-factor codes are never logged at any level. | T |
| SR-AUD-4 | Every externally influenced string written to a log is length-limited and has control characters escaped. | T |

## UI — the web interface

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-UI-1 | Documents are served with: `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; require-trusted-types-for 'script'`, plus `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `X-Content-Type-Options: nosniff`, and a `Permissions-Policy` denying all features. No inline script or style exists in the build. | C, T |
| SR-UI-2 | The interface never assigns markup from data: no `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, or client-side template rendering of data. No Markdown or HTML from the backend or from the network is rendered. | L |
| SR-UI-3 | The interface never navigates to, redirects to, opens or fetches a target taken from a URL parameter or from a response. Routes are static; no route's parameters select an operation or its arguments beyond typed identifiers of the object being viewed. | L, R |
| SR-UI-4 | All text from the backend is rendered as text. Links are built from typed route definitions only. | L, R |
| SR-UI-5 | Password and secret fields are never pre-filled from a response, never placed in the URL, and never written to any browser storage. | L, R |
| SR-UI-6 | The request token lives in `sessionStorage` under one key; it is never placed in a URL, a cookie, `localStorage` or a log. | L |
| SR-UI-7 | No third-party origin is contacted by the interface: no CDN, fonts, analytics, or error reporting. All assets are in the package. | C, T |
| SR-UI-8 | Destructive operations require an explicit confirmation that names the object; the most destructive (wipe, delete with data) require typing the object's name. Confirmation is a usability control and does not replace SR-AUTHZ-4. | R |

## SUP — supply chain and build

| ID | Requirement | Verify |
|----|-------------|--------|
| SR-SUP-1 | Go dependencies are pinned in `go.sum`, vendored, and verified in CI (`go mod verify`). The direct dependency list is reviewed at each release. | L |
| SR-SUP-2 | CI runs `govulncheck`, `staticcheck` and `gosec` on the gateway and fails on findings. | L |
| SR-SUP-3 | JavaScript dependencies install from a frozen lockfile with lifecycle scripts disabled; `pnpm audit` gates the release. | L |
| SR-SUP-4 | Release binaries are built with `-trimpath`, as position-independent executables, with the toolchain version pinned. Two builds of the same commit produce identical binaries. | C |
| SR-SUP-5 | Each release ships an SBOM for the gateway and for the web bundle. | C |
| SR-SUP-6 | The framing codec, the strict JSON parser, the response normaliser and the path validation each have fuzz tests that run in CI for a fixed budget. | T |
| SR-SUP-7 | Development-only behaviour is compiled only under a build tag the release build does not set. The binary logs its build mode at start, and the package check fails if a development build is packaged. | C |
