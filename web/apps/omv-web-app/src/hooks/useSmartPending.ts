// SPDX-License-Identifier: GPL-3.0-or-later
// Whether the disk-health module has saved changes waiting to be applied (phase 5 disks design 0.7):
// every setting of this slice (disk health, each disk's monitoring and power settings, scheduled
// self-tests) marks the one module `smartmontools`, so every page of the slice shows the same mark.
import { pendingModules } from "../pending/modules.ts";
import { useSystemInformation } from "./useSystemInformation.ts";

export const SMART_MODULE = "smartmontools";

export function useSmartPending(): boolean {
  const info = useSystemInformation();
  return pendingModules(info.data?.dirtyModules).includes(SMART_MODULE);
}
