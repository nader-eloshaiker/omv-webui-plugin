// SPDX-License-Identifier: GPL-3.0-or-later
// The shell's combined read and the charts' view of its samples.
//
// useLiveReads is the only poll of System.getInformation and of the interface counters: TanStack
// Query runs one timer per observer, so every other caller of those entries reads without polling
// (useSystemInformation, useNetworkInterfaces) and sees the shell's replies through the cache. Both
// reads are background calls (`updatelastaccess: false`), so watching a chart never keeps an idle
// session alive and the idle sign-out still works (UI-14). app.ts records each reply as a sample.
import type { Role } from "@omv-webui/react-api-omv/generated";
import {
  useNetworkEnumerateDevicesList,
  useSystemGetInformation,
} from "@omv-webui/react-api-omv/generated";
import { useEffect, useSyncExternalStore } from "react";
import { ALL_INTERFACES } from "../hooks/useMonitoringReads.ts";
import { useMemoryStore } from "../shell/memoryStore.ts";
import { LIVE_STALE_MS, liveDemand, liveInterval } from "./liveDemand.ts";
import {
  liveSamples,
  sampledSpan,
  type SampledSpan,
  type SystemSample,
  type TrafficSample,
} from "./liveSamples.ts";

const background = { background: true } as const;

/** The poll interval the shell's combined read runs at now, or false for none. */
export function useLiveInterval(role: Role): number | false {
  const demand = useSyncExternalStore(
    liveDemand.subscribe,
    liveDemand.getState,
    liveDemand.getState,
  );
  return liveInterval(role, demand);
}

/**
 * The shell's combined read: System.getInformation for everyone (the host name; for an administrator
 * also processor, memory, load and pending changes) and, for an administrator, the interface
 * counters. Returns the System.getInformation query, which the shell renders from.
 */
export function useLiveReads(role: Role) {
  const refetchInterval = useLiveInterval(role);
  const query = { refetchInterval, staleTime: LIVE_STALE_MS };
  // Network.enumerateDevicesList is for administrators only.
  useNetworkEnumerateDevicesList(ALL_INTERFACES, {
    request: background,
    query: { ...query, enabled: role === "admin" },
  });
  return useSystemGetInformation({ request: background, query });
}

export interface LiveView {
  system: readonly SystemSample[];
  traffic: readonly TrafficSample[];
  /** The time each series actually covers; null when it has no sample yet. */
  systemSpan: SampledSpan | null;
  trafficSpan: SampledSpan | null;
}

/**
 * The session's live samples, for a chart. While a chart using it is mounted, the shell reads every
 * 2 s instead of every 10 s.
 */
export function useLiveSamples(): LiveView {
  useEffect(() => liveDemand.showChart(), []);
  const { system, traffic } = useMemoryStore(liveSamples);
  return {
    system,
    traffic,
    systemSpan: sampledSpan(system),
    trafficSpan: sampledSpan(traffic),
  };
}
