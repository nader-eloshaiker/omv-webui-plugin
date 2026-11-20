// SPDX-License-Identifier: GPL-3.0-or-later
// The session as the interface knows it: whether one exists, and the user name and role (docs/02,
// "Cross-cutting behaviour"). Held in memory only and never persisted (UI-6, UI-13): the session
// itself is OMV's HttpOnly cookie. A reload learns it again from the server (bootstrap.ts).
//
// Not a zustand store: zustand is for preferences. This is a small external store around a pure
// reducer, so the transitions are tested without React.
import type { Role } from "@omv-webui/react-api-omv/generated";

/** Why the sign-in form is showing, when there is something to say. */
export type SignInNotice = "ended" | "signedOut" | "challengeExpired";

export type SessionState =
  | {
      status: "signedOut";
      notice: SignInNotice | null;
      /** The in-app route the user was on when the session ended; never from a URL (UI-3). */
      resume: string | null;
    }
  | {
      status: "challenge";
      username: string;
      /** The second-factor method the server asked for. Only "totp" has a form here. */
      kind: string;
      resume: string | null;
    }
  | {
      status: "signedIn";
      /** Null after a reload when the server would not say. */
      username: string | null;
      role: Role;
    };

export type SessionEvent =
  | { type: "signedIn"; username: string | null; role: Role }
  | { type: "challenged"; username: string; kind: string }
  /** The user left the code step for the sign-in form. */
  | { type: "challengeAbandoned" }
  /** The server no longer holds the pending login (401 from Session.verify). */
  | { type: "challengeExpired" }
  /** The session ended on the server (a 401) while the user was on `resume`. */
  | { type: "ended"; resume: string }
  | { type: "signedOut" };

export const SIGNED_OUT: SessionState = {
  status: "signedOut",
  notice: null,
  resume: null,
};

const resumeOf = (state: SessionState) =>
  state.status === "signedIn" ? null : state.resume;

export function sessionReducer(
  state: SessionState,
  event: SessionEvent,
): SessionState {
  switch (event.type) {
    case "signedIn":
      return {
        status: "signedIn",
        username: event.username,
        role: event.role,
      };
    case "challenged":
      return {
        status: "challenge",
        username: event.username,
        kind: event.kind,
        resume: resumeOf(state),
      };
    case "challengeAbandoned":
      return state.status === "challenge"
        ? { status: "signedOut", notice: null, resume: state.resume }
        : state;
    case "challengeExpired":
      return state.status === "challenge"
        ? {
            status: "signedOut",
            notice: "challengeExpired",
            resume: state.resume,
          }
        : state;
    case "ended":
      // Only a session the interface believed in can end. A 401 while signed out (the first read
      // after a reload, or a pending login being discarded) says nothing new.
      return state.status === "signedIn"
        ? { status: "signedOut", notice: "ended", resume: event.resume }
        : state;
    case "signedOut":
      return { status: "signedOut", notice: "signedOut", resume: null };
  }
}

export interface SessionStore {
  getState(): SessionState;
  dispatch(event: SessionEvent): void;
  subscribe(listener: () => void): () => void;
}

export function createSessionStore(
  initial: SessionState = SIGNED_OUT,
): SessionStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(event) {
      const next = sessionReducer(state, event);
      if (next === state) {
        return;
      }
      state = next;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Where to go after signing in: the route held in memory, else the start page. */
export function landingAfterSignIn(state: SessionState): string {
  const resume = state.status === "signedIn" ? null : state.resume;
  // Defence in depth: only an in-app path, never an address with a scheme or a host (UI-3).
  return resume !== null && /^\/(?!\/)/.test(resume) ? resume : "/";
}
