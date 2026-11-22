// SPDX-License-Identifier: GPL-3.0-or-later
// The disks slice's reads (phase 5 disks design 0.4, 1.1, 2.1), with one set of options each, so every
// page shares one cache entry. None of the reads here polls (D3): each is read when a page opens, on
// Refresh, and after an action, and none of them wakes a sleeping disk.
//
// The reads that run smartctl on a disk (Smart.getInformation, getAttributes, getSelfTestLogs and
// getExtendedInformation) wake it. They use the generated query hooks with ON_REQUEST: never enabled,
// so TanStack Query never starts them by itself (not on mount, focus, reconnect, or when a finished task
// invalidates every query: an invalidation refetches only enabled queries with an observer), and the
// one way in is the reader's press, which calls `refetch()`. The result stays in the cache for the
// session (gcTime Infinity; the cache is emptied at sign-out and on a 401) and a reload forgets it
// (UI-13). Smart.enumerateDevices and Smart.enumerateMonitoredDevices are never used: the disk-health
// check (Smart.getListBg, dashboard/diskHealth.ts) is the one waking read of every disk.
import type {
  DiskDevice,
  GetListRequest,
} from "@omv-webui/react-api-omv/generated";
import {
  getDiskMgmtGetListQueryOptions,
  getFileSystemMgmtEnumerateFilesystemsQueryOptions,
  getFileSystemMgmtGetListQueryOptions,
  getMdMgmtEnumerateDevicesQueryOptions,
  useDiskMgmtGetList,
  useFileSystemMgmtEnumerateFilesystems,
  useFileSystemMgmtGetList,
  useMdMgmtEnumerateDevices,
  useSmartGetDeviceSettings,
  useSmartGetScheduleList,
  useSmartGetSettings,
} from "@omv-webui/react-api-omv/generated";
import { useTasks } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { diskSession } from "../disks/diskSession.ts";
import {
  byDeviceOrder,
  diskUse,
  hasUntraceableStorage,
  type DiskUseResult,
  type SessionMarks,
  type UseInputs,
} from "../disks/diskUse.ts";
import { isRaidPluginMissing } from "../disks/diskWords.ts";
import { useMemoryStore } from "../shell/memoryStore.ts";
import { readZfsDisks } from "./useFsApi.ts";
import { ALL_CONFIGURED } from "./useMonitoringReads.ts";
import { useZfsPoolDisks } from "./useZfsReads.ts";

/** Every disk, in device order (design 1.1). */
export const ALL_DISKS: GetListRequest = {
  start: 0,
  limit: null,
  sortfield: "devicename",
  sortdir: "asc",
};
/** Every scheduled self-test. */
export const ALL_TESTS: GetListRequest = {
  start: 0,
  limit: null,
  sortfield: null,
  sortdir: null,
};

/** A foreground read on opening a page and on Refresh; never on a timer, focus or reconnect. */
export const ON_OPEN = {
  refetchOnMount: "always",
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: Number.POSITIVE_INFINITY,
} as const;

/**
 * A read that wakes a disk: only the reader's press starts it (`refetch()`), and it is kept for the
 * session. Never enabled, never refetched by the query client, never retried.
 */
export const ON_REQUEST = {
  enabled: false,
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: false,
} as const;

export const useDiskList = () =>
  useDiskMgmtGetList(ALL_DISKS, { query: ON_OPEN });

/** The configured file systems, the same cache entry as the dashboard's (useMonitoringReads.ts). */
export const useConfiguredFs = () =>
  useFileSystemMgmtGetList(ALL_CONFIGURED, { query: ON_OPEN });

export const useDetectedFs = (enabled = true) =>
  useFileSystemMgmtEnumerateFilesystems({ query: { ...ON_OPEN, enabled } });

/** The RAID plugin's arrays. A 404 means the plugin is not installed; nothing retries it. */
export const useRaidArrays = () =>
  useMdMgmtEnumerateDevices({ query: { ...ON_OPEN, retry: false } });

export const useSmartSettings = () => useSmartGetSettings({ query: ON_OPEN });

export const useScheduleList = () =>
  useSmartGetScheduleList(ALL_TESTS, { query: ON_OPEN });

/** One disk's monitoring settings, by the stable device file from DiskMgmt.getList (never the URL). */
export const useDeviceSettings = (devicefile: string, enabled = true) =>
  useSmartGetDeviceSettings(
    { devicefile },
    { query: { ...ON_OPEN, enabled, retry: false } },
  );

export interface DiskInventory {
  /** DiskMgmt.getList's rows in device order, once read. */
  disks: DiskDevice[] | undefined;
  diskList: ReturnType<typeof useDiskList>;
  /** What each disk holds, by `devicename`. */
  uses: ReadonlyMap<string, DiskUseResult>;
  /** "loading" until every input is read; "failed" when any failed (fail closed); else "known". */
  useState: "loading" | "failed" | "known";
  /** The first failure among the use inputs, for its message (UI-9). */
  useError: unknown;
  /** The NAS has storage this interface cannot trace to its disks (P4). */
  untraceable: boolean;
  /** Whether any of the four reads is running now. */
  fetching: boolean;
}

/**
 * The Disks list's four reads together (0.6): the disks, the configured and the detected file
 * systems, and the RAID plugin's arrays, with what each disk holds and whether it may be wiped.
 */
export function useDiskInventory(): DiskInventory {
  const diskList = useDiskList();
  const configured = useConfiguredFs();
  const detected = useDetectedFs();
  const raid = useRaidArrays();
  const zfs = useZfsPoolDisks();
  const session = useMemoryStore(diskSession);
  const tasks = useTasks();

  const raidMissing = raid.isError && isRaidPluginMissing(raid.error);
  const inputs: UseInputs = {
    configured: configured.isError ? undefined : configured.data?.data,
    detected: detected.isError ? undefined : detected.data,
    arrays: raidMissing ? null : raid.isError ? undefined : raid.data,
    zfs: zfs.value,
  };
  const failed =
    configured.isError ||
    detected.isError ||
    (raid.isError && !raidMissing) ||
    zfs.failed;
  const useState = failed
    ? "failed"
    : inputs.configured === undefined ||
        inputs.detected === undefined ||
        inputs.arrays === undefined ||
        inputs.zfs === undefined
      ? "loading"
      : "known";
  const useError = configured.isError
    ? configured.error
    : detected.isError
      ? detected.error
      : raid.isError && !raidMissing
        ? raid.error
        : zfs.failed
          ? zfs.error
          : undefined;

  const rows = diskList.data?.data;
  const runningTasks = new Set(
    tasks.filter((t) => t.state === "running").map((t) => t.id),
  );
  const { configured: c, detected: d, arrays: a, zfs: z } = inputs;
  const disks = useMemo(
    () => (rows === undefined ? undefined : byDeviceOrder(rows)),
    [rows],
  );
  const uses = new Map<string, DiskUseResult>();
  for (const disk of disks ?? []) {
    const wipe = session.wipes[disk.devicefile];
    uses.set(
      disk.devicename,
      diskUse(
        disk,
        { configured: c, detected: d, arrays: a, zfs: z },
        {
          wiping: wipe !== undefined && runningTasks.has(wipe.taskId),
          wipedAt: session.wipedAt[disk.devicefile],
        },
      ),
    );
  }
  return {
    disks,
    diskList,
    uses,
    useState,
    useError,
    untraceable:
      disks === undefined
        ? false
        : hasUntraceableStorage(disks, {
            configured: c,
            detected: d,
            arrays: a,
            zfs: z,
          }),
    fetching:
      diskList.isFetching ||
      configured.isFetching ||
      detected.isFetching ||
      raid.isFetching ||
      zfs.fetching,
  };
}

/** The outcome of reading the four inputs again for one disk (design 3.2, 3.3). */
export type Recheck =
  | {
      kind: "ok";
      disk: DiskDevice;
      result: DiskUseResult;
      untraceable: boolean;
      /** The ZFS pools' disks were read, so ZFS is not among what cannot be traced. */
      zfsKnown: boolean;
    }
  | { kind: "refused"; disk: DiskDevice; result: DiskUseResult }
  | { kind: "changed"; disk: DiskDevice }
  | { kind: "gone" }
  | { kind: "unchecked"; error: unknown };

/**
 * Read the four inputs again, as foreground reads, and decide for the disk the page showed: still
 * there, still the same disk (serial number and model), and still free to wipe. Anything that could
 * not be read refuses (fail closed). The fresh replies land in the shared cache entries, so the page
 * shows what the check found.
 */
export function useRecheckDisk() {
  const queryClient = useQueryClient();
  return async (shown: DiskDevice, marks: SessionMarks): Promise<Recheck> => {
    const settle = <T>(promise: Promise<T>) =>
      promise.then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    const [list, configured, detected, arrays, zfs] = await Promise.all([
      settle(
        queryClient.fetchQuery({
          ...getDiskMgmtGetListQueryOptions(ALL_DISKS),
          staleTime: 0,
        }),
      ),
      settle(
        queryClient.fetchQuery({
          ...getFileSystemMgmtGetListQueryOptions(ALL_CONFIGURED),
          staleTime: 0,
        }),
      ),
      settle(
        queryClient.fetchQuery({
          ...getFileSystemMgmtEnumerateFilesystemsQueryOptions(),
          staleTime: 0,
        }),
      ),
      settle(
        queryClient.fetchQuery({
          ...getMdMgmtEnumerateDevicesQueryOptions(),
          staleTime: 0,
          retry: false,
        }),
      ),
      settle(readZfsDisks(queryClient)),
    ]);
    if (!list.ok) {
      return { kind: "unchecked", error: list.error };
    }
    const raidMissing =
      !arrays.ok &&
      isRpcError(arrays.error) &&
      isRaidPluginMissing(arrays.error);
    const failure = !configured.ok
      ? configured.error
      : !detected.ok
        ? detected.error
        : !arrays.ok && !raidMissing
          ? arrays.error
          : !zfs.ok
            ? zfs.error
            : undefined;
    const disks = list.value.data;
    const fresh = disks.find((d) => d.devicename === shown.devicename);
    if (fresh === undefined) {
      return { kind: "gone" };
    }
    if (
      fresh.serialnumber !== shown.serialnumber ||
      fresh.model !== shown.model ||
      fresh.devicefile !== shown.devicefile
    ) {
      return { kind: "changed", disk: fresh };
    }
    if (failure !== undefined || !configured.ok || !detected.ok || !zfs.ok) {
      return { kind: "unchecked", error: failure };
    }
    const inputs: UseInputs = {
      configured: configured.value.data,
      detected: detected.value,
      arrays: arrays.ok ? arrays.value : null,
      zfs: zfs.value,
    };
    const result = diskUse(fresh, inputs, marks);
    if (result.blockers.length > 0) {
      return { kind: "refused", disk: fresh, result };
    }
    return {
      kind: "ok",
      disk: fresh,
      result,
      untraceable: hasUntraceableStorage(disks, inputs),
      zfsKnown: zfs.value !== null,
    };
  };
}
