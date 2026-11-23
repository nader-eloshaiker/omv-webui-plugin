// SPDX-License-Identifier: GPL-3.0-or-later
// "Empty the recycle bin…" on a shared folder's page (phase 5 services design 11.4; UI-8 `data`; P14):
// unavailable with its reason while `samba` is pending, while the bin this session saved is not
// applied, while Windows and Mac sharing is off, or while an emptying of it runs here. Every file in
// the bin is deleted for good, so the confirmation is the typed one, with the folder's name. Then
// SMB.emptyRecycleBin (the SMB share's UUID) as a task through the task helper: its output on the
// terminal pair, Stop behind a plain confirmation, and the result, which reads the output to tell
// "emptied" from "nothing was deleted" (observed: an empty bin prints only the script's own line).
// The handle never leaves the task helper (UI-5); only the registry's id is kept (recycleRuns.ts).
import { useSmbEmptyRecycleBin } from "@omv-webui/react-api-omv/generated";
import { taskRegistry, useTask } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  InlineAlert,
  ServerMessage,
  StatusPill,
  TaskLog,
  TypeToConfirmDialog,
} from "@omv-webui/react-ui-components";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { isolateName } from "../../format/isolate.ts";
import {
  forgetRecycleRun,
  recordRecycleRun,
  recycleRuns,
  type RecycleRun,
} from "../../sharedFolders/recycleRuns.ts";
import {
  emptyBlocker,
  recycleRemovedSomething,
} from "../../sharedFolders/smbModel.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";

export function RecycleBinEmpty({
  shareUuid,
  folder,
  pending,
  smbOn,
  savedHere,
}: {
  /** The SMB share's UUID: the method's parameter. */
  shareUuid: string;
  folder: string;
  /** The pending modules; undefined while not read. */
  pending: readonly string[] | undefined;
  smbOn: boolean | undefined;
  /** This session saved the folder's sharing and it is not applied yet. */
  savedHere: boolean;
}) {
  const { t } = useTranslation();
  const reasonId = useId();
  const execute = useSmbEmptyRecycleBin();
  const { runs } = useMemoryStore(recycleRuns);
  const run = runs[shareUuid];
  const { task } = useTask(run?.taskId);
  const [confirming, setConfirming] = useState(false);
  // After "Empty recycle bin", focus goes to the task's heading (as 7.3), not back to the button the
  // closing confirmation returns it to.
  const toRunRef = useRef(false);
  const runHeadingRef = useRef<HTMLHeadingElement>(null);
  const running = task?.state === "running";
  const taskId = run?.taskId;
  // Where the closing dialog gives focus to nothing, the heading takes it all the same.
  useEffect(() => {
    if (taskId === undefined || !toRunRef.current) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (toRunRef.current && (active === null || active === document.body)) {
        toRunRef.current = false;
        runHeadingRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [taskId]);
  const blocker = emptyBlocker({ pending, smbOn, savedHere, running });

  const start = () => {
    if (blocker !== null) {
      return;
    }
    if (run !== undefined) {
      taskRegistry.dismiss(run.taskId);
    }
    const taskId = taskRegistry.start(
      t("folderSmb.empty.task", { folder: isolateName(folder) }),
      () => execute.mutateAsync({ data: { uuid: shareUuid } }),
    );
    recordRecycleRun(shareUuid, { taskId, folder });
    toRunRef.current = true;
    setConfirming(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-start gap-1">
        <Button
          variant="neutral"
          disabled={blocker !== null}
          focusableWhenDisabled
          aria-describedby={blocker === null ? undefined : reasonId}
          onFocus={() => {
            if (toRunRef.current && runHeadingRef.current !== null) {
              toRunRef.current = false;
              runHeadingRef.current.focus();
            }
          }}
          onClick={() => {
            if (blocker === null) {
              setConfirming(true);
            }
          }}
        >
          {t("folderSmb.empty.label")}
        </Button>
        {blocker === null ? null : (
          <p id={reasonId} className="text-sm">
            {t(`folderSmb.empty.${blocker}`)}
          </p>
        )}
      </div>
      <TypeToConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("folderSmb.empty.title", { folder: isolateName(folder) })}
        description={t("folderSmb.empty.body")}
        confirmText={folder}
        prompt={t("folderSmb.empty.type", { folder })}
        cancelLabel={t("folderSmb.empty.cancel")}
        confirmLabel={t("folderSmb.empty.confirm")}
        onConfirm={start}
      />
      {run !== undefined && task !== undefined ? (
        <EmptyRun
          run={run}
          task={task}
          headingRef={runHeadingRef}
          onDismiss={() => {
            taskRegistry.dismiss(run.taskId);
            forgetRecycleRun(shareUuid);
          }}
        />
      ) : null}
    </div>
  );
}

function EmptyRun({
  run,
  task,
  headingRef,
  onDismiss,
}: {
  run: RecycleRun;
  task: NonNullable<ReturnType<typeof useTask>["task"]>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const { stop } = useTask(run.taskId);
  const [stopping, setStopping] = useState(false);
  const folder = isolateName(run.folder);
  const lines =
    task.output === "" ? [] : task.output.replace(/\n$/u, "").split("\n");
  let end = null;
  if (task.state === "done") {
    end = (
      <span className="flex flex-wrap items-center gap-2">
        <StatusPill status="succeeded">
          {t("addStorage.state.succeeded")}
        </StatusPill>
        <span>
          {recycleRemovedSomething(task.output)
            ? t("folderSmb.empty.done", { folder })
            : t("folderSmb.empty.nothing")}
        </span>
      </span>
    );
  } else if (task.state === "stopped") {
    end = (
      <span className="flex flex-wrap items-center gap-2">
        <StatusPill status="cancelled">
          {t("addStorage.state.cancelled")}
        </StatusPill>
        <span>{t("folderSmb.empty.stopped", { folder })}</span>
      </span>
    );
  } else if (task.state === "failed") {
    end = (
      <span className="flex flex-wrap items-center gap-2">
        <StatusPill status="failed">{t("addStorage.state.failed")}</StatusPill>
        <span>{t("folderSmb.empty.failed", { folder })}</span>
      </span>
    );
  }
  return (
    <section
      aria-label={t("folderSmb.empty.task", { folder })}
      className="flex flex-col gap-2"
    >
      <h4
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-semibold outline-hidden"
      >
        {t("folderSmb.empty.task", { folder })}
      </h4>
      <TaskLog
        lines={lines}
        label={t("folderSmb.empty.output", { folder })}
        copyLabel={t("common.copy")}
        copiedLabel={t("common.copied")}
        selectedLabel={t("common.copySelected")}
        emptyLabel={t("folderSmb.empty.waiting")}
        endMessage={end}
        stop={
          task.state === "running"
            ? {
                label: t("folderSmb.empty.stop"),
                title: t("folderSmb.empty.stopTitle", { folder }),
                description: t("folderSmb.empty.stopBody"),
                confirmLabel: t("folderSmb.empty.stopConfirm"),
                cancelLabel: t("folderSmb.empty.stopCancel"),
                pending: stopping,
                onStop: () => {
                  setStopping(true);
                  void stop().finally(() => setStopping(false));
                },
              }
            : undefined
        }
      />
      {task.state === "failed" && isRpcError(task.error) ? (
        <InlineAlert tone="critical" role="alert">
          <ServerMessage label={t("app.serverMessage")}>
            {task.error.message}
          </ServerMessage>
        </InlineAlert>
      ) : null}
      {task.state === "running" ? null : (
        <div>
          <Button variant="neutral" size="sm" onClick={onDismiss}>
            {t("folderSmb.empty.dismiss")}
          </Button>
        </div>
      )}
    </section>
  );
}
