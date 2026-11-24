// SPDX-License-Identifier: GPL-3.0-or-later
// Apply and Undo of everything pending, for the pending band and the flows' pre-flights (style guide
// 5.8; phase 5 network design 1.8, 10.4, 13.1; UX audit R1). Both run as tasks through the one task
// registry. With the network slice:
// - the apply confirmation runs the network check (useNetworkApplyCheck) and passes its result here;
// - whenever a network module is pending, the apply waits for the NAS as 1.5 does (up to 60 seconds,
//   longer or shorter as the check expects) instead of reporting the first failed read as a failure,
//   and shows the recovery card when the NAS does not come back;
// - Undo of a removal this session saw (10.4) adds its line to the confirmation, and after the revert
//   applies the queued jobs and the network at once (`task` and `systemd-networkd`, forced), with the
//   brief wait; for a removal it did not see, it compares the stored interfaces before and after the
//   revert and offers the same apply when an interface came back.
// Nothing retries by itself (UI-14).
import {
  taskRegistry,
  type TaskSnapshot,
} from "@omv-webui/react-api-omv/tasks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { bandExpectation, bandWaits } from "../network/bandApply.ts";
import { UNDO_REMOVAL_APPLY } from "../network/changeFlow.ts";
import { networkSession } from "../network/networkSession.ts";
import { useNetworkApi } from "./useNetworkApi.ts";
import type { ApplyCheck } from "./useNetworkApplyCheck.ts";
import { useReconnectWatch } from "./useReconnectWatch.ts";

export type BandAction = "apply" | "undo" | "queued";

/** Resolves when the task ends (undefined if the registry forgot it: the session ended). */
export function whenSettled(id: number): Promise<TaskSnapshot | undefined> {
  return new Promise((resolve) => {
    let off: (() => void) | null = null;
    let done = false;
    const check = () => {
      const task = taskRegistry.get(id);
      if (!done && (task === undefined || task.state !== "running")) {
        done = true;
        off?.();
        resolve(task);
      }
    };
    off = taskRegistry.subscribe(check);
    check();
    if (done) {
      off();
    }
  });
}

export function useBandActions(modules: readonly string[]) {
  const { t } = useTranslation();
  const api = useNetworkApi();
  const watch = useReconnectWatch();
  const [confirming, setConfirming] = useState<"apply" | "undo" | null>(null);
  const [last, setLast] = useState<{ id: number; action: BandAction } | null>(
    null,
  );
  /** The check the last apply was confirmed with, for the watch's words and the recovery card. */
  const [applied, setApplied] = useState<{
    check: ApplyCheck | null;
    modules: readonly string[];
  } | null>(null);
  /** Interfaces whose settings came back with an Undo this session did not see removed (10.4). */
  const [cameBack, setCameBack] = useState<readonly string[]>([]);

  const startApply = (
    label: string,
    modulesToApply: readonly string[],
    force: boolean,
    action: BandAction,
    check: ApplyCheck | null,
    waitFor: readonly string[],
  ) => {
    const id = taskRegistry.start(label, api.apply(modulesToApply, force));
    setLast({ id, action });
    if (bandWaits(waitFor)) {
      setApplied({ check, modules: waitFor });
      watch.start({
        expectation: bandExpectation(check?.check ?? null),
        taskId: id,
        modules: waitFor,
      });
    } else {
      setApplied(null);
      watch.reset();
    }
  };

  const apply = (check: ApplyCheck | null) => {
    setConfirming(null);
    setCameBack([]);
    startApply(t("pending.applyTask"), [], false, "apply", check, modules);
  };

  /** 10.4: the queued jobs and the network at once, forced, with the brief wait. */
  const applyQueued = () => {
    setCameBack([]);
    startApply(
      t("netApply.queuedTask"),
      UNDO_REMOVAL_APPLY.modules,
      UNDO_REMOVAL_APPLY.force,
      "queued",
      null,
      UNDO_REMOVAL_APPLY.modules,
    );
  };

  const undo = async () => {
    setConfirming(null);
    setCameBack([]);
    watch.reset();
    setApplied(null);
    const known = modules.includes("task")
      ? networkSession.getState().ifacesRemoved
      : [];
    // A queued job can be pending only with `task`; then read what is stored before the revert.
    const before = modules.includes("task")
      ? await api.rereads.stored().catch(() => null)
      : null;
    const id = taskRegistry.start(t("pending.undoTask"), api.revert());
    setLast({ id, action: "undo" });
    const task = await whenSettled(id);
    if (task?.state !== "done") {
      return;
    }
    if (known.length > 0) {
      applyQueued();
      return;
    }
    if (before !== null) {
      const after = await api.rereads.stored().catch(() => null);
      const back =
        after
          ?.map((s) => s.devicename)
          .filter((name) => !before.some((b) => b.devicename === name)) ?? [];
      setCameBack(back);
    }
  };

  /** The watch and its outcome were read: the band may go. */
  const dismiss = () => {
    watch.reset();
    setApplied(null);
  };

  return {
    confirming,
    setConfirming,
    last,
    apply,
    undo: () => void undo(),
    applyQueued,
    cameBack,
    dismissCameBack: () => setCameBack([]),
    watch,
    applied,
    dismiss,
  };
}

export type BandActions = ReturnType<typeof useBandActions>;
