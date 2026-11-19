# 05 — Authentication and sessions

This document specifies behaviour. The requirements it implements are in [04](04-security-requirements.md) (`SR-AUTH-*`, `SR-SESS-*`, `SR-REQ-*`, `SR-AUTHZ-4`).

## What is being ported, and what changes

The legacy logic lives in `var/www/openmediavault/rpc/session.inc` and `usr/share/php/openmediavault/session.inc`. The gateway keeps its observable protocol towards the backend, so that OMV's two-factor plugins work unmodified, and replaces everything about how the session is held.

| Aspect | Legacy | Gateway |
|--------|--------|---------|
| First factor | `UserMgmt.authUser` with administrator context | Same call |
| Second factor | `UserMgmt.verifyChallenge`; plugins mutate both responses | Same calls |
| Pending login | In the PHP session | In gateway memory, keyed by a pre-authentication cookie |
| Verification back-off | Files under `/run/openmediavault/auth`, 5 s doubling to 300 s after the third failure, reset after 900 s | Same curve, in memory |
| First-factor rate limit | None in front of PAM | Per address, per name and global (SR-AUTH-5..8) |
| Session credential | One cookie; identifier can also arrive in a request header | Cookie plus request token; identifiers server-generated only |
| Session storage | PHP session files | Memory, digests only |
| User-name handling | As typed | Canonical name enforced (SR-AUTH-9) |
| Default password | Accepted | Restricted session (SR-AUTH-11) |
| Idle timeout | From `conf.webadmin` (default 5 min, 0 disables) | Plugin setting, 15 min default, cannot be disabled |
| Binding | Source address and user agent compared on each request | Not bound to address (breaks behind NAT changes and adds little); user-agent change is logged, not enforced |
| New-browser e-mail | Sent from PHP | Sent through the plugin's own engined RPC (Phase 2; see open question in [01](01-solution-review.md#what-the-review-could-not-settle)) |

## Endpoints

All under `/api/v1/session/`. All are `POST` with a JSON body.

| Operation | Role | Request | Success response |
|-----------|------|---------|------------------|
| `login` | public | `{username, password}` | `200 {status: "authenticated", user, role, restricted, requestToken}` and `Set-Cookie` (session); or `200 {status: "challenge_required", challenge: {kind}}` and `Set-Cookie` (pre-auth) |
| `verify` | public (needs pre-auth cookie) | `{response}` — an object whose shape depends on `kind` | As the authenticated case of `login` |
| `probe` | public | `{}` | `200 {authenticated: false}` or `{authenticated: true, user, role, restricted, elevatedUntil, idleExpiresAt, expiresAt}` |
| `logout` | user | `{}` | `204`, cookies cleared |
| `elevate` | user | `{password}`; then, if a challenge is required, `elevate/verify` with `{response}` | `200 {elevatedUntil, requestToken}` and a new session cookie |
| `changePassword` | user | `{currentPassword, newPassword}` | `204`; all the user's sessions revoked, including this one |

`probe` reports `authenticated: true` only when both halves of the credential are present and valid. With the cookie alone it answers `authenticated: false`, exactly as with nothing.

## Login state machine

```
                 ┌──────────────┐
   login ───────▶│ rate limits  │──── over budget ──▶ 429 (Retry-After)
                 └──────┬───────┘
                        ▼
                 ┌──────────────┐  authenticated=false
                 │ authUser     │─────────────────────▶ FAIL
                 └──────┬───────┘
                        ▼
                 ┌──────────────┐  name differs / lookup fails
                 │ canonical    │─────────────────────▶ FAIL
                 │ name check   │
                 └──────┬───────┘
              challenge │ none
          ┌─────────────┴──────────────┐
          ▼                            ▼
   ┌──────────────┐             ┌──────────────┐
   │ PENDING      │             │ ESTABLISH    │──▶ 200 authenticated
   │ (≤300 s)     │             └──────────────┘
   └──────┬───────┘                    ▲
  verify  │                            │ verified=true
          ▼                            │
   ┌──────────────┐  verified=false    │
   │ verifyChal-  │──▶ count failure ──┤ back-off / discard at maximum
   │ lenge        │────────────────────┘
   └──────────────┘
```

`FAIL` is always: status 401, body `{"error": {"code": "invalid_credentials", "message": "Incorrect user name or password."}}`, sent no sooner than the timing floor (SR-AUTH-4). The audit record carries the real reason.

### Step by step

1. **Validate the body** against the schema: `username` 1–64 characters matching OMV's `username` format, anchored, no control characters; `password` 1–1024 bytes, single line. Trim ASCII whitespace around `username`. A body that fails validation is a `FAIL` (not a 400), so that the endpoint gives no parsing oracle.
2. **Rate limits**, in order: global budget, per-address budget, per-name failure cap (SR-AUTH-5..7). An attempt refused here does not reach the backend and returns 429.
3. **First factor.** Call `UserMgmt.authUser {username, password}` with the internal administrator context and `_SERVER` restricted per SR-CTX-4. Zero the password buffer. A backend error is logged and treated as `FAIL` with status 503 only if the backend was unreachable; any other error is a `FAIL`.
4. If `authenticated` is not exactly `true`: count a failure for the name and the address; `FAIL`.
5. **Canonical name.** Call `UserMgmt.getUser {name: username}`. If the call fails, or the returned `name` is not byte-identical to `username`: `FAIL`, logged as `noncanonical_username`. (This closes the class behind review ID `M8` for gateway logins: second-factor plugins match the user name exactly, so only the exact name may proceed.)
6. **Role.** `admin` if `permissions.role == "admin"`, else `user`. Any other shape of `permissions` is a `FAIL`.
7. **Challenge.** If the `authUser` result has a `challenge`:
   - It must be an object with a non-empty string `kind` of at most 32 characters from `[a-z0-9-]`. Otherwise `FAIL` (logged as a backend contract violation).
   - Create a pending login: `{user, role, challenge (entire object, server-side only), createdAt, failures: 0, inFlight: false}`.
   - Issue the pre-authentication cookie. Respond `challenge_required` with `kind` only. The backend's `redirecturl` is dropped: the new interface maps `kind` to its own screen and does not navigate to server-supplied URLs (SR-UI-3).
8. **No challenge:** establish the session (below).

### Verify

1. Look up the pending login by the pre-authentication cookie. None, or older than 300 s: status 401, `code: no_pending_login`, cookie cleared.
2. If the back-off timer for this user is running: 429 with `Retry-After`. If a verification is already in flight for this pending login: 429.
3. Mark in flight. Call `UserMgmt.verifyChallenge {username, challengeresponse: <body.response>, challengedata: <stored challenge>}` with the internal administrator context.
4. `verified` exactly `true`: check the replay cache (below); consume the pending login; clear the pre-authentication cookie; establish the session.
5. Otherwise: increment the user's failure count. From the third failure, back-off is `min(300, 5 × 2^(failures − 3))` seconds. When the back-off reaches 300 s the pending login is discarded. Failure counts reset 900 s after the last failure. Respond 401 `code: challenge_failed`.

**Replay cache.** For challenge kinds whose response is a short code (the contract's `verify` schema marks them), the gateway remembers a keyed digest of `(user, kind, code)` for 120 s after a success and refuses a second success with the same value. This narrows the replay window of time-based codes noted in the legacy review without changing the plugins.

The `response` object is validated against a per-kind schema from the contract (`totp`: `{code: 6–8 digits}` and so on). A kind with no schema in the contract cannot be verified through the gateway; the user is told that this second-factor method is not supported by the new interface.

### Establish

1. Enforce the per-user and global session limits (SR-SESS-7).
2. Generate the session identifier and the request token (SR-SESS-1). Store their digests with: user, role, `restricted`, created, last use, last revalidation, `elevatedUntil = 0`, user agent at creation.
3. **Default credential check** (SR-AUTH-11): if `username` is the OMV administrator account name and the submitted password equals the factory default, set `restricted: "password_change_required"`. The comparison is made at step 3 of login, before the buffer is zeroed, and only its boolean result is kept.
4. Set the session cookie; return the request token in the body.
5. Audit `login_success`. Ask the plugin's backend service to send the new-browser notification if applicable (never blocks the response).

## The session credential

```
Set-Cookie: __Host-omvgw_sid=<43 chars base64url>; Path=/; Secure; HttpOnly; SameSite=Strict
body:       { "requestToken": "<43 chars base64url>", … }
later:      Cookie: __Host-omvgw_sid=…        X-OMV-Request-Token: …
```

**Why two values.** The cookie is something the browser attaches by itself, which is what makes cross-site request forgery possible and what hands it to every other application on the same host name, whatever the port. The token is something only script running on the gateway's own origin can read and attach. Requiring both means: a forged request has the cookie and no token; an application on another port that receives the cookie has no token; and a token leaked on its own is useless without the `HttpOnly` cookie.

**Where the token lives.** In `sessionStorage`, under one key, per tab. It survives a reload and dies with the tab. A second tab has no token and shows the login screen; the interface may offer to hand the token over from an open tab of the same origin through a `BroadcastChannel`, initiated by a click in the tab that holds it. There is deliberately no endpoint that returns the token to a caller presenting the cookie alone (SR-SESS-5): such an endpoint would turn the cookie back into a complete credential.

### Requests that cannot set headers

There are none, by design. `EventSource` and plain navigation cannot attach a header, so the interface does not use them: event streams are read with `fetch` and a stream reader, and downloads are fetched and saved from a blob. Every API request is a `POST` with the token header and an `Origin`.

## Timeouts, revalidation, revocation

- **Idle:** 15 min since last use (configurable 1–60). Event-stream keep-alives do not count as use.
- **Absolute:** 12 h since creation (configurable 1–24).
- **Revalidation** (SR-SESS-8): when a session is used and its last revalidation is older than 60 s, the gateway calls `UserMgmt.getUser {name}` with the internal administrator context before serving the request. The user must exist; the returned `name` must equal the session's; membership of the administrator group must match the session's role. A mismatch revokes the session and the request receives 401.
- **Revocation by effect:** operations carry `x-omv-session-effect`. `revoke-user` (password change, second-factor enrolment or removal, user deletion, group membership change that affects the administrator group) revokes every session of the affected user when the operation succeeds. `revoke-all` exists for the plugin's own "sign everyone out" action.
- **Restart** of the gateway revokes everything.

## Step-up

An elevated session is one whose user re-entered credentials within the last 5 minutes (configurable 1–15). `elevate` runs the same first factor and, if the account has one, the same second factor as login, under the same rate limits. Success issues a **new** session identifier and request token, carrying the session over, and sets `elevatedUntil`.

The contract lint requires `x-omv-sensitivity: elevated` on every operation in these categories:

| Category | Why |
|----------|-----|
| Users and groups: create, modify, delete, import; password or key changes for another user | Creates or takes over accounts |
| Second factor: enrol, remove, reset | Weakens login |
| Scheduled jobs and anything that stores a command to run | Runs as root later |
| SSH service settings, SSH keys and certificates, TLS certificates and private keys | Persistent access |
| Plugin and package installation, removal, upload | Runs maintainer scripts as root |
| Disk wipe, file-system creation and deletion, deletion of a shared folder with its content | Destroys data |
| Network interface, firewall and proxy settings | Can cut off or expose the device |
| Export or import of the configuration; anything returning private key material | Bulk secrets |
| The gateway's own settings, including legacy lockdown | Lowers the guard |
| Power off and reboot | Availability |

Reads and ordinary configuration changes (a share's comment, a service's options) are not elevated. The intent is that a stolen live session, or a forged request that somehow got through, cannot create persistence or destroy data without the password.

## Rate limiting

Counters are in memory, in fixed-size tables with eviction of the oldest entry (so the limiter itself cannot be exhausted).

| Scope | Budget | On excess |
|-------|--------|-----------|
| Global, attempts reaching the backend | 30 per minute | 429 |
| Per source address, attempts | 10 per 5 min | 429 |
| Per user name, failed first factors reaching the backend | `lockoutThreshold − 1` per `lockoutWindow` (defaults 2 per 900 s) | 429 |
| Per user, failed verifications | Back-off curve above | 429 |

**Why the per-name cap is so low.** OMV ships a PAM configuration that locks an account permanently after three failures. The legacy login has nothing in front of it, so three bad guesses from anyone lock the administrator out until someone clears it from a root shell (review ID `M9`). The gateway cannot change that configuration, but it can guarantee that its own endpoint never delivers the third failure. The cost is that two typos mean a 15-minute wait on that name. Administrators who relax the PAM setting can raise the cap in the plugin's settings. The interface must explain the wait in plain words and show the remaining time.

The cap is per name across all addresses, so an attacker can still *delay* a named user's login through the gateway by spending that user's budget. That is a temporary nuisance in exchange for removing a permanent lockout, and SR-AUTH-8 forbids anything stronger. Failures made through the legacy interface are invisible to the gateway and still count towards PAM's limit; only legacy lockdown removes that path.

## Internal operations

The only backend calls ever made with the administrator context and no user session (SR-CTX-3):

| Call | Used by |
|------|---------|
| `UserMgmt.authUser` | login, elevate |
| `UserMgmt.verifyChallenge` | verify, elevate/verify |
| `UserMgmt.getUser` | canonical name check, revalidation |
| `Gateway.notifyLogin` (the plugin's own service) | new-browser notification |

The list is a constant in `internal/auth`. A test enumerates every call site that uses the internal context and fails if any call is outside it.

## What the implementer must not do

- Do not add a "remember me" option, a long-lived token, an API key, or basic authentication. If automation access is wanted later it is a separate design.
- Do not accept the request token from anywhere but the header.
- Do not make any throttle permanent or require administrator action to clear it.
- Do not return different errors for different login failures.
- Do not log, echo or store the password, the code, the token or the cookie value.
- Do not forward the backend's challenge data to the client.
- Do not skip the canonical-name check when it is inconvenient in a test environment; fix the test environment.
