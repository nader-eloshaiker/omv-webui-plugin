// SPDX-License-Identifier: GPL-3.0-or-later
// One task's output, on the terminal pair (style guide 5.7), opened from the tasks menu or the
// pending band. A failure's message (for a failed apply, the whole Salt log) follows the output, as
// text. An ended task can be dismissed here; that removes it from the tasks menu.
import { taskRegistry, useTask } from "@omv-webui/react-api-omv/tasks";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  StatusPill,
  TaskLog,
} from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import {
  emptyOutputKey,
  TASK_STATUS,
  taskLines,
} from "../../shell/taskView.ts";

const END_KEY = {
  done: "tasks.endDone",
  failed: "tasks.endFailed",
  stopped: "tasks.endStopped",
} as const;

export function TaskOutputDialog({
  id,
  onClose,
}: {
  id: number | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { task } = useTask(id ?? undefined);
  const open = id !== null && task !== undefined;
  const ended = task !== undefined && task.state !== "running";
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(48rem,calc(100vw-2rem))]">
        {task ? (
          <>
            <DialogHeader>
              <DialogTitle>{task.label}</DialogTitle>
            </DialogHeader>
            <TaskLog
              lines={taskLines(task.output, task.error?.message)}
              label={t("tasks.outputLabel", { task: task.label })}
              copyLabel={t("tasks.copy")}
              copiedLabel={t("tasks.copied")}
              selectedLabel={t("tasks.selected")}
              download={{
                label: t("tasks.download"),
                fileName: "task-output.txt",
              }}
              emptyLabel={t(emptyOutputKey(task))}
              endMessage={
                task.state === "running" ? undefined : (
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusPill status={TASK_STATUS[task.state]}>
                      {t(`tasks.${task.state}`)}
                    </StatusPill>
                    {t(END_KEY[task.state])}
                  </span>
                )
              }
            />
            <DialogFooter>
              {ended ? (
                <Button
                  variant="neutral"
                  onClick={() => {
                    taskRegistry.dismiss(task.id);
                    onClose();
                  }}
                >
                  {t("tasks.dismiss")}
                </Button>
              ) : null}
              <DialogClose render={<Button />}>{t("tasks.close")}</DialogClose>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
