// SPDX-License-Identifier: GPL-3.0-or-later
// The file-system pages' reads (phase 5 file-systems design 1.1, 2.1, 2.5), with one set of options
// each, so every page shares one cache entry. Nothing polls (D13): each is read when a page opens, on
// Refresh and after an action. The technical details read the file system on the disk, which wakes it,
// so they use ON_REQUEST: never enabled, read only by the reader's press, kept for the session.
import {
  getDiskMgmtGetListQueryOptions,
  getFileSystemMgmtEnumerateFilesystemsQueryOptions,
  getFileSystemMgmtEnumerateMountedFilesystemsQueryOptions,
  getFileSystemMgmtGetListQueryOptions,
  getFileSystemMgmtGetMountCandidatesQueryOptions,
  getMdMgmtEnumerateDevicesQueryOptions,
  getShareMgmtGetListQueryOptions,
  useFileSystemMgmtEnumerateMountedFilesystems,
  useFileSystemMgmtGetDetails,
  useFileSystemMgmtGetMountCandidates,
  useFsTabGetByFsName,
  useServicesGetStatus,
  useShareMgmtGetList,
} from "@omv-webui/react-api-omv/generated";
import { ALL_ROWS } from "../sharedFolders/table.ts";
import { ALL_DISKS, ON_OPEN, ON_REQUEST } from "./useDiskReads.ts";
import {
  ALL_CONFIGURED,
  MOUNTED_REQUEST,
  useForegroundRead,
} from "./useMonitoringReads.ts";

export const useMountCandidates = () =>
  useFileSystemMgmtGetMountCandidates({ query: ON_OPEN });

/** The mounted file systems with the system drive, the dashboard's cache entry, read but not polled. */
export const useMountedWithRoot = () =>
  useFileSystemMgmtEnumerateMountedFilesystems(MOUNTED_REQUEST, {
    query: ON_OPEN,
  });

/** Every shared folder, the Shared folders page's whole-list entry. */
export const useAllShares = (enabled = true) =>
  useShareMgmtGetList(ALL_ROWS, { query: { ...ON_OPEN, enabled } });

/** A file system's mount entry, by the stable path OMV stored (the row's devicefile, never the URL). */
export const useMountEntry = (fsname: string, enabled = true) =>
  useFsTabGetByFsName(
    { fsname },
    { query: { ...ON_OPEN, enabled: enabled && fsname !== "", retry: false } },
  );

/** Which services are on, for the sharing handover (whether SMB/CIFS is on). */
export const useServicesOnce = () => useServicesGetStatus({ query: ON_OPEN });

/** The file system's own report: only the reader's press reads it (2.5). */
export const useFsDetails = (devicefile: string) =>
  useFileSystemMgmtGetDetails({ devicefile }, { query: ON_REQUEST });

/**
 * Read the list page's inputs again, as foreground reads, and wait for them: the configured, detected
 * and mounted file systems, the mount candidates, the disks and the RAID arrays. Each read is named by
 * its own options, so nothing here can reach a read that wakes a disk.
 */
export function useReadFileSystemsAgain() {
  const read = useForegroundRead();
  return (withShares = false) =>
    Promise.all([
      read(getFileSystemMgmtGetListQueryOptions(ALL_CONFIGURED)),
      read(getFileSystemMgmtGetMountCandidatesQueryOptions()),
      read(
        getFileSystemMgmtEnumerateMountedFilesystemsQueryOptions(
          MOUNTED_REQUEST,
        ),
      ),
      read(getFileSystemMgmtEnumerateFilesystemsQueryOptions()),
      read(getDiskMgmtGetListQueryOptions(ALL_DISKS)),
      read({ ...getMdMgmtEnumerateDevicesQueryOptions(), retry: false }),
      ...(withShares ? [read(getShareMgmtGetListQueryOptions(ALL_ROWS))] : []),
    ]).then(() => undefined);
}
