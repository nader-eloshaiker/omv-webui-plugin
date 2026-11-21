// SPDX-License-Identifier: GPL-3.0-or-later
// The one error type the transport throws (docs/03, "Replies"). It carries the HTTP status, the
// backend's numeric code and message, the operation, and whether the reply could be read at all. The
// backend's stack trace never reaches it (UI-9).

/** What a failure means to the interface, from the HTTP status and, for one case, the message. */
export type RpcErrorKind =
  | "session" // 401: no session, or it expired
  | "forbidden" // 403: not allowed for this role
  | "rejected" // 400: the backend refused the parameters, or a domain error
  | "tooManyAttempts" // 429: sign-in or second-factor attempts
  | "configDirty" // 500 "apply the configuration changes first" (A6)
  | "failure" // other 5xx: the outcome of a write is unknown
  | "network"; // 0: no reply

// The only signal for a "configuration is dirty" refusal is this message (A6: HTTP 500, code 0).
// It is the server's English text; a server set to another language would translate it, and the
// refusal would then read as an ordinary failure.
const CONFIG_DIRTY_MESSAGE = "Please apply the configuration changes first.";

export class RpcError extends Error {
  override readonly name = "RpcError";
  readonly status: number;
  readonly code: number | null;
  readonly operationId: string;
  readonly kind: RpcErrorKind;
  /**
   * The reply's body was not JSON, so the message is the transport's own. rpc.php always answers
   * JSON, except when PHP itself stops the script (a fatal error such as running out of memory):
   * then it answers 500 with an empty body. A web server's own error page is the other case.
   */
  readonly unreadable: boolean;

  constructor(init: {
    status: number;
    code: number | null;
    message: string;
    operationId: string;
    unreadable?: boolean;
  }) {
    super(init.message);
    this.status = init.status;
    this.code = init.code;
    this.operationId = init.operationId;
    this.kind = kindOf(init.status, init.message);
    this.unreadable = init.unreadable ?? false;
  }
}

function kindOf(status: number, message: string): RpcErrorKind {
  switch (status) {
    case 0:
      return "network";
    case 400:
      return "rejected";
    case 401:
      return "session";
    case 403:
      return "forbidden";
    case 429:
      return "tooManyAttempts";
    default:
      return status === 500 && message === CONFIG_DIRTY_MESSAGE
        ? "configDirty"
        : "failure";
  }
}

export const isRpcError = (e: unknown): e is RpcError => e instanceof RpcError;
