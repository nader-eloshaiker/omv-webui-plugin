// SPDX-License-Identifier: GPL-3.0-or-later
// "Run now" for a scheduled self-test (phase 5 disks design 6.6, D15). Starting a test wakes the disk
// and, for a long one, keeps it busy for hours, so it asks first (a plain confirmation: nothing is
// lost), and only then calls Smart.executeScheduledTest, a task followed by the one registry. The
// server counts only a wrong command as a failure, so the result reads the task's output to say
// whether the disk started the test. Each result stays until dismissed; the handle never leaves the
// task helper (UI-5): the session keeps only the registry's id (diskSession.ts).
import type { SmartScheduleEntry } from "@omv-webui/react-api-omv/generated";
import { useSmartExecuteScheduledTest } from "@omv-webui/react-api-omv/generated";
import { taskRegistry, useTask } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ConfirmDialog,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  InlineAlert,
  ServerMessage,
  TaskLog,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  diskSession,
  forgetTestStart,
  recordTestStart,
  type TestStart,
} from "../../disks/diskSession.ts";
import { isDiskName, testBegan } from "../../disks/diskWords.ts";
import { useScheduleText } from "../../hooks/useSmartWords.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

export interface RunTarget {
  entry: SmartScheduleEntry;
  /** The disk's kernel name, for "Open the disk", when it passes the address pattern. */
  devicename: string | null;
}

/** The confirmation; on "Start the test" the task starts and the dialog closes. */
export function SelfTestRunConfirm({
  target,
  onClose,
}: {
  target: RunTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const words = useScheduleText();
  const execute = useSmartExecuteScheduledTest();
  const entry = target?.entry;
  const device = entry?.devicefile ?? "";
  const start = () => {
    if (target === null || entry === undefined) {
      return;
    }
    const { uuid, type } = entry;
    const taskId = taskRegistry.start(
      t("smart.tests.runTaskLabel", { device }),
      () => execute.mutateAsync({ data: { uuid } }),
    );
    recordTestStart({
      taskId,
      device,
      type,
      devicename:
        target.devicename !== null && isDiskName(target.devicename)
          ? target.devicename
          : null,
    });
    onClose();
  };
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={
        <Trans
          i18nKey="smart.tests.runTitle"
          values={{ test: words.typeLower(entry?.type ?? "S") }}
          components={{ device: <IdentifierText value={device} /> }}
        />
      }
      description={
        entry?.type === "L"
          ? t("smart.tests.runBodyLong")
          : t("smart.tests.runBodyShort")
      }
      cancelLabel={t("smart.tests.dialog.cancel")}
      confirmLabel={t("smart.tests.runConfirm")}
      onConfirm={start}
    />
  );
}

/** The results of the tests started from "Run now" in this session, for the devices given (or all). */
export function SelfTestResults({
  devices,
}: {
  /** Only the tests started on these canonical device files; every one when absent. */
  devices?: ReadonlySet<string>;
}) {
  const { testStarts } = useMemoryStore(diskSession);
  const shown = testStarts.filter(
    (s) => devices === undefined || devices.has(s.device),
  );
  if (shown.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3">
      {shown.map((start) => (
        <SelfTestResult key={start.taskId} start={start} />
      ))}
    </div>
  );
}

function SelfTestResult({ start }: { start: TestStart }) {
  const { t } = useTranslation();
  const words = useScheduleText();
  const { task } = useTask(start.taskId);
  const [showOutput, setShowOutput] = useState<boolean | null>(null);
  if (task === undefined) {
    return null;
  }
  const dismiss = () => {
    taskRegistry.dismiss(start.taskId);
    forgetTestStart(start.taskId);
  };
  if (task.state === "running") {
    return (
      <p role="status" className="text-sm">
        {t("smart.tests.runStarting", { device: start.device })}
      </p>
    );
  }
  const began = task.state === "done" && testBegan(task.output);
  const unclear = task.state === "done" && !began;
  const output =
    task.output.trim() === "" ? null : (
      <Disclosure
        open={showOutput ?? unclear}
        onOpenChange={(open) => setShowOutput(open)}
      >
        <DisclosureTrigger variant="inline">
          {(showOutput ?? unclear)
            ? t("smart.tests.hideOutput")
            : t("smart.tests.showOutput")}
        </DisclosureTrigger>
        <DisclosurePanel>
          <TaskLog
            lines={task.output.replace(/\n$/, "").split("\n")}
            label={t("smart.tests.showOutput")}
            copyLabel={t("common.copy")}
            copiedLabel={t("common.copied")}
            selectedLabel={t("common.copySelected")}
            follow={false}
          />
        </DisclosurePanel>
      </Disclosure>
    );
  const dismissButton = (
    <div>
      <Button variant="neutral" size="sm" onClick={dismiss}>
        {t("smart.tests.dismiss")}
      </Button>
    </div>
  );
  if (task.state === "failed" || task.state === "stopped") {
    return (
      <InlineAlert
        tone="critical"
        role="alert"
        title={t("smart.tests.runFailed", { device: start.device })}
      >
        <div className="flex flex-col gap-2">
          {isRpcError(task.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {task.error.message}
            </ServerMessage>
          ) : null}
          {output}
          {dismissButton}
        </div>
      </InlineAlert>
    );
  }
  return (
    <InlineAlert tone="neutral" role="status">
      <div className="flex flex-col gap-2">
        <p>
          {began
            ? t("smart.tests.runStarted", {
                device: start.device,
                test: words.typeLower(start.type),
                duration:
                  start.type === "L"
                    ? t("smart.tests.durationLong")
                    : t("smart.tests.durationShort"),
              })
            : t("smart.tests.runUnclear", { device: start.device })}
        </p>
        {began && start.devicename !== null ? (
          <p>
            <Link
              to="/storage/disks/$disk"
              params={{ disk: start.devicename }}
              className={routerLinkClass}
            >
              {t("smart.tests.openDisk")}
            </Link>
          </p>
        ) : null}
        {output}
        {dismissButton}
      </div>
    </InlineAlert>
  );
}
