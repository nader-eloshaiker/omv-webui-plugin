// SPDX-License-Identifier: GPL-3.0-or-later
// A wipe while it runs and after it ends (phase 5 disks design 3.5, 3.6; owner, P7, P8, P9). The task
// is the registry's, so leaving the page does not stop it and coming back shows it again. The elapsed
// time updates each second without being announced; the result is announced and stays until
// dismissed. A secure wipe can be stopped after a plain confirmation; a quick one has no stop. Nothing
// here starts a wipe by itself: "Wipe again…" reopens the whole checked flow (UI-14).
import type { TaskSnapshot } from "@omv-webui/react-api-omv/tasks";
import { useTask } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ConfirmDialog,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  JobFailure,
  JobProgress,
  JobResult,
  StatusPill,
  TaskLog,
} from "@omv-webui/react-ui-components";
import { useState, type RefObject } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { WipeRecord } from "../../disks/diskSession.ts";
import { outputLines, wipePanelView } from "../../disks/wipe.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useNow } from "../../hooks/useNow.ts";
import { emptyOutputKey } from "../../shell/taskView.ts";
import { AddStorageLink } from "../atoms/AddStorageLink.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

function Output({
  task,
  device,
  defaultOpen = false,
}: {
  task: TaskSnapshot;
  device: string;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Disclosure open={open} onOpenChange={setOpen}>
      <DisclosureTrigger>
        {open ? t("wipe.hideOutput") : t("wipe.showOutput")}
      </DisclosureTrigger>
      <DisclosurePanel>
        <TaskLog
          lines={outputLines(task.output)}
          label={t("wipe.outputLabel", { device })}
          copyLabel={t("tasks.copy")}
          copiedLabel={t("tasks.copied")}
          selectedLabel={t("tasks.selected")}
          emptyLabel={t(emptyOutputKey(task))}
        />
      </DisclosurePanel>
    </Disclosure>
  );
}

export function WipePanel({
  record,
  devicefile,
  headingRef,
  onWipeAgain,
  onDismiss,
}: {
  record: WipeRecord;
  /** The disk's stable device file, for "Add storage on this disk"; absent when the disk is gone. */
  devicefile?: string;
  /** The panel's heading, where focus goes when the wipe starts. */
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** Reopen the checked flow from the start (failed or stopped); absent when the disk is gone. */
  onWipeAgain?: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { task, stop } = useTask(record.taskId);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopping, setStopping] = useState(false);
  const running = task?.state === "running";
  const now = useNow(running ? 1000 : null);
  if (task === undefined) {
    return null;
  }
  const device = record.device;
  const view = wipePanelView(task, record.secure);
  const elapsedMs = (task.endedAt ?? now) - task.startedAt;
  const elapsed = t("wipe.runningFor", {
    duration: format.duration(Math.max(0, Math.floor(elapsedMs / 1000))),
  });

  const heading = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-semibold outline-hidden [overflow-wrap:anywhere]"
      >
        <Trans
          i18nKey="wipe.runningTitle"
          components={{ device: <IdentifierText value={device} /> }}
        />
      </h3>
      {view.state === "running" ? (
        <StatusPill status="running">{t("wipe.runningPill")}</StatusPill>
      ) : null}
    </div>
  );

  if (view.state === "running") {
    const progress = view.secure
      ? {
          value: view.percent,
          valueText:
            view.percent === null
              ? t("wipe.working")
              : t("wipe.percentDone", { percent: `${String(view.percent)}%` }),
        }
      : undefined;
    return (
      <div data-slot="wipe-panel" className="flex flex-col gap-3">
        {heading}
        <JobProgress
          label={view.secure ? t("wipe.secureRunning") : t("wipe.quickRunning")}
          elapsed={elapsed}
          progress={progress}
          cancel={
            view.secure
              ? {
                  label: t("wipe.stop"),
                  onCancel: () => setConfirmStop(true),
                  busy: stopping,
                }
              : undefined
          }
        />
        <Output task={task} device={device} />
        <ConfirmDialog
          open={confirmStop}
          onOpenChange={setConfirmStop}
          title={
            <Trans
              i18nKey="wipe.stopTitle"
              components={{ device: <IdentifierText value={device} /> }}
            />
          }
          description={t("wipe.stopBody")}
          cancelLabel={t("wipe.stopKeep")}
          confirmLabel={t("wipe.stop")}
          pending={stopping}
          onConfirm={() => {
            setStopping(true);
            void stop().finally(() => {
              setStopping(false);
              setConfirmStop(false);
            });
          }}
        />
      </div>
    );
  }

  const dismiss = (
    <Button variant="neutral" size="sm" onClick={onDismiss}>
      {t("wipe.dismiss")}
    </Button>
  );

  if (view.state === "failed" && onWipeAgain !== undefined) {
    return (
      <div data-slot="wipe-panel" className="flex flex-col gap-3">
        <JobFailure
          title={t("wipe.failedTitle", { device })}
          message={t("wipe.failedBody")}
          serverMessage={
            isRpcError(task.error)
              ? { label: t("app.serverMessage"), text: task.error.message }
              : undefined
          }
          retryLabel={t("wipe.again")}
          onRetry={onWipeAgain}
        />
        <Output task={task} device={device} defaultOpen />
        <p>{dismiss}</p>
      </div>
    );
  }

  const done = view.state === "done";
  if (view.state === "failed") {
    return (
      <div data-slot="wipe-panel" className="flex flex-col gap-3">
        <JobResult
          result={{
            status: "failed",
            statusLabel: t("wipe.failedPill"),
            message: (
              <span className="flex flex-col gap-1">
                <span className="font-medium">
                  {t("wipe.failedTitle", { device })}
                </span>
                <span>{t("wipe.failedBody")}</span>
              </span>
            ),
          }}
          dismissLabel={t("wipe.dismiss")}
          onDismiss={onDismiss}
        />
        <Output task={task} device={device} defaultOpen />
      </div>
    );
  }
  return (
    <div data-slot="wipe-panel" className="flex flex-col gap-3">
      <JobResult
        result={{
          status: done ? "succeeded" : "cancelled",
          statusLabel: done ? t("wipe.succeeded") : t("wipe.stoppedPill"),
          message: (
            <span className="flex flex-col gap-1">
              <span className="font-medium">
                {done
                  ? t("wipe.doneTitle", { device })
                  : t("wipe.stoppedTitle", { device })}
              </span>
              <span>{done ? t("wipe.doneBody") : t("wipe.stoppedBody")}</span>
              {done && devicefile !== undefined ? (
                <span>
                  <AddStorageLink devicefile={devicefile}>
                    {t("wipe.createFsLink")}
                  </AddStorageLink>
                </span>
              ) : null}
            </span>
          ),
        }}
        dismissLabel={t("wipe.dismiss")}
        onDismiss={onDismiss}
      />
      <Output task={task} device={device} />
      {done || onWipeAgain === undefined ? null : (
        <p>
          <Button variant="neutral" onClick={onWipeAgain}>
            {t("wipe.open")}
          </Button>
        </p>
      )}
    </div>
  );
}
