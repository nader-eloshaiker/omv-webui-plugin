// SPDX-License-Identifier: GPL-3.0-or-later
// The calls the ZFS actions make, from the generated hooks, gathered for the runs that outlive a page
// (zfs/zfsRun.ts, zfs/zfsActions.ts) and the dialogs' re-checks: each read is a fresh foreground read
// whose reply lands in the shared cache entry, so the page shows what the check found. Nothing here
// retries (UI-14).
import {
  getZfsGetAllSnapshotsQueryOptions,
  getZfsGetEmptyCandidatesQueryOptions,
  getZfsGetObjectDetailsQueryOptions,
  getZfsGetPoolDevicesQueryOptions,
  getZfsListPoolsQueryOptions,
  useZfsAddObject,
  useZfsAddPool,
  useZfsClearPool,
  useZfsDeleteObjectBg,
  useZfsDeviceOffline,
  useZfsDeviceOnline,
  useZfsDeviceReplace,
  useZfsQuickSnapshot,
  useZfsRollbackSnapshot,
  useZfsScrubPool,
  useZfsSetProperties,
  useZfsStopScrub,
  type ZfsAddPoolRequest,
  type ZfsCandidate,
  type ZfsDeleteObjectRequest,
  type ZfsObject,
  type ZfsPoolDevice,
  type ZfsSetPropertiesRequest,
  type ZfsSnapshot,
} from "@omv-webui/react-api-omv/generated";
import { CancelledError, useQueryClient } from "@tanstack/react-query";
import { ALL_ROWS } from "./useZfsReads.ts";

type Begin = () => Promise<string>;

export interface ZfsApi {
  list(): Promise<ZfsObject[]>;
  report(pool: string): Promise<string>;
  devices(pool: string): Promise<ZfsPoolDevice[]>;
  candidates(): Promise<ZfsCandidate[]>;
  snapshots(): Promise<ZfsSnapshot[]>;
  addPool(request: ZfsAddPoolRequest): Promise<unknown>;
  addFs(pool: string, name: string): Promise<unknown>;
  setProperties(request: ZfsSetPropertiesRequest): Promise<unknown>;
  quickSnapshot(name: string, recursive: boolean): Promise<unknown>;
  rollback(path: string): Promise<unknown>;
  /** Starts the delete task: the registry follows the handle (UI-5). */
  delete(request: ZfsDeleteObjectRequest): Begin;
  scrub(pool: string): Promise<unknown>;
  stopScrub(pool: string): Promise<unknown>;
  replace(pool: string, olddevice: string, newdevice: string): Promise<unknown>;
  offline(pool: string, device: string): Promise<unknown>;
  online(pool: string, device: string): Promise<unknown>;
  clear(pool: string): Promise<unknown>;
}

async function uncancelled<T>(read: () => Promise<T>, tries = 3): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof CancelledError && tries > 1) {
      return uncancelled(read, tries - 1);
    }
    throw error;
  }
}

export function useZfsApi(): ZfsApi {
  const queryClient = useQueryClient();
  const addPool = useZfsAddPool();
  const addObject = useZfsAddObject();
  const setProperties = useZfsSetProperties();
  const quick = useZfsQuickSnapshot();
  const rollback = useZfsRollbackSnapshot();
  const del = useZfsDeleteObjectBg();
  const scrub = useZfsScrubPool();
  const stop = useZfsStopScrub();
  const replace = useZfsDeviceReplace();
  const offline = useZfsDeviceOffline();
  const online = useZfsDeviceOnline();
  const clear = useZfsClearPool();
  const fresh = { staleTime: 0, retry: false } as const;
  return {
    list: () =>
      uncancelled(() =>
        queryClient
          .fetchQuery({ ...getZfsListPoolsQueryOptions(ALL_ROWS), ...fresh })
          .then((l) => l.data),
      ),
    report: (pool) =>
      uncancelled(() =>
        queryClient.fetchQuery({
          ...getZfsGetObjectDetailsQueryOptions({ type: "Pool", name: pool }),
          ...fresh,
        }),
      ),
    devices: (pool) =>
      uncancelled(() =>
        queryClient.fetchQuery({
          ...getZfsGetPoolDevicesQueryOptions({ name: pool }),
          ...fresh,
        }),
      ),
    candidates: () =>
      uncancelled(() =>
        queryClient.fetchQuery({
          ...getZfsGetEmptyCandidatesQueryOptions(),
          ...fresh,
        }),
      ),
    snapshots: () =>
      uncancelled(() =>
        queryClient
          .fetchQuery({
            ...getZfsGetAllSnapshotsQueryOptions(ALL_ROWS),
            ...fresh,
          })
          .then((l) => l.data),
      ),
    addPool: (request) => addPool.mutateAsync({ data: request }),
    addFs: (pool, name) =>
      addObject.mutateAsync({
        data: { type: "filesystem", path: pool, name, mountpoint: "" },
      }),
    setProperties: (request) => setProperties.mutateAsync({ data: request }),
    quickSnapshot: (name, recursive) =>
      quick.mutateAsync({ data: { name, recursive } }),
    rollback: (path) => rollback.mutateAsync({ data: { name: path } }),
    delete: (request) => () => del.mutateAsync({ data: request }),
    scrub: (pool) => scrub.mutateAsync({ data: { name: pool } }),
    stopScrub: (pool) => stop.mutateAsync({ data: { name: pool } }),
    replace: (pool, olddevice, newdevice) =>
      replace.mutateAsync({ data: { pool, olddevice, newdevice } }),
    offline: (pool, device) => offline.mutateAsync({ data: { pool, device } }),
    online: (pool, device) => online.mutateAsync({ data: { pool, device } }),
    clear: (pool) => clear.mutateAsync({ data: { name: pool } }),
  };
}
