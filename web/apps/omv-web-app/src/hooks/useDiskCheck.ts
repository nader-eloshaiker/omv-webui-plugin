// SPDX-License-Identifier: GPL-3.0-or-later
// The one disk-health check (phase 5 disks design 1.4, 8; D4), for every page that shows it: the
// dashboard's card, the Disks list, the Overview, a disk's page and the set-up flow. It reads every
// disk's health with Smart.getListBg, which wakes sleeping disks, so it starts only on the reader's
// press; its result is kept in memory for the session (dashboard/diskHealth.ts), so a check started
// anywhere fills every view.
import type { SmartDevice } from "@omv-webui/react-api-omv/generated";
import { useSmartGetListBg } from "@omv-webui/react-api-omv/generated";
import { useTranslation } from "react-i18next";
import { diskHealth, startDiskCheck } from "../dashboard/diskHealth.ts";
import { useMemoryStore } from "../shell/memoryStore.ts";

/** Every disk, in one request; the method takes the common list parameters. */
const ALL_DISKS = { start: 0, limit: null, sortfield: null, sortdir: null };

export function useDiskCheck() {
  const { t } = useTranslation();
  const state = useMemoryStore(diskHealth);
  const check = useSmartGetListBg();
  const checking = state.runningId !== undefined;
  const start = () => {
    if (checking) {
      return;
    }
    startDiskCheck(t("diskCheck.taskLabel"), () =>
      check.mutateAsync({ data: ALL_DISKS }),
    );
  };
  const devices = state.result?.list.data;
  /** A disk's reading in the last check, by its canonical device file; undefined if not in it. */
  const reading = (canonicaldevicefile: string): SmartDevice | undefined =>
    devices?.find((d) => d.canonicaldevicefile === canonicaldevicefile);
  return {
    state,
    checking,
    result: state.result,
    failed: state.failed && !checking,
    error: state.error,
    start,
    reading,
  };
}
