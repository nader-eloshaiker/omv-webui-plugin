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

| Part of the stack | Enforced UI-1 policy | Trusted Types (report-only) | Effect |
|---|---|---|---|
| Vite build output (`index.html`) | Clean: one external script, one external stylesheet, nothing inline | — | — |
| React 19 `style` props, Tailwind stylesheet, TanStack Router (incl. a deep link), TanStack Query | Clean | Clean | — |
| recharts | Clean (sizes set through `element.style`, which CSP allows) | Clean | — |
| sonner | 2 violations at module load: it inserts its stylesheet as a `<style>` element | Clean | Toasts lose their styling; the violation fires on every page load, even with no toast shown |
| Radix Dialog, Popover, DropdownMenu, Select | 1 violation each on open: the scroll lock (`react-style-singleton`) inserts a `<style>` element | Clean | Page scrolling is not locked behind the dialog or menu |
| Radix Select and ScrollArea | 1 violation each: they render a `<style>` element to hide the native scrollbar | 1 report each (`innerHTML` through `dangerouslySetInnerHTML`) | The native scrollbar shows; under enforced Trusted Types the component would throw |
| Base UI (Dialog, Select, Popover, Menu, Tooltip, Toast, ScrollArea), default | 1 violation: one shared `.base-ui-disable-scrollbar` `<style>` | Clean | Native scrollbar shows in its scroll areas |
| Base UI inside `CSPProvider disableStyleElements` | **Clean** | **Clean** | Scroll lock works (set through `element.style`); every component opened. The one rule Base UI would have inserted goes into our own stylesheet instead |

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

| Point | Result |
|---|---|
| The snippet is included | OMV's site includes `openmediavault-webgui.d/*.conf` at the end of its server block. OMV's own `headers.conf` is in the same directory, so it is applied at server level too |
| `^~ /ui/` wins | **Yes.** `/ui/index.html` gets our headers, not the stock `index.html` regex location; `/ui/x.php` and `/ui/rpc.php` are served the app page and never reach PHP |
| Own headers | **Yes.** Exactly one CSP, the UI-1 set, no inherited `X-XSS-Protection` or stock CSP. `index.html` and deep links `no-cache`; assets `public, max-age=31536000, immutable` |
| Deep links | **Yes**, `try_files $uri /ui/index.html`. `$uri/` was dropped: with it, a directory without an index gave 403 |
| Stock `error_page 404` | **Interferes for assets.** A missing asset was redirected (302) to the stock `/#/404` and carried the immutable cache header. Fixed with a named location that returns a plain, uncached 404 |
| `alias` pitfalls | None with a nested **prefix** location (`^~ /ui/assets/`) instead of the regex one in [06](06-plugin-packaging.md). `..` is normalised before matching |
| `/ui` | 301 to `/ui/`; `absolute_redirect off` makes it relative |
| Survives OMV re-deploying nginx | **Yes.** The Salt state manages only its own files (no `clean`). Checked after five applies, including one that rewrote the site file (enabling HTTPS) |
| HSTS | OMV sends it only when HTTPS is enabled *and* forced, from `headers.conf`. `/ui/` responses do not carry it. A static snippet cannot copy that condition, and sending it always would pin hosts whose owner has not forced HTTPS. Proposed: leave it out. With HTTPS forced, the server-level redirect runs before `/ui/`, and every `rpc.php` reply carries HSTS, so the browser receives the policy on the interface's first call. Owner to confirm |
| A broken snippet | OMV's nginx state runs `nginx -t` before restarting, so nginx stays up on the old configuration. But every apply that touches nginx then fails, with our file named in the error, until the snippet is fixed. The `postinst` guard in [06](06-plugin-packaging.md) is essential |

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

| Case | HTTP | Message |
|---|---|---|
| Wrong password | 400 | Incorrect username or password. |
| Validation failure | 400 | `<field path>: <reason>`, e.g. `port: The value '99999' is bigger than 65535.`; a missing required field gives an empty path (`: Missing 'required' attribute 'limit'.`) |
| Forbidden for role | 403 | Invalid context role. |
| No session / expired | 401 | Session not authenticated. / Session expired. |
| Unknown method or service | 404 | The method '…' does not exist for the RPC service '…'. / RPC service '…' not found. |
| Backend exception (missing object) | 500 | e.g. The user '…' does not exist.; for a missing UUID, the raw XPath query text |
| Body not JSON, or `method` missing | 500 | Failed to get the RPC parameters. / `: Missing 'required' attribute 'method'.` |

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
