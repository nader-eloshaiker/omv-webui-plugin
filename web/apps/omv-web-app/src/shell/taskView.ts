// SPDX-License-Identifier: GPL-3.0-or-later
// How a task from the registry is shown: its state as one of the style guide's task words (5.7), and
// how long it ran.
import type { TaskState } from "@omv-webui/react-api-omv/tasks";
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
