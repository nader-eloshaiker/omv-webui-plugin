// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";
import { StatusLabel } from "../status/status";
import type { TaskStatus } from "../status/status-kinds";

interface TaskRowProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** What the task does: "Install updates". */
  title: React.ReactNode;
  status: TaskStatus;
  /** The state's word: Running, Succeeded, ... */
  statusLabel: string;
  /** How long it has run or ran, formatted by the caller: "2 min 15 s". */
  elapsed?: React.ReactNode;
  /** A control that opens the task's output. Name it in full: "Show Install updates". */
  action?: React.ReactNode;
}

/**
 * One task in the top bar's tasks menu or a task list (5.7): its state as a status label, its title, how long
 * it has run. A running task stays reachable from here after leaving its page.
 */
function TaskRow({
  title,
  status,
  statusLabel,
  elapsed,
  action,
  className,
  ...props
}: TaskRowProps) {
  return (
    <div
      data-slot="task-row"
      data-status={status}
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}
      {...props}
    >
      <StatusLabel status={status}>{statusLabel}</StatusLabel>
      <span className="min-w-0 flex-1 text-base text-foreground [overflow-wrap:anywhere]">
        {title}
      </span>
      {elapsed ? (
        <span className="text-sm text-muted-foreground tabular-nums">
          {elapsed}
        </span>
      ) : null}
      {action}
    </div>
  );
}

export { TaskRow };
export type { TaskRowProps };
