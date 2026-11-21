// SPDX-License-Identifier: GPL-3.0-or-later
// Builds one running interface: the query client wired to the transport, the session learned from
// the server, the activity clock, and the router. main.tsx boots it for the browser and renders it with
// AppRoot; the tests boot the same thing against MSW.
import {
  getSystemGetInformationQueryKey,
  type SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import {
  connectQueryClient,
  createQueryClient,
} from "@omv-webui/react-api-omv/query";
import { onSessionEnded } from "@omv-webui/react-api-omv/transport";
import type { QueryClient } from "@tanstack/react-query";
import { diskHealth } from "./dashboard/diskHealth.ts";
import { recordUsage, usageSamples } from "./dashboard/usageSamples.ts";
import { diskSession } from "./disks/diskSession.ts";
import { flowStore } from "./filesystems/flowRun.ts";
import { fsActions } from "./filesystems/fsActions.ts";
import { fsSession } from "./filesystems/fsSession.ts";
import { logsView } from "./logs/logsViewStore.ts";
import { processesView } from "./processes/processesViewStore.ts";
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

/** What pages keep in memory for the session; emptied when it ends. */
const SESSION_VIEW_STATE = [
  sharedFoldersTable,
  usageSamples,
  diskHealth,
  diskSession,
  fsSession,
  flowStore,
  fsActions,
  logsView,
  processesView,
];
const resetViewState = () => {
  for (const store of SESSION_VIEW_STATE) {
    store.reset();
  }
};
const INFORMATION_KEY = JSON.stringify(getSystemGetInformationQueryKey());

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

  // What a page keeps in memory for the session (the shared-folders table's page, sort and search, the
  // chart's samples, the last disk-health result, the logs and processes pages' view) is forgotten
  // when the session goes, so the next account starts with the stock view.
  const offViewState = session.subscribe(() => {
    if (session.getState().status !== "signedIn") {
      resetViewState();
    }
  });

  // The Usage chart's samples (phase 5 design 1.6.1, D9): every successful reply of the shell's
  // System.getInformation poll, on any page, for an administrator (a normal user's shell does not
  // poll). Stamped with this computer's time of receipt, so a wrong NAS clock cannot bend the axis.
  const sample = (data: unknown, receivedAt: number) => {
    const state = session.getState();
    if (
      state.status === "signedIn" &&
      state.role === "admin" &&
      data !== undefined
    ) {
      recordUsage(data as SystemInformation, receivedAt);
    }
  };
  const offSamples = queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type === "updated" &&
      event.action.type === "success" &&
      JSON.stringify(event.query.queryKey) === INFORMATION_KEY
    ) {
      sample(event.query.state.data, event.query.state.dataUpdatedAt);
    }
  });
  // The reply the boot already read (the session probe) is the first sample.
  const booted = queryClient.getQueryState(getSystemGetInformationQueryKey());
  if (booted?.data !== undefined) {
    sample(booted.data, booted.dataUpdatedAt);
  }

  return {
    queryClient,
    session,
    activity,
    router,
    dispose() {
      offSamples();
      offViewState();
      resetViewState();
      offSessionEnded();
      activity.disconnect();
      disconnectQuery();
    },
  };
}
