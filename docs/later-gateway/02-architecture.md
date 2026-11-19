# 02 — Architecture

## Components

```
                         ┌────────────────────────── NAS ───────────────────────────────┐
                         │                                                              │
 browser ── HTTPS :8443 ─┼─▶ nginx server block "openmediavault-gateway"                │
                         │      ├─ /            static files of the new interface       │
                         │      └─ /api/        proxy_pass ──▶ unix:/run/openmediavault-gateway/http.sock
                         │                                         │                    │
                         │                              omv-gatewayd (Go)               │
                         │                              user openmediavault-gateway     │
                         │                              no network, read-only root fs   │
                         │                                         │                    │
                         │                         unix:/var/lib/openmediavault/engined.sock
                         │                                         │                    │
                         │                              omv-engined (PHP, root)         │
                         │                                                              │
 browser ── HTTP(S) :80/443 ─▶ nginx stock server block ─▶ rpc.php … (unchanged)        │
                         └──────────────────────────────────────────────────────────────┘
```

| Component | Role | Trust |
|-----------|------|-------|
| nginx server block | TLS termination, static files, security headers for documents, request size and rate caps, proxy to the gateway | Trusted to set `X-Real-IP`, `X-Server-Addr`, `X-Forwarded-Proto`; the gateway accepts those headers only because the listening socket admits nginx alone |
| `omv-gatewayd` | Everything in the request lifecycle below | Root-equivalent through the engined socket; isolated by systemd |
| `omv-engined` | Executes RPC methods | Unchanged; trusts its callers |
| Web interface | Static single-page application | Untrusted input to the gateway, like any client |
| Plugin glue in OMV | Settings datamodel, an engined RPC service for the plugin's own settings, Salt states, a settings page in the legacy workbench | Runs inside OMV's own mechanisms |

## The gateway's internal structure

```
gateway/
  cmd/omv-gatewayd/        main: load config, load contract, adopt listener, serve
  internal/
    config/                parse and validate the config file; no defaults that weaken
    contract/              load compiled contract + fragments; route table; schemas
    httpx/                 server setup, limits, header policy, error rendering
    guard/                 the ordered request checks (host, method, origin, session, role, …)
    session/               store, cookies, request tokens, step-up, revalidation
    auth/                  login state machine, pending challenges, rate limiting
    engined/               socket client: framing, deadlines, concurrency, size caps
    normalise/             response shaping by schema (empty map/list, secrets)
    tasks/                 opaque task table, poller, SSE fan-out
    files/                 download and upload handling
    audit/                 structured security log
    redact/                schema-driven redaction for logs
```

Rules for the package graph:

- `engined` is the only package that opens the backend socket. Its exported call takes an operation from `contract`, never free-form service and method strings.
- `guard` is the only path from an HTTP request to `engined`. No handler calls `engined` without passing through it. The login state machine in `auth` is the single, explicit exception and uses a fixed internal operation set.
- Nothing imports `net` to dial. A lint rule forbids `net.Dial*` and `http.Client` outside `engined` (unix only).

## Request lifecycle

Every request to `/api/` passes these stages in this order. A failure at any stage ends the request with the stated status and an audit record. Later stages never run.

| # | Stage | Check | Failure |
|---|-------|-------|---------|
| 1 | Transport | Arrived on the nginx socket; `X-Forwarded-Proto` is `https` | 400 |
| 2 | Limits | Header size, body size (per operation, default 1 MiB), read deadlines | 431 / 413 / 408 |
| 3 | Host | `Host` is an allowed name, or the literal address in `X-Server-Addr` | 421 |
| 4 | Route | Path and method match a contract operation exactly | 404 / 405 |
| 5 | Origin | `Origin` equals the gateway origin; `Sec-Fetch-Site` absent or `same-origin`; `Content-Type` is `application/json` (or the operation's declared type) | 403 / 415 |
| 6 | Session | Unless the operation is public: valid cookie and matching request token; not idle- or absolute-expired; not restricted (or operation permitted in restricted state) | 401 |
| 7 | Role | Session role satisfies the operation's `x-omv-role` | 403 |
| 8 | Step-up | If `x-omv-sensitivity: elevated`: elevated within the window | 403 with `code: step_up_required` |
| 9 | Rate | Per-session and global budgets for this operation class | 429 |
| 10 | Body | Strict JSON parse (UTF-8, depth and size limits), then validation against the operation's request schema; unknown properties rejected | 400 |
| 11 | Dispatch | Acquire concurrency slots; build the engined request from the contract's `x-omv-rpc` and the **validated, re-serialised** parameters; context from the session only | 503 if no slot |
| 12 | Response | Size cap; map backend error to the public error shape; normalise by schema; in development mode validate against the response schema | 502 on malformed backend reply |
| 13 | Side effects | Apply the operation's declared session effect (for example revoke the user's sessions after a password change); write the audit record | — |

Every operation is a `POST`, including reads, event streams and downloads, so that every request can carry the request token header and an `Origin`. The single `GET` under `/api/` is the health check. See [05](05-authentication-and-sessions.md#requests-that-cannot-set-headers).

## Process model

- One process, no children, no shell-outs. The gateway never executes a program.
- Listener: a unix stream socket created by a systemd `.socket` unit (`SocketMode=0660`, `SocketGroup=www-data`) and passed to the daemon. The daemon does not create listening sockets.
- State is in memory: sessions, pending logins, rate-limit counters, the task table. A restart logs everyone out. This is deliberate: there is no session file to steal, corrupt or leave behind.
- Configuration is one JSON file written by the plugin's Salt state, owned `root:openmediavault-gateway`, mode `0640`. The daemon reads it at start and on `SIGHUP` re-reads only the fields marked reloadable (allowed host names, timeouts). It contains no secrets.
- The contract is embedded in the binary (`go:embed`). Fragments are read from `contract.d/` at start.
- Logs go to the journal as structured entries. The gateway writes no files.

## Repository layout

```
contract/
  src/index.yaml               OpenAPI 3.0.3 root
  src/operations/<Service>/    one file per operation
  src/schemas/                 shared schemas
  src/examples/                captured example responses
  redocly.yaml, plugins/       lint rules, including the x-omv-* rules
  generated/openapi.json       bundled output (committed)
gateway/                       Go module (see above)
web/
  pnpm-workspace.yaml
  packages/spec-api-omv/       re-exports contract/generated/openapi.json
  packages/ts-api-omv/         generated DTOs, no dependencies
  packages/react-api-omv/      generated TanStack Query hooks + the axios mutator
  packages/css-ui-style/       built from design/tokens.css
  packages/react-ui-components/
  apps/omv-web-app/            the interface
debian/                        packaging
srv/salt/omv/deploy/gateway/   Salt states and templates
usr/share/openmediavault/
  datamodels/conf.service.gateway.json, rpc.gateway.json
  engined/rpc/gateway.inc      get/set of the plugin's settings (+ notification helper)
  engined/module/gateway.inc   service module (deploy hooks)
  workbench/…                  settings page for the legacy workbench (YAML)
  confdb/create.d/             config initialisation
design/, tools/, docs/
```

The `web/` workspace mirrors the reference application's packages on purpose: a spec package, a dependency-free DTO package, a React client package with one generator run, and the application. See [07](07-api-contract.md#the-pipeline).

## What is deliberately absent

- No database, no cache server, no message queue.
- No plugin system inside the gateway. Extension is by contract fragment only.
- No administrative API on the gateway itself. It is configured through OMV like any other service.
- No debug mode in release builds. Development-only behaviour (response schema validation, verbose errors) is behind a build tag that the Debian build does not set, and the binary reports which it is at start.
