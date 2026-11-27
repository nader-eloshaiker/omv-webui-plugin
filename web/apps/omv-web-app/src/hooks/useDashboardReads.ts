// SPDX-License-Identifier: GPL-3.0-or-later
// The administrator's dashboard's reads (journal 2026-11-27, binding), each its own query so a slow
// one never holds up the others, each on the cache entry its own pages use:
// - System.getInformation from the shell's poll (a background call, UI-14);
// - the mounted file systems (polled every 20 s in the background) and every configured one (once
//   per visit), the services (polled), the interfaces (the shell's poll);
// - DiskMgmt.getList and Smart.getSettings, once per visit; each disk's kind (useDriveKinds);
// - the shared folders and the SMB and NFS share lists, once per visit;
// - with the ZFS plugin installed, Zfs.getPoolStatus and each pool's Zfs.getPoolDevices, once per
//   visit, never polled;
// - disk health (Smart.getListBg) only when the person asks (useDiskCheck).
// MdMgmt is never read here: its enumeration reads a member disk's superblock.
//
// "Try again" for a lane is a foreground read of its entries (useForegroundRead), because the person
// asked.
import {
  getDiskMgmtGetListQueryOptions,
  getFileSystemMgmtEnumerateMountedFilesystemsQueryOptions,
  getFileSystemMgmtGetListQueryOptions,
  getNetworkEnumerateDevicesListQueryOptions,
  getNfsGetShareListQueryOptions,
  getServicesGetStatusQueryOptions,
  getShareMgmtGetListQueryOptions,
  getSmbGetShareListQueryOptions,
  getZfsGetPoolDevicesQueryOptions,
  getZfsGetPoolStatusQueryOptions,
  type ZfsPoolDevice,
} from "@omv-webui/react-api-omv/generated";
import type { NasLane } from "@omv-webui/react-ui-components";
import { useQueries } from "@tanstack/react-query";
import { isPoolAddress } from "../zfs/zfsModel.ts";
import { useDiskCheck } from "./useDiskCheck.ts";
import {
  ALL_DISKS,
  ON_OPEN,
  useDiskList,
  useSmartSettings,
} from "./useDiskReads.ts";
import { useDriveKinds } from "./useDriveKinds.ts";
import {
  ALL_CONFIGURED,
  ALL_INTERFACES,
  MOUNTED_REQUEST,
  useConfiguredFilesystems,
  useForegroundRead,
  useMountedFilesystems,
  useNetworkInterfaces,
  useServiceStatus,
} from "./useMonitoringReads.ts";
import { useNfsShares } from "./useNfsReads.ts";
import {
  SHARES_ALL,
  useSharedFoldersAll,
  useSmbShares,
} from "./useSharesReads.ts";
import { useSystemInformation } from "./useSystemInformation.ts";
import { useZfsPlugin, useZfsPoolHealth } from "./useZfsReads.ts";

export function useDashboardReads() {
  const info = useSystemInformation();
  const mounted = useMountedFilesystems();
  const configured = useConfiguredFilesystems();
  const services = useServiceStatus();
  const network = useNetworkInterfaces();
  const diskList = useDiskList();
  const smart = useSmartSettings();
  const folders = useSharedFoldersAll();
  const smb = useSmbShares();
  const nfs = useNfsShares();
  const zfsPlugin = useZfsPlugin(true);
  const pools = useZfsPoolHealth(zfsPlugin === "installed");
  const check = useDiskCheck();
  const kinds = useDriveKinds(diskList.data?.data, true);

  const poolNames = (pools.data ?? []).map((p) => p.name);
  const devices = useQueries({
    queries: poolNames.map((name) => ({
      ...getZfsGetPoolDevicesQueryOptions({ name }),
      ...ON_OPEN,
      retry: false,
      enabled: zfsPlugin === "installed" && isPoolAddress(name),
    })),
  });
  const poolDevices = new Map<string, readonly ZfsPoolDevice[] | "failed">();
  poolNames.forEach((name, i) => {
    const read = devices[i];
    if (read?.data !== undefined) {
      poolDevices.set(name, read.data);
    } else if (read?.isError === true || !isPoolAddress(name)) {
      poolDevices.set(name, "failed");
    }
  });

  const read = useForegroundRead();
  const retry: Record<NasLane, () => void> = {
    disks: () => void read(getDiskMgmtGetListQueryOptions(ALL_DISKS)),
    storage: () => {
      void read(
        getFileSystemMgmtEnumerateMountedFilesystemsQueryOptions(
          MOUNTED_REQUEST,
        ),
      );
      void read(getFileSystemMgmtGetListQueryOptions(ALL_CONFIGURED));
      if (zfsPlugin === "installed") {
        void read({ ...getZfsGetPoolStatusQueryOptions(), retry: false });
      }
    },
    folders: () => void read(getShareMgmtGetListQueryOptions(SHARES_ALL)),
    ways: () => {
      void read(getServicesGetStatusQueryOptions());
      void read(getSmbGetShareListQueryOptions(SHARES_ALL));
      void read(getNfsGetShareListQueryOptions(SHARES_ALL));
    },
    network: () =>
      void read(getNetworkEnumerateDevicesListQueryOptions(ALL_INTERFACES)),
  };
  const fetching: Record<NasLane, boolean> = {
    disks: diskList.isFetching,
    storage: mounted.isFetching || configured.isFetching || pools.isFetching,
    folders: folders.isFetching,
    ways: services.isFetching || smb.isFetching || nfs.isFetching,
    network: network.isFetching,
  };

  return {
    info,
    mounted,
    configured,
    services,
    network,
    diskList,
    smart,
    folders,
    smb,
    nfs,
    zfsPlugin,
    pools,
    poolDevices,
    check,
    kinds,
    retry,
    fetching,
  };
}
