// SPDX-License-Identifier: GPL-3.0-or-later
// What the ZFS create and replace flows offer (phase 5 ZFS design 0.8, 3.1, 7.2): the plugin's
// candidates (Zfs.getEmptyCandidates, read when the form opens and on "Try again" or "Look for new
// disks") and the disk-use inputs with the pools' own disks, placed by zfsChoices (the stricter wins).
// Fail closed: any failed input offers nothing.
import { useTasks } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { useState } from "react";
import { diskSession } from "../disks/diskSession.ts";
import type { SessionMarks } from "../disks/diskUse.ts";
import { isRaidPluginMissing } from "../disks/diskWords.ts";
import { useMemoryStore } from "../shell/memoryStore.ts";
import { zfsChoices } from "../zfs/zfsChoices.ts";
import {
  useConfiguredFs,
  useDetectedFs,
  useDiskList,
  useRaidArrays,
} from "./useDiskReads.ts";
import { useFsApi } from "./useFsApi.ts";
import { useZfsCandidates, useZfsPoolDisks } from "./useZfsReads.ts";

export function useZfsDiskChoices(minSize: number | null = null) {
  const api = useFsApi();
  const candidates = useZfsCandidates();
  const disks = useDiskList();
  const configured = useConfiguredFs();
  const detected = useDetectedFs();
  const arrays = useRaidArrays();
  const zfs = useZfsPoolDisks();
  const session = useMemoryStore(diskSession);
  const tasks = useTasks();
  const [rescanning, setRescanning] = useState(false);

  const raidMissing =
    arrays.isError &&
    isRpcError(arrays.error) &&
    isRaidPluginMissing(arrays.error);
  const queries = [candidates, disks, configured, detected];
  const failedQuery =
    queries.find((q) => q.isError) ??
    (arrays.isError && !raidMissing ? arrays : undefined);
  const failed = failedQuery !== undefined || zfs.failed;
  const error = failedQuery?.error ?? zfs.error;
  const running = new Set(
    tasks.filter((x) => x.state === "running").map((x) => x.id),
  );
  const marks = (disk: { devicefile: string }): SessionMarks => {
    const wipe = session.wipes[disk.devicefile];
    return {
      wiping: wipe !== undefined && running.has(wipe.taskId),
      wipedAt: session.wipedAt[disk.devicefile],
    };
  };
  const choices = zfsChoices(
    {
      candidates: candidates.data,
      disks: disks.data?.data,
      configured: configured.data?.data,
      detected: detected.data,
      arrays: raidMissing ? null : arrays.data,
      zfs: zfs.value,
    },
    marks,
    { failed, error },
    minSize,
  );

  const readAll = () =>
    Promise.allSettled([
      ...queries.map((q) => q.refetch()),
      arrays.refetch(),
      zfs.refetch(),
    ]);

  const retry = () => {
    void readAll();
  };

  /** "Look for new disks": DiskMgmt.rescan, then the reads again. */
  const rescan = async () => {
    if (rescanning) {
      return;
    }
    setRescanning(true);
    try {
      await api.rescan();
    } catch {
      // A failed rescan still reads again: the reads say what is there.
    }
    await readAll();
    setRescanning(false);
  };

  return { choices, retry, rescan, rescanning };
}
