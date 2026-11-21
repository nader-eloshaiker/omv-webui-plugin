// SPDX-License-Identifier: GPL-3.0-or-later
// How a task from the registry is shown: its state as one of the style guide's task words (5.7), and
// how long it ran.
import type { TaskSnapshot, TaskState } from "@omv-webui/react-api-omv/tasks";
import type { TaskStatus } from "@omv-webui/react-ui-components";

export const TASK_STATUS: Record<TaskState, TaskStatus> = {
  running: "running",
  done: "succeeded",
  failed: "failed",
  stopped: "cancelled",
};

/** Whole minutes and seconds of a duration, never negative. */
export function elapsedParts(ms: number): { minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

/** A task's output as lines for the task log; a failure's message (the server's account) follows. */
export function taskLines(output: string, failure?: string): string[] {
  const text = failure
    ? `${output}${output && !output.endsWith("\n") ? "\n" : ""}${failure}`
    : output;
  if (text === "") {
    return [];
  }
  const lines = text.split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

/**
 * What an empty output block says, by how the task stands. A running task is still waiting for output.
 * A failed task has no output to show because OMV stops answering with output once the task has failed
 * (Exec.getOutput itself fails, with the task's error): its output could not be read, which is not the
 * same as there being none. A task whose start call failed never ran. Only a task that ended without
 * failing (finished, or cancelled here) can be said to have written nothing.
 */
export function emptyOutputKey(
  task: Pick<TaskSnapshot, "state" | "error">,
):
  | "tasks.waiting"
  | "tasks.noOutput"
  | "tasks.outputUnread"
  | "tasks.notStarted" {
  switch (task.state) {
    case "running":
      return "tasks.waiting";
    case "failed":
      return task.error !== undefined &&
        task.error.operationId !== "execGetOutput"
        ? "tasks.notStarted"
        : "tasks.outputUnread";
    default:
      return "tasks.noOutput";
  }
}
