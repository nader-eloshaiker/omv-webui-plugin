# Journal

Dated entries: each verified assumption (Phase 0 `A1`–`A11`), each owner decision, each surprise. Newest last. Observations only: no host names, addresses, user names, credentials, or request sequences that reproduce a weakness of OMV (those go to the owner privately).

Status values for assumptions: **confirmed**, **false** (needs an owner decision), **partly** (what holds and what does not is stated), **preliminary** (observed outside the test VM; to be repeated on it).

## 2026-11-19 — Owner decisions before Phase 0

- The design documents were committed to `main` as handed over; Phase 0 runs on branch `phase-0`.
- `apps/wheelhub-web-app` is the template for technology selection. Differences recorded under D7 in [01](01-decisions.md#d7-the-stack-mirrors-the-reference-application): the transport is written on `fetch` (no axios); a seventh package `ts-app-tooling`; the contract lives inside `spec-api-omv`; the package scope is `@omv-webui/`.
- Agent instructions follow the reference's provider-neutral layout (`.agents/` with symlinks from `.claude/`): D13.
- Throwaway scripts live in the git-ignored `scratch/`.

Design clarifications made with these, open to the owner's correction:

- Tasks are followed by one registry for the whole application, so a task survives moving between pages; polling stops when the task or the session ends ([02](02-architecture.md#cross-cutting-behaviour), [08](08-test-and-verification.md)).
- No correlation identifier is shown with errors; `rpc.php` has none (style guide 7).
- `A4` no longer asks for a large virtual disk: a disk cannot reach 2^53 bytes. It asks instead which fields arrive as strings or `0`/`1` and whether any 64-bit counter is served.
- Form validation schemas (valibot) are written by a script of our own from the contract; orval emits zod only ([04](04-api-contract.md#the-pipeline)).
- The theme follows `prefers-color-scheme` with no script; a class on `<html>` records only an explicit choice ([02](02-architecture.md#cross-cutting-behaviour)).
- Squircle corners (`corner-shape: squircle`) as a progressive enhancement on controls, cards and dialogs; pills, dots and meters stay round (style guide 4.3).

## 2026-11-19 — A9 (preliminary): the UI-1 policy against the reference stack

**Status: partly; preliminary** (local static server with exactly the UI-1 headers, Chromium; repeat through the A1 snippet on the test VM).

Set-up: a throwaway production build (`scratch/phase0/a9-csp/`, Vite 8, React 19.3, TanStack Router 1.170 and Query 5.104, Tailwind 4.3, radix-ui 1.6.7, Base UI 1.8.0, sonner 2.0.8, recharts 3.10.1, versions from the reference catalog) served at `/ui/` with the UI-1 policy enforced and `require-trusted-types-for 'script'` in report-only. Each component was opened in a fresh page load and violations were collected from `securitypolicyviolation` events and the policy's report endpoint.

| Part of the stack                                                                                | Enforced UI-1 policy                                                                            | Trusted Types (report-only)                                   | Effect                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vite build output (`index.html`)                                                                 | Clean: one external script, one external stylesheet, nothing inline                             | —                                                             | —                                                                                                                                                      |
| React 19 `style` props, Tailwind stylesheet, TanStack Router (incl. a deep link), TanStack Query | Clean                                                                                           | Clean                                                         | —                                                                                                                                                      |
| recharts                                                                                         | Clean (sizes set through `element.style`, which CSP allows)                                     | Clean                                                         | —                                                                                                                                                      |
| sonner                                                                                           | 2 violations at module load: it inserts its stylesheet as a `<style>` element                   | Clean                                                         | Toasts lose their styling; the violation fires on every page load, even with no toast shown                                                            |
| Radix Dialog, Popover, DropdownMenu, Select                                                      | 1 violation each on open: the scroll lock (`react-style-singleton`) inserts a `<style>` element | Clean                                                         | Page scrolling is not locked behind the dialog or menu                                                                                                 |
| Radix Select and ScrollArea                                                                      | 1 violation each: they render a `<style>` element to hide the native scrollbar                  | 1 report each (`innerHTML` through `dangerouslySetInnerHTML`) | The native scrollbar shows; under enforced Trusted Types the component would throw                                                                     |
| Base UI (Dialog, Select, Popover, Menu, Tooltip, Toast, ScrollArea), default                     | 1 violation: one shared `.base-ui-disable-scrollbar` `<style>`                                  | Clean                                                         | Native scrollbar shows in its scroll areas                                                                                                             |
| Base UI inside `CSPProvider disableStyleElements`                                                | **Clean**                                                                                       | **Clean**                                                     | Scroll lock works (set through `element.style`); every component opened. The one rule Base UI would have inserted goes into our own stylesheet instead |

Reading: UI-1 can be met with no change to the policy, but not with the reference's component mix. Radix (for Dialog, Popover, Menu, Select, ScrollArea) and sonner add violations and lose behaviour. Base UI with `disableStyleElements`, plus a Base UI toast, passes, and Trusted Types look enforceable on that stack. This needs an owner decision (primitive library and toast), recorded below when made.

## 2026-11-19 — Owner decision on A9: Base UI only

The component library uses Base UI only, inside `CSPProvider disableStyleElements`, and Base UI's toast; no Radix and no sonner. UI-1 stays as written. Recorded under D7 in [01](01-decisions.md#d7-the-stack-mirrors-the-reference-application). `require-trusted-types-for 'script'` is to be tried enforced once the Phase 2 shell exists; A9 is repeated through the A1 snippet on the test system.

## 2026-11-19 — Owner decision: test credentials

The rule "agents never type passwords" is softened. Test credentials live in an env file outside the repository (`$OMV_WEBUI_ENV`, by default `~/.config/omv-webui/test.env`, readable only by the owner). Scripts and tests read it. Before an agent types a password or one-time code into a page, it checks the credential is in that file, names the account and target, and asks the owner; a yes covers that session only. Recorded in [07](07-implementation-plan.md) ground rule 2, `AGENTS.md` rule 8 and the agent rules.

A disposable OMV 8 virtual machine exists for Phase 0: VMware Fusion on Apple silicon, Debian 13 arm64, OMV 8.6.1, four empty data disks, snapshots before and after the test accounts were created. Its address is `NAS_HOST` in the env file.

## 2026-11-19 — Owner decision: the owner's own server

The owner's own OMV server may be used for testing under ground rule 2 of [07](07-implementation-plan.md): read-only by default, any change shown to the owner first, no destructive, two-factor, failed-login (`M9`) or package-install test, raw captures kept in `scratch/` and scrubbed before commit, and its name never in the repository. "Never test against a production NAS" is reworded to match in ground rule 2, `AGENTS.md` rule 8 and the agent rules.

For web sign-in the owner creates two accounts for the agent there: a normal account, and an admin account in `openmediavault-admin` that is enabled only for capture runs. Their credentials go in `$OMV_WEBUI_OWNER_ENV` (by default `~/.config/omv-webui/owner.env`). The agent signs in from a separate browser context (Playwright), because OMV refuses a sign-in while another user's session is open in the same browser.

## 2026-11-19 — Owner decision: a UX audit before Phase 2

Before Phase 2, the stock workbench is audited for friction in common jobs (from the OMV source, and read-only on the owner's server), and job-based flows are proposed: one apply at the end, and a plan for a failure partway through. The owner agrees the flows before Phase 2 starts. It runs alongside the Phase 0 checks.

## 2026-11-19 — A1: the nginx snippet (observed on the test VM, OMV 8.6.1, nginx 1.26.3)

Set-up: `scratch/phase0/a1-nginx/` — a placeholder page and two hashed assets in `/var/www/openmediavault-webui/`, the snippet in `/etc/nginx/openmediavault-webgui.d/openmediavault-webui.conf`, and `verify.sh`, which asserts every case below over HTTP and HTTPS.

| Point                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The snippet is included         | OMV's site includes `openmediavault-webgui.d/*.conf` at the end of its server block. OMV's own `headers.conf` is in the same directory, so it is applied at server level too                                                                                                                                                                                                                                                                          |
| `^~ /ui/` wins                  | **Yes.** `/ui/index.html` gets our headers, not the stock `index.html` regex location; `/ui/x.php` and `/ui/rpc.php` are served the app page and never reach PHP                                                                                                                                                                                                                                                                                      |
| Own headers                     | **Yes.** Exactly one CSP, the UI-1 set, no inherited `X-XSS-Protection` or stock CSP. `index.html` and deep links `no-cache`; assets `public, max-age=31536000, immutable`                                                                                                                                                                                                                                                                            |
| Deep links                      | **Yes**, `try_files $uri /ui/index.html`. `$uri/` was dropped: with it, a directory without an index gave 403                                                                                                                                                                                                                                                                                                                                         |
| Stock `error_page 404`          | **Interferes for assets.** A missing asset was redirected (302) to the stock `/#/404` and carried the immutable cache header. Fixed with a named location that returns a plain, uncached 404                                                                                                                                                                                                                                                          |
| `alias` pitfalls                | None with a nested **prefix** location (`^~ /ui/assets/`) instead of the regex one in [06](06-plugin-packaging.md). `..` is normalised before matching                                                                                                                                                                                                                                                                                                |
| `/ui`                           | 301 to `/ui/`; `absolute_redirect off` makes it relative                                                                                                                                                                                                                                                                                                                                                                                              |
| Survives OMV re-deploying nginx | **Yes.** The Salt state manages only its own files (no `clean`). Checked after five applies, including one that rewrote the site file (enabling HTTPS)                                                                                                                                                                                                                                                                                                |
| HSTS                            | OMV sends it only when HTTPS is enabled _and_ forced, from `headers.conf`. `/ui/` responses do not carry it. A static snippet cannot copy that condition, and sending it always would pin hosts whose owner has not forced HTTPS. Proposed: leave it out. With HTTPS forced, the server-level redirect runs before `/ui/`, and every `rpc.php` reply carries HSTS, so the browser receives the policy on the interface's first call. Owner to confirm |
| A broken snippet                | OMV's nginx state runs `nginx -t` before restarting, so nginx stays up on the old configuration. But every apply that touches nginx then fails, with our file named in the error, until the snippet is fixed. The `postinst` guard in [06](06-plugin-packaging.md) is essential                                                                                                                                                                       |

Still open: load the placeholder in a browser (both schemes) for console CSP violations, which is part of repeating A9 through this snippet.

## 2026-11-19 — A2: no parameters, and paging (observed)

- Through `rpc.php`, `params` omitted, `null`, `{}`, `[]` and `""` all behave the same. The proxy turns an empty value into an empty PHP array, and OMV's schema check accepts that as an object. Tried on `System.getInformation`, `WebGui.getSettings` and `Config.isDirty` (whose schema is an object). The transport sends `{}`. (`omv-rpc` on the command line differs: null fails "is not an object".)
- Paging (`UserMgmt.getUserList`): `start` and `limit` are both required. `limit: null` and `limit: -1` return all rows, `limit: 0` none. `total` is always the full count. `sortfield`/`sortdir` work.

## 2026-11-19 — A3: session (observed)

- Cookie `OPENMEDIAVAULT-SESSIONID`: `path=/; HttpOnly; SameSite=Strict`, session-scoped. `Secure` is added **only when HTTPS is forced**, not merely enabled. Logout expires it.
- A second cookie, `OPENMEDIAVAULT-LOGIN-<hash>`, is set on sign-in (60 days, HttpOnly, SameSite=Strict). It only marks that this browser has signed in before, for OMV's "new browser" notification.
- `Session.login` returns `{username, status: "authenticated", permissions: {role}, sessionid}`. The transport must discard `sessionid` (UI-6).
- No session: HTTP 401, "Session not authenticated."
- Idle timeout, with the timeout set to 1 minute: a session polled only with `options.updatelastaccess: false` expired at about 60 s. A session making normal calls stayed alive. The first call after expiry gets 401 "Session expired." and the cookie is cleared; later calls get 401 "Session not authenticated." So `updatelastaccess: false` works as UI-14 needs.

## 2026-11-19 — A6: configuration changes and background tasks (observed)

- `Config.isDirty` takes optional `modules`; with it, the answer is about those modules only.
- The "apply first" error is **HTTP 500, `code` 0, message "Please apply the configuration changes first."** (`ConfigDirtyException`). Only the message text identifies it. Seen on `Cron.execute` with the cron module dirty.
- `applyChangesBg` and `revertChangesBg` (`{filename: ""}`, as the stock interface sends) return a task handle (a server path). `Exec.getOutput {filename, pos[, length ≥ 1024]}` returns `{filename, pos, output, pendingOutput, running}`. `output` is the text since `pos`. The poll that reports `running: false` with nothing pending is the last one: OMV then deletes the status file, and any further `getOutput` or `isRunning` on that handle is HTTP 500 "Failed to open file". The task helper must take the result from that poll and never poll again.
- A task's return value is its output: for an apply, a JSON list of the modules deployed (`["cron"]`). The stock interface parses it the same way. Revert returns no output.
- A failed task (a command exiting non-zero, or a failed apply) makes `getOutput` itself return HTTP 500. The message holds the whole command output: for a failed apply, the complete Salt log. The interface needs a short summary with the full text behind a "details" control.
- After a failed apply, every module stays dirty, though some were deployed.
- `Exec.stop` returns null, and the handle is gone afterwards. `Exec.enumerate` lists running tasks (empty when idle).

## 2026-11-19 — A8: error replies (observed)

Every error is `{"response": null, "error": {"code": 0, "message": …, "trace": …}}`. `code` is 0 throughout, so the HTTP status and the message are the only signals. Every error carries a stack trace (Low), which the transport drops (UI-9).

| Case                               | HTTP | Message                                                                                                                                                                  |
| ---------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wrong password                     | 400  | Incorrect username or password.                                                                                                                                          |
| Validation failure                 | 400  | `<field path>: <reason>`, e.g. `port: The value '99999' is bigger than 65535.`; a missing required field gives an empty path (`: Missing 'required' attribute 'limit'.`) |
| Forbidden for role                 | 403  | Invalid context role.                                                                                                                                                    |
| No session / expired               | 401  | Session not authenticated. / Session expired.                                                                                                                            |
| Unknown method or service          | 404  | The method '…' does not exist for the RPC service '…'. / RPC service '…' not found.                                                                                      |
| Backend exception (missing object) | 500  | e.g. The user '…' does not exist.; for a missing UUID, the raw XPath query text                                                                                          |
| Body not JSON, or `method` missing | 500  | Failed to get the RPC parameters. / `: Missing 'required' attribute 'method'.`                                                                                           |

A normal user calling `System.getInformation` gets a reduced object (`ts`, `time`, `hostname`). Behaviour relevant to H1 was seen as the review describes; no detail here.

## 2026-11-19 — A4: number shapes in the first operations (observed)

Surveyed by `scratch/phase0/rpc/a4_survey.py` on the VM, with one ext4 file system on a data disk and one shared folder.

- **Numeric strings:** `System.getInformation` `memTotal`, `memFree`, `memUsed`, `memAvailable` (bytes) and `memUtilization` (a fraction, `"0.08314"`). `FileSystemMgmt.getList` `size`, `available`, `blocks`. `DiskMgmt`/`Smart.getList` `size`. `Network.enumerateDevices` `mtu` and every `stats.*` counter (`rx_bytes`, `tx_packets`, …).
- **Formatted text, not a number:** `FileSystemMgmt.getList` `used` (`"2.03 MiB"`), beside `available` and `size` in bytes.
- **String or numeric string:** `temperature` (`""` when unknown, `"30"` otherwise).
- **Number, int or float by value:** `cpuUtilization` (`0`) and `getCpuStats.utilization` (`0.5`); `uptime` and `loadAverage.*` are floats. The contract says `number`.
- **Never numbers:** `serialnumber`. On the VM's virtual SATA disks it is 20 digits, beyond 2^53, so parsing it would corrupt it. It is also personal data on a real system, so it is scrubbed in every capture.
- **Booleans** arrive as JSON booleans in all of these; no `0`/`1` flags were seen.
- **Beyond 2^53:** no counter came close on the VM. The candidates are `stats.rx_bytes`/`tx_bytes` (64-bit kernel counters), and those arrive as strings, so nothing is lost on the wire. Proposed: the DTO keeps counters and byte sizes as strings, matching the wire. The normaliser turns sizes into `number` (exact below 2^53, about 9 PB) and computes rates from counters in `bigint` or by difference, so precision is lost only for display.
- `cpuModelName`, `cpuCores` and `cpuMhz` are `null` on this arm64 VM, so the contract allows null.

## 2026-11-19 — A7: numeric data for charts (observed and read from source)

- **No history is available as numbers.** `Rrd` has only `generate` (a task running `omv-mkrrdgraph`) and `getGraph` (a PNG path); `PerfStats` is just the collectd on/off setting. The numbers behind the graphs (collectd RRD files) cannot be read through any RPC method.
- **Current values are available:** CPU utilisation (`System.getCpuStats`, `getInformation`), memory, load average, uptime, and per-interface cumulative byte, packet, error and drop counters (`Network.enumerateDevices` `stats`, which changed between two reads 5 s apart). There is also file system size and free space (`FileSystemMgmt.getList`) and disk temperature (`DiskMgmt`/`Smart.getList`). There are no disk I/O counters.
- So a chart over time can only show what the page sampled while open, polling with `updatelastaccess: false`. Longer history would need either the PNG graphs (pre-rendered images, which the design avoids) or a backend addition (ruled out). **Needs an owner decision** on what the dashboard shows.

## 2026-11-19 — A5: a link from the stock interface (read from source; not yet tried)

Navigation entries (`navigation.d/*.yaml`, `type: navigation-item`, fields `path`, `text`, `icon`, `url`, `position`, `permissions`, `hidden`) are followed with the Angular router (`router.navigate([item.url])`), so their `url` can only be a route of the stock application; `/ui/` would land on its 404 page. The stock application has an `externalRedirect/:url` route whose resolver opens the decoded URL in a new tab (`window.open(url, '_blank', 'noopener')`). A navigation entry with `url: "/externalRedirect/%2Fui%2F"` is the candidate. Still to check in a browser on the VM: whether the router double-encodes the parameter, and how a new tab rather than the same tab feels.

## 2026-11-19 — A11 (part): files survive OMV's own tooling (observed)

With the snippet and placeholder in place: `omv-mkworkbench all` and `apt-get install --reinstall openmediavault` (8.6.1-1; no newer OMV release was available) left the snippet byte-identical and the files under `/var/www/openmediavault-webui/` intact, and `verify.sh` passed on HTTP and HTTPS afterwards. Still to do: a real OMV upgrade when one is published, and removal, once there is a package (Phase 4).

## 2026-11-19 — Owner decisions after the first results

- **Typing test passwords:** for this repository an agent may always type a password or one-time code from the env files into a sign-in page of a test target, without asking each session. They are still never printed or committed. Ground rule 2, `AGENTS.md` rule 8 and the agent rules updated.
- **The mock first:** the owner wants to rely more on MSW than on the VM. Screens and their states are verified on the mock; the VM is used for what only a real backend shows (headers, CSP, sessions, tasks, writes read back) and for the captures that examples are drafted from. Ground rule 2 and the verification rule updated.
- **The owner's server has only the owner's administrator account.** There is no separate account for the agent. Ground rule 2 now says the agent signs in with the account in `$OMV_WEBUI_OWNER_ENV` from a fresh browser context, read-only.
- **A10:** the agent chooses the two-factor plugin. It installs omv-extras on the VM if needed, captures the login and verify shapes once, and the two-factor screens are then verified against MSW examples built from those captures.
- **HSTS** is not repeated in the snippet, as proposed under A1.
- **Charts** show only what the open page has sampled (A7). There is no history.

## 2026-11-19 — A9 repeated through the A1 snippet (observed)

The A9 spike build was served from `/var/www/openmediavault-webui/` through the A1 snippet on the VM, over HTTP and HTTPS, and driven by Playwright (`scratch/phase0/browser/a9_vm.mjs`, a fresh browser context per route). For this run only, the snippet also sent `Content-Security-Policy-Report-Only: require-trusted-types-for 'script'`. The results match the local run exactly. Every page shows sonner's two module-load violations, because the spike bundles it. The Base UI page with `disableStyleElements` adds nothing above that. Base UI without it adds one. Radix adds five, plus four Trusted Types reports (`innerHTML` and its `[data-radix-]` style elements). Nothing else produced a Trusted Types report. Deep links load, scripts run, and there are no page errors. This also completes A1's browser check. Still open: enforcing Trusted Types once the Phase 2 shell exists.

## 2026-11-19 — A5: a link from the stock interface (observed)

A navigation entry in `/usr/share/openmediavault/workbench/navigation.d/`, followed by `omv-mkworkbench all`, appears in the stock menu (shown at the bottom with `position: 95` and an external-link icon):

```yaml
version: "1.0"
type: navigation-item
data:
  path: "webui"
  position: 95
  text: "New web interface"
  icon: "mdi:open-in-new"
  url: "/externalRedirect/%2Fui%2F"
```

Clicking it as an administrator opened `/ui/` in a **new tab**, and the stock tab stayed on its page. The router does not double-encode the parameter. This is the entry Phase 4 ships, with "Open the classic interface" as the matching link back. Without `permissions`, every signed-in user sees it, which suits the new interface.

## 2026-11-19 — A10: sign-in with a second factor (observed with openmediavault-2fa-totp)

Set-up: omv-extras installed on the VM (its install script read first), then `openmediavault-2fa-totp`; the other two-factor plugin offered is `openmediavault-2fa-emailotp`, not tried (it needs mail). The second-factor test account (`OMV_2FA_USER` in the env file) was enrolled with `TfaTotp.preEnableByContext` / `enableByContext`; its secret is in the env file as `OMV_2FA_TOTP_SECRET`, so scripts can make codes (RFC 6238: SHA-1, 6 digits, 30 s, one window of drift each side).

- No second factor: `Session.login` → `{username, status: "authenticated", permissions: {role}, sessionid}` (as in A3).
- With TOTP: `Session.login` → HTTP 200 `{username, status: "challengeRequired", challenge: {kind: "totp", redirecturl: "/tfatotp/<user>"}}`, a session cookie, no `sessionid`. `redirecturl` is a route of the stock interface; the new interface must not follow it (UI-3). It shows its own code form for each `kind` it knows and, for an unknown `kind`, says to use the classic interface.
- `Session.verify` with `{code}` (what the stock page sends, plus the user name) → `{status: "authenticated", username, permissions, sessionid}`, and the "new browser" cookie is set then.
- **Any other call while the challenge is pending discards it**: it gets 401 "Session not authenticated.", and a following `verify`, even with the right code, gets 401 "No pending login or the login has expired." The interface must make no backend call between sign-in and verify: no polling, no prefetching.
- Wrong code: 400 "Challenge verification failed." From the third failure on: **429** "Too many failed verification attempts. Please try again later.", for `verify` and for a new `Session.login` of that user, with no `Retry-After` and no remaining time in the reply (only in the server log). The delay doubles from 5 s to at most 300 s and resets after 15 minutes (read from source). The pending login lives 5 minutes.
- `verify` with no pending login: 401 "No pending login or the login has expired."
- The MSW examples for the two-factor screens are drafted from these replies; the screens are then verified on the mock.

## 2026-11-19 — Phase 0 closed (owner decision)

Every row from A1 to A10 has an observed, dated result above. The owner accepted the two open remainders as deferred, and Phase 0 is closed:

- **A11, partly:** the files survive `omv-mkworkbench` and an OMV reinstall (observed). The check across a real OMV package upgrade waits for an OMV release, and the removal check waits for the package. Both move to Phase 4 and are added to its acceptance in [07](07-implementation-plan.md#phase-4--packaging).
- **A9, Trusted Types:** UI-1 holds on the chosen stack, and Trusted Types reported nothing beyond what the rejected libraries caused. Enforcing `require-trusted-types-for 'script'` is tried on the real shell in Phase 2 and is added to its acceptance in [07](07-implementation-plan.md#phase-2--design-system-and-application-shell). If it passes, the header joins UI-1; if not, the cause is raised with the owner.

Tested on: the test VM, OMV 8.6.1.

## 2026-11-19 — Phase 1: workspace, contract pipeline, transport

Built on branch `phase-1`. What the design left open, and what was found:

- **Workspace.** `web/` with the seven packages, versions from the reference's catalog. `happy-dom` is `^21.0.4`, not the reference's `^20.14.5`: older versions carry two high advisories (`pnpm audit`). `.npmrc` sets `ignore-scripts` and `pnpm-workspace.yaml` allows no builds (UI-11). The app, `css-ui-style` and `react-ui-components` are stubs until Phase 2, so `pnpm dev` and `dev:mock` do not exist yet. Pre-commit hooks (husky, lint-staged) are not set up.
- **Lint rules for UI-2, UI-3, UI-5, UI-6, UI-10, UI-13** (`ts-app-tooling/eslint.security.js`), with a test per forbidden pattern. Inline `eslint-disable` comments are switched off for the whole workspace (`noInlineConfig`), so an exemption is a reviewed block in the preset (docs/08, UI-2).
- **Examples are raw replies.** They are what rpc.php sent, scrubbed, and the mocks serve them as they are, so the transport's normalisation is exercised by every test. Lint validates them through a lint-only preprocessor that lets every object schema accept `[]`, PHP's empty map; the bundle skips it.
- **Validation without a schema library.** The transport's normaliser and development-build validator walk the slimmed schemas in the generated operation table. A JSON-schema library would add a runtime dependency, and the usual one compiles validators with `new Function`, which UI-1's `script-src 'self'` blocks.
- **Session replies are pruned to the contract.** `sessionid` and `challenge.redirecturl` never leave the transport, so no page can read them (UI-3, UI-6).
- **Task handles are enforced in the transport** (UI-5): an `Exec` call with a handle no task-starting call returned is refused without a request. The task registry's snapshots carry its own id, never the handle.
- **The "configuration is dirty" refusal** is recognised by its English message (A6). A server set to another language would translate it, and the refusal would read as an ordinary failure. Noted in `RpcError.ts`.
- **Observed while capturing** (OMV 8.6.1): a shared folder with no privileges reports `privileges` as `""`, not `[]` or `{}`; `SSH.set` marks `ssh` and `avahi` dirty (not `zeroconf`, as the source suggested); `applyChangesBg`'s result is the JSON list of modules deployed. The `Exec.isRunning` example is written by hand, because capturing it can delete the task.
- **`Session.verify`** accepts only `{code}`, six digits: OMV's core declares `challengeresponse` of type any and hands everything to the two-factor plugin. `tools/contract-drift/accepted.json` records this as the one accepted divergence.
- **Drift in CI** runs against openmediavault `babf50d` (upstream `master`, changelog 8.6.2-1), the tree the request schemas were read from. The VM runs 8.6.1. Both versions agree for these operations.
- **`EXCLUDED.md`** lists the methods left out for design reasons. The methods behind `M2` and `M3` are not named there, since a name beside its review ID points at an unfixed weakness (rule 3); the list stays private, and none of them is in the contract. This departs from docs/05's wording for `M3` ("the affected operations are in `EXCLUDED.md`"); owner to confirm.
- **Acceptance:** each first operation succeeds against the VM through the generated client, with development-build validation reporting no mismatch (`pnpm test:vm`, 8 tests: administrator, user, second factor, signed out); the same transport, task and query tests pass against the mock (116 tests); contract lint and drift are clean; a `url` not in the operation table throws before any request.

Tested on: the test VM, OMV 8.6.1, and the mock.

## 2026-11-20 — Owner decisions: excluded methods, the UX audit, the RAID and ZFS plugins

- **`EXCLUDED.md` and `M2`/`M3`: confirmed.** The methods behind review IDs are not named in `EXCLUDED.md`; the owner holds the list. docs/05 (the `M3` row) and docs/04 ("Excluded methods") are reworded to say so.
- **The UX audit moves into the repository** as [design/ux-audit.md](design/ux-audit.md). Before the move, two source citations were made less specific and the audit's list of possible OMV issues was removed (rule 3); those are held privately by the owner. The flows are the starting design for Phase 5.
- **The audit's open questions**, answered:
  - Q1: Flow A ("Add storage and share it") stays one flow, with a visible "Mount the new file system" checkpoint.
  - Q2: a flow refuses to start while other changes are pending, and offers to apply or undo them first (R1).
  - Q3: EXT4 is the default for one disk; multi-disk BTRFS is its own flow, with RAID1 as the default.
  - Q4: new shared folders get mode 770, so only the people given access can reach them. This differs from the classic interface (775), and Flow A's summary says so.
  - Q5: new accounts get no login shell unless "SSH access" is ticked.
  - Q6: "Anyone on the network, without a password" is offered in Flow A, as a separate, explained choice.
  - Q7: after turning on HTTPS, the page may show a link to the new address, built from the current host name and the chosen port. The owner reads this as allowed under UI-3, because nothing in it comes from a reply or a URL. The page says it cannot confirm the result from the old address.
  - Q8: version 1 supports both the RAID plugin (`openmediavault-md`) and the ZFS plugin (`openmediavault-zfs`), shown only when installed. This is an exception to docs/01's open question 1, which is updated. The ZFS plugin's methods are read from its own source before its contract entries are written.
  - Q9: the effective access to a folder (`ShareMgmt.getFileACL`, which reads the disk) is shown only on that folder's own page.
  - Q10: "Waiting" joins the task states (style guide 5.7), with the Unknown treatment.
  - Q11: the first sign-in shows a short set-up checklist built from server state, in place of the stock welcome panel.

## 2026-11-20 — Owner decisions before Phase 2

- **Navigation before the pages exist:** the side navigation shows OMV's full menu from the start (System, Network, Storage, Services, Users, Diagnostics), filtered by role. An item whose page is not built yet opens a short "Not in the new interface yet" page with a fixed link to the same page in the classic interface. Each item switches over as its page is built.
- **The job runner and Pattern G in Phase 2** (UX audit section 5, item 4): both are built as presentational components in `react-ui-components`, with a story for every state: the step list (Waiting, Running, Succeeded, Failed, Cancelled), the pre-flight notice (R1), the failure and retry states (R6, R7) and the "Used by" panel. Nothing is connected to a real flow until Phase 5.
- **The set-up checklist (Q11)** is built in Phase 3, with the dashboard. Phase 2 leaves a place for it on the landing page.
- **Commits on `phase-2`:** one signed-off commit per finished part, each after the test battery passes. The pull request is opened when the acceptance criteria are met.

Defaults taken without a question, open to change:

- The idle warning reads OMV's timeout through `WebGui.getAutoLogoutSettings`, which every signed-in user may call (read from source; to be captured on the VM before its contract entry is final).
- Second factor: only the `totp` kind gets a code form (A10). Any other kind, including the e-mail code plugin, gets the "use the classic interface" fallback.
- The top bar's notifications are the task registry's tasks (running and recently ended). OMV has no server-side notification feed to show.
- The squircle radii are proposed in `design/preview.html` and shown to the owner as a Chromium screenshot before they enter `tokens.css`.
- Runtime dependencies added in Phase 2, all from D7 or the shadcn pattern it names: TanStack Router, Base UI, lucide, class-variance-authority, clsx, tailwind-merge, i18next with react-i18next, zustand, react-hook-form, and the Fontsource packages for Inter and Roboto Mono. Each is justified in the pull request (UI-11).

## 2026-11-20 — Owner decision: squircle radii

The owner approved the proposed squircle radii after seeing the comparison in `design/preview.html` (light and dark, Chromium): 10px for controls and 14px for cards, dialogs, menus and toasts, in place of the round 6px and 8px where `corner-shape: squircle` is supported. Elsewhere the round radii stay.

## 2026-11-20 — Owner decisions after the component review

A UX review of `react-ui-components` (commit `d202d21`) raised three questions:

- **Steps that never ran** after a failed step keep the word Waiting, because a retry would run them, and the failure notice says how many did not run ("3 steps did not run"). No new task word.
- **One verb for discarding pending changes: "Undo".** The pending-changes banner reads "Apply 3 changes" and "Undo 3 changes", and the job runner uses the same verb. Style guide 5.8 changes from "Revert" to "Undo"; the backend method is still `Config.revertChangesBg`.
- **Undo asks first.** A plain confirmation names what is lost ("The saved changes to SMB, SSH and Network are discarded"), with focus on Cancel. No typed confirmation, since no data on disk is lost.

## 2026-11-20 — Phase 2: app scaffold and sign-in

Built on branch `phase-2`, verified on the mock; the VM run follows with the shell.

- **Learning whether a session exists on load:** two reads in parallel, `System.getInformation` and `UserMgmt.getUserByContext`. A 401 (or no answer) from the first shows sign-in. OMV has no read that returns the role, so the role comes from the shape of `System.getInformation`: only an administrator gets the full answer (the schema says so). The role only changes what is shown; the backend enforces. The user name comes from the second read; if it fails, the session still stands. The session (name, role) lives in memory only.
- **Reloading during the second-factor step** cancels the pending login, because the load-time reads count as "any other call" (A10). The person signs in again.
- **The idle clock** follows the server's notion of activity: the transport now emits an event after each foreground call the server answered (anything but a 401). Background calls, failures and downloads do not count, which matches OMV's last-access handling read from source. The warning opens 60 s before the end (or halfway, for a timeout under 2 minutes). "Stay signed in" is one foreground read. When time runs out, the app checks with background reads, which cannot extend the session. It never calls `Session.logout` on its own, so it does not end the user's other tabs.
- **New contract examples:** the 429 and 401 replies of `Session.login`, `Session.verify` and `System.getInformation`, from the messages observed in A3, A8 and A10. A normal user's sign-in reply is written by hand from the administrator capture and says so.
- **Locked accounts (M9):** after a second wrong password the page explains, by class only, that the server can lock an account, that waiting does not unlock it, and who can. Wording approved by the owner, with the title "Check the password before trying again".
- **Mock scenarios** (administrator, user, second factor, wrong password, too many attempts, session expired, pending changes) are picked in `pnpm dev:mock` only. The production build was checked: one external module script, no inline script or style, fonts bundled, no mock code.
- Router scroll restoration is off: it wrote visited paths to `sessionStorage`.

## 2026-11-20 — Phase 2: the shell

Built on branch `phase-2`, verified on the mock and in the browser test; the VM run follows.

- **Navigation** is read from the stock `navigation.d/*.yaml` (OMV source) into one fixed table. An administrator sees System, Network, Storage, Services, Users, Diagnostics and Account in the stock order, plus one "Add-ons" entry that points to the classic interface. A normal user sees the Dashboard and Account, as in the stock interface. Every item opens `/$group/$item`, whose two segments can only select an entry of that table (anything else is "not found"); the classic link is the entry's literal path (UI-3, UI-4). A normal user who types an administrator's address gets a plain "only administrators" page; the backend enforces.
- **Pending changes** are read from `System.getInformation` (`dirtyModules`) as a background poll every 20 s for administrators, so the poll cannot keep a session alive (UI-14). Module ids are shown as plain names (41 ids, from the engine modules and the Salt deploy states); an unknown id is shown as itself. The apply confirmation warns that the connection may drop when `systemd-networkd`, `nginx`, `phpfpm`, `certificates` or `iptables` is pending. Apply and Undo run as tasks; Undo asks first. A failed apply keeps the band in its failed state with "Try applying again" and the full output behind "Show what happened" (A6, R7). The failed-apply example is written by hand from the A6 observation and says so.
- **The HTTP notice** (UI-12) links an administrator to the classic interface's web-interface settings; a normal user is told to ask an administrator.
- **Tasks** carry start and end times, and an ended task stays in the top bar's tasks menu until dismissed (style guide 5.7).
- **The About dialog** says the interface is an unofficial community plugin and links to upstream openmediavault. That link is allowed by name in the build check: it is a fixed link the reader follows, never a request.
- Found while testing: moving focus to the page title failed under React's StrictMode; the test harness now renders in StrictMode so tests catch it.

## 2026-11-20 — Phase 2 on the test VM (observed)

The production build of `0a47e7a` was deployed to the test VM (OMV 8.6.1, nginx 1.26.3) in `/var/www/openmediavault-webui/` (root-owned, not writable by `www-data`), behind the committed snippet (`nginx -t` passed). The new VM browser test (`web/apps/omv-web-app/e2e/vm`, `pnpm test:browser:vm`; never in CI or `make test`, skipped without the env file) drives it over HTTP against the real `rpc.php`, twice: with the VM's own headers, and with `require-trusted-types-for 'script'` added to every document and asset reply by route interception. It shares the mock browser test's violation observer.

- **Journeys, both header sets, all passed:** an administrator signs in and out with the keyboard only (the skip link is the first stop, then the top bar, the HTTP notice and the navigation, and Tab leaves the page and comes round, so no trap; Enter follows links and opens menus, Escape closes them and returns focus) and again with the pointer; host name in the top bar; the full menu; a classic-only page with no call but the background poll; the tasks and user menus. A normal user sees the reduced menu and, typing an administrator's address, the "only administrators" page. The env file's second-factor account (a normal user) signs in with a code made in the test; nothing is called between `Session.login` and `Session.verify`. The headers on `/ui/`, `index.html`, a deep link, an asset and a missing asset match the snippet, with one policy each.
- **An administrator with a second factor:** a temporary administrator, with a password made in memory, was enrolled in TOTP through `TfaTotp.preEnableByContext` / `enableByContext` for the run only, passed the same journey, and was deleted afterwards with its TOTP entry. The test takes such an account from `OMV_2FA_ADMIN_*` and skips the journey without one.
- **The user name** from `UserMgmt.getUserByContext` shows in the user menu, for every account.
- **Trusted Types enforced on the real backend:** no report, no page error, every journey passes. The canary (an inline script added after load) is reported as `require-trusted-types-for`, so the enforcement was in force. The header can join UI-1 (owner to decide).
- **The idle warning,** with the timeout set to 2 minutes for the run: it opened about a minute before the end, with the background poll running, and "Stay signed in" kept the session past the original end. The timeout was put back and applied.
- **Allowed console errors on the real backend, each listed in the test:** the 401 of the signed-out probe (as on the mock), and, over plain HTTP only, Chromium's "Cross-Origin-Opener-Policy header has been ignored" for each document, because COOP applies only on a potentially trustworthy origin. The header stays: it applies as soon as the page is served over HTTPS.
- **A harness detail:** a document fulfilled by route interception has no network address, so Chromium's Local Network Access check blocked its calls to the VM's private address. Only the interception project switches that check off; the real-headers project shows the page as served.

## 2026-11-20 — Trusted Types joins UI-1

Per the owner's decision when Phase 0 closed ("If it passes, the header joins UI-1"), `require-trusted-types-for 'script'` is now part of the UI-1 policy in [05](05-security.md) and in every `Content-Security-Policy` of the snippet. [06](06-plugin-packaging.md) now points at the committed snippet instead of embedding a copy that had drifted. The browser tests no longer add the header themselves: each runs one project with the snippet's own headers, and the shared canary must see both a Trusted Types violation and an inline-style violation, so enforcement is proven in force.

The build and the new snippet were deployed to the test VM (`nginx -t` passed) and `pnpm test:browser:vm` was run with a temporary administrator with a second factor, deleted afterwards:

- **HTTP:** 7 passed, 1 skipped (the idle test, which needs a short timeout; it passed earlier today).
- **HTTPS** (`OMV_WEBUI_VM_SCHEME=https`, the VM's self-signed certificate): 7 passed, 1 skipped. Chromium's "Cross-Origin-Opener-Policy header has been ignored" error does not appear over HTTPS; the test allows it for an `http:` origin only, so its absence is checked.

## 2026-11-20 — Owner decisions before Phase 3

PR #6 (Phase 2) was approved and merged to `main` with a rebase. Phase 3 is built on `phase-3`. The backend facts behind these questions were read from OMV's source (8.6.x) and are captured on the VM before their contract entries are final.

- **The set-up checklist (Q11)** is shown to administrators while OMV's own welcome flag is set (`displayWelcomeMessage` in `System.getInformation`). "Hide the checklist" calls `WebGui.dismissWelcomeMessage` after the click. That hides it for every administrator and every browser, and hides the stock welcome panel too, which matches "in place of the stock welcome panel".
- **The factory password:** OMV has no way to report whether the `admin` password is still the factory one. The checklist shows "Change the factory password" as advice, with a link to the password form, and says in words that the interface cannot check it. It has no done state.
- **E-mail alerts:** `EmailNotification.get` is the only read that tells whether alerts are set up, and it returns the mail password in plain text. The checklist reads it. The password is left out of the contract's response schema, and the transport removes it from the reply before anything is cached or rendered. The item is done when the server's own test passes: alerts enabled, and server, port, sender and primary address set.
- **Host name and time zone:** the installer sets both, so "not done yet" cannot be detected. The checklist shows the current values ("Your NAS is called …", "Time zone: …") with a Change link, and no done state.
- **The account page** shows name, description, e-mail and SSH keys. E-mail and description can be edited when the account allows it: not `_readonly`, and not a system account such as `admin`, for which OMV refuses the change. The password change (typed twice) is offered to every account and hidden when `_readonly` is set. The backend does not check that flag for a password change; the interface honours it anyway.
- **The shared-folders table** is read-only in Phase 3. Creating a folder is Flow A in Phase 5. Until then, the empty state's action and the toolbar's Add are fixed links to the classic interface's shared-folder page, marked as opening the classic interface.
- **SSH "extra options"** sits under a collapsed "Advanced" section. Its help text says the lines are written into the SSH server's configuration and that a mistake can stop SSH from starting. The section opens by itself when the field already holds text.

Defaults taken without a question, open to change:

- **Table state** (page, sort, search) lives in memory, not in the address. UI-4 does not let a query string carry free-form parameters to a call.
- **The updates item** uses `availablePkgUpdates` from `System.getInformation` and links to the classic interface's updates page. Phase 3 does not add `Apt.update` (a task). A count of 0 can also mean the package list was never fetched, so the item does not claim "up to date" with certainty.
- **HTTPS** is read from `WebGui.getSettings` (`enablessl`). No certificate method is added in Phase 3.
- **The checklist's links** go to a page of the new interface where one exists (the account page for the password), and otherwise to the classic interface by a fixed link.
- **Route-level code splitting** comes with the Phase 3 pages, for the main-chunk size warning.

## 2026-11-20 — Phase 3: the contract additions and the page design

**Contract.** Seven operations were added, each read from source and captured on the test VM where a capture was possible: `Network.getGeneralSettings`, `System.getTimeSettings`, `EmailNotification.get`, `WebGui.getSettings`, `WebGui.dismissWelcomeMessage`, `UserMgmt.setUserByContext` and `UserMgmt.setPasswordByContext`.

- **`x-omv-omit`**, a new operation extension, lists reply fields the transport deletes as soon as the reply is accepted. The deletion comes before normalisation, the development-build validation and its warnings, the query cache and the caller. `EmailNotification.get` uses it for the mail password, and `UserMgmt.setUserByContext` for the `password` it echoes. A lint rule refuses an omitted field that the reply schema declares. The raw examples keep the field with the placeholder `EXAMPLE-PASSWORD`, so every test on the mock proves the field is removed. Documented in [03](03-rpc-transport.md) and [04](04-api-contract.md).
- **`UserMgmt.setUserByContext`'s request** carries `email` and `comment` only, with no `password`, and nothing else is accepted. The interface sends passwords through `setPasswordByContext` alone.

**Observed on the VM** (OMV 8.6.1):

- `UserMgmt.setPasswordByContext` changes the password at once, but it also leaves `postfix` pending for any account OMV keeps in its database. So the operation carries `x-omv-dirty`.
- `UserMgmt.setUserByContext` refuses a system account (`admin`) and an account marked read-only with HTTP 500, code 0.
- `WebGui.dismissWelcomeMessage` returns `null`, and a second call returns `null` again.
- The VM was put back as it was: the captures' changes were undone without applying them, the welcome marker file was restored exactly, and the temporary account was deleted. The test user's password hash was rewritten to the same password with a new salt.

**Tooling.** The contract bootstrap tool used to drop OMV's "e-mail or empty" `oneOf` silently. It now keeps the alternatives, and the drift check compares each one. The source reader read only the first service class in a file and now reads each class. The scrubber replaces e-mail addresses and any `password` value. The capture tool can make a change, capture, and then discard what it changed.

**Page design:** [design/phase-3-pages.md](design/phase-3-pages.md). Owner decisions on its questions:

- The checklist's HTTPS item has **no link**. It says to use an `https://` address and gives the port as text. A link built from a reply's port would break UI-3.
- The shared-folders page **may read every folder** a second time, to show how many cannot be reached. If that read fails, the count is left out.
- Pending changes caused by an account change (`postfix`, and `ssh` for an account with keys) are **accepted and recorded here**. When an administrator's own account change causes them, the success message says changes wait to be applied. The pending band is unchanged.
- Accepted as designed:
  - hiding the checklist asks first;
  - "Restart needed" is a Warning pill;
  - a dashboard row appears when the NAS clock and the browser's clock differ by more than 5 minutes;
  - one "Your account" menu item replaces the stock "Settings" and "Password" items.

**A Phase 2 defect, found by the design review:** the classic interface routes with a hash (`useHash: true`), but the navigation table's classic links had no `/#`. On the VM, `/system/date-time` redirects to the classic interface's 404 page. Every classic link moves to the `/#/…` form in Phase 3.

## 2026-11-20 — Phase 3: the pages, on the mock and the test VM

Built on `phase-3` to [design/phase-3-pages.md](design/phase-3-pages.md), with the owner's decisions above. The owner was away for the last part and asked for the recommended answer to each open point. Those answers are marked _(recommended)_.

- **Pages.** The Dashboard with the set-up checklist and the attention list, Services > SSH, Storage > Shared Folders (read-only) and "Your account". Their navigation items open the new routes. The shell now mounts the library's toaster; nothing had mounted it before.
- **Shared-folder table state** (page, sort, page size, search) is kept in a small in-memory store, cleared when the session ends. It is not in Zustand, which holds preferences only, and not in the address (UI-4). The search is sent 300 ms after typing stops. When the list shrinks, the table moves back to the last page that exists.
- **The checklist's HTTPS item** gives the port as text ("The secure connection uses port …"). This puts the bare string `https://` in the bundle, so the build check's allow list names it, with the reason: it is display text that nothing fetches or opens.
- **The main chunk** was 503 kB. Route splitting was already on; the cause was the component library's barrel, which did not declare itself free of side effects. `"sideEffects": false` in `react-ui-components/package.json` _(recommended)_ brings the entry chunk to 281 kB, with each page in its own chunk.
- **`SecretField`** now passes a caller's `ref` on to its input _(recommended)_. Before, the ref was dropped silently.
- **`ShareMgmt.getList`'s `status`** is open to any string _(recommended)_. A code a later OMV adds is shown as Unknown instead of failing the development build's check.
- **`Network.getGeneralSettings`** stays in the contract, though no page uses it yet _(recommended)_. The checklist reads the host name from `System.getInformation`, and the Phase 5 network page will use this operation.
- **Fixed in the browser test's mock:** `SSH.get` was keyed under the wrong operation id, a Phase 2 slip that no test had reached.

**On the test VM** (OMV 8.6.1), the final build was deployed behind the committed snippet (`nginx -t` passed), and `pnpm test:browser:vm` ran:

- **HTTP:** 9 passed, 2 skipped.
- **HTTPS:** 9 passed, 2 skipped.
- **The skips** are the same as before: the administrator with a second factor (it needs a temporary account) and the idle warning (it needs a short timeout).
- **The Phase 3 acceptance journey** passed: sign in, change an SSH setting ("Compress data"), save, apply, watch the task finish, reload, and see the new value, also in `SSH.get`'s reply. The test then puts the old value back and applies again. It skips itself when changes are already pending, because applying is global.
- **The table:** the backend is asked for exactly the page, sort, page size and search shown, and the range shown matches its reply.
- **A normal user** sees their account page, and is refused the SSH and shared-folder pages with no `SSH.get` or `ShareMgmt.getList` call.
- **Afterwards** nothing was pending, compression was off as before, and the welcome flag was still set.

**A browser pass on the mock** covered every Phase 3 page, both themes, 1280 and 375 px, the keyboard and the console. It found one defect, now fixed. With no shared folders, at 375 px, the page scrolled sideways and the empty state's text was clipped. There were two causes:

- **The page scroll:** the visually hidden "(opens in a new tab)" text escaped the table's scrolling frame, because the frame was not positioned.
- **The clipped text:** a state row was centred on the table's full width instead of the frame's visible part.

The table frame is now `relative` and a container, and a state row is as wide as the frame's visible part and stays there while the table scrolls. Left as they are:

- the read-only account shows its "locked" sentence under both Details and Change password, as the design's table says;
- a mismatched password pair clears both fields.

## 2026-11-21 — Owner decisions after Phase 3

- **Phase 5's domain order** in [07](07-implementation-plan.md#phase-5--coverage-by-domain) is confirmed as written.
- **Phase 4 (packaging) comes first.** The owner said "go ahead" without naming a phase. Phase 4 was taken first _(recommended)_: it is small and fully specified, it turns the hand deployment into the package, and it unblocks the real OMV upgrade check (A11), now that a newer OMV is published.

## 2026-11-21 — Phase 4: the package, on the test VM

Built on `phase-4`, following the owner's spindown plugin for `debian/` and the `Makefile` targets.

- **The package.**
  - **Build:** `make build` then `make docker-deb` (or `make deb` on a Debian 13 host). It builds in a Debian 13 container from the bundle already built, and runs lintian, with no errors or warnings. CI does the same on every pull request and keeps the `.deb` as a build artifact.
  - **Contents:** the bundle in `/var/www/openmediavault-webui/` (root-owned, directories 0755, files 0644), the snippet, the menu entry, and in `/usr/share/doc` the README, the machine-readable copyright (the bundled libraries and fonts by licence, the OFL text in full) and `openapi.json.gz`.
  - **Lintian overrides:** files under `/var/www`, the `Plugin-Section` field, and fonts in a non-font package, each with its reason.
- **The snippet is a symbolic link** in `/etc/nginx/openmediavault-webgui.d/`, pointing at `/usr/share/openmediavault-webui/nginx/` _(recommended)_. As a regular file under `/etc` it would be a conffile. It would then survive `remove`. And once `postinst` had deleted a broken one, dpkg would never install it again. [06](06-plugin-packaging.md) is updated.
- **`postinst`** puts the link back if an earlier failed configure removed it. It then tests the whole nginx configuration and reloads only if the test passes. On failure it removes the link, reloads if what is left passes, says whether the snippet or something else is at fault, and leaves the package unconfigured.
- **Version** `8.0.0~dev1`: the tilde sorts below `8.0.0`, so the first release replaces it. **Synopsis** "new web interface for openmediavault", without the leading article, as lintian asks _(recommended)_.

**On the test VM** (OMV 8.6.1, nginx 1.26.3), with a snapshot taken first, `tools/package-test` (`make package-test`) passed every check, over HTTP and HTTPS:

- **Clean install, reinstall, and an upgrade from an older build:**
  - `dpkg --verify` is clean, the permissions are right, and `www-data` cannot write to the web root.
  - The menu entry is in the stock interface.
  - `/ui` redirects to `/ui/`, and `/ui/` and a deep link serve `index.html` with the UI-1 headers. An asset is immutable, and a missing asset gets a plain, uncached 404.
  - The upgrade removes the old build's extra asset.
- **Remove and purge:** no file, link or menu entry is left. `nginx -T` has no `/ui/` location. Every stock reply is as it was before the install, `/ui` included.
- **A broken snippet** (a build with an invalid directive):
  - the install fails with `postinst`'s explanation, and the package is left unconfigured (`iF`);
  - the link is removed, `nginx -t` passes, and nginx keeps serving;
  - the stock replies are unchanged;
  - configuring again fails again, the same way.
- **"The stock replies"** here means 20 requests, recorded before the install and compared after each step: status, headers (less the ones that change on every request) and a hash of the body.

**A11, the OMV upgrade (observed):** OMV 8.7.0 is now published. With the package installed, openmediavault was upgraded from 8.6.1-1 to 8.7.0-1, and then `omv-salt deploy run nginx` and `omv-mkworkbench all` were run. Every check passed after each: the files are unchanged, the link and the menu entry are in place, and the headers are right. This closes A11. On 8.7.0, `pnpm test:browser:vm` (HTTP) gave 9 passed and 2 skipped, the same skips as before. That is information only. Support for 8.7.0 is not declared until `tools/contract-drift` and the integration suite have been run against it, which is a separate change that also moves CI's pinned tree. The VM was then reverted to its snapshot on 8.6.1. The package was installed there with `make package-test`, which replaces the hand-deployed copy of earlier phases. Nothing is pending.

## 2026-11-21 — Owner decisions for Phase 5's first domain, dashboard and monitoring

- **Merging:** for this repository the owner gave a standing approval: once CI is green, rebase-merge the pull request and carry on with the next piece of work without asking.
- **The private review list:** none of these methods is on it, so all may enter the contract: `FileSystemMgmt.enumerateMountedFilesystems`, `Smart.getListBg`, `Services.getStatus`, `Network.enumerateDevicesList`, `LogFile.getList`, `System.getTopInfo`, `SMB.getStats`, `NFS.getStats`, `SSH.getStats`.
- **Scope:**
  - **The dashboard** gains Storage, Disk health, Services and Network cards, and new attention rows: a file system nearly full or missing, a failing disk, and a service that is enabled but not running.
  - **Diagnostics** gains a System logs viewer, Processes and the service details.
  - **Left in the classic interface:** clearing a log (destructive) and the diagnostic report (a download).
- **Charts** are a small SVG line chart of our own in the component library, drawn with SVG attributes: no new runtime dependency. They show only what the open page has sampled (A7).
- **Disk health is read only when asked** (owner). `Smart.getListBg` runs `smartctl` on every disk without `--nocheck`, so it can wake sleeping disks; the stock dashboard does it every 60 s. The Disk health card has a "Check disk health" button that says so. The result is kept for the session, feeds the attention list, and nothing reads S.M.A.R.T. on its own.
- **The log viewer reads a log once and pages it in the browser** _(recommended)_. `LogFile.getList` re-reads and re-parses the whole log or journal on every call, whatever page is asked for (read from source), so paging, sorting and searching on the server would repeat that work on each keystroke.
- **The Wi-Fi pre-shared key** (`wpapsk`) is part of `Network.enumerateDevicesList`'s reply for a configured Wi-Fi interface. The contract omits it (`x-omv-omit`, UI-6), as it does the mail password.
- **Missing file systems** (owner): `FileSystemMgmt.getList` is not on the private review list and may enter the contract. Only it reports a file system that is configured but missing; `enumerateMountedFilesystems` drops it silently. The dashboard reads it once per visit and on "Try again", never polled, and uses it only for missing rows. Whether it can wake a sleeping disk cannot be observed on the VM, whose virtual disks do not sleep; reading it once per visit keeps that risk to the visit itself.
- **The monitoring design's judgement calls** D1–D16 ([design/phase-5-monitoring.md](design/phase-5-monitoring.md), section 12) are taken as recommended. D3 is now settled by the owner's answer above.
- **Examples keep an omitted field** with a documentation value, as [04](04-api-contract.md) says, so the transport tests can prove it is removed. The Wi-Fi example therefore carries a placeholder `wpapsk`. The design's section 9 is corrected to match.

## 2026-11-21 — Phase 5, dashboard and monitoring: built, on the mock and the test VM

Built on `phase-5-monitoring` to [design/phase-5-monitoring.md](design/phase-5-monitoring.md), with the owner's decisions above.

- **The contract** gains the ten operations cleared by the owner, nine reads and the disk-health task, with examples captured from the VM and hand-written ones for the states it cannot show (each says so).
  - **Rows:** `x-omv-omit` can now name a field of each row (`data[].wpapsk`). Its lint rule follows `$ref`s into row schemas, and the transport strips the field from every row.
  - **Captures:** the capture tool now scrubs disk serials and WWNs (including the by-id links built from them), Wi-Fi fields, and a background task's JSON output field by field.
  - **Observed on the VM, against the source:**
    - `temperature` and `mtu` arrive as numeric strings;
    - the virtual SATA disks report `BAD_STATUS`;
    - a whole-list read sends `limit: null`, which the contract's paging schema accepts and OMV answers with every row.
- **The pages.**
  - **Dashboard:** Storage, Disk health (read only on "Check disk health"), Services and Network cards, the CPU and memory chart, and the new attention rows.
  - **Diagnostics:** System logs, Processes, and the SMB, NFS and SSH service details, with their menu items now pointing at the new routes.
  - **Component library:** `LineChart`, `PageTabs` and `HealthList`, groups in `Select`, and new `TaskLog` options.
  - **Session state:** chart samples, the disk-health result and each page's view state live in memory and are emptied at sign-out.
- **An independent pass on the mock** covered both themes, 1280 and 320 px, and the keyboard. It found six defects, all fixed:
  1. the log message column at 320 px;
  2. direction-control characters in log lines, now removed as in the service output;
  3. a log count line that used the reply's `total` instead of the rows received;
  4. a settings link shown twice;
  5. a table header shown above the empty and error states;
  6. an inconsistent mock scenario.
- **On the test VM** (OMV 8.6.1), the build was installed as a package with `make package-test`, every check passed, and `pnpm test:browser:vm` gave 14 passed and 2 skipped over both HTTP and HTTPS (the same skips as before). A Phase 3 check that a page sends only reads now counts the `enumerate…` methods as reads.
- **Left open:**
  - **Re-read after a disk check.** Every finished task makes the app re-read all its queries, so a disk check is followed by one extra read of the dashboard's data. The contract's `x-omv-readonly` cannot tell a read-only task apart, because a task needs a mutation hook. A marker on `x-omv-task` would.
  - **Plugin service names.** It is not yet checked that a plugin's service `name` matches its module in `dirtyModules`.
  - **Log sizes.** A full syslog's size and read time on a busy NAS are not yet known.

## 2026-11-21 — Owner decisions for Phase 5's storage domain

- **The private review list:** none of the storage methods is on it. That covers `DiskMgmt.*`, `Smart.*`, `FileSystemMgmt.*`, `FsTab.getByFsName`/`set`/`delete` and `MdMgmt.*`, as listed to the owner. Where reading the source called for it, the contract's request schemas are stricter than OMV's datamodels, which the contract rules allow.
- **Storage is built in slices**, each with its own design agreed with the owner before building, because it has destructive actions:
  1. disks and disk health (S.M.A.R.T.), which is UX-audit Flow D;
  2. file systems, which is Flow A;
  3. RAID (`openmediavault-md`);
  4. ZFS (`openmediavault-zfs`), whose source is not in the OMV tree and is read separately.
- **The interface enforces its own safeguards for destructive actions** (UI-8). It refuses to wipe a disk that holds a mounted file system or a RAID member, and to unmount a file system that shared folders use. It does not rely on the server to refuse them.

## 2026-11-21 — The disks and disk-health design, agreed by the owner

The owner agreed every destructive-action point of [design/phase-5-disks.md](design/phase-5-disks.md), section 17, and took D1–D23 as recommended:

- **P1, what a wipe refuses:**
  - the system disk and a read-only disk;
  - a disk whose file system is mounted, used, set up (even if not yet applied) or being created;
  - a RAID member, and a disk already being wiped;
  - every disk, when the safety check could not run.
- **P2, the confirmation:** one destructive dialog naming device, model, serial number, size and what is on the disk. Quick (the default) or Secure. The reader types the device name. The disk is checked again, serial number included, when the dialog opens and on "Wipe disk".
- **P3:** a refused wipe offers no classic-interface link around the refusal.
- **P4:** storage the interface cannot trace to its disks (encryption, LVM, ZFS, RAID made without the plugin) is warned about in the dialog, not refused.
- **P5:** a disk holding swap space is refused.
- **P6:** the write cache starts on when power settings are first saved (OMV's form defaults to off).
- **P7:** a secure wipe keeps running on the NAS after a reload, which the page can no longer show. The dialog says so before it starts.
- **P8:** a secure wipe can be stopped after a plain confirmation. A quick wipe cannot.
- **P9:** after a wipe, the disk shows "Empty (wiped at …)" for the session, with a link to create a file system in the classic interface until the file-systems slice exists.

## 2026-11-21 — Phase 5, disks and disk health: built, on the mock and the test VM

Built on `phase-5-disks` to [design/phase-5-disks.md](design/phase-5-disks.md), as agreed by the owner.

- **The contract** gains 24 operations:
  - the 21 disk and S.M.A.R.T. operations;
  - `MdMgmt.enumerateDevices`, whose "plugin not installed" reply is HTTP 404 "RPC service 'MdMgmt' not found." (observed);
  - `FileSystemMgmt.enumerateFilesystems`, _(recommended)_ because only it shows swap (P5), and `FileSystemMgmt.getList` calls it itself.

  The S.M.A.R.T. schedule fields use anchored patterns, accepting exactly the values the stock form offers. The capture scrubber now also replaces smartctl's spaced WWN form and FAT volume IDs. Both were caught in drafts that were never committed.

- **The pages:**
  - Storage > Disks and a disk's page, with health details read only on request and power settings;
  - Disk health (Overview, Self-tests, Settings), the Flow D set-up page and scheduled self-tests;
  - the wipe, with the interface's own safeguards.
- **The S.M.A.R.T. reads that can wake a disk** are query hooks kept disabled until the reader presses their button. They are never refetched on mount, focus, reconnect or when a task ends. A source test fails if `refetchQueries` or `resetQueries`, which would restart them, appears in the app.
- **An independent pass on the mock** found no blocker. Every agreed refusal and the confirmation behaved as designed. Its findings are fixed:
  - server text inside sentences is now isolated, so a right-to-left model name no longer reorders the line;
  - the tables' sideways scroll regions are named and focusable;
  - two copy slips are corrected, and two duplicated readings are shown once;
  - the power form keeps its saved state after Save;
  - two missing scenarios are added.
- **On the test VM** (OMV 8.6.1; no RAID plugin), the build was installed as a package. The first run showed no disk as free to wipe. The cause was the wipe section showing its fail-closed "could not check" state while its reads were still loading. It now says it is checking. `pnpm test:browser:vm` with `OMV_WEBUI_VM_WIPE_DISK=sdd` then gave 19 passed and 2 skipped over both HTTP and HTTPS. Those runs included the refusals of the system disk and of the disk with the mounted file system, and a real quick wipe of the empty scratch disk `sdd`. Nothing was left pending.
- **On the VM, `Smart.getDeviceSettings` answers HTTP 500** for a disk with no saved monitoring settings. Only the waking health check could tell the page in advance, so the page makes the call and treats that reply as "not set". The VM test allows exactly that failure.
- **Still to check:**
  - shred's progress lines on a secure wipe;
  - the start lines of a self-test on a disk that supports one (the VM's NVMe disk does not);
  - whether a rescan or a settings save wakes a disk.

## 2026-11-21 — The file-systems design, agreed by the owner

The owner agreed the destructive and irreversible points of [design/phase-5-filesystems.md](design/phase-5-filesystems.md), section 18:

- **P1:** what creating a file system erases, and what it refuses. The stricter of OMV's candidate list and the disks slice's disk-use model wins.
- **P2:** the typed confirmation, with a re-check of the disk (serial included) as the first step. Accepted as a stated risk: two sessions creating on the same disk within about a second, and multi-disk BTRFS, which writes no "being created" marker.
- **P3:** multi-disk BTRFS defaults to RAID1 (RAID10, RAID0 and single also offered).
- **P4:** Flow A stops at the mount and hands sharing to the classic interface, saying what to choose there (770, per Q4). The in-app sharing stage (section 8) waits for the shares domain. Its methods are not yet cleared against the private review list: `ShareMgmt.set`/`setPrivileges`/`delete`, `UserMgmt.getUserList`/`getGroupList`, and `SMB.getSettings`/`setSettings`/`getShareList`/`setShare`. That question is asked then.
- **P5:** grow is irreversible, confirmed without typing.
- **P6:** unmount cuts access, is refused while anything uses the file system, and is confirmed without typing.
- **P7:** unmount and remove refuse to start while other changes are pending, then apply what they leave pending without asking again.
- **P8:** removing a missing file system has a plain confirmation.
- **P9:** a refusal offers no classic-interface link around it.

The design's other judgement calls are taken as recommended, as for the earlier slices.

## 2026-11-21 — Phase 5, file systems: built, on the mock and the test VM

Built on `phase-5-filesystems` to [design/phase-5-filesystems.md](design/phase-5-filesystems.md), as agreed by the owner (P1 to P9).

- **The pages:**
  - Storage > File systems, with the system drive first, "Found on the disks, not mounted" and its mount dialog, and the unfinished-work notices;
  - a file system's page, addressed by its UUID: summary, what uses it, warning level and tags (re-read before each save), technical details on request (first 500 lines), grow, unmount, and removing a missing one;
  - Flow A at `/storage/filesystems/add` and Combine disks (BTRFS) at `/storage/filesystems/add-multi`, with the pre-flight, the typed confirmation, the step list, every failure plan and the sharing handover.
- **The library** gains headed sections for radio groups, a sectioned checkbox list, `typedMatches` for several names, a compact capacity meter and a partial task log.
- **Flow A's run, grow and unmount live in memory for the session**, not in their page: leaving a page does not stop them, and coming back shows them.
- **The mock remembers** what Flow A does (create, set up, apply, undo, unmount, wipe), written by hand from the captured shapes, so the whole journey can be walked on `pnpm dev:mock` and in the browser test. Each task gets its own handle, as the server's do.
- **R7's forced re-apply after "Undo the mount"** deploys all four of the mount's modules (`collectd`, `fstab`, `monit`, `quota`), because which of them the failed apply had deployed is not known.
- **On the test VM** (OMV 8.6.1), the build was installed as a package. `pnpm test:browser:vm` with `OMV_WEBUI_VM_SCRATCH_DISK=sdd` gave 22 passed and 3 skipped, over both HTTP and HTTPS. Each run included the real journey on the scratch disk `sdd`: create EXT4, mount through the checkpoint, unmount, wipe again. Afterwards `wipefs -n /dev/sdd` was empty and nothing was pending.
- **Still to check:**
  - the classic shared-folder picker's text for a tagged file system;
  - grow on several BTRFS disks;
  - a busy unmount and a missing file system on the VM.

## 2026-11-21 — Phase 5, RAID: the owner's agreement to the design

The owner answered the "For the owner to agree" points of [design/phase-5-raid.md](design/phase-5-raid.md).

- **Agreed as written:** P1 (what creating an array or adding a disk may erase, the stricter of the plugin's list and the disk-use model), P2 (one summary, every device name typed), P4 (an array goes on to a file system and mount, "Use it for files" can be unticked), P5 (bigger only for RAID5 and RAID6), P6 (taking out a disk), P7 (deleting an array), P8 (Check and Stop checking; no Repair), P9 (a 30-second poll only while an array is busy), P10 (no classic link round a refusal), P11 (what is applied and what is left pending).
- **Changed, P3:** Stripe (RAID0) is offered as well as Mirror, RAID5, RAID6 and RAID10, with a strong warning that losing one disk loses everything on all of them. Mirror stays the default and Stripe is never preselected. Still no custom array name.
- **Test VM:** a fourth 8 GiB scratch disk is added, so RAID6, RAID10 and growing a RAID5 can be seen on the VM, and the RAID plugin is installed there after a snapshot.

## 2026-11-22 — Phase 5, RAID: which reads touch a member disk, and where the arrays are read

The RAID captures on the test VM (OMV 8.6.1, openmediavault-md 8.1.6) showed that `MdMgmt.enumerateDevices`, `MdMgmt.getDetail` and `MdMgmt.getSlaves` each read a member disk's superblock on every call. On a real NAS that can wake a disk that has spun down. `MdMgmt.getCandidates` reads no array member. The design had assumed the first three read only the kernel's state (its 0.5). Decided, under the owner's rule that a background read must not wake a disk:

- **Whether the RAID plugin is installed**, for the menu item, is decided by one `MdMgmt.getCandidates` read after an administrator signs in, kept for the session and not repeated when a task ends. Its 404 "RPC service 'MdMgmt' not found." means not installed. The contract gains that reply for `getCandidates`.
- **The arrays are read only on pages the reader opened that are about arrays or disks:** the RAID pages, Disks and a disk's page, and Flow A. They are never read from the dashboard, the File systems pages or in the background. The dashboard therefore has no RAID rows (design 9.1, D21 superseded); a failed disk is reported by email and on the RAID pages.
- **The one exception is P9's poll:** every 30 seconds, in the background, only while an array shown is synchronising, rebuilding, reshaping or being checked. That array's disks are busy anyway then.
- **Each array's report is read for the RAID list too.** `devices` lists failed members and spares, so the list's counts come only from the reports. The list is a page about arrays.

Whether any of these wakes a spun-down disk is still to be seen on real hardware (design 15.3); the VM's virtual disks do not sleep.

## 2026-11-22 — Phase 5, RAID: built, on the mock and the test VM

Built on `phase-5-raid` to [design/phase-5-raid.md](design/phase-5-raid.md), as agreed by the owner (P1 to P11, P3 changed to offer Stripe). Where the VM contradicted the design, the build follows the VM, and the design's section 19 lists each change.

- **The pages:**
  - Storage > RAID, shown in the menu only once `MdMgmt.getCandidates` says the plugin is installed;
  - an array's page at `/storage/md/$array`: state, members with their roles from mdadm's report, what to do now, what uses it, adding a disk, taking one out, check and stop checking, technical details without the host part, delete;
  - creating an array at `/storage/md/create`, in five levels with Stripe last and never preselected, going on by default into a file system and its mount under one typed confirmation and one checkpoint;
  - adding a disk at `/storage/md/$array/add`: a replacement (which then takes the failed disk out), a spare, or, for RAID5 and RAID6, more space.
- **Elsewhere:** Flow A no longer offers an array that is short of a disk, not running or Unknown, and names levels in words. The Disks pages, the wipe refusal and the File systems "On" column link to the array's page. The File systems pages no longer read the arrays.
- **The library** gains `ProgressBar` (from `JobProgress`), a `notice` slot in `JobSummary` for the Stripe warning before the typed field, and a warning-shaped neutral `InlineAlert`.
- **The contract** gains `getCandidates`' 404 reply.
- **The mock remembers** creates, adds, removals, checks and deletes over the file-system mock, with the kernel's work moving on at each read, and 22 RAID scenarios.
- **Found on the VM while building:**
  - an available "Check now…" button carries no `aria-disabled`, only the unavailable one does (the VM spec's wait, not the page);
  - a new mirror on two disks that earlier held a mirror with a file system shows that file system again, because deleting an array erases only its marks, and OMV then does not offer it for a new file system. The create flow now quick-wipes the array it has just made in that case. That erases nothing beyond the disks the summary named, but it is not in the agreed design, so it is for the owner to confirm (design section 19);
  - a new array was once not yet a file-system candidate a moment after it was made, so that read is now looked at up to five times.
- **On the test VM** (OMV 8.6.1, openmediavault-md 8.1.6), the build was installed as a package with the lifecycle test. `pnpm test:browser:vm` with `OMV_WEBUI_VM_SCRATCH_DISK=sdd` and `OMV_WEBUI_VM_RAID_DISKS=sdb,sdc,sdd,sde` gave 26 passed and 3 skipped, over HTTP and over HTTPS. The skips are the second-factor, idle-warning and `OMV_WEBUI_VM_WIPE_DISK` tests, which need env this run did not set. The RAID spec's four tests ran each time:
  - the menu item and no array read on the dashboard;
  - a mirror with EXT4 that synchronises, refuses a delete while mounted, takes a spare and gives it back, loses a working disk and rebuilds onto it after its wipe, is checked and stopped, then is unmounted and deleted;
  - a stripe's refusals, and a RAID10 and a RAID6 deleted while they synchronise;
  - a RAID5 made bigger with the fourth disk, whose size grew when the reshape ended.

  Afterwards no array was in `/proc/mdstat`, `mdadm.conf` had no ARRAY line, only sda1 was mounted under `/srv`, `wipefs -n` was empty on sdb to sde, and nothing was pending.

- **Still to check:**
  - on real hardware, whether these reads wake a spun-down disk (design 15.3);
  - a real disk failure, and the email it sends;
  - what a restart without applying does to an array's name (0.6, 0.8);
  - the log line a finished check writes.

## 2026-11-22 — Phase 5, RAID: the owner's decision on a leftover file system

On the VM, a new mirror made on two disks that had earlier held a mirror with a file system showed that file system again. Deleting an array erases only its marks, so the new array sits on the same disks at the same place. OMV then does not offer the array for a new file system. The build cleared the new array with a quick wipe before the file-system stage. The owner decided:

- **Keep clearing the new array, and say so.** The create summary's erase line, before the typed confirmation, now says that everything on the disks is lost, "including anything left on them from an earlier array". This is the existing what-is-lost wording, not a new warning box.
- **"Clear the new array" is a step of its own** in the step list, shown only when it runs. If it fails, the flow stops with the server's words and "Stop here" only; nothing else is erased, and the array stays.

The design's 3.3, 3.4, 3.7, section 19 and copy tables say so.

After this change, with the round's other fixes (Stripe is not brought back by "Change choices", which now moves focus to the level; the roll-up's plural; the phone layout), the build was installed on the test VM. The RAID and file-systems VM specs, with `OMV_WEBUI_VM_RAID_DISKS=sdb,sdc,sdd,sde` and `OMV_WEBUI_VM_SCRATCH_DISK=sdd`, gave 8 passed over HTTP and 8 passed over HTTPS. Afterwards no array, no ARRAY line, only sda1 mounted, `wipefs -n` empty on sdb to sde, nothing pending.

## 2026-11-22 — ZFS file systems have no UUID, and the storage pages fell over on them

**Found on the test VM** (OMV 8.6.1, openmediavault-zfs 8.1.4, OpenZFS 2.4.4, a mirror `tank` on sdb and sdc with the file system `tank/media`). OMV's file-system lists report a pool's own folder and each of its file systems as type `zfs` with `uuid` `null`. Their `devicename`, `devicefile`, `predictabledevicefile`, `canonicaldevicefile` and `label` are all the full name, such as `tank/media`. The other fields:

- `devicefiles` lists the pool's disks, and `parentdevicefile` is the first of them. `devlinks` is empty.
- `mountopts` is `""`; `propfstab`, `propresize` and `propquota` are false; `hasmultipledevices` is true; `_used` is false.
- `getMountCandidates` never lists them, and `FsTab.getByFsName` answers 400 for such a name.

A pool made by hand is only in `enumerateFilesystems`. Once the plugin's Discover has added its mount entries, `getList` and `enumerateMountedFilesystems` list it too. The contract was made to accept `uuid: null` in the commit before this one. The app still read `uuid` as a string: the dashboard, the File systems pages, the grow, unmount, Flow A and RAID runs threw on a ZFS row. The disk-use model also took two rows without a UUID for the same file system.

**Fixed:**

- **A missing UUID is no UUID everywhere.** `ownUuid` and `sameUuid` in `fsModel.ts` are used wherever a UUID is read or compared. `null` never matches anything, not even another `null`, and never forms an address. `findFsRow` finds a row past ZFS rows listed before it.
- **No page for a ZFS file system.** `fsAddress` gives none to a `zfs` row, even one with a UUID. On the File systems list, a ZFS row has its name, the word "ZFS" (`fsType.zfs`) and its usage. It says it is part of its pool and managed with the pool in the classic interface. It has no link and no action, and it never appears under "Found on the disks, not mounted". The dashboard's Storage card shows each one with its figures and no link.
- **A disk in a ZFS pool is in use.** The disk-use model has a new use and wipe blocker, "Part of ZFS pool {{pool}}", taken from `devicefiles` and `parentdevicefile` of the ZFS rows in either list, whatever is mounted. Its pool's file systems are not shown as file systems on the disk. The wipe, Flow A, Combine disks and the RAID choices refuse such a disk. It fails closed: a ZFS row that names no disk makes every disk "Not known".
- **The mock** has the scenario `fsZfs` from the captured rows.

**Left for the ZFS slice** (`docs/design/phase-5-zfs.md` on branch `phase-5-zfs`, section 10): one Storage item per pool (D22); links to the pool's pages; the line on File systems for ZFS file systems OMV does not know yet; and reading the pools themselves (`getPoolStatus`, `getPoolDevices`) in the disk-use model.

**On the test VM**, the build was installed as a package with the lifecycle test. With `OMV_WEBUI_VM_ZFS_POOL=tank`, the new VM spec `zfs.vm.spec.ts` passed against the pool made by hand, before Discover. After Discover and Apply, the whole VM suite ran over HTTP and over HTTPS, with the disk-using tests' variables unset. Both runs gave 23 passed, 7 skipped and 1 failed. Both ZFS tests passed: the dashboard, File systems and Disks pages showed the pool with no page error, and a member disk's wipe was refused, naming the pool.

The one failure, both times, is the System logs test. On this VM `LogFile.getList` for the system log answers 500: PHP ran out of its 128 MB memory limit reading a journal of about 100,000 entries. That is not related to ZFS; how large a log the page can read is still to be decided.

The pool was then destroyed and its mount entries removed (Discover with `deleteStale`, then Apply). The disks were wiped, and the file-systems and RAID specs were run with `OMV_WEBUI_VM_SCRATCH_DISK=sdd` and `OMV_WEBUI_VM_RAID_DISKS=sdb,sdc,sdd,sde`: 8 passed over HTTP and 8 passed over HTTPS. Afterwards there was no pool, `wipefs -n` was empty on sdb to sde, only sda1 had a mount entry, and nothing was pending.

## 2026-11-22 — Phase 5, monitoring: a log too long for the NAS to send

**Observed on the test VM** (entry above): with a journal of about 106,000 lines, System logs fails for the system log. `LogFile.getList` reads up to `OMV_MAX_LOGFILE_LINES` (100,000) lines and the page asks for every row; `rpc.php` runs past PHP's 128 MB limit with that reply and answers HTTP 500, and the web server's error log has PHP's "Allowed memory size … exhausted". The classic interface makes the same call and fails the same way. It is OMV's limit, and OMV is not modified (`AGENTS.md` rule 4).

**What the browser receives** (read from OMV's source, then seen on the test VM): `rpc.php` turns exceptions into its JSON error reply, but a PHP fatal error such as running out of memory is not an exception, and `rpc.php` has no shutdown handler. With the stock `display_errors = Off`, PHP stops the script and answers 500 with an empty body. The transport could not tell that from any other unreadable reply: it threw an `RpcError` with status 500, code `null` and its own "The server sent a reply that could not be read.".

**Where the memory runs out** (from source, confirmed by the measurement below): `LogFile.getList` runs in `omv-engined`, whose PHP settings (`/etc/openmediavault/php.ini`) set no memory limit, so building the rows does not fail there. The 128 MB limit is the web server's PHP, where `rpc.php` receives the engine's reply and sends it on, and that reply holds only the rows asked for.

**Measured on the test VM** (read-only, through `rpc.php`, a system log of 99,986 entries):

| Request                                          | Reply                | Size         | Time  |
| ------------------------------------------------ | -------------------- | ------------ | ----- |
| `limit: null` (every row)                        | HTTP 500, empty body | —            | 1.8 s |
| `start: 0, limit: 5000`, by `rownum`, descending | 200, `total` 99,986  | about 1.0 MB | 0.7 s |
| `limit: 20000`                                   | 200                  | about 3.9 MB | 0.8 s |

**Decided:**

- **The transport marks a reply whose body is not JSON** with `RpcError.unreadable` (docs/03). The message is unchanged; no page shows more of the reply than before (UI-9).
- **Every log is read as its newest 5,000 entries**: `{ start: 0, limit: 5000, sortfield: "rownum", sortdir: "desc" }`, design 2.1's own fallback. The page sorts, searches and pages those rows in the browser as before; its sort never relied on the server's order. When the reply's `total` is more than the rows received, a line under the count says "Showing the newest 5,000 of 99,986 entries. Download the log in the classic interface for all of it." This replaces the old 100,000-line wording. `total` counts only what the server read, its last 100,000 lines at most, so for a longer log it is the count of those.
- **System logs keeps its own state as a fallback** for a read that still fails this way. A read of a log that answers 500 and is `unreadable`, or a 500 whose message says the memory size was exhausted, shows "This log is too long for the NAS to send" and "The NAS could not read this log, probably because it has grown very long. The classic interface has the same limit." with "Try again". No server message is shown: the reply holds nothing the reader can use. Every other failure keeps "Could not read this log." with the server's message. The page does not suggest changing anything on the NAS (rule 11). Design 2.1, 2.6 and 2.8 say so.
- **The mock**: `logsLarge` is now a syslog of 12,000 entries paged as OMV pages it, and `logsTooLong` answers the system log with 500 and an empty body (the others as usual). The VM spec's log test expects the rows from exactly one read with `limit: 5000`. It still accepts the "too long" state, recorded as an annotation, as the documented fallback.

## 2026-11-22 — Phase 5, ZFS: the owner's agreement to the design

The owner answered the "For the owner to agree" points of [design/phase-5-zfs.md](design/phase-5-zfs.md).

- **P1, the methods:** none of the 19 `Zfs.*` methods in section 12.1 is on the private review list; all are cleared. The methods in 12.3 stay unused.
- **P2, the scope:** agreed as written. Pools, creating a pool with one group of disks, top-level ZFS file systems (size limit, compression), snapshots (take, roll back to the newest, delete), checks, replacing a disk, offline and online, clearing error counts, and deleting a pool are built. Import and export, disk-group changes, spares, cache and log, expansion, attach and detach, nested file systems, rename, clone, volumes, encryption, scheduled jobs, TRIM and upgrade stay in the classic interface.
- **P3 to P15:** agreed as written, including No protection (stripe) offered last, never preselected and warned twice, as for RAID; and a dashboard row for pool health only if the VM shows that read touches no disk.
- **Source:** the plugin's public repository, read at its 8.1.4 head (`58525e8`). The test VM has `openmediavault-zfs` 8.1.4 with `zfs-dkms` 2.4.4; snapshots `before-zfs` and `zfs-plugin`.

## 2026-11-22 — Phase 5, ZFS: the contract, and what the test VM showed

The 19 `Zfs.*` methods of [design/phase-5-zfs.md](design/phase-5-zfs.md) section 12.1 are in the contract, with examples captured on the test VM (OMV 8.6.1, openmediavault-zfs 8.1.4, OpenZFS 2.4.4) by `tools/contract-capture/zfs.mjs`: a mirror of two with a file system, checked, with a disk offline and a disk replaced, then a RAID-Z1, a RAID-Z2, a stripe and a single disk. The drift check reads the plugin's own repository at `58525e8` beside OMV's tree.

- **Which reads touch a member disk** (design 0.6, P14). On an idle mirror holding 5 GiB, `/proc/diskstats` of the member disks did not move across any of `listCompressionTypes`, `getPoolStatus`, `getPoolDevices`, `getObjectDetails` (pool and file system), `listPools`, `getAllSnapshots` and `getEmptyCandidates`, three calls each, nor across `FileSystemMgmt.getList`, `enumerateFilesystems` and `enumerateMountedFilesystems`; nor across the first call of each after the pool was exported and imported again. Only the system disk was read now and then. So, under P14 as agreed, the dashboard may read `getPoolStatus` once per visit. Whether any of them wakes a spun-down disk is still for real hardware (design 15.3).
- **ZFS file systems in OMV's file-system lists.** `FileSystemMgmt.getList`, `enumerateFilesystems` and `enumerateMountedFilesystems` list each ZFS file system (the pool's own folder included) with `uuid` null and `blocks`, `size` and `available` as JSON numbers. The contract now allows both; the transport turns the numbers into decimal strings. `FsTab.getByFsName` refuses a ZFS name (HTTP 400: OMV's datamodel takes only a UUID or a device file), so a ZFS file system's mount entry is found by its folder, not by that method.
- **Other facts the design relies on:** creating a pool or a file system and deleting a snapshot, a file system or a pool each mark fstab, collectd, monit and quota pending; a size limit or compression marks collectd, monit and quota; a snapshot, a roll-back, a check, a replace, offline, online and clearing mark nothing. `addObject` with a name that is taken answers as if it had created it. A refused `addPool` (a reserved name) still left a partition table on its disk. The disks of a deleted pool keep ZFS's partition table and are not offered again until wiped. The compression and deduplication ratios read "1.00", without an "x".

## 2026-11-22 — Phase 5, ZFS: built, on the mock and the test VM

Built on `phase-5-zfs` to [design/phase-5-zfs.md](design/phase-5-zfs.md), as agreed by the owner (P1 to P15). Where the test VM contradicted the design, the build follows the VM, and the design's section 20 lists each change.

- **The pages:**
  - Storage > ZFS, shown in the menu only once `Zfs.listCompressionTypes` answers (its 404 means the plugin is not installed): the pools worst first, with layout, space for files from each pool's own folder, the last check, and the file systems;
  - a pool's page at `/storage/zfs/pools/$pool`: its state from ZFS's report, what to do now (Flow F), its disks grouped as ZFS arranges them with each disk's role and health, its file systems, the check (start, stop, continue), offline and bring back, clearing error counts, the technical details, and deleting the pool;
  - creating a pool at `/storage/zfs/create`, with Mirror the default and No protection (stripe) last, never preselected and warned twice, going on into a first file system `data` under one typed confirmation of every device and one checkpoint;
  - adding a file system at `/storage/zfs/pools/$pool/add`, a file system's page at `/storage/zfs/fs/$` (space, what uses it, snapshots, size limit and compression, details on request, delete), and replacing a disk at `/storage/zfs/pools/$pool/replace`.
- **Elsewhere:** the dashboard shows one Storage item per pool and reads `getPoolStatus` once per visit for a row per pool that is short of a disk, unusable or holds damaged files (P14); File systems links ZFS rows to their pages and names the pools OMV does not know yet; the Disks pages and the wipe refusal link the pool; the disk-use model reads each pool's disks (`getPoolStatus`, `getPoolDevices`) wherever it is read.
- **The library** gains `TableGroupRow` and `SizeField`.
- **The mock remembers** creates, file systems, snapshots, checks, replacements, offline and online, and deletes, with 38 ZFS scenarios.
- **Found while building:** the VM's facts in the contract entry above (FsTab refuses a ZFS name; `addObject` with a taken name changes nothing; a refused `addPool` can leave a partition table; deleted and replaced-out disks keep ZFS's GPT; ratios without "x"; `replacing-1` for both disks; the space shares; `lastscrub`'s time zone; by-id paths only). A pool whose disks ZFS names otherwise has no disk changes here. A pool being deleted is no longer read once its task ends, so its report is never asked for after it is gone.

## 2026-11-22 — Phase 5, shares: the methods cleared for the contract

The owner cleared all nine backend methods the shares domain needs: `ShareMgmt.set`, `ShareMgmt.setPrivileges`, `ShareMgmt.delete`, `UserMgmt.getUserList`, `UserMgmt.getGroupList`, `SMB.getSettings`, `SMB.setSettings`, `SMB.getShareList` and `SMB.setShare`. None is on the private review list. The design's points still need the owner's agreement before anything destructive is built.

## 2026-11-22 — Phase 5, shares: the owner's agreement to the design

The owner agreed [design/phase-5-shares.md](design/phase-5-shares.md) as written.

- **P1, two more methods:** `SMB.deleteShare` and `ShareMgmt.getCandidates` are cleared; neither is on the private review list. `ShareMgmt.getFileACL` is not asked for now (P16).
- **P2, the scope:** create, edit, access per person and group, delete, and sharing over SMB are built. File permissions (ACLs), NFS, the advanced SMB settings and share options, copying access, renaming, moving a working folder and BTRFS snapshots stay in the classic interface.
- **P3 to P16:** agreed as written. That includes new folders at mode 770 with no choice, names fixed once made, guest access its own unticked checkbox warned twice, no SMB share with guests off until someone has access, Stop sharing removing the share, and two deletes, the one with files red, typed and refused in the cases section 8 lists.

## 2026-11-22 — Phase 5, shares: the contract, and what the test VM showed

The 11 methods of [design/phase-5-shares.md](design/phase-5-shares.md) section 11 are in the contract: `ShareMgmt.getCandidates`, `set`, `setPrivileges` and `delete`; `UserMgmt.getUserList` and `getGroupList`; `SMB.getSettings`, `setSettings`, `getShareList`, `setShare` and `deleteShare`. The examples were captured on the test VM (OMV 8.6.1) by `tools/contract-capture/shares.mjs`, on a scratch EXT4 file system, a BTRFS one and a single-disk ZFS pool, with three documentation people and a group; each access choice was also opened from a client as those people. The VM was left as it was. The request schemas are stricter than OMV's datamodels where the design asks (names, paths, a mode of 770 only, a required access list); the drift check's accepted list says why the SMB requests name the stored fields OMV's datamodels leave out.

- **Pending modules:** making or changing a shared folder, and saving its access, mark sharedfolders and systemd, plus samba and avahi when the folder has an SMB share. The SMB writes mark samba and avahi. Deleting a shared folder, either way, marks sharedfolders, systemd and task.
- **Access** behaves as the design's 0.4 reads, for every combination tried. A guest cannot open a folder made by this interface (770).
- **Lists:** the web administrator account and the group `users` are not listed; a stock NAS lists no group. An empty access list reads as the empty string.
- **Names:** OMV counts a name's 80 characters as bytes; it accepts names that differ only in case, and `homes` and `global`. A shared folder named `homes` becomes Samba's home-folders section once shared. The interface's own rules stay.
- **Writes back:** an SMB share read from the list and sent back without `sharedfoldername` keeps every field; with it, OMV refuses. The SMB settings sent back whole keep every field.
- **Deleting:** refused while an SMB share refers to the folder, even one turned off. With its files, 2 GiB in 20,000 files took 0.6 s. A BTRFS shared folder is a subvolume; its snapshot stays.
- **Reads that fail:** the list of SMB shares fails when a share names a shared folder whose record is gone. Turning SMB on with a NAS name of 16 characters is refused with OMV's words.

Design section 19 lists each fact and what it changed.

## 2026-11-22 — Phase 5, shares: built, on the mock and the test VM

Built on `phase-5-shares` to [design/phase-5-shares.md](design/phase-5-shares.md), as agreed by the owner (P1 to P16). Where the test VM contradicted the design, the build follows the VM, and the design's section 19 lists each change and each decision taken while building.

- **The pages:**
  - Storage > Shared folders: a Sharing column, each folder a link to its page, the line when Windows and Mac sharing is off, the unfinished work of this session's add flow, and "Add a shared folder";
  - a shared folder's page at `/storage/shared-folders/$folder` (its UUID): its state with its file system's, what to do now, the summary with the network addresses, the description edited in place, who can use it (the access grid), its SMB share (share, change, stop, turn on), Used by, pointing a broken folder somewhere else, and the two deletes (keeping the files; with every file, typed);
  - adding a shared folder at `/storage/shared-folders/add`, from the list and from Flow A's new handover card, with access and SMB sharing in one form, one summary and one checkpoint;
  - Windows and Mac sharing at `/services/smb` (the menu's SMB/CIFS item): on and off, and the folders it shares.
- **Elsewhere:** a file system's Used by panel and the unmount and ZFS refusals link each shared folder to its page; the dashboard's SMB row and the SMB service details link the new page.
- **The library** gains `SegmentedChoice` and `AccessGrid`; `JobSummary` can mark an item with the warning shape and draw its title as a heading.
- **The mock remembers** folders, access, shares, settings, deletes, apply and undo, with 23 shares scenarios (the design's 14 and one per failing step of the add flow).
- **Names that carry direction controls** are shown with each control replaced by a visible mark, so a name cannot read backwards; what is sent to the NAS is unchanged.
- **Checks:** `make test` passed (react-api-omv 1,091 tests, react-ui-components 234, omv-web-app 2,356; contract drift: 104 operations agree, 34 accepted divergences; colour audit 164 pairs, 0 failed) and `pnpm test:browser` passed 42. On the test VM the package passed the lifecycle test, and the whole VM suite, with `OMV_WEBUI_VM_SCRATCH_DISK=sdd` and the RAID and ZFS disks `sdb,sdc,sdd,sde`, gave 32 passed and 5 skipped over HTTP and over HTTPS (the skips need a second-factor administrator, the idle timeout, a wipe disk or a ready-made pool). The new `shares.vm.spec.ts` makes a file system through Flow A, adds and shares a folder through its handover, changes and stops the share, turns SMB off again, deletes both ways and wipes the disk. One HTTPS run first timed out in the ZFS journey, pressing "Stop checking…" just as the check ended; the step now carries on when the check has ended. Afterwards the VM had no pool or array, only sda1's mount entry and the original shared folder, empty scratch disks, SMB's settings as before and nothing pending.

## 2026-11-22 — Phase 5, users and groups: the methods cleared for the contract

The owner cleared the UserMgmt methods the users-and-groups domain needs, beyond the five already in the contract: `getUser`, `setUser`, `deleteUser`, `getGroup`, `setGroup`, `deleteGroup`, `getSettings`, `setSettings`, `enumerateUsers` and `enumerateGroups`. None is on the private review list. `importUsers` and `importGroups` (bulk import) stay in the classic interface. The design's points still need the owner's agreement before anything destructive is built.

## 2026-11-22 — Phase 5, users and groups: the owner's agreement to the design

The owner agreed [design/phase-5-users.md](design/phase-5-users.md) P1 to P17 as written.

- **P1, P2:** no new methods (`enumerateUsers` and `enumerateGroups` stay out of the contract); Users and Groups lists and pages, add, edit, delete, passwords and home folders on and off are built; bulk import, quotas, SSH keys, other system groups, account numbers and shell, renaming, moving home folders, SMB home shares and "disallow account modification" stay in the classic interface.
- **P3 to P5:** administrator and SSH sign-in are explicit checkboxes, off by default, warned; nobody removes their own administrator rights; other system groups are never offered, are shown with what they mean, and are kept on every save.
- **P6 to P17:** as written, including the name checked free immediately before an add, a typed delete for a person (never oneself) that removes their access entries by default, a group emptied before its delete, and the built-in admin never listed or changed. Whether a shared folder covering a whole file system may hold home folders is settled by the VM check, keeping the safer choice.
