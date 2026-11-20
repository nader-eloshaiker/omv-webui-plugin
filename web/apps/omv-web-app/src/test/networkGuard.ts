// SPDX-License-Identifier: GPL-3.0-or-later
// The test network guard, modelled on the reference application's: every connection a test worker
// opens to the network is refused before a syscall is made, and recorded by the request that opened
// it. A test states the answers it needs through MSW; anything nothing answered fails the test
// (frontend-architecture.md, "Testing").
//
// It patches the native TCP handle's `connect` / `connect6` - the call that makes the connect(2)
// syscall - so it sits below happy-dom, jsdom, undici and msw and depends on none of their
// internals. msw answers a request without ever reaching it (msw 3 fakes the connect on the socket's
// own handle rather than the prototype's), and lets an unanswered one through to here, because the
// test server runs with `onUnhandledFrame: "bypass"`. Not `net.Socket.prototype.connect`: msw 3
// patches that and calls through it for the requests it answers, so a guard there would refuse
// those too.
//
// A synchronous happy-dom XHR runs in a child process that no hook in the worker sees, so
// happy-dom's `beforeSyncRequest` interceptor refuses that one.

// src/ is typed for the browser; the guard runs in the Node worker, where these exist. Only what the
// guard calls is declared.
interface TcpHandlePrototype {
  connect: TcpConnect;
  connect6: TcpConnect;
  [INSTALLED]?: true;
}
type TcpConnect = (request: unknown, address: string, port: number) => number;
interface NodeProcess {
  binding(name: "tcp_wrap"): { TCP: { prototype: TcpHandlePrototype } };
  getBuiltinModule(id: "node:diagnostics_channel"): {
    subscribe(name: string, onMessage: (message: unknown) => void): void;
  };
  getBuiltinModule(id: "node:os"): {
    constants: { errno: { ECONNREFUSED: number } };
  };
}

/** One connection the guard refused, and the request that opened it once Node has said which. */
interface Refusal {
  readonly target: string;
  request?: { readonly line: string };
}

// Kept on `globalThis` under a symbol rather than in a module variable, so a fresh copy of this
// module (a test file importing it after a module reset) writes to the same list as the patched handle.
const REFUSALS = Symbol.for("omv-webui.test.network-guard.refusals");
// Marks the TCP prototype once it is patched: setup.ts runs once per file, and the patch and the
// channel subscriptions must happen once per worker.
const INSTALLED = Symbol.for("omv-webui.test.network-guard.installed");

const refusals = (): Refusal[] =>
  ((globalThis as { [REFUSALS]?: Refusal[] })[REFUSALS] ??= []);

// Invariant: Vitest runs every test file in Node, so `process` is Node's.
const nodeProcess = () =>
  (globalThis as unknown as { process: NodeProcess }).process;

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null;

/**
 * The `address:port` targets a connect error names, as the patched handle recorded them. A host with
 * several addresses (`localhost` is `::1` and `127.0.0.1`) fails as an AggregateError over each, and
 * undici wraps the socket's error as its `cause`.
 */
const targetsOf = (error: unknown, depth = 0): string[] => {
  if (!isRecord(error) || depth > 3) {
    return [];
  }
  const own =
    typeof error.address === "string" && typeof error.port === "number"
      ? [`${error.address}:${error.port}`]
      : [];
  const each = Array.isArray(error.errors) ? error.errors : [];
  return [
    ...own,
    ...each.flatMap((inner) => targetsOf(inner, depth + 1)),
    ...targetsOf(error.cause, depth + 1),
  ];
};

interface ClientRequestLike {
  method: string;
  protocol: string;
  host: string;
  path: string;
  getHeader: (name: string) => unknown;
}
const isClientRequest = (value: unknown): value is ClientRequestLike =>
  isRecord(value) &&
  typeof value.method === "string" &&
  typeof value.protocol === "string" &&
  typeof value.host === "string" &&
  typeof value.path === "string" &&
  typeof value.getHeader === "function";

// `http.client.request.error`: `{ request: http.ClientRequest, error }`, for `http` and `https`.
const httpRequestLine = (message: unknown) => {
  if (!isRecord(message) || !isClientRequest(message.request)) {
    return undefined;
  }
  const { request } = message;
  const host = request.getHeader("host");
  const authority = typeof host === "string" ? host : request.host;
  return `${request.method} ${request.protocol}//${authority}${request.path}`;
};

// `undici:request:error`: `{ request: { method, origin, path }, error }`, for Node's `fetch`.
const undiciRequestLine = (message: unknown) => {
  if (!isRecord(message) || !isRecord(message.request)) {
    return undefined;
  }
  const { method, origin, path } = message.request;
  if (typeof method !== "string" || typeof path !== "string") {
    return undefined;
  }
  if (typeof origin === "string") {
    return `${method} ${origin}${path}`;
  }
  return origin instanceof URL
    ? `${method} ${origin.origin}${path}`
    : undefined;
};

/**
 * Name the refusals a failed request's error accounts for. An error that names none of them is not
 * the guard's (msw answering with a network error), or names refusals already taken - a request
 * still in flight when its test ended, already reported by address there - and is dropped.
 */
const nameRefusals = (
  message: unknown,
  lineOf: (message: unknown) => string | undefined,
) => {
  const line = lineOf(message);
  if (line === undefined || !isRecord(message)) {
    return;
  }
  const targets = new Set(targetsOf(message.error));
  const request = { line };
  for (const refusal of refusals()) {
    if (!refusal.request && targets.has(refusal.target)) {
      refusal.request = request;
    }
  }
};

const installSocketGuard = () => {
  const node = nodeProcess();
  // `process.binding` is a documentation-only deprecation (DEP0111): Node 24 prints no warning for it.
  const { prototype } = node.binding("tcp_wrap").TCP;
  if (prototype[INSTALLED]) {
    return;
  }
  const { ECONNREFUSED } = node.getBuiltinModule("node:os").constants.errno;
  const refuse: TcpConnect = (_request, address, port) => {
    refusals().push({ target: `${address}:${port}` });
    // A negative errno is how the handle reports a failed connect: net.js turns it into
    // `connect ECONNREFUSED <address>:<port>` and destroys the socket. No syscall is made.
    return -ECONNREFUSED;
  };
  prototype.connect = refuse;
  prototype.connect6 = refuse;
  prototype[INSTALLED] = true;

  // The handle knows only `address:port`. Node publishes the request that failed on these channels,
  // so the record can name it as `METHOD url` without patching anything else. Not
  // `http.client.request.created`: that also fires for a request msw answers.
  const channels = node.getBuiltinModule("node:diagnostics_channel");
  channels.subscribe("http.client.request.error", (message) =>
    nameRefusals(message, httpRequestLine),
  );
  channels.subscribe("undici:request:error", (message) =>
    nameRefusals(message, undiciRequestLine),
  );
};

interface GuardedRequest {
  method: string;
  url: string;
}
interface HappyDomWindow {
  happyDOM?: { settings: { fetch: { interceptor: unknown } } };
}

// `data:` and `blob:` never leave the process; everything else would.
const leavesTheProcess = (url: string) => !/^(data|blob):/i.test(url);

/**
 * Refuse every connection the worker opens, and every synchronous happy-dom XHR, recording each.
 *
 * Idempotent: the Node half installs once per worker, and the happy-dom half once per window. A file
 * pinned to jsdom gets the Node half only - jsdom's synchronous XHR also runs in a child process, and
 * nothing in the app sends one.
 */
export function installNetworkGuard() {
  installSocketGuard();
  const happyDOM = (window as unknown as HappyDomWindow).happyDOM;
  if (!happyDOM) {
    return;
  }
  happyDOM.settings.fetch.interceptor = {
    // Throwing is a network error: happy-dom's XHR catches it and dispatches `error`, as it does for
    // an asynchronous request the socket guard refused.
    beforeSyncRequest: ({ request }: { request: GuardedRequest }) => {
      if (!leavesTheProcess(request.url)) {
        return undefined;
      }
      const line = `${request.method} ${request.url}`;
      refusals().push({ target: request.url, request: { line } });
      throw new Error(`The test network guard refused ${line}.`);
    },
  };
}

/**
 * The requests refused since the last call, one line each, and the record is emptied.
 *
 * A refusal Node has named reads `METHOD url`; one it has not - a raw socket, or a request still in
 * flight - reads `connect <address>:<port>`, one line per address tried.
 */
export function takeLeakedRequests(): string[] {
  const taken = refusals().splice(0);
  const named = new Set<Refusal["request"]>();
  const lines: string[] = [];
  for (const { target, request } of taken) {
    if (!request) {
      lines.push(`connect ${target}`);
    } else if (!named.has(request)) {
      named.add(request);
      lines.push(request.line);
    }
  }
  return lines;
}

/**
 * Fail if anything was refused since the last call: every request a test sends must be answered by
 * the test's own MSW handlers. setup.ts calls this after every test.
 */
export function failOnLeakedRequests(): void {
  const leaked = takeLeakedRequests();
  if (leaked.length === 0) {
    return;
  }
  throw new Error(
    `This test sent ${leaked.length} request(s) that nothing answered; the network guard refused them. ` +
      `Answer them through MSW (src/test/server.ts):\n\n${[...new Set(leaked)].join("\n")}`,
  );
}

/**
 * Node's own console, which happy-dom prints a refused request's error through (not the test's
 * `console`). A test that sends a request on purpose mutes it.
 */
export const nodeConsole = (): { error: (...args: unknown[]) => void } =>
  (
    globalThis as unknown as {
      process: {
        getBuiltinModule(id: "node:console"): {
          error: (...args: unknown[]) => void;
        };
      };
    }
  ).process.getBuiltinModule("node:console");
