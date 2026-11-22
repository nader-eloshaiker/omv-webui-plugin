// SPDX-License-Identifier: GPL-3.0-or-later
// The ZFS pages' reads (phase 5 ZFS design 0.6, 1.1, 2.1, 4.3), one set of options each, so every page
// shares one cache entry.
//
// What reads a disk (observed on the test VM, journal 2026-11-22): on an idle pool none of the
// plugin's reads moved the member disks' /proc/diskstats, also first after the pool was imported. So:
// - whether the plugin is installed (the menu item) is decided by Zfs.listCompressionTypes, which runs
//   no command, once after an administrator signs in, and kept for the session (useZfsPlugin);
// - the pools are read on the ZFS pages, the Disks pages and the flows; the dashboard reads only
//   getPoolStatus, once per visit (P14);
// - the one poll (P13): every 30 seconds while a pool shown is being checked or rebuilt, as a
//   background read (`updatelastaccess: false`, UI-14), stopped while the tab is hidden, never
//   retried by itself.
import {
  getZfsGetAllSnapshotsQueryOptions,
  getZfsGetEmptyCandidatesQueryOptions,
  getZfsGetObjectDetailsQueryOptions,
  getZfsGetPoolDevicesQueryOptions,
  getZfsGetPoolStatusQueryOptions,
  getZfsListCompressionTypesQueryOptions,
  getZfsListPoolsQueryOptions,
  type GetListRequest,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ZfsPoolDisks } from "../disks/diskUse.ts";
import { isPoolAddress } from "../zfs/zfsModel.ts";
import { ON_OPEN } from "./useDiskReads.ts";

/** The one rhythm of the ZFS poll (0.6). */
export const ZFS_POLL_MS = 30_000;

/** Every row, in the server's order (12.1: the common list parameters, always sent). */
export const ALL_ROWS: GetListRequest = {
  start: 0,
  limit: null,
  sortfield: null,
  sortdir: null,
};

const background = { background: true } as const;

/** OMV's reply for a service it does not know: the plugin is not installed (0.11). */
export const isZfsPluginMissing = (error: unknown): boolean =>
  isRpcError(error) && error.status === 404;

export type ZfsPlugin = "checking" | "installed" | "missing";

/**
 * Whether the ZFS plugin is installed, for the menu item (0.11, D1): one Zfs.listCompressionTypes
 * read, which runs no command. It runs once: once it has an answer it is no longer enabled, so a
 * finished task's refresh of every read does not repeat it. While it loads, "checking"; on any failure
 * but the 404, "installed" (the item is shown, and the page says what failed). Only for an
 * administrator: a normal user's shell makes no ZFS call (11.1).
 */
export function useZfsPlugin(admin: boolean): ZfsPlugin {
  const query = useQuery({
    ...getZfsListCompressionTypesQueryOptions(),
    enabled: (q) => admin && q.state.status === "pending",
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  if (query.isError) {
    return isZfsPluginMissing(query.error) ? "missing" : "installed";
  }
  return query.data === undefined ? "checking" : "installed";
}

const polled = {
  refetchInterval: ZFS_POLL_MS,
  refetchIntervalInBackground: false,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: Number.POSITIVE_INFINITY,
  retry: false,
} as const;

/**
 * The dashboard's pool health (10.1, P14): Zfs.getPoolStatus, read once per visit (on opening the
 * dashboard) and on "Try again", never polled. The VM showed it reads no member disk (journal).
 */
export const useZfsPoolHealth = (enabled: boolean) =>
  useQuery({
    ...getZfsGetPoolStatusQueryOptions(),
    ...ON_OPEN,
    retry: false,
    enabled,
  });

/** Pools, file systems and volumes in one flat list, on opening a page, on Refresh, after an action. */
export const useZfsList = (enabled = true) =>
  useQuery({
    ...getZfsListPoolsQueryOptions(ALL_ROWS),
    ...ON_OPEN,
    enabled,
    retry: false,
  });

/** The poll of the list: a second observer of the same entry, only while a pool shown is busy. */
export function useZfsListPoll(active: boolean) {
  return useQuery({
    ...getZfsListPoolsQueryOptions(ALL_ROWS, { request: background }),
    ...polled,
    enabled: active,
  });
}

const reportOptions = (pool: string, poll: boolean, enabled = true) =>
  poll
    ? {
        ...getZfsGetObjectDetailsQueryOptions(
          { type: "Pool", name: pool },
          { request: background },
        ),
        ...polled,
        enabled: enabled && isPoolAddress(pool),
      }
    : {
        ...getZfsGetObjectDetailsQueryOptions({ type: "Pool", name: pool }),
        ...ON_OPEN,
        retry: false,
        enabled: enabled && isPoolAddress(pool),
      };

/** Every pool's report (1.1), read on opening; the busy ones polled. */
export function useZfsReports(
  list: readonly { pool: string; busy: boolean; enabled?: boolean }[],
) {
  const reads = useQueries({
    queries: list.map((p) => reportOptions(p.pool, false, p.enabled)),
  });
  useQueries({
    queries: list
      .filter((p) => p.busy)
      .map((p) => reportOptions(p.pool, true, p.enabled)),
  });
  return reads;
}

/** One pool's disks with their paths (0.4); polled with its report while it is busy. */
export function useZfsPoolDevices(
  pool: string,
  enabled: boolean,
  poll: boolean,
) {
  const read = useQuery({
    ...getZfsGetPoolDevicesQueryOptions({ name: pool }),
    ...ON_OPEN,
    retry: false,
    enabled: enabled && isPoolAddress(pool),
  });
  useQuery({
    ...getZfsGetPoolDevicesQueryOptions(
      { name: pool },
      { request: background },
    ),
    ...polled,
    enabled: enabled && poll && isPoolAddress(pool),
  });
  return read;
}

/** Every snapshot (5.1), on a file system's page; filtered there by `parent`. */
export const useZfsSnapshots = (enabled = true) =>
  useQuery({
    ...getZfsGetAllSnapshotsQueryOptions(ALL_ROWS),
    ...ON_OPEN,
    retry: false,
    enabled,
  });

/** A file system's every property, read only on the reader's press (4.3: it may wake its disks). */
export const useZfsFsDetails = (name: string) =>
  useQuery({
    ...getZfsGetObjectDetailsQueryOptions({ type: "Filesystem", name }),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

/** The plugin's candidate disks, in the create and replace flows only. */
export const useZfsCandidates = () =>
  useQuery({
    ...getZfsGetEmptyCandidatesQueryOptions(),
    ...ON_OPEN,
    retry: false,
  });

export interface ZfsDisksRead {
  /** The pools' disks; null when the plugin is not installed; undefined until read or when failed. */
  value: readonly ZfsPoolDisks[] | null | undefined;
  failed: boolean;
  error: unknown;
  fetching: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * The ZFS pools' disks for the disk-use model (10.2): getPoolStatus for the pools, then each pool's
 * getPoolDevices. Read wherever the model is read, only once the plugin is known to be installed.
 * Fails closed (D10): a failed read, or no disks for a pool getPoolStatus lists, is a failed read; a
 * pool whose name this contract cannot send is one too, since its disks cannot be known.
 */
export function useZfsPoolDisks(admin = true): ZfsDisksRead {
  const plugin = useZfsPlugin(admin);
  const status = useQuery({
    ...getZfsGetPoolStatusQueryOptions(),
    ...ON_OPEN,
    retry: false,
    enabled: plugin === "installed",
  });
  const names = status.data?.map((p) => p.name) ?? [];
  const devices = useQueries({
    queries: names.map((name) => ({
      ...getZfsGetPoolDevicesQueryOptions({ name }),
      ...ON_OPEN,
      retry: false,
      enabled: isPoolAddress(name),
    })),
  });
  const refetch = () =>
    Promise.allSettled([status.refetch(), ...devices.map((d) => d.refetch())]);
  const fetching = status.isFetching || devices.some((d) => d.isFetching);
  if (plugin === "missing") {
    return { value: null, failed: false, error: undefined, fetching, refetch };
  }
  if (status.isError) {
    return isZfsPluginMissing(status.error)
      ? { value: null, failed: false, error: undefined, fetching, refetch }
      : {
          value: undefined,
          failed: true,
          error: status.error,
          fetching,
          refetch,
        };
  }
  const failedDevices = devices.find((d) => d.isError);
  if (failedDevices !== undefined) {
    return {
      value: undefined,
      failed: true,
      error: failedDevices.error,
      fetching,
      refetch,
    };
  }
  if (status.data === undefined) {
    return {
      value: undefined,
      failed: false,
      error: undefined,
      fetching,
      refetch,
    };
  }
  // A pool whose name this contract cannot send: its disks cannot be known.
  if (status.data.some((pool) => !isPoolAddress(pool.name))) {
    return {
      value: undefined,
      failed: true,
      error: undefined,
      fetching,
      refetch,
    };
  }
  if (devices.some((d) => d.data === undefined)) {
    return {
      value: undefined,
      failed: false,
      error: undefined,
      fetching,
      refetch,
    };
  }
  const value: ZfsPoolDisks[] = [];
  for (const [i, pool] of status.data.entries()) {
    const list = devices[i]?.data ?? [];
    if (list.length === 0) {
      return {
        value: undefined,
        failed: true,
        error: undefined,
        fetching,
        refetch,
      };
    }
    value.push({ pool: pool.name, devices: list.map((d) => d.devicefile) });
  }
  return { value, failed: false, error: undefined, fetching, refetch };
}
