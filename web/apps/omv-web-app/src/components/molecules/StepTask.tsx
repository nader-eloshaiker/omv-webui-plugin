// SPDX-License-Identifier: GPL-3.0-or-later
// A task step's running time (not announced) and its output on the terminal pair, behind a disclosure
// that opens by itself when the step failed (UX audit R5). Flow A and the RAID flows use it. The task is
// the registry's, by its id: the handle stays in the task helper (UI-5).
import { useTask } from "@omv-webui/react-api-omv/tasks";
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  TaskLog,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { taskLines } from "../../filesystems/terminal.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useNow } from "../../hooks/useNow.ts";
import { emptyOutputKey } from "../../shell/taskView.ts";

/** A task step's time and output: "Running for 12 s", then its output behind a disclosure. */
export function StepTask({
  taskId,
  label,
  failed,
}: {
  taskId: number;
  label: string;
  failed: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { task } = useTask(taskId);
  const running = task?.state === "running";
  const now = useNow(running ? 1000 : null);
  const [open, setOpen] = useState(failed);
  if (task === undefined) {
    return null;
  }
  const elapsed = Math.max(
    0,
    Math.floor(((task.endedAt ?? now) - task.startedAt) / 1000),
  );
  return (
    <div className="flex flex-col gap-1">
      {running ? (
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("addStorage.runningFor", { duration: format.duration(elapsed) })}
        </span>
      ) : null}
      <Disclosure open={open || failed} onOpenChange={setOpen}>
        <DisclosureTrigger>
          {open || failed
            ? t("addStorage.hideOutput")
            : t("addStorage.showOutput")}
        </DisclosureTrigger>
        <DisclosurePanel>
          <TaskLog
            lines={taskLines(task.output)}
            label={t("addStorage.outputLabel", { step: label })}
            copyLabel={t("tasks.copy")}
            copiedLabel={t("tasks.copied")}
            selectedLabel={t("tasks.selected")}
            emptyLabel={t(emptyOutputKey(task))}
          />
        </DisclosurePanel>
      </Disclosure>
    </div>
  );
}
