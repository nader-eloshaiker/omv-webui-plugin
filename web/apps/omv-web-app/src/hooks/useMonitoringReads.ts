// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's and the Services page's reads (phase 5 design 1.8, 4.2), with one set of options
// each, so every caller shares one cache entry and its poll. Every poll is a background call: it
// sends `updatelastaccess: false`, so watching a page never keeps an idle session alive (UI-14). Polls
// stop while the tab is hidden (TanStack Query's default) and read once when it is shown again.
// "Try again" is a foreground read of the same entry (useForegroundRead), because the reader asked.
import type {
  FileSystemMgmtEnumerateMountedFilesystemsRequest,
  GetListRequest,
} from "@omv-webui/react-api-omv/generated";
import {
  useFileSystemMgmtEnumerateMountedFilesystems,
  useFileSystemMgmtGetList,
  useNetworkEnumerateDevicesList,
  useServicesGetStatus,
} from "@omv-webui/react-api-omv/generated";
import {
  useQueryClient,
  type FetchQueryOptions,
  type QueryKey,
} from "@tanstack/react-query";
import { LIVE_STALE_MS } from "../live/liveDemand.ts";

/** One rhythm for every dashboard poll (D6): gentler than the stock dashboard's 10 s. */
export const DASHBOARD_POLL_MS = 20_000;

const poll = { refetchInterval: DASHBOARD_POLL_MS, staleTime: 10_000 } as const;
const background = { background: true } as const;

/** Every mounted file system, the system drive included (design 1.2.2). */
export const MOUNTED_REQUEST: FileSystemMgmtEnumerateMountedFilesystemsRequest =
  {
    includeroot: true,
  };
/** Every row of a list method, in one request; OMV reads all four parameters (design 0.5). */
export const ALL_CONFIGURED: GetListRequest = {
  start: 0,
  limit: null,
  sortfield: null,
  sortdir: null,
};
export const ALL_INTERFACES: GetListRequest = {
  start: 0,
  limit: null,
  sortfield: "devicename",
  sortdir: "asc",
};

export const useMountedFilesystems = () =>
  useFileSystemMgmtEnumerateMountedFilesystems(MOUNTED_REQUEST, {
    request: background,
    query: poll,
  });

/**
 * Every configured file system, for the missing ones only (D3): read once each time the dashboard
 * opens and on "Try again", never polled and not on window focus. It enumerates every file system on
 * every disk, which is heavier than the 20 s read.
 */
export const useConfiguredFilesystems = () =>
  useFileSystemMgmtGetList(ALL_CONFIGURED, {
    request: background,
    query: {
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

export const useServiceStatus = () =>
  useServicesGetStatus({ request: background, query: poll });

/**
 * Every interface. Read, not polled: the shell's combined read (live/useLive.ts) polls this entry
 * for the interface counters, and a second timer on it would double the reads.
 */
export const useNetworkInterfaces = () =>
  useNetworkEnumerateDevicesList(ALL_INTERFACES, {
    request: background,
    query: { staleTime: LIVE_STALE_MS },
  });

/**
 * A foreground read of a query entry the reader asked to read again: the same keys, without the
 * background flag, so it counts as activity. A failure stays in the entry's state; nothing retries.
 */
export function useForegroundRead() {
  const queryClient = useQueryClient();
  return <TQueryFnData, TError, TData, TQueryKey extends QueryKey>(
    options: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): Promise<void> =>
    queryClient
      .fetchQuery({ ...options, staleTime: 0 })
      .then(() => undefined)
      .catch(() => undefined);
}
