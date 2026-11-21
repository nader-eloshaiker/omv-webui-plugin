// SPDX-License-Identifier: GPL-3.0-or-later
// The session's disk-health check (phase 5 design 1.3.6). Disk health is read only when the reader
// presses "Check disk health": Smart.getListBg runs smartctl on every disk and can wake sleeping ones
// (owner). The check runs as a task through the one registry, so it keeps going when the reader leaves
// the dashboard; its result is kept here, in memory, with the time it was read, and feeds the card and
// the attention list. The handle never leaves the task helper (UI-5): only the registry's id is kept.
// A reload or a new sign-in forgets it (UI-13).
import type { SmartDeviceList } from "@omv-webui/react-api-omv/generated";
import {
  taskRegistry,
  type TaskRegistry,
} from "@omv-webui/react-api-omv/tasks";
import type { RpcError } from "@omv-webui/react-api-omv/transport";
import { createMemoryStore } from "../shell/memoryStore.ts";

export interface DiskHealthState {
  /** The registry's id of the check running now, if one is. */
  runningId: number | undefined;
  /** The last successful check: its disks and when it ended (this computer's clock). */
  result: { list: SmartDeviceList; readAt: number } | undefined;
  /** Why the last check failed, when it did; a previous result stays. */
  error: RpcError | undefined;
  /** Whether the last check failed, including a reply that could not be read. */
  failed: boolean;
}

const INITIAL: DiskHealthState = {
  runningId: undefined,
  result: undefined,
  error: undefined,
  failed: false,
};

export const diskHealth = createMemoryStore<DiskHealthState>(INITIAL);

/**
 * Start a check, unless one is running. `begin` makes the task-starting call (the generated
 * Smart.getListBg mutation) and resolves to its handle.
 */
export function startDiskCheck(
  label: string,
  begin: () => Promise<string>,
  registry: TaskRegistry = taskRegistry,
): void {
  if (diskHealth.getState().runningId !== undefined) {
    return;
  }
  const id = registry.start(label, begin);
  diskHealth.set({ runningId: id });
  const off = registry.onSettled((task) => {
    if (task.id !== id) {
      return;
    }
    off();
    if (diskHealth.getState().runningId !== id) {
      // The session ended meanwhile and the store was emptied.
      return;
    }
    const list = task.result as SmartDeviceList | undefined;
    if (
      task.state === "done" &&
      list !== undefined &&
      Array.isArray(list.data)
    ) {
      diskHealth.set({
        runningId: undefined,
        result: { list, readAt: task.endedAt ?? Date.now() },
        error: undefined,
        failed: false,
      });
    } else if (task.state === "stopped") {
      diskHealth.set({ runningId: undefined });
    } else {
      diskHealth.set({ runningId: undefined, error: task.error, failed: true });
    }
  });
}
