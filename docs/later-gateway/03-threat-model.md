# 03 — Threat model

## What is being protected

| Asset | Why it matters |
|-------|----------------|
| **The engined socket** | Writing to it with a chosen context is root on the NAS |
| **Administrator sessions** | A live administrator session is root on the NAS for as long as it lasts |
| **Credentials in transit and at rest** | Passwords, second-factor codes; the gateway sees them during login and must not keep or log them |
| **`config.xml`** | Holds TLS and SSH private keys, second-factor secrets, mail and plugin credentials. The gateway must never be able to read it |
| **User data on the shares** | Reachable by any administrator action; destroyed by a wipe or delete |
| **Availability of administration** | An attacker who can lock the administrator out, or exhaust the backend, holds the device hostage |
| **The audit trail** | The record of who did what |

## Trust boundaries

```
 internet / LAN ─┬─▶ [B1] nginx TLS listener
                 │
 browser tab ────┘        [B2] nginx ─▶ gateway unix socket (group www-data)
                               [B3] gateway ─▶ engined unix socket (group openmediavault-engined)
                                    [B4] engined ─▶ operating system (root)
 other web apps on the host ── same host name, other ports: share cookies, not origin
 legacy workbench ──────────── other origin; same host; own session
 package files (contract, fragments, config) ── root-owned; trusted as code
```

- **B1** is the only boundary reachable from the network. Everything arriving there is hostile until stage 6 of the request lifecycle says otherwise.
- **B2** is trusted for exactly three headers and nothing else.
- **B3** is where authority is asserted. Nothing crosses it that the contract did not name and the guard did not approve.
- **B4** is outside this design.

## Attackers

| ID | Attacker | Position and capability |
|----|----------|-------------------------|
| **A-NET** | Unauthenticated host on the network | Can connect to the listener, send arbitrary requests, observe timing, try passwords |
| **A-WEB** | A web page the administrator visits | Can make the administrator's browser send cross-site requests, navigate to URLs of its choosing, attempt DNS rebinding; cannot read cross-origin responses |
| **A-PORT** | Another web application on the NAS host (other port), or whoever compromised it | Receives the browser's cookies for the host; can serve script on its own origin; can call the gateway from the server side |
| **A-USER** | An authenticated non-administrator | Holds a valid `user` session; wants administrator power or other users' data |
| **A-SESS** | Holder of a stolen or borrowed live session | Has cookie and request token (malware in the browser profile, an unlocked laptop) |
| **A-LOCAL** | Unprivileged local account or service on the NAS | Can see process lists, world-readable files, loopback ports and abstract sockets |
| **A-BACK** | Hostile data returned by the backend | A response field an attacker influenced earlier: a share name, a comment, a log line, a file name |
| **A-SUPPLY** | A compromised dependency or build input | Runs inside the gateway or the web bundle |

Out of scope: a malicious administrator (root-equivalent by OMV's design); an attacker with root on the NAS; physical access; a compromised browser or operating system on the administrator's machine beyond what A-SESS covers.

## Threats and controls

`T-` identifiers are referenced by the test matrix in [10](10-test-and-verification.md). The controls column names the requirements in [04](04-security-requirements.md).

### Spoofing and authentication

| ID | Threat | Attacker | Controls |
|----|--------|----------|----------|
| T-01 | Forge the engined context (choose user or role) | any | SR-CTX-1..4, SR-ISO-1..3 |
| T-02 | Online password guessing | A-NET | SR-AUTH-5..8 |
| T-03 | Lock the administrator out by failed logins (legacy `M9`) | A-NET | SR-AUTH-7, SR-AUTH-8 |
| T-04 | Skip the second factor by a variant spelling of the user name (legacy `M8`) | A-NET with password | SR-AUTH-9 |
| T-05 | Log in with the factory default password (legacy `M4`) | A-NET | SR-AUTH-11 |
| T-06 | Fix or choose a session identifier | A-WEB, A-NET | SR-SESS-1, SR-SESS-2 |
| T-07 | Guess a second-factor code by brute force | A-NET with password | SR-AUTH-10 |
| T-08 | Replay a captured pending-login to complete someone else's second step | A-NET | SR-AUTH-10, SR-SESS-9 |
| T-09 | Enumerate valid user names from responses or timing | A-NET | SR-AUTH-4 |

### Request forgery and session abuse

| ID | Threat | Attacker | Controls |
|----|--------|----------|----------|
| T-10 | Cross-site request with the administrator's cookie (legacy `H1`) | A-WEB | SR-REQ-1..5, SR-SESS-3 |
| T-11 | A link that makes the application itself issue a chosen call (legacy `H1`) | A-WEB | SR-UI-3, SR-REQ-6 |
| T-12 | Calls over `GET` or with a form content type (legacy `H1`) | A-WEB | SR-REQ-1, SR-REQ-2 |
| T-13 | Cookie received by another application on the host | A-PORT | SR-SESS-3..5 |
| T-14 | DNS rebinding to reach the gateway from a hostile page | A-WEB | SR-REQ-7 |
| T-15 | Clickjacking the interface | A-WEB | SR-UI-1 |
| T-16 | Script injection in the legacy workbench driving the new interface (legacy `M11`, `M12`) | A-WEB, A-BACK | SR-ISO-6 (separate origin), SR-UI-1 |
| T-17 | Use of a stolen live session for a destructive or persistent action | A-SESS | SR-AUTHZ-4, SR-SESS-6..8, SR-AUD-1 |
| T-18 | Session outlives a password change, role change or user deletion | A-SESS, A-USER | SR-SESS-8 |

### Authorisation

| ID | Threat | Attacker | Controls |
|----|--------|----------|----------|
| T-20 | Call an administrator method as a user because the method forgot its check (legacy `M2`) | A-USER | SR-AUTHZ-1..3 |
| T-21 | Reach a method that is not meant to be exposed | any | SR-AUTHZ-5, SR-CON-1..4 |
| T-22 | A third-party fragment widens access or lowers a role | A-SUPPLY | SR-CON-5..7 |
| T-23 | Act on another user's object through a `*ByContext` style method | A-USER | SR-CTX-2, SR-AUTHZ-6 |
| T-24 | Follow, stop or read another user's background task | A-USER | SR-TASK-1..3 |

### Tampering and injection

| ID | Threat | Attacker | Controls |
|----|--------|----------|----------|
| T-30 | Parser differential: the gateway validates one thing, PHP parses another | A-USER, A-NET | SR-IN-1..4 |
| T-31 | Parameters outside the declared shape reach a method | A-USER | SR-IN-2, SR-IN-5 |
| T-32 | Trailing newline or control characters pass a format check (legacy Low) | A-USER | SR-IN-6 |
| T-33 | The gateway opens, deletes or serves a path named in a response (legacy `H2`) | A-USER, A-BACK | SR-FILE-1..5 |
| T-34 | Response data sets HTTP headers or redirects | A-BACK | SR-OUT-3, SR-FILE-3 |
| T-35 | Stored data rendered as markup or template in the interface | A-BACK | SR-UI-2, SR-UI-4 |
| T-36 | Open redirect through a server- or URL-supplied target (legacy Low) | A-WEB | SR-UI-3 |
| T-37 | Uploaded file used to plant content or exhaust disk | administrator session, A-SESS | SR-FILE-6..8 |
| T-38 | Log injection through user-controlled strings | A-NET, A-USER | SR-AUD-4 |

### Information disclosure

| ID | Threat | Attacker | Controls |
|----|--------|----------|----------|
| T-40 | Stack traces and internal paths in error responses (legacy Low) | A-NET | SR-OUT-1, SR-OUT-2 |
| T-41 | Secrets in logs | A-LOCAL | SR-AUD-3 |
| T-42 | The gateway process reads `config.xml` or other secrets | attacker who gains code execution in the gateway | SR-ISO-2..5 |
| T-43 | Secrets returned to the client that the client does not need | A-SESS | SR-OUT-4 |
| T-44 | Responses cached by the browser or an intermediary | A-LOCAL on the client | SR-OUT-5 |
| T-45 | Credentials sent in clear text | network observer | SR-TLS-1..3 |

### Denial of service

| ID | Threat | Attacker | Controls |
|----|--------|----------|----------|
| T-50 | Exhaust the backend by concurrent calls (one PHP process each) | A-NET, A-USER | SR-DOS-1..3 |
| T-51 | Stall or crash engined through the socket (slow or partial request) | bug in the gateway | SR-ENG-1..3 |
| T-52 | Large bodies, deep JSON, slow requests, many connections | A-NET | SR-DOS-4..6 |
| T-53 | Unbounded sessions, pending logins, tasks or event streams | A-NET, A-USER | SR-DOS-7 |
| T-54 | Oversized backend response exhausts gateway memory | A-BACK | SR-ENG-4 |

### Elevation through the gateway's own position

| ID | Threat | Attacker | Controls |
|----|--------|----------|----------|
| T-60 | Code execution in the gateway becomes root | A-SUPPLY, memory-safety or logic bug | SR-ISO-1..8 |
| T-61 | The gateway is made to connect somewhere (request forgery) | A-USER | SR-ISO-4 |
| T-62 | A local user talks to the gateway's socket directly, forging nginx's headers | A-LOCAL | SR-ISO-7 |
| T-63 | A malicious package in the build | A-SUPPLY | SR-SUP-1..6 |
| T-64 | Development-only behaviour shipped in a release | mistake | SR-SUP-7 |

## How the legacy findings map

The private review of the legacy web layer produced the IDs below. This table says what the plugin does about each. "Not addressed" is an honest answer where the weakness is inside OMV or another plugin.

| Review ID | Class | In the gateway path | In the legacy path |
|-----------|-------|---------------------|--------------------|
| H1 | Cross-site call through a generic route; GET dispatch; no origin check | Eliminated: SR-REQ-*, SR-UI-3 | Remains until lockdown stage 2 |
| H2 | Download proxy obeys the response | Eliminated: SR-FILE-* | Remains until lockdown stage 1 |
| H3 | World-readable cluster credential (k8s plugin) | Not applicable | Not addressed |
| M1 | Privileged clean-up follows user-planted links | Not applicable | Not addressed |
| M2 | A method without a role check | Mitigated: SR-AUTHZ-1..3; the operation is admin-only in the contract or absent | Remains |
| M3 | Second-factor enrolment trusts client-supplied verification data (e-mail OTP plugin) | The affected operations are not added to the contract until fixed upstream; SR-CON-8 | Remains |
| M4 | Factory default password, HTTP by default | Mitigated: SR-AUTH-11, SR-TLS-1 | Remains |
| M5, M6 | Privileged file operations in user-writable places | Not applicable (inside engined) | Not addressed |
| M7 | Weak e-mail format allows control characters into a mail map | Mitigated: stricter schema in the contract (SR-IN-6) | Remains |
| M8 | Second-factor bypass by user-name variant | Eliminated for gateway logins: SR-AUTH-9 | Remains |
| M9 | Permanent lockout | Cannot be triggered through the gateway: SR-AUTH-7..8 | Remains |
| M10 | Weak defaults in other plugins | Not applicable | Not addressed |
| M11, M12 | Unsanitised markup / double template rendering in the workbench | Not present: SR-UI-2, SR-UI-4; isolated by origin: SR-ISO-6 | Remains |
| Low | Stack traces to clients | Eliminated: SR-OUT-1 | Remains |
| Low | Client-supplied session identifier | Eliminated: SR-SESS-2 | Remains |
| Low | Second-factor code replay within its validity window | Mitigated at the gateway: SR-AUTH-10 (one success per pending login; replay cache) | Remains |
| Low | Open redirect route | Not present: SR-UI-3 | Remains |
| Low | Format checks accept a trailing newline | Mitigated: SR-IN-6 | Remains |

## Residual risk

See the list at the end of [01](01-solution-review.md#residual-risks-accepted-by-this-design). In short: the gateway is root-equivalent and must be correct; the legacy layer stays exposed until the administrator locks it down; engined's methods are unchanged.
