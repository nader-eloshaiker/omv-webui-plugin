// SPDX-License-Identifier: GPL-3.0-or-later
// Starting a task in the one registry and waiting for it to end, for the file-system runs. The handle
// stays inside the task helper (UI-5); a run keeps only the registry's id, which the step list uses to
// show the task's output and how long it has run.
import {
  taskRegistry,
  type TaskRegistry,
  type TaskSnapshot,
} from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";

export interface StartedTask {
  id: number;
  /** Resolves with the task's last snapshot when it ends, whatever the outcome. */
  settled: Promise<TaskSnapshot>;
}

export function startTask(
  label: string,
  begin: () => Promise<string>,
  registry: TaskRegistry = taskRegistry,
): StartedTask {
  const id = registry.start(label, begin);
  const settled = new Promise<TaskSnapshot>((resolve) => {
    const now = registry.get(id);
    if (now !== undefined && now.state !== "running") {
      resolve(now);
      return;
    }
    const off = registry.onSettled((task) => {
      if (task.id === id) {
        off();
        resolve(task);
      }
    });
  });
  return { id, settled };
}

/** The server's message of an error, as text (UI-9); undefined for anything else. */
export const messageOf = (error: unknown): string | undefined =>
  isRpcError(error) ? error.message : undefined;

/** A request cut before its reply (no reply, or a gateway gave up): the outcome is unknown (4.3). */
export const isCut = (error: unknown): boolean =>
  isRpcError(error) &&
  (error.kind === "network" || error.status === 502 || error.status === 504);

/** umount's refusal while something has files open (observed: exit code 32, "target is busy"). */
export const isBusyUnmount = (error: unknown): boolean =>
  isRpcError(error) &&
  (/target is busy/i.test(error.message) ||
    /exit code '32'/.test(error.message));
