// SPDX-License-Identifier: GPL-3.0-or-later
// The Disks page's temperatures by kind (journal 2026-11-28, the owner): every disk, each RAID array
// and ZFS pool a group of its own, the rest as hard disks, SSDs and NVMe SSDs. On the dashboard's
// terms: each awake disk's kind once per visit (useDriveKinds, Smart.getInformation, never for a
// disk DiskMgmt.getList reports asleep), Smart.getSettings for the alert limit, and with the ZFS
// plugin each pool's disks once per visit. The arrays, the pools' status and the configured file
// systems are the cache entries the page's inventory already reads, so they cost no second call.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import type { DiskGroup } from "@omv-webui/react-ui-components";
import { temperatureGroups } from "../dashboard/nasModel.ts";
import {
  useConfiguredFs,
  useRaidArrays,
  useSmartSettings,
} from "./useDiskReads.ts";
import { useDriveKinds } from "./useDriveKinds.ts";
import {
  usePoolDevices,
  useZfsPlugin,
  useZfsPoolHealth,
} from "./useZfsReads.ts";

export function useDiskTemperatureGroups(
  disks: readonly DiskDevice[] | undefined,
): DiskGroup[] {
  const smart = useSmartSettings();
  const kinds = useDriveKinds(disks, true);
  const raid = useRaidArrays();
  const configured = useConfiguredFs();
  const zfsPlugin = useZfsPlugin(true);
  const installed = zfsPlugin === "installed";
  const pools = useZfsPoolHealth(installed);
  const poolDevices = usePoolDevices(
    (pools.data ?? []).map((p) => p.name),
    installed,
  );
  return temperatureGroups(
    disks ?? [],
    kinds,
    smart.data?.tempmax ?? 0,
    installed ? pools.data : null,
    poolDevices,
    (configured.data?.data ?? []).map((f) => ({
      devicename: f.devicename,
      label: f.label,
    })),
    raid.data ?? [],
  );
}
