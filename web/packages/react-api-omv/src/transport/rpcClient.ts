// SPDX-License-Identifier: GPL-3.0-or-later
// The transport module: the only code in the workspace that knows rpc.php (docs/03, D5, UI-10).
// orval's generated client calls rpcClient() as its mutator with {url, method, data, signal}; the
// url is a contract path such as "/rpc/SSH/set", resolved against the operation table generated
// from the contract. Replacing the backend later means reimplementing this file.
import { OPERATIONS, SCHEMAS } from "../contract/generated/operations.ts";
import type { OperationEntry, Schema } from "../contract/types.ts";
import { withoutOmitted } from "./omit.ts";
import { RpcError } from "./RpcError.ts";
import { normalise, validate } from "./schema.ts";

// Constants, never configurable at run time (UI-3).
const RPC_ENDPOINT = "/rpc.php";
const DOWNLOAD_ENDPOINT = "/download.php";

export interface RpcRequestConfig {
  url: string;
  method: string;
  data?: unknown;
  signal?: AbortSignal;
  /** Set by the generated client; the transport sets its own. */
  headers?: Record<string, string>;
}

export interface RpcRequestOptions {
  /**
   * A background call (polling): sent with `options.updatelastaccess: false`, so it does not keep
   * an idle session alive (UI-14).
   */
  background?: boolean;
}

/** The error type the generated hooks declare. */
export type ErrorType<_E> = RpcError;
/** The request body type the generated client passes through unchanged. */
export type BodyType<B> = B;

// ---- events: the session ending, and configuration left pending ----

type Listener = () => void;
type ActivityListener = (sentAt: number) => void;
const sessionEndedListeners = new Set<Listener>();
const pendingChangesListeners = new Set<Listener>();
const activityListeners = new Set<ActivityListener>();
let sessionLive = true;

/** Called once when a call gets 401, until a later call succeeds. Returns an unsubscribe. */
export function onSessionEnded(listener: Listener): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

/** Called after each successful call of an operation marked x-omv-dirty. */
export function onPendingChanges(listener: Listener): () => void {
  pendingChangesListeners.add(listener);
  return () => pendingChangesListeners.delete(listener);
}

/**
 * Called after each call the server counted as activity on the session, with the time the call was
 * sent. rpc.php refreshes a signed-in session's last-access time for every call it accepts, whatever
 * the method then answers, unless the call is a background one (`updatelastaccess: false`); a 401
 * means there was no session to refresh, and download.php never refreshes it. The idle warning
 * follows this, so its clock is the server's (UI-14). The time is the moment the request left, which
 * is never later than the server's own: the warning errs early, never late. Returns an unsubscribe.
 */
export function onActivity(listener: ActivityListener): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

const emit = <A extends unknown[]>(
  listeners: Set<(...args: A) => void>,
  ...args: A
) => {
  for (const listener of [...listeners]) {
    try {
      listener(...args);
    } catch (e) {
      console.error(e);
    }
  }
};

// ---- task handles (UI-5) ----

// Handles returned by a task-starting call in this page session, with the task's result schema.
// Exec is called only with one of these, and a handle is forgotten once the server has dropped it.
const issuedHandles = new Map<string, { result?: string }>();

/** The result schema name of a task this page session started; undefined if none or unknown. */
export function taskResultOf(handle: string): string | undefined {
  return issuedHandles.get(handle)?.result;
}

/** Forget every handle: on sign-out or the end of the session. */
export function forgetTaskHandles(): void {
  issuedHandles.clear();
}

function handleOf(data: unknown): string | undefined {
  const filename =
    typeof data === "object" && data !== null
      ? (data as { filename?: unknown }).filename
      : undefined;
  return typeof filename === "string" ? filename : undefined;
}

// ---- the call ----

function entryOf(url: string): OperationEntry {
  if (!Object.hasOwn(OPERATIONS, url)) {
    // UI-4: nothing reaches the backend that the contract does not name.
    throw new Error(`Not an operation of the contract: ${url}`);
  }
  return OPERATIONS[url as keyof typeof OPERATIONS];
}

const failure = (
  entry: OperationEntry,
  status: number,
  message: string,
  code: number | null = null,
) => new RpcError({ status, code, message, operationId: entry.operationId });

const GENERIC_NETWORK = "The server could not be reached.";
const GENERIC_BAD_REPLY = "The server sent a reply that could not be read.";

function errorFrom(
  entry: OperationEntry,
  status: number,
  body: unknown,
): RpcError {
  // Read only `code` and `message`. The stack trace in `error.trace` is never copied (UI-9).
  const error =
    typeof body === "object" && body !== null
      ? (body as { error?: unknown }).error
      : undefined;
  if (typeof error === "object" && error !== null) {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return failure(
      entry,
      status,
      typeof message === "string" && message !== ""
        ? message
        : GENERIC_BAD_REPLY,
      typeof code === "number" ? code : null,
    );
  }
  return failure(entry, status, GENERIC_BAD_REPLY);
}

function checkResponse(
  entry: OperationEntry,
  value: unknown,
  schema: Schema,
): void {
  const problems = validate(value, schema, SCHEMAS);
  if (problems.length) {
    console.warn(
      `[contract] ${entry.operationId}: the reply does not match the contract`,
      problems,
    );
  }
}

// The server deletes a task after the poll that reports it ended with nothing pending (A6), when
// isRunning finds it ended, and when it is stopped.
function finishedTask(entry: OperationEntry, value: unknown): boolean {
  if (entry.method === "stop") {
    return true;
  }
  if (
    entry.method === "isRunning" &&
    typeof value === "object" &&
    value !== null
  ) {
    return (value as { running?: unknown }).running === false;
  }
  if (
    entry.method === "getOutput" &&
    typeof value === "object" &&
    value !== null
  ) {
    const { running, pendingOutput } = value as {
      running?: unknown;
      pendingOutput?: unknown;
    };
    return running === false && pendingOutput !== true;
  }
  return false;
}

export const rpcClient = async <T>(
  config: RpcRequestConfig,
  options?: RpcRequestOptions,
): Promise<T> => {
  const entry = entryOf(config.url);
  if (config.method !== "POST") {
    throw new Error(`Every operation is a POST: ${config.url}`);
  }
  const handle = entry.service === "Exec" ? handleOf(config.data) : undefined;
  if (
    entry.service === "Exec" &&
    (handle === undefined || !issuedHandles.has(handle))
  ) {
    throw new Error(
      `Exec is called only with a handle a task-starting call returned: ${config.url}`,
    );
  }
  const endpoint = entry.download ? DOWNLOAD_ENDPOINT : RPC_ENDPOINT;
  const body = {
    service: entry.service,
    method: entry.method,
    // rpc.php treats {} like no parameters (A2).
    params: config.data ?? {},
    ...(options?.background ? { options: { updatelastaccess: false } } : {}),
  };

  const sentAt = Date.now();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      body: JSON.stringify(body),
      signal: config.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw e;
    }
    throw failure(entry, 0, GENERIC_NETWORK);
  }

  if (!options?.background && !entry.download && response.status !== 401) {
    emit(activityListeners, sentAt);
  }

  if (entry.download && response.ok) {
    return (await response.blob()) as T;
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw e;
    }
    throw failure(
      entry,
      response.status === 200 ? 0 : response.status,
      GENERIC_BAD_REPLY,
    );
  }

  const envelope =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  if (
    response.status !== 200 ||
    !envelope ||
    !("response" in envelope) ||
    (envelope.error ?? null) !== null
  ) {
    const error = errorFrom(
      entry,
      response.status === 200 ? 500 : response.status,
      parsed,
    );
    if (handle !== undefined) {
      // A failed task, or a handle the server no longer knows: either way it is finished.
      issuedHandles.delete(handle);
    }
    if (error.status === 401 && sessionLive) {
      sessionLive = false;
      emit(sessionEndedListeners);
    }
    throw error;
  }

  sessionLive = true;
  // The fields the contract's x-omv-omit names go first, so normalisation, development-build
  // validation (and its console output), the query cache and every caller see only what is left
  // (UI-6).
  let value = withoutOmitted(envelope.response, entry.omit);
  if (entry.response) {
    // Session replies keep only the fields the contract lists: `sessionid` and the challenge's
    // `redirecturl` never leave this module (UI-3, UI-6).
    value = normalise(
      value,
      entry.response,
      SCHEMAS,
      entry.service === "Session",
    );
    // A static check, so a production build drops it (Vite replaces import.meta.env.DEV).
    if (import.meta.env.DEV) {
      checkResponse(entry, value, entry.response);
    }
  }
  if (entry.task && typeof value === "string") {
    issuedHandles.set(value, entry.task);
  }
  if (handle !== undefined && finishedTask(entry, value)) {
    issuedHandles.delete(handle);
  }
  if (entry.dirty) {
    emit(pendingChangesListeners);
  }
  return value as T;
};
