// SPDX-License-Identifier: GPL-3.0-or-later
// The RAID pages' reads (phase 5 RAID design 0.5, 1.1, 2.1), one set of options each, so every page
// shares one cache entry.
//
// What reads a disk (observed on the test VM, journal 2026-11-21): MdMgmt.enumerateDevices, getDetail
// and getSlaves read a member disk's superblock on every call, which can wake a disk that has spun
// down; MdMgmt.getCandidates reads no array member. So:
// - whether the plugin is installed (the menu item) is decided by getCandidates, once after an
//   administrator signs in, and kept for the session (useRaidPlugin);
// - the arrays are read only on pages the reader opened that are about arrays or disks (the RAID
//   pages, Disks, Flow A), never from the dashboard or in the background,
// - except the one poll (P9): every 30 seconds while an array shown is synchronising, rebuilding,
//   reshaping or being checked, whose disks are busy anyway. It is a background read
//   (`updatelastaccess: false`, UI-14), stops while the tab is hidden, and does not retry by itself.
import {
  getMdMgmtEnumerateDevicesQueryOptions,
  getMdMgmtGetCandidatesQueryOptions,
  getMdMgmtGetDetailQueryOptions,
  useMdMgmtGetDetail,
  useMdMgmtGetSlaves,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { useQueries, useQuery } from "@tanstack/react-query";
import { isRaidPluginMissing } from "../disks/diskWords.ts";
import { ON_OPEN, useRaidArrays } from "./useDiskReads.ts";

/** The one rhythm of the RAID poll (D10). */
export const RAID_POLL_MS = 30_000;

const background = { background: true } as const;

export type RaidPlugin = "checking" | "installed" | "missing";

/**
 * Whether the RAID plugin is installed, for the menu item (0.10, D1): one MdMgmt.getCandidates read,
 * which touches no array member. It runs once: once it has an answer it is no longer enabled, so a
 * finished task's refresh of every read does not repeat it. While it loads, "checking" (the item is
 * not shown); on any failure but the 404, "installed" (the item is shown, and the page says what
 * failed). Only for an administrator: a normal user's shell makes no RAID call (10).
 */
export function useRaidPlugin(admin: boolean): RaidPlugin {
  const query = useQuery({
    ...getMdMgmtGetCandidatesQueryOptions(),
    enabled: (q) => admin && q.state.status === "pending",
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  if (query.isError) {
    return isRpcError(query.error) && isRaidPluginMissing(query.error)
      ? "missing"
      : "installed";
  }
  return query.data === undefined ? "checking" : "installed";
}

export { useRaidArrays };

/**
 * The poll of the arrays (0.5): a second observer of the same entry, enabled only while `active`, as a
 * background read every 30 seconds. It does not read on mount (the page's own read did).
 */
export function useArraysPoll(active: boolean) {
  return useQuery({
    ...getMdMgmtEnumerateDevicesQueryOptions({ request: background }),
    enabled: active,
    refetchInterval: active ? RAID_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

const detailOptions = (devicefile: string, poll: boolean) =>
  poll
    ? {
        ...getMdMgmtGetDetailQueryOptions(
          { devicefile },
          { request: background },
        ),
        refetchInterval: RAID_POLL_MS,
        refetchIntervalInBackground: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
      }
    : {
        ...getMdMgmtGetDetailQueryOptions({ devicefile }),
        ...ON_OPEN,
        retry: false,
      };

/** One array's report (0.3), read on opening its page and on Refresh; the row's devicefile only. */
export const useArrayDetail = (devicefile: string, enabled = true) =>
  useMdMgmtGetDetail(
    { devicefile },
    {
      query: {
        ...ON_OPEN,
        enabled: enabled && devicefile !== "",
        retry: false,
      },
    },
  );

/** The poll of one array's report, while it is busy. */
export function useDetailPoll(devicefile: string, active: boolean) {
  return useQuery({
    ...detailOptions(devicefile, true),
    enabled: active && devicefile !== "",
  });
}

/** Every array's report, for the list's counts and progress (1.3); the busy ones polled. */
export function useArrayDetails(
  arrays: readonly { devicefile: string; busy: boolean }[],
) {
  const reads = useQueries({
    queries: arrays.map((a) => detailOptions(a.devicefile, false)),
  });
  useQueries({
    queries: arrays
      .filter((a) => a.busy)
      .map((a) => detailOptions(a.devicefile, true)),
  });
  return reads;
}

/** The array's member disks with their sizes (2.5), on opening its page. */
export const useArraySlaves = (devicefile: string, enabled = true) =>
  useMdMgmtGetSlaves(
    { devicefile },
    {
      query: {
        ...ON_OPEN,
        enabled: enabled && devicefile !== "",
        retry: false,
      },
    },
  );
