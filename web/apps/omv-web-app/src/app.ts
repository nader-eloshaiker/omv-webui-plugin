// SPDX-License-Identifier: GPL-3.0-or-later
// Builds one running interface: the query client wired to the transport, the session learned from
// the server, the activity clock, and the router. main.tsx boots it for the browser and renders it with
// AppRoot; the tests boot the same thing against MSW.
import {
  connectQueryClient,
  createQueryClient,
} from "@omv-webui/react-api-omv/query";
import { onSessionEnded } from "@omv-webui/react-api-omv/transport";
import type { QueryClient } from "@tanstack/react-query";
import { createAppRouter, type AppRouter } from "./router.ts";
import {
  createActivityClock,
  type ActivityClock,
} from "./session/activityClock.ts";
import { probeSession } from "./session/bootstrap.ts";
import {
  createSessionStore,
  type SessionStore,
} from "./session/sessionStore.ts";
import { sharedFoldersTable } from "./sharedFolders/tableStore.ts";

export interface App {
  queryClient: QueryClient;
  session: SessionStore;
  activity: ActivityClock;
  router: AppRouter;
  /** Disconnect everything boot connected (tests; the browser never needs it). */
  dispose(): void;
}

export async function bootApp(): Promise<App> {
  const queryClient = createQueryClient();
  const disconnectQuery = connectQueryClient(queryClient);
  // Before the first call, so the probe's own reads count as activity, as they do on the server.
  const activity = createActivityClock();
  const session = createSessionStore(await probeSession(queryClient));
  const router = createAppRouter({ queryClient, session });

  // A 401 from any call: connectQueryClient has already dropped all server data. If the interface
  // believed in a session, show sign-in with a notice, and keep the route in memory to come back to
  // (never in the URL, UI-3).
  const offSessionEnded = onSessionEnded(() => {
    if (session.getState().status !== "signedIn") {
      return;
    }
    session.dispatch({ type: "ended", resume: router.state.location.href });
    void router.navigate({ to: "/sign-in" });
  });

  // What a page keeps in memory for the session (the shared-folders table's page, sort and search) is
  // forgotten when the session goes, so the next account starts with the stock view.
  const offViewState = session.subscribe(() => {
    if (session.getState().status !== "signedIn") {
      sharedFoldersTable.reset();
    }
  });

  return {
    queryClient,
    session,
    activity,
    router,
    dispose() {
      offViewState();
      sharedFoldersTable.reset();
      offSessionEnded();
      activity.disconnect();
      disconnectQuery();
    },
  };
}
