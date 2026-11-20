# 05 — Security

## Position

The interface is a new client of OMV's existing web layer. Authentication, sessions, authorisation and input validation are OMV's. **The interface is exactly as secure as that layer, and no more.**

Two obligations follow:

1. **Add nothing to the attack surface** beyond static files and one nginx location.
2. **Do not reproduce the client-side mistakes** that turn backend weaknesses into attacks. Several findings of the private review of OMV's web layer needed a cooperating client: a route that turned a URL into a backend call, pages that rendered data as markup, a redirect that followed a supplied address. The new interface must have none of these.

An OMV administrator is root-equivalent by OMV's design. Anything that lets someone act as the administrator in the browser is a compromise of the NAS. That is the standard the rules below are held to.

## Rules

Binding. `L` = enforced by lint or a build check; `T` = automated test; `R` = review item at release.

| ID | Rule | Verify |
|----|------|--------|
| UI-1 | Everything under `/ui/` is served with: `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; require-trusted-types-for 'script'`, plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, and a `Permissions-Policy` denying all features. The build contains no inline script and no inline style element. Trusted Types is enforced: the shell passed with it on the test VM in Phase 2 (journal, 2026-11-20). | T, L |
| UI-2 | No markup from data. Forbidden everywhere in the workspace: `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string arguments to timers, and any client-side template or Markdown rendering of data. Everything from the backend (names, comments, labels, log lines, task output, error messages) is rendered as text. No HTML or Markdown from the backend or the network is rendered at all; help text is part of the build. | L |
| UI-3 | No supplied targets. The interface never navigates to, redirects to, opens, embeds or fetches an address taken from a URL parameter, a backend response or storage. There is no `returnUrl`. The endpoints `/rpc.php` and `/download.php` are constants. External links are fixed in code, open with `rel="noopener noreferrer"`, and are visibly external. | L, R |
| UI-4 | No backend call derived from the URL. Routes are static and typed; a route parameter is only a validated identifier of the object being viewed. No route, query string or fragment can name a service, a method or free-form parameters. Every state-changing call follows an explicit user action on the page, never page load. The download endpoint is called only for operations marked `x-omv-download`. | L, R |
| UI-5 | Handles stay in memory. Task handles and any other server-side path or token received from the backend are never placed in a URL, browser storage, a log or the DOM as text. The task helper passes to `Exec` only handles it received from a task-starting call. | L, R |
| UI-6 | No credentials at rest. Passwords, second-factor codes and the `sessionid` value are never written to any browser storage, the URL, a log or an error report. The session lives only in OMV's HttpOnly cookie. Secret fields (`x-omv-secret`) are masked, never pre-filled from a response, and cleared from form state after submit. Login inputs carry the correct `autocomplete` attributes so password managers work. | L, R |
| UI-7 | No third-party origins. No CDN, web fonts, analytics, error reporting or update checks. Every asset is in the package. | T |
| UI-8 | Destructive operations (`x-omv-destructive`) require a confirmation that names the object and states what is lost. `data`-destructive ones (wipe a disk, delete a share with its content, delete a file system) require typing the object's name. Confirmation is never colour alone. | R |
| UI-9 | Errors show the backend's message as text and nothing else from the error. Stack traces are discarded in the transport and never displayed, stored or logged in production builds. | T |
| UI-10 | Only the transport module performs network requests, always `POST` with `Content-Type: application/json` and `credentials: "same-origin"`. `fetch`, `XMLHttpRequest`, `EventSource`, `WebSocket` and `navigator.sendBeacon` are forbidden elsewhere. | L |
| UI-11 | Dependencies install from a frozen lockfile with lifecycle scripts disabled. `pnpm audit` gates the release. Each new runtime dependency is justified in its pull request. The production bundle contains no mock, test or development code. | L |
| UI-12 | When the page is not served over HTTPS, a persistent notice says the connection is not encrypted and passwords can be read on the network, and points to OMV's HTTPS setting. | T |
| UI-13 | Browser storage holds only non-sensitive preferences (theme, table column choices, language). No server data, identifiers or user names. | L, R |
| UI-14 | The interface does not weaken the backend's protections for convenience: no keep-alive that defeats the idle timeout (background polling sends `updatelastaccess: false`), no automatic retry of failed logins, no automatic retry of mutations. | T, R |

## Inherited and not fixable here

Stated plainly so that nobody mistakes a new interface for a security upgrade. These are properties of OMV's web layer; they are described by class only, and the detail is held privately until disclosed upstream.

| Review ID | Class | Effect with this plugin installed |
|-----------|-------|-----------------------------------|
| H1 | The backend endpoint accepts calls without an origin check and in forms other than a JSON `POST`; the stock interface has a route that turns a link into a backend call | Unchanged. The new interface has no such route (UI-4), but the stock one is still installed |
| H2 | The download endpoint trusts what a method returns | Unchanged. The new interface uses that endpoint only for a fixed list (UI-4) |
| M2 | One backend method without a role check | Unchanged; not in the contract |
| M3 | A second-factor plugin trusts client-supplied verification data | Unchanged; not in the contract. The affected operations are not named in `EXCLUDED.md`, since a name beside this ID would point at the weakness; the owner holds the list |
| M4 | Factory default password; HTTP by default | Unchanged. The interface warns on HTTP (UI-12) and may nudge the administrator to change a default password |
| M8 | Second-factor handling depends on the exact spelling of the user name under some directory set-ups | Unchanged; login is OMV's |
| M9 | Repeated failed logins can lock an account permanently | Unchanged. The login screen explains what happened and how to recover; it cannot prevent it |
| M11, M12 | The stock interface can render untrusted content as script in two places | Unchanged, and because both interfaces share an origin (D3), such script could also act in the new one |
| Low | Error responses include stack traces | The new interface discards them (UI-9); the endpoint still sends them |

The items not listed (`H3`, `M1`, `M5`–`M7`, `M10`) are inside the backend or other plugins and unrelated to any interface.

**Where these get fixed:** upstream, through the private report and patches already prepared. The parked [gateway design](later-gateway/README.md) is the alternative if the plugin ever needs to be secure independently of upstream.

## What the plugin adds, and why it is small

| Addition | Risk considered |
|----------|-----------------|
| Static files in `/var/www/openmediavault-webui`, root-owned, not writable by the web user | None beyond the files' own content |
| One nginx location serving them at `/ui/` with stricter headers than the stock site | A mistake in the snippet could break OMV's site; it is syntax-checked before reload and removed cleanly (see [06](06-plugin-packaging.md)) |
| A navigation link in the stock interface | A fixed, relative link |

No daemon, no new user, no new port, no PHP, no changes to OMV's files, no new backend methods.

## Threats the interface itself must withstand

| Threat | Rule |
|--------|------|
| A crafted link makes the interface call the backend | UI-4 |
| A name, comment or log line containing markup runs as script | UI-2, UI-1 |
| A link sends the administrator to a look-alike page after login | UI-3 |
| The interface is framed and the administrator is tricked into clicking | UI-1 |
| A compromised dependency exfiltrates data or acts as the administrator | UI-11, UI-7, UI-1 (`connect-src 'self'`) |
| Credentials or handles left in history, storage or logs on a shared computer | UI-5, UI-6, UI-13 |
| A destructive click by mistake | UI-8 |

## Reporting weaknesses found while building

An implementer who notices a weakness in OMV's backend or web layer while building does not write it into this repository, an issue or a commit message. Tell the owner privately; it goes through the upstream disclosure process.
