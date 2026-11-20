// SPDX-License-Identifier: GPL-3.0-or-later
// When a task ends, its result is announced politely (style guide 5.7). The record stays in the tasks
// menu until it is dismissed; this region only speaks.
import { taskRegistry } from "@omv-webui/react-api-omv/tasks";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function TaskAnnouncer() {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  useEffect(
    () =>
      taskRegistry.onSettled((task) => {
        setMessage(
          t("tasks.announce", {
            task: task.label,
            state: t(`tasks.${task.state}`),
          }),
        );
      }),
    [t],
  );
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
