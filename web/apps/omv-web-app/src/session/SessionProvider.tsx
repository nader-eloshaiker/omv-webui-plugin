// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo, type ReactNode } from "react";
import type { ActivityClock } from "./activityClock.ts";
import { SessionContext } from "./sessionContext.ts";
import type { SessionStore } from "./sessionStore.ts";

export function SessionProvider({
  store,
  activity,
  children,
}: {
  store: SessionStore;
  activity: ActivityClock;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ store, activity }), [store, activity]);
  return <SessionContext value={value}>{children}</SessionContext>;
}
