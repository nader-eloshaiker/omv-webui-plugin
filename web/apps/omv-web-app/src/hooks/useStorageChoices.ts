// SPDX-License-Identifier: GPL-3.0-or-later
// What Flow A offers (phase 5 file-systems design 6.2, 6.3): the server's candidate task, run once when
// the flow's form opens and again on "Try again" or "Look for new disks", and the disks slice's four
// reads, placed by storageChoices (the stricter wins). The task reads the disks, so it runs only here;
// it is read-only and its handle stays in the task helper (UI-5). Fail closed: any failed input offers
// nothing.
import type { FilesystemCandidate } from "@omv-webui/react-api-omv/generated";
import { taskRegistry, useTasks } from "@omv-webui/react-api-omv/tasks";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { diskSession } from "../disks/diskSession.ts";
import type { SessionMarks } from "../disks/diskUse.ts";
import { isRaidPluginMissing } from "../disks/diskWords.ts";
import { startTask } from "../filesystems/fsTasks.ts";
import { storageChoices } from "../filesystems/storageChoices.ts";
import { useMemoryStore } from "../shell/memoryStore.ts";
import {
  useConfiguredFs,
  useDetectedFs,
  useDiskList,
  useRaidArrays,
} from "./useDiskReads.ts";
import { useFsApi } from "./useFsApi.ts";
import { useZfsPoolDisks } from "./useZfsReads.ts";

type Candidates =
  | { state: "loading" }
  | { state: "done"; list: FilesystemCandidate[] }
  | { state: "failed"; error: unknown };

export function useStorageChoices() {
  const { t } = useTranslation();
  const api = useFsApi();
  const disks = useDiskList();
  const configured = useConfiguredFs();
  const detected = useDetectedFs();
  const raid = useRaidArrays();
  const zfs = useZfsPoolDisks();
  const session = useMemoryStore(diskSession);
  const tasks = useTasks();
  const [candidates, setCandidates] = useState<Candidates>({
    state: "loading",
  });
  const [rescanning, setRescanning] = useState(false);
  const runRef = useRef(0);
  const startedRef = useRef(false);

  const look = () => {
    const mine = ++runRef.current;
    setCandidates({ state: "loading" });
    const task = startTask(t("addStorage.task.candidates"), api.candidates());
    void task.settled.then((done) => {
      taskRegistry.dismiss(task.id);
      if (runRef.current !== mine) {
        return;
      }
      setCandidates(
        done.state === "done" && Array.isArray(done.result)
          ? { state: "done", list: done.result as FilesystemCandidate[] }
          : { state: "failed", error: done.error },
      );
    });
  };

  // Once when the form opens (R9 allows reads on opening; nothing is changed). The ref keeps it to
  // one task even when StrictMode runs the effect twice.
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      look();
    }
  });

  const raidMissing = raid.isError && isRaidPluginMissing(raid.error);
  const failedRead = [disks, configured, detected].find(
    (q) => q.data === undefined && q.isError,
  );
  const failed =
    candidates.state === "failed" ||
    failedRead !== undefined ||
    (raid.isError && !raidMissing) ||
    zfs.failed;
  const error =
    candidates.state === "failed"
      ? candidates.error
      : (failedRead?.error ??
        (raid.isError && !raidMissing ? raid.error : zfs.error));

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

  const choices = storageChoices(
    {
      candidates: candidates.state === "done" ? candidates.list : undefined,
      disks: disks.data?.data,
      configured: configured.data?.data,
      detected: detected.data,
      arrays: raidMissing ? null : raid.data,
      zfs: zfs.value,
    },
    marks,
    { failed, error },
  );

  const retry = () => {
    for (const q of [disks, configured, detected, raid]) {
      if (q.isError) {
        void q.refetch();
      }
    }
    if (zfs.failed) {
      void zfs.refetch();
    }
    look();
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
    await Promise.allSettled([api.disks(), api.configured(), api.detected()]);
    setRescanning(false);
    look();
  };

  return { choices, retry, rescan, rescanning };
}
