# 06 — The engined protocol

How the gateway talks to `omv-engined`, derived from `usr/sbin/omv-engined` and `usr/share/php/openmediavault/rpc/rpc.inc` at upstream 8.6.x. Everything here is re-verified against a running system in Phase 0 (assumptions `A1`–`A6` in [09](09-implementation-plan.md)).

## Transport

- Unix stream socket at `/var/lib/openmediavault/engined.sock`. Mode `0770`, group `openmediavault-engined`.
- One request and one reply per connection. The client connects, writes, reads, closes.
- **No authentication.** The daemon does not inspect peer credentials. Membership of the group is the whole of the access control.

## Framing

```
client → daemon:   <JSON object, UTF-8> 0x00
daemon → client:   <JSON object, UTF-8> 0x00
```

The terminator is a single NUL byte. Neither side sends a length. The daemon reads until it sees NUL at the end of a chunk or the peer closes.

## Request

```json
{
  "service": "SSH",
  "method": "get",
  "params": { },
  "context": {
    "username": "alice",
    "role": 1,
    "_SERVER": { "REMOTE_ADDR": "192.0.2.10", "HTTP_USER_AGENT": "…" }
  }
}
```

| Field | Notes |
|-------|-------|
| `service`, `method` | From the contract's `x-omv-rpc` only |
| `params` | The validated, re-serialised parameters. An operation without parameters sends `null` (the legacy layer sends `[]` for an absent body; `A2` confirms which the methods expect) |
| `context.username` | From the session |
| `context.role` | Integer bit mask: `1` administrator, `2` user |
| `context._SERVER` | Optional. The legacy layer forwards up to fifteen server variables for the login call. The gateway sends at most `REMOTE_ADDR` and `HTTP_USER_AGENT` (SR-CTX-4), and only for the internal login operations |

## Reply

```json
{ "response": <any JSON value>, "error": null }
```

or

```json
{
  "response": null,
  "error": {
    "code": 0,
    "message": "…",
    "trace": "…full PHP exception with stack and paths…",
    "http_status_code": 500
  }
}
```

- `http_status_code` is the status the legacy layer would send. The gateway maps it through the table in [07](07-api-contract.md#errors) and never trusts it blindly: only values the table lists are used, anything else becomes 500.
- `trace` is logged and dropped (SR-OUT-1).
- `message` may contain file paths, command lines and command output. See SR-OUT-2 for what reaches the client.

## Behaviours the client must respect

### The daemon reads the request before it forks

The accept loop reads the entire request in the parent process and only then forks a child to execute it. While one client is slow to send, nobody else is served. If the read fails, the daemon logs an error and **exits**; OMV's process supervision restarts it.

Consequences for the gateway (SR-ENG-1):

- Serialise the whole request first. Write it with a single `write` call loop under a 5-second deadline. Never stream a request, never write a partial request and wait.
- Never close the connection between the first byte and the terminator unless the write deadline fires, and treat that event as an incident: log it at error level with the operation ID.
- Keep requests small (SR-ENG-3). Uploads pass a path, not content.

### One PHP process per request

Each call costs a fork and a PHP bootstrap. The gateway's concurrency limits (SR-DOS-1..3) exist to protect a small NAS from its own administration interface. Expect tens to low hundreds of milliseconds of overhead per call; `A5` measures it on the target hardware so the limits and the interface's polling intervals can be set with real numbers.

### Timeouts

The legacy client waits up to 180 s for a reply. The gateway's ceiling is 170 s (SR-ENG-2), the default 30 s, set per operation. Long work must be a background task; an operation that needs more than a few seconds synchronously is a contract smell to raise.

When the gateway gives up, it closes the connection. **The child process keeps running to completion**; there is no cancellation in the protocol. The interface must therefore treat 504 on a state-changing operation as "outcome unknown" and re-read state, never as "nothing happened" and never by retrying automatically. The generated client is configured with no automatic retry for mutations.

### Empty maps arrive as empty lists

The daemon decodes JSON into PHP associative arrays and encodes replies from PHP arrays. PHP encodes an empty array as `[]` whether it was a list or a map. A response property that the contract types as an object therefore arrives as `[]` when it is empty.

The normaliser (SR-ENG-4, `internal/normalise`) walks the reply with the operation's response schema:

| Schema says | Backend sent | Result |
|-------------|--------------|--------|
| `object` | `[]` | `{}` |
| `object` | non-empty list | contract violation → 502 in development mode, logged and passed in release mode |
| `array` | `{}` | `[]` |
| `array` | object with keys | Values in key order if all keys are consecutive integers from 0 (PHP's encoding of a list with gaps removed); otherwise violation as above |
| property `writeOnly` or `x-omv-secret` | anything | removed (SR-OUT-4) |

The same ambiguity exists on the way in: the backend cannot tell `{}` from `[]` in parameters. The contract avoids parameters where that difference would matter.

### Numbers and strings

- PHP integers are 64-bit; JSON numbers beyond 2^53 lose precision in a browser. Byte counts for large disks exceed that. The contract types such values as strings (`x-omv-int64: true`), and the normaliser converts. `A4` lists which fields in the first operations need it.
- The backend may return numeric values as strings and booleans as `0`/`1` in places. The normaliser coerces only where the response schema carries `x-omv-coerce: true`, added deliberately per field when a capture shows the need. There is no global coercion.
- The backend's JSON encoder substitutes invalid UTF-8. The gateway additionally rejects a reply that is not valid UTF-8 (502).

### Local versus remote services

In the legacy layer a service found inside the web process is executed there and never reaches the daemon. Only the `Session` service is of that kind. The gateway re-implements `Session` ([05](05-authentication-and-sessions.md)) and reaches everything else through the socket. `A3` confirms no other local service exists on a stock install.

### Response mutators

A service may register a function that rewrites the reply of another service's method (`registerMutatingMethod`). In the upstream tree only the two-factor plugins use it, on `UserMgmt.authUser` and `UserMgmt.verifyChallenge`. This happens inside the daemon and is invisible on the wire. It matters to the contract: a response schema must not assume that only OMV core contributes fields. Response schemas are therefore open (`additionalProperties` not set to `false`), and the gateway passes unknown properties through, except in the login flow, where only the fields named in [05](05-authentication-and-sessions.md) are read and nothing is forwarded.

### Background tasks

Methods that start long work return a string: the path of a status file under the system temporary directory. The client then calls the `Exec` service with that path:

| `Exec` method | Parameters | Returns |
|---------------|------------|---------|
| `getOutput` | `{filename, pos, length?}` | `{filename, pos, output, pendingOutput, running}`; throws the task's error if it failed |
| `isRunning` | `{filename}` | `{filename, running}` |
| `stop` | `{filename}` | — |
| `attach` | `{filename}` | attaches to a running task's output |
| `enumerate` | — | running tasks |

The gateway never lets the client name a file (SR-TASK-1..3). See [07](07-api-contract.md#background-tasks) for the public shape. The gateway polls `getOutput` with `length` set (64 KiB) so a single reply is bounded, at an interval that starts at 500 ms and backs off to 2 s while there is no new output.

## The client's interface in Go

```go
// Package engined is the only code that opens the backend socket.
type Call struct {
    Op      *contract.Operation // service, method, timeout, size limits
    Params  json.RawMessage     // produced by the validator's re-serialisation, never client bytes
    Context Context             // built by session or by auth's internal context constructor
}

type Reply struct {
    Response json.RawMessage
    Err      *BackendError // code, message, status; trace is logged inside the package and not exported
}

func (c *Client) Do(ctx context.Context, call Call) (Reply, error)
```

- `Context` has unexported fields and two constructors: `FromSession(*session.Session)` and `internalAdmin()`, the latter unexported and reachable only from `internal/auth` through a narrow function per internal operation. A caller cannot assemble a context by hand.
- `Do` acquires the concurrency slots, applies deadlines and caps, and returns typed errors for: no slot, connect failure, write timeout, read timeout, oversized reply, malformed reply.
- The package has a fake server for tests that implements the framing and can be scripted to misbehave (slow, truncated, oversized, invalid UTF-8, wrong shape). The fuzz target feeds arbitrary bytes as the reply.

## Assumptions to verify on a running system

Listed with their identifiers in [09](09-implementation-plan.md#phase-0--verify-the-ground). The protocol facts above came from reading code. Do not build past Phase 0 on any of them unverified.
