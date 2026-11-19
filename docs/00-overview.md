# 00 — Overview

## What this is

`openmediavault-webui` is a plugin for openmediavault (OMV) 8. To the person installing it, it is a new web interface for their NAS. It is one package. It installs static files and one small web-server rule, and nothing else.

## How it fits

```
browser ──▶ nginx (OMV's own site, OMV's own port)
              ├── /            stock interface (unchanged)
              ├── /ui/         the new interface (static files from this plugin)
              └── /rpc.php     OMV's backend endpoint, used by both ──▶ omv-engined ──▶ system
```

- Same address and port as OMV today, under `/ui/`.
- Same login: the new interface uses OMV's own `Session` login and session cookie. A user signed in to one interface is signed in to the other.
- Same backend: every call is a `POST` to `rpc.php`, as the stock interface makes.

## Goals

1. **A coherent, well-designed interface** for daily NAS administration, following the [style guide](design/style-guide.md).
2. **A typed client from a contract.** An OpenAPI document in this repository describes each backend method the interface uses: parameters, response, required role. DTOs and TanStack Query hooks are generated from it, as in the reference application (`wheelhub-web-app`).
3. **Trivial installation.** One plugin from the plugin list; no settings required; a link appears in the stock interface.
4. **No changes to OMV.** Installs, upgrades and removes cleanly.
5. **A transport seam.** Only one module knows the backend is `rpc.php`, so the backend endpoint can be replaced later without touching pages.

## Non-goals

- **Changing the backend, the login or the session handling.** They are OMV's.
- **Fixing security weaknesses in OMV's web layer.** The interface cannot, and does not claim to. Those are reported and fixed upstream. See [05](05-security.md#inherited-and-not-fixable-here).
- **The API gateway.** Designed, parked: [later-gateway](later-gateway/README.md).
- **Feature parity on day one.** Coverage grows domain by domain; the stock interface remains available for everything else.
- **Rendering other plugins' pages** in version 1. Other plugins keep working in the stock interface. See [01](01-decisions.md#open-questions).

## Glossary

| Term | Meaning |
|------|---------|
| **engined** | `omv-engined`, OMV's root RPC daemon |
| **`rpc.php`** | OMV's web endpoint; takes `{service, method, params}` and forwards to engined |
| **stock interface** | The Angular "workbench" OMV ships |
| **contract** | The OpenAPI document in the `spec-api-omv` package (`web/packages/spec-api-omv/src/`) |
| **operation** | One entry in the contract; maps to exactly one backend `service.method` |
| **transport module** | The single hand-written module that turns a generated client call into an `rpc.php` request |
| **pending changes** | OMV stores most settings first and applies them to the system only when the administrator confirms ("apply") |
| **review ID** | `H1`…, `M1`…: findings of a private security review of OMV's web layer, named here by class only |
| **UI-…** | A numbered security rule in [05](05-security.md) |
| **D…** | A numbered decision in [01](01-decisions.md) |
| **A…** | A numbered assumption to verify in Phase 0, listed in [07](07-implementation-plan.md) |

## Facts this design rests on

Read from the OMV source at upstream `master` (8.6.x), November 2026. Each is re-checked on a running system in Phase 0.

| Fact | Source in the OMV tree |
|------|------------------------|
| One endpoint, `rpc.php`; body `{service, method, params, options?}`; reply `{response, error}`; on error an HTTP error status and `error: {code, message, trace}` | `var/www/openmediavault/rpc.php`, `rpc/proxy/json.inc` |
| 448 registered methods (266 core); 181 parameter schemas (`rpc.*`) and 66 configuration schemas (`conf.*`) in an OMV-specific JSON Schema dialect; no response schemas | `engined/rpc/*.inc`, `datamodels/*.json` |
| Login is `Session.login {username, password}`; if a second factor is enrolled the reply is `challengeRequired` and `Session.verify` completes it; `Session.logout` ends it | `var/www/openmediavault/rpc/session.inc`, `docs/AUTH_PLUGIN_GUIDE.md` |
| The session is a PHP session cookie (HttpOnly, SameSite=Strict); idle timeout from `conf.webadmin` (default 5 minutes) | `session.inc`, `php.ini` |
| Roles: administrator and user; 377 methods are administrator-only, 14 open to any signed-in user | `engined/rpc/*.inc` |
| Paged lists return `{total, data}` and take `{start, limit, sortfield, sortdir, search}` | `rpc.common.json`, `serviceabstract.inc` |
| Long work returns a task handle (a file name) followed through `Exec.getOutput` / `isRunning` / `stop` | `engined/rpc/exec.inc` |
| Settings mark modules "dirty"; `Config.isDirty`, `applyChangesBg`, `revertChangesBg` | `engined/rpc/config.inc` |
| nginx serves `/var/www/openmediavault` and includes `/etc/nginx/openmediavault-webgui.d/*.conf` inside the server block | `srv/salt/omv/deploy/nginx/files/site-webgui.j2` |
| The stock Content Security Policy allows inline and evaluated script | `srv/salt/omv/deploy/nginx/files/headers.conf.j2` |
| Empty maps come back as `[]` (PHP encoding) | `usr/sbin/omv-engined` |
