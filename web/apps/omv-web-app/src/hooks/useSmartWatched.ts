// SPDX-License-Identifier: GPL-3.0-or-later
// Whether each disk is watched (phase 5 disks design 2.5, 4.4, 6.1): Smart.getDeviceSettings for every
// disk of DiskMgmt.getList, by the row's stable device file. The one reply OMV gives a disk with no
// settings saved means "not watched"; any other failure is "not known". None of these reads wakes a
// disk (configuration only).
import type {
  DiskDevice,
  SmartDeviceSettings,
} from "@omv-webui/react-api-omv/generated";
import { getSmartGetDeviceSettingsQueryOptions } from "@omv-webui/react-api-omv/generated";
import { useQueries } from "@tanstack/react-query";
import { isNoDeviceSettings } from "../disks/diskWords.ts";
import { ON_OPEN } from "./useDiskReads.ts";

export type Watch =
  | { state: "loading" }
  | { state: "watched"; settings: SmartDeviceSettings }
  | { state: "notWatched"; settings: SmartDeviceSettings | null }
  | { state: "unknown"; error: unknown };

export function useSmartWatched(disks: readonly DiskDevice[] | undefined) {
  const rows = disks ?? [];
  const results = useQueries({
    queries: rows.map((disk) => ({
      ...getSmartGetDeviceSettingsQueryOptions({ devicefile: disk.devicefile }),
      ...ON_OPEN,
      retry: false,
    })),
  });
  const byDevice = new Map<string, Watch>();
  rows.forEach((disk, i) => {
    const result = results[i];
    let watch: Watch;
    if (
      result === undefined ||
      (result.data === undefined && result.isPending)
    ) {
      watch = { state: "loading" };
    } else if (result.data !== undefined && !result.isError) {
      watch = result.data.enable
        ? { state: "watched", settings: result.data }
        : { state: "notWatched", settings: result.data };
    } else if (isNoDeviceSettings(result.error)) {
      watch = { state: "notWatched", settings: null };
    } else if (result.data !== undefined) {
      watch = result.data.enable
        ? { state: "watched", settings: result.data }
        : { state: "notWatched", settings: result.data };
    } else {
      watch = { state: "unknown", error: result.error };
    }
    byDevice.set(disk.devicefile, watch);
  });
  const failed = results.filter(
    (r, i) => byDevice.get(rows[i]?.devicefile ?? "")?.state === "unknown" && r,
  );
  return {
    /** The disk's state, by its stable device file. */
    of: (devicefile: string): Watch =>
      byDevice.get(devicefile) ?? { state: "loading" },
    /** How many disks' settings could not be read. */
    failedCount: failed.length,
    /** Read the failed ones again (a foreground read; the reader asked). */
    retryFailed: () => {
      for (const r of failed) {
        void r.refetch();
      }
    },
    retrying: failed.some((r) => r.isFetching),
  };
}
