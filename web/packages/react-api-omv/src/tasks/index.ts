// SPDX-License-Identifier: GPL-3.0-or-later
// The task helper's React surface. Pages start and follow tasks here; they never call Exec.
import { useCallback, useSyncExternalStore } from "react";
import {
  taskRegistry,
  type TaskRegistry,
  type TaskSnapshot,
} from "./registry.ts";

export {
  createTaskRegistry,
  taskRegistry,
  type TaskRegistry,
  type TaskSnapshot,
  type TaskState,
} from "./registry.ts";

/** Every task this page session is following, oldest first. */
export function useTasks(
  registry: TaskRegistry = taskRegistry,
): readonly TaskSnapshot[] {
  return useSyncExternalStore(registry.subscribe, registry.list, registry.list);
}

/** One task, and a way to stop it. */
export function useTask(
  id: number | undefined,
  registry: TaskRegistry = taskRegistry,
) {
  const get = useCallback(
    () => (id === undefined ? undefined : registry.get(id)),
    [id, registry],
  );
  const task = useSyncExternalStore(registry.subscribe, get, get);
  const stop = useCallback(
    () => (id === undefined ? Promise.resolve() : registry.stop(id)),
    [id, registry],
  );
  return { task, stop };
}
