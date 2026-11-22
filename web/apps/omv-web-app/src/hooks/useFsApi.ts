// SPDX-License-Identifier: GPL-3.0-or-later
// The calls the file-system actions make, from the generated hooks, gathered for the runs that outlive
// a page (filesystems/flowRun.ts, filesystems/fsActions.ts): leaving the page does not stop a run, and
// coming back shows it (design 6.6). A run keeps the functions it started with; a mutation started
// after its page went still runs. Tasks go through the one registry, so the handles stay inside the
// task helper (UI-5). Nothing here retries (UI-14).
import {
  getDiskMgmtGetListQueryOptions,
  getFileSystemMgmtEnumerateFilesystemsQueryOptions,
  getFileSystemMgmtGetListQueryOptions,
  getFileSystemMgmtGetMountCandidatesQueryOptions,
  getFsTabGetByFsNameQueryOptions,
  getMdMgmtEnumerateDevicesQueryOptions,
  getShareMgmtGetListQueryOptions,
  getSystemGetInformationQueryOptions,
  getZfsGetPoolDevicesQueryOptions,
  getZfsGetPoolStatusQueryOptions,
  useConfigApplyChangesBg,
  useConfigRevertChangesBg,
  useDiskMgmtRescan,
  useDiskMgmtWipe,
  useFileSystemMgmtCreate,
  useFileSystemMgmtCreateBtrfs,
  useFileSystemMgmtGetCandidatesBg,
  useFileSystemMgmtGrow,
  useFileSystemMgmtSetMountPoint,
  useFileSystemMgmtUmountByDir,
  type ConfigApplyChangesRequest,
  type ConfiguredFilesystem,
  type DetectedFilesystem,
  type DiskDevice,
  type FileSystemMgmtCreateBtrfsRequest,
  type FileSystemMgmtCreateRequest,
  type FileSystemMgmtSetMountPointRequest,
  type FsTabEntryOrNone,
  type MdArray,
  type MountEntry,
  type SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  CancelledError,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { ZfsPoolDisks } from "../disks/diskUse.ts";
import { isRaidPluginMissing } from "../disks/diskWords.ts";
import { pendingModules } from "../pending/modules.ts";
import { ALL_ROWS } from "../sharedFolders/table.ts";
import { isPoolAddress } from "../zfs/zfsModel.ts";
import { ALL_DISKS } from "./useDiskReads.ts";
import { ALL_CONFIGURED } from "./useMonitoringReads.ts";

/** The task-starting calls resolve to the handle the registry follows. */
type Begin = () => Promise<string>;

export interface FsApi {
  // Reads, each a fresh foreground read whose reply lands in the shared cache entry.
  configured(): Promise<ConfiguredFilesystem[]>;
  detected(): Promise<DetectedFilesystem[]>;
  disks(): Promise<DiskDevice[]>;
  /** null when the RAID plugin is not installed. */
  arrays(): Promise<MdArray[] | null>;
  /**
   * The ZFS pools' disks (ZFS design 10.2); null when the ZFS plugin is not installed. A pool with no
   * disks, or one whose name the contract cannot send, fails the read (fail closed, D10).
   */
  zfsDisks(): Promise<ZfsPoolDisks[] | null>;
  mountCandidates(): Promise<DetectedFilesystem[]>;
  mountEntry(fsname: string): Promise<FsTabEntryOrNone>;
  shares(): Promise<SharedFolder[]>;
  pending(): Promise<string[]>;
  // Writes.
  candidates(): Begin;
  wipe(devicefile: string): Begin;
  create(request: FileSystemMgmtCreateRequest): Begin;
  createBtrfs(request: FileSystemMgmtCreateBtrfsRequest): Begin;
  apply(request: ConfigApplyChangesRequest): Begin;
  revert(): Begin;
  setMountPoint(
    request: FileSystemMgmtSetMountPointRequest,
  ): Promise<MountEntry>;
  grow(uuid: string): Promise<unknown>;
  umount(dir: string): Promise<unknown>;
  rescan(): Promise<unknown>;
}

/**
 * A read cancelled by the query client (a task that ended refreshes every read, which cancels one in
 * flight) is read again: it says nothing about the server. A real failure is passed on.
 */
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

/** The ZFS pools' disks, read fresh: getPoolStatus, then each pool's getPoolDevices (10.2, D10). */
export async function readZfsDisks(
  queryClient: QueryClient,
): Promise<ZfsPoolDisks[] | null> {
  const status = await uncancelled(() =>
    queryClient
      .fetchQuery({
        ...getZfsGetPoolStatusQueryOptions(),
        staleTime: 0,
        retry: false,
      })
      .catch((error: unknown) => {
        if (isRpcError(error) && error.status === 404) {
          return null;
        }
        throw error;
      }),
  );
  if (status === null) {
    return null;
  }
  return Promise.all(
    status.map(async (pool) => {
      if (!isPoolAddress(pool.name)) {
        throw new Error("A pool's name cannot be sent.");
      }
      const devices = await uncancelled(() =>
        queryClient.fetchQuery({
          ...getZfsGetPoolDevicesQueryOptions({ name: pool.name }),
          staleTime: 0,
          retry: false,
        }),
      );
      if (devices.length === 0) {
        throw new Error("A pool's disks could not be read.");
      }
      return { pool: pool.name, devices: devices.map((d) => d.devicefile) };
    }),
  );
}

export function useFsApi(): FsApi {
  const queryClient = useQueryClient();
  const candidates = useFileSystemMgmtGetCandidatesBg();
  const wipe = useDiskMgmtWipe();
  const create = useFileSystemMgmtCreate();
  const createBtrfs = useFileSystemMgmtCreateBtrfs();
  const apply = useConfigApplyChangesBg();
  const revert = useConfigRevertChangesBg();
  const setMountPoint = useFileSystemMgmtSetMountPoint();
  const grow = useFileSystemMgmtGrow();
  const umount = useFileSystemMgmtUmountByDir();
  const rescan = useDiskMgmtRescan();

  return {
    configured: () =>
      uncancelled(() =>
        queryClient
          .fetchQuery({
            ...getFileSystemMgmtGetListQueryOptions(ALL_CONFIGURED),
            staleTime: 0,
          })
          .then((list) => list.data),
      ),
    detected: () =>
      uncancelled(() =>
        queryClient.fetchQuery({
          ...getFileSystemMgmtEnumerateFilesystemsQueryOptions(),
          staleTime: 0,
        }),
      ),
    disks: () =>
      uncancelled(() =>
        queryClient
          .fetchQuery({
            ...getDiskMgmtGetListQueryOptions(ALL_DISKS),
            staleTime: 0,
          })
          .then((list) => list.data),
      ),
    arrays: () =>
      uncancelled(() =>
        queryClient
          .fetchQuery({
            ...getMdMgmtEnumerateDevicesQueryOptions(),
            staleTime: 0,
            retry: false,
          })
          .catch((error: unknown) => {
            if (isRpcError(error) && isRaidPluginMissing(error)) {
              return null;
            }
            throw error;
          }),
      ),
    zfsDisks: () => readZfsDisks(queryClient),
    mountCandidates: () =>
      uncancelled(() =>
        queryClient.fetchQuery({
          ...getFileSystemMgmtGetMountCandidatesQueryOptions(),
          staleTime: 0,
        }),
      ),
    mountEntry: (fsname) =>
      uncancelled(() =>
        queryClient.fetchQuery({
          ...getFsTabGetByFsNameQueryOptions({ fsname }),
          staleTime: 0,
          retry: false,
        }),
      ),
    shares: () =>
      uncancelled(() =>
        queryClient
          .fetchQuery({
            ...getShareMgmtGetListQueryOptions(ALL_ROWS),
            staleTime: 0,
          })
          .then((list) => list.data),
      ),
    pending: () =>
      uncancelled(() =>
        queryClient
          .fetchQuery({
            ...getSystemGetInformationQueryOptions(),
            staleTime: 0,
          })
          .then((info) => pendingModules(info.dirtyModules)),
      ),
    candidates: () => () => candidates.mutateAsync(),
    wipe: (devicefile) => () =>
      wipe.mutateAsync({ data: { devicefile, secure: false } }),
    create: (request) => () => create.mutateAsync({ data: request }),
    createBtrfs: (request) => () => createBtrfs.mutateAsync({ data: request }),
    apply: (request) => () => apply.mutateAsync({ data: request }),
    revert: () => () => revert.mutateAsync({ data: { filename: "" } }),
    setMountPoint: (request) => setMountPoint.mutateAsync({ data: request }),
    grow: (uuid) => grow.mutateAsync({ data: { id: uuid } }),
    umount: (dir) => umount.mutateAsync({ data: { dir } }),
    rescan: () => rescan.mutateAsync(),
  };
}
