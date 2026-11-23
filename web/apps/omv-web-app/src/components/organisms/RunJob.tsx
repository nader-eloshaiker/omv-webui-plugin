// SPDX-License-Identifier: GPL-3.0-or-later
// Running a copy job now (phase 5 services design 7): when it can run, the confirmation by kind
// (trial: plain; copies: plain; also deletes: the destructive form, no typing, 7.2), the task through
// the one registry (the handle stays in the task helper, UI-5), and its output on the terminal pair
// with the newest 10,000 lines on screen, copy, download and Stop with its own confirmation (D10).
//
// Observed on the test VM: a second start while the job runs ends at once with OMV's command and
// nothing after it (7.3's silent failure); after Stop, Exec.stop replies and the next read fails, and
// the task is Cancelled, not Failed (the registry's stop).
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import {
  getRsyncGetListQueryKey,
  getRsyncGetQueryKey,
  useRsyncExecute,
} from "@omv-webui/react-api-omv/generated";
import { taskRegistry, useTask } from "@omv-webui/react-api-omv/tasks";
import {
  Button,
  ConfirmDialog,
  StatusPill,
  TaskLog,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { startTask } from "../../filesystems/fsTasks.ts";
import { isolateName } from "../../format/isolate.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useJobWords } from "../../hooks/useJobWords.ts";
import { useNow } from "../../hooks/useNow.ts";
import type { JobSides, RunBlock } from "../../services/jobModel.ts";
import { recordRun, recordTrial } from "../../services/jobsSession.ts";
import {
  failureOutput,
  lastLines,
  readTrial,
  runLines,
} from "../../services/trialOutput.ts";
import { TASK_STATUS } from "../../shell/taskView.ts";
import { JobSentence, JobSideView } from "../molecules/JobDirection.tsx";

/** What a run needs to know about its job. */
export interface RunTarget {
  uuid: string;
  name: string;
  sides: JobSides;
  trialOnly: boolean;
  deletes: boolean;
  /** What a trial of it is of (jobModel.trialKey), so a trial run here can turn it on later. */
  trialKey: string | null;
}

/** The reason in words, for beside the button or in the menu item. */
export function RunBlockReason({
  block,
  folders,
}: {
  block: RunBlock;
  folders: readonly SharedFolder[] | undefined;
}) {
  const { t } = useTranslation();
  switch (block.kind) {
    case "pending":
      return <>{t("runJob.pending")}</>;
    case "running":
      return <>{t("runJob.running")}</>;
    case "unreachable":
      return (
        <Trans
          i18nKey="runJob.unreachable"
          components={{
            folder: (
              <JobSideView
                side={{ kind: "folder", uuid: block.uuid }}
                folders={folders}
              />
            ),
          }}
        />
      );
  }
}

/** The confirmation of 7.2; on confirm the task starts and the dialog closes. */
export function RunJobConfirm({
  target,
  folders,
  onClose,
  onStarted,
}: {
  target: RunTarget | null;
  folders: readonly SharedFolder[] | undefined;
  onClose: () => void;
  onStarted?: (taskId: number) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const words = useJobWords();
  const execute = useRsyncExecute();
  const kind =
    target === null
      ? "copy"
      : target.trialOnly
        ? "trial"
        : target.deletes
          ? "delete"
          : "copy";
  // Sides in 0.2's words ("{{path}} on {{host}}"), never a stored address with its account name.
  const src =
    target === null
      ? ""
      : isolateName(words.sideText(target.sides.from, folders));
  const dest =
    target === null
      ? ""
      : isolateName(words.sideText(target.sides.to, folders));
  const start = () => {
    if (target === null) {
      return;
    }
    const { uuid, trialKey, trialOnly } = target;
    const task = startTask(
      t("runJob.task.title", { job: isolateName(target.name) }),
      () => execute.mutateAsync({ data: { uuid } }),
    );
    recordRun(uuid, task.id);
    void task.settled.then((done) => {
      // The run changes no configuration; the list and the page read again (7.3).
      void queryClient.invalidateQueries({
        queryKey: getRsyncGetListQueryKey().slice(0, 2),
      });
      void queryClient.invalidateQueries({
        queryKey: getRsyncGetQueryKey({ uuid }),
      });
      if (trialOnly && done.state === "done" && trialKey !== null) {
        recordTrial(uuid, {
          key: trialKey,
          deleteCount: readTrial(runLines(done.output)).deleteCount,
        });
      }
    });
    onClose();
    onStarted?.(task.id);
  };
  const srcNode =
    target === null ? null : (
      <JobSideView side={target.sides.from} folders={folders} />
    );
  const destNode =
    target === null ? null : (
      <JobSideView side={target.sides.to} folders={folders} />
    );
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      variant={kind === "delete" ? "destructive" : "default"}
      title={
        kind === "trial"
          ? t("runJob.trial.title", { job: isolateName(target?.name ?? "") })
          : t(`runJob.${kind}.title`, { src, dest })
      }
      description={
        target === null ? null : kind === "trial" ? (
          t("runJob.trial.body")
        ) : (
          <span className="flex flex-col gap-2">
            <span>
              <JobSentence sides={target.sides} folders={folders} />
            </span>
            <span>
              <Trans
                i18nKey={`runJob.${kind}.body`}
                components={{ src: srcNode ?? <></>, dest: destNode ?? <></> }}
              />
            </span>
          </span>
        )
      }
      confirmLabel={t(`runJob.${kind}.confirm`)}
      cancelLabel={t("runJob.cancel")}
      onConfirm={start}
    />
  );
}

/** The newest lines kept on screen (D10). */
export const SCREEN_LINES = 10_000;

/** A run's task: title, pill, elapsed time, output, Stop, copy and download, and the result (7.3). */
export function JobTask({
  taskId,
  name,
  onRunAgain,
  headingLevel = 3,
  focusOnMount = false,
}: {
  taskId: number;
  name: string;
  onRunAgain?: () => void;
  headingLevel?: 2 | 3;
  focusOnMount?: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { task, stop } = useTask(taskId);
  const running = task?.state === "running";
  const now = useNow(running ? 1000 : null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stopAskedRef = useRef(false);
  useEffect(() => {
    if (focusOnMount) {
      headingRef.current?.focus();
    }
  }, [focusOnMount, taskId]);
  const state = task?.state;
  useEffect(() => {
    if (stopAskedRef.current && state !== "running") {
      stopAskedRef.current = false;
      headingRef.current?.focus();
    }
  }, [state]);
  if (task === undefined) {
    return null;
  }
  const failure =
    task.error === undefined ? null : failureOutput(task.error.message);
  // The output once: OMV's failing poll repeats what was received (runLines).
  const lines = runLines(task.output, task.error?.message);
  const silent =
    task.state === "failed" &&
    lines.length === 0 &&
    failure !== null &&
    failure.exitCode !== null;
  const elapsed = Math.max(
    0,
    Math.floor(((task.endedAt ?? now) - task.startedAt) / 1000),
  );
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const job = isolateName(name);
  let result: ReactNode = null;
  switch (task.state) {
    case "done":
      result = (
        <>
          {t("runJob.done", { job })} {t("runJob.kept")}
        </>
      );
      break;
    case "failed":
      result = silent
        ? t("runJob.failedSilent", { job })
        : t("runJob.failed", { job });
      break;
    case "stopped":
      result = t("runJob.stopped", { job });
      break;
    case "running":
      break;
  }
  const tail = task.state === "failed" && !silent ? lastLines(lines, 5) : [];
  return (
    <section
      className="flex flex-col gap-2"
      aria-labelledby={`job-task-${String(taskId)}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Heading
          ref={headingRef}
          id={`job-task-${String(taskId)}`}
          tabIndex={-1}
          className="text-base font-semibold outline-hidden"
        >
          {t("runJob.task.title", { job })}
        </Heading>
        <StatusPill status={TASK_STATUS[task.state]}>
          {t(`tasks.${task.state}`)}
        </StatusPill>
        <span className="text-sm text-muted-foreground tabular-nums">
          {format.duration(elapsed)}
        </span>
      </div>
      <TaskLog
        lines={lines}
        label={t("runJob.task.outputLabel", { job: name })}
        copyLabel={t("tasks.copy")}
        copiedLabel={t("tasks.copied")}
        selectedLabel={t("tasks.selected")}
        download={{
          label: t("tasks.download"),
          fileName: t("runJob.task.file"),
        }}
        emptyLabel={t(running ? "tasks.waiting" : "tasks.noOutput")}
        cap={{ lines: SCREEN_LINES, label: () => t("runJob.task.cap") }}
        stop={
          running
            ? {
                label: t("runJob.stop"),
                title: t("runJob.stopTitle", { job }),
                description: t("runJob.stopBody"),
                confirmLabel: t("runJob.stopConfirm"),
                cancelLabel: t("runJob.cancel"),
                onStop: () => {
                  // The Stop button goes once the task ends: focus stays on the task (7.3).
                  stopAskedRef.current = true;
                  requestAnimationFrame(() => headingRef.current?.focus());
                  void stop();
                },
              }
            : undefined
        }
        endMessage={
          result === null ? undefined : (
            <span className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <StatusPill status={TASK_STATUS[task.state]}>
                  {t(`tasks.${task.state}`)}
                </StatusPill>
                <span>{result}</span>
              </span>
              {tail.length > 0 ? (
                <span className="font-mono text-sm break-words">
                  {tail.join("\n")}
                </span>
              ) : null}
            </span>
          )
        }
      />
      {task.state !== "running" ? (
        <div className="flex flex-wrap gap-2">
          {task.state === "failed" && onRunAgain !== undefined ? (
            <Button variant="neutral" onClick={onRunAgain}>
              {t("runJob.again")}
            </Button>
          ) : null}
          <Button
            variant="neutral"
            onClick={() => taskRegistry.dismiss(task.id)}
          >
            {t("runJob.dismiss")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
