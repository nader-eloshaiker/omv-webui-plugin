// SPDX-License-Identifier: GPL-3.0-or-later
// What the RAID create and add flows offer (phase 5 RAID design 0.7, 3.1, 4.2): the plugin's candidates
// (MdMgmt.getCandidates, read when the form opens and on "Try again" or "Look for new disks") and the
// disk-use inputs, placed by raidChoices (the stricter wins). Fail closed: any failed input offers
// nothing. A 404 means the plugin is not installed.
import { getMdMgmtGetCandidatesQueryOptions } from "@omv-webui/react-api-omv/generated";
import { useTasks } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { diskSession } from "../disks/diskSession.ts";
import type { SessionMarks } from "../disks/diskUse.ts";
import { isRaidPluginMissing } from "../disks/diskWords.ts";
import { raidChoices } from "../raid/raidChoices.ts";
import { useMemoryStore } from "../shell/memoryStore.ts";
import {
  ON_OPEN,
  useConfiguredFs,
  useDetectedFs,
  useDiskList,
  useRaidArrays,
} from "./useDiskReads.ts";
import { useFsApi } from "./useFsApi.ts";

export function useRaidDiskChoices(minSize: number | null = null) {
  const api = useFsApi();
  const candidates = useQuery({
    ...getMdMgmtGetCandidatesQueryOptions(),
    ...ON_OPEN,
    retry: false,
  });
  const disks = useDiskList();
  const configured = useConfiguredFs();
  const detected = useDetectedFs();
  const arrays = useRaidArrays();
  const session = useMemoryStore(diskSession);
  const tasks = useTasks();
  const [rescanning, setRescanning] = useState(false);

  const missing =
    (candidates.isError &&
      isRpcError(candidates.error) &&
      isRaidPluginMissing(candidates.error)) ||
    (arrays.isError &&
      isRpcError(arrays.error) &&
      isRaidPluginMissing(arrays.error));
  const queries = [candidates, disks, configured, detected, arrays];
  const failedRead = queries.find((q) => q.isError);
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
  const choices = raidChoices(
    {
      candidates: candidates.data,
      disks: disks.data?.data,
      configured: configured.data?.data,
      detected: detected.data,
      arrays: arrays.data,
    },
    marks,
    { failed: failedRead !== undefined, error: failedRead?.error },
    minSize,
  );

  const retry = () => {
    for (const q of queries) {
      if (q.isError || q === candidates) {
        void q.refetch();
      }
    }
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
    await Promise.allSettled(queries.map((q) => q.refetch()));
    setRescanning(false);
  };

  return { choices, missing, retry, rescan, rescanning };
}
