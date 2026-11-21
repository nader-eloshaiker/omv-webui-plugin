// SPDX-License-Identifier: GPL-3.0-or-later
// The calls the RAID actions make, from the generated hooks, gathered for the runs that outlive a page
// (raid/raidRun.ts) and the dialogs' re-checks: each read is a fresh foreground read whose reply lands
// in the shared cache entry, so the page shows what the check found. Nothing here retries (UI-14).
import {
  getMdMgmtEnumerateDevicesQueryOptions,
  getMdMgmtGetCandidatesQueryOptions,
  getMdMgmtGetDetailQueryOptions,
  getMdMgmtGetSlavesQueryOptions,
  useMdMgmtAdd,
  useMdMgmtCreate,
  useMdMgmtDelete,
  useMdMgmtGrow,
  useMdMgmtRemove,
  useMdMgmtSetSyncAction,
  type MdArray,
  type MdChange,
  type MdDisk,
  type MdMgmtCreateRequest,
  type MdMgmtSetSyncActionRequestAction,
} from "@omv-webui/react-api-omv/generated";
import { CancelledError, useQueryClient } from "@tanstack/react-query";

export interface RaidApi {
  /** The arrays, fresh. The plugin is installed on the pages that use this. */
  arrays(): Promise<MdArray[]>;
  detail(devicefile: string): Promise<string>;
  slaves(devicefile: string): Promise<MdDisk[]>;
  candidates(): Promise<MdDisk[]>;
  create(request: MdMgmtCreateRequest): Promise<MdChange>;
  add(devicefile: string, device: string): Promise<MdChange>;
  grow(devicefile: string, devices: string[]): Promise<MdChange>;
  remove(devicefile: string, device: string): Promise<MdChange>;
  delete(devicefile: string): Promise<MdChange>;
  syncAction(
    devicefile: string,
    action: MdMgmtSetSyncActionRequestAction,
  ): Promise<unknown>;
}

/** A read cancelled by the query client (a finished task refreshes every read) is read again. */
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

export function useRaidApi(): RaidApi {
  const queryClient = useQueryClient();
  const create = useMdMgmtCreate();
  const add = useMdMgmtAdd();
  const grow = useMdMgmtGrow();
  const remove = useMdMgmtRemove();
  const del = useMdMgmtDelete();
  const sync = useMdMgmtSetSyncAction();
  const fresh = { staleTime: 0, retry: false } as const;
  return {
    arrays: () =>
      uncancelled(() =>
        queryClient.fetchQuery({
          ...getMdMgmtEnumerateDevicesQueryOptions(),
          ...fresh,
        }),
      ),
    detail: (devicefile) =>
      uncancelled(() =>
        queryClient.fetchQuery({
          ...getMdMgmtGetDetailQueryOptions({ devicefile }),
          ...fresh,
        }),
      ),
    slaves: (devicefile) =>
      uncancelled(() =>
        queryClient.fetchQuery({
          ...getMdMgmtGetSlavesQueryOptions({ devicefile }),
          ...fresh,
        }),
      ),
    candidates: () =>
      uncancelled(() =>
        queryClient.fetchQuery({
          ...getMdMgmtGetCandidatesQueryOptions(),
          ...fresh,
        }),
      ),
    create: (request) => create.mutateAsync({ data: request }),
    add: (devicefile, device) =>
      add.mutateAsync({ data: { devicefile, devices: [device] } }),
    grow: (devicefile, devices) =>
      grow.mutateAsync({ data: { devicefile, devices } }),
    remove: (devicefile, device) =>
      remove.mutateAsync({ data: { devicefile, devices: [device] } }),
    delete: (devicefile) => del.mutateAsync({ data: { devicefile } }),
    syncAction: (devicefile, action) =>
      sync.mutateAsync({ data: { devicefile, action } }),
  };
}
