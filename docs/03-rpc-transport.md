# 03 — The RPC transport

How `rpc.php` behaves and what the transport module does about it. Read from the OMV source at 8.6.x; each point marked with an `A` number is verified on a running system in Phase 0 ([07](07-implementation-plan.md#phase-0--verify-the-ground)).

## Requests

```
POST /rpc.php
Content-Type: application/json
Cookie: <OMV session cookie>           (sent by the browser; same origin)

{ "service": "SSH", "method": "set", "params": { … }, "options": { "updatelastaccess": false } }
```

| Field                      | Notes                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `service`, `method`        | From the contract's `x-omv-rpc`, fixed at build time. Never from user input, a URL or a response    |
| `params`                   | The operation's request body, or `{}` when the operation has none (`A2`: rpc.php treats them alike) |
| `options.updatelastaccess` | `false` on background polling so it does not extend the session; omitted otherwise                  |

The transport always uses `POST` with a JSON body and `credentials: "same-origin"`. It never uses the endpoint's other accepted forms (query-string parameters, other content types).

## Replies

Success: HTTP 200, `{ "response": <value>, "error": null }`. The transport returns `response` after normalisation.

Failure: an HTTP error status and

```json
{ "response": null, "error": { "code": 0, "message": "…", "trace": "…" } }
```

The transport throws one error type:

```ts
class RpcError extends Error {
  status: number; // HTTP status
  code: number | null; // backend's numeric code
  message: string; // backend's message, shown as text
  operationId: string;
}
```

- `trace` is discarded immediately. It is never stored, logged to the console in production, or shown (UI-9).
- A reply that is not JSON, or not of this shape, becomes an `RpcError` with a generic message.
- Network failure and timeouts become an `RpcError` with status 0.

| Status  | Meaning to the application                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------- |
| 401     | Session missing or expired. Clear session state, cancel queries, show login. The transport does this itself, once |
| 403     | Not permitted for this role                                                                                       |
| 400     | The backend rejected the parameters, or a domain error ("device busy"). Show `message`                            |
| 429     | Too many attempts (login and second-factor verification). Show the wait                                           |
| 5xx / 0 | Backend failure. For a mutation, the outcome is unknown: re-read state; never retry automatically                 |

Queries may retry on network failure (TanStack Query default behaviour, capped at 2). Mutations never retry automatically.

## Login

All three are methods of the `Session` service, called through `rpc.php` like any other. They are the only calls allowed without a session.

**`Session.login {username, password}`** returns one of:

```json
{ "status": "authenticated", "username": "…", "permissions": { "role": "admin" | "user" }, "sessionid": "…" }
{ "status": "challengeRequired", "username": "…", "challenge": { "kind": "totp", "redirecturl": "…" } }
```

- Wrong credentials: HTTP 400 with a message. Too many failed second-factor attempts for that user: 429.
- The session cookie is set by the server. The transport **ignores `sessionid`** and never stores or sends it (UI-6).
- `redirecturl` is ignored. The interface maps `kind` to its own screen (UI-3). A `kind` it does not know shows "this sign-in method is not supported here yet" with a link to the stock interface.

**`Session.verify {…}`** completes a pending second factor. The body carries the challenge response whose shape depends on `kind` (`A10` records the exact shape for each two-factor plugin). Success returns the `authenticated` form. Failure is 400; after repeated failures 429 with a growing delay (5 s doubling to 300 s); a pending login expires after 300 s (401).

**`Session.logout {}`** ends the session.

After login the application holds only: user name, role, and whether a session exists. On a page reload it learns whether a session exists by making its first ordinary call and handling 401.

**Idle timeout.** OMV ends a session after a period without activity (administrator setting; default 5 minutes; 0 disables). The interface reads the setting where the role allows, shows a warning shortly before expiry with a "stay signed in" action, and otherwise simply handles the 401.

## Roles

`permissions.role` is `admin` or `user`. The contract records the role each operation needs (`x-omv-role`). The interface uses it to decide what to show. The backend decides what is allowed.

## Paged lists

Request: `{ start, limit, sortfield?, sortdir?, search? }` (`limit: null` or `-1` for all; `A2` confirms). Reply: `{ total, data: [...] }`. Sorting and searching are done by the backend over the whole list. The contract has one generic envelope per item type; the interface has one table data hook that maps table state to these parameters.

## Pending changes

- Most `set`/`delete` methods store configuration and mark one or more modules "dirty". Nothing changes on the system yet.
- `Config.isDirty {}` → boolean. `Config.applyChangesBg { modules: [], force: false }` and `Config.revertChangesBg { filename: "" }` start tasks (`A6` confirms parameters).
- Some read methods refuse while their module is dirty (the backend throws a "configuration is dirty" error). The transport maps that to a recognisable `RpcError` so pages can show "apply pending changes to see current status" instead of a failure.
- Operations that dirty configuration carry `x-omv-dirty` in the contract; after each such mutation succeeds the pending-changes query is invalidated.

## Background tasks

A method that starts long work returns a string: a task handle (the path of a status file on the server). The client follows it with the `Exec` service:

| Method           | Parameters                   | Returns                                                                                   |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| `Exec.getOutput` | `{ filename, pos, length? }` | `{ filename, pos, output, pendingOutput, running }`; throws the task's error if it failed |
| `Exec.isRunning` | `{ filename }`               | `{ filename, running }`                                                                   |
| `Exec.stop`      | `{ filename }`               | —                                                                                         |

The task helper:

- Polls `getOutput` from the last `pos`, starting at 500 ms and backing off to 2 s when there is no new output, with `updatelastaccess: false`.
- Exposes `{ state: running | done | failed, output, result?, error? }` to a hook, and `stop()`.
- When a task ends and the operation's contract entry declares a result schema, parses the final output as JSON for the result. Otherwise the output is text.
- Treats the handle as opaque: holds it in memory only, never shows it, never puts it in a URL or storage, and passes to `Exec` only handles it received from a task-starting call in this page session (UI-5). The transport enforces the last part: it remembers the handles task-starting operations returned, refuses an `Exec` call with any other, and forgets a handle once the server has dropped it.
- Renders output as plain text in the terminal-style component of the style guide.

## Downloads

OMV has a second endpoint, `download.php`, which runs a method and returns its result as a file. The interface uses it for a fixed, short list of operations marked `x-omv-download` in the contract (initially the log file download only), by `POST` with the same JSON body, reading the reply as a blob and saving it. It is never called with a service or method that is not on that list, and never via a link or navigation (UI-4). Charts are drawn from data, not from the server's pre-rendered graph images (`A7` checks what data is available).

## Uploads

Two backend methods take an uploaded package file. Not in version 1.

## Quirks the transport normalises

Applied using the operation's response schema from the contract, so pages receive what the types say.

| Quirk                                                                                                  | Handling                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty object arrives as `[]` (PHP encodes empty maps and empty lists the same)                         | Where the schema says object and the value is `[]`, substitute `{}`                                                                                                                                       |
| Integers above 2^53 (byte counts of large disks) lose precision in JavaScript                          | The contract types such fields as strings (`x-omv-int64`); the transport parses the reply so they are preserved as strings (`A4` lists the fields; the method depends on how the backend serialises them) |
| Booleans as `0`/`1`, numbers as strings, in some fields                                                | Converted only for fields marked `x-omv-coerce` in the contract. No global coercion                                                                                                                       |
| Text already translated or formatted by the server (some `description` fields, `getStats` text blocks) | Typed as display text; rendered as text; raw fields preferred where they exist                                                                                                                            |
| Fields added by other plugins to a core method's response                                              | Response schemas are open; unknown fields are ignored by the types and passed through                                                                                                                     |

In development and test builds the transport also validates each response against its schema and reports mismatches in the console, to catch contract drift (D4). Production builds do not validate.

## The module's surface

```ts
// web/packages/react-api-omv/src/transport/rpcClient.ts
export const rpcClient = <T>(
  config: {
    url: string; // "/rpc/SSH/set" — from the generated client
    method: "POST";
    data?: unknown;
    signal?: AbortSignal;
  },
  options?: { background?: boolean },
) => Promise<T>;
```

- Resolves `url` against a table generated from the contract (`operationId`, `service`, `method`, response schema reference, flags). A `url` not in the table throws before any request is made.
- The endpoint paths `/rpc.php` and `/download.php` are constants. They are not configurable at run time (UI-3).
- Nothing else in the workspace imports `fetch`. A lint rule enforces it.

Replacing the backend endpoint later means reimplementing this file against the same signature.
