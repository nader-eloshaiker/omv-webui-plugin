// SPDX-License-Identifier: GPL-3.0-or-later
// Builds one running interface: the query client wired to the transport, the session learned from
// the server, the activity clock, and the router. main.tsx boots it for the browser and renders it with
// AppRoot; the tests boot the same thing against MSW.
import {
  getNetworkEnumerateDevicesListQueryKey,
  getSystemGetInformationQueryKey,
  type NetworkDeviceList,
  type SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import {
  connectQueryClient,
  createQueryClient,
} from "@omv-webui/react-api-omv/query";
import { onSessionEnded } from "@omv-webui/react-api-omv/transport";
import type { QueryClient } from "@tanstack/react-query";
import { diskHealth } from "./dashboard/diskHealth.ts";
import { diskSession } from "./disks/diskSession.ts";
import { flowStore } from "./filesystems/flowRun.ts";
import { fsActions } from "./filesystems/fsActions.ts";
import { fsSession } from "./filesystems/fsSession.ts";
import { addGroupStore } from "./groups/addGroupFlow.ts";
import { groupDeletes } from "./groups/deleteGroupFlow.ts";
import { homeSession } from "./homeFolders/homeSession.ts";
import { ALL_INTERFACES } from "./hooks/useMonitoringReads.ts";
import {
  liveSamples,
  recordCounters,
  recordSystem,
} from "./live/liveSamples.ts";
import { logsView } from "./logs/logsViewStore.ts";
import { networkSession } from "./network/networkSession.ts";
import { newIfaceFocus } from "./network/newIfaceFocus.ts";
import { processesView } from "./processes/processesViewStore.ts";
import { raidFlowStore } from "./raid/raidRun.ts";
import { raidSession } from "./raid/raidSession.ts";
import { createAppRouter, type AppRouter } from "./router.ts";
import { jobFlowStore } from "./services/addJobFlow.ts";
import { jobsSession } from "./services/jobsSession.ts";
import { nfsSession } from "./services/nfsSession.ts";
import { rsyncdSession } from "./services/rsyncdSession.ts";
import {
  createActivityClock,
  type ActivityClock,
} from "./session/activityClock.ts";
import { probeSession } from "./session/bootstrap.ts";
import {
  createSessionStore,
  type SessionStore,
} from "./session/sessionStore.ts";
import { addFlowStore } from "./sharedFolders/addFlow.ts";
import { shareDeletes } from "./sharedFolders/deleteRun.ts";
import { recycleRuns } from "./sharedFolders/recycleRuns.ts";
import { sharesSession } from "./sharedFolders/sharesSession.ts";
import { sharedFoldersTable } from "./sharedFolders/tableStore.ts";
import { addPersonStore } from "./users/addPersonFlow.ts";
import { personDeletes } from "./users/deletePersonFlow.ts";
import { usersSession } from "./users/usersSession.ts";
import { zfsActions } from "./zfs/zfsActions.ts";
import { zfsFlowStore } from "./zfs/zfsRun.ts";
import { zfsSession } from "./zfs/zfsSession.ts";

/** What pages keep in memory for the session; emptied when it ends. */
const SESSION_VIEW_STATE = [
  groupDeletes,
  sharedFoldersTable,
  sharesSession,
  shareDeletes,
  addFlowStore,
  liveSamples,
  diskHealth,
  diskSession,
  fsSession,
  flowStore,
  fsActions,
  raidSession,
  raidFlowStore,
  zfsSession,
  zfsFlowStore,
  zfsActions,
  logsView,
  processesView,
  homeSession,
  addGroupStore,
  usersSession,
  addPersonStore,
  personDeletes,
  rsyncdSession,
  recycleRuns,
  nfsSession,
  jobsSession,
  jobFlowStore,
  networkSession,
  newIfaceFocus,
];
const resetViewState = () => {
  for (const store of SESSION_VIEW_STATE) {
    store.reset();
  }
};
const INFORMATION_KEY = JSON.stringify(getSystemGetInformationQueryKey());
const INTERFACES_KEY = JSON.stringify(
  getNetworkEnumerateDevicesListQueryKey(ALL_INTERFACES),
);

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
  // live samples, the last disk-health result, the logs and processes pages' view) is forgotten
  // when the session goes, so the next account starts with the stock view.
  const offViewState = session.subscribe(() => {
    if (session.getState().status !== "signedIn") {
      resetViewState();
    }
  });

  // The live samples (live/liveSamples.ts; owner, 2026-11-24): every successful reply of the shell's
  // combined read (live/useLive.ts), and of any other read of the same entries, on any page, for an
  // administrator (a normal user's shell does not poll). Stamped with this computer's time of
  // receipt, so a wrong NAS clock cannot bend the axis.
  const isAdmin = () => {
    const state = session.getState();
    return state.status === "signedIn" && state.role === "admin";
  };
  const sample = (key: string, data: unknown, receivedAt: number) => {
    if (data === undefined || !isAdmin()) {
      return;
    }
    // Each entry is written only by its generated query, from a reply the transport has normalised
    // to the operation's response schema, so the data has that operation's DTO type.
    if (key === INFORMATION_KEY) {
      recordSystem(data as SystemInformation, receivedAt);
    } else if (key === INTERFACES_KEY) {
      recordCounters(data as NetworkDeviceList, receivedAt);
    }
  };
  const offSamples = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "success") {
      sample(
        JSON.stringify(event.query.queryKey),
        event.query.state.data,
        event.query.state.dataUpdatedAt,
      );
    }
  });
  // The reply the boot already read (the session probe) is the first sample.
  const booted = queryClient.getQueryState(getSystemGetInformationQueryKey());
  if (booted?.data !== undefined) {
    sample(INFORMATION_KEY, booted.data, booted.dataUpdatedAt);
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
