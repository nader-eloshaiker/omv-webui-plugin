// SPDX-License-Identifier: GPL-3.0-or-later
// What went wrong with a sign-in or a code, in the terms the page speaks. The backend's message is
// kept as text and nothing else from the error is (UI-9).
import { isRpcError } from "@omv-webui/react-api-omv/transport";

export type SignInProblem =
  /** 400: wrong user name or password, or a wrong code. */
  | { kind: "rejected"; message: string }
  /** 429: too many attempts; the reply says no wait time, and nothing retries (UI-14). */
  | { kind: "tooManyAttempts"; message: string }
  /** 401 from Session.verify: no login is pending any more. */
  | { kind: "expired"; message: string }
  /** The server could not be reached, or failed. */
  | { kind: "unreachable"; message: string };

const FALLBACK = "The server sent a reply that could not be read.";

export function signInProblemOf(error: unknown): SignInProblem {
  if (!isRpcError(error)) {
    return { kind: "unreachable", message: FALLBACK };
  }
  const { message } = error;
  switch (error.kind) {
    case "rejected":
      return { kind: "rejected", message };
    case "tooManyAttempts":
      return { kind: "tooManyAttempts", message };
    case "session":
      return { kind: "expired", message };
    default:
      return { kind: "unreachable", message };
  }
}
