// SPDX-License-Identifier: GPL-3.0-or-later
// The tasks menu in the top bar (style guide 5.7): every task of this page session, running or
// ended, from the one task registry. A running task stays reachable here from any page; an ended one
// stays until it is dismissed.
import { taskRegistry, useTasks } from "@omv-webui/react-api-omv/tasks";
import {
  IconButton,
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  TaskRow,
} from "@omv-webui/react-ui-components";
import { ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNow } from "../../hooks/useNow.ts";
import { useShowTask } from "../../shell/taskDialog.ts";
import { elapsedParts, TASK_STATUS } from "../../shell/taskView.ts";

export function TasksMenu() {
  const { t } = useTranslation();
  const tasks = useTasks();
  const showTask = useShowTask();
  const running = tasks.filter((task) => task.state === "running").length;
  const ended = tasks.length - running;
  const now = useNow(running > 0 ? 1000 : null);

  const label =
    running > 0
      ? t("tasks.menuRunning", { count: running })
      : ended > 0
        ? t("tasks.menuEnded", { count: ended })
        : t("tasks.menu");

  const elapsed = (startedAt: number, endedAt?: number) => {
    const { minutes, seconds } = elapsedParts((endedAt ?? now) - startedAt);
    return minutes > 0
      ? t("tasks.elapsedMinutes", { minutes, seconds })
      : t("tasks.elapsedSeconds", { seconds });
  };

  return (
    <Menu>
      <MenuTrigger
        render={
          <IconButton label={label} icon={<ListChecks />} variant="quiet" />
        }
      />
      <MenuContent align="end" className="w-[min(24rem,calc(100vw-1rem))]">
        <MenuGroup>
          <MenuGroupLabel>{t("tasks.menu")}</MenuGroupLabel>
          {tasks.length === 0 ? (
            <MenuItem disabled>{t("tasks.none")}</MenuItem>
          ) : (
            [...tasks].reverse().map((task) => (
              <MenuItem key={task.id} onClick={() => showTask(task.id)}>
                <TaskRow
                  className="w-full"
                  title={task.label}
                  status={TASK_STATUS[task.state]}
                  statusLabel={t(`tasks.${task.state}`)}
                  elapsed={elapsed(task.startedAt, task.endedAt)}
                />
              </MenuItem>
            ))
          )}
        </MenuGroup>
        {ended > 0 ? (
          <>
            <MenuSeparator />
            <MenuItem
              onClick={() => {
                for (const task of tasks) {
                  taskRegistry.dismiss(task.id);
                }
              }}
            >
              {t("tasks.clearEnded")}
            </MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
