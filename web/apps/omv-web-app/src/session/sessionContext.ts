// SPDX-License-Identifier: GPL-3.0-or-later
// Gives components the session and the activity clock. Both are in-memory objects created at boot
// (app.tsx) and provided by SessionProvider; components read them through these hooks.
import { createContext, use, useSyncExternalStore } from "react";
import type { ActivityClock } from "./activityClock.ts";
import type { SessionState, SessionStore } from "./sessionStore.ts";

export interface SessionContextValue {
  store: SessionStore;
  activity: ActivityClock;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

function useSessionContext(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) {
    throw new Error("SessionProvider is missing above this component.");
  }
  return value;
}

export function useSessionStore(): SessionStore {
  return useSessionContext().store;
}

export function useSession(): SessionState {
  const { store } = useSessionContext();
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useLastActivity(): number {
  const { activity } = useSessionContext();
  return useSyncExternalStore(activity.subscribe, activity.getLastActivity);
}
