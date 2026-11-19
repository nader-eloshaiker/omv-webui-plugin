# 01 — Solution review

The original proposal, in one paragraph: *write a Go gateway that speaks engined's socket protocol; load an OpenAPI spec at start; route `POST /api/rpc/{Service}/{method}` through one generic handler that validates and forwards; use SameSite cookies and CSRF checks; convert background-task polling to Server-Sent Events; generate the spec from OMV's own datamodels by adding fields to them.*

This document reviews that proposal against two things it did not account for: the solution must ship as a **plugin**, and it must be **secure to a standard well above the layer it replaces**. The verdict is that the core idea holds, and that eleven parts of the proposal were wrong, incomplete or unsafe as stated. Each finding ends in a decision (`D1`…). The decisions are binding on the implementation; the security ones are restated as testable requirements in [04](04-security-requirements.md).

## Verdict

**Proceed, with the changes below.** The gateway is the right shape because the web layer really is separable from the backend, and because the weaknesses found in the legacy web layer are mostly properties of that layer (how it dispatches, how it handles sessions, what it trusts in responses) and not of the methods behind it.

The risk that dominates everything else is this: **engined performs no authentication. Whoever can write to its socket chooses the user name and the role.** Today that power belongs to the PHP web process. With the plugin it also belongs to the gateway. The gateway is therefore a root-equivalent component, and the design's job is to make it small, isolated, strict and boring.

## Findings and decisions

### F1. "Generate the spec from OMV's datamodels by extending them" does not work for a plugin

The proposal added `method` and `response` fields to OMV's `rpc.*` datamodel files. A plugin cannot edit files owned by the `openmediavault` package, and should not want its contract to change when OMV is upgraded underneath it.

It is also unsafe. A contract generated at run time from whatever is installed would publish every method of every third-party plugin through the gateway automatically, including methods nobody reviewed.

**D1. The contract is authored in this repository and compiled into the gateway.** Tooling may bootstrap an operation's request schema from OMV's datamodel files at development time, but the result is reviewed and committed here. The contract is the allow-list: an operation that is not in it does not exist.

**D2. Third-party plugins opt in explicitly** by installing a contract fragment under `/usr/share/openmediavault-gateway/contract.d/`. Fragments are root-owned package files, loaded at start, linted, and may not redefine or weaken an existing operation. A fragment that fails to load is skipped and logged; it never widens access.

### F2. Cookies plus "CSRF checks" are not enough on a NAS

Three properties of the environment defeat the usual cookie recipe:

- **Cookies ignore ports.** A NAS typically serves several web applications from one host name on different ports. Every one of them receives the browser's cookies for that host. A compromised or malicious application on another port would be handed the gateway's session cookie.
- **A same-origin page can be made to issue requests.** The legacy workbench has a route that turns URL parameters into a backend call (review ID `H1`). SameSite does not help when the request is issued by the application's own script.
- **The legacy layer accepts calls over GET and without any origin check** (`H1`, server side).

**D3. A session credential has two halves.** A cookie (`__Host-` prefixed, `Secure`, `HttpOnly`, `SameSite=Strict`) and a request token that the web application holds in `sessionStorage` and sends in a header. Neither half works alone. The token is never set, refreshed or returned by a request that presents only the cookie.

**D4. State-changing requests are `POST` with `Content-Type: application/json`, the request token header, and an `Origin` that equals the gateway's own origin.** `Sec-Fetch-Site`, when present, must be `same-origin`. There is no CORS support at all.

**D5. No route in the web application may derive an API call from the URL.** This is a rule for the frontend, enforced by lint and review.

### F3. Sharing an origin with the legacy workbench would inherit its script-injection risk

The proposal mounted the API under `/api/` of the stock web server. Two documents on one origin can script each other. The legacy workbench has known places where untrusted content reaches the page as markup (`M11`, `M12`). Script running there could open the new interface in a window and drive it, request token and all.

**D6. The gateway and the new interface are served from their own origin**: a separate nginx server block on a separate port, TLS only. The plugin does not add anything to the stock server block except the optional lockdown rules in D17.

### F4. TLS cannot be optional, and HSTS needs care

OMV installs with HTTP on port 80 and a well-known default password (`M4`). A `__Host-` cookie requires HTTPS. A design that "also works over HTTP" would be a design with a second, weaker mode.

**D7. The gateway listener is HTTPS only.** The administrator selects a certificate from OMV's certificate store in the plugin settings; the plugin does not start serving until one is selected. Because a stock install has no certificate, the settings page offers a single action that creates a self-signed certificate in OMV's store and selects it, so enabling the plugin is one step. There is no plain-HTTP fallback and no redirect listener.

**D8. `Strict-Transport-Security` is sent only when OMV's own web interface is configured to force HTTPS.** HSTS applies to the host on every port, so sending it unconditionally would break a stock interface that still runs on HTTP.

### F5. The login port was under-specified, and three legacy weaknesses sit exactly there

- Permanent lockout: the shipped PAM configuration locks an account for good after three failures (`M9`), and nothing in front of it rate-limits. Anyone on the network can lock the administrator out.
- Second-factor bypass by user-name case when the name service is case-insensitive (`M8`).
- The default administrator password (`M4`).
- The legacy layer also accepts a session identifier supplied by the client in a request header.

**D9. The gateway rate-limits before PAM is reached**, per source address and per user name, with budgets set below the PAM lockout threshold so that the gateway's own login endpoint cannot be used to trigger the permanent lockout. Throttling is temporary by construction.

**D10. The gateway only establishes a session for the canonical user name.** After a successful first factor it looks the user up and refuses the login unless the name the backend returns is byte-identical to the name submitted.

**D11. A login with the factory default administrator password yields a restricted session** that can do one thing: change that password.

**D12. Session identifiers are generated by the gateway only.** No request header or parameter can select or fix a session.

### F6. Downloads were hand-waved, and the legacy design is a file-read primitive

The legacy download proxy treats the backend's response as instructions: read this path, send these headers, delete the file afterwards (`H2`). Any method whose response a low-privileged user can influence becomes a way to read or delete files as the web user.

**D13. The gateway never interprets a response as an instruction.** It never opens a path, sets a header, follows a URL or renders markup because a response said so. Downloads exist only for operations the contract marks as downloads. For the two methods that return a file path, the contract declares the directory the file must be in; the gateway opens it with `openat2` (`RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS`), checks that it is a regular file of the expected owner, and takes the content type from the contract. Preference is given to operations that return content, and the new interface draws its own charts from data, so the image-file path may never be needed.

### F7. Background tasks leak a file-system handle to the client

The `Exec` service identifies a task by the path of its status file, and the client sends that path back to poll, attach or stop.

**D14. Task file names never leave the gateway.** The gateway keeps a table of opaque, random task identifiers, each bound to the session's user and to the operation that started it. Progress is streamed to the client over Server-Sent Events; the gateway does the polling. A client cannot name a status file.

### F8. Authorisation was left entirely to engined

The legacy dispatcher has no global rule; each method checks its own role, and one method in the upstream tree does not (`M2`).

**D15. The gateway enforces the role itself, from the contract, before forwarding.** Every operation declares `x-omv-role`; the default is `admin`. engined's own check remains as the second line. Dangerous operations additionally declare `x-omv-sensitivity: elevated` and require step-up authentication within the last five minutes.

### F9. The engined client needs to defend the backend, not just talk to it

Reading the daemon shows that it reads the whole request in its accept loop before forking, exits on a read error, forks a PHP process per request, and returns PHP's ambiguous encoding of empty maps.

**D16. The engined client is conservative**: one bounded write per request with a deadline, a global and a per-session concurrency limit, a response size cap, per-operation timeouts, and a normalisation step that restores `{}` where the contract says object and PHP sent `[]`. Requests are re-serialised from the validated value, so engined never parses bytes the client chose. Detail in [06](06-engined-protocol.md).

### F10. Installing the plugin does not make the device secure

The stock web layer stays installed. The device remains exposed through it.

**D17. The plugin offers an opt-in "legacy lockdown"**, off by default, in stages: block the generic download route; block calls over GET; finally block the stock API altogether once the new interface covers what the administrator needs. Each stage is an nginx rule the plugin installs in the stock include directory and removes again on uninstall. Documentation states plainly what remains exposed at each stage.

### F11. Process isolation was not specified

"Runs as a member of the engined group" is the beginning of the answer.

**D18. The gateway runs as its own system user** with exactly one supplementary group (`openmediavault-engined`). It is **not** in `openmediavault-config` and cannot read `config.xml`, which holds private keys and second-factor secrets. It listens on a unix socket handed over by systemd and reachable only by nginx. It has **no network access at all** (`PrivateNetwork=yes`, address families restricted to `AF_UNIX`), so it cannot be turned into a request forgery tool. The systemd unit applies the full sandbox in [08](08-plugin-packaging.md#systemd-unit).

### F12. Details that were right, kept

**D19. Go, standard library first.** One static binary, straightforward cross-compilation for `amd64`, `arm64` and `armhf`, and a small dependency surface.

**D29. One package, separable by design.** The interface and the gateway ship together, but the contract is the only coupling between them: the gateway knows nothing about this interface, the contract is published on the system, and the interface is a replaceable directory of static files served from the gateway's origin. See [08](08-plugin-packaging.md#separating-the-interface-from-the-gateway).

**D20. One generic handler driven by the compiled contract**, not hundreds of generated stubs. Service and method names come only from the contract's `x-omv-rpc` extension on the matched route.

**D21. RPC-shaped operations**: `POST /api/v1/rpc/{Service}/{method}`. Page-level read endpoints that combine several calls may be added later under `/api/v1/views/…` in the same contract.

**D22. No GraphQL.** <a id="d22-no-graphql"></a>The backend computes whole responses and forks per call; nested resolvers would multiply forks; OMV's schema dialect maps poorly to GraphQL's type system; and the reference stack is OpenAPI.

**D23. Errors never carry a stack trace.** The backend's trace is logged with a correlation identifier and dropped from the response.

## Additional controls introduced by this review

These were absent from the proposal and are not prompted by a single finding.

- **D24. Host header allow-list** against DNS rebinding: a request is served only if `Host` is a configured name or the literal address the connection arrived on.
- **D25. Strict Content Security Policy with Trusted Types** for the new interface; no inline script or style; no framing.
- **D26. Audit log** of every authentication event and every state-changing operation, with secrets redacted by schema.
- **D27. Sessions are revalidated** against the backend at a short interval, and revoked when the user's password, role or second factor changes through the gateway.
- **D28. Supply-chain controls**: pinned and vendored dependencies, vulnerability scanning in CI, reproducible builds, an SBOM per release.

## What the review could not settle

Open questions for the owner. None blocks Phase 0.

1. *(Closed 2026-11-19.)* **Name.** The repository is `omv-webui-plugin` and the package `openmediavault-webui`: users are installing a new web interface and it is named as that. "Gateway" stays an internal name.
2. *(Closed 2026-11-19.)* **One package.** The interface and the gateway always ship together as one plugin. Two packages would confuse installation and could fall out of step.
3. *(Answered 2026-11-19.)* **Port.** The owner asked to use OMV's already configured port. Sharing it while the stock interface is served would undo D6, so the default stays a separate port; a "replace mode" that takes over OMV's HTTPS port once the stock interface is switched off is planned, subject to assumption `A15`. See [08](08-plugin-packaging.md#why-not-omvs-configured-port).
4. **First-login notification e-mail.** The legacy layer e-mails the user when a new browser logs in and sends that mail from PHP. The gateway has no mail path and no network. Options: a small engined RPC in the plugin's own service that sends it, or dropping the feature. The plan assumes the former in Phase 2.
5. **Rendering third-party plugin pages.** Plugins describe their pages in YAML manifests for the legacy workbench. Whether the new interface renders those, and how that fits D1/D2, is a frontend decision deferred to Phase 6.
6. *(Closed 2026-11-19.)* **Licence.** GPL-3.0-or-later for the whole repository.

## Residual risks accepted by this design

Stated so nobody is surprised later.

- **A flaw in the gateway's authentication or authorisation is a root compromise.** This is equal to, not worse than, the position of the PHP layer today; the mitigations are small scope, isolation and tests.
- **Any other process in the `openmediavault-engined` group has the same power.** The plugin cannot change that.
- **The legacy web layer remains a path in** until lockdown is enabled.
- **An administrator who is tricked into typing credentials into a fake page is not protected** by anything here. Step-up limits the window, not the fact.
- **engined's own methods are unchanged.** A method that is unsafe when called by an administrator with hostile parameters is still unsafe; the gateway only narrows who can call it and with what shape of input.
