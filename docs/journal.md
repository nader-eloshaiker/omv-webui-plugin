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

Set-up: omv-extras installed on the VM (its install script read first), then `openmediavault-2fa-totp`; the other two-factor plugin offered is `openmediavault-2fa-emailotp`, not tried (it needs mail). `webui-2fa` was enrolled with `TfaTotp.preEnableByContext` / `enableByContext`; its secret is in the env file as `OMV_2FA_TOTP_SECRET`, so scripts can make codes (RFC 6238: SHA-1, 6 digits, 30 s, one window of drift each side).

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
