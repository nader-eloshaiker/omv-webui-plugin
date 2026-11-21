// SPDX-License-Identifier: GPL-3.0-or-later
// Flow D's run (phase 5 disks design 7.5, 7.6; UX audit R3 to R10). It starts only from the reader's
// press of "Set up monitoring" (R9: never on page load) and runs the plan's steps in order: the NAS-wide
// settings (re-read first, R4), each disk's monitoring (re-read when saved before), each disk's
// self-tests, a fresh look at what is pending (R10), the apply as a task through the one registry,
// and a read-only check. A failed step stops what depends on it and waits for the reader: nothing is
// retried by itself (UI-14). The handles stay in the task helper (UI-5); the journal is in memory.
import {
  getSmartGetDeviceSettingsQueryOptions,
  getSmartGetScheduleListQueryOptions,
  getSmartGetSettingsQueryOptions,
  getSystemGetInformationQueryOptions,
  useConfigApplyChangesBg,
  useConfigRevertChangesBg,
  useSmartSetDeviceSettings,
  useSmartSetScheduledTest,
  useSmartSetSettings,
  type SmartDevice,
} from "@omv-webui/react-api-omv/generated";
import {
  taskRegistry,
  type TaskSnapshot,
} from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import type { TaskStatus } from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isNoDeviceSettings, NEW_OBJECT_UUID } from "../disks/diskWords.ts";
import {
  scheduleOf,
  settingsUnchanged,
  type SetUpChoices,
  type SetUpPlan,
} from "../disks/setupPlan.ts";
import { pendingModules } from "../pending/modules.ts";
import { ALL_TESTS } from "./useDiskReads.ts";
import { SMART_MODULE } from "./useSmartPending.ts";

export interface StepState {
  status: TaskStatus;
  /** A line under the step: "Already as chosen", or the server's message of a failure (as text). */
  detail?: string;
}

export type RunPhase =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "globalFailed"; error: unknown }
  | { kind: "disksFailed"; failed: { disk: SmartDevice; error: unknown }[] }
  | { kind: "alsoPending"; others: string[] }
  | { kind: "applyFailed"; error: unknown }
  | {
      kind: "verifyFailed";
      devices: string[];
      global: boolean;
      tests: string[];
    }
  | { kind: "done" }
  | { kind: "stopped"; saved: boolean }
  | { kind: "undone" };

const messageOf = (error: unknown): string | undefined =>
  isRpcError(error) ? error.message : undefined;

/** Start a task in the registry and wait until it ends. */
function runTask(label: string, begin: () => Promise<string>) {
  return new Promise<TaskSnapshot>((resolve) => {
    const id = taskRegistry.start(label, begin);
    const off = taskRegistry.onSettled((task) => {
      if (task.id === id) {
        off();
        resolve(task);
      }
    });
  });
}

export function useSetUpRun(plan: SetUpPlan, choices: SetUpChoices) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setSettings = useSmartSetSettings();
  const setDevice = useSmartSetDeviceSettings();
  const setTest = useSmartSetScheduledTest();
  const apply = useConfigApplyChangesBg();
  const revert = useConfigRevertChangesBg();

  const initial = Object.fromEntries(
    plan.steps.map((s) => [s.id, { status: "waiting" } satisfies StepState]),
  ) as Record<string, StepState>;
  const [steps, setSteps] = useState<Record<string, StepState>>(initial);
  const [phase, setPhase] = useState<RunPhase>({ kind: "idle" });
  const [busy, setBusy] = useState<string | null>(null);
  // Which disks are watched now (by this run or before it), for the test steps and the check.
  const watchedRef = useRef(new Set<string>());
  const failedRef = useRef(new Map<string, unknown>());

  const stepsRef = useRef(initial);

  const mark = (id: string, state: StepState) => {
    stepsRef.current = { ...stepsRef.current, [id]: state };
    setSteps(stepsRef.current);
  };

  async function runGlobal(): Promise<boolean> {
    mark("global", { status: "running" });
    try {
      const saved = await queryClient.fetchQuery({
        ...getSmartGetSettingsQueryOptions(),
        staleTime: 0,
      });
      const next = {
        ...plan.settings,
        interval: saved.interval,
        tempdiff: saved.tempdiff,
      };
      if (settingsUnchanged(saved, next)) {
        mark("global", {
          status: "succeeded",
          detail: t("smart.setup.step.unchanged"),
        });
        return true;
      }
      await setSettings.mutateAsync({ data: next });
      mark("global", { status: "succeeded" });
      return true;
    } catch (error) {
      mark("global", { status: "failed", detail: messageOf(error) });
      setPhase({ kind: "globalFailed", error });
      return false;
    }
  }

  async function runWatch(disk: SmartDevice): Promise<void> {
    const id = `watch:${disk.canonicaldevicefile}`;
    mark(id, { status: "running" });
    let uuid = NEW_OBJECT_UUID;
    let tempdiff = 0;
    let tempmax = 0;
    if (disk.uuid !== NEW_OBJECT_UUID) {
      // R4: the saved settings are read again just before they are written.
      try {
        const saved = await queryClient.fetchQuery({
          ...getSmartGetDeviceSettingsQueryOptions({
            devicefile: disk.devicefile,
          }),
          staleTime: 0,
          retry: false,
        });
        uuid = saved.uuid;
        tempdiff = saved.tempdiff;
        tempmax = saved.tempmax;
      } catch (error) {
        if (!(isRpcError(error) && isNoDeviceSettings(error))) {
          throw error;
        }
      }
    }
    await setDevice.mutateAsync({
      data: {
        uuid,
        devicefile: disk.devicefile,
        enable: true,
        tempdiff,
        tempmax,
      },
    });
    mark(id, { status: "succeeded" });
    watchedRef.current.add(disk.canonicaldevicefile);
  }

  async function runTests(disk: SmartDevice): Promise<void> {
    for (const step of plan.steps) {
      if (
        step.kind !== "test" ||
        step.disk.canonicaldevicefile !== disk.canonicaldevicefile
      ) {
        continue;
      }
      if (stepsRef.current[step.id]?.status === "succeeded") {
        continue;
      }
      mark(step.id, { status: "running" });
      try {
        await setTest.mutateAsync({
          data: {
            uuid: NEW_OBJECT_UUID,
            enable: true,
            devicefile: disk.devicefile,
            comment: "",
            ...scheduleOf(step.test, choices),
          },
        });
        mark(step.id, { status: "succeeded" });
      } catch (error) {
        mark(step.id, { status: "failed", detail: messageOf(error) });
        throw error;
      }
    }
  }

  /** A disk's watch step, when the plan watches it and it is not watched yet. A failure is recorded. */
  async function watchDisk(disk: SmartDevice): Promise<void> {
    if (
      !plan.watch.includes(disk) ||
      watchedRef.current.has(disk.canonicaldevicefile)
    ) {
      return;
    }
    try {
      await runWatch(disk);
      failedRef.current.delete(disk.canonicaldevicefile);
    } catch (error) {
      mark(`watch:${disk.canonicaldevicefile}`, {
        status: "failed",
        detail: messageOf(error),
      });
      failedRef.current.set(disk.canonicaldevicefile, error);
    }
  }

  /** A watched disk's self-tests. A failure is recorded. */
  async function testDisk(disk: SmartDevice): Promise<void> {
    if (!watchedRef.current.has(disk.canonicaldevicefile)) {
      return;
    }
    try {
      await runTests(disk);
      failedRef.current.delete(disk.canonicaldevicefile);
    } catch (error) {
      failedRef.current.set(disk.canonicaldevicefile, error);
    }
  }

  const allDisks = (): SmartDevice[] => {
    const seen = new Map<string, SmartDevice>();
    for (const d of [...plan.watch, ...plan.testDisks]) {
      seen.set(d.canonicaldevicefile, d);
    }
    return [...seen.values()];
  };

  async function runDisks(disks: readonly SmartDevice[]): Promise<void> {
    setPhase({ kind: "running" });
    // The order of the step list (7.5): every watch step, then the self-tests of each watched disk.
    for (const disk of disks) {
      await watchDisk(disk);
    }
    for (const disk of disks) {
      await testDisk(disk);
    }
    const failed = allDisks()
      .filter((d) => failedRef.current.has(d.canonicaldevicefile))
      .map((disk) => ({
        disk,
        error: failedRef.current.get(disk.canonicaldevicefile),
      }));
    if (failed.length > 0) {
      setPhase({ kind: "disksFailed", failed });
      return;
    }
    await toApply(false);
  }

  async function toApply(acceptOthers: boolean): Promise<void> {
    setPhase({ kind: "running" });
    mark("apply", { status: "running" });
    // R10: what is pending now, just before the apply.
    try {
      const info = await queryClient.fetchQuery({
        ...getSystemGetInformationQueryOptions(),
        staleTime: 0,
      });
      const others = pendingModules(info.dirtyModules).filter(
        (m) => m !== SMART_MODULE,
      );
      if (others.length > 0 && !acceptOthers) {
        mark("apply", { status: "waiting" });
        setPhase({ kind: "alsoPending", others });
        return;
      }
    } catch {
      // Not knowing what else is pending is no reason to stop: the apply itself is the decision.
    }
    await runApply();
  }

  async function runApply(): Promise<void> {
    setPhase({ kind: "running" });
    mark("apply", { status: "running" });
    const task = await runTask(t("pending.applyTask"), () =>
      apply.mutateAsync({ data: { modules: [], force: false } }),
    );
    if (task.state !== "done") {
      mark("apply", { status: "failed", detail: messageOf(task.error) });
      setPhase({ kind: "applyFailed", error: task.error });
      return;
    }
    mark("apply", { status: "succeeded" });
    await runVerify();
  }

  async function runVerify(): Promise<void> {
    setPhase({ kind: "running" });
    mark("verify", { status: "running" });
    try {
      const [settings, schedule] = await Promise.all([
        queryClient.fetchQuery({
          ...getSmartGetSettingsQueryOptions(),
          staleTime: 0,
        }),
        queryClient.fetchQuery({
          ...getSmartGetScheduleListQueryOptions(ALL_TESTS),
          staleTime: 0,
        }),
      ]);
      const devices: string[] = [];
      for (const disk of plan.watch) {
        try {
          const saved = await queryClient.fetchQuery({
            ...getSmartGetDeviceSettingsQueryOptions({
              devicefile: disk.devicefile,
            }),
            staleTime: 0,
            retry: false,
          });
          if (!saved.enable) {
            devices.push(disk.canonicaldevicefile);
          }
        } catch {
          devices.push(disk.canonicaldevicefile);
        }
      }
      const tests = plan.steps
        .filter((s) => s.kind === "test")
        .filter(
          (s) =>
            !schedule.data.some(
              (e) =>
                (e.devicefile === s.disk.canonicaldevicefile ||
                  e.devicefile === s.disk.devicefile) &&
                e.type === s.test,
            ),
        )
        .map((s) => s.disk.canonicaldevicefile);
      if (!settings.enable || devices.length > 0 || tests.length > 0) {
        mark("verify", { status: "failed" });
        setPhase({
          kind: "verifyFailed",
          devices,
          global: !settings.enable,
          tests,
        });
        return;
      }
      mark("verify", { status: "succeeded" });
      setPhase({ kind: "done" });
    } catch (error) {
      mark("verify", { status: "failed", detail: messageOf(error) });
      setPhase({ kind: "verifyFailed", devices: [], global: false, tests: [] });
    }
  }

  const guard = (name: string, act: () => Promise<void>) => () => {
    if (busy !== null) {
      return;
    }
    setBusy(name);
    void act().finally(() => setBusy(null));
  };

  return {
    steps,
    phase,
    busy,
    /** The reader confirmed the summary: run from the first step. */
    start: guard("start", async () => {
      setPhase({ kind: "running" });
      for (const disk of plan.testDisks) {
        if (disk.monitor) {
          watchedRef.current.add(disk.canonicaldevicefile);
        }
      }
      if (await runGlobal()) {
        await runDisks(allDisks());
      }
    }),
    retryGlobal: guard("retryGlobal", async () => {
      setPhase({ kind: "running" });
      if (await runGlobal()) {
        await runDisks(allDisks());
      }
    }),
    retryDisks: (disks: readonly SmartDevice[]) =>
      guard("retryDisks", () => runDisks(disks))(),
    continueWithout: guard("continueWithout", () => toApply(false)),
    applyToo: guard("applyToo", () => toApply(true)),
    retryApply: guard("retryApply", runApply),
    checkAgain: guard("checkAgain", runVerify),
    stop: (saved: boolean) => setPhase({ kind: "stopped", saved }),
    undo: guard("undo", async () => {
      const task = await runTask(t("pending.undoTask"), () =>
        revert.mutateAsync({ data: { filename: "" } }),
      );
      // A failed undo leaves the changes pending, with the band's own failure and retry.
      setPhase(
        task.state === "done"
          ? { kind: "undone" }
          : { kind: "stopped", saved: true },
      );
    }),
  };
}
